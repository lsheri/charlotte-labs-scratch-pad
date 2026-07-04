export type NodeType = 'user' | 'tool' | 'deliverable' | 'receipt';
export type EdgeType = 'used_with' | 'generated_by' | 'workflow_link';
export type TimePeriod = 'session' | 'week' | 'month' | 'all';
export type ColorByMode = 'medium' | 'tool' | 'category' | 'purpose';
export type BgMode = 'dark' | 'light' | 'blueprint';

export interface WebNodeMetrics {
  interactionCount?: number;
  fluencyScore?: number;
  frequency?: number;
  sharedWorkflows?: number;
}

export interface WebNode {
  id: string;
  type: NodeType;
  label: string;
  metrics?: WebNodeMetrics;
  timestamp?: string;
  ring: 0 | 1 | 2;
  color?: string;
  metadata?: Record<string, unknown>;
}

export interface WebEdge {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
  weight: number;
  timestamps?: string[];
  metadata?: Record<string, unknown>;
}

export interface WebData {
  nodes: WebNode[];
  edges: WebEdge[];
}

export interface Workflow {
  receiptId: string;
  name: string;
  workflowType: string;
  workflowTypeLabel: string;
  tools: string[]; // lowercase tool ids
  tags: string[];
  purpose: string | null;
  createdAt?: string;
}

export interface Position { x: number; y: number; }

export interface SimulatedNode extends WebNode {
  x: number; y: number; vx: number; vy: number; targetAngle?: number;
}

export interface PhysicsConfig {
  centerForce: number;
  repulsionForce: number;
  linkForce: number;
  ringRadii: number[];
  damping: number;
  iterations: number;
}
