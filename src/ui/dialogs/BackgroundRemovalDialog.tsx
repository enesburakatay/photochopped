import { useState } from 'react';
import { Dialog } from './Dialog';
import { useEditor } from '@/store/editorStore';

/**
 * Tuning dialog for the local (offline) background removal. Tolerance controls how
 * far a pixel's color can stray from the sampled edge color and still count as
 * background; Feather softens the cutout edge. Values persist to the store so the
 * one-click toolbar button reuses them.
 */
export function BackgroundRemovalDialog({ onClose }: { onClose: () => void }) {
  const stored = useEditor((s) => s.bgRemoval);
  const setBgRemoval = useEditor((s) => s.setBgRemoval);
  const removeBg = useEditor((s) => s.removeBackgroundFromActive);
  const [tolerance, setTolerance] = useState(stored.tolerance);
  const [feather, setFeather] = useState(stored.feather);

  const apply = () => {
    setBgRemoval({ tolerance, feather });
    removeBg({ tolerance, feather });
    onClose();
  };

  return (
    <Dialog
      title="Remove Background"
      onClose={onClose}
      footer={
        <>
          <button className="pc-btn" onClick={onClose}>Cancel</button>
          <button className="pc-btn-primary" onClick={apply}>Remove</button>
        </>
      }
    >
      <p className="text-ps-textDim mb-3 text-xs leading-relaxed">
        Samples the image border to find the background color, then makes connected
        background pixels transparent. Runs fully offline. Works best on a subject
        over a relatively even background.
      </p>
      <Slider label="Tolerance" value={tolerance} min={2} max={120} step={1}
        onChange={setTolerance} hint="Higher = removes more shades of the background" />
      <Slider label="Edge feather" value={feather} min={0} max={10} step={0.5} suffix="px"
        onChange={setFeather} hint="Softens the cutout edge" />
    </Dialog>
  );
}

function Slider({ label, value, min, max, step = 1, suffix = '', hint, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; suffix?: string; hint?: string; onChange: (v: number) => void;
}) {
  return (
    <label className="block mb-3">
      <span className="flex justify-between text-xs"><span className="text-ps-textDim">{label}</span><span>{value}{suffix}</span></span>
      <input type="range" className="w-full" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <span className="block text-2xs text-ps-textDim mt-0.5">{hint}</span>}
    </label>
  );
}
