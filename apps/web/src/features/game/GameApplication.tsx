import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ACHIEVEMENTS,
  ITEMS,
  RunPhase,
  acknowledgeAchievementNotice,
  acknowledgeRoomReward,
  abandonRun,
  enterRoom,
  useMapBomb,
  type AchievementDefinition,
  type AchievementNotice,
} from '@isaac-spire/game';
import { GameHeader } from '../../components/game/GameHeader';
import { unlockText } from '../../localize';
import { HomePage } from '../home/HomePage';
import { PocketItemBar } from '../items/PocketItemBar';
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

function AchievementUnlockNotice({
  achievement,
  notice,
  onConfirm,
}: {
  achievement: AchievementDefinition;
  notice: AchievementNotice;
  onConfirm: () => void;
}) {
  const { t, i18n } = useTranslation();
  const chinese = i18n.resolvedLanguage?.startsWith('zh') ?? false;
  return (
    <aside className="achievement-toast" role="status" aria-live="assertive">
      <span className="achievement-toast-icon">{achievement.icon}</span>
      <div className="achievement-toast-copy">
        <small>{t('achievements.unlocked')}</small>
        <strong>{chinese ? achievement.nameZh : achievement.name}</strong>
        <p>{chinese ? achievement.descriptionZh : achievement.description}</p>
        {notice.rewardItemIds.length > 0 && (
          <div className="achievement-toast-rewards">
            <em>{t('achievements.newItems')}</em>
            {notice.rewardItemIds.map((itemId) => {
              const item = ITEMS[itemId];
              return (
                <b key={itemId}>
                  {item?.icon ?? '□'} {chinese ? item?.nameZh : item?.name}
                </b>
              );
            })}
          </div>
        )}
      </div>
      <button onClick={onConfirm}>{t('achievements.acknowledge')}</button>
    </aside>
  );
}

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
  const pendingAchievement = run.achievementNotices.find((notice) => !notice.acknowledgedAt);
  const pendingAchievementDefinition = pendingAchievement
    ? ACHIEVEMENTS[pendingAchievement.achievementId]
    : undefined;
  const onAbandon = () => {
    if (window.confirm(t('header.abandonConfirm'))) session.commit(abandonRun);
  };

  return (
    <div className={`game-shell antialiased phase-${showingRoomReward ? RunPhase.Combat : run.phase}`}>
      <GameHeader
        run={run}
        saveStatus={session.saveStatus}
        onSave={session.saveNow}
        onSaveAndExit={session.saveAndGoHome}
        onAbandon={onAbandon}
      />
      <PocketItemBar run={run} commit={session.commit} />
      {session.notice && (
        <button className="toast" onClick={session.dismissNotice}>
          {session.notice}
          <span>×</span>
        </button>
      )}
      {pendingAchievementDefinition && pendingAchievement && !showingRoomReward && (
        <AchievementUnlockNotice
          key={pendingAchievementDefinition.id}
          achievement={pendingAchievementDefinition}
          notice={pendingAchievement}
          onConfirm={() =>
            session.commit((state) => acknowledgeAchievementNotice(state, pendingAchievement.achievementId))
          }
        />
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
