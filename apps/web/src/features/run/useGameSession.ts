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

export type RunCommand = (state: RunState) => RunState;

export function useGameSession() {
  const { t, i18n } = useTranslation();
  const [run, setRun] = useState<RunState | null>(null);
  const [profile, setProfile] = useState<ProfileState>(DEFAULT_PROFILE);
  const [remoteRun, setRemoteRun] = useState<RunState | null>(null);
  const [localRun, setLocalRun] = useState<RunState | null>(() => readLocalRun());
  const [notice, setNotice] = useState('');
  const saveTimer = useRef<number | undefined>(undefined);

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

  useEffect(() => {
    if (!run) return;
    writeLocalRun(run);
    setLocalRun(run);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void saveRun(run), 350);
    return () => window.clearTimeout(saveTimer.current);
  }, [run]);

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
      void saveRun(next, true);
    },
    [profile],
  );

  const resume = useCallback((snapshot: RunState) => {
    setRun(hydrateRunState(snapshot));
    setNotice('');
  }, []);

  const goHome = useCallback(() => {
    if (run && [RunPhase.Victory, RunPhase.Defeat].includes(run.phase)) clearLocalRun();
    setRun(null);
    setLocalRun(readLocalRun());
    refreshSessionIndex();
  }, [refreshSessionIndex, run]);

  return {
    run,
    profile,
    localRun,
    remoteRun,
    notice,
    commit,
    start,
    resume,
    goHome,
    dismissNotice: () => setNotice(''),
  };
}
