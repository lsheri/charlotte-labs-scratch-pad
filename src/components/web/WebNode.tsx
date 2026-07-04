import { memo } from 'react';
import type { WebNode as WebNodeType, Position, BgMode } from './webTypes';
import { TOOL_LOGO_IMAGES } from '@/lib/toolLogos';

interface WebNodeProps {
  node: WebNodeType;
  pos: Position;
  highlighted: boolean;
  dimmed: boolean;
  onHover: (id: string | null, screenPos?: { x: number; y: number }) => void;
  onClick: (id: string) => void;
  bgMode?: BgMode;
}

const RING_SIZES: Record<number, number> = { 0: 22, 1: 16, 2: 9 };
const TYPE_GLOW: Record<string, string> = {
  user: 'hsl(204 100% 77%)', tool: '', receipt: 'hsl(220 30% 60%)',
};

function WebNodeComponent({ node, pos, highlighted, dimmed, onHover, onClick, bgMode = 'dark' }: WebNodeProps) {
  const isDark = bgMode === 'dark';
  const isBlueprint = bgMode === 'blueprint';
  const r = RING_SIZES[node.ring] ?? 8;
  const glowColor = node.color || TYPE_GLOW[node.type] || 'hsl(220 30% 60%)';
  const showLabel = node.ring <= 1 || highlighted;
  const showMetric = node.metrics?.interactionCount && node.ring <= 2;
  const logoSrc = node.type === 'tool' ? TOOL_LOGO_IMAGES[node.id.replace(/^tool-/, '')] || TOOL_LOGO_IMAGES[node.label?.toLowerCase() ?? ''] : null;
  const clipId = `clip-${node.id}`;

  if (isBlueprint) {
    const bpStroke = highlighted ? 'hsl(200 80% 60%)' : (node.color || 'hsl(200 60% 40%)');
    const bpFill = highlighted ? 'hsl(220 30% 12%)' : 'hsl(220 30% 9%)';
    const labelText = node.ring === 0 ? '[ YOU ]' : node.label?.toUpperCase() || '';
    return (
      <g
        transform={`translate(${pos.x}, ${pos.y})`}
        onMouseEnter={(e) => onHover(node.id, { x: e.clientX, y: e.clientY })}
        onMouseLeave={() => onHover(null)}
        onClick={() => onClick(node.id)}
        style={{ cursor: 'pointer', opacity: dimmed ? 0.12 : 1, transition: 'opacity 300ms' }}
      >
        {node.ring === 2 ? (
          <rect x={-r * 1.1} y={-r * 1.1} width={r * 2.2} height={r * 2.2}
            fill={bpFill} stroke={bpStroke} strokeWidth={highlighted ? 2.5 : 1.5} transform="rotate(45)" />
        ) : logoSrc && node.ring === 1 ? (
          <>
            <defs><clipPath id={clipId}><rect x={-r} y={-r} width={r * 2} height={r * 2} /></clipPath></defs>
            <rect x={-r - 8} y={-r - 4} width={r * 2 + 16} height={r * 2 + 8}
              fill={bpFill} stroke={bpStroke} strokeWidth={highlighted ? 2.5 : 1.5} />
            <image href={logoSrc} x={-r} y={-r} width={r * 2} height={r * 2}
              clipPath={`url(#${clipId})`} preserveAspectRatio="xMidYMid slice" />
          </>
        ) : (
          <>
            <rect x={node.ring === 0 ? -40 : -30} y={-12}
              width={node.ring === 0 ? 80 : 60} height={24}
              fill={bpFill} stroke={bpStroke} strokeWidth={highlighted ? 2.5 : 1.5} />
            <text textAnchor="middle" dominantBaseline="central"
              fill="hsl(200 60% 70%)" fontSize={node.ring === 0 ? 11 : 9}
              fontFamily="monospace" fontWeight={700} letterSpacing="0.12em"
              style={{ pointerEvents: 'none', userSelect: 'none' }}>
              {labelText}
            </text>
          </>
        )}
        {((logoSrc && node.ring === 1) || node.ring === 2) && showLabel && (
          <text y={node.ring === 2 ? r * 1.6 + 10 : r + 14} textAnchor="middle"
            fill="hsl(200 40% 55%)" fontSize={8} fontFamily="monospace" fontWeight={600}
            letterSpacing="0.1em" style={{ pointerEvents: 'none', userSelect: 'none' }}>
            {labelText}
          </text>
        )}
      </g>
    );
  }

  return (
    <g
      transform={`translate(${pos.x}, ${pos.y})`}
      onMouseEnter={(e) => onHover(node.id, { x: e.clientX, y: e.clientY })}
      onMouseLeave={() => onHover(null)}
      onClick={() => onClick(node.id)}
      style={{ cursor: 'pointer', opacity: dimmed ? 0.15 : 1, transition: 'opacity 300ms, transform 300ms ease-out' }}
    >
      {(highlighted || node.ring === 0) && (
        <circle r={r + 6} fill="none" stroke={glowColor} strokeWidth={2} opacity={0.4} className="animate-pulse" />
      )}
      {showMetric && node.metrics!.interactionCount! > 0 && (
        <circle r={r + 3} fill="none" stroke={glowColor} strokeWidth={1.5} opacity={0.25}
          strokeDasharray={`${Math.min(node.metrics!.interactionCount! * 4, 2 * Math.PI * (r + 3))} 999`} />
      )}
      {logoSrc ? (
        <>
          <defs><clipPath id={clipId}><circle r={r} cx={0} cy={0} /></clipPath></defs>
          <image href={logoSrc} x={-r} y={-r} width={r * 2} height={r * 2}
            clipPath={`url(#${clipId})`} preserveAspectRatio="xMidYMid slice" />
          <circle r={r} fill="none" stroke={glowColor} strokeWidth={highlighted ? 2.5 : 1.5} />
        </>
      ) : (
        <circle r={r}
          fill={node.ring === 0 ? glowColor : node.ring === 2 ? (node.color || (isDark ? 'hsl(220 30% 14%)' : 'hsl(220 20% 92%)')) : (isDark ? 'hsl(220 30% 14%)' : 'hsl(220 20% 92%)')}
          fillOpacity={node.ring === 2 ? 0.25 : 1}
          stroke={glowColor} strokeWidth={highlighted ? 2.5 : 1.5} />
      )}
      {showLabel && (
        <text y={r + 14} textAnchor="middle" fill={isDark ? 'hsl(220 20% 75%)' : 'hsl(220 20% 25%)'}
          fontSize={node.ring === 0 ? 13 : node.ring === 1 ? 11 : 9}
          fontWeight={node.ring <= 1 ? 600 : 400}
          style={{ pointerEvents: 'none', userSelect: 'none' }}>
          {node.label}
        </text>
      )}
    </g>
  );
}

export const WebNode = memo(WebNodeComponent);
