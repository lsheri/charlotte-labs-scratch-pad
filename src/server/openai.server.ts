// AI provider helper.
//
// PRIMARY: Lovable AI Gateway (Gemini family, 1M context window). Used for
//   all fluency scoring, recommendations, summaries, and routing calls.
// FALLBACK: OpenAI (gpt-4o family). Only called when the primary 429s,
//   5xxs, times out, or returns invalid JSON.
//
// Why this order: Gemini's 1M token window fits any realistic transcript in
// a single call, eliminating the chunking workarounds we used to need when
// OpenAI's 128K gpt-4o window forced map-reduce on long receipts.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const DEFAULT_RETRY_DELAYS = [1500];
// 45s default. Gemini 2.5 Pro on a 300-turn transcript can take 30-60s.
// Per-call timeouts can override this via opts.timeoutMs.
const DEFAULT_TIMEOUT_MS = 45_000;

async function logProviderEvent(row: {
  label: string;
  provider: string;
  model?: string | null;
  status: "ok" | "fallback" | "error" | "content_filter";
  http_status?: number | null;
  attempts?: number | null;
  latency_ms?: number | null;
  error_message?: string | null;
  receipt_id?: string | null;
  participant_id?: string | null;
}) {
  try {
    await supabaseAdmin.from("ai_provider_events" as any).insert(row as any);
  } catch (e) {
    console.error("[ai_provider_events] insert failed", e);
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/**
 * Low-level retry wrapper. Retries on 408/425/429/5xx + network errors with
 * jittered backoff and a per-attempt AbortController timeout.
 */
export async function fetchOpenAIWithRetry(
  url: string,
  init: RequestInit,
  label = "openai",
  opts: { timeoutMs?: number; retryDelaysMs?: number[] } = {},
): Promise<Response> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retryDelays = opts.retryDelaysMs ?? DEFAULT_RETRY_DELAYS;
  let last: Response | null = null;
  let lastErr: unknown = null;
  for (let i = 0; i <= retryDelays.length; i++) {
    try {
      const res = await fetchWithTimeout(url, init, timeoutMs);
      if (res.ok || !RETRYABLE_STATUS.has(res.status)) return res;
      last = res;
      if (i === retryDelays.length) {
        console.error(`[${label}] exhausted retries status=${res.status}`);
        return res;
      }
      const d = retryDelays[i] + Math.floor((Math.random() - 0.5) * 500);
      console.warn(`[${label}] retry ${i + 1} after ${d}ms (status=${res.status})`);
      await new Promise(r => setTimeout(r, Math.max(0, d)));
    } catch (e) {
      lastErr = e;
      if (i === retryDelays.length) {
        console.error(`[${label}] exhausted retries (network/timeout)`, e);
        throw e;
      }
      const d = retryDelays[i] + Math.floor((Math.random() - 0.5) * 500);
      console.warn(`[${label}] retry ${i + 1} after ${d}ms (network error: ${(e as Error)?.message})`);
      await new Promise(r => setTimeout(r, Math.max(0, d)));
    }
  }
  if (last) return last;
  throw lastErr ?? new Error(`[${label}] no response`);
}

// ---- High-level chat completion (Gemini primary, OpenAI fallback) ----

// Default models — all routed through Lovable AI Gateway. Each has a 1M
// context window, which removes the need for chunking long transcripts.
// SCORING_MODEL goes to the most capable model for the final fluency call;
// CHUNK_SCORING_MODEL / SUMMARY_MODEL / ROUTING_MODEL use the fast Flash
// variant for short, cheap calls.
export const SCORING_MODEL = "google/gemini-2.5-pro";
export const CHUNK_SCORING_MODEL = "google/gemini-3-flash-preview";
export const ROUTING_MODEL = "google/gemini-3-flash-preview";
export const SUMMARY_MODEL = "google/gemini-3-flash-preview";

// Map Gemini model id → OpenAI fallback model. Only used when the primary
// (Lovable AI Gateway) is unreachable / 5xxs / returns invalid JSON.
const OPENAI_FALLBACK_MAP: Record<string, string> = {
  "google/gemini-2.5-pro": "gpt-4o",
  "google/gemini-3-flash-preview": "gpt-4o-mini",
  "google/gemini-3.1-flash-lite-preview": "gpt-4o-mini",
  "google/gemini-2.5-flash": "gpt-4o-mini",
  "google/gemini-2.5-flash-lite": "gpt-4o-mini",
};

function openaiFallbackFor(model: string): string {
  return OPENAI_FALLBACK_MAP[model] ?? "gpt-4o-mini";
}

interface ChatCompletionOptions {
  label: string;
  body: Record<string, any>; // OpenAI-compatible chat-completions body (must include `model`)
  timeoutMs?: number;
  receiptId?: string | null;
  participantId?: string | null;
  /**
   * Optional payload validator. Called with the parsed JSON body after a 200
   * response. Return false to treat the response as a failure and fall
   * through to the OpenAI fallback. Use this when a 200 OK doesn't actually
   * mean a usable response — e.g. empty content, or strict JSON-mode content
   * that didn't parse.
   */
  validate?: (data: any) => boolean;
}

interface ChatCompletionResult {
  ok: boolean;
  data?: any;
  provider: "lovable" | "openai" | "none";
  httpStatus?: number;
  errorMessage?: string;
  contentFilter?: boolean;
}

/**
 * Calls Lovable AI Gateway (Gemini) as the primary model. If the call fails
 * unrecoverably (5xx, timeout, network, content filter, or fails validate()),
 * retries the same logical request against OpenAI with the mapped fallback
 * model. Logs every fallback / error to `ai_provider_events`.
 *
 * Content-filter rejections ARE retried on the OpenAI fallback (different
 * providers have different filter behavior) — but only once.
 */
export async function chatCompletion(
  opts: ChatCompletionOptions,
): Promise<ChatCompletionResult> {
  const { label, body, timeoutMs, receiptId = null, participantId = null, validate } = opts;
  const lovableKey = process.env.LOVABLE_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const model: string = body.model;
  const started = Date.now();

  // Gemini doesn't honor `reasoning_effort`. Strip it from the primary body.
  const primaryBody = { ...body };
  delete (primaryBody as any).reasoning_effort;

  // --- PRIMARY: Lovable AI Gateway (Gemini) ---
  if (lovableKey) {
    try {
      const res = await fetchOpenAIWithRetry(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${lovableKey}`,
            "Lovable-API-Key": lovableKey,
            "X-Lovable-AIG-SDK": "vercel-ai-sdk",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(primaryBody),
        },
        label,
        { timeoutMs },
      );
      if (res.ok) {
        try {
          const data = await res.json();
          const fr = data?.choices?.[0]?.finish_reason;
          if (fr === "content_filter") {
            await logProviderEvent({
              label, provider: "lovable", model, status: "content_filter",
              http_status: res.status, latency_ms: Date.now() - started,
              error_message: "finish_reason=content_filter",
              receipt_id: receiptId, participant_id: participantId,
            });
            // Fall through to OpenAI fallback below.
          } else if (validate && !validate(data)) {
            await logProviderEvent({
              label, provider: "lovable", model, status: "error",
              http_status: res.status, latency_ms: Date.now() - started,
              error_message: "validate() rejected response (empty/unparseable payload)",
              receipt_id: receiptId, participant_id: participantId,
            });
            // Fall through to OpenAI fallback below.
          } else {
            return { ok: true, provider: "lovable", data, httpStatus: res.status };
          }
        } catch (e) {
          console.error(`[${label}] lovable response not JSON`, e);
          // Fall through.
        }
      } else {
        const text = await res.text().catch(() => "");
        console.error(`[${label}] lovable non-ok status=${res.status} body=${text.slice(0, 500)}`);

        // 402 = workspace out of credits. Don't bother falling back — surface clearly.
        if (res.status === 402) {
          await logProviderEvent({
            label, provider: "lovable", model, status: "error",
            http_status: res.status, latency_ms: Date.now() - started,
            error_message: `Lovable AI Gateway credits exhausted: ${text.slice(0, 500)}`,
            receipt_id: receiptId, participant_id: participantId,
          });
          // Still fall through to OpenAI fallback — it might be configured.
        }
        // 400 means we sent a malformed request; fallback won't help. Surface caller bug.
        if (res.status === 400) {
          await logProviderEvent({
            label, provider: "lovable", model, status: "error",
            http_status: res.status, latency_ms: Date.now() - started,
            error_message: text.slice(0, 1000),
            receipt_id: receiptId, participant_id: participantId,
          });
          return { ok: false, provider: "lovable", httpStatus: res.status, errorMessage: text.slice(0, 1000) };
        }
      }
    } catch (e: any) {
      console.error(`[${label}] lovable threw`, e?.message ?? e);
    }
  } else {
    console.warn(`[${label}] LOVABLE_API_KEY missing — skipping primary`);
  }

  // --- FALLBACK: OpenAI ---
  if (!openaiKey) {
    await logProviderEvent({
      label, provider: "lovable", model, status: "error",
      latency_ms: Date.now() - started,
      error_message: "Lovable failed and OPENAI_API_KEY not configured",
      receipt_id: receiptId, participant_id: participantId,
    });
    return { ok: false, provider: "none", errorMessage: "Primary AI provider failed and no fallback configured" };
  }

  const fallbackModel = openaiFallbackFor(model);
  const fallbackBody = { ...body, model: fallbackModel };
  // OpenAI gpt-4o family doesn't accept reasoning_effort either.
  delete (fallbackBody as any).reasoning_effort;

  try {
    const res = await fetchOpenAIWithRetry(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(fallbackBody),
      },
      `${label}-fallback`,
      { timeoutMs },
    );
    if (res.ok) {
      try {
        const data = await res.json();
        await logProviderEvent({
          label, provider: "openai", model: fallbackModel, status: "fallback",
          http_status: res.status, latency_ms: Date.now() - started,
          error_message: `Lovable failed; served via OpenAI (${fallbackModel})`,
          receipt_id: receiptId, participant_id: participantId,
        });
        return { ok: true, provider: "openai", data, httpStatus: res.status };
      } catch (e) {
        const msg = `openai response not JSON: ${(e as Error)?.message}`;
        await logProviderEvent({
          label, provider: "openai", model: fallbackModel, status: "error",
          http_status: res.status, latency_ms: Date.now() - started,
          error_message: msg, receipt_id: receiptId, participant_id: participantId,
        });
        return { ok: false, provider: "openai", httpStatus: res.status, errorMessage: msg };
      }
    } else {
      const text = await res.text().catch(() => "");
      await logProviderEvent({
        label, provider: "openai", model: fallbackModel, status: "error",
        http_status: res.status, latency_ms: Date.now() - started,
        error_message: text.slice(0, 1000),
        receipt_id: receiptId, participant_id: participantId,
      });
      return { ok: false, provider: "openai", httpStatus: res.status, errorMessage: text.slice(0, 1000) };
    }
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    await logProviderEvent({
      label, provider: "openai", model: fallbackModel, status: "error",
      latency_ms: Date.now() - started, error_message: msg,
      receipt_id: receiptId, participant_id: participantId,
    });
    return { ok: false, provider: "openai", errorMessage: msg };
  }
}

