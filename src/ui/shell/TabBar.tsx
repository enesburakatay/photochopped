import { useState } from 'react';
import { X } from 'lucide-react';
import { useEditor } from '@/store/editorStore';
import { Dialog } from '../dialogs/Dialog';

export function TabBar() {
  const docs = useEditor((s) => s.docs);
  const active = useEditor((s) => s.activeDocIndex);
  const setActive = useEditor((s) => s.setActiveDoc);
  const close = useEditor((s) => s.closeDocument);
  // Force re-render when any document is edited (rev bumps drive history.canUndo).
  useEditor((s) => s.docs.map((d) => d.rev).join(','));

  const [pendingClose, setPendingClose] = useState<number | null>(null);

  const requestClose = (index: number) => {
    const slot = docs[index];
    if (slot && slot.history.canUndo()) {
      setPendingClose(index);
    } else {
      close(index);
    }
  };

  const pending = pendingClose !== null ? docs[pendingClose] : null;

  return (
    <>
      <div className="h-7 flex items-center bg-ps-panel border-b border-ps-border overflow-x-auto">
        {docs.map((slot, i) => {
          const dirty = slot.history.canUndo();
          return (
            <div
              key={slot.doc.id}
              className={`flex items-center px-3 h-7 text-xs border-r border-ps-border cursor-pointer
                ${i === active ? 'bg-ps-bg text-ps-text' : 'bg-ps-panel text-ps-textDim hover:text-ps-text'}`}
              onClick={() => setActive(i)}
            >
              <span className="truncate max-w-[180px]">{slot.doc.name}{dirty && ' •'}</span>
              <span className="ml-2 text-2xs text-ps-textDim">{slot.doc.width}×{slot.doc.height}</span>
              <button
                className="ml-2 text-ps-textDim hover:text-ps-danger"
                onClick={(e) => { e.stopPropagation(); requestClose(i); }}
                title="Close"
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
      </div>
      {pending && pendingClose !== null && (
        <Dialog
          title="Unsaved changes"
          width={440}
          onClose={() => setPendingClose(null)}
          footer={
            <>
              <button className="pc-btn" onClick={() => setPendingClose(null)}>Cancel</button>
              <button
                className="pc-btn-danger"
                onClick={() => {
                  const idx = pendingClose;
                  setPendingClose(null);
                  close(idx);
                }}
                autoFocus
              >
                Discard changes
              </button>
            </>
          }
        >
          <p className="leading-relaxed">
            <strong>{pending.doc.name}</strong> has unsaved changes. If you close this tab, your edits will be lost.
          </p>
          <p className="text-2xs text-ps-textDim mt-2">
            Tip: <kbd className="px-1 py-0.5 bg-ps-panel3 rounded">Ctrl+S</kbd> saves the project file (.pchop) so you can reopen it later with full layers and history.
          </p>
        </Dialog>
      )}
    </>
  );
}
