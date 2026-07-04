
function PipelineRow({ color, label, detail }: { color: "green" | "amber" | "red"; label: string; detail: string }) {
  const dot = color === "green" ? "bg-emerald-500" : color === "amber" ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      <span className="font-medium">{label}:</span>
      <span className="text-muted-foreground">{detail}</span>
    </div>
  );
}
