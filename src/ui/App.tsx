import { useCallback, useRef, useState } from 'react';
import { Canvas } from './canvas/Canvas';
import { MenuBar } from './shell/MenuBar';
import { Toolbar } from './shell/Toolbar';
import { OptionsBar } from './shell/OptionsBar';
import { TabBar } from './shell/TabBar';
import { StatusBar } from './shell/StatusBar';
import { LayersPanel } from './panels/LayersPanel';
import { HistoryPanel } from './panels/HistoryPanel';
import { ColorPanel } from './panels/ColorPanel';
import { PropertiesPanel } from './panels/PropertiesPanel';
import { NewDocumentDialog } from './dialogs/NewDocumentDialog';
import { ExportDialog } from './dialogs/ExportDialog';
import { FilterDialog, type FilterChoice } from './dialogs/FilterDialog';
import { useEditor } from '@/store/editorStore';
import { useShortcuts } from '@/hooks/useShortcuts';
import { useAutosave } from '@/hooks/useAutosave';
import { importImageAsDocument, importFromClipboard } from '@/io/import';
import { downloadBlob, exportDocument, exportProjectFile, importProjectFile, copyDocumentToClipboard } from '@/io/export';

export function App() {
  const docs = useEditor((s) => s.docs);
  const activeDocIndex = useEditor((s) => s.activeDocIndex);
  const openDocument = useEditor((s) => s.openDocument);

  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [filterDialog, setFilterDialog] = useState<FilterChoice | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const projectInputRef = useRef<HTMLInputElement | null>(null);

  const handleOpen = useCallback(() => fileInputRef.current?.click(), []);
  const handleNew = useCallback(() => setNewDialogOpen(true), []);
  const handleExport = useCallback(() => setExportDialogOpen(true), []);

  const handleSave = useCallback(async () => {
    const slot = useEditor.getState().docs[useEditor.getState().activeDocIndex];
    if (!slot) return;
    const blob = await exportProjectFile(slot.doc);
    downloadBlob(blob, `${slot.doc.name}.pchop.json`);
  }, []);

  const handleSaveAs = handleSave;

  useShortcuts({
    onSave: handleSave,
    onSaveAs: handleSaveAs,
    onExport: handleExport,
    onOpen: handleOpen,
    onNew: handleNew,
  });
  useAutosave();

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      try {
        if (file.name.endsWith('.pchop.json') || file.type === 'application/json') {
          const doc = await importProjectFile(file);
          openDocument(doc);
        } else {
          const doc = await importImageAsDocument(file);
          openDocument(doc);
        }
      } catch (err) {
        console.error('Failed to open file', file.name, err);
      }
    }
  }, [openDocument]);

  const handlePaste = useCallback(async () => {
    const doc = await importFromClipboard();
    if (doc) openDocument(doc);
  }, [openDocument]);

  return (
    <div
      className="h-full w-full flex flex-col bg-ps-bg text-ps-text"
      onDragOver={(e) => { e.preventDefault(); }}
      onDrop={(e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
      }}
      onPaste={(e) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const it of Array.from(items)) {
          if (it.type.startsWith('image/')) {
            const f = it.getAsFile();
            if (f) handleFiles([f]);
          }
        }
      }}
    >
      <MenuBar
        onNew={handleNew}
        onOpen={handleOpen}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        onExport={handleExport}
        onPaste={handlePaste}
        onCopy={async () => {
          const slot = useEditor.getState().docs[useEditor.getState().activeDocIndex];
          if (slot) await copyDocumentToClipboard(slot.doc);
        }}
        onApplyFilter={(choice) => setFilterDialog(choice)}
      />
      <OptionsBar />
      <TabBar />
      <div className="flex-1 flex overflow-hidden">
        <Toolbar />
        <main className="flex-1 relative overflow-hidden">
          {docs.length > 0 && <Canvas key={docs[activeDocIndex]?.doc.id} />}
        </main>
        <aside className="w-72 flex flex-col bg-ps-panel border-l border-ps-border">
          <ColorPanel />
          <PropertiesPanel />
          <LayersPanel />
          <HistoryPanel />
        </aside>
      </div>
      <StatusBar />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pchop.json,application/json"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) handleFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input ref={projectInputRef} type="file" accept=".pchop.json,application/json" className="hidden" />

      {newDialogOpen && <NewDocumentDialog onClose={() => setNewDialogOpen(false)} />}
      {exportDialogOpen && (
        <ExportDialog
          onClose={() => setExportDialogOpen(false)}
          onConfirm={async (format, quality) => {
            const slot = useEditor.getState().docs[useEditor.getState().activeDocIndex];
            if (!slot) return;
            const blob = await exportDocument(slot.doc, { format, quality });
            downloadBlob(blob, `${slot.doc.name}.${format === 'jpeg' ? 'jpg' : format}`);
            setExportDialogOpen(false);
          }}
        />
      )}
      {filterDialog && <FilterDialog choice={filterDialog} onClose={() => setFilterDialog(null)} />}
    </div>
  );
}
