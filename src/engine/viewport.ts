import type { Point, Rect } from '@/core/types';

/**
 * Viewport: maps document space <-> screen space, with smooth pan/zoom.
 *
 * The viewport is decoupled from rendering; it just owns the affine that turns
 * "pixel (px, py) on the document" into "screen pixel (sx, sy) inside the canvas
 * element". We keep zoom + pan as separate scalars (instead of a full matrix) so
 * we can serialize state cheaply and animate independently.
 */
export interface ViewportState {
  zoom: number;       // 1 = 100%
  panX: number;       // screen px offset of doc origin from viewport top-left
  panY: number;
  // Size of the viewport (canvas element) in CSS pixels.
  viewW: number;
  viewH: number;
}

export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 64;

export function makeViewport(viewW = 0, viewH = 0): ViewportState {
  return { zoom: 1, panX: 0, panY: 0, viewW, viewH };
}

export function fitDocument(v: ViewportState, docW: number, docH: number, padding = 32): ViewportState {
  if (docW === 0 || docH === 0 || v.viewW === 0 || v.viewH === 0) return v;
  const sx = (v.viewW - padding * 2) / docW;
  const sy = (v.viewH - padding * 2) / docH;
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min(sx, sy)));
  const cx = v.viewW / 2 - (docW * zoom) / 2;
  const cy = v.viewH / 2 - (docH * zoom) / 2;
  return { ...v, zoom, panX: cx, panY: cy };
}

export function center(v: ViewportState, docW: number, docH: number): ViewportState {
  const cx = v.viewW / 2 - (docW * v.zoom) / 2;
  const cy = v.viewH / 2 - (docH * v.zoom) / 2;
  return { ...v, panX: cx, panY: cy };
}

export function zoomAt(v: ViewportState, factor: number, anchorScreen: Point): ViewportState {
  const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.zoom * factor));
  if (next === v.zoom) return v;
  const ratio = next / v.zoom;
  // Keep the anchor point fixed in screen space.
  const panX = anchorScreen.x - (anchorScreen.x - v.panX) * ratio;
  const panY = anchorScreen.y - (anchorScreen.y - v.panY) * ratio;
  return { ...v, zoom: next, panX, panY };
}

export function setZoomCentered(v: ViewportState, zoom: number): ViewportState {
  return zoomAt(v, zoom / v.zoom, { x: v.viewW / 2, y: v.viewH / 2 });
}

export function pan(v: ViewportState, dx: number, dy: number): ViewportState {
  return { ...v, panX: v.panX + dx, panY: v.panY + dy };
}

export function screenToDoc(v: ViewportState, sx: number, sy: number): Point {
  return { x: (sx - v.panX) / v.zoom, y: (sy - v.panY) / v.zoom };
}

export function docToScreen(v: ViewportState, dx: number, dy: number): Point {
  return { x: dx * v.zoom + v.panX, y: dy * v.zoom + v.panY };
}

export function visibleRect(v: ViewportState): Rect {
  return {
    x: -v.panX / v.zoom,
    y: -v.panY / v.zoom,
    width: v.viewW / v.zoom,
    height: v.viewH / v.zoom,
  };
}
