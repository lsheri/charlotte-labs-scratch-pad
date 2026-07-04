import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CharlotteLogo } from "@/components/CharlotteLogo";
import { FluencyRadarChart } from "@/components/receipt/FluencyRadarChart";
import authBackground from "@/assets/auth-background.png";
import { toast } from "sonner";
import { posthog } from "@/lib/posthog";

export const Route = createFileRoute("/auth")({ component: AuthPage });


const MISSION_RADAR_DIMS = [
  { label: "Your", value: 0.92 },
  { label: "AI", value: 0.98 },
  { label: "Process", value: 0.84 },
  { label: "Visible", value: 0.9 },
  { label: "Learning", value: 0.88 },
  { label: "Growth", value: 0.95 },
  { label: "Career", value: 0.82 },
  { label: "Work", value: 0.9 },
];

function AuthPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    if (!loading && user) navigate({ to: "/" });
  }, [user, loading, navigate]);

  const handleForgotPassword = async () => {
    if (!email) {
      toast.error("Enter your email above first, then tap Forgot password.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) {
      posthog.capture("password_reset_failed", { error: error.message });
      toast.error(error.message);
    } else {
      posthog.capture("password_reset_requested");
      toast.success("Check your email for a link to reset your password.");
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      posthog.capture("signin_failed", { method: "email", error: error.message });
      toast.error(error.message);
    } else {
      posthog.capture("signin_completed", { method: "email" });
      navigate({ to: "/" });
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    posthog.capture("signup_started", { method: "email" });
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { display_name: displayName || undefined },
      },
    });
    setBusy(false);
    if (error) {
      posthog.capture("signup_failed", { method: "email", error: error.message });
      toast.error(error.message);
    } else {
      posthog.capture("signup_completed", {
        method: "email",
        has_display_name: Boolean(displayName),
        requires_email_confirmation: true,
      });
      toast.success("Check your email to confirm your account.");
    }
  };

  const handleGoogle = async () => {
    setBusy(true);
    posthog.capture("signin_started", { method: "google" });
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      posthog.capture("signin_failed", { method: "google", error: String(result.error) });
      setBusy(false);
      toast.error("Google sign-in failed");
      return;
    }
    if (result.redirected) return;
    posthog.capture("signin_completed", { method: "google" });
    navigate({ to: "/" });
  };

  return (
    <div
      className="relative flex min-h-screen w-full flex-col items-center justify-center gap-6 overflow-hidden bg-cover bg-center px-4 py-10"
      style={{ backgroundImage: `url(${authBackground})` }}
    >
      {/* Soft overlay for legibility */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-white/20" />

      {/* Mission statement title */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-8 z-10 hidden -translate-x-1/2 lg:block"
      >
        <p
          className="text-center text-2xl font-semibold uppercase tracking-[0.32em] xl:text-3xl"
          style={{ color: "#0c2340", textShadow: "0 1px 2px rgba(255,255,255,0.7)" }}
        >
          Your AI process, visible in learning and at work.
        </p>
      </div>

      {/* Live radar tucked between the tree branches (left side of art) */}
      <div
        aria-hidden
        className="auth-radar-no-labels pointer-events-auto absolute z-0 hidden lg:block"
        style={{
          left: "calc(21.6% - 38px)",
          top: "calc(44% - 38px)",
          width: "clamp(562px, 40.4vw, 811px)",
          aspectRatio: "1 / 1",
          transform: "translate(-50%, -50%)",
        }}
      >
        <style>{`
          .auth-radar-no-labels .recharts-polar-angle-axis .recharts-text { display: none; }
        `}</style>
        <FluencyRadarChart dimensions={MISSION_RADAR_DIMS} />
      </div>

      {/* Hand-drawn "Show Your Work With AI" overlay on top of the radar */}
      <div
        aria-hidden
        className="pointer-events-none absolute z-[5] hidden lg:flex flex-col items-center justify-center text-center"
        style={{
          left: "calc(21.6% - 38px)",
          top: "calc(44% - 38px)",
          width: "clamp(562px, 40.4vw, 811px)",
          aspectRatio: "1 / 1",
          transform: "translate(-50%, -50%)",
          fontFamily: "'Metal Mania', serif",
          fontWeight: 400,
          color: "rgba(150, 50, 100, 0.32)",
          lineHeight: 0.9,
          mixBlendMode: "multiply",
          WebkitFontSmoothing: "none",
          MozOsxFontSmoothing: "unset",
          fontSmooth: "never" as never,
          containerType: "inline-size",
        }}
      >
        <span style={{ fontSize: "18cqw", transform: "rotate(-5deg)", display: "block" }}>Show</span>
        <span style={{ fontSize: "14cqw", transform: "rotate(3deg)", display: "block", marginTop: "-0.05em" }}>Your Work</span>
        <span style={{ fontSize: "16cqw", transform: "rotate(-2deg)", display: "block", marginTop: "0.02em" }}>With AI</span>
      </div>

      <div className="relative z-10 flex flex-col items-center gap-0 -space-y-6 sm:-space-y-10 pt-8 sm:pt-12">
        <CharlotteLogo
          className="h-64 w-64 sm:h-80 sm:w-80 md:h-96 md:w-96 lg:h-[28rem] lg:w-[28rem]"
        />
        <Card className="w-full max-w-md shadow-2xl">
          <CardHeader>
            <CardTitle>Charlotte Labs</CardTitle>
            <CardDescription>Sign in or create an account to continue.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="signin">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Sign up</TabsTrigger>
              </TabsList>
              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="space-y-3 pt-3">
                  <div>
                    <Label htmlFor="si-email">Email</Label>
                    <Input id="si-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="si-pw">Password</Label>
                    <Input id="si-pw" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>Sign in</Button>
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    disabled={busy}
                    className="block w-full text-center text-xs text-muted-foreground hover:text-foreground hover:underline disabled:opacity-50"
                  >
                    Forgot password?
                  </button>
                </form>
              </TabsContent>
              <TabsContent value="signup">
                <form onSubmit={handleSignUp} className="space-y-3 pt-3">
                  <div>
                    <Label htmlFor="su-name">Display name</Label>
                    <Input id="su-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="su-email">Email</Label>
                    <Input id="su-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="su-pw">Password</Label>
                    <Input id="su-pw" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>Create account</Button>
                </form>
              </TabsContent>
            </Tabs>

            <div className="my-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">or</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <Button variant="outline" className="w-full" onClick={handleGoogle} disabled={busy}>
              Continue with Google
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
