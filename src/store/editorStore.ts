import { create } from 'zustand';
import type { Document, RGBA, Selection, Layer, Rect } from '@/core/types';
import type { ToolId } from '@/tools/types';
import { History } from '@/core/history';
import {
  createDocument,
  createRasterLayer,
  findLayer,
  nextLayerName,
  selectionFromRect,
  selectionFromEllipse,
} from '@/core/document';
import {
  addLayer as addLayerOp,
  removeLayerById,
  patchLayer as patchLayerOp,
  duplicateLayer,
  reorderLayer,
  copyPixelTile,
  pasteTile,
} from '@/core/layerOps';
import { uid } from '@/core/id';
import { BLACK, WHITE } from '@/core/color';
import { strokeLine, type BrushSettings, type EraserSettings } from '@/tools/brushEngine';
import { findPreset, type BrushPresetId } from '@/tools/brushPresets';
import { floodFill } from '@/tools/fill';
import type { ViewportState } from '@/engine/viewport';
import { fitDocument, makeViewport } from '@/engine/viewport';
import type { FilterDescriptor } from '@/filters';

/**
 * Editor store: the single source of truth for the React UI. Keeps:
 *   - documents (multi-tab support)
 *   - active document index
 *   - per-document history
 *   - per-document viewport state
 *   - global tool + tool settings
 *   - global colors
 *
 * Documents are immutable values; we replace the entire doc on each edit. Pixel
 * buffers are shared by reference where unchanged, but we increment a `rev` counter
 * any time a layer's pixels mutate so the renderer can invalidate its cache.
 */

export interface DocSlot {
  doc: Document;
  history: History;
  viewport: ViewportState;
  rev: number;
}

export interface EditorState {
  // ---- Multi-document
  docs: DocSlot[];
  activeDocIndex: number;
  // ---- Tool + colors
  tool: ToolId;
  foreground: RGBA;
  background: RGBA;
  // ---- Tool settings
  brush: BrushSettings;
  eraser: EraserSettings;
  brushPreset: BrushPresetId;
  fillTolerance: number;
  fillContiguous: boolean;
  // ---- UI state
  showGrid: boolean;
  showRulers: boolean;
  // ---- Actions
  newDocument: (width: number, height: number, name?: string, bg?: RGBA) => void;
  openDocument: (doc: Document) => void;
  closeDocument: (index: number) => void;
  setActiveDoc: (index: number) => void;
  renameDocument: (index: number, name: string) => void;
  setTool: (id: ToolId) => void;
  setForeground: (c: RGBA) => void;
  setBackground: (c: RGBA) => void;
  swapColors: () => void;
  setBrush: (b: Partial<BrushSettings>) => void;
  setEraser: (e: Partial<EraserSettings>) => void;
  setBrushPreset: (id: BrushPresetId) => void;
  setFillSettings: (s: { tolerance?: number; contiguous?: boolean }) => void;
  setViewport: (v: ViewportState) => void;
  fitToScreen: () => void;
  // ---- Doc mutations
  addLayer: (atIndex?: number) => void;
  removeActiveLayer: () => void;
  duplicateActiveLayer: () => void;
  setActiveLayer: (id: string) => void;
  reorderLayer: (from: number, to: number) => void;
  patchLayer: (id: string, patch: Partial<Layer>) => void;
  setSelection: (sel: Selection | null) => void;
  selectAll: () => void;
  deselect: () => void;
  // ---- Painting
  beginStroke: () => void;
  paintStroke: (a: { x: number; y: number }, b: { x: number; y: number }, mode: 'paint' | 'erase') => void;
  endStroke: () => void;
  // ---- Bucket fill
  bucketFill: (x: number, y: number, color: RGBA) => void;
  // ---- Marquee selection
  marquee: (rect: Rect, mode: 'rect' | 'ellipse') => void;
  // ---- Crop
  cropDocument: (rect: Rect) => void;
  // ---- Filters
  applyFilterToActive: <P>(filter: FilterDescriptor<P>, params: P) => void;
  // ---- History
  undo: () => void;
  redo: () => void;
  // ---- Misc
  bumpRev: () => void;
}

const initialDoc = createDocument(1280, 720, 'Untitled');
const initialVp = makeViewport();

// Track "in-progress" stroke snapshot for history.
const strokeState: { layerId: string | null; before: { x: number; y: number; img: import('@/core/types').ImageDataLike } | null; rect: Rect | null } = {
  layerId: null,
  before: null,
  rect: null,
};

