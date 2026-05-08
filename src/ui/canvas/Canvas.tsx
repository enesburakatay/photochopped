import { useEffect, useRef, useState } from 'react';
import { useEditor } from '@/store/editorStore';
import { Renderer, type RenderOverlay } from '@/engine/renderer';
import { fitDocument, makeViewport, pan, screenToDoc, zoomAt } from '@/engine/viewport';
import type { Rect } from '@/core/types';

/**
 * Canvas: the heart of the editor. Owns:
 *  - the on-screen <canvas> element
 *  - a Renderer instance (single-threaded rAF loop)
 *  - pointer event routing to tools
 *  - viewport pan/zoom via wheel + space-drag
 *
 * We always re-render on every animation frame so marching ants animate. For
 * static views the work is small (one drawImage of the cached composition).
 */

export function Canvas() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const overlayRef = useRef<RenderOverlay>({});
  const [hoverDoc, setHoverDoc] = useState<{ x: number; y: number } | null>(null);
  const spaceDownRef = useRef(false);

  const slot = useEditor((s) => s.docs[s.activeDocIndex]);
  const tool = useEditor((s) => s.tool);
  const brush = useEditor((s) => s.brush);
  const eraser = useEditor((s) => s.eraser);
  const fg = useEditor((s) => s.foreground);
  const setViewport = useEditor((s) => s.setViewport);
  const beginStroke = useEditor((s) => s.beginStroke);
  const paintStroke = useEditor((s) => s.paintStroke);
  const endStroke = useEditor((s) => s.endStroke);
  const bucketFill = useEditor((s) => s.bucketFill);
  const marquee = useEditor((s) => s.marquee);
  const cropDocument = useEditor((s) => s.cropDocument);
  const setForeground = useEditor((s) => s.setForeground);

  // Initial fit to screen on first mount or doc change.
  useEffect(() => {
    if (!slot) return;
    const wrap = wrapRef.current!;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    const v = makeViewport(w, h);
    setViewport(fitDocument(v, slot.doc.width, slot.doc.height));
    // intentionally only on doc change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot?.doc.id]);

  // Resize observer: keep viewport.viewW/viewH in sync with the wrapper element.
  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(() => {
      const wrap = wrapRef.current!;
      const cur = useEditor.getState().docs[useEditor.getState().activeDocIndex]?.viewport;
      if (!cur) return;
      setViewport({ ...cur, viewW: wrap.clientWidth, viewH: wrap.clientHeight });
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [setViewport]);

  // rAF render loop.
  useEffect(() => {
    if (!ref.current) return;
    const renderer = new Renderer();
    rendererRef.current = renderer;
    let frame = 0;
    const loop = () => {
      const s = useEditor.getState();
      const cur = s.docs[s.activeDocIndex];
      if (cur && ref.current) {
        renderer.paint(ref.current, cur.doc, cur.viewport, overlayRef.current, cur.rev);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  // Track Space key for hand-tool override.
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.code === 'Space') spaceDownRef.current = true; };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') spaceDownRef.current = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  // Wheel: pinch-zoom (ctrl+wheel) or pan.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const s = useEditor.getState();
      const cur = s.docs[s.activeDocIndex];
      if (!cur) return;
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * 0.0015);
        setViewport(zoomAt(cur.viewport, factor, { x: sx, y: sy }));
      } else {
        setViewport(pan(cur.viewport, -e.deltaX, -e.deltaY));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [setViewport]);

  // Pointer state (stroke / drag).
  type DragMode = 'pan' | 'paint' | 'erase' | 'marquee-rect' | 'marquee-ellipse' | 'crop' | null;
  const dragRef = useRef<{
    mode: DragMode;
    last: { x: number; y: number } | null;
    startScreen: { x: number; y: number } | null;
    rectDoc: Rect | null;
  }>({ mode: null, last: null, startScreen: null, rectDoc: null });

  const screenFromEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = ref.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!slot) return;
    ref.current!.setPointerCapture(e.pointerId);
    const sp = screenFromEvent(e);
    const dp = screenToDoc(slot.viewport, sp.x, sp.y);

    if (spaceDownRef.current || tool === 'hand' || e.button === 1) {
      dragRef.current = { mode: 'pan', last: sp, startScreen: sp, rectDoc: null };
      return;
    }

    if (tool === 'eyedropper') {
      const layer = slot.doc.layers.find((l) => l.id === slot.doc.activeLayerId);
      if (layer && layer.kind === 'raster') {
        const x = Math.floor(dp.x);
        const y = Math.floor(dp.y);
        if (x >= 0 && y >= 0 && x < layer.pixels.width && y < layer.pixels.height) {
          const i = (y * layer.pixels.width + x) * 4;
          setForeground({
            r: layer.pixels.data[i],
            g: layer.pixels.data[i + 1],
            b: layer.pixels.data[i + 2],
            a: layer.pixels.data[i + 3] / 255,
          });
        }
      }
      return;
    }

    if (tool === 'brush' || tool === 'eraser') {
      beginStroke();
      paintStroke(dp, dp, tool === 'eraser' ? 'erase' : 'paint');
      dragRef.current = { mode: tool === 'eraser' ? 'erase' : 'paint', last: dp, startScreen: sp, rectDoc: null };
      return;
    }

    if (tool === 'fill') {
      bucketFill(dp.x, dp.y, fg);
      return;
    }

    if (tool === 'marquee-rect') {
      dragRef.current = { mode: 'marquee-rect', last: sp, startScreen: sp, rectDoc: { x: dp.x, y: dp.y, width: 0, height: 0 } };
      return;
    }

    if (tool === 'marquee-ellipse') {
      dragRef.current = { mode: 'marquee-ellipse', last: sp, startScreen: sp, rectDoc: { x: dp.x, y: dp.y, width: 0, height: 0 } };
      return;
    }

    if (tool === 'crop') {
      dragRef.current = { mode: 'crop', last: sp, startScreen: sp, rectDoc: { x: dp.x, y: dp.y, width: 0, height: 0 } };
      return;
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!slot) return;
    const sp = screenFromEvent(e);
    const dp = screenToDoc(slot.viewport, sp.x, sp.y);
    setHoverDoc(dp);

    const drag = dragRef.current;
    if (!drag.mode || !drag.last) {
      // Update brush cursor overlay only.
      overlayRef.current = {
        ...overlayRef.current,
        brushCursor: (tool === 'brush' || tool === 'eraser')
          ? { x: dp.x, y: dp.y, radius: tool === 'eraser' ? eraser.radius : brush.radius }
          : null,
      };
      return;
    }

    if (drag.mode === 'pan') {
      const dx = sp.x - drag.last.x;
      const dy = sp.y - drag.last.y;
      setViewport(pan(slot.viewport, dx, dy));
      drag.last = sp;
      return;
    }

    if (drag.mode === 'paint' || drag.mode === 'erase') {
      paintStroke(drag.last as { x: number; y: number }, dp, drag.mode === 'erase' ? 'erase' : 'paint');
      drag.last = dp;
      overlayRef.current = {
        ...overlayRef.current,
        brushCursor: { x: dp.x, y: dp.y, radius: drag.mode === 'erase' ? eraser.radius : brush.radius },
      };
      return;
    }

    if (drag.mode === 'marquee-rect' || drag.mode === 'marquee-ellipse' || drag.mode === 'crop') {
      const start = screenToDoc(slot.viewport, drag.startScreen!.x, drag.startScreen!.y);
      const x = Math.min(start.x, dp.x);
      const y = Math.min(start.y, dp.y);
      const width = Math.abs(dp.x - start.x);
      const height = Math.abs(dp.y - start.y);
      drag.rectDoc = { x, y, width, height };
      overlayRef.current = drag.mode === 'crop'
        ? { ...overlayRef.current, cropRect: drag.rectDoc }
        : { ...overlayRef.current, selectionPath: drag.rectDoc };
      return;
    }
  };

  const onPointerUp = () => {
    const drag = dragRef.current;
    if (drag.mode === 'paint' || drag.mode === 'erase') {
      endStroke();
    }
    if ((drag.mode === 'marquee-rect' || drag.mode === 'marquee-ellipse') && drag.rectDoc && drag.rectDoc.width > 1 && drag.rectDoc.height > 1) {
      marquee(drag.rectDoc, drag.mode === 'marquee-ellipse' ? 'ellipse' : 'rect');
      overlayRef.current = { ...overlayRef.current, selectionPath: null };
    }
    if (drag.mode === 'crop' && drag.rectDoc && drag.rectDoc.width > 1 && drag.rectDoc.height > 1) {
      cropDocument(drag.rectDoc);
      overlayRef.current = { ...overlayRef.current, cropRect: null };
    }
    dragRef.current = { mode: null, last: null, startScreen: null, rectDoc: null };
  };

  // Update overlay's selectionPath from doc.selection so persistent selections render.
  useEffect(() => {
    if (!slot) return;
    overlayRef.current = {
      ...overlayRef.current,
      selectionPath: slot.doc.selection ? slot.doc.selection.bounds : null,
    };
  }, [slot, slot?.doc.selection]);

  if (!slot) return null;

  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-hidden">
      <canvas
        ref={ref}
        className="absolute inset-0 w-full h-full"
        style={{ cursor: cursorFor(tool, spaceDownRef.current) }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => { setHoverDoc(null); overlayRef.current = { ...overlayRef.current, brushCursor: null }; }}
      />
      <div className="absolute bottom-2 left-2 px-2 py-1 text-2xs bg-ps-panel/80 rounded border border-ps-border pointer-events-none">
        {hoverDoc ? `${Math.round(hoverDoc.x)}, ${Math.round(hoverDoc.y)}` : '—'} · {Math.round(slot.viewport.zoom * 100)}%
      </div>
    </div>
  );
}

function cursorFor(tool: string, space: boolean): string {
  if (space) return 'grab';
  switch (tool) {
    case 'hand': return 'grab';
    case 'zoom': return 'zoom-in';
    case 'eyedropper': return 'crosshair';
    case 'brush':
    case 'eraser':
    case 'fill':
    case 'marquee-rect':
    case 'marquee-ellipse':
    case 'crop':
      return 'crosshair';
    default: return 'default';
  }
}
