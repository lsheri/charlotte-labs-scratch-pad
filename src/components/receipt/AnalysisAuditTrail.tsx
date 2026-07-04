import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Microscope, Lightbulb, Quote, Brain, BookOpen, Shield, ChevronDown, Fingerprint, Clock, Eye, HelpCircle, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { overallBand, dimensionEvidenceState, evidenceStateStyle } from "@/lib/fluencyMapping";

interface Dimension {
  canonical_name: string; display_name: string; score: number; explanation: string;
  evidence_snippets?: string[]; evidence_basis?: string; behaviors_observed?: string[];
  citations?: Array<{ source_id: string; name: string; url: string; version_label?: string }>;
  is_charlotte_added?: boolean;
}
interface ConfidenceRationale {
  evidence_points_found?: number; behaviors_triggered?: number;
  scores_inferred_count?: number; transcript_completeness?: string;
}
export interface AuditData {
  dimensions: Dimension[]; overall_level: string; overall_confidence: number;
  summary: string; confidence_rationale?: ConfidenceRationale;
}
export interface RunMeta {
  transcript_hash?: string | null; created_at?: string;
  input_type?: string; subject_type?: string; receipt_profile?: string;
  tool_metadata?: Record<string, unknown> | null;
}

const evidenceBasisInfo: Record<string, { label: string; color: string; explain: string }> = {
  direct_evidence:        { label: "Directly Observed",      color: "bg-green-500/10 text-green-600 border-green-500/20", explain: "We found clear evidence of this skill in your conversation." },
  inferred_evidence:      { label: "Inferred",               color: "bg-blue-500/10 text-blue-600 border-blue-500/20",   explain: "The way you worked suggests you used this skill." },
  insufficient_evidence:  { label: "Insufficient Evidence",  color: "bg-red-500/10 text-red-600 border-red-500/20",      explain: "Not enough info to confidently assess this skill." },
  not_applicable:         { label: "Not Applicable",         color: "bg-muted/40 text-muted-foreground border-border",   explain: "This dimension doesn't apply to this conversation." },
  stored_not_scored:      { label: "Stored, Not Scored",     color: "bg-muted/40 text-muted-foreground border-border",   explain: "Recorded but not scored this time." },
  directly_observed:      { label: "Directly Observed",      color: "bg-green-500/10 text-green-600 border-green-500/20", explain: "We found clear evidence of this skill." },
  inferred:               { label: "Inferred",               color: "bg-blue-500/10 text-blue-600 border-blue-500/20",   explain: "The way you worked suggests you used this skill." },
  claimed_not_evidenced:  { label: "Claimed, Not Evidenced", color: "bg-amber-500/10 text-amber-600 border-amber-500/20", explain: "You mentioned doing this, but we couldn't see it." },
};

const evidenceBg = (score: number) => {
  const s = dimensionEvidenceState(score);
  if (s === "Strong evidence") return "bg-primary";
  if (s === "Good evidence") return "bg-blue-500";
  if (s === "Limited evidence") return "bg-amber-500";
  return "bg-muted-foreground";
};

