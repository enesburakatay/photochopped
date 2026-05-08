import { describe, expect, it } from 'vitest';
import {
  createDocument,
  createRasterLayer,
  findLayer,
  selectionFromRect,
  isPointSelected,
  flattenLayers,
} from '../document';
import { addLayer, removeLayerById, patchLayer, copyPixelTile, pasteTile } from '../layerOps';
import { History } from '../history';
import { BLACK, WHITE, hexToRgba, rgbaToHex, rgbToHsl, hslToRgb } from '../color';

describe('document', () => {
  it('creates a document with a locked background layer', () => {
    const d = createDocument(100, 50, 'Test');
    expect(d.width).toBe(100);
    expect(d.height).toBe(50);
    expect(d.layers).toHaveLength(1);
    expect(d.layers[0].locked).toBe(true);
    expect(d.activeLayerId).toBe(d.layers[0].id);
  });

  it('finds layers by id even nested in groups', () => {
    const d = createDocument(10, 10);
    const child = createRasterLayer(10, 10, 'Child');
    const group = {
      kind: 'group' as const,
      id: 'g1', name: 'Group', visible: true, locked: false, opacity: 1, blendMode: 'normal' as const,
      x: 0, y: 0, collapsed: false, children: [child], mask: null,
    };
    d.layers.push(group);
    expect(findLayer(d.layers, child.id)?.id).toBe(child.id);
  });
});

describe('layer ops', () => {
  it('adds and removes layers', () => {
    let d = createDocument(10, 10);
    const layer = createRasterLayer(10, 10);
    d = addLayer(d, layer, 0);
    expect(d.layers[0].id).toBe(layer.id);
    d = removeLayerById(d, layer.id);
    expect(d.layers.find((l) => l.id === layer.id)).toBeUndefined();
  });

  it('patches a layer immutably', () => {
    let d = createDocument(10, 10);
    const id = d.layers[0].id;
    d = patchLayer(d, id, { opacity: 0.5 });
    expect(d.layers[0].opacity).toBe(0.5);
  });

  it('flattens nested groups', () => {
    const a = createRasterLayer(10, 10, 'A');
    const b = createRasterLayer(10, 10, 'B');
    const g = {
      kind: 'group' as const,
      id: 'g', name: 'G', visible: true, locked: false, opacity: 1, blendMode: 'normal' as const,
      x: 0, y: 0, collapsed: false, children: [a, b], mask: null,
    };
    expect(flattenLayers([g])).toHaveLength(3);
  });
});

describe('color', () => {
  it('round-trips hex/rgba', () => {
    const c = hexToRgba('#3aa1ff');
    expect(c.r).toBe(0x3a);
    expect(c.g).toBe(0xa1);
    expect(c.b).toBe(0xff);
    expect(rgbaToHex(c)).toBe('#3aa1ff');
  });

  it('round-trips rgb/hsl approximately', () => {
    const hsl = rgbToHsl({ r: 200, g: 100, b: 50 });
    const back = hslToRgb(hsl);
    expect(Math.abs(back.r - 200)).toBeLessThan(2);
    expect(Math.abs(back.g - 100)).toBeLessThan(2);
    expect(Math.abs(back.b - 50)).toBeLessThan(2);
  });

  it('exports BLACK and WHITE', () => {
    expect(BLACK.r).toBe(0);
    expect(WHITE.r).toBe(255);
  });
});

describe('selection', () => {
  it('builds rect selection mask', () => {
    const sel = selectionFromRect({ x: 10, y: 10, width: 20, height: 20 });
    expect(sel.mask.length).toBe(400);
    expect(isPointSelected(sel, 15, 15)).toBe(255);
    expect(isPointSelected(sel, 5, 5)).toBe(0);
  });

  it('treats null selection as fully selected', () => {
    expect(isPointSelected(null, 0, 0)).toBe(255);
  });
});

describe('pixel tile copy/paste', () => {
  it('round-trips a pixel rect', () => {
    const layer = createRasterLayer(10, 10);
    layer.pixels.data[0] = 255; // tweak (0,0)
    const tile = copyPixelTile(layer.pixels, { x: 0, y: 0, width: 4, height: 4 });
    const target = createRasterLayer(10, 10).pixels;
    pasteTile(target, tile, 5, 5);
    expect(target.data[(5 * 10 + 5) * 4]).toBe(255);
  });
});

describe('history', () => {
  it('round-trips undo/redo', () => {
    let d = createDocument(10, 10);
    const h = new History();
    const layer = createRasterLayer(10, 10, 'New');
    d = addLayer(d, layer, 0);
    h.push('Add', { type: 'add-layer', layer, index: 0 });
    expect(d.layers[0].id).toBe(layer.id);
    d = h.undo(d);
    expect(d.layers.find((l) => l.id === layer.id)).toBeUndefined();
    d = h.redo(d);
    expect(d.layers.find((l) => l.id === layer.id)).toBeDefined();
  });
});
