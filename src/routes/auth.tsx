import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CharlotteLogo } from "@/components/CharlotteLogo";
import { FluencyRadarChart } from "@/components/receipt/FluencyRadarChart";
import authBackground from "@/assets/auth-background.png";
import { redeemDemoCode } from "@/serverfn/demo-auth";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  head: () => ({
    meta: [
      { title: "Enter Demo — Charlotte Labs" },
      { name: "description", content: "Enter your access code to explore the Charlotte Labs AI fluency demo." },
      { property: "og:title", content: "Enter Demo — Charlotte Labs" },
      { property: "og:description", content: "Enter your access code to explore the Charlotte Labs AI fluency demo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

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
  const redeem = useServerFn(redeemDemoCode);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/" });
  }, [user, loading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await redeem({ data: { code } });
      if (!res.ok) {
        setError(res.error);
        setBusy(false);
        return;
      }
      const { error: otpErr } = await supabase.auth.verifyOtp({
        token_hash: res.tokenHash,
        type: "magiclink",
      });
      if (otpErr) {
        setError(otpErr.message);
        setBusy(false);
        return;
      }
      navigate({ to: "/participant/demo" });
    } catch {
      setError("Something went wrong. Please try again.");
      setBusy(false);
    }
  };

  return (
    <div
      className="relative flex min-h-screen w-full flex-col items-center justify-center gap-6 overflow-hidden bg-cover bg-center px-4 py-10"
      style={{ backgroundImage: `url(${authBackground})` }}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-white/20" />

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
        <CharlotteLogo className="h-64 w-64 sm:h-80 sm:w-80 md:h-96 md:w-96 lg:h-[28rem] lg:w-[28rem]" />
        <Card className="w-full max-w-md shadow-2xl">
          <CardHeader>
            <CardTitle>Charlotte Labs</CardTitle>
            <CardDescription>Enter your demo access code to continue.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <Label htmlFor="demo-code">Demo code</Label>
                <Input
                  id="demo-code"
                  autoFocus
                  autoComplete="one-time-code"
                  placeholder="Enter code"
                  value={code}
                  onChange={(e) => { setCode(e.target.value); setError(null); }}
                  required
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={busy || !code.trim()}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enter demo
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
