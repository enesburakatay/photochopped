import type { ReactNode } from 'react';

export function Dialog({ title, children, onClose, footer, width = 420 }: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  width?: number;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-ps-panel border border-ps-border shadow-2xl rounded" style={{ width }}>
        <div className="px-3 py-2 border-b border-ps-border flex items-center justify-between">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button className="text-ps-textDim hover:text-ps-text" onClick={onClose}>✕</button>
        </div>
        <div className="p-3 text-sm">{children}</div>
        {footer && <div className="px-3 py-2 border-t border-ps-border flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
