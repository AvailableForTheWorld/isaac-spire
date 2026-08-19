import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_PROFILE,
  createRun,
  hydrateRunState,
  type ProfileState,
  type RunState,
} from '@isaac-spire/game';
import { errorText } from '../../localize';
import { combatAnimationDuration } from '../combat/animationTiming';
import { clearLocalRun, readLocalRun, writeLocalRun } from './localRunRepository';
import { loadLatestActiveRun, loadProfile, saveRun } from './runApi';

export type RunCommand = (state: RunState) => RunState;

interface CombatClearTransition {
  id: string;
  delayMs: number;
}

export function useGameSession() {
  const { t, i18n } = useTranslation();
  const [run, setRun] = useState<RunState | null>(null);
  const [profile, setProfile] = useState<ProfileState>(DEFAULT_PROFILE);
  const [remoteRun, setRemoteRun] = useState<RunState | null>(null);
  const [localRun, setLocalRun] = useState<RunState | null>(() => readLocalRun());
  const [notice, setNotice] = useState('');
  const [combatClearTransition, setCombatClearTransition] = useState<CombatClearTransition>();
  const [roomRewardRevealId, setRoomRewardRevealId] = useState<string>();
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

  useEffect(() => {
    if (!combatClearTransition) return;
    const timer = window.setTimeout(() => {
      setRoomRewardRevealId(combatClearTransition.id);
      setCombatClearTransition(undefined);
    }, combatClearTransition.delayMs + 1250);
    return () => window.clearTimeout(timer);
  }, [combatClearTransition]);

  useEffect(() => {
    if (!roomRewardRevealId) return;
    const timer = window.setTimeout(() => setRoomRewardRevealId(undefined), 2100);
    return () => window.clearTimeout(timer);
  }, [roomRewardRevealId]);

  const commit = useCallback(
    (command: RunCommand) => {
      setRun((current) => {
        if (!current) return current;
        try {
          const next = command(current);
          const clearedCombat =
            ['combat', 'discard'].includes(current.phase) &&
            next.phase === 'choice' &&
            Boolean(next.combat?.enemies.length) &&
            next.combat!.enemies.every((enemy) => enemy.hp <= 0);
          if (clearedCombat && next.combat) {
            const previousSequence = current.combat?.animationSequence ?? 0;
            const finishingEvents = next.combat.animationEvents.filter(
              (event) => event.sequence > previousSequence,
            );
            setCombatClearTransition({
              id: `${next.currentRoomId ?? next.combat.roomKind}:${next.combat.animationSequence}`,
              delayMs: Math.max(850, combatAnimationDuration(finishingEvents) + 100),
            });
            setRoomRewardRevealId(undefined);
          }
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
      const next = createRun(seed, profile.unlockedItemIds);
      setCombatClearTransition(undefined);
      setRoomRewardRevealId(undefined);
      setRun(next);
      setNotice('');
      void saveRun(next, true);
    },
    [profile.unlockedItemIds],
  );

  const resume = useCallback((snapshot: RunState) => {
    setRun(hydrateRunState(snapshot));
    setNotice('');
  }, []);

  const goHome = useCallback(() => {
    if (run && ['victory', 'defeat'].includes(run.phase)) clearLocalRun();
    setCombatClearTransition(undefined);
    setRoomRewardRevealId(undefined);
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
    combatClearTransition,
    roomRewardRevealId,
    commit,
    start,
    resume,
    goHome,
    dismissNotice: () => setNotice(''),
  };
}
