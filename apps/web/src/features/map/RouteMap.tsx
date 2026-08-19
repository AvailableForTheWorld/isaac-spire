import { useMemo, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FLOORS,
  RoomKind,
  getAvailableNodes,
  type MapConnectionStyle,
  type MapNode,
  type RunState,
} from '@isaac-spire/game';
import { HeartMeter } from '../../components/game/HeartMeter';
import { floorName, floorSubtitle, roomHint, roomName } from '../../localize';

const ROOM_META: Record<RoomKind, { icon: string }> = {
  [RoomKind.Entrance]: { icon: '↓' },
  [RoomKind.Combat]: { icon: '⚔' },
  [RoomKind.Elite]: { icon: '♛' },
  [RoomKind.Shop]: { icon: '¢' },
  [RoomKind.Treasure]: { icon: '▣' },
  [RoomKind.Curse]: { icon: '☠' },
  [RoomKind.Sacrifice]: { icon: '♱' },
  [RoomKind.Secret]: { icon: '✦' },
  [RoomKind.SuperSecret]: { icon: '✺' },
  [RoomKind.Planetarium]: { icon: '☾' },
  [RoomKind.Boss]: { icon: '♚' },
};

function nodePoint(node: MapNode): { x: number; y: number } {
  if (node.mapPosition) return node.mapPosition;
  const optionalOffset =
    node.kind === RoomKind.Secret ? -0.34 : node.kind === RoomKind.SuperSecret ? 0.34 : 0;
  const laneDrift = [RoomKind.Entrance, RoomKind.Boss].includes(node.kind)
    ? 0
    : (((Math.round(node.depth * 10) + node.lane * 7) % 3) - 1) * 1.7;
  return { x: 20 + (node.lane + optionalOffset) * 30 + laneDrift, y: 5 + node.depth * 12.6 };
}

function fallbackConnectionStyle(key: string): MapConnectionStyle {
  const direction = [...key].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 2 ? 1 : -1;
  return {
    startBend: direction * 4.2,
    endBend: direction * -2.8,
    tension: 0.34,
    dash: 2,
    gap: 2,
    duration: 16,
    delay: -4,
    opacity: 1,
  };
}

function routeCurve(
  from: { x: number; y: number },
  to: { x: number; y: number },
  style: MapConnectionStyle,
): string {
  const horizontalDistance = to.x - from.x;
  const verticalDistance = to.y - from.y;
  const firstControlX = from.x + horizontalDistance * 0.22 + style.startBend;
  const secondControlX = to.x - horizontalDistance * 0.22 + style.endBend;
  return `M ${from.x} ${from.y} C ${firstControlX} ${from.y + verticalDistance * style.tension}, ${secondControlX} ${to.y - verticalDistance * style.tension}, ${to.x} ${to.y}`;
}

function routeInkStyle(style: MapConnectionStyle): CSSProperties {
  return {
    '--route-dash': `${style.dash} ${style.gap}`,
    '--route-duration': `${style.duration}s`,
    '--route-delay': `${style.delay}s`,
    '--route-opacity': style.opacity,
  } as CSSProperties;
}

