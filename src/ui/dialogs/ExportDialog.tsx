import { useState } from 'react';
import { Dialog } from './Dialog';
import { EXPORT_FORMATS, type ExportFormat } from '@/io/export';

export function ExportDialog({ onClose, onConfirm }: {
  onClose: () => void;
  onConfirm: (format: ExportFormat, quality?: number) => void;
}) {
  const [format, setFormat] = useState<ExportFormat>('png');
  const [quality, setQuality] = useState(0.92);
  const meta = EXPORT_FORMATS.find((f) => f.id === format)!;

  return (
    <Dialog title="Export" onClose={onClose} footer={
      <>
        <button className="pc-btn" onClick={onClose}>Cancel</button>
        <button className="pc-btn-primary" onClick={() => onConfirm(format, quality)}>Export</button>
      </>
    }>
      <div className="space-y-3">
        <label className="block">
          <span className="text-xs text-ps-textDim">Format</span>
          <select className="w-full mt-1" value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)}>
            {EXPORT_FORMATS.map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </select>
        </label>
        {meta.hasQuality && (
          <label className="block">
            <span className="text-xs text-ps-textDim">Quality {Math.round(quality * 100)}%</span>
            <input
              type="range"
              className="w-full"
              min={1}
              max={100}
              value={quality * 100}
              onChange={(e) => setQuality(Number(e.target.value) / 100)}
            />
          </label>
        )}
        {meta.notes && <p className="text-2xs text-ps-textDim">{meta.notes}</p>}
        <p className="text-2xs text-ps-textDim">
          The composited document is exported. Layers, masks, and selections are preserved only in the .pchop project format.
        </p>
      </div>
    </Dialog>
  );
}
