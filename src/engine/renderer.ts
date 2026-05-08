import type { Document } from '@/core/types';
import { Compositor } from './compositor';
import { docToScreen, type ViewportState } from './viewport';

/**
 * Renderer: paints the composited document into the on-screen canvas.
 *
 * Responsible for:
 *  - Clearing/erasing the screen buffer
 *  - Drawing the transparency checkerboard backdrop
 *  - Drawing the composited document at the current viewport transform
 *  - Drawing overlays (selection marching ants, transform handles, brush cursor)
 *
 * The renderer never mutates the document. It reads view state + document and emits
 * pixels. We separate "compose document" (slow, can be cached) from "paint to screen"
 * (fast, every frame) so zoom/pan stays at 60fps even for large docs.
 */

export interface RenderOverlay {
  // Document-space marching-ants selection outline.
  selectionPath?: { x: number; y: number; width: number; height: number } | null;
  // Document-space brush cursor (radius in doc px).
  brushCursor?: { x: number; y: number; radius: number } | null;
  // Active transform/crop rect in document space.
  cropRect?: { x: number; y: number; width: number; height: number } | null;
}

export class Renderer {
  private compositor = new Compositor();
  private composedCache: { docId: string; rev: number; canvas: OffscreenCanvas } | null = null;
  private antPhase = 0;

  /**
   * Mark the document buffer dirty so the next paint recomposes it.
   */
  invalidate(): void {
    this.composedCache = null;
  }

  paint(
    target: HTMLCanvasElement,
    doc: Document,
    view: ViewportState,
    overlay: RenderOverlay,
    docRev: number,
  ): void {
    const ctx = target.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;

    // Resize backing store if needed.
    const targetW = Math.floor(view.viewW * dpr);
    const targetH = Math.floor(view.viewH * dpr);
    if (target.width !== targetW || target.height !== targetH) {
      target.width = targetW;
      target.height = targetH;
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    // Clear viewport background.
    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(0, 0, view.viewW, view.viewH);

    // Compose document if cache is stale.
    if (!this.composedCache || this.composedCache.docId !== doc.id || this.composedCache.rev !== docRev) {
      this.composedCache = {
        docId: doc.id,
        rev: docRev,
        canvas: this.compositor.render(doc),
      };
    }

    // Document-space rect to screen-space rect.
    const screenOrigin = docToScreen(view, 0, 0);
    const screenW = doc.width * view.zoom;
    const screenH = doc.height * view.zoom;

    // Drop shadow under canvas.
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = '#000';
    ctx.fillRect(screenOrigin.x, screenOrigin.y, screenW, screenH);
    ctx.restore();

    // Transparency checkerboard.
    drawCheckerboard(ctx, screenOrigin.x, screenOrigin.y, screenW, screenH, 8 * Math.min(view.zoom, 2));

    // Composited layers, sharp at high zoom.
    ctx.imageSmoothingEnabled = view.zoom < 2;
    ctx.drawImage(this.composedCache.canvas, screenOrigin.x, screenOrigin.y, screenW, screenH);

    // Overlays (selection, crop, brush cursor).
    if (overlay.selectionPath) {
      drawMarchingAnts(ctx, view, overlay.selectionPath, this.antPhase);
    }
    if (overlay.cropRect) {
      drawCropRect(ctx, view, overlay.cropRect, doc.width, doc.height);
    }
    if (overlay.brushCursor) {
      drawBrushCursor(ctx, view, overlay.brushCursor);
    }

    ctx.restore();

    this.antPhase = (this.antPhase + 1) % 8;
  }

  dispose(): void {
    this.compositor.dispose();
    this.composedCache = null;
  }
}

function drawCheckerboard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  cell: number,
): void {
  ctx.save();
  ctx.fillStyle = '#8a8a8a';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#6a6a6a';
  const startX = Math.floor(x / cell) * cell;
  const startY = Math.floor(y / cell) * cell;
  for (let py = startY; py < y + h; py += cell) {
    for (let px = startX; px < x + w; px += cell) {
      const odd = ((px / cell + py / cell) | 0) % 2 === 1;
      if (odd) {
        const dx = Math.max(px, x);
        const dy = Math.max(py, y);
        const dw = Math.min(px + cell, x + w) - dx;
        const dh = Math.min(py + cell, y + h) - dy;
        if (dw > 0 && dh > 0) ctx.fillRect(dx, dy, dw, dh);
      }
    }
  }
  ctx.restore();
}

function drawMarchingAnts(
  ctx: CanvasRenderingContext2D,
  view: ViewportState,
  rect: { x: number; y: number; width: number; height: number },
  phase: number,
): void {
  const a = docToScreen(view, rect.x, rect.y);
  const w = rect.width * view.zoom;
  const h = rect.height * view.zoom;
  ctx.save();
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.lineDashOffset = -phase;
  ctx.strokeStyle = '#fff';
  ctx.strokeRect(a.x + 0.5, a.y + 0.5, w, h);
  ctx.lineDashOffset = -phase + 4;
  ctx.strokeStyle = '#000';
  ctx.strokeRect(a.x + 0.5, a.y + 0.5, w, h);
  ctx.restore();
}

function drawCropRect(
  ctx: CanvasRenderingContext2D,
  view: ViewportState,
  rect: { x: number; y: number; width: number; height: number },
  docW: number,
  docH: number,
): void {
  const a = docToScreen(view, rect.x, rect.y);
  const w = rect.width * view.zoom;
  const h = rect.height * view.zoom;
  const docTL = docToScreen(view, 0, 0);
  const docBR = docToScreen(view, docW, docH);
  // Dim outside the crop rect.
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  ctx.rect(docTL.x, docTL.y, docBR.x - docTL.x, docBR.y - docTL.y);
  ctx.rect(a.x, a.y, w, h);
  ctx.fill('evenodd');
  // Border + thirds.
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.strokeRect(a.x + 0.5, a.y + 0.5, w, h);
  ctx.beginPath();
  for (let i = 1; i < 3; i++) {
    const fx = a.x + (w * i) / 3;
    const fy = a.y + (h * i) / 3;
    ctx.moveTo(fx, a.y); ctx.lineTo(fx, a.y + h);
    ctx.moveTo(a.x, fy); ctx.lineTo(a.x + w, fy);
  }
  ctx.globalAlpha = 0.4;
  ctx.stroke();
  // Handles.
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#fff';
  const handles = [
    [a.x, a.y], [a.x + w / 2, a.y], [a.x + w, a.y],
    [a.x, a.y + h / 2], [a.x + w, a.y + h / 2],
    [a.x, a.y + h], [a.x + w / 2, a.y + h], [a.x + w, a.y + h],
  ];
  for (const [hx, hy] of handles) ctx.fillRect(hx - 4, hy - 4, 8, 8);
  ctx.restore();
}

function drawBrushCursor(
  ctx: CanvasRenderingContext2D,
  view: ViewportState,
  cur: { x: number; y: number; radius: number },
): void {
  const c = docToScreen(view, cur.x, cur.y);
  const r = cur.radius * view.zoom;
  ctx.save();
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = '#fff';
  ctx.beginPath();
  ctx.arc(c.x, c.y, r + 1, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
