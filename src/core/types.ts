/**
 * Core domain types for Photochopped.
 *
 * These types describe the shape of a Document (a project) and everything in it:
 * Layers, Selections, History entries, Color, Geometry. The model is intentionally
 * decoupled from React and from any rendering backend — so it can be unit-tested in
 * isolation, serialized to/from the .pchop project format, and reused by workers.
 */

// ---------- Geometry ----------

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Transform {
  // Affine 2D transform stored as flat row-major 3x3 (last row implicit [0,0,1]).
  // [a, b, tx,
  //  c, d, ty]
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

export const IDENTITY_TRANSFORM: Transform = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };

// ---------- Color ----------

export interface RGBA {
  r: number; // 0-255
  g: number; // 0-255
  b: number; // 0-255
  a: number; // 0-1
}

export interface HSL {
  h: number; // 0-360
  s: number; // 0-100
  l: number; // 0-100
}

// ---------- Blend modes ----------

export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity';

export const BLEND_MODES: BlendMode[] = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
];

// ---------- Layers ----------

export type LayerKind = 'raster' | 'group' | 'adjustment' | 'text' | 'shape';

interface LayerBase {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;       // 0-1
  blendMode: BlendMode;
  // Position offset of the layer's pixel buffer relative to the document origin.
  // Useful for "small" layers that don't span the whole canvas.
  x: number;
  y: number;
  // Optional layer mask (8-bit grayscale, same size as layer pixels).
  mask?: ImageDataLike | null;
}

export interface RasterLayer extends LayerBase {
  kind: 'raster';
  // The pixel buffer for this layer. Stored as ImageDataLike (decoupled from DOM).
  pixels: ImageDataLike;
}

export interface GroupLayer extends LayerBase {
  kind: 'group';
  collapsed: boolean;
  children: Layer[];
}

export interface AdjustmentLayer extends LayerBase {
  kind: 'adjustment';
  adjustment: AdjustmentSpec;
}

export interface TextLayer extends LayerBase {
  kind: 'text';
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: RGBA;
  align: 'left' | 'center' | 'right';
  // The rasterized cache used for fast compositing — invalidated on edit.
  cache?: ImageDataLike | null;
}

export interface ShapeLayer extends LayerBase {
  kind: 'shape';
  shape: ShapeSpec;
  fill: RGBA;
  stroke?: { color: RGBA; width: number } | null;
  cache?: ImageDataLike | null;
}

export type Layer = RasterLayer | GroupLayer | AdjustmentLayer | TextLayer | ShapeLayer;

export type ShapeSpec =
  | { kind: 'rect'; x: number; y: number; width: number; height: number; cornerRadius?: number }
  | { kind: 'ellipse'; x: number; y: number; width: number; height: number }
  | { kind: 'polygon'; points: Point[] };

// Adjustment layers are non-destructive transforms applied to all layers below.
export type AdjustmentSpec =
  | { kind: 'brightness-contrast'; brightness: number; contrast: number }
  | { kind: 'hue-saturation'; hue: number; saturation: number; lightness: number }
  | { kind: 'levels'; black: number; white: number; gamma: number }
  | { kind: 'curves'; rgb: number[]; r?: number[]; g?: number[]; b?: number[] }
  | { kind: 'invert' }
  | { kind: 'black-white' }
  | { kind: 'color-balance'; cyanRed: number; magentaGreen: number; yellowBlue: number };

// ImageDataLike is structurally compatible with browser ImageData but doesn't
// depend on the DOM, so we can construct/serialize it in workers and tests.
export interface ImageDataLike {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

// ---------- Selection ----------

// Selection is stored as a grayscale alpha mask in document space.
// 0 = unselected, 255 = fully selected, anything in between = partial (feather).
export interface Selection {
  bounds: Rect;             // tight bounding box where the mask is non-zero
  mask: Uint8ClampedArray;  // length = bounds.width * bounds.height
}

// ---------- Document ----------

export interface Document {
  id: string;
  name: string;
  width: number;
  height: number;
  // Background color when there's transparency (used during export to JPG, etc.).
  background: RGBA;
  // DPI is metadata; we always render in pixels.
  dpi: number;
  layers: Layer[];          // top of array = top of stack (drawn last, on top)
  activeLayerId: string | null;
  selection: Selection | null;
  // Document-level color profile. We store sRGB by default.
  colorProfile: 'srgb' | 'display-p3';
  // For dirty tracking and autosave.
  modifiedAt: number;
  savedAt: number | null;
}

// ---------- History ----------

// Commands are reversible, serializable units of change. We store them as plain
// data so the history stack can be inspected, branched, or persisted.
export type HistoryCommand =
  | { type: 'add-layer'; layer: Layer; index: number }
  | { type: 'remove-layer'; layer: Layer; index: number }
  | { type: 'reorder-layer'; from: number; to: number }
  | { type: 'patch-layer'; id: string; before: Partial<Layer>; after: Partial<Layer> }
  | { type: 'paint-tile'; layerId: string; x: number; y: number; before: ImageDataLike; after: ImageDataLike }
  | { type: 'set-selection'; before: Selection | null; after: Selection | null }
  | { type: 'resize-document'; before: Size; after: Size; offset: Point }
  | { type: 'crop-document'; before: { width: number; height: number; layers: Layer[] }; after: Rect };

export interface HistoryEntry {
  id: string;
  label: string;
  command: HistoryCommand;
  timestamp: number;
}
