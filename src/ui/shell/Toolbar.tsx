import {
  MousePointer2,
  Square,
  Circle,
  Lasso,
  Wand2,
  Crop,
  Pipette,
  Brush,
  Eraser,
  PaintbrushVertical,
  PaintBucket,
  Type,
  Hand,
  ZoomIn,
  Shapes,
  Scissors,
} from 'lucide-react';
import { useEditor } from '@/store/editorStore';
import type { ToolId } from '@/tools/types';
import { rgbaToCss } from '@/core/color';

interface ToolDef {
  id: ToolId;
  icon: React.ReactNode;
  label: string;
  shortcut: string;
}

const TOOLS: ToolDef[] = [
  { id: 'move', icon: <MousePointer2 size={18} />, label: 'Move', shortcut: 'V' },
  { id: 'marquee-rect', icon: <Square size={18} />, label: 'Rectangular Marquee', shortcut: 'M' },
  { id: 'marquee-ellipse', icon: <Circle size={18} />, label: 'Elliptical Marquee', shortcut: 'M' },
  { id: 'lasso', icon: <Lasso size={18} />, label: 'Lasso', shortcut: 'L' },
  { id: 'crop', icon: <Crop size={18} />, label: 'Crop', shortcut: 'C' },
  { id: 'eyedropper', icon: <Pipette size={18} />, label: 'Eyedropper', shortcut: 'I' },
  { id: 'brush', icon: <Brush size={18} />, label: 'Brush', shortcut: 'B' },
  { id: 'fill', icon: <PaintBucket size={18} />, label: 'Paint Bucket', shortcut: 'G' },
  { id: 'shape-rect', icon: <Shapes size={18} />, label: 'Shape', shortcut: 'R' },
  { id: 'text', icon: <Type size={18} />, label: 'Text', shortcut: 'T' },
  { id: 'hand', icon: <Hand size={18} />, label: 'Hand', shortcut: 'H' },
  { id: 'zoom', icon: <ZoomIn size={18} />, label: 'Zoom', shortcut: 'Z' },
];

// Background-removal cluster — the refine tools for a cutout, grouped under the
// Scissors (Remove Background) button so the whole job is in one place. The Eraser
// is a general tool but lives here too by request, since cutting more away is part
// of the same workflow; its `E` shortcut still selects it from anywhere.
const CUTOUT_TOOLS: ToolDef[] = [
  { id: 'magic-wand', icon: <Wand2 size={18} />, label: 'Magic Wand — click to cut, Alt+click to restore', shortcut: 'W' },
  { id: 'restore', icon: <PaintbrushVertical size={18} />, label: 'Restore Brush — paint removed pixels back', shortcut: 'K' },
  { id: 'eraser', icon: <Eraser size={18} />, label: 'Eraser — cut more away by hand', shortcut: 'E' },
];

export function Toolbar({ onRemoveBackground }: { onRemoveBackground?: () => void } = {}) {
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  const fg = useEditor((s) => s.foreground);
  const bg = useEditor((s) => s.background);
  const swap = useEditor((s) => s.swapColors);
  const setFg = useEditor((s) => s.setForeground);
  const setBg = useEditor((s) => s.setBackground);
  const removeBg = useEditor((s) => s.removeBackgroundFromActive);

  return (
    <div className="w-12 bg-ps-panel border-r border-ps-border flex flex-col items-center py-1 gap-0.5">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          className="pc-tool-btn"
          data-active={tool === t.id ? 'true' : 'false'}
          onClick={() => setTool(t.id)}
          title={`${t.label} (${t.shortcut})`}
        >
          {t.icon}
        </button>
      ))}
      <div className="pc-divider w-8" />
      {/* Background-removal group: Remove Background action + its refine tools. */}
      <button
        className="pc-tool-btn text-ps-accent"
        title="Remove Background (click = one-tap, right-click = options)"
        onClick={() => removeBg()}
        onContextMenu={(e) => { e.preventDefault(); onRemoveBackground?.(); }}
      >
        <Scissors size={18} />
      </button>
      {CUTOUT_TOOLS.map((t) => (
        <button
          key={t.id}
          className="pc-tool-btn"
          data-active={tool === t.id ? 'true' : 'false'}
          onClick={() => setTool(t.id)}
          title={`${t.label} (${t.shortcut})`}
        >
          {t.icon}
        </button>
      ))}
      <div className="pc-divider w-8" />
      <ColorSwatches fg={fg} bg={bg} onSwap={swap} onResetFg={() => setFg({ r: 0, g: 0, b: 0, a: 1 })} onResetBg={() => setBg({ r: 255, g: 255, b: 255, a: 1 })} />
    </div>
  );
}

function ColorSwatches({ fg, bg, onSwap, onResetFg, onResetBg }: {
  fg: import('@/core/types').RGBA;
  bg: import('@/core/types').RGBA;
  onSwap: () => void;
  onResetFg: () => void;
  onResetBg: () => void;
}) {
  return (
    <div className="relative w-9 h-9 mt-1" title="Foreground / Background colors">
      <div
        className="absolute top-0 left-0 w-6 h-6 border-2 border-ps-text shadow"
        style={{ background: rgbaToCss(fg) }}
        onClick={() => {/* inline picker handled by color panel */}}
      />
      <div
        className="absolute bottom-0 right-0 w-6 h-6 border-2 border-ps-text shadow"
        style={{ background: rgbaToCss(bg) }}
      />
      <button
        className="absolute top-0 right-0 w-3 h-3 text-2xs text-ps-textDim hover:text-ps-text"
        title="Swap (X)"
        onClick={onSwap}
      >⇄</button>
      <button
        className="absolute bottom-0 left-0 w-3 h-3 text-2xs text-ps-textDim hover:text-ps-text"
        title="Reset (D)"
        onClick={() => { onResetFg(); onResetBg(); }}
      >⊕</button>
    </div>
  );
}
