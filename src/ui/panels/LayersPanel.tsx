import { Eye, EyeOff, Lock, Plus, Trash2, Copy } from 'lucide-react';
import { useEditor } from '@/store/editorStore';
import { BLEND_MODES, type Layer } from '@/core/types';

export function LayersPanel() {
  const slot = useEditor((s) => s.docs[s.activeDocIndex]);
  const setActiveLayer = useEditor((s) => s.setActiveLayer);
  const patchLayer = useEditor((s) => s.patchLayer);
  const addLayer = useEditor((s) => s.addLayer);
  const removeActive = useEditor((s) => s.removeActiveLayer);
  const duplicate = useEditor((s) => s.duplicateActiveLayer);
  const reorder = useEditor((s) => s.reorderLayer);

  if (!slot) return null;
  const active = slot.doc.activeLayerId;
  const activeLayer: Layer | undefined = slot.doc.layers.find((l) => l.id === active);

  return (
    <div className="flex-1 flex flex-col border-t border-ps-border min-h-[180px]">
      <div className="pc-panel-header">
        <span>Layers</span>
        <div className="flex gap-1">
          <button title="New layer" onClick={() => addLayer(0)} className="text-ps-textDim hover:text-ps-text"><Plus size={12} /></button>
          <button title="Duplicate" onClick={duplicate} className="text-ps-textDim hover:text-ps-text"><Copy size={12} /></button>
          <button title="Delete" onClick={removeActive} className="text-ps-textDim hover:text-ps-danger"><Trash2 size={12} /></button>
        </div>
      </div>
      {activeLayer && (
        <div className="px-2 py-1 border-b border-ps-border bg-ps-panel2 text-xs space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-ps-textDim w-12">Blend</span>
            <select
              className="flex-1"
              value={activeLayer.blendMode}
              onChange={(e) => patchLayer(activeLayer.id, { blendMode: e.target.value as Layer['blendMode'] })}
            >
              {BLEND_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-ps-textDim w-12">Opacity</span>
            <input
              type="range"
              className="flex-1"
              min={0} max={100} step={1}
              value={Math.round(activeLayer.opacity * 100)}
              onChange={(e) => patchLayer(activeLayer.id, { opacity: Number(e.target.value) / 100 })}
            />
            <span className="w-10 text-right">{Math.round(activeLayer.opacity * 100)}%</span>
          </div>
        </div>
      )}
      <div className="flex-1 overflow-y-auto">
        {slot.doc.layers.map((layer, i) => (
          <LayerRow
            key={layer.id}
            layer={layer}
            index={i}
            active={layer.id === active}
            onSelect={() => setActiveLayer(layer.id)}
            onToggleVis={() => patchLayer(layer.id, { visible: !layer.visible })}
            onToggleLock={() => patchLayer(layer.id, { locked: !layer.locked })}
            onRename={(name) => patchLayer(layer.id, { name })}
            onMoveUp={i > 0 ? () => reorder(i, i - 1) : undefined}
            onMoveDown={i < slot.doc.layers.length - 1 ? () => reorder(i, i + 1) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function LayerRow({
  layer, active, onSelect, onToggleVis, onToggleLock, onRename, onMoveUp, onMoveDown,
}: {
  layer: Layer;
  index: number;
  active: boolean;
  onSelect: () => void;
  onToggleVis: () => void;
  onToggleLock: () => void;
  onRename: (n: string) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  return (
    <div
      className={`flex items-center px-2 py-1 gap-2 cursor-pointer text-xs border-b border-ps-border
        ${active ? 'bg-ps-accent/30' : 'hover:bg-ps-panel2'}`}
      onClick={onSelect}
    >
      <button onClick={(e) => { e.stopPropagation(); onToggleVis(); }} className="text-ps-textDim hover:text-ps-text">
        {layer.visible ? <Eye size={12} /> : <EyeOff size={12} />}
      </button>
      <div className="w-8 h-8 bg-ps-panel3 rounded-sm overflow-hidden flex-shrink-0 pc-checker">
        <LayerThumb layer={layer} />
      </div>
      <input
        className="flex-1 bg-transparent border-none outline-none text-ps-text px-1 py-0"
        value={layer.name}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onRename(e.target.value)}
      />
      {layer.locked && <Lock size={10} className="text-ps-textDim" />}
      <div className="flex flex-col gap-0.5 ml-1">
        <button className="text-ps-textDim hover:text-ps-text text-2xs leading-none disabled:opacity-30" disabled={!onMoveUp}
          onClick={(e) => { e.stopPropagation(); onMoveUp?.(); }}>▲</button>
        <button className="text-ps-textDim hover:text-ps-text text-2xs leading-none disabled:opacity-30" disabled={!onMoveDown}
          onClick={(e) => { e.stopPropagation(); onMoveDown?.(); }}>▼</button>
      </div>
    </div>
  );
}

function LayerThumb({ layer }: { layer: Layer }) {
  if (layer.kind !== 'raster') {
    return <div className="w-full h-full flex items-center justify-center text-2xs text-ps-textDim">{layer.kind[0].toUpperCase()}</div>;
  }
  // Build a small preview from the layer's pixel buffer.
  return (
    <ThumbCanvas layer={layer} />
  );
}

function ThumbCanvas({ layer }: { layer: Extract<Layer, { kind: 'raster' }> }) {
  return (
    <canvas
      width={32}
      height={32}
      ref={(node) => {
        if (!node) return;
        const ctx = node.getContext('2d');
        if (!ctx) return;
        const id = new ImageData(layer.pixels.data, layer.pixels.width, layer.pixels.height);
        const off = new OffscreenCanvas(layer.pixels.width, layer.pixels.height);
        off.getContext('2d')!.putImageData(id, 0, 0);
        ctx.imageSmoothingEnabled = true;
        ctx.clearRect(0, 0, 32, 32);
        const ratio = Math.min(32 / layer.pixels.width, 32 / layer.pixels.height);
        const w = layer.pixels.width * ratio;
        const h = layer.pixels.height * ratio;
        ctx.drawImage(off, (32 - w) / 2, (32 - h) / 2, w, h);
      }}
    />
  );
}
