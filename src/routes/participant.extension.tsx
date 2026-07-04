import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Copy, KeyRound, RefreshCw, Trash2, Download, Target, AlertTriangle, Clock } from "lucide-react";
import { toast } from "sonner";
import { getExtensionToken, issueExtensionToken, revokeExtensionToken } from "@/serverfn/extension";
import { getCaptureTarget } from "@/serverfn/participant";

export const Route = createFileRoute("/participant/extension")({ component: ExtensionPage });

function ExtensionPage() {
  const getFn = useServerFn(getExtensionToken);
  const issueFn = useServerFn(issueExtensionToken);
  const revokeFn = useServerFn(revokeExtensionToken);
  const targetFn = useServerFn(getCaptureTarget);
  const [token, setToken] = useState<string | null>(null);
  const [hasActive, setHasActive] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [target, setTarget] = useState<{ name: string; joinCode: string; isPersonal: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const [r, t] = await Promise.all([getFn(), targetFn().catch(() => ({ target: null }))]);
      setHasActive(!!r.isActive);
      setExpiresAt(r.expiresAt);
      setTarget((t as any)?.target ?? null);
    }
    catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);

  const doIssue = async () => {
    setBusy(true);
    try {
      const r = await issueFn();
      setToken(r.token);
      setHasActive(true);
      await refresh();
      toast.success("New token issued — copy it now, it won't be shown again");
    }
    catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); setConfirmOpen(false); }
  };
  const issue = () => { if (hasActive) setConfirmOpen(true); else doIssue(); };

  const revoke = async () => {
    setBusy(true);
    try { await revokeFn(); setToken(null); setHasActive(false); setExpiresAt(null); toast.success("Token revoked"); }
    catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };
  const copy = () => { if (token) { navigator.clipboard.writeText(token); toast.success("Copied"); } };

  const daysUntilExpiry = expiresAt ? Math.floor((new Date(expiresAt).getTime() - Date.now()) / 86_400_000) : null;
  const expiryTone = daysUntilExpiry == null ? "" : daysUntilExpiry <= 7 ? "text-destructive" : daysUntilExpiry <= 14 ? "text-amber-600" : "text-muted-foreground";

  const downloadExt = async () => {
    try {
      const res = await fetch("/charlotte-extension.zip");
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "charlotte-extension.zip"; a.click();
      URL.revokeObjectURL(a.href);
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-6">
      {target ? (
        <div className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
          <Target className="h-4 w-4 text-primary" />
          Captures will land in <strong>{target.name}</strong>
          <code className="font-mono text-xs text-muted-foreground">({target.joinCode})</code>
          {target.isPersonal && <span className="text-xs text-muted-foreground">· personal</span>}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-amber-500/40 bg-amber-50/40 px-3 py-2 text-sm dark:bg-amber-950/10">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <span>No capture destination yet — captures will be rejected.</span>
          <Link to="/participant"><Button size="sm" variant="outline">Start a session</Button></Link>
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" />Extension token</CardTitle>
          <CardDescription>Paste this token into the Charlotte Chrome extension to capture AI conversations into your research session.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : token ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-md border bg-muted px-3 py-2 text-xs break-all">{token}</code>
                <Button variant="outline" size="sm" onClick={copy}><Copy className="h-4 w-4" /></Button>
              </div>
              <p className="text-xs text-amber-600 dark:text-amber-500">Copy this token now — for security, it won't be shown again. Rotate it any time if you lose it.</p>
            </div>
          ) : hasActive ? (
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Token active — cannot be shown again. Rotate to issue a new one.</p>
              {daysUntilExpiry != null && (
                <p className={`flex items-center gap-1.5 text-xs ${expiryTone}`}>
                  <Clock className="h-3 w-3" />
                  Expires in {daysUntilExpiry} day{daysUntilExpiry === 1 ? "" : "s"}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No active token. Issue one to get started.</p>
          )}
          <div className="flex gap-2">
            <Button onClick={issue} disabled={busy}><RefreshCw className="mr-1 h-4 w-4" />{hasActive ? "Rotate" : "Issue"} token</Button>
            {hasActive && <Button variant="outline" onClick={revoke} disabled={busy}><Trash2 className="mr-1 h-4 w-4" />Revoke</Button>}
          </div>

          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Rotate extension token?</AlertDialogTitle>
                <AlertDialogDescription>
                  This revokes your current token immediately. Any browser where the
                  extension is already installed will <strong>stop sending captures</strong> until
                  you paste the new token into it. Continue?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={doIssue}>Rotate token</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Install the extension (v1)</CardTitle>
          <CardDescription>Works in Chrome, Edge, Brave, Arc, and other Chromium browsers.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <Button onClick={downloadExt}><Download className="mr-1 h-4 w-4" />Download extension (.zip)</Button>

          <div>
            <p className="font-semibold mb-1">1. Unzip the file</p>
            <p className="text-muted-foreground">Find <code>charlotte-extension.zip</code> in your Downloads folder and unzip it. Keep the resulting folder somewhere stable (e.g. Documents) — if you delete or move it later, the extension stops working.</p>
          </div>

          <div>
            <p className="font-semibold mb-1">2. Open the Extensions page</p>
            <p className="text-muted-foreground">Type <code>chrome://extensions</code> into your browser's address bar and press Enter. (On Edge use <code>edge://extensions</code>, Brave <code>brave://extensions</code>, Arc <code>arc://extensions</code>.)</p>
          </div>

          <div>
            <p className="font-semibold mb-1">3. Turn on Developer mode</p>
            <p className="text-muted-foreground">Toggle the <strong>Developer mode</strong> switch in the top-right corner of the Extensions page.</p>
          </div>

          <div>
            <p className="font-semibold mb-1">4. Load the unpacked extension</p>
            <p className="text-muted-foreground">Click <strong>Load unpacked</strong> (top-left), then select the unzipped <code>charlotte-extension</code> folder. The Charlotte card will appear in your extensions list.</p>
          </div>

          <div>
            <p className="font-semibold mb-1">5. Pin Charlotte to your toolbar</p>
            <p className="text-muted-foreground">Click the <strong>puzzle-piece icon</strong> in the top-right of the browser toolbar to open the extensions menu. Find <strong>Charlotte</strong> in the list and click the <strong>pin icon</strong> next to it. The Charlotte icon will now stay visible in your toolbar for one-click access.</p>
          </div>

          <div>
            <p className="font-semibold mb-1">6. Connect your token</p>
            <p className="text-muted-foreground">Click the pinned Charlotte icon, paste the extension token from above, and click <strong>Save</strong>. You're ready — visit ChatGPT, Claude, or Gemini and your conversations will start flowing into your session.</p>
          </div>

          <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            <p className="font-semibold text-foreground mb-1">Managing the extension later</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Return to <code>chrome://extensions</code> any time to disable, remove, or reload Charlotte.</li>
              <li>To update: download a new zip here, unzip it (overwriting the old folder), then click the circular <strong>reload</strong> arrow on the Charlotte card.</li>
              <li>To rotate your token: come back to this page, click <strong>Rotate token</strong>, and re-paste it into the extension popup.</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
