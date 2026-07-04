import { FluencyRadarChart } from "./receipt/FluencyRadarChart";

interface Dim { canonical_name: string; display_name: string; score: number | null }

export function FluencyRadar({ dimensions, size }: { dimensions: Dim[]; max?: number; size?: number }) {
  const data = dimensions.map(d => ({ label: d.display_name, value: d.score ?? 0 }));
  if (size) {
    return (
      <div className="flex justify-center">
        <div style={{ width: size, height: size }}>
          <FluencyRadarChart dimensions={data} />
        </div>
      </div>
    );
  }
  return (
    <div className="w-full" style={{ containerType: "inline-size" }}>
      <div className="w-full" style={{ height: "clamp(520px, 72cqw, 820px)" }}>
        <FluencyRadarChart dimensions={data} />
      </div>
    </div>
  );
}
