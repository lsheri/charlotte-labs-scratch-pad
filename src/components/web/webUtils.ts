import type { SimulatedNode, WebEdge, PhysicsConfig, Position } from './webTypes';

const DEFAULT_CONFIG: PhysicsConfig = {
  centerForce: 0.05,
  repulsionForce: 800,
  linkForce: 0.02,
  ringRadii: [0, 120, 240, 340],
  damping: 0.85,
  iterations: 120,
};

export function runForceSimulation(
  nodes: SimulatedNode[],
  edges: WebEdge[],
  config: PhysicsConfig = DEFAULT_CONFIG,
): Position[] {
  if (nodes.length === 0) return [];
  const cx = 0, cy = 0;
  const ringBuckets: Record<number, SimulatedNode[]> = {};
  nodes.forEach((n) => {
    if (!ringBuckets[n.ring]) ringBuckets[n.ring] = [];
    ringBuckets[n.ring].push(n);
  });
  Object.entries(ringBuckets).forEach(([ring, bucket]) => {
    const r = config.ringRadii[Number(ring)] ?? 300;
    const angleStep = (2 * Math.PI) / Math.max(bucket.length, 1);
    const jitter = Math.PI * 0.15;
    bucket.forEach((n, i) => {
      const angle = angleStep * i + (Math.random() - 0.5) * jitter;
      n.x = cx + r * Math.cos(angle);
      n.y = cy + r * Math.sin(angle);
      n.vx = 0; n.vy = 0; n.targetAngle = angle;
    });
  });

  for (let iter = 0; iter < config.iterations; iter++) {
    const alpha = 1 - iter / config.iterations;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if (nodes[i].ring !== nodes[j].ring) continue;
        const dx = nodes[j].x - nodes[i].x;
        const dy = nodes[j].y - nodes[i].y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const force = (config.repulsionForce * alpha) / (dist * dist);
        const fx = (dx / dist) * force, fy = (dy / dist) * force;
        nodes[i].vx -= fx; nodes[i].vy -= fy;
        nodes[j].vx += fx; nodes[j].vy += fy;
      }
    }
    edges.forEach((e) => {
      const a = nodes.find((n) => n.id === e.source);
      const b = nodes.find((n) => n.id === e.target);
      if (!a || !b) return;
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const idealLen = Math.abs(config.ringRadii[b.ring] - config.ringRadii[a.ring]) || 80;
      const displacement = dist - idealLen;
      const force = displacement * config.linkForce * alpha * e.weight;
      const fx = (dx / dist) * force, fy = (dy / dist) * force;
      a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
    });
    nodes.forEach((n) => {
      if (n.ring === 0) { n.vx = 0; n.vy = 0; n.x = cx; n.y = cy; return; }
      const targetR = config.ringRadii[n.ring] ?? 300;
      const dx = n.x - cx, dy = n.y - cy;
      const currentR = Math.sqrt(dx * dx + dy * dy) || 1;
      const pull = (targetR - currentR) * config.centerForce * 2;
      n.vx += (dx / currentR) * pull;
      n.vy += (dy / currentR) * pull;
    });
    nodes.forEach((n) => {
      n.vx *= config.damping; n.vy *= config.damping;
      n.x += n.vx; n.y += n.vy;
    });
  }
  return nodes.map((n) => ({ x: n.x, y: n.y }));
}

export function getConnectedIds(nodeId: string, edges: WebEdge[]): Set<string> {
  const ids = new Set<string>();
  ids.add(nodeId);
  edges.forEach((e) => {
    if (e.source === nodeId) ids.add(e.target);
    if (e.target === nodeId) ids.add(e.source);
  });
  return ids;
}

const TOOL_HUE: Record<string, string> = {
  chatgpt: 'hsl(160 80% 45%)',
  claude: 'hsl(30 85% 55%)',
  gemini: 'hsl(217 89% 61%)',
  copilot: 'hsl(207 100% 42%)',
  perplexity: 'hsl(174 70% 40%)',
  lovable: 'hsl(280 50% 60%)',
  figma: 'hsl(340 75% 55%)',
  grok: 'hsl(0 0% 15%)',
  deepseek: 'hsl(220 70% 50%)',
  mistral: 'hsl(20 90% 55%)',
  huggingface: 'hsl(45 95% 55%)',
  bolt: 'hsl(45 95% 50%)',
};

export function getToolColor(tool: string): string {
  return TOOL_HUE[tool.toLowerCase()] ?? 'hsl(220 20% 55%)';
}

const MEDIA_COLORS: Record<string, string> = {
  text: 'hsl(213 80% 55%)',
  code: 'hsl(145 63% 45%)',
  image: 'hsl(330 80% 60%)',
  video: 'hsl(0 75% 55%)',
  audio: 'hsl(270 60% 58%)',
  data: 'hsl(174 70% 42%)',
  app: 'hsl(240 55% 58%)',
  mixed: 'hsl(220 20% 55%)',
};

export function getMediaColor(mediaType: string | null | undefined): string {
  if (!mediaType) return 'hsl(220 20% 55%)';
  return MEDIA_COLORS[mediaType.toLowerCase()] ?? 'hsl(220 20% 55%)';
}

const HASH_PALETTE = [
  'hsl(156 93% 71%)', 'hsl(199 100% 77%)', 'hsl(144 87% 60%)',
  'hsl(197 100% 64%)', 'hsl(186 85% 36%)', 'hsl(202 100% 86%)',
  'hsl(46 87% 57%)', 'hsl(330 80% 60%)', 'hsl(270 60% 58%)', 'hsl(0 75% 55%)',
];

export function getHashColor(value: string): string {
  if (!value || value === 'Unknown') return 'hsl(220 20% 55%)';
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = value.charCodeAt(i) + ((hash << 5) - hash);
  return HASH_PALETTE[Math.abs(hash) % HASH_PALETTE.length];
}
