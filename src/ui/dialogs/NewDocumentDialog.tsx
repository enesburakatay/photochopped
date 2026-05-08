import { useState } from 'react';
import { Dialog } from './Dialog';
import { useEditor } from '@/store/editorStore';
import { hexToRgba } from '@/core/color';

const PRESETS = [
  { name: 'Web 1080p', w: 1920, h: 1080 },
  { name: 'Web 720p', w: 1280, h: 720 },
  { name: 'Square 1080', w: 1080, h: 1080 },
  { name: 'Story 1080×1920', w: 1080, h: 1920 },
  { name: 'A4 @ 300dpi', w: 2480, h: 3508 },
  { name: 'Letter @ 300dpi', w: 2550, h: 3300 },
];

export function NewDocumentDialog({ onClose }: { onClose: () => void }) {
  const [w, setW] = useState(1920);
  const [h, setH] = useState(1080);
  const [name, setName] = useState('Untitled');
  const [bg, setBg] = useState('#ffffff');
  const newDocument = useEditor((s) => s.newDocument);

  return (
    <Dialog title="New Document" onClose={onClose} width={520} footer={
      <>
        <button className="pc-btn" onClick={onClose}>Cancel</button>
        <button className="pc-btn-primary" onClick={() => { newDocument(w, h, name, hexToRgba(bg)); onClose(); }}>Create</button>
      </>
    }>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-ps-textDim mb-1">Name</label>
          <input className="w-full" value={name} onChange={(e) => setName(e.target.value)} />
          <label className="block text-xs text-ps-textDim mt-2 mb-1">Width × Height (px)</label>
          <div className="flex gap-2">
            <input type="number" className="w-full" value={w} onChange={(e) => setW(Math.max(1, Number(e.target.value)))} />
            <input type="number" className="w-full" value={h} onChange={(e) => setH(Math.max(1, Number(e.target.value)))} />
          </div>
          <label className="block text-xs text-ps-textDim mt-2 mb-1">Background</label>
          <div className="flex gap-2 items-center">
            <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} />
            <input className="flex-1 font-mono" value={bg} onChange={(e) => setBg(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="block text-xs text-ps-textDim mb-1">Presets</label>
          <div className="flex flex-col gap-1 max-h-56 overflow-y-auto pr-2">
            {PRESETS.map((p) => (
              <button
                key={p.name}
                className="text-left px-2 py-1 text-xs hover:bg-ps-panel3 rounded"
                onClick={() => { setW(p.w); setH(p.h); }}
              >
                <div>{p.name}</div>
                <div className="text-ps-textDim text-2xs">{p.w} × {p.h}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
