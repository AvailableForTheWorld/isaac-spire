import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ITEMS, type ProfileState, type RunState } from '@isaac-spire/game';
import { LanguageToggle } from '../../components/game/LanguageToggle';

function shortSeed(): string {
  const words = ['CELLAR', 'ATTACK', 'LAMB', 'MOTHER', 'DICE', 'SPIDER', 'ANGEL', 'STATIC'];
  return `${words[Math.floor(Math.random() * words.length)]}-${Math.floor(1000 + Math.random() * 9000)}`;
}

export function HomePage({
  profile,
  localRun,
  remoteRun,
  onStart,
  onResume,
}: {
  profile: ProfileState;
  localRun: RunState | null;
  remoteRun: RunState | null;
  onStart: (seed: string) => void;
  onResume: (run: RunState) => void;
}) {
  const { t } = useTranslation();
  const [seed, setSeed] = useState(shortSeed());
  const resumable =
    localRun && !['victory', 'defeat'].includes(localRun.phase) ? localRun : (remoteRun ?? undefined);
  return (
    <main className="home-page">
      <div className="home-grain" />
      <div className="home-language">
        <LanguageToggle />
      </div>
      <section className="home-hero">
        <div className="home-logo">
          <span>B</span>
          <div>
            <p>{t('home.kicker')}</p>
            <h1>{t('brand.title')}</h1>
            <small>{t('brand.subtitle')}</small>
          </div>
        </div>
        <p className="home-intro">{t('home.intro')}</p>
        <div className="seed-control">
          <label htmlFor="seed">{t('home.seed')}</label>
          <input
            id="seed"
            value={seed}
            maxLength={28}
            onChange={(event) => setSeed(event.target.value.toUpperCase())}
          />
          <button
            onClick={() => setSeed(shortSeed())}
            title={t('home.rerollSeed')}
            aria-label={t('home.rerollSeed')}
          >
            ↻
          </button>
        </div>
        <div className="home-actions">
          <button className="primary-button large" onClick={() => onStart(seed)}>
            {t('home.begin')} <span>↓</span>
          </button>
          {resumable && (
            <button className="secondary-button large" onClick={() => onResume(resumable)}>
              {t('home.continue', { floor: resumable.floorIndex + 1 })} <span>→</span>
            </button>
          )}
        </div>
        <div className="home-meta">
          <span>
            <b>{profile.wins}</b>
            {t('home.momKills')}
          </span>
          <span>
            <b>{profile.bestScore}</b>
            {t('home.bestScore')}
          </span>
          <span>
            <b>
              {profile.unlockedItemIds.length}/{Object.keys(ITEMS).length}
            </b>
            {t('home.itemsUnlocked')}
          </span>
        </div>
      </section>
      <section className="home-rules">
        <p className="eyebrow">{t('home.firstRun')}</p>
        <h2>
          {t('home.tagline1')}
          <br />
          {t('home.tagline2')}
          <br />
          {t('home.tagline3')}
        </h2>
        <div className="rule-list">
          <article>
            <span>01</span>
            <div>
              <strong>{t('home.ruleRoute')}</strong>
              <p>{t('home.ruleRouteBody')}</p>
            </div>
          </article>
          <article>
            <span>02</span>
            <div>
              <strong>{t('home.ruleFight')}</strong>
              <p>{t('home.ruleFightBody')}</p>
            </div>
          </article>
          <article>
            <span>03</span>
            <div>
              <strong>{t('home.ruleBreak')}</strong>
              <p>{t('home.ruleBreakBody')}</p>
            </div>
          </article>
        </div>
        <div className="boss-line">
          <span>{t('home.basement')}</span>
          <i />
          <span>{t('home.caves')}</span>
          <i />
          <span>{t('home.depths')}</span>
          <i />
          <b>{t('home.mom')}</b>
        </div>
      </section>
      <footer>{t('home.disclaimer')}</footer>
    </main>
  );
}
