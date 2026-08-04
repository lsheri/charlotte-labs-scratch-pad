import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play, MapPin } from "lucide-react";
import { useTour } from "@/components/tour/TourProvider";
import { DEMOS } from "@/components/tour/demos";

export const Route = createFileRoute("/participant/demo")({
  head: () => ({
    meta: [
      { title: "Demo Home — Charlotte Labs" },
      {
        name: "description",
        content:
          "Four guided walkthroughs of Charlotte Labs: the student journey, receipt creation, manual upload, and the department view.",
      },
      { property: "og:title", content: "Demo Home — Charlotte Labs" },
      {
        property: "og:description",
        content: "Four guided walkthroughs of how Charlotte Labs measures AI fluency.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DemoHome,
});

function DemoHome() {
  const { start, active } = useTour();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-2">
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-amber-900">
          Demo environment
        </span>
        <h1 className="text-3xl font-semibold tracking-tight">Guided demos</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Four short walkthroughs, each self-contained. Start any one of them — you don't need to
          watch them in order. Every demo runs on the real product with real seeded data; press
          Escape at any point to exit.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {DEMOS.map((d) => (
          <Card key={d.id} className="flex flex-col">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">{d.label}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-4">
              <p className="flex-1 text-sm leading-relaxed text-muted-foreground">{d.blurb}</p>
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <MapPin className="h-3 w-3" /> Starts on {d.startsOn}
                </span>
                <Button
                  size="sm"
                  disabled={!!active}
                  onClick={() => start(d.id)}
                  className="bg-amber-400 font-semibold text-amber-950 hover:bg-amber-300"
                >
                  <Play className="mr-1 h-4 w-4" /> Play demo
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
