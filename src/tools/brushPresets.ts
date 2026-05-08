import type { BrushSettings } from './brushEngine';

/**
 * Brush presets modeled after Paint 3D / Photoshop standards. Each preset tweaks
 * the BrushSettings the engine already supports — no new code paths beyond the
 * tipMode dispatch in brushEngine.strokeLine.
 *
 * Add new presets by appending to BRUSH_PRESETS; the OptionsBar picks them up
 * automatically.
 */

export type BrushPresetId =
  | 'standard'
  | 'marker'
  | 'calligraphy'
  | 'oil'
  | 'watercolor'
  | 'pixel'
  | 'pencil'
  | 'crayon'
  | 'spray'
  | 'airbrush';

export interface BrushPreset {
  id: BrushPresetId;
  name: string;
  glyph: string;            // emoji/icon used in the picker
  description: string;
  /** Partial overrides applied on top of the user's current size/color. */
  apply: (base: BrushSettings) => BrushSettings;
}

const baseColor = (b: BrushSettings) => b.color;

export const BRUSH_PRESETS: BrushPreset[] = [
  {
    id: 'standard',
    name: 'Brush',
    glyph: '🖌',
    description: 'General-purpose round brush with soft edge.',
    apply: (b) => ({ ...b, hardness: 0.8, opacity: 1, flow: 1, spacing: 0.1, tipMode: 'normal', jitterSize: 0, jitterOpacity: 0 }),
  },
  {
    id: 'marker',
    name: 'Marker',
    glyph: '🖊',
    description: 'Hard-edged stroke at uniform opacity, like a felt-tip marker.',
    apply: (b) => ({ ...b, hardness: 1, opacity: 0.9, flow: 1, spacing: 0.05, tipMode: 'normal', color: baseColor(b) }),
  },
  {
    id: 'calligraphy',
    name: 'Calligraphy Pen',
    glyph: '✒️',
    description: 'Hard, opaque ink — width follows stroke direction in a real pen.',
    apply: (b) => ({ ...b, hardness: 1, opacity: 1, flow: 1, spacing: 0.03, tipMode: 'normal' }),
  },
  {
    id: 'oil',
    name: 'Oil Brush',
    glyph: '🎨',
    description: 'Thick, slightly textured strokes that build up paint.',
    apply: (b) => ({ ...b, hardness: 0.7, opacity: 0.85, flow: 0.9, spacing: 0.08, tipMode: 'normal', jitterSize: 0.1 }),
  },
  {
    id: 'watercolor',
    name: 'Watercolor',
    glyph: '💧',
    description: 'Very soft, low-flow strokes that layer translucently.',
    apply: (b) => ({ ...b, hardness: 0.2, opacity: 0.35, flow: 0.4, spacing: 0.05, tipMode: 'normal' }),
  },
  {
    id: 'pixel',
    name: 'Pixel Pen',
    glyph: '🔲',
    description: 'Aliased single-pixel-style brush for pixel art.',
    apply: (b) => ({ ...b, hardness: 1, opacity: 1, flow: 1, spacing: 0.5, tipMode: 'pencil' }),
  },
  {
    id: 'pencil',
    name: 'Pencil',
    glyph: '✏️',
    description: 'Light, slightly textured marks that build up with repeated strokes.',
    apply: (b) => ({ ...b, hardness: 0.95, opacity: 0.4, flow: 0.5, spacing: 0.05, tipMode: 'pencil', jitterOpacity: 0.2, jitterSize: 0.05 }),
  },
  {
    id: 'crayon',
    name: 'Crayon',
    glyph: '🖍',
    description: 'Waxy, broken-edge strokes with grain.',
    apply: (b) => ({ ...b, hardness: 0.6, opacity: 0.55, flow: 0.8, spacing: 0.07, tipMode: 'crayon', jitterOpacity: 0.45, jitterSize: 0.15 }),
  },
  {
    id: 'spray',
    name: 'Spray Can',
    glyph: '🥫',
    description: 'Smoothing spray — softens skin, irons out wrinkles, blurs blemishes. Builds up over multiple passes.',
    apply: (b) => ({ ...b, hardness: 0.35, opacity: 0.25, flow: 0.6, spacing: 0.05, tipMode: 'smooth-spray', density: 14, scatter: 1, jitterSize: 0, jitterOpacity: 0 }),
  },
  {
    id: 'airbrush',
    name: 'Airbrush',
    glyph: '💨',
    description: 'Continuous fine color spray that builds up smoothly (uses foreground color).',
    apply: (b) => ({ ...b, hardness: 0.3, opacity: 0.18, flow: 1, spacing: 0.04, tipMode: 'spray', density: 28, scatter: 1 }),
  },
];

export function findPreset(id: BrushPresetId): BrushPreset {
  return BRUSH_PRESETS.find((p) => p.id === id) ?? BRUSH_PRESETS[0];
}
