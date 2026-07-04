export const PENDING_RECEIPT_JOB_KEY = "pending_receipt_job_v1";

export interface PendingReceiptJob {
  jobId: string;
  startedAt: number;
}

export function setPendingReceiptJob(job: PendingReceiptJob) {
  if (typeof window === "undefined") return;
  try { window.sessionStorage.setItem(PENDING_RECEIPT_JOB_KEY, JSON.stringify(job)); } catch {}
}

export function getPendingReceiptJob(): PendingReceiptJob | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PENDING_RECEIPT_JOB_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PendingReceiptJob;
  } catch { return null; }
}

export function clearPendingReceiptJob() {
  if (typeof window === "undefined") return;
  try { window.sessionStorage.removeItem(PENDING_RECEIPT_JOB_KEY); } catch {}
}
