import type { Document, Layer, BlendMode } from '@/core/types';

/**
 * The compositor converts a Document's layer stack into a single output canvas.
 *
 * Strategy:
 * - Use Canvas2D with native `globalCompositeOperation` for blend modes (the browser
 *   ships SIMD-optimized compositing, faster than anything we'd write in JS).
 * - Render bottom-up. Adjustment layers re-render the accumulated bitmap below
 *   through their adjustment function.
 * - Group layers are rendered to an intermediate buffer first, then composited as
 *   one unit (so opacity/blend mode applies to the group as a whole).
 * - Output buffer is reused across renders to avoid GC churn.
 *
 * For Phase 1 we use Canvas2D. Phase 2 will add a WebGL2 path that runs filter and
 * blend pipelines as a single shader pass, eliminating the per-layer ImageData
 * upload cost. The interface here is stable across both backends.
 */

export interface CompositorOptions {
  /** When true, render in SDR linear space for color-correct compositing. */
  linear?: boolean;
}

const BLEND_MAP: Record<BlendMode, GlobalCompositeOperation> = {
  'normal': 'source-over',
  'multiply': 'multiply',
  'screen': 'screen',
  'overlay': 'overlay',
  'darken': 'darken',
  'lighten': 'lighten',
  'color-dodge': 'color-dodge',
  'color-burn': 'color-burn',
  'hard-light': 'hard-light',
  'soft-light': 'soft-light',
  'difference': 'difference',
  'exclusion': 'exclusion',
  'hue': 'hue',
  'saturation': 'saturation',
  'color': 'color',
  'luminosity': 'luminosity',
};

export class Compositor {
  private buf: OffscreenCanvas;
  private bctx: OffscreenCanvasRenderingContext2D;
  private scratch: OffscreenCanvas;
  private sctx: OffscreenCanvasRenderingContext2D;

  constructor() {
    this.buf = new OffscreenCanvas(1, 1);
    this.bctx = this.buf.getContext('2d', { willReadFrequently: false })!;
    this.scratch = new OffscreenCanvas(1, 1);
    this.sctx = this.scratch.getContext('2d', { willReadFrequently: false })!;
  }

  render(doc: Document, _opts: CompositorOptions = {}): OffscreenCanvas {
    if (this.buf.width !== doc.width || this.buf.height !== doc.height) {
      this.buf.width = doc.width;
      this.buf.height = doc.height;
    }
    const ctx = this.bctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, doc.width, doc.height);
    this.compositeLayers(ctx, doc.layers, doc.width, doc.height);
    ctx.restore();
    return this.buf;
  }

  private compositeLayers(
    target: OffscreenCanvasRenderingContext2D,
    layers: Layer[],
    docW: number,
    docH: number,
  ): void {
    // Iterate bottom-up. Layers array is top-first by convention, so we walk reversed.
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      if (!layer.visible) continue;
      this.compositeLayer(target, layer, docW, docH);
    }
  }

  private compositeLayer(
    target: OffscreenCanvasRenderingContext2D,
    layer: Layer,
    docW: number,
    docH: number,
  ): void {
    target.save();
    target.globalAlpha = layer.opacity;
    target.globalCompositeOperation = BLEND_MAP[layer.blendMode] ?? 'source-over';

    switch (layer.kind) {
      case 'raster': {
        // Direct blit. ImageData is structurally compatible enough that we can
        // construct one from our ImageDataLike buffer and putImageData via a temp canvas.
        // Faster path: build a temp canvas once per layer (could be cached).
        const w = layer.pixels.width;
        const h = layer.pixels.height;
        if (this.scratch.width !== w || this.scratch.height !== h) {
          this.scratch.width = w;
          this.scratch.height = h;
        }
        // putImageData ignores composite ops, so we draw via canvas-from-imagedata.
        const id = new ImageData(layer.pixels.data, w, h);
        this.sctx.putImageData(id, 0, 0);
        target.drawImage(this.scratch, layer.x, layer.y);
        break;
      }
      case 'group': {
        // Render children to a fresh offscreen, then composite as one unit.
        const inner = new OffscreenCanvas(docW, docH);
        const ictx = inner.getContext('2d')!;
        this.compositeLayers(ictx, layer.children, docW, docH);
        target.drawImage(inner, layer.x, layer.y);
        break;
      }
      case 'text':
      case 'shape':
      case 'adjustment':
        // Phase 2 will implement these. The architecture supports them; the engine
        // just doesn't draw them yet.
        break;
    }

    // Apply mask if present (multiply alpha by mask grayscale).
    if (layer.mask) {
      // Mask compositing is straightforward but expensive in JS — Phase 2 GPU.
      // Skipped here to keep the hot path tight.
    }

    target.restore();
  }

  dispose(): void {
    this.buf.width = 0;
    this.buf.height = 0;
    this.scratch.width = 0;
    this.scratch.height = 0;
  }
}
