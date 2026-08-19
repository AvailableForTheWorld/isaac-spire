import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CARDS,
  ChoiceAction,
  ChoiceKind,
  DealType,
  ITEMS,
  ItemKind,
  RewardContext,
  RewardOptionType,
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
  rewardsText,
} from '../../localize';
import { cardAppearanceClass, itemForCard } from '../cards/cardAppearance';

function ChoiceCard({
  option,
  run,
  dealType,
  onChoose,
}: {
  option: RewardOption;
  run: RunState;
  dealType?: DealType;
  onChoose: () => void;
}) {
  const { t } = useTranslation();
  const choice = run.choice!;
  const unaffordable =
    (option.price ?? 0) > run.player.coins ||
    (dealType === DealType.Devil && option.type === RewardOptionType.Item && run.player.redContainers <= 1);
  const offeredCard = option.cardId ? CARDS[option.cardId] : undefined;
  const offeredCardItem = offeredCard ? itemForCard(offeredCard) : undefined;
  const offeredItem = option.itemId ? ITEMS[option.itemId] : undefined;
  const appearance = offeredItem || offeredCard ? cardAppearanceClass(offeredCard, offeredItem) : '';
  return (
    <button
      className={`choice-card ${option.type} ${appearance} ${option.sold ? 'sold' : ''}`}
      disabled={option.sold || unaffordable}
      onClick={onChoose}
    >
      {option.price !== undefined && <span className="price">{option.price}¢</span>}
      <b>{option.icon}</b>
      <strong>{optionLabel(t, option, choice)}</strong>
      <p>{optionDescription(t, option, choice)}</p>
      {option.type === RewardOptionType.Item && option.itemId && (
        <small>
          {t(`itemKinds.${ITEMS[option.itemId]?.kind}`)} ·{' '}
          {t('choice.quality', { quality: ITEMS[option.itemId]?.quality })}
          {ITEMS[option.itemId]?.kind === ItemKind.Passive
            ? ` · ${t(itemUsesCombatCard(ITEMS[option.itemId]!) ? 'choice.addsItemCard' : 'choice.permanentItem')}`
            : ''}
        </small>
      )}
      {option.type === RewardOptionType.Card && offeredCard && (
        <small>
          {t('choice.cardLabel', { type: cardTypeName(t, offeredCard.type) })} ·{' '}
          {t('choice.quality', { quality: offeredCardItem?.quality ?? offeredCard.quality })}
        </small>
      )}
      {choice.rewardContext === RewardContext.FloorStart && option.type === RewardOptionType.Resource && (
        <small>{t('choice.assetPack')}</small>
      )}
      {option.sold && <em>{t('choice.sold')}</em>}
      {unaffordable && !option.sold && (
        <em>
          {dealType === DealType.Devil && run.player.redContainers <= 1
            ? t('choice.needContainers')
            : t('choice.notEnoughCoins')}
        </em>
      )}
    </button>
  );
}

export function ChoiceView({
  run,
  commit,
}: {
  run: RunState;
  commit: (action: (state: RunState) => RunState) => void;
}) {
  const { t } = useTranslation();
  const [choosingId, setChoosingId] = useState<string>();
  const [pendingActiveChoice, setPendingActiveChoice] = useState<RewardOption>();
  const choice = run.choice!;
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
    if (offeredItem?.kind === ItemKind.Active && run.player.activeItemId) {
      setPendingActiveChoice(option);
      return;
    }
    beginChoice(option);
  };
  const currentActiveItem = run.player.activeItemId ? ITEMS[run.player.activeItemId] : undefined;
  const pendingReplacement = pendingActiveChoice?.itemId ? ITEMS[pendingActiveChoice.itemId] : undefined;
  const hasExplicitLeaveOption = choice.options.some((option) => option.action === ChoiceAction.Leave);
  return (
    <main className={`choice-page ${choice.dealType ?? choice.kind}`}>
      <div className="choice-aura" />
      <section className="choice-copy">
        <p className="eyebrow">
          {choice.kind === ChoiceKind.Upgrade ? t('choice.floorReward') : t('choice.chooseReward')}
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
      {choice.canSkip && !hasExplicitLeaveOption && (
        <button className="text-button choice-skip" onClick={() => commit(skipChoice)}>
          {t('choice.leaveEmpty')} <span>→</span>
        </button>
      )}
      {choice.kind === ChoiceKind.Shop && (
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
