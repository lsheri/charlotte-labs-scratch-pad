// Deterministic left-to-right tidy tree layout.
// Simple Reingold-Tilford variant: leaves get sequential y-slots, parents
// take the midpoint of their children. Suitable for trees up to a few hundred
// nodes without subtree collision handling.

import type { ContextMapNode } from "./types";

export interface LaidOutNode {
  node: ContextMapNode;
  x: number;
  y: number;
  depth: number;
  parentId: string | null;
  childIds: string[];
}

export interface LaidOutTree {
  nodes: LaidOutNode[];
  byId: Map<string, LaidOutNode>;
  width: number;
  height: number;
  rootIds: string[];
}

export interface LayoutOptions {
  xSpacing?: number;
  ySpacing?: number;
  paddingX?: number;
  paddingY?: number;
}

/**
 * Lay out ContextMap nodes as a left-to-right tree using `parentTurnIndex`.
 * Nodes without a resolvable parent become root nodes (rendered as their own
 * subtree).
 */
export function layoutMindMap(
  nodes: ContextMapNode[],
  opts: LayoutOptions = {},
): LaidOutTree {
  const xSpacing = opts.xSpacing ?? 230;
  const ySpacing = opts.ySpacing ?? 96;
  const paddingX = opts.paddingX ?? 24;
  const paddingY = opts.paddingY ?? 24;

  // Only nodes with a numeric turnIndex participate.
  const withTurn = nodes.filter(
    (n): n is ContextMapNode & { turnIndex: number } =>
      typeof n.turnIndex === "number",
  );
  const byTurn = new Map<number, ContextMapNode>();
  for (const n of withTurn) byTurn.set(n.turnIndex, n);

  // Build parent -> children map.
  const childrenByTurn = new Map<number, number[]>();
  const rootTurnIndices: number[] = [];
  for (const n of withTurn) {
    const parent =
      typeof n.parentTurnIndex === "number" && byTurn.has(n.parentTurnIndex)
        ? n.parentTurnIndex
        : null;
    if (parent === null) {
      rootTurnIndices.push(n.turnIndex);
    } else {
      const list = childrenByTurn.get(parent) ?? [];
      list.push(n.turnIndex);
      childrenByTurn.set(parent, list);
    }
  }
  // Sort roots and children by turn index for stable layout.
  rootTurnIndices.sort((a, b) => a - b);
  for (const [k, v] of childrenByTurn) {
    v.sort((a, b) => a - b);
    childrenByTurn.set(k, v);
  }

  const laidOut = new Map<number, LaidOutNode>();
  let nextLeafY = 0;

  function walk(turnIndex: number, depth: number, parentId: string | null): LaidOutNode {
    const node = byTurn.get(turnIndex)!;
    const childTurns = childrenByTurn.get(turnIndex) ?? [];
    let y: number;
    let childIds: string[] = [];
    if (childTurns.length === 0) {
      y = nextLeafY * ySpacing;
      nextLeafY++;
    } else {
      const laidChildren = childTurns.map((ct) => walk(ct, depth + 1, node.id));
      childIds = laidChildren.map((c) => c.node.id);
      const first = laidChildren[0].y;
      const last = laidChildren[laidChildren.length - 1].y;
      y = (first + last) / 2;
    }
    const laid: LaidOutNode = {
      node,
      x: depth * xSpacing,
      y,
      depth,
      parentId,
      childIds,
    };
    laidOut.set(turnIndex, laid);
    return laid;
  }

  for (const rt of rootTurnIndices) walk(rt, 0, null);

  const all = Array.from(laidOut.values());
  const maxX = all.reduce((m, n) => Math.max(m, n.x), 0);
  const maxY = all.reduce((m, n) => Math.max(m, n.y), 0);
  const byId = new Map<string, LaidOutNode>();
  for (const l of all) byId.set(l.node.id, l);

  const rootIds = rootTurnIndices
    .map((t) => laidOut.get(t)?.node.id)
    .filter((id): id is string => Boolean(id));

  return {
    nodes: all,
    byId,
    rootIds,
    width: maxX + paddingX * 2,
    height: maxY + paddingY * 2,
  };
}