export function AnalysisAuditTrail({ auditData, runMeta, trigger }: { auditData: AuditData; runMeta?: RunMeta; trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const band = overallBand(auditData.overall_level);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || <Button variant="outline" size="sm"><Microscope className="h-4 w-4 mr-2" />How We Scored This</Button>}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Microscope className="h-5 w-5" />How We Scored This</DialogTitle>
          <DialogDescription>A complete, auditable view of the evidence behind each dimension.</DialogDescription>
        </DialogHeader>

        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-4 space-y-4">
            <div className="flex items-start gap-3">
              <Lightbulb className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div className="space-y-2">
                <p className="text-sm font-medium">The Simple Version</p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  We read your conversation and looked for <strong>8 skills</strong> that show how well you work with AI.
                  For each skill, we searched for evidence — things you said or did. More evidence = higher confidence.
                </p>
              </div>
            </div>
            <Badge variant="outline" className={`text-sm border ${band.className}`}>
              Overall: <span className="font-bold ml-1">{band.label}</span>
            </Badge>
            <div className="grid gap-2">
              {auditData.dimensions.map(d => (
                <div key={d.canonical_name} className="flex items-center gap-2">
                  <span className="text-xs w-28 truncate text-muted-foreground">{d.display_name}</span>
                  <Progress value={(d.score ?? 0) * 20} className="h-2 flex-1" />
                  <span className="text-xs w-24 text-right text-muted-foreground">{dimensionEvidenceState(d.score)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-1">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-2"><BookOpen className="h-4 w-4" />Detailed Evidence Breakdown</h3>
          <Accordion type="multiple">
            {auditData.dimensions.map(dim => {
              const basis = dim.evidence_basis ? evidenceBasisInfo[dim.evidence_basis] : null;
              const state = dimensionEvidenceState(dim.score);
              return (
                <AccordionItem key={dim.canonical_name} value={dim.canonical_name}>
                  <AccordionTrigger className="hover:no-underline py-3">
                    <div className="flex items-center gap-3 text-left">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${evidenceBg(dim.score)}`}>
                        {state === "Strong evidence" ? <Shield className="h-3.5 w-3.5 text-primary-foreground" /> : <Eye className="h-3.5 w-3.5 text-white" />}
                      </div>
                      <div>
                        <span className="font-medium text-sm">{dim.display_name}</span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 border ${evidenceStateStyle(state)}`}>{state}</Badge>
                          {dim.is_charlotte_added && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                              <Sparkles className="h-2.5 w-2.5 mr-0.5" />Charlotte
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 pb-4">
                    {basis && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Eye className="h-3 w-3" />Evidence Basis</p>
                        <Badge className={basis.color}>{basis.label}</Badge>
                        <p className="text-xs text-muted-foreground">{basis.explain}</p>
                      </div>
                    )}
                    {dim.evidence_snippets?.length ? (
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Quote className="h-3 w-3" />Evidence Found</p>
                        {dim.evidence_snippets.map((snip, i) => (
                          <blockquote key={i} className="border-l-2 border-primary/30 pl-3 text-xs text-muted-foreground italic">"{snip}"</blockquote>
                        ))}
                      </div>
                    ) : null}
                    {dim.behaviors_observed?.length ? (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Brain className="h-3 w-3" />Behaviors Detected</p>
                        <div className="flex flex-wrap gap-1">
                          {dim.behaviors_observed.map((b, i) => <Badge key={i} variant="secondary" className="text-xs">{b}</Badge>)}
                        </div>
                      </div>
                    ) : null}
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><HelpCircle className="h-3 w-3" />Why This Evidence Level</p>
                      <p className="text-xs leading-relaxed">{dim.explanation}</p>
                    </div>
                    {dim.citations?.length ? (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><BookOpen className="h-3 w-3" />Research Sources</p>
                        <div className="space-y-1">
                          {dim.citations.filter(c => !c.url?.startsWith("internal://")).map((c, i) => (
                            <a key={i} href={c.url} target="_blank" rel="noopener noreferrer" className="block text-xs text-primary hover:underline">
                              {c.name}{c.version_label && <span className="text-muted-foreground ml-1">({c.version_label})</span>}
                            </a>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </div>

        {runMeta && (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between text-muted-foreground">
                <span className="flex items-center gap-2 text-xs"><Shield className="h-3 w-3" />Audit Metadata</span>
                <ChevronDown className="h-3 w-3" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="rounded-md border bg-muted/30 p-3 space-y-2 text-xs">
                {runMeta.transcript_hash && <Row label="Transcript Hash (SHA-256)" icon={<Fingerprint className="h-3 w-3" />}><code className="font-mono text-[10px] break-all">{runMeta.transcript_hash}</code></Row>}
                {runMeta.created_at && <Row label="Analysis Timestamp" icon={<Clock className="h-3 w-3" />}>{format(new Date(runMeta.created_at), "PPP 'at' p")}</Row>}
                {runMeta.input_type && <Row label="Input Type">{runMeta.input_type}</Row>}
                {runMeta.subject_type && <Row label="Subject Type">{runMeta.subject_type}</Row>}
                {runMeta.receipt_profile && <Row label="Receipt Profile">{runMeta.receipt_profile}</Row>}
                {auditData.confidence_rationale && (
                  <div className="border-t pt-2 mt-2 space-y-1">
                    <p className="font-medium text-muted-foreground">Confidence Breakdown</p>
                    {auditData.confidence_rationale.evidence_points_found != null && <Row label="Evidence Points Found">{auditData.confidence_rationale.evidence_points_found}</Row>}
                    {auditData.confidence_rationale.behaviors_triggered != null && <Row label="Behaviors Triggered">{auditData.confidence_rationale.behaviors_triggered}</Row>}
                    {auditData.confidence_rationale.scores_inferred_count != null && <Row label="Scores Inferred">{auditData.confidence_rationale.scores_inferred_count}</Row>}
                    {auditData.confidence_rationale.transcript_completeness && <Row label="Transcript Completeness">{auditData.confidence_rationale.transcript_completeness}</Row>}
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      {icon}<span className="text-muted-foreground shrink-0">{label}:</span><span className="font-medium">{children}</span>
    </div>
  );
}
