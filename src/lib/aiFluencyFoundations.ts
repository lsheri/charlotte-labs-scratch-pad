// Static fallback recommendations used when a receipt has too little
// evidence to score meaningfully. Aligned to Anthropic's 4D framework
// (Direction, Delegation, Discernment, Diligence).

export interface FoundationCard {
  dimension: "Direction" | "Delegation" | "Discernment" | "Diligence";
  title: string;
  body: string;
  prompt_template: string;
}

export const AI_FLUENCY_FOUNDATIONS: FoundationCard[] = [
  {
    dimension: "Direction",
    title: "State the goal, audience, and constraints up front",
    body: "Strong AI sessions start with clear direction. Before asking for help, name what you're trying to accomplish, who it's for, and any constraints (time, format, length, tone).",
    prompt_template:
      "I'm working on [task]. The audience is [who]. The output should be [format/length]. Constraints: [time, tone, must-include, must-avoid]. Before you start, ask me up to 3 clarifying questions if anything is ambiguous.",
  },
  {
    dimension: "Delegation",
    title: "Hand off well-scoped pieces, not the whole problem",
    body: "Delegation works best when you decide what the AI is good at versus what you should keep. Break the work into pieces and explicitly assign each one.",
    prompt_template:
      "Here's the full problem: [context]. I want YOU to do [piece A] and [piece B]. I will keep [piece C] because [reason]. Do A and B only — don't attempt C.",
  },
  {
    dimension: "Discernment",
    title: "Pressure-test the answer before you use it",
    body: "Don't accept the first response as truth. Ask the model to surface assumptions, edge cases, and weaknesses in its own answer.",
    prompt_template:
      "Review your previous answer. List: (1) the strongest 2 claims and the evidence behind them, (2) the weakest 2 claims and what would break them, (3) one assumption you made that I should verify.",
  },
  {
    dimension: "Diligence",
    title: "Close the loop — verify, attribute, and reflect",
    body: "Fluent AI use ends with verification. Decide what to keep, what to fact-check, and what you learned from the workflow.",
    prompt_template:
      "Summarize what we produced together. Mark each claim as: [verified by me], [needs verification], or [AI-generated, low-stakes]. Then suggest one thing I could do differently next time to get a better outcome faster.",
  },
];
