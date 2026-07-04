import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { CharlotteLogo } from "@/components/CharlotteLogo";

export const Route = createFileRoute("/onboarding")({ component: Onboarding });

function Onboarding() {
  const { user, role, loading, refreshRole } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [organization, setOrganization] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) navigate({ to: "/auth" });
    else if (role) navigate({ to: "/" });
  }, [user, role, loading, navigate]);

  useEffect(() => {
    if (user) {
      supabase.from("profiles").select("display_name, organization").eq("id", user.id).maybeSingle().then(({ data }) => {
        if (data?.display_name) setDisplayName(data.display_name);
        if (data?.organization) setOrganization(data.organization);
      });
    }
  }, [user]);

  const submit = async () => {
    if (!user) return;
    setBusy(true);
    const { error: pErr } = await supabase
      .from("profiles")
      .upsert({ id: user.id, display_name: displayName || null, organization: organization || null });
    if (pErr) { setBusy(false); toast.error(pErr.message); return; }

    const { error: rErr } = await supabase
      .from("user_roles")
      .insert({ user_id: user.id, role: "participant" });
    // Ignore unique-violation if the row already exists
    if (rErr && !/duplicate key|unique/i.test(rErr.message)) {
      setBusy(false);
      toast.error(rErr.message);
      return;
    }

    await refreshRole();
    try {
      const { posthog } = await import("@/lib/posthog");
      posthog.capture("onboarding_completed", {
        has_display_name: Boolean(displayName),
        has_organization: Boolean(organization),
      });
    } catch {}
    setBusy(false);
    navigate({ to: "/" });
  };

  if (loading || !user) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/30 px-4 py-10">
      <CharlotteLogo className="h-28 w-28" />
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Welcome to Charlotte</CardTitle>
          <CardDescription>Tell us a bit about yourself to get started.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="dn">Display name</Label>
            <Input id="dn" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="org">Organization (optional)</Label>
            <Input id="org" value={organization} onChange={(e) => setOrganization(e.target.value)} />
          </div>
          <div className="pt-2">
            <Button onClick={submit} disabled={busy} className="w-full">Continue</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
