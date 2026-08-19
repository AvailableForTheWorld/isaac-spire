import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { abandonRun, enterRoom, useMapBomb } from '@isaac-spire/game';
import { GameHeader } from '../../components/game/GameHeader';
import { unlockText } from '../../localize';
import { HomePage } from '../home/HomePage';
import { RoomClearTransition } from '../rewards/RoomClearTransition';
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

  const showingCombatClear = Boolean(session.combatClearTransition && run.phase === 'choice' && run.combat);
  const onAbandon = () => {
    if (window.confirm(t('header.abandonConfirm'))) session.commit(abandonRun);
  };

  return (
    <div className={`game-shell antialiased phase-${showingCombatClear ? 'combat' : run.phase}`}>
      <GameHeader run={run} onAbandon={onAbandon} />
      {session.notice && (
        <button className="toast" onClick={session.dismissNotice}>
          {session.notice}
          <span>×</span>
        </button>
      )}
      {!showingCombatClear && run.unlockNotices.length > 0 && run.phase !== 'victory' && (
        <div className="unlock-toast">
          {t('result.newUnlock', { message: unlockText(t, run.unlockNotices.at(-1)!.itemId) })}
        </div>
      )}
      <Suspense fallback={<main className="stage-loading">{t('combat.preparing')}</main>}>
        {run.phase === 'map' && (
          <RouteMap
            run={run}
            onEnter={(id) => session.commit((state) => enterRoom(state, id))}
            onBombSearch={() => session.commit(useMapBomb)}
          />
        )}
        {(run.phase === 'combat' || run.phase === 'discard' || showingCombatClear) && run.combat && (
          <CombatView run={run} commit={session.commit} />
        )}
        {showingCombatClear && session.combatClearTransition && (
          <RoomClearTransition
            key={session.combatClearTransition.id}
            delayMs={session.combatClearTransition.delayMs}
          />
        )}
        {run.phase === 'choice' && run.choice && !showingCombatClear && (
          <ChoiceView
            run={run}
            commit={session.commit}
            revealRoomReward={Boolean(session.roomRewardRevealId)}
          />
        )}
        {(run.phase === 'victory' || run.phase === 'defeat') && (
          <ResultView run={run} onHome={session.goHome} />
        )}
      </Suspense>
      {!showingCombatClear && !['victory', 'defeat', 'combat', 'discard'].includes(run.phase) && (
        <StatsRail run={run} />
      )}
    </div>
  );
}
