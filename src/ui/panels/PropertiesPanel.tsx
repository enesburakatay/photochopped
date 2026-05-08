import { useEditor } from '@/store/editorStore';

export function PropertiesPanel() {
  const slot = useEditor((s) => s.docs[s.activeDocIndex]);
  if (!slot) return null;
  const sel = slot.doc.selection;
  return (
    <div className="border-t border-ps-border">
      <div className="pc-panel-header">Properties</div>
      <div className="p-2 text-xs space-y-1">
        <Row label="Document" value={slot.doc.name} />
        <Row label="Size" value={`${slot.doc.width} × ${slot.doc.height} px`} />
        <Row label="Profile" value={slot.doc.colorProfile.toUpperCase()} />
        <Row label="DPI" value={String(slot.doc.dpi)} />
        <Row label="Selection" value={sel ? `${sel.bounds.width} × ${sel.bounds.height}` : 'none'} />
        <Row label="Active layer" value={slot.doc.layers.find((l) => l.id === slot.doc.activeLayerId)?.name ?? '—'} />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-ps-textDim">{label}</span>
      <span className="truncate" title={value}>{value}</span>
    </div>
  );
}
