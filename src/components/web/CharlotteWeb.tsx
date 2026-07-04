import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, Network, Sun, Moon, Grid3X3, Sparkles } from 'lucide-react';
import { CharlotteCheckup } from '@/components/checkup/CharlotteCheckup';
import type { TimePeriod, ColorByMode, BgMode } from './webTypes';
import { useWebData } from './useWebData';
import { WebCanvas } from './WebCanvas';
import { WebTimelineFilter } from './WebTimelineFilter';
import { WebNodeDetailPanel } from './WebNodeDetailPanel';
import { WebColorBySelector } from './WebColorBySelector';

interface Props {
  participantId: string | null;
  sessionId: string | null;
}

export function CharlotteWeb({ participantId, sessionId }: Props) {
  const [period, setPeriod] = useState<TimePeriod>('all');
  const [colorBy, setColorBy] = useState<ColorByMode>('medium');
  const [baseMode, setBaseMode] = useState<'light' | 'dark'>('dark');
  const [blueprintOn, setBlueprintOn] = useState(false);
  const bgMode: BgMode = blueprintOn ? 'blueprint' : baseMode;
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [checkupOpen, setCheckupOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 600, height: 600 });

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) setSize({ width, height });
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const { webData, workflows, workflowsByTool, isLoading } = useWebData(participantId, sessionId, period, colorBy);

  const selectedNode = selectedNodeId ? webData.nodes.find((n) => n.id === selectedNodeId) ?? null : null;
  const handleNodeClick = useCallback((nodeId: string) => {
    setSelectedNodeId((prev) => (prev === nodeId ? null : nodeId));
  }, []);

  const isBlueprint = bgMode === 'blueprint';
  const isDark = bgMode === 'dark';

  const outerBg = isBlueprint ? 'bg-[hsl(220_30%_7%)]' : isDark ? 'bg-[hsl(220_30%_7%)]' : 'bg-[hsl(220_20%_95%)]';
  const outerBorder = isBlueprint ? 'border-[hsl(200_40%_20%)]' : isDark ? 'border-[hsl(220_30%_15%)]' : 'border-[hsl(220_20%_82%)]';
  const headerBg = isBlueprint ? 'bg-[hsl(220_30%_7%)]' : isDark ? 'bg-[hsl(220_30%_9%)]' : 'bg-[hsl(220_20%_98%)]';
  const headerBorder = isBlueprint ? 'border-[hsl(200_40%_18%)]' : isDark ? 'border-[hsl(220_30%_15%)]' : 'border-[hsl(220_20%_82%)]';
  const titleColor = isBlueprint ? 'text-[hsl(200_60%_70%)]' : isDark ? 'text-[hsl(220_20%_90%)]' : 'text-[hsl(220_20%_20%)]';
  const subtitleColor = isBlueprint ? 'text-[hsl(200_40%_45%)]' : isDark ? 'text-[hsl(220_20%_45%)]' : 'text-[hsl(220_20%_55%)]';
  const descColor = isBlueprint ? 'text-[hsl(200_30%_40%)]' : isDark ? 'text-[hsl(220_20%_50%)]' : 'text-[hsl(220_20%_45%)]';
  const toggleBtnColor = isBlueprint ? 'hover:bg-[hsl(200_40%_15%)] text-[hsl(200_40%_50%)]'
    : isDark ? 'hover:bg-[hsl(220_30%_18%)] text-[hsl(220_20%_60%)]'
    : 'hover:bg-[hsl(220_20%_88%)] text-[hsl(220_20%_40%)]';
  const footerBg = headerBg;
  const footerBorder = headerBorder;
  const footerText = isBlueprint ? 'text-[hsl(200_30%_40%)]' : isDark ? 'text-[hsl(220_20%_50%)]' : 'text-[hsl(220_20%_50%)]';
  const detailBg = isBlueprint ? 'bg-[hsl(220_30%_7%)]' : isDark ? 'bg-[hsl(220_30%_10%)]' : 'bg-white';
  const detailBorder = isBlueprint ? 'border-[hsl(200_40%_18%)]' : isDark ? 'border-[hsl(220_30%_15%)]' : 'border-[hsl(220_20%_82%)]';

  const LightDarkIcon = baseMode === 'light' ? Moon : Sun;

  if (!participantId) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />Loading…
      </div>
    );
  }

  return (
    <div className={`relative flex flex-col h-full overflow-hidden border ${isBlueprint ? 'rounded-none' : 'rounded-xl'} ${outerBg} ${outerBorder} ${isBlueprint ? 'font-mono' : ''}`}>
      <div className={`flex items-center justify-between px-5 py-4 border-b gap-4 flex-wrap ${headerBorder} ${headerBg}`}>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <Network className="h-6 w-6 text-primary" />
            <h2 className={`font-bold ${isBlueprint ? 'text-base uppercase tracking-widest' : 'text-xl'} ${titleColor}`}>
              {isBlueprint ? 'CHARLOTTE WEB' : 'Charlotte Web'}
            </h2>
            <span className={`text-xs ml-2 ${isBlueprint ? 'uppercase tracking-wider' : ''} ${subtitleColor}`}>
              {webData.nodes.length} nodes · {webData.edges.length} connections
            </span>
          </div>
          <p className={`text-xs leading-snug max-w-lg ${isBlueprint ? 'uppercase tracking-wide' : ''} ${descColor}`}>
            {isBlueprint
              ? 'TECHNICAL BLUEPRINT — AI TOOL USAGE TOPOLOGY'
              : "Your AI fingerprint — see how you reach for different tools across different tasks."}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => setBaseMode(m => m === 'light' ? 'dark' : 'light')}
            className={`p-2 transition-colors ${isBlueprint ? 'rounded-none' : 'rounded-md'} ${toggleBtnColor}`}
            title={`Switch to ${baseMode === 'light' ? 'dark' : 'light'} mode`}>
            <LightDarkIcon className="h-5 w-5" />
          </button>
          <button onClick={() => setBlueprintOn(b => !b)}
            className={`p-2 transition-colors ${isBlueprint ? 'rounded-none bg-[hsl(200_40%_20%)] text-[hsl(200_60%_70%)]' : 'rounded-md'} ${!isBlueprint ? toggleBtnColor : ''}`}
            title={blueprintOn ? 'Exit blueprint mode' : 'Enter blueprint mode'}>
            <Grid3X3 className="h-5 w-5" />
          </button>
          <WebColorBySelector value={colorBy} onChange={setColorBy} nodes={webData.nodes} bgMode={bgMode} />
          <WebTimelineFilter value={period} onChange={setPeriod} bgMode={bgMode} />
        </div>
      </div>

      <div ref={containerRef} className="flex-1 min-h-0 relative overflow-hidden" style={isBlueprint ? {
        backgroundColor: 'hsl(220 30% 7%)',
        backgroundImage: 'linear-gradient(hsl(200 40% 18%) 1px, transparent 1px), linear-gradient(90deg, hsl(200 40% 18%) 1px, transparent 1px)',
        backgroundSize: '20px 20px',
      } : undefined}>
        <div className="absolute inset-0">
          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : webData.nodes.length <= 1 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-[hsl(220_20%_45%)] gap-3">
              <Network className="h-12 w-12 opacity-30" />
              <p className={`text-sm ${isBlueprint ? 'font-mono uppercase tracking-wider' : ''}`}>Log AI sessions to see your web grow</p>
            </div>
          ) : (
            <WebCanvas data={webData} onNodeClick={handleNodeClick} width={size.width} height={size.height} colorBy={colorBy} bgMode={bgMode} pinnedId={selectedNodeId} />
          )}
        </div>

        {selectedNode && (
          <div className={`absolute right-0 top-0 bottom-0 w-[280px] border-l overflow-hidden z-10 shadow-2xl ${detailBorder} ${detailBg}`}>
            <WebNodeDetailPanel node={selectedNode} workflows={workflows} workflowsByTool={workflowsByTool}
              onClose={() => setSelectedNodeId(null)} bgMode={bgMode} />
          </div>
        )}

        {checkupOpen && !isLoading && (
          <CharlotteCheckup
            data={webData}
            width={size.width}
            height={size.height}
            onClose={() => setCheckupOpen(false)}
          />
        )}

        {/* Subtle Tour entry — bottom-left of the canvas */}
        {!isLoading && webData.nodes.length > 1 && !checkupOpen && (
          <button
            onClick={() => setCheckupOpen(true)}
            className="absolute bottom-3 left-3 z-20 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/90 text-primary-foreground text-xs font-semibold shadow-lg hover:bg-primary transition-colors backdrop-blur-sm"
            title="Charlotte walks you through your AI fingerprint"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Charlotte's Tour
            <span className="ml-1 text-[9px] uppercase tracking-wider px-1 py-0.5 rounded bg-[#6FFAC6] text-[#0c2340]">Beta</span>
          </button>
        )}
      </div>

      <div className={`flex items-center justify-between px-5 py-2 border-t text-[10px] ${isBlueprint ? 'uppercase tracking-widest' : ''} ${footerBorder} ${footerBg} ${footerText}`}>
        <span className="flex items-center gap-1.5">
          <span className={`inline-block h-2.5 w-2.5 bg-primary ${isBlueprint ? '' : 'rounded-full'}`} /> You
        </span>
        <span>{isBlueprint ? 'SCROLL ZOOM · DRAG PAN · CLICK NODE' : 'Scroll to zoom · Drag to pan · Click node for details'}</span>
      </div>
    </div>
  );
}