export function RouteMap({
  run,
  onEnter,
  onBombSearch,
}: {
  run: RunState;
  onEnter: (id: string) => void;
  onBombSearch: () => void;
}) {
  const { t } = useTranslation();
  const [enteringNode, setEnteringNode] = useState<string>();
  const available = useMemo(() => new Set(getAvailableNodes(run)), [run]);
  const current = run.floorMap.nodes.find((node) => node.id === run.floorMap.currentNodeId);
  const visibleNodes = run.floorMap.nodes.filter((node) => node.revealed || !node.optional);
  const currentSearched = Boolean(current && run.floorBombSearches?.includes(current.id));
  const bombResult = run.mapBombResult?.currentNodeId === current?.id ? run.mapBombResult : undefined;
  return (
    <main className="map-layout">
      <section className="map-copy">
        <p className="eyebrow">{t('map.choose')}</p>
        <h1>{floorName(t, run.floorIndex)}</h1>
        <p>{t('map.description', { subtitle: floorSubtitle(t, run.floorIndex) })}</p>
        <div className="map-current">
          <span>{t('map.current')}</span>
          <strong>{current ? roomName(t, current.kind) : '?'}</strong>
        </div>
        <div className="map-bomb-search">
          <button disabled={run.player.bombs < 1 || currentSearched} onClick={onBombSearch}>
            <b>●</b>
            <span>{t(currentSearched ? 'map.wallSearched' : 'map.searchWall')}</span>
            <small>{t('map.searchWallCost')}</small>
          </button>
          {bombResult && (
            <p className={bombResult.found ? 'found' : 'empty'}>
              {bombResult.found
                ? t('map.secretFound', { room: roomName(t, bombResult.roomKind ?? RoomKind.Secret) })
                : t('map.noSecretFound')}
            </p>
          )}
        </div>
        <HeartMeter run={run} />
        <div className="floor-progress" aria-label={t('map.progress')}>
          {FLOORS.map((floor) => (
            <i
              key={floor.index}
              className={
                floor.index < run.floorIndex ? 'done' : floor.index === run.floorIndex ? 'active' : ''
              }
              title={floorName(t, floor.index)}
            />
          ))}
        </div>
        <p className="map-note">{t('map.note')}</p>
      </section>
      <section
        className={`route-board ${enteringNode ? 'route-entering' : ''}`}
        style={{ '--floor-color': FLOORS[run.floorIndex]?.palette } as CSSProperties}
      >
        <div className="route-canvas">
          <svg className="route-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {run.floorMap.nodes
              .filter((node) => !node.optional)
              .flatMap((node) =>
                node.connections.map((targetId) => {
                  const target = run.floorMap.nodes.find((entry) => entry.id === targetId);
                  if (!target) return null;
                  const from = nodePoint(node);
                  const to = nodePoint(target);
                  const active = node.visited && (target.visited || available.has(target.id));
                  const key = `${node.id}->${target.id}`;
                  const style = run.floorMap.connectionStyles?.[key] ?? fallbackConnectionStyle(key);
                  return (
                    <path
                      key={key}
                      d={routeCurve(from, to, style)}
                      style={routeInkStyle(style)}
                      className={active ? 'active' : ''}
                    />
                  );
                }),
              )}
            {run.floorMap.nodes
              .filter((node) => node.optional)
              .map((node) => {
                const anchor = run.floorMap.nodes.find((entry) => entry.id === node.anchorId);
                if (!anchor || !node.revealed) return null;
                const from = nodePoint(anchor);
                const to = nodePoint(node);
                const key = `${anchor.id}->${node.id}`;
                const style = run.floorMap.connectionStyles?.[key] ?? fallbackConnectionStyle(key);
                return (
                  <path
                    key={key}
                    d={routeCurve(from, to, style)}
                    style={routeInkStyle(style)}
                    className="secret-line"
                  />
                );
              })}
          </svg>
          {visibleNodes.map((node) => {
            const point = nodePoint(node);
            const meta = ROOM_META[node.kind];
            const canEnter = available.has(node.id);
            const sealedSecret = node.optional && !node.doorOpened;
            const needsKey =
              run.floorIndex > 0 && (node.kind === RoomKind.Shop || node.kind === RoomKind.Treasure);
            const noKey = canEnter && needsKey && run.player.keys < 1;
            const hidden = node.optional && !node.revealed;
            return (
              <button
                key={node.id}
                className={`map-node ${node.kind} ${node.visited ? 'visited' : ''} ${canEnter ? 'available' : ''} ${hidden ? 'hidden' : ''} ${enteringNode === node.id ? 'choosing' : ''}`}
                style={{ left: `${point.x}%`, top: `${point.y}%` }}
                disabled={!canEnter || noKey}
                onClick={() => {
                  if (enteringNode) return;
                  setEnteringNode(node.id);
                  window.setTimeout(() => onEnter(node.id), 420);
                }}
                title={
                  hidden
                    ? t('map.hidden')
                    : `${roomName(t, node.kind)}：${roomHint(t, node.kind)}${sealedSecret ? ` ${t('map.needBomb')}` : ''}${needsKey ? ` ${t('map.needKey')}` : ''}`
                }
                aria-label={hidden ? t('map.hiddenLabel') : roomName(t, node.kind)}
              >
                <span>{hidden ? '?' : meta.icon}</span>
                {!hidden && <small>{roomName(t, node.kind)}</small>}
                {sealedSecret && <em>{t('map.sealed')}</em>}
                {noKey && <em>{t('map.noKey')}</em>}
                {canEnter && needsKey && !noKey && <em className="key-cost">⚿ 1</em>}
              </button>
            );
          })}
          <div className="route-depth-label top">{t('map.thisFloor')}</div>
          <div className="route-depth-label bottom">{t('map.bossDoor')}</div>
        </div>
      </section>
    </main>
  );
}
