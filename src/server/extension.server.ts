import { createHash } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function getActiveTokenFor(userId: string) {
  const { data } = await supabaseAdmin
    .from("extension_tokens")
    .select("created_at, expires_at")
    .eq("participant_id", userId)
    .eq("revoked", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return { exists: true, created_at: data.created_at, expires_at: data.expires_at };
}

export async function revokeAllTokensFor(userId: string) {
  await supabaseAdmin
    .from("extension_tokens")
    .update({ revoked: true })
    .eq("participant_id", userId)
    .eq("revoked", false);
}

export async function issueTokenFor(userId: string) {
  await revokeAllTokensFor(userId);
  const newToken = `charlotte_ext_${crypto.randomUUID().replace(/-/g, "")}`;
  const tokenHash = hashToken(newToken);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 90);
  const { data, error } = await supabaseAdmin
    .from("extension_tokens")
    .insert({
      participant_id: userId,
      token: tokenHash,
      expires_at: expiresAt.toISOString(),
      revoked: false,
    })
    .select("created_at")
    .single();
  if (error) throw new Error(error.message);
  return { token: newToken, created_at: data.created_at };
}

/**
 * Computes overall extension health for the participant sidebar / banner.
 *
 * status:
 *   green  – token active, last capture < 24h
 *   amber  – active but stale (24–72h) OR expires within 14 days
 *   red    – missing/revoked/expired OR no capture > 72h while in an active session
 *   unknown – brand-new account, no token ever issued
 */
export async function getExtensionHealthFor(userId: string) {
  const now = Date.now();

  // 1. Token state
  const { data: token } = await supabaseAdmin
    .from("extension_tokens")
    .select("created_at, expires_at, revoked")
    .eq("participant_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const expiresAt = token?.expires_at ?? null;
  const expiresMs = expiresAt ? new Date(expiresAt).getTime() : null;
  const daysUntilExpiry =
    expiresMs != null ? Math.floor((expiresMs - now) / 86_400_000) : null;
  const tokenActive = !!token && !token.revoked && (expiresMs ?? 0) > now;

  // 2. Last capture
  const { data: lastCap } = await supabaseAdmin
    .from("chat_threads")
    .select("last_captured_at")
    .eq("participant_id", userId)
    .order("last_captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastCaptureAt = lastCap?.last_captured_at ?? null;
  const hoursSinceLastCapture = lastCaptureAt
    ? Math.floor((now - new Date(lastCaptureAt).getTime()) / 3_600_000)
    : null;

  // 3. Status
  let status: "green" | "amber" | "red" | "unknown" = "unknown";
  let message = "";

  if (!token) {
    status = "unknown";
    message = "Issue an extension token to start capturing AI conversations.";
  } else if (token.revoked) {
    status = "red";
    message = "Your extension token was revoked. Issue a new one and paste it into the extension.";
  } else if (expiresMs != null && expiresMs <= now) {
    status = "red";
    message = "Your extension token expired. Issue a new one to keep capturing.";
  } else if (hoursSinceLastCapture == null) {
    status = "amber";
    message = "Token active, but we haven't received any captures yet. Make sure the extension is installed and signed in.";
  } else if (hoursSinceLastCapture > 72) {
    status = "red";
    message = `No captures in ${Math.floor(hoursSinceLastCapture / 24)} days. The extension may be disabled or using an old token.`;
  } else if (hoursSinceLastCapture > 24) {
    status = "amber";
    message = `Last capture was ${hoursSinceLastCapture} hours ago. Tap the extension icon to confirm it's still connected.`;
  } else if (daysUntilExpiry != null && daysUntilExpiry <= 14) {
    status = "amber";
    message = `Your token expires in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? "" : "s"}. Rotate it before it lapses.`;
  } else {
    status = "green";
    message = "Extension healthy.";
  }

  return {
    status,
    message,
    tokenActive,
    expiresAt,
    daysUntilExpiry,
    lastCaptureAt,
    hoursSinceLastCapture,
  };
}
