export interface TourContext {
  /** Most recent receipt with real analysis, resolved when the tour starts. */
  receiptId: string | null;
}

export interface TourStep {
  id: string;
  title: string;
  body: string;
  /** `data-tour` value of the element to spotlight. */
  target?: string;
  /** Route to navigate to before the step is shown. */
  to?: string | ((ctx: TourContext) => string | null);
  placement?: "right" | "left" | "top" | "bottom";
  /** Roadmap/concept content — badged so nobody mistakes it for shipped product. */
  preview?: boolean;
}

/**
 * Student journey only. Department View is intentionally NOT part of this
 * sequence — faculty get their own short intro (DEPARTMENT_TOUR).
 */
export const PARTICIPANT_TOUR: TourStep[] = [
  {
    id: "workspace",
    title: "Your class workspace",
    body: "Everything you see — threads, receipts, assignments — is scoped to this class. Charlotte keeps your AI work organized the way your coursework already is.",
    target: "workspace-header",
    to: "/participant",
    placement: "right",
  },
  {
    id: "home",
    title: "Your study coach",
    body: "Home surfaces what needs your attention: unverified claims, risky AI outputs, and where your AI collaboration is trending.",
    target: "home-overview",
    to: "/participant",
    placement: "bottom",
  },
  {
    id: "assignments",
    title: "Assignments, not just chats",
    body: "Your real assignments live on the left. This is what turns scattered AI chats into evidence a professor can actually read.",
    target: "assignments-column",
    to: "/participant/threads",
    placement: "right",
  },
  {
    id: "threads",
    title: "Captured AI conversations",
    body: "Every conversation you have with ChatGPT, Claude, Gemini or Perplexity is captured automatically. Map a thread to an assignment and the connection is drawn for you.",
    target: "threads-column",
    to: "/participant/threads",
    placement: "left",
  },
  {
    id: "generate",
    title: "Generate a receipt",
    body: "Once threads are mapped, one click analyzes them together and produces a receipt: what you directed, what the AI did, and what you verified.",
    target: "generate-receipt",
    to: "/participant/threads",
    placement: "bottom",
  },
  {
    id: "receipts",
    title: "Your receipts",
    body: "Each receipt is a reviewable artifact of one piece of AI-assisted work — the proof behind the grade.",
    target: "receipts-list",
    to: "/participant/receipts",
    placement: "top",
  },
  {
    id: "radar",
    title: "Eight dimensions of AI fluency",
    body: "Direction, delegation, discernment, development, ethics, efficiency, strategic agency and capital stewardship — scored from what you actually did, not what you claim.",
    target: "receipt-radar",
    to: (ctx) => (ctx.receiptId ? `/participant/receipts/${ctx.receiptId}` : "/participant/receipts"),
    placement: "left",
  },
  {
    id: "fingerprint",
    title: "Your AI fingerprint",
    body: "All of your receipts compound into one living map: every tool you touch, every project you build, and how your collaboration habits change over a term.",
    target: "fingerprint-web",
    to: "/participant/fingerprint",
    placement: "top",
  },
];

/** Short, standalone intro for a department/faculty viewer. */
export const DEPARTMENT_TOUR: TourStep[] = [
  {
    id: "dept-kpis",
    title: "The department at a glance",
    body: "Cohort size, assignment count, AI thread volume, and two composite scores: how fluently students collaborate with AI, and how exposed your assignments are.",
    target: "dept-kpis",
    placement: "bottom",
  },
  {
    id: "dept-risk",
    title: "Assignments at risk",
    body: "Which assignments AI can now complete with little student thinking. This is the redesign queue for your faculty.",
    target: "dept-risk",
    placement: "right",
  },
  {
    id: "dept-fluency",
    title: "Fluency by dimension",
    body: "Where the cohort is strong and where it is thin — the same eight dimensions students see, aggregated and anonymized.",
    target: "dept-fluency",
    placement: "left",
  },
  {
    id: "dept-tools",
    title: "Tools and verification",
    body: "Which AI tools students actually use, and how often they challenge or cross-check what the AI produced.",
    target: "dept-tools",
    placement: "left",
  },
];

/**
 * Roadmap preview. Every step is concept-only and badged "Demo · In development".
 */
export const ROADMAP_TOUR: TourStep[] = [
  {
    id: "roadmap-intro",
    title: "What's next with Charlotte",
    body: "The next few screens describe where Charlotte is heading. None of it is shipped yet — treat it as a product preview, not a live feature.",
    target: "fingerprint-web",
    to: "/participant/fingerprint",
    placement: "top",
    preview: true,
  },
  {
    id: "roadmap-portfolio",
    title: "A portable AI portfolio",
    body: "Planned: export your fingerprint as a verifiable portfolio an employer or grad program can check — receipts, verification habits and tool range in one shareable link.",
    target: "fingerprint-web",
    placement: "top",
    preview: true,
  },
  {
    id: "roadmap-coach",
    title: "Live coaching in the chat",
    body: "Planned: Charlotte nudges you inside ChatGPT or Claude while you work — flagging unverified claims and suggesting a stronger next prompt in the moment.",
    target: "fingerprint-web",
    placement: "top",
    preview: true,
  },
  {
    id: "roadmap-curriculum",
    title: "Curriculum feedback loop",
    body: "Planned: department-level signals feed straight into assignment redesign, so faculty see which tasks AI has made trivial before the term starts.",
    target: "fingerprint-web",
    placement: "top",
    preview: true,
  },
];
