import { useState, useRef, useEffect } from 'react';
import type { FilterChoice } from '../dialogs/FilterDialog';
import { useEditor } from '@/store/editorStore';

interface Props {
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onExport: () => void;
  onPaste: () => void;
  onCopy: () => void;
  onApplyFilter: (choice: FilterChoice) => void;
  onRemoveBackground: () => void;
}

interface MenuItem {
  label: string;
  shortcut?: string;
  onClick?: () => void;
  divider?: boolean;
}

export function MenuBar(props: Props) {
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const selectAll = useEditor((s) => s.selectAll);
  const deselect = useEditor((s) => s.deselect);
  const fit = useEditor((s) => s.fitToScreen);
  const setViewport = useEditor((s) => s.setViewport);
  const slot = useEditor((s) => s.docs[s.activeDocIndex]);

  const menus: { label: string; items: MenuItem[] }[] = [
    {
      label: 'File', items: [
        { label: 'New', shortcut: 'Ctrl+N', onClick: props.onNew },
        { label: 'Open…', shortcut: 'Ctrl+O', onClick: props.onOpen },
        { label: '', divider: true },
        { label: 'Save Project', shortcut: 'Ctrl+S', onClick: props.onSave },
        { label: 'Save As…', shortcut: 'Ctrl+Shift+S', onClick: props.onSaveAs },
        { label: 'Export…', shortcut: 'Ctrl+E', onClick: props.onExport },
      ],
    },
    {
      label: 'Edit', items: [
        { label: 'Undo', shortcut: 'Ctrl+Z', onClick: undo },
        { label: 'Redo', shortcut: 'Ctrl+Shift+Z', onClick: redo },
        { label: '', divider: true },
        { label: 'Copy', shortcut: 'Ctrl+C', onClick: props.onCopy },
        { label: 'Paste', shortcut: 'Ctrl+V', onClick: props.onPaste },
      ],
    },
    {
      label: 'Image', items: [
        { label: 'Image Size…', onClick: () => alert('Phase 2: image size dialog') },
        { label: 'Canvas Size…', onClick: () => alert('Phase 2: canvas size dialog') },
        { label: 'Crop to Selection', onClick: () => {
          if (slot?.doc.selection) {
            useEditor.getState().cropDocument(slot.doc.selection.bounds);
          }
        } },
        { label: '', divider: true },
        { label: 'Remove Background', onClick: () => useEditor.getState().removeBackgroundFromActive() },
        { label: 'Remove Background…', onClick: props.onRemoveBackground },
      ],
    },
    {
      label: 'Select', items: [
        { label: 'All', shortcut: 'Ctrl+A', onClick: selectAll },
        { label: 'Deselect', shortcut: 'Ctrl+D', onClick: deselect },
      ],
    },
    {
      label: 'Filter', items: [
        { label: 'Brightness/Contrast…', onClick: () => props.onApplyFilter('brightness-contrast') },
        { label: 'Hue/Saturation…', onClick: () => props.onApplyFilter('hue-saturation') },
        { label: 'Levels…', onClick: () => props.onApplyFilter('levels') },
        { label: '', divider: true },
        { label: 'Gaussian Blur…', onClick: () => props.onApplyFilter('gaussian-blur') },
        { label: 'Sharpen', onClick: () => props.onApplyFilter('sharpen') },
        { label: 'Pixelate…', onClick: () => props.onApplyFilter('pixelate') },
        { label: 'Noise…', onClick: () => props.onApplyFilter('noise') },
        { label: '', divider: true },
        { label: 'Invert', onClick: () => props.onApplyFilter('invert') },
        { label: 'Black & White', onClick: () => props.onApplyFilter('black-white') },
      ],
    },
    {
      label: 'View', items: [
        { label: 'Fit to Screen', shortcut: 'Ctrl+0', onClick: fit },
        { label: 'Zoom 100%', onClick: () => {
          if (slot) setViewport({ ...slot.viewport, zoom: 1 });
        } },
      ],
    },
  ];

  const [open, setOpen] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div ref={ref} className="h-7 flex items-center bg-ps-panel border-b border-ps-border text-xs select-none">
      <div className="px-3 font-semibold text-ps-accent text-sm">Photochopped</div>
      {menus.map((m, i) => (
        <div key={m.label} className="relative">
          <button
            className={`px-2.5 h-7 hover:bg-ps-panel3 ${open === i ? 'bg-ps-panel3' : ''}`}
            onMouseDown={(e) => {
              e.preventDefault();
              setOpen(open === i ? null : i);
            }}
            onMouseEnter={() => { if (open !== null) setOpen(i); }}
          >
            {m.label}
          </button>
          {open === i && (
            <div className="absolute left-0 top-full z-50 min-w-[200px] bg-ps-panel border border-ps-border shadow-2xl py-1">
              {m.items.map((it, j) => it.divider ? (
                <div key={j} className="h-px bg-ps-border my-1" />
              ) : (
                <button
                  key={j}
                  className="w-full px-3 py-1 flex items-center justify-between hover:bg-ps-accent hover:text-white text-left"
                  onClick={() => { it.onClick?.(); setOpen(null); }}
                >
                  <span>{it.label}</span>
                  {it.shortcut && <span className="text-2xs text-ps-textDim ml-6">{it.shortcut}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
