import { useState } from "react";
import confetti from "canvas-confetti";
import { Linkedin, Bug, Users as UsersIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { TEAM } from "./teamData";
import { toast } from "sonner";

const OUTREACH_REASONS = ["Share feedback", "Volunteer for UX interview", "General question"];

interface Props {
  initialTab?: "team" | "bug";
  onClose?: () => void;
}

function initials(name: string) {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export function TeamOutreachPanel({ initialTab = "team", onClose }: Props) {
  const { user } = useAuth();
  const defaultEmail = user?.email ?? "";
  const defaultName = (user?.user_metadata?.display_name as string | undefined) ?? "";

  const [tab, setTab] = useState<"team" | "bug">(initialTab);

  // Outreach form state
  const [oName, setOName] = useState(defaultName);
  const [oEmail, setOEmail] = useState(defaultEmail);
  const [oReason, setOReason] = useState(OUTREACH_REASONS[0]);
  const [oMessage, setOMessage] = useState("");
  const [oBusy, setOBusy] = useState(false);
  const [oDone, setODone] = useState(false);

  // Bug form state
  const [bName, setBName] = useState(defaultName);
  const [bEmail, setBEmail] = useState(defaultEmail);
  const [bMessage, setBMessage] = useState("");
  const [bBusy, setBBusy] = useState(false);
  const [bDone, setBDone] = useState(false);

  const ctx = typeof window !== "undefined"
    ? {
      page_url: window.location.href,
      referrer: document.referrer || null,
      user_agent: navigator.userAgent,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
    }
    : { page_url: null, referrer: null, user_agent: null, viewport: null };

  const submitOutreach = async (e: React.FormEvent) => {
    e.preventDefault();
    if (oMessage.length > 300) return;
    setOBusy(true);
    try {
      const res = await fetch("/api/public/team-outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "outreach",
          name: oName, email: oEmail, reason: oReason, message: oMessage || null,
          page_url: ctx.page_url, referrer: ctx.referrer,
          user_agent: ctx.user_agent, viewport: ctx.viewport,
          user_id: user?.id ?? null,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      console.log("[charlotte_outreach] submitted", { kind: "outreach", reason: oReason });
      setODone(true);
      confetti({ particleCount: 80, spread: 70, origin: { y: 0.3 } });
    } catch (err) {
      console.error(err);
      toast.error("Couldn't send — please try again.");
    } finally {
      setOBusy(false);
    }
  };

  const submitBug = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bMessage.trim()) return;
    setBBusy(true);
    try {
      const res = await fetch("/api/public/team-outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "bug",
          name: bName || "Anonymous", email: bEmail || "anonymous@charlotte-labs.com",
          reason: "Bug report",
          message: bMessage,
          page_url: ctx.page_url, referrer: ctx.referrer,
          user_agent: ctx.user_agent, viewport: ctx.viewport,
          user_id: user?.id ?? null,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      console.log("[charlotte_outreach] submitted", { kind: "bug" });
      setBDone(true);
      confetti({ particleCount: 60, spread: 60, origin: { y: 0.3 } });
    } catch (err) {
      console.error(err);
      toast.error("Couldn't send — please try again.");
    } finally {
      setBBusy(false);
    }
  };

  return (
    <div className="w-full max-w-2xl space-y-5 p-1">
      <Tabs value={tab} onValueChange={(v) => setTab(v as "team" | "bug")}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="team"><UsersIcon className="mr-2 h-4 w-4" />Team & feedback</TabsTrigger>
          <TabsTrigger value="bug"><Bug className="mr-2 h-4 w-4" />Report a bug</TabsTrigger>
        </TabsList>

        <TabsContent value="team" className="space-y-5 pt-4">
          <div>
            <h3 className="mb-1 text-sm font-semibold">Team</h3>
            <p className="text-xs text-muted-foreground">
              Please reach out for anything and everything — we'd love to hear from you.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {TEAM.map((m) => (
              <a
                key={m.name}
                href={m.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${m.name} on LinkedIn`}
                className="flex items-center gap-3 rounded-md border bg-card p-3 transition hover:border-brand-mint hover:bg-accent"
              >
                <Avatar className="h-10 w-10">
                  <AvatarImage src={m.photo} alt={m.name} />
                  <AvatarFallback>{initials(m.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1 truncate text-sm font-semibold">{m.name}</div>
                <Linkedin className="h-4 w-4 text-muted-foreground" />
              </a>
            ))}
          </div>

          {oDone ? (
            <div className="rounded-md border bg-card p-4 text-center text-sm">
              <p className="font-medium">You're in! We'll be in touch soon. 🙌</p>
              <Button variant="ghost" size="sm" className="mt-2" onClick={onClose}>Close</Button>
            </div>
          ) : (
            <form onSubmit={submitOutreach} className="space-y-3 rounded-md border bg-card p-4">
              <p className="text-sm font-medium">Got feedback or want to volunteer for a 15-min UX interview?</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="o-name" className="text-xs">Name</Label>
                  <Input id="o-name" value={oName} onChange={(e) => setOName(e.target.value)} required maxLength={120} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="o-email" className="text-xs">Email</Label>
                  <Input id="o-email" type="email" value={oEmail} onChange={(e) => setOEmail(e.target.value)} required maxLength={255} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Reason</Label>
                <Select value={oReason} onValueChange={setOReason}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {OUTREACH_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="o-msg" className="text-xs">Message (optional)</Label>
                <Textarea
                  id="o-msg"
                  value={oMessage}
                  onChange={(e) => setOMessage(e.target.value.slice(0, 300))}
                  rows={3}
                  placeholder="Anything you'd like us to know…"
                />
                <div className="text-right text-[11px] text-muted-foreground">{oMessage.length}/300</div>
              </div>
              <Button
                type="submit"
                disabled={oBusy}
                className="w-full bg-brand-mint text-brand-navy hover:bg-brand-mint/90"
              >
                {oBusy ? "Sending…" : "Send to the team →"}
              </Button>
            </form>
          )}
        </TabsContent>

        <TabsContent value="bug" className="space-y-4 pt-4">
          {bDone ? (
            <div className="rounded-md border bg-card p-4 text-center text-sm">
              <p className="font-medium">Bug logged. Thanks — we'll dig in. 🛠️</p>
              <Button variant="ghost" size="sm" className="mt-2" onClick={onClose}>Close</Button>
            </div>
          ) : (
            <form onSubmit={submitBug} className="space-y-3 rounded-md border bg-card p-4">
              <p className="text-sm font-medium">What went wrong?</p>
              <p className="text-xs text-muted-foreground">
                We'll auto-attach the page you're on, your browser, and your viewport so we can reproduce it.
              </p>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="b-name" className="text-xs">Name (optional)</Label>
                  <Input id="b-name" value={bName} onChange={(e) => setBName(e.target.value)} maxLength={120} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="b-email" className="text-xs">Email (optional, for follow-up)</Label>
                  <Input id="b-email" type="email" value={bEmail} onChange={(e) => setBEmail(e.target.value)} maxLength={255} />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="b-msg" className="text-xs">Describe the bug *</Label>
                <Textarea
                  id="b-msg"
                  value={bMessage}
                  onChange={(e) => setBMessage(e.target.value.slice(0, 2000))}
                  rows={5}
                  required
                  placeholder="What did you do? What did you expect? What happened instead?"
                />
                <div className="text-right text-[11px] text-muted-foreground">{bMessage.length}/2000</div>
              </div>

              <div className="rounded-md bg-muted/50 p-3 text-[11px] text-muted-foreground">
                <div className="mb-1 font-medium text-foreground">Auto-captured</div>
                <div className="truncate">Page: {ctx.page_url}</div>
                <div className="truncate">Viewport: {ctx.viewport}</div>
                <div className="truncate">Browser: {ctx.user_agent}</div>
              </div>

              <Button
                type="submit"
                disabled={bBusy || !bMessage.trim()}
                className="w-full bg-brand-mint text-brand-navy hover:bg-brand-mint/90"
              >
                {bBusy ? "Sending…" : "Send bug report →"}
              </Button>
            </form>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
