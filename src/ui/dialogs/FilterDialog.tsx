import { useEffect, useState } from 'react';
import { Dialog } from './Dialog';
import { useEditor } from '@/store/editorStore';
import * as filters from '@/filters';

export type FilterChoice =
  | 'brightness-contrast'
  | 'hue-saturation'
  | 'levels'
  | 'gaussian-blur'
  | 'sharpen'
  | 'pixelate'
  | 'noise'
  | 'invert'
  | 'black-white';

export function FilterDialog({ choice, onClose }: { choice: FilterChoice; onClose: () => void }) {
  const apply = useEditor((s) => s.applyFilterToActive);

  // One-shot filters apply immediately and close — done in effect to avoid
  // setState-during-render warnings.
  useEffect(() => {
    if (choice === 'invert') { apply(filters.invert, {}); onClose(); }
    else if (choice === 'black-white') { apply(filters.blackAndWhite, {}); onClose(); }
  }, [choice, apply, onClose]);
  if (choice === 'invert' || choice === 'black-white') return null;

  return (
    <Dialog title={titleFor(choice)} onClose={onClose}>
      {choice === 'brightness-contrast' && <BrightnessContrast onApply={(p) => { apply(filters.brightnessContrast, p); onClose(); }} />}
      {choice === 'hue-saturation' && <HueSat onApply={(p) => { apply(filters.hueSaturation, p); onClose(); }} />}
      {choice === 'levels' && <Levels onApply={(p) => { apply(filters.levels, p); onClose(); }} />}
      {choice === 'gaussian-blur' && <Blur onApply={(p) => { apply(filters.gaussianBlur, p); onClose(); }} />}
      {choice === 'sharpen' && <Sharpen onApply={(p) => { apply(filters.sharpen, p); onClose(); }} />}
      {choice === 'pixelate' && <Pixelate onApply={(p) => { apply(filters.pixelate, p); onClose(); }} />}
      {choice === 'noise' && <Noise onApply={(p) => { apply(filters.noise, p); onClose(); }} />}
    </Dialog>
  );
}

function titleFor(c: FilterChoice): string {
  switch (c) {
    case 'brightness-contrast': return 'Brightness/Contrast';
    case 'hue-saturation': return 'Hue/Saturation';
    case 'levels': return 'Levels';
    case 'gaussian-blur': return 'Gaussian Blur';
    case 'sharpen': return 'Sharpen';
    case 'pixelate': return 'Pixelate';
    case 'noise': return 'Noise';
    default: return c;
  }
}

function Slider({ label, value, min, max, step = 1, suffix = '', onChange }: {
  label: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex justify-between text-xs"><span className="text-ps-textDim">{label}</span><span>{value}{suffix}</span></span>
      <input type="range" className="w-full" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function applyFooter(onApply: () => void) {
  return (
    <div className="flex justify-end mt-3">
      <button className="pc-btn-primary" onClick={onApply}>Apply</button>
    </div>
  );
}

function BrightnessContrast({ onApply }: { onApply: (p: filters.BrightnessContrastParams) => void }) {
  const [p, setP] = useState<filters.BrightnessContrastParams>({ brightness: 0, contrast: 0 });
  return (<>
    <Slider label="Brightness" value={p.brightness} min={-100} max={100} onChange={(v) => setP({ ...p, brightness: v })} />
    <Slider label="Contrast" value={p.contrast} min={-100} max={100} onChange={(v) => setP({ ...p, contrast: v })} />
    {applyFooter(() => onApply(p))}
  </>);
}

function HueSat({ onApply }: { onApply: (p: filters.HueSatParams) => void }) {
  const [p, setP] = useState<filters.HueSatParams>({ hue: 0, saturation: 0, lightness: 0 });
  return (<>
    <Slider label="Hue" value={p.hue} min={-180} max={180} onChange={(v) => setP({ ...p, hue: v })} suffix="°" />
    <Slider label="Saturation" value={p.saturation} min={-100} max={100} onChange={(v) => setP({ ...p, saturation: v })} />
    <Slider label="Lightness" value={p.lightness} min={-100} max={100} onChange={(v) => setP({ ...p, lightness: v })} />
    {applyFooter(() => onApply(p))}
  </>);
}

function Levels({ onApply }: { onApply: (p: filters.LevelsParams) => void }) {
  const [p, setP] = useState<filters.LevelsParams>({ black: 0, white: 255, gamma: 1 });
  return (<>
    <Slider label="Black" value={p.black} min={0} max={254} onChange={(v) => setP({ ...p, black: v })} />
    <Slider label="White" value={p.white} min={1} max={255} onChange={(v) => setP({ ...p, white: v })} />
    <Slider label="Gamma" value={p.gamma} min={0.1} max={5} step={0.05} onChange={(v) => setP({ ...p, gamma: v })} />
    {applyFooter(() => onApply(p))}
  </>);
}

function Blur({ onApply }: { onApply: (p: filters.BlurParams) => void }) {
  const [p, setP] = useState<filters.BlurParams>({ radius: 4 });
  return (<>
    <Slider label="Radius" value={p.radius} min={0} max={64} step={0.5} suffix="px" onChange={(v) => setP({ radius: v })} />
    {applyFooter(() => onApply(p))}
  </>);
}

function Sharpen({ onApply }: { onApply: (p: filters.SharpenParams) => void }) {
  const [p, setP] = useState<filters.SharpenParams>({ amount: 0.5 });
  return (<>
    <Slider label="Amount" value={Math.round(p.amount * 100) / 100} min={0} max={3} step={0.05} onChange={(v) => setP({ amount: v })} />
    {applyFooter(() => onApply(p))}
  </>);
}

function Pixelate({ onApply }: { onApply: (p: filters.PixelateParams) => void }) {
  const [p, setP] = useState<filters.PixelateParams>({ size: 8 });
  return (<>
    <Slider label="Size" value={p.size} min={2} max={64} onChange={(v) => setP({ size: v })} suffix="px" />
    {applyFooter(() => onApply(p))}
  </>);
}

function Noise({ onApply }: { onApply: (p: filters.NoiseParams) => void }) {
  const [p, setP] = useState<filters.NoiseParams>({ amount: 25, monochrome: false });
  return (<>
    <Slider label="Amount" value={p.amount} min={0} max={128} onChange={(v) => setP({ ...p, amount: v })} />
    <label className="flex items-center gap-2 text-xs mt-2">
      <input type="checkbox" checked={p.monochrome} onChange={(e) => setP({ ...p, monochrome: e.target.checked })} />
      Monochromatic
    </label>
    {applyFooter(() => onApply(p))}
  </>);
}
