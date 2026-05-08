import { useEditor } from '@/store/editorStore';

export function StatusBar() {
  const slot = useEditor((s) => s.docs[s.activeDocIndex]);
  if (!slot) return null;
  const layerCount = slot.doc.layers.length;
  const sel = slot.doc.selection ? `${slot.doc.selection.bounds.width}×${slot.doc.selection.bounds.height}` : '—';
  return (
    <div className="h-6 bg-ps-panel border-t border-ps-border px-3 flex items-center justify-between text-2xs text-ps-textDim">
      <div className="flex gap-4">
        <span>Doc: {slot.doc.width}×{slot.doc.height} · {slot.doc.dpi} DPI</span>
        <span>Layers: {layerCount}</span>
        <span>Selection: {sel}</span>
      </div>
      <div className="flex gap-3">
        <span>Zoom {Math.round(slot.viewport.zoom * 100)}%</span>
        <span className="text-ps-success">Ready</span>
      </div>
    </div>
  );
}
