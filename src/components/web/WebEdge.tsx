import { memo } from 'react';
import type { Position, WebEdge as WebEdgeType, BgMode } from './webTypes';

interface WebEdgeProps {
  edge: WebEdgeType;
  sourcePos: Position;
  targetPos: Position;
  highlighted: boolean;
  dimmed: boolean;
  bgMode?: BgMode;
}

function WebEdgeComponent({ edge, sourcePos, targetPos, highlighted, dimmed, bgMode = 'dark' }: WebEdgeProps) {
  const isDark = bgMode === 'dark';
  const isBlueprint = bgMode === 'blueprint';
  let path: string;
  if (isBlueprint) {
    path = `M ${sourcePos.x} ${sourcePos.y} L ${targetPos.x} ${targetPos.y}`;
  } else {
    const mx = (sourcePos.x + targetPos.x) / 2;
    const my = (sourcePos.y + targetPos.y) / 2;
    const dx = targetPos.x - sourcePos.x;
    const dy = targetPos.y - sourcePos.y;
    const offset = Math.min(Math.sqrt(dx * dx + dy * dy) * 0.1, 20);
    const cx = mx + (-dy / (Math.sqrt(dx * dx + dy * dy) || 1)) * offset;
    const cy = my + (dx / (Math.sqrt(dx * dx + dy * dy) || 1)) * offset;
    path = `M ${sourcePos.x} ${sourcePos.y} Q ${cx} ${cy} ${targetPos.x} ${targetPos.y}`;
  }
  const defaultStroke = isBlueprint ? 'hsl(200 60% 40%)' : isDark ? 'hsl(220 30% 50%)' : 'hsl(220 20% 70%)';
  const hlStroke = isBlueprint ? 'hsl(200 80% 60%)' : 'hsl(204 100% 77%)';
  return (
    <path
      d={path} fill="none"
      stroke={highlighted ? hlStroke : defaultStroke}
      strokeWidth={highlighted ? 2 * Math.max(edge.weight, 0.8) : Math.max(edge.weight * 0.8, 0.5)}
      opacity={dimmed ? 0.06 : highlighted ? 0.75 : isBlueprint ? 0.35 : 0.2}
      strokeDasharray={isBlueprint ? (highlighted ? '8 4' : '4 6') : (highlighted ? '6 3' : 'none')}
      className={highlighted && !isBlueprint ? 'animate-pulse' : ''}
      style={{ transition: 'opacity 300ms, stroke-width 300ms, stroke 300ms' }}
    />
  );
}

export const WebEdge = memo(WebEdgeComponent);
