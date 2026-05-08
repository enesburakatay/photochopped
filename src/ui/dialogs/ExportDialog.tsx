import { useState } from 'react';
import { Dialog } from './Dialog';
import type { ExportFormat } from '@/io/export';

export function ExportDialog({ onClose, onConfirm }: {
  onClose: () => void;
  onConfirm: (format: ExportFormat, quality?: number) => void;
}) {
  const [format, setFormat] = useState<ExportFormat>('png');
  const [quality, setQuality] = useState(0.92);
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
            <option value="png">PNG (lossless, with transparency)</option>
            <option value="jpeg">JPEG (lossy, no transparency)</option>
            <option value="webp">WebP (lossy or lossless)</option>
          </select>
        </label>
        {format !== 'png' && (
          <label className="block">
            <span className="text-xs text-ps-textDim">Quality {Math.round(quality * 100)}%</span>
            <input type="range" className="w-full" min={1} max={100} value={quality * 100} onChange={(e) => setQuality(Number(e.target.value) / 100)} />
          </label>
        )}
        <p className="text-2xs text-ps-textDim">
          The composited document is exported. Layers, masks, and selections are preserved only in the .pchop project format.
        </p>
      </div>
    </Dialog>
  );
}