export const useEditor = create<EditorState>((set, get) => ({
  docs: [{ doc: initialDoc, history: new History(), viewport: initialVp, rev: 1 }],
  activeDocIndex: 0,
  tool: 'brush',
  foreground: BLACK,
  background: WHITE,
  brush: { radius: 12, hardness: 0.8, opacity: 1, flow: 1, spacing: 0.1, color: BLACK, tipMode: 'normal' },
  eraser: { radius: 24, hardness: 0.8, opacity: 1, spacing: 0.1 },
  brushPreset: 'standard',
  fillTolerance: 32,
  fillContiguous: true,
  showGrid: false,
  showRulers: false,

  newDocument(width, height, name, bg) {
    const doc = createDocument(width, height, name, bg);
    set((s) => ({
      docs: [...s.docs, { doc, history: new History(), viewport: makeViewport(), rev: 1 }],
      activeDocIndex: s.docs.length,
    }));
  },

  openDocument(doc) {
    set((s) => ({
      docs: [...s.docs, { doc, history: new History(), viewport: makeViewport(), rev: 1 }],
      activeDocIndex: s.docs.length,
    }));
  },

  closeDocument(index) {
    set((s) => {
      const docs = s.docs.filter((_, i) => i !== index);
      const activeDocIndex = Math.max(0, Math.min(index, docs.length - 1));
      if (docs.length === 0) {
        const fresh = createDocument(1280, 720, 'Untitled');
        return { docs: [{ doc: fresh, history: new History(), viewport: makeViewport(), rev: 1 }], activeDocIndex: 0 };
      }
      return { docs, activeDocIndex };
    });
  },

  setActiveDoc(index) {
    set({ activeDocIndex: index });
  },

  renameDocument(index, name) {
    set((s) => {
      const docs = [...s.docs];
      docs[index] = { ...docs[index], doc: { ...docs[index].doc, name } };
      return { docs };
    });
  },

  setTool(id) { set({ tool: id }); },
  setForeground(c) { set({ foreground: c, brush: { ...get().brush, color: c } }); },
  setBackground(c) { set({ background: c }); },
  swapColors() { set((s) => ({ foreground: s.background, background: s.foreground, brush: { ...s.brush, color: s.background } })); },
  setBrush(b) { set((s) => ({ brush: { ...s.brush, ...b } })); },
  setEraser(e) { set((s) => ({ eraser: { ...s.eraser, ...e } })); },
  setBrushPreset(id) {
    const preset = findPreset(id);
    set((s) => ({ brushPreset: id, brush: preset.apply(s.brush) }));
  },
  setFillSettings(p) { set({ fillTolerance: p.tolerance ?? get().fillTolerance, fillContiguous: p.contiguous ?? get().fillContiguous }); },

  setViewport(v) {
    set((s) => {
      const docs = [...s.docs];
      docs[s.activeDocIndex] = { ...docs[s.activeDocIndex], viewport: v };
      return { docs };
    });
  },

  fitToScreen() {
    set((s) => {
      const docs = [...s.docs];
      const slot = docs[s.activeDocIndex];
      docs[s.activeDocIndex] = { ...slot, viewport: fitDocument(slot.viewport, slot.doc.width, slot.doc.height) };
      return { docs };
    });
  },

  addLayer(atIndex) {
    set((s) => mutateActiveDoc(s, (slot) => {
      const layer = createRasterLayer(slot.doc.width, slot.doc.height, nextLayerName(slot.doc.layers));
      const nextDoc = addLayerOp(slot.doc, layer, atIndex ?? 0);
      slot.history.push('Add Layer', { type: 'add-layer', layer, index: atIndex ?? 0 });
      return { ...slot, doc: nextDoc, rev: slot.rev + 1 };
    }));
  },

  removeActiveLayer() {
    set((s) => mutateActiveDoc(s, (slot) => {
      const id = slot.doc.activeLayerId;
      if (!id) return slot;
      const idx = slot.doc.layers.findIndex((l) => l.id === id);
      if (idx < 0) return slot;
      const removed = slot.doc.layers[idx];
      const nextDoc = removeLayerById(slot.doc, id);
      slot.history.push('Delete Layer', { type: 'remove-layer', layer: removed, index: idx });
      return { ...slot, doc: nextDoc, rev: slot.rev + 1 };
    }));
  },

  duplicateActiveLayer() {
    set((s) => mutateActiveDoc(s, (slot) => {
      const id = slot.doc.activeLayerId;
      if (!id) return slot;
      const nextDoc = duplicateLayer(slot.doc, id);
      // history: simplified — record by capturing state before/after
      slot.history.push('Duplicate Layer', { type: 'add-layer', layer: nextDoc.layers[0], index: 0 });
      return { ...slot, doc: nextDoc, rev: slot.rev + 1 };
    }));
  },

  setActiveLayer(id) {
    set((s) => mutateActiveDoc(s, (slot) => ({ ...slot, doc: { ...slot.doc, activeLayerId: id } })));
  },

  reorderLayer(from, to) {
    set((s) => mutateActiveDoc(s, (slot) => {
      const nextDoc = reorderLayer(slot.doc, from, to);
      slot.history.push('Reorder Layer', { type: 'reorder-layer', from, to });
      return { ...slot, doc: nextDoc, rev: slot.rev + 1 };
    }));
  },

  patchLayer(id, patch) {
    set((s) => mutateActiveDoc(s, (slot) => {
      const before = findLayer(slot.doc.layers, id);
      if (!before) return slot;
      const beforePatch: Partial<Layer> = {};
      for (const key of Object.keys(patch) as (keyof Layer)[]) {
        // @ts-expect-error narrowed at runtime
        beforePatch[key] = before[key];
      }
      const nextDoc = patchLayerOp(slot.doc, id, patch);
      slot.history.push('Edit Layer', { type: 'patch-layer', id, before: beforePatch, after: patch });
      return { ...slot, doc: nextDoc, rev: slot.rev + 1 };
    }));
  },

  setSelection(sel) {
    set((s) => mutateActiveDoc(s, (slot) => {
      slot.history.push('Set Selection', { type: 'set-selection', before: slot.doc.selection, after: sel });
      return { ...slot, doc: { ...slot.doc, selection: sel }, rev: slot.rev + 1 };
    }));
  },

  selectAll() {
    const slot = get().docs[get().activeDocIndex];
    get().setSelection(selectionFromRect({ x: 0, y: 0, width: slot.doc.width, height: slot.doc.height }));
  },

  deselect() {
    get().setSelection(null);
  },

  beginStroke() {
    const s = get();
    const slot = s.docs[s.activeDocIndex];
    const id = slot.doc.activeLayerId;
    if (!id) return;
    const layer = findLayer(slot.doc.layers, id);
    if (!layer || layer.kind !== 'raster') return;
    strokeState.layerId = id;
    strokeState.before = {
      x: 0,
      y: 0,
      img: { width: layer.pixels.width, height: layer.pixels.height, data: new Uint8ClampedArray(layer.pixels.data) },
    };
    strokeState.rect = null;
  },

  paintStroke(a, b, mode) {
    const s = get();
    const slot = s.docs[s.activeDocIndex];
    if (!strokeState.layerId) return;
    const layer = findLayer(slot.doc.layers, strokeState.layerId);
    if (!layer || layer.kind !== 'raster') return;
    const settings = mode === 'paint' ? s.brush : s.eraser;
    const color = mode === 'paint' ? s.foreground : null;
    const r = strokeLine(layer.pixels, a.x, a.y, b.x, b.y, mode, settings, color, slot.doc.selection);
    if (!strokeState.rect) strokeState.rect = r;
    else {
      const x = Math.min(strokeState.rect.x, r.x);
      const y = Math.min(strokeState.rect.y, r.y);
      const right = Math.max(strokeState.rect.x + strokeState.rect.width, r.x + r.width);
      const bottom = Math.max(strokeState.rect.y + strokeState.rect.height, r.y + r.height);
      strokeState.rect = { x, y, width: right - x, height: bottom - y };
    }
    set((st) => mutateActiveDoc(st, (sl) => ({ ...sl, rev: sl.rev + 1 })));
  },

  endStroke() {
    const s = get();
    const slot = s.docs[s.activeDocIndex];
    if (!strokeState.layerId || !strokeState.before || !strokeState.rect) {
      strokeState.layerId = null;
      strokeState.before = null;
      strokeState.rect = null;
      return;
    }
    const layer = findLayer(slot.doc.layers, strokeState.layerId);
    if (!layer || layer.kind !== 'raster') return;
    const r = strokeState.rect;
    const beforeTile = copyPixelTile(strokeState.before.img, r);
    const afterTile = copyPixelTile(layer.pixels, r);
    slot.history.push(s.tool === 'eraser' ? 'Erase' : 'Paint', {
      type: 'paint-tile',
      layerId: strokeState.layerId,
      x: r.x,
      y: r.y,
      before: beforeTile,
      after: afterTile,
    });
    strokeState.layerId = null;
    strokeState.before = null;
    strokeState.rect = null;
  },

  bucketFill(x, y, color) {
    set((s) => mutateActiveDoc(s, (slot) => {
      const id = slot.doc.activeLayerId;
      if (!id) return slot;
      const layer = findLayer(slot.doc.layers, id);
      if (!layer || layer.kind !== 'raster') return slot;
      const before = { width: layer.pixels.width, height: layer.pixels.height, data: new Uint8ClampedArray(layer.pixels.data) };
      const r = floodFill(layer.pixels, { x, y }, color, get().fillTolerance, slot.doc.selection, get().fillContiguous);
      if (r.width > 0 && r.height > 0) {
        slot.history.push('Bucket Fill', {
          type: 'paint-tile',
          layerId: id,
          x: r.x,
          y: r.y,
          before: copyPixelTile(before, r),
          after: copyPixelTile(layer.pixels, r),
        });
      }
      return { ...slot, rev: slot.rev + 1 };
    }));
  },

  marquee(rect, mode) {
    const sel = mode === 'rect' ? selectionFromRect(rect) : selectionFromEllipse(rect);
    get().setSelection(sel);
  },

  cropDocument(rect) {
    set((s) => mutateActiveDoc(s, (slot) => {
      const x = Math.max(0, Math.floor(rect.x));
      const y = Math.max(0, Math.floor(rect.y));
      const w = Math.max(1, Math.min(slot.doc.width - x, Math.round(rect.width)));
      const h = Math.max(1, Math.min(slot.doc.height - y, Math.round(rect.height)));
      const beforeLayers = slot.doc.layers;
      const newLayers: Layer[] = slot.doc.layers.map((l): Layer => {
        if (l.kind !== 'raster') return l;
        const newPixels = { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
        // Source rect in layer-local space, accounting for layer offset.
        const srcX = x - l.x;
        const srcY = y - l.y;
        const tile = copyPixelTile(l.pixels, { x: srcX, y: srcY, width: w, height: h });
        pasteTile(newPixels, tile, 0, 0);
        return { ...l, x: 0, y: 0, pixels: newPixels };
      });
      slot.history.push('Crop', {
        type: 'crop-document',
        before: { width: slot.doc.width, height: slot.doc.height, layers: beforeLayers },
        after: { x, y, width: w, height: h },
      });
      const nextDoc: Document = { ...slot.doc, layers: newLayers, width: w, height: h, modifiedAt: Date.now() };
      const newViewport = fitDocument(slot.viewport, w, h);
      return { ...slot, doc: nextDoc, viewport: newViewport, rev: slot.rev + 1 };
    }));
  },

  applyFilterToActive<P>(filter: FilterDescriptor<P>, params: P) {
    set((s) => mutateActiveDoc(s, (slot) => {
      const id = slot.doc.activeLayerId;
      if (!id) return slot;
      const layer = findLayer(slot.doc.layers, id);
      if (!layer || layer.kind !== 'raster') return slot;
      const before = copyPixelTile(layer.pixels, { x: 0, y: 0, width: layer.pixels.width, height: layer.pixels.height });
      filter.apply(layer.pixels, params);
      const after = copyPixelTile(layer.pixels, { x: 0, y: 0, width: layer.pixels.width, height: layer.pixels.height });
      slot.history.push(filter.name, { type: 'paint-tile', layerId: id, x: 0, y: 0, before, after });
      return { ...slot, rev: slot.rev + 1 };
    }));
  },

  undo() {
    set((s) => mutateActiveDoc(s, (slot) => {
      const nextDoc = slot.history.undo(slot.doc);
      return { ...slot, doc: nextDoc, rev: slot.rev + 1 };
    }));
  },

  redo() {
    set((s) => mutateActiveDoc(s, (slot) => {
      const nextDoc = slot.history.redo(slot.doc);
      return { ...slot, doc: nextDoc, rev: slot.rev + 1 };
    }));
  },

  bumpRev() {
    set((s) => mutateActiveDoc(s, (slot) => ({ ...slot, rev: slot.rev + 1 })));
  },
}));

function mutateActiveDoc(state: EditorState, fn: (slot: DocSlot) => DocSlot): Partial<EditorState> {
  const docs = [...state.docs];
  const slot = docs[state.activeDocIndex];
  if (!slot) return {};
  docs[state.activeDocIndex] = fn(slot);
  return { docs };
}

// Convenience selectors.
export const selectActiveSlot = (s: EditorState): DocSlot | undefined => s.docs[s.activeDocIndex];
export const selectActiveDoc = (s: EditorState): Document | undefined => s.docs[s.activeDocIndex]?.doc;

// Generate a unique-ish doc id helper for the UI.
export function newDocSlotId(): string {
  return uid('doc_');
}
