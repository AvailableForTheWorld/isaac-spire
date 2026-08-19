import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { RunPhase, acknowledgeRoomReward, abandonRun, enterRoom, useMapBomb } from '@isaac-spire/game';
import { GameHeader } from '../../components/game/GameHeader';
import { unlockText } from '../../localize';
import { HomePage } from '../home/HomePage';
import { RoomRewardReveal } from '../rewards/RoomRewardReveal';
import { useGameSession } from '../run/useGameSession';
import { StatsRail } from '../stats/StatsRail';

const CombatView = lazy(() =>
  import('../combat/CombatView').then((module) => ({ default: module.CombatView })),
);
const RouteMap = lazy(() => import('../map/RouteMap').then((module) => ({ default: module.RouteMap })));
const ChoiceView = lazy(() =>
  import('../rewards/ChoiceView').then((module) => ({ default: module.ChoiceView })),
);
const ResultView = lazy(() =>
  import('../result/ResultView').then((module) => ({ default: module.ResultView })),
);

export function GameApplication() {
  const { t } = useTranslation();
  const session = useGameSession();
  const { run } = session;

  if (!run) {
    return (
      <HomePage
        profile={session.profile}
        localRun={session.localRun}
        remoteRun={session.remoteRun}
        onStart={session.start}
        onResume={session.resume}
      />
    );
  }

  const showingRoomReward = Boolean(
    run.phase === RunPhase.Choice && run.combat && run.choice?.requiresRewardConfirmation,
  );
  const onAbandon = () => {
    if (window.confirm(t('header.abandonConfirm'))) session.commit(abandonRun);
  };

  return (
    <div className={`game-shell antialiased phase-${showingRoomReward ? RunPhase.Combat : run.phase}`}>
      <GameHeader run={run} onAbandon={onAbandon} />
      {session.notice && (
        <button className="toast" onClick={session.dismissNotice}>
          {session.notice}
          <span>×</span>
        </button>
      )}
      {!showingRoomReward && run.unlockNotices.length > 0 && run.phase !== RunPhase.Victory && (
        <div className="unlock-toast">
          {t('result.newUnlock', { message: unlockText(t, run.unlockNotices.at(-1)!.itemId) })}
        </div>
      )}
      <Suspense fallback={<main className="stage-loading">{t('combat.preparing')}</main>}>
        {run.phase === RunPhase.Map && (
          <RouteMap
            run={run}
            onEnter={(id) => session.commit((state) => enterRoom(state, id))}
            onBombSearch={() => session.commit(useMapBomb)}
          />
        )}
        {(run.phase === RunPhase.Combat || run.phase === RunPhase.Discard || showingRoomReward) &&
          run.combat && <CombatView run={run} commit={session.commit} />}
        {showingRoomReward && (
          <RoomRewardReveal run={run} onConfirm={() => session.commit(acknowledgeRoomReward)} />
        )}
        {run.phase === RunPhase.Choice && run.choice && !showingRoomReward && (
          <ChoiceView run={run} commit={session.commit} />
        )}
        {(run.phase === RunPhase.Victory || run.phase === RunPhase.Defeat) && (
          <ResultView run={run} onHome={session.goHome} />
        )}
      </Suspense>
      {!showingRoomReward &&
        ![RunPhase.Victory, RunPhase.Defeat, RunPhase.Combat, RunPhase.Discard].includes(run.phase) && (
          <StatsRail run={run} />
        )}
    </div>
  );
}
