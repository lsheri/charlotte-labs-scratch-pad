/**
 * ProvenanceVial — Charlotte-style lab test tube indicator.
 *
 * Lab Work     => neon green liquid, slow lavalamp bubbles
 * Personal     => lavender-purple liquid, calmer bubbles
 *
 * Visual mark only. Always render alongside a text label or aria-label so the
 * meaning isn't color-only.
 */
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Provenance } from "@/lib/displayNames";
import { PROVENANCE_LABELS } from "@/lib/displayNames";

type Size = "sm" | "md" | "lg";

const DIM: Record<Size, { w: number; h: number }> = {
  sm: { w: 14, h: 20 },
  md: { w: 20, h: 28 },
  lg: { w: 28, h: 40 },
};

interface Props {
  variant: Provenance;
  size?: Size;
  verified?: boolean;
  className?: string;
  title?: string;
}

export function ProvenanceVial({ variant, size = "sm", verified, className, title }: Props) {
  const { w, h } = DIM[size];
  const isLab = variant === "lab";
  const liquid = isLab ? "var(--provenance-lab)" : "var(--provenance-personal)";
  const liquidTop = isLab ? "var(--provenance-lab-soft)" : "var(--provenance-personal-soft)";
  const bubble = isLab ? "var(--provenance-lab-bubble)" : "var(--provenance-personal-bubble)";
  const glow = isLab ? "var(--provenance-lab-glow)" : "var(--provenance-personal-glow)";

  // viewBox 24x36; liquid fills bottom ~70%
  return (
    <span
      role="img"
      aria-label={title ?? PROVENANCE_LABELS[variant]}
      title={title ?? PROVENANCE_LABELS[variant]}
      className={cn("inline-block relative shrink-0", className)}
      style={{ width: w, height: h, filter: `drop-shadow(0 0 6px ${glow})` }}
    >
      <svg viewBox="0 0 24 36" width={w} height={h} aria-hidden="true">
        <defs>
          <clipPath id={`vial-clip-${variant}`}>
            {/* test tube body: rounded bottom, straight sides, narrow neck */}
            <path d="M8 4 h8 v6 a4 4 0 0 1 1 2 v15 a7 7 0 0 1 -10 0 v-15 a4 4 0 0 1 1 -2 z" />
          </clipPath>
          <linearGradient id={`vial-fill-${variant}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%"  stopColor={liquidTop} />
            <stop offset="100%" stopColor={liquid} />
          </linearGradient>
        </defs>

        {/* liquid + bubbles, clipped to vial body */}
        <g clipPath={`url(#vial-clip-${variant})`}>
          <rect className="vial-fill" x="0" y="13" width="24" height="23" fill={`url(#vial-fill-${variant})`} />
          <circle className="vial-bubble"    cx="10" cy="30" r="1.4" fill={bubble} />
          <circle className="vial-bubble vial-bubble-2" cx="14" cy="32" r="1.0" fill={bubble} />
          <circle className="vial-bubble vial-bubble-3" cx="12" cy="34" r="1.7" fill={bubble} />
        </g>

        {/* glass outline */}
        <path
          d="M8 4 h8 v6 a4 4 0 0 1 1 2 v15 a7 7 0 0 1 -10 0 v-15 a4 4 0 0 1 1 -2 z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
          opacity="0.85"
        />
        {/* cork / cap */}
        <rect x="7" y="2" width="10" height="3.2" rx="1" fill="currentColor" opacity="0.85" />
      </svg>

      {verified && (
        <span
          className="absolute -top-0.5 -right-0.5 rounded-full bg-emerald-600 text-white shadow"
          style={{ width: Math.max(8, w * 0.45), height: Math.max(8, w * 0.45) }}
          aria-label="Verified by admin"
        >
          <Check className="w-full h-full p-0.5" />
        </span>
      )}
    </span>
  );
}

/** Inline label: vial + text. Useful in lists. */
export function ProvenanceTag({
  variant, verified, size = "sm", className,
}: { variant: Provenance; verified?: boolean; size?: Size; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", className)}>
      <ProvenanceVial variant={variant} size={size} verified={verified} />
      <span className="font-medium">{PROVENANCE_LABELS[variant]}</span>
      {verified && <span className="text-[10px] text-emerald-700">· verified</span>}
    </span>
  );
}
