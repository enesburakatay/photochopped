import { useEditor } from '@/store/editorStore';
import { BLEND_MODES } from '@/core/types';
import { BRUSH_PRESETS } from '@/tools/brushPresets';

/**
 * Options bar: tool-specific controls displayed under the menu bar.
 * Photoshop's contextual options strip equivalent.
 */
export function OptionsBar() {
  const tool = useEditor((s) => s.tool);
  const brush = useEditor((s) => s.brush);
  const eraser = useEditor((s) => s.eraser);
  const setBrush = useEditor((s) => s.setBrush);
  const setEraser = useEditor((s) => s.setEraser);
  const restoreBrush = useEditor((s) => s.restoreBrush);
  const setRestoreBrush = useEditor((s) => s.setRestoreBrush);
  const fillTolerance = useEditor((s) => s.fillTolerance);
  const fillContiguous = useEditor((s) => s.fillContiguous);
  const setFill = useEditor((s) => s.setFillSettings);
  const wandTolerance = useEditor((s) => s.wandTolerance);
  const wandContiguous = useEditor((s) => s.wandContiguous);
  const setWand = useEditor((s) => s.setWandSettings);
  const brushPreset = useEditor((s) => s.brushPreset);
  const setBrushPreset = useEditor((s) => s.setBrushPreset);

  return (
    <div className="h-9 bg-ps-panel2 border-b border-ps-border px-3 flex items-center gap-3 text-xs">
      {tool === 'brush' && (
        <div className="flex items-center gap-1 mr-1">
          {BRUSH_PRESETS.map((p) => (
            <button
              key={p.id}
              title={`${p.name} — ${p.description}`}
              data-active={brushPreset === p.id ? 'true' : 'false'}
              className="w-7 h-7 rounded text-base flex items-center justify-center hover:bg-ps-panel3 data-[active=true]:bg-ps-accent data-[active=true]:text-white"
              onClick={() => setBrushPreset(p.id)}
            >
              <span aria-hidden>{p.glyph}</span>
            </button>
          ))}
          <div className="w-px h-5 bg-ps-border mx-1" />
        </div>
      )}
      {(tool === 'brush' || tool === 'eraser') && (
        <>
          <Numeric label="Size" value={tool === 'brush' ? brush.radius : eraser.radius} min={1} max={1024} step={1}
            onChange={(v) => tool === 'brush' ? setBrush({ radius: v }) : setEraser({ radius: v })} />
          <Numeric label="Hardness" value={(tool === 'brush' ? brush.hardness : eraser.hardness) * 100} min={0} max={100} step={1} suffix="%"
            onChange={(v) => tool === 'brush' ? setBrush({ hardness: v / 100 }) : setEraser({ hardness: v / 100 })} />
          <Numeric label="Opacity" value={(tool === 'brush' ? brush.opacity : eraser.opacity) * 100} min={0} max={100} step={1} suffix="%"
            onChange={(v) => tool === 'brush' ? setBrush({ opacity: v / 100 }) : setEraser({ opacity: v / 100 })} />
          {tool === 'brush' && (
            <Numeric label="Flow" value={brush.flow * 100} min={0} max={100} step={1} suffix="%"
              onChange={(v) => setBrush({ flow: v / 100 })} />
          )}
          <Numeric label="Spacing" value={brush.spacing * 100} min={1} max={100} step={1} suffix="%"
            onChange={(v) => tool === 'brush' ? setBrush({ spacing: v / 100 }) : setEraser({ spacing: v / 100 })} />
          {tool === 'brush' && (
            <select className="ml-2" value={'normal'} onChange={() => {/* future per-stroke blend */}}>
              {BLEND_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
        </>
      )}
      {tool === 'restore' && (
        <>
          <Numeric label="Size" value={restoreBrush.radius} min={1} max={1024} step={1}
            onChange={(v) => setRestoreBrush({ radius: v })} />
          <Numeric label="Hardness" value={restoreBrush.hardness * 100} min={0} max={100} step={1} suffix="%"
            onChange={(v) => setRestoreBrush({ hardness: v / 100 })} />
          <Numeric label="Opacity" value={restoreBrush.opacity * 100} min={0} max={100} step={1} suffix="%"
            onChange={(v) => setRestoreBrush({ opacity: v / 100 })} />
          <span className="text-ps-textDim">Paint over removed areas to bring them back.</span>
        </>
      )}
      {tool === 'fill' && (
        <>
          <Numeric label="Tolerance" value={fillTolerance} min={0} max={255} step={1}
            onChange={(v) => setFill({ tolerance: v })} />
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={fillContiguous} onChange={(e) => setFill({ contiguous: e.target.checked })} />
            Contiguous
          </label>
        </>
      )}
      {tool === 'magic-wand' && (
        <>
          <Numeric label="Tolerance" value={wandTolerance} min={0} max={255} step={1}
            onChange={(v) => setWand({ tolerance: v })} />
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={wandContiguous} onChange={(e) => setWand({ contiguous: e.target.checked })} />
            Contiguous
          </label>
          <span className="text-ps-textDim">Click a region to cut it out · Alt+Click to restore it.</span>
        </>
      )}
      {(tool === 'marquee-rect' || tool === 'marquee-ellipse') && (
        <span className="text-ps-textDim">Drag to make a selection. Shift+Drag = constrain. Hold Alt = subtract (Phase 2).</span>
      )}
      {tool === 'crop' && <span className="text-ps-textDim">Drag a region. Release to crop.</span>}
      {tool === 'move' && <span className="text-ps-textDim">Move tool active. Phase 2: full transform handles.</span>}
    </div>
  );
}

function Numeric({ label, value, min, max, step, suffix, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-1">
      <span className="text-ps-textDim">{label}:</span>
      <input
        type="number"
        className="w-14"
        value={Math.round(value * 100) / 100}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {suffix && <span className="text-ps-textDim text-2xs">{suffix}</span>}
    </label>
  );
}
