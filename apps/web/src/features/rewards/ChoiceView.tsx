import { useEffect, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CARDS,
  ITEMS,
  chooseOption,
  itemUsesCombatCard,
  skipChoice,
  type RewardOption,
  type RunState,
} from '@isaac-spire/game';
import { ConfirmationPanel } from '../../components/game/ConfirmationPanel';
import {
  cardTypeName,
  choiceSubtitle,
  choiceTitle,
  itemName,
  optionDescription,
  optionLabel,
  rewardText,
  rewardsText,
} from '../../localize';

function ChoiceCard({
  option,
  run,
  dealType,
  onChoose,
}: {
  option: RewardOption;
  run: RunState;
  dealType?: 'devil' | 'angel';
  onChoose: () => void;
}) {
  const { t } = useTranslation();
  const choice = run.choice!;
  const unaffordable =
    (option.price ?? 0) > run.player.coins ||
    (dealType === 'devil' && option.type === 'item' && run.player.redContainers <= 1);
  const offeredCard = option.cardId ? CARDS[option.cardId] : undefined;
  const offeredCardItem = offeredCard?.itemId ? ITEMS[offeredCard.itemId] : undefined;
  return (
    <button
      className={`choice-card ${option.type} ${option.sold ? 'sold' : ''}`}
      disabled={option.sold || unaffordable}
      onClick={onChoose}
    >
      {option.price !== undefined && <span className="price">{option.price}¢</span>}
      <b>{option.icon}</b>
      <strong>{optionLabel(t, option, choice)}</strong>
      <p>{optionDescription(t, option, choice)}</p>
      {option.type === 'item' && option.itemId && (
        <small>
          {t(`itemKinds.${ITEMS[option.itemId]?.kind}`)} ·{' '}
          {t('choice.quality', { quality: ITEMS[option.itemId]?.quality })}
          {ITEMS[option.itemId]?.kind === 'passive'
            ? ` · ${t(itemUsesCombatCard(ITEMS[option.itemId]!) ? 'choice.addsItemCard' : 'choice.permanentItem')}`
            : ''}
        </small>
      )}
      {option.type === 'card' && offeredCard && (
        <small>
          {t('choice.cardLabel', { type: cardTypeName(t, offeredCard.type) })}
          {offeredCardItem ? ` · ${t('choice.quality', { quality: offeredCardItem.quality })}` : ''}
        </small>
      )}
      {choice.rewardContext === 'floor-start' && option.type === 'resource' && (
        <small>{t('choice.assetPack')}</small>
      )}
      {option.sold && <em>{t('choice.sold')}</em>}
      {unaffordable && !option.sold && (
        <em>
          {dealType === 'devil' && run.player.redContainers <= 1
            ? t('choice.needContainers')
            : t('choice.notEnoughCoins')}
        </em>
      )}
    </button>
  );
}

function rewardIcon(reward: string): string {
  if (/¢$/.test(reward)) return '¢';
  if (/bomb/.test(reward)) return '●';
  if (/key/.test(reward)) return '⚿';
  if (/black heart/.test(reward)) return '♥';
  if (/soul heart/.test(reward)) return '♡';
  if (/red-heart/.test(reward)) return '♥';
  return '✦';
}

