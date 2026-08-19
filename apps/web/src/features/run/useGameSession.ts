import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_PROFILE,
  RunPhase,
  createRun,
  hydrateRunState,
  type ProfileState,
  type RunState,
} from '@isaac-spire/game';
import { errorText } from '../../localize';
import { clearLocalRun, readLocalRun, writeLocalRun } from './localRunRepository';
import { loadLatestActiveRun, loadProfile, saveRun } from './runApi';
import { SaveStatus } from './save-status';

export type RunCommand = (state: RunState) => RunState;

export function useGameSession() {
  const { t, i18n } = useTranslation();
  const [run, setRun] = useState<RunState | null>(null);
  const [profile, setProfile] = useState<ProfileState>(DEFAULT_PROFILE);
  const [remoteRun, setRemoteRun] = useState<RunState | null>(null);
  const [localRun, setLocalRun] = useState<RunState | null>(() => readLocalRun());
  const [notice, setNotice] = useState('');
  const [saveStatus, setSaveStatus] = useState(SaveStatus.Idle);
  const saveTimer = useRef<number | undefined>(undefined);
  const saveQueue = useRef<Promise<boolean>>(Promise.resolve(true));
  const saveRequest = useRef(0);
  const runRef = useRef<RunState | null>(null);

  useEffect(() => {
    runRef.current = run;
  }, [run]);

  useEffect(() => {
    document.title = t('brand.pageTitle');
  }, [i18n.resolvedLanguage, t]);

  const refreshSessionIndex = useCallback(() => {
    void Promise.all([loadProfile(), loadLatestActiveRun()]).then(([nextProfile, nextRun]) => {
      setProfile(nextProfile);
      setRemoteRun(nextRun);
    });
  }, []);

  useEffect(refreshSessionIndex, [refreshSessionIndex]);

  const queueRemoteSave = useCallback(
    (snapshot: RunState, create = false, localSaved = true): Promise<boolean> => {
      const request = ++saveRequest.current;
      setSaveStatus(SaveStatus.Saving);
      const queued = saveQueue.current.then(() => saveRun(snapshot, create));
      saveQueue.current = queued;
      void queued.then((synced) => {
        if (synced) setRemoteRun(snapshot);
        if (request === saveRequest.current) {
          setSaveStatus(synced ? SaveStatus.Saved : localSaved ? SaveStatus.LocalOnly : SaveStatus.Failed);
        }
      });
      return queued;
    },
    [],
  );

  useEffect(() => {
    if (!run) return;
    const localSaved = writeLocalRun(run);
    setLocalRun(run);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void queueRemoteSave(run, false, localSaved), 350);
    return () => window.clearTimeout(saveTimer.current);
  }, [queueRemoteSave, run]);

  useEffect(() => {
    const preserveCurrentSnapshot = () => {
      const snapshot = runRef.current;
      if (snapshot && ![RunPhase.Victory, RunPhase.Defeat].includes(snapshot.phase)) {
        writeLocalRun(snapshot);
      }
    };
    window.addEventListener('pagehide', preserveCurrentSnapshot);
    return () => window.removeEventListener('pagehide', preserveCurrentSnapshot);
  }, []);

  const commit = useCallback(
    (command: RunCommand) => {
      setRun((current) => {
        if (!current) return current;
        try {
          const next = command(current);
          setNotice('');
          return next;
        } catch (error) {
          setNotice(errorText(t, error instanceof Error ? error.message : 'That action is unavailable'));
          return current;
        }
      });
    },
    [t],
  );

  const start = useCallback(
    (seed: string) => {
      const next = createRun(seed, profile);
      setRun(next);
      setNotice('');
      const localSaved = writeLocalRun(next);
      setLocalRun(next);
      void queueRemoteSave(next, true, localSaved);
    },
    [profile, queueRemoteSave],
  );

  const resume = useCallback((snapshot: RunState) => {
    setRun(hydrateRunState(snapshot));
    setNotice('');
    setSaveStatus(SaveStatus.Saved);
  }, []);

  const saveNow = useCallback(() => {
    const snapshot = runRef.current;
    if (!snapshot || [RunPhase.Victory, RunPhase.Defeat].includes(snapshot.phase)) return;
    window.clearTimeout(saveTimer.current);
    const localSaved = writeLocalRun(snapshot);
    setLocalRun(snapshot);
    void queueRemoteSave(snapshot, false, localSaved);
  }, [queueRemoteSave]);

  const saveAndGoHome = useCallback(() => {
    const snapshot = runRef.current;
    if (!snapshot) return;
    window.clearTimeout(saveTimer.current);
    if ([RunPhase.Victory, RunPhase.Defeat].includes(snapshot.phase)) {
      clearLocalRun();
      setLocalRun(null);
    } else {
      const localSaved = writeLocalRun(snapshot);
      setLocalRun(snapshot);
      void queueRemoteSave(snapshot, false, localSaved).then(refreshSessionIndex);
    }
    setRun(null);
    setNotice('');
  }, [queueRemoteSave, refreshSessionIndex]);

  const goHome = useCallback(() => {
    if (run && [RunPhase.Victory, RunPhase.Defeat].includes(run.phase)) clearLocalRun();
    setRun(null);
    setLocalRun(readLocalRun());
    setSaveStatus(SaveStatus.Idle);
    refreshSessionIndex();
  }, [refreshSessionIndex, run]);

  return {
    run,
    profile,
    localRun,
    remoteRun,
    notice,
    saveStatus,
    commit,
    start,
    resume,
    saveNow,
    saveAndGoHome,
    goHome,
    dismissNotice: () => setNotice(''),
  };
}
