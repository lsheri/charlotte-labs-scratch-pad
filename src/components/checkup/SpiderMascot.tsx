import charlotteMascot from "@/assets/charlotte-mascot.png";

interface Props { x: number; y: number; angle: number; size?: number; }

/** Charlotte mascot — uses the brand circuit-board spider art. */
export function SpiderMascot({ x, y, angle, size = 64 }: Props) {
  return (
    <img
      src={charlotteMascot}
      alt="Charlotte"
      aria-hidden
      draggable={false}
      className="pointer-events-none absolute z-40"
      style={{
        left: x, top: y, width: size, height: size,
        transform: `translate(-50%, -50%) rotate(${angle}deg)`,
        transition: "left 120ms linear, top 120ms linear, transform 200ms ease-out",
        filter: "drop-shadow(0 3px 6px rgba(12,35,64,0.35))",
      }}
    />
  );
}
