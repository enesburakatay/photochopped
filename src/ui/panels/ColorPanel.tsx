import { useEditor } from '@/store/editorStore';
import { hexToRgba, rgbaToCss, rgbaToHex } from '@/core/color';

export function ColorPanel() {
  const fg = useEditor((s) => s.foreground);
  const bg = useEditor((s) => s.background);
  const setFg = useEditor((s) => s.setForeground);
  const setBg = useEditor((s) => s.setBackground);

  return (
    <div>
      <div className="pc-panel-header">Color</div>
      <div className="p-2 space-y-2">
        <div className="flex items-center gap-2">
          <span className="w-12 text-xs text-ps-textDim">FG</span>
          <button
            className="w-7 h-7 border border-ps-border"
            style={{ background: rgbaToCss(fg) }}
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'color';
              input.value = rgbaToHex(fg);
              input.onchange = () => setFg(hexToRgba(input.value));
              input.click();
            }}
          />
          <input
            type="text"
            className="flex-1 font-mono"
            value={rgbaToHex(fg)}
            onChange={(e) => setFg(hexToRgba(e.target.value))}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="w-12 text-xs text-ps-textDim">BG</span>
          <button
            className="w-7 h-7 border border-ps-border"
            style={{ background: rgbaToCss(bg) }}
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'color';
              input.value = rgbaToHex(bg);
              input.onchange = () => setBg(hexToRgba(input.value));
              input.click();
            }}
          />
          <input
            type="text"
            className="flex-1 font-mono"
            value={rgbaToHex(bg)}
            onChange={(e) => setBg(hexToRgba(e.target.value))}
          />
        </div>
        <ChannelSlider label="R" value={fg.r} onChange={(v) => setFg({ ...fg, r: v })} />
        <ChannelSlider label="G" value={fg.g} onChange={(v) => setFg({ ...fg, g: v })} />
        <ChannelSlider label="B" value={fg.b} onChange={(v) => setFg({ ...fg, b: v })} />
        <ChannelSlider label="A" value={Math.round(fg.a * 100)} max={100} onChange={(v) => setFg({ ...fg, a: v / 100 })} />
        <Swatches onPick={setFg} />
      </div>
    </div>
  );
}

function ChannelSlider({ label, value, max = 255, onChange }: { label: string; value: number; max?: number; onChange: (v: number) => void; }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-4 text-ps-textDim">{label}</span>
      <input type="range" className="flex-1" min={0} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <input type="number" className="w-12" min={0} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

const PRESETS = [
  '#000000', '#ffffff', '#ff0000', '#ff7f00', '#ffff00', '#7fff00',
  '#00ff00', '#00ff7f', '#00ffff', '#007fff', '#0000ff', '#7f00ff',
  '#ff00ff', '#ff007f', '#888888', '#cccccc',
];

function Swatches({ onPick }: { onPick: (c: import('@/core/types').RGBA) => void }) {
  return (
    <div>
      <div className="text-2xs text-ps-textDim mb-1 mt-1">Swatches</div>
      <div className="grid grid-cols-8 gap-0.5">
        {PRESETS.map((hex) => (
          <button
            key={hex}
            className="aspect-square border border-ps-border"
            style={{ background: hex }}
            onClick={() => onPick(hexToRgba(hex))}
            title={hex}
          />
        ))}
      </div>
    </div>
  );
}
