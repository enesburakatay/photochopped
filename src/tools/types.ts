import type { Point } from '@/core/types';

export type ToolId =
  | 'move'
  | 'marquee-rect'
  | 'marquee-ellipse'
  | 'lasso'
  | 'polygon-lasso'
  | 'magic-wand'
  | 'crop'
  | 'eyedropper'
  | 'brush'
  | 'eraser'
  | 'fill'
  | 'gradient'
  | 'shape-rect'
  | 'shape-ellipse'
  | 'text'
  | 'hand'
  | 'zoom';

export interface PointerEventLike {
  doc: Point;            // document-space coordinates
  screen: Point;         // screen-space coordinates
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
  meta: boolean;
  pressure: number;      // 0..1, defaults to 0.5 if pointer doesn't report
  buttons: number;
}

/**
 * Tools are stateless w/ regard to the document — they receive context, return
 * actions or mutate via the supplied controller. This keeps tool logic testable.
 */
export interface ToolContext {
  /** Mark a region of the active layer dirty so the renderer recomposes it. */
  markDirty(): void;
  /** Show an overlay (selection rect, crop rect, brush cursor) on the canvas. */
  setOverlay(overlay: import('@/engine/renderer').RenderOverlay): void;
}