function RoomRewardReveal({ run }: { run: RunState }) {
  const { t } = useTranslation();
  return (
    <div className="reward-reveal" role="status" aria-live="assertive">
      <div className="reward-rays" />
      <div className="reward-chest" aria-hidden="true">
        <i />
        <b>◆</b>
      </div>
      <div className="reward-title">
        <span>{t('rewardReveal.cleared')}</span>
        <strong>{t('rewardReveal.open')}</strong>
      </div>
      <div className="reward-drops">
        {run.lastReward.map((reward, index) => (
          <div key={`${reward}-${index}`} style={{ '--reward-index': index } as CSSProperties}>
            <b>{rewardIcon(reward)}</b>
            <span>{rewardText(t, reward)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChoiceView({
  run,
  commit,
  revealRoomReward = false,
}: {
  run: RunState;
  commit: (action: (state: RunState) => RunState) => void;
  revealRoomReward?: boolean;
}) {
  const { t } = useTranslation();
  const [choosingId, setChoosingId] = useState<string>();
  const [pendingActiveChoice, setPendingActiveChoice] = useState<RewardOption>();
  const choice = run.choice!;
  const [revealingReward, setRevealingReward] = useState(
    Boolean(revealRoomReward || (run.combat && run.lastReward.length)),
  );
  useEffect(() => {
    if (!revealingReward) return;
    const timer = window.setTimeout(() => setRevealingReward(false), 1900);
    return () => window.clearTimeout(timer);
  }, [revealingReward]);
  const beginChoice = (option: RewardOption) => {
    if (choosingId) return;
    setChoosingId(option.id);
    window.setTimeout(() => {
      commit((state) => chooseOption(state, option.id));
      setChoosingId(undefined);
    }, 340);
  };
  const requestChoice = (option: RewardOption) => {
    if (choosingId) return;
    const offeredItem = option.itemId ? ITEMS[option.itemId] : undefined;
    if (offeredItem?.kind === 'active' && run.player.activeItemId) {
      setPendingActiveChoice(option);
      return;
    }
    beginChoice(option);
  };
  const currentActiveItem = run.player.activeItemId ? ITEMS[run.player.activeItemId] : undefined;
  const pendingReplacement = pendingActiveChoice?.itemId ? ITEMS[pendingActiveChoice.itemId] : undefined;
  return (
    <main className={`choice-page ${choice.dealType ?? choice.kind}`}>
      {revealingReward && <RoomRewardReveal run={run} />}
      <div className="choice-aura" />
      <section className="choice-copy">
        <p className="eyebrow">
          {choice.kind === 'upgrade' ? t('choice.floorReward') : t('choice.chooseReward')}
        </p>
        <h1>{choiceTitle(t, run)}</h1>
        <p>{choiceSubtitle(t, run)}</p>
        {run.lastReward.length > 0 && (
          <div className="drop-notice">{t('choice.roomDrop', { rewards: rewardsText(t, run) })}</div>
        )}
      </section>
      <section className="choice-grid">
        {choice.options.map((option) => (
          <div className={choosingId === option.id ? 'choice-selecting' : ''} key={option.id}>
            <ChoiceCard
              option={option}
              run={run}
              dealType={choice.dealType}
              onChoose={() => requestChoice(option)}
            />
          </div>
        ))}
      </section>
      {choice.canSkip && (
        <button className="text-button choice-skip" onClick={() => commit(skipChoice)}>
          {t('choice.leaveEmpty')} <span>→</span>
        </button>
      )}
      {choice.kind === 'shop' && (
        <div className="shop-purse">
          {t('choice.shopPurse')} <strong>{run.player.coins}¢</strong>
        </div>
      )}
      {pendingActiveChoice && currentActiveItem && pendingReplacement && (
        <ConfirmationPanel
          eyebrow={t('confirmation.inventoryChange')}
          title={t('confirmation.replaceActiveTitle')}
          message={t('choice.replaceActiveConfirm', {
            current: itemName(t, currentActiveItem.id),
            next: itemName(t, pendingReplacement.id),
          })}
          items={[
            {
              icon: currentActiveItem.icon,
              name: itemName(t, currentActiveItem.id),
              note: t('confirmation.currentActive'),
            },
            {
              icon: pendingReplacement.icon,
              name: itemName(t, pendingReplacement.id),
              note: t('confirmation.newActive'),
            },
          ]}
          confirmLabel={t('confirmation.replaceActive')}
          onCancel={() => setPendingActiveChoice(undefined)}
          onConfirm={() => {
            const option = pendingActiveChoice;
            setPendingActiveChoice(undefined);
            beginChoice(option);
          }}
        />
      )}
    </main>
  );
}
