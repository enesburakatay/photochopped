# Photochopped

A professional, web-based, Photoshop-style image editor. Production-grade architecture, zero-config dev, ships as a static SPA or wrapped desktop app.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Build | **Vite + TypeScript** | Fastest HMR, modern ES2022, zero-config |
| UI | **React 18** | Mature ecosystem, concurrent rendering for responsive panels |
| State | **Zustand** | Tiny, no boilerplate, plays well with imperative engine code |
| Styling | **TailwindCSS** | Photoshop-dense UIs need utility-class density |
| Rendering | **HTMLCanvas + Canvas2D + WebGL-ready** | Custom compositor; native `globalCompositeOperation` is SIMD-optimized |
| Workers | **Web Workers + OffscreenCanvas** | Heavy filters off the main thread (Phase 2) |
| Tests | **Vitest** | Fast, TS-native |

The architecture is designed so the same codebase wraps as a Tauri or Electron desktop app with no engine changes.

## Architecture

```
src/
├── core/         # Pure-TS domain: Document, Layer, History, Color, Geometry
├── engine/       # Compositor, Renderer, Viewport — reads core, mutates pixels
├── tools/        # Brush engine, fill, selection — pure functions over pixels
├── filters/      # Filter pipeline (CPU now, GPU shaders in Phase 2)
├── io/           # Import (PNG/JPG/WEBP/GIF/BMP/SVG) + Export + .pchop project
├── store/        # Zustand editor store — single source of truth
├── ui/           # React shell (panels, dialogs, canvas, toolbar)
├── hooks/        # Shortcuts, autosave
└── workers/      # (Phase 2) heavy ops
```

### Key design decisions

- **Engine is decoupled from React.** The compositor, renderer, and tool functions can be unit-tested headlessly and reused in workers/CLI. React only owns layout & event routing.
- **Documents are immutable values.** Each edit produces a new `Document`; pixel buffers are shared by reference where unchanged. A `rev` counter on each `DocSlot` tells the renderer when to invalidate its cache.
- **History is the command pattern.** Reversible commands stored as plain data (paint strokes save *tile snapshots*, not full images) — so undo/redo memory is bounded and cheap.
- **Tools are stateless.** They consume `PointerEventLike` + read store, return mutations. Easy to add new ones — drop a new tool in `src/tools/`, add an icon to the toolbar, register it in the store, done.
- **Filters are pure functions** (`ImageData → ImageData`). Same signature works for CPU now and GPU shaders in Phase 2.
- **Multi-document via `DocSlot[]`** — each tab has its own history + viewport, switching is a constant-time index change.

## Features (Phase 1 — shipped)

✅ Multi-document tabs with independent history & viewport
✅ Import: PNG, JPG, WEBP, GIF, BMP, SVG (drag-drop + clipboard paste)
✅ Export: PNG, JPG, WEBP at any quality + .pchop project format
✅ Layer system: opacity, all 16 Photoshop blend modes, visibility, lock, reorder
✅ Tools: Move, Brush, Eraser, Bucket Fill, Eyedropper, Rect/Ellipse Marquee, Crop, Hand, Zoom
✅ Brush engine: variable size/hardness/opacity/flow/spacing, soft-edge alpha kernels with smoothstep falloff
✅ Selection: rect & ellipse marquees, all paint ops respect selection mask
✅ Background removal: one-click **offline** cutout (no AI model, no network) + manual refine (magic-wand cut/restore, restore brush, eraser) → transparent PNG
✅ Filters: Brightness/Contrast, Hue/Saturation, Levels, Gaussian Blur (separable), Sharpen, Pixelate, Noise, Invert, B&W
✅ History: bounded undo/redo with paint-tile compression
✅ Photoshop keyboard shortcuts (V/M/L/C/I/B/E/G/T/H/Z, [ ] for size, X swap, D reset, Ctrl+Z/Y, Ctrl+S, etc.)
✅ Smooth pan/zoom: ctrl+wheel zoom anchored at cursor, space-drag pan, fit-to-screen
✅ Marching ants selection overlay
✅ Crop with rule-of-thirds overlay
✅ Foreground/background color swatches with HSL/RGB pickers
✅ Dockable side panels: Color, Properties, Layers, History
✅ Autosave to localStorage every 30s
✅ Dark theme matching Photoshop's palette

## Removing a background

Photochopped ships a fully **offline** background remover — no AI model, no network calls, no dependencies. It edits the active layer's alpha channel (RGB is preserved), so the cutout renders instantly and exports straight to a transparent PNG.

**Auto-remove → PNG**
- Click the **Scissors** button in the toolbar for a one-tap cutout, or use **Image → Remove Background**.
- For control, **right-click the Scissors** (or **Image → Remove Background…**) to open a dialog with **Tolerance** and **Edge feather** sliders.
- Then **File → Export… → PNG** — the transparency is already there.

**Refine the cutout (select / deselect areas)**
- **Magic Wand** (`W`): **click** a region to cut it out · **Alt+click** to restore it. Tolerance + Contiguous options sit in the options bar.
- **Restore brush** (`K`): paint removed pixels back. The **Eraser** (`E`) cuts more away. Both are soft brushes good for hair/edges; resize with `[` / `]`.
- Everything is undoable (`Ctrl+Z`).

