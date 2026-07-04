import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CharlotteLogo } from "@/components/CharlotteLogo";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { posthog } from "@/lib/posthog";

export const Route = createFileRoute("/reset-password")({ component: ResetPasswordPage });

/**
 * Public route. Supabase email recovery links land here with a `type=recovery`
 * fragment that the client SDK consumes automatically and emits a
 * PASSWORD_RECOVERY auth event. We then let the user set a new password via
 * `updateUser({ password })`. Without this page, the recovery link would
 * silently sign the user in without ever letting them reset.
 */
function ResetPasswordPage() {
  const navigate = useNavigate();
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    // Subscribe FIRST so we don't miss the PASSWORD_RECOVERY event the SDK
    // emits while parsing the URL hash on mount.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setRecoveryReady(true);
    });

    // Fallback for direct visits / refreshes after the recovery hash was
    // consumed: if there's already a session, allow the reset form too.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setRecoveryReady(true);
    });

    // If the URL contains an explicit error from Supabase (expired link, etc.)
    if (typeof window !== "undefined" && window.location.hash) {
      const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const errDesc = params.get("error_description");
      if (errDesc) setLinkError(errDesc);
    }

    return () => sub.subscription.unsubscribe();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords don't match.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      posthog.capture("password_reset_failed", { stage: "update", error: error.message });
      toast.error(error.message);
      return;
    }
    posthog.capture("password_reset_completed");
    toast.success("Password updated. Welcome back.");
    navigate({ to: "/" });
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/30 px-4 py-10">
      <CharlotteLogo className="h-24 w-24" />
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Reset your password</CardTitle>
          <CardDescription>
            Choose a new password for your Charlotte Labs account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {linkError ? (
            <div className="space-y-3 text-sm">
              <p className="text-destructive">{linkError}</p>
              <p className="text-muted-foreground">
                Reset links expire after a short window. Request a new one from the sign-in page.
              </p>
              <Button variant="outline" className="w-full" onClick={() => navigate({ to: "/auth" })}>
                Back to sign in
              </Button>
            </div>
          ) : !recoveryReady ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Verifying reset link…
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-3">
              <div>
                <Label htmlFor="rp-pw">New password</Label>
                <Input
                  id="rp-pw"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div>
                <Label htmlFor="rp-pw2">Confirm new password</Label>
                <Input
                  id="rp-pw2"
                  type="password"
                  required
                  minLength={6}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Updating…" : "Update password"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
