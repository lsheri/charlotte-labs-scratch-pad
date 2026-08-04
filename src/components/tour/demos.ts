import type { FlowId } from "./TourProvider";

export interface DemoDef {
  id: Extract<FlowId, "participant" | "receipt" | "manual" | "department">;
  label: string;
  shortLabel: string;
  blurb: string;
  /** Where the demo begins, shown on the card. */
  startsOn: string;
}

/** The four guided demos, in the order a first-time visitor should watch them. */
export const DEMOS: DemoDef[] = [
  {
    id: "participant",
    label: "Student Journey",
    shortLabel: "Student",
    blurb:
      "The whole student experience end to end: a class workspace, captured AI conversations, assignments, receipts, the 8-dimension fluency radar, and the fingerprint that builds up over a term.",
    startsOn: "Workspace home",
  },
  {
    id: "receipt",
    label: "Receipt Creation",
    shortLabel: "Receipt",
    blurb:
      "How a receipt actually gets made: select the threads that belong together, name the work, say what you were studying, and choose which analyses Charlotte runs — Academic Fluency, Verification & Risk, Study Gaps.",
    startsOn: "Threads",
  },
  {
    id: "manual",
    label: "Manual Upload",
    shortLabel: "Upload",
    blurb:
      "Adding a conversation by hand when the browser extension can't reach it — phone chats, unsupported tools — including how the transcript is parsed and how you correct who said what.",
    startsOn: "Add thread manually",
  },
  {
    id: "department",
    label: "Department View",
    shortLabel: "Department",
    blurb:
      "What a department chair or dean sees: cohort fluency, which assignments AI can already complete, tool usage, and verification habits — anonymized by default.",
    startsOn: "Department dashboard",
  },
];
