import { X } from 'lucide-react';
import { useEditor } from '@/store/editorStore';
import { isDirty } from '@/core/document';

export function TabBar() {
  const docs = useEditor((s) => s.docs);
  const active = useEditor((s) => s.activeDocIndex);
  const setActive = useEditor((s) => s.setActiveDoc);
  const close = useEditor((s) => s.closeDocument);

  return (
    <div className="h-7 flex items-center bg-ps-panel border-b border-ps-border overflow-x-auto">
      {docs.map((slot, i) => {
        const dirty = isDirty(slot.doc);
        return (
          <div
            key={slot.doc.id}
            className={`flex items-center px-3 h-7 text-xs border-r border-ps-border cursor-pointer
              ${i === active ? 'bg-ps-bg text-ps-text' : 'bg-ps-panel text-ps-textDim hover:text-ps-text'}`}
            onClick={() => setActive(i)}
          >
            <span className="truncate max-w-[180px]">{slot.doc.name}{dirty && ' *'}</span>
            <span className="ml-2 text-2xs text-ps-textDim">{slot.doc.width}×{slot.doc.height}</span>
            <button
              className="ml-2 text-ps-textDim hover:text-ps-danger"
              onClick={(e) => { e.stopPropagation(); close(i); }}
              title="Close"
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
