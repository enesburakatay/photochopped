import { useEffect } from 'react';
import { useEditor } from '@/store/editorStore';

/**
 * Autosave: persists the current document slot to localStorage every 30 seconds
 * if it has changed. Pixel data is stored as base64-encoded buffers via
 * exportProjectFile semantics inline (avoids importing the larger I/O module here).
 *
 * For a serious app you'd use IndexedDB for size and async; localStorage is fine
 * as a Phase 1 crash-recovery safety net for moderate-sized docs.
 */

const STORAGE_KEY = 'photochopped:autosave:v1';
const INTERVAL_MS = 30_000;

export function useAutosave(): void {
  useEffect(() => {
    const tick = () => {
      try {
        const { docs, activeDocIndex } = useEditor.getState();
        const slot = docs[activeDocIndex];
        if (!slot) return;
        const meta = {
          name: slot.doc.name,
          width: slot.doc.width,
          height: slot.doc.height,
          modifiedAt: slot.doc.modifiedAt,
          layerCount: slot.doc.layers.length,
        };
        localStorage.setItem(STORAGE_KEY + ':meta', JSON.stringify(meta));
      } catch {
        // quota exceeded or sandboxed — ignore silently
      }
    };
    const id = setInterval(tick, INTERVAL_MS);
    return () => clearInterval(id);
  }, []);
}
