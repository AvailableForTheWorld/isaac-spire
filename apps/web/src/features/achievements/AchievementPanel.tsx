import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ACHIEVEMENT_DEFINITIONS,
  ITEMS,
  AchievementCategory,
  AchievementTier,
  achievementRequirementValue,
  type AchievementDefinition,
  type ProfileState,
} from '@isaac-spire/game';

enum AchievementFilter {
  All = 'all',
}

type Filter = AchievementFilter | AchievementCategory;

const TIER_ORDER: Readonly<Record<AchievementTier, number>> = {
  [AchievementTier.Bronze]: 0,
  [AchievementTier.Silver]: 1,
  [AchievementTier.Gold]: 2,
  [AchievementTier.Platinum]: 3,
};

function localizedAchievement(
  achievement: AchievementDefinition,
  chinese: boolean,
): { name: string; description: string } {
  return {
    name: chinese ? achievement.nameZh : achievement.name,
    description: chinese ? achievement.descriptionZh : achievement.description,
  };
}

export function AchievementPanel({ profile, onClose }: { profile: ProfileState; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const [filter, setFilter] = useState<Filter>(AchievementFilter.All);
  const chinese = i18n.resolvedLanguage?.startsWith('zh') ?? false;
  const completed = useMemo(
    () => new Set(profile.achievementProgress.completedIds),
    [profile.achievementProgress.completedIds],
  );
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose]);
  const definitions = useMemo(
    () =>
      ACHIEVEMENT_DEFINITIONS.filter(
        (achievement) => filter === AchievementFilter.All || achievement.category === filter,
      ).sort((left, right) => {
        const completionOrder = Number(completed.has(right.id)) - Number(completed.has(left.id));
        return completionOrder || TIER_ORDER[left.tier] - TIER_ORDER[right.tier];
      }),
    [completed, filter],
  );

  return (
    <div className="achievement-overlay" role="presentation" onMouseDown={onClose}>
      <section
        className="achievement-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="achievement-panel-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <p className="eyebrow">{t('achievements.kicker')}</p>
            <h2 id="achievement-panel-title">{t('achievements.title')}</h2>
            <p>
              {t('achievements.summary', { current: completed.size, total: ACHIEVEMENT_DEFINITIONS.length })}
            </p>
          </div>
          <button className="achievement-close" onClick={onClose} aria-label={t('achievements.close')}>
            ×
          </button>
        </header>

        <nav className="achievement-filters" aria-label={t('achievements.filters')}>
          {[AchievementFilter.All, ...Object.values(AchievementCategory)].map((category) => (
            <button
              key={category}
              className={filter === category ? 'selected' : ''}
              onClick={() => setFilter(category)}
            >
              {t(`achievements.categories.${category}`)}
            </button>
          ))}
        </nav>

        <div className="achievement-grid">
          {definitions.map((achievement) => {
            const unlocked = completed.has(achievement.id);
            const hidden = achievement.hidden && !unlocked;
            const text = localizedAchievement(achievement, chinese);
            const progress = achievementRequirementValue(profile.achievementProgress, achievement);
            const percentage = unlocked
              ? 100
              : Math.min(100, (progress.current / Math.max(1, progress.target)) * 100);
            return (
              <article
                key={achievement.id}
                className={`achievement-card tier-${achievement.tier} ${unlocked ? 'completed' : 'locked'}`}
              >
                <span className="achievement-icon">{hidden ? '?' : achievement.icon}</span>
                <div className="achievement-copy">
                  <div className="achievement-heading">
                    <strong>{hidden ? t('achievements.hiddenName') : text.name}</strong>
                    <small>{t(`achievements.tiers.${achievement.tier}`)}</small>
                  </div>
                  <p>{hidden ? t('achievements.hiddenDescription') : text.description}</p>
                  <div className="achievement-progress" aria-label={`${progress.current}/${progress.target}`}>
                    <i style={{ width: `${percentage}%` }} />
                  </div>
                  <div className="achievement-footer">
                    <span>
                      {unlocked ? t('achievements.completed') : t('achievements.progress', progress)}
                    </span>
                    {!hidden && (
                      <span className="achievement-rewards">
                        {t('achievements.rewards')}:{' '}
                        {achievement.rewardItemIds.map((itemId) => {
                          const item = ITEMS[itemId];
                          const itemName = chinese ? item?.nameZh : item?.name;
                          return (
                            <b key={itemId} title={itemName}>
                              <i>{item?.icon ?? '□'}</i>
                              <span>{itemName ?? itemId}</span>
                            </b>
                          );
                        })}
                      </span>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
