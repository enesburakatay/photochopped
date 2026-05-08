import type { Document, HistoryCommand, HistoryEntry, Layer } from './types';
import { addLayer, removeLayerById, reorderLayer, patchLayer, pasteTile } from './layerOps';
import { findLayer } from './document';
import { uid } from './id';

/**
 * History: bounded undo/redo using the command pattern.
 *
 * Each entry stores a reversible command + minimal before/after state. For paint
 * strokes we store *tile* snapshots (the modified rectangle of pixels), not the
 * whole layer — keeps memory bounded for large images. The history stack itself
 * is capped at N entries (configurable in settings) and FIFO-evicts.
 */

export const DEFAULT_HISTORY_LIMIT = 100;

export class History {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private limit: number;

  constructor(limit = DEFAULT_HISTORY_LIMIT) {
    this.limit = limit;
  }

  push(label: string, command: HistoryCommand): HistoryEntry {
    const entry: HistoryEntry = {
      id: uid('h_'),
      label,
      command,
      timestamp: Date.now(),
    };
    this.undoStack.push(entry);
    while (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
    return entry;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(doc: Document): Document {
    const entry = this.undoStack.pop();
    if (!entry) return doc;
    this.redoStack.push(entry);
    return applyCommand(doc, entry.command, true);
  }

  redo(doc: Document): Document {
    const entry = this.redoStack.pop();
    if (!entry) return doc;
    this.undoStack.push(entry);
    return applyCommand(doc, entry.command, false);
  }

  // For UI display — newest first.
  list(): { entries: HistoryEntry[]; cursor: number } {
    const entries = [...this.undoStack, ...this.redoStack].slice().reverse();
    return { entries, cursor: this.redoStack.length };
  }

  jumpTo(doc: Document, entryId: string): Document {
    // Walk undo or redo until the cursor sits just after entryId.
    while (this.undoStack.at(-1) && this.undoStack.at(-1)!.id !== entryId) {
      doc = this.undo(doc);
      if (this.undoStack.length === 0) break;
    }
    return doc;
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }
}

function applyCommand(doc: Document, cmd: HistoryCommand, reverse: boolean): Document {
  switch (cmd.type) {
    case 'add-layer':
      return reverse ? removeLayerById(doc, cmd.layer.id) : addLayer(doc, cmd.layer, cmd.index);
    case 'remove-layer':
      return reverse ? addLayer(doc, cmd.layer, cmd.index) : removeLayerById(doc, cmd.layer.id);
    case 'reorder-layer':
      return reverse ? reorderLayer(doc, cmd.to, cmd.from) : reorderLayer(doc, cmd.from, cmd.to);
    case 'patch-layer':
      return patchLayer(doc, cmd.id, (reverse ? cmd.before : cmd.after) as Partial<Layer>);
    case 'paint-tile': {
      const layer = findLayer(doc.layers, cmd.layerId);
      if (!layer || layer.kind !== 'raster') return doc;
      const tile = reverse ? cmd.before : cmd.after;
      pasteTile(layer.pixels, tile, cmd.x, cmd.y);
      // Mutate-in-place but bump rev via spread so caller sees a new doc reference.
      return { ...doc, modifiedAt: Date.now() };
    }
    case 'set-selection':
      return { ...doc, selection: reverse ? cmd.before : cmd.after, modifiedAt: Date.now() };
    case 'resize-document':
      // Simple resize swap; pixel re-fit is handled by the caller upstream.
      return reverse
        ? { ...doc, width: cmd.before.width, height: cmd.before.height, modifiedAt: Date.now() }
        : { ...doc, width: cmd.after.width, height: cmd.after.height, modifiedAt: Date.now() };
    case 'crop-document':
      // Crop is not perfectly reversible without re-storing all layers; we store
      // the previous layer set in `before.layers` for restoration on undo.
      if (reverse) {
        return {
          ...doc,
          width: cmd.before.width,
          height: cmd.before.height,
          layers: cmd.before.layers,
          modifiedAt: Date.now(),
        };
      }
      return doc; // forward-apply happens at the call site
  }
}