**Typical workflow (keyboard-first)**
1. **Open** the image — `Ctrl+O` (or drag-and-drop, or `Ctrl+V` to paste).
2. **Remove the background** — click the **Scissors**, or **Image → Remove Background**. Right-click the Scissors (or **Image → Remove Background…**) for the Tolerance / Edge-feather dialog if the one-tap result needs tuning.
3. **Refine the edges:**
   - `W` — Magic Wand: click leftover background to cut it · `Alt`+click to bring a region back.
   - `K` — Restore brush: paint missed parts of the subject back in.
   - `E` — Eraser: scrub away stray background by hand.
   - `[` / `]` — shrink / grow the current brush · `Ctrl+Z` / `Ctrl+Shift+Z` — undo / redo.
4. **Export** — `Ctrl+E`, choose **PNG**. The transparency is baked in.

The **Magic Wand**, **Restore brush**, and **Eraser** live in their own group under the Scissors button in the toolbar, so the whole job is in one place. Auto-removal works best on a subject over a relatively even background (product/studio shots).

How it works: it samples the image border (per-channel median) to model the background color, flood-fills inward removing only background *connected to the edge* (so an interior region that merely shares the background color is kept), then feathers the matte for a clean anti-aliased edge.

## Phase 2 (architecture-ready, not yet implemented)

Built so each of these is a drop-in:
- WebGL2 compositor + filter shaders (replace `Compositor.compositeLayer` body)
- AI features: object selection (SAM2 wasm), inpainting, and a higher-quality ONNX/U²-Net background-removal engine for busy photographic backgrounds (a local-algorithm remover already ships — see [Removing a background](#removing-a-background))
- Adjustment & text & shape layer rendering (types already in `core/types.ts`)
- Liquify, healing, clone stamp, dodge/burn (extend `tools/`)
- Lasso / polygon-lasso / magic-wand (extend `tools/`, marching-ants overlay already exists)
- Vector path tool / pen
- PSD import/export (parser fits in `src/io/psd/`)
- Plugin SDK (filters and tools already use registries)
- Tablet/stylus pressure (Pointer Events already give us `pressure`)
- Animation timeline / GIF export
- Cloud sync, collaboration (CRDT layer in `src/sync/`)

## Quick start

```bash
npm install
npm run dev          # Vite dev server, HMR, http://localhost:5173
npm run build        # production SPA -> dist/
npm run preview      # serve dist/ for smoke-testing
npm run test         # vitest
npm run typecheck    # tsc --noEmit
```

## Keyboard shortcuts

| Action | Shortcut |
|---|---|
| New | `Ctrl+N` |
| Open | `Ctrl+O` |
| Save (project) | `Ctrl+S` |
| Export | `Ctrl+E` |
| Undo / Redo | `Ctrl+Z` / `Ctrl+Shift+Z` |
| Select all / Deselect | `Ctrl+A` / `Ctrl+D` |
| Duplicate layer | `Ctrl+J` |
| Fit to screen | `Ctrl+0` |
| Move / Marquee / Lasso / Wand | `V` / `M` / `L` / `W` |
| Crop / Eyedropper | `C` / `I` |
| Brush / Eraser / Fill | `B` / `E` / `G` |
| Restore brush (paint background back) | `K` |
| Magic Wand: cut region / restore region | `Click` / `Alt+Click` |
| Text / Shape | `T` / `R` |
| Hand / Zoom | `H` / `Z` |
| Brush size − / + | `[` / `]` |
| Reset / Swap colors | `D` / `X` |
| Pan canvas | `Space + drag` |

## Performance notes

- The compositor caches its output keyed on `(docId, rev)`. Only document mutations bust the cache; pan/zoom/overlay-only frames just `drawImage` the cached buffer.
- Pointer events drive painting at full input rate; we rely on the rAF loop (60fps) for screen updates, so input lag stays minimal.
- `OffscreenCanvas` is used for the compositor's intermediate buffers — when WebWorkers land in Phase 2, the compositor moves wholesale off the main thread.
- Selections store only the tight bounding-box mask, not a doc-sized buffer.
- Large layered projects: pixel buffers use `Uint8ClampedArray` (no JS-object overhead) and structural sharing keeps a 100-layer doc under a few hundred MB.

## Deployment

The app is a fully static SPA. After `npm run build`:

- **Vercel/Netlify/Cloudflare Pages** — drop `dist/` into the bucket, done.
- **GitHub Pages** — `npm run build && gh-pages -d dist`.
- **S3 + CloudFront** — `aws s3 sync dist/ s3://your-bucket --delete`.
- **Tauri desktop wrapper** — `cargo install create-tauri-app && tauri init`, point it at `dist/`. ~10 MB binary.

No server is required. Project files (`.pchop.json`) live entirely on the user's machine.

## Testing

```
npm run test          # one-shot
npm run test:watch    # tdd loop
```

`src/core/__tests__/` covers the pure domain (document mutations, history round-trip, color conversions, selections, layer ops). `src/filters/__tests__/` covers filter math. The engine and React UI are covered by integration tests in Phase 2.

## License

MIT — see LICENSE.
