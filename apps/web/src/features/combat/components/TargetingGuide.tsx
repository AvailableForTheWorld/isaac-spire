import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

type TargetingGeometry = {
  width: number;
  height: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  path: string;
  locked: boolean;
};

export function TargetingGuide({
  hoveredTargetId,
  targetName,
}: {
  hoveredTargetId?: string;
  targetName?: string;
}) {
  const { t } = useTranslation();
  const [geometry, setGeometry] = useState<TargetingGeometry>();
  const pointer = useRef<{ x: number; y: number } | undefined>(undefined);
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      frame = 0;
      const source = document.querySelector<HTMLElement>('.game-card.targeting');
      if (!source) return;
      const sourceRect = source.getBoundingClientRect();
      const target = hoveredTargetId
        ? document.querySelector<HTMLElement>(`[data-enemy-instance-id="${hoveredTargetId}"]`)
        : null;
      const targetRect = target?.getBoundingClientRect();
      const width = window.innerWidth;
      const height = window.innerHeight;
      const startX = Math.max(18, Math.min(width - 18, sourceRect.left + sourceRect.width / 2));
      const startY = Math.max(18, Math.min(height - 18, sourceRect.top + 12));
      const fallback = pointer.current ?? { x: width * 0.72, y: Math.max(110, startY - 230) };
      const endX = targetRect ? targetRect.left + targetRect.width / 2 : fallback.x;
      const endY = targetRect ? targetRect.top + targetRect.height / 2 : fallback.y;
      const lift = Math.max(
        90,
        Math.min(270, Math.abs(startY - endY) * 0.68 + Math.abs(startX - endX) * 0.13),
      );
      const controlOneY = Math.max(14, startY - lift);
      const controlTwoY = Math.min(height - 14, endY + lift * 0.38);
      setGeometry({
        width,
        height,
        startX,
        startY,
        endX,
        endY,
        path: `M ${startX} ${startY} C ${startX} ${controlOneY}, ${endX} ${controlTwoY}, ${endX} ${endY}`,
        locked: Boolean(targetRect),
      });
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(draw);
    };
    const followPointer = (event: PointerEvent) => {
      pointer.current = { x: event.clientX, y: event.clientY };
      schedule();
    };
    window.addEventListener('pointermove', followPointer, { passive: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    schedule();
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', followPointer);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
    };
  }, [hoveredTargetId]);
  if (!geometry) return null;
  const markerId = geometry.locked ? 'target-arrow-head-locked' : 'target-arrow-head-seeking';
  return (
    <div
      className={`targeting-guide ${geometry.locked ? 'locked' : 'seeking'}`}
      role="status"
      aria-live="polite"
    >
      <svg viewBox={`0 0 ${geometry.width} ${geometry.height}`} aria-hidden="true">
        <defs>
          <filter id="target-arrow-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
          <marker
            id="target-arrow-head-seeking"
            markerWidth="22"
            markerHeight="22"
            refX="19"
            refY="11"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <path d="M 2 2 L 20 11 L 2 20 Z" fill="#dd6f64" />
          </marker>
          <marker
            id="target-arrow-head-locked"
            markerWidth="22"
            markerHeight="22"
            refX="19"
            refY="11"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <path d="M 2 2 L 20 11 L 2 20 Z" fill="#f1c574" />
          </marker>
        </defs>
        <path className="target-arrow-glow" d={geometry.path} />
        <path className="target-arrow-main" d={geometry.path} markerEnd={`url(#${markerId})`} />
        <path className="target-arrow-flow" d={geometry.path} />
        <circle className="target-arrow-origin" cx={geometry.startX} cy={geometry.startY} r="8" />
        {geometry.locked && (
          <>
            <circle className="target-arrow-reticle outer" cx={geometry.endX} cy={geometry.endY} r="24" />
            <circle className="target-arrow-reticle inner" cx={geometry.endX} cy={geometry.endY} r="9" />
          </>
        )}
      </svg>
      <div className="targeting-cursor-label" style={{ left: geometry.endX, top: geometry.endY }}>
        {geometry.locked ? (
          <>
            <strong>{targetName}</strong>
            <span>{t('combat.targetReady')}</span>
          </>
        ) : (
          <span>{t('combat.targetSeek')}</span>
        )}
      </div>
    </div>
  );
}
