import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

const DEFAULT_CONSENT =
  "Thanks for joining this Charlotte Labs research session. While this session is active, the Charlotte browser extension will record the prompts you send to AI tools (ChatGPT, Claude, Copilot, Lovable) and a short summary of each AI response. We use this to study how people work with AI — your data is only visible to the lead researcher and only within this session. You can pause the extension or delete your data at any time.";

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function genCode() {
  let out = "";
  for (let i = 0; i < 6; i++) out += CHARS[Math.floor(Math.random() * CHARS.length)];
  return out;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}

export function CreateSessionDialog({ open, onOpenChange, onCreated }: Props) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [consentText, setConsentText] = useState(DEFAULT_CONSENT);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);

    // Try a few times if join_code collides
    let lastErr: string | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const join_code = genCode();
      const { error } = await supabase.from("research_sessions").insert({
        researcher_id: user.id,
        name: name.trim(),
        description: description.trim() || null,
        consent_text: consentText,
        join_code,
        status: "active",
        starts_at: new Date().toISOString(),
      });
      if (!error) {
        toast.success(`Session "${name}" created — code ${join_code}`);
        setName(""); setDescription(""); setConsentText(DEFAULT_CONSENT);
        onOpenChange(false);
        onCreated();
        setBusy(false);
        return;
      }
      lastErr = error.message;
      if (!/join_code/i.test(error.message)) break;
    }
    setBusy(false);
    toast.error(lastErr ?? "Failed to create session");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New research session</DialogTitle>
          <DialogDescription>Participants will join with the auto-generated code.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Spring 2026 cohort" />
          </div>
          <div>
            <Label htmlFor="desc">Description (optional)</Label>
            <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div>
            <Label htmlFor="consent">Consent text</Label>
            <Textarea id="consent" required value={consentText} onChange={(e) => setConsentText(e.target.value)} rows={6} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy || !name.trim()}>Create session</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
