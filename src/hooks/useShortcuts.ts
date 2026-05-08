import { useEffect } from 'react';
import { useEditor } from '@/store/editorStore';
import type { ToolId } from '@/tools/types';

/**
 * Photoshop-style keyboard shortcuts. Single-letter tool toggles, Ctrl/Cmd combos
 * for menu actions. We register on window so all panels except form inputs see them.
 */

const TOOL_KEYS: Record<string, ToolId> = {
  v: 'move',
  m: 'marquee-rect',
  l: 'lasso',
  w: 'magic-wand',
  c: 'crop',
  i: 'eyedropper',
  b: 'brush',
  e: 'eraser',
  g: 'fill',
  t: 'text',
  h: 'hand',
  z: 'zoom',
  r: 'shape-rect',
};

export function useShortcuts(opts: {
  onSave: () => void;
  onSaveAs: () => void;
  onExport: () => void;
  onOpen: () => void;
  onNew: () => void;
}): void {
  const setTool = useEditor((s) => s.setTool);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const swapColors = useEditor((s) => s.swapColors);
  const selectAll = useEditor((s) => s.selectAll);
  const deselect = useEditor((s) => s.deselect);
  const duplicate = useEditor((s) => s.duplicateActiveLayer);
  const setBrush = useEditor((s) => s.setBrush);
  const setEraser = useEditor((s) => s.setEraser);
  const tool = useEditor((s) => s.tool);
  const fitToScreen = useEditor((s) => s.fitToScreen);
  const setForeground = useEditor((s) => s.setForeground);
  const setBackground = useEditor((s) => s.setBackground);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      const meta = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();

      // Menu shortcuts.
      if (meta && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (meta && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }
      if (meta && k === 's') { e.preventDefault(); e.shiftKey ? opts.onSaveAs() : opts.onSave(); return; }
      if (meta && k === 'e') { e.preventDefault(); opts.onExport(); return; }
      if (meta && k === 'o') { e.preventDefault(); opts.onOpen(); return; }
      if (meta && k === 'n') { e.preventDefault(); opts.onNew(); return; }
      if (meta && k === 'a') { e.preventDefault(); selectAll(); return; }
      if (meta && k === 'd') { e.preventDefault(); deselect(); return; }
      if (meta && k === 'j') { e.preventDefault(); duplicate(); return; }
      if (meta && k === '0') { e.preventDefault(); fitToScreen(); return; }

      // Color reset / swap.
      if (k === 'd' && !meta) {
        setForeground({ r: 0, g: 0, b: 0, a: 1 });
        setBackground({ r: 255, g: 255, b: 255, a: 1 });
        return;
      }
      if (k === 'x' && !meta) { swapColors(); return; }

      // Brush size with [ ]
      if (k === '[') {
        if (tool === 'eraser') setEraser({ radius: Math.max(1, useEditor.getState().eraser.radius - 2) });
        else setBrush({ radius: Math.max(1, useEditor.getState().brush.radius - 2) });
        return;
      }
      if (k === ']') {
        if (tool === 'eraser') setEraser({ radius: Math.min(1024, useEditor.getState().eraser.radius + 2) });
        else setBrush({ radius: Math.min(1024, useEditor.getState().brush.radius + 2) });
        return;
      }

      // Tools.
      if (TOOL_KEYS[k] && !meta) {
        e.preventDefault();
        setTool(TOOL_KEYS[k]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setTool, undo, redo, swapColors, selectAll, deselect, duplicate, setBrush, setEraser, tool, fitToScreen, setBackground, setForeground, opts]);
}
