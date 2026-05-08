import { useEditor } from '@/store/editorStore';

export function HistoryPanel() {
  const slot = useEditor((s) => s.docs[s.activeDocIndex]);
  // Subscribe to rev so this re-renders when history changes (history is stored
  // in a class instance, so we use the rev counter as a re-render signal).
  const _rev = useEditor((s) => s.docs[s.activeDocIndex]?.rev ?? 0);
  void _rev;
  if (!slot) return null;
  const list = slot.history.list();

  return (
    <div className="border-t border-ps-border max-h-48 flex flex-col">
      <div className="pc-panel-header">
        <span>History</span>
        <span className="normal-case text-2xs text-ps-textDim">{list.entries.length} steps</span>
      </div>
      <div className="overflow-y-auto flex-1">
        {list.entries.length === 0 && (
          <div className="px-2 py-2 text-2xs text-ps-textDim italic">No history yet — make an edit.</div>
        )}
        {list.entries.map((e, i) => (
          <div
            key={e.id}
            className={`px-2 py-1 text-xs border-b border-ps-border flex items-center justify-between
              ${i < list.cursor ? 'opacity-50 italic' : ''}`}
          >
            <span>{e.label}</span>
            <span className="text-2xs text-ps-textDim">{new Date(e.timestamp).toLocaleTimeString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
