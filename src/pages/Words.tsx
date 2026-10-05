import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { WordWithState, Folder, FolderListResponse, CEFRLevel } from '../types';
import {
  getWords,
  createWord,
  updateWord,
  deleteWord,
  removeWordFromFolder,
  batchUpdateCefr,
  batchDeleteWords,
  batchUpdateFolder,
} from '../api/words';
import { getFolders, createFolder, updateFolder, deleteFolder as deleteFolderApi } from '../api/folders';
import { getCached, setCached } from '../api/cache';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Select } from '../components/ui/Select';
import { WordForm } from '../components/words/WordForm';
import { FolderForm } from '../components/words/FolderForm';
import { FolderGrid } from '../components/words/FolderGrid';
import { WordsFilterBar } from '../components/words/WordsFilterBar';
import { WordsTable } from '../components/words/WordsTable';
import { BatchActionBar } from '../components/words/BatchActionBar';
import { useToast } from '../context/ToastContext';

const CEFR_OPTIONS: { value: CEFRLevel; label: string }[] = [
  { value: 'A1', label: 'A1' },
  { value: 'A2', label: 'A2' },
  { value: 'B1', label: 'B1' },
  { value: 'B2', label: 'B2' },
  { value: 'C1', label: 'C1' },
  { value: 'C2', label: 'C2' },
];

function pluralizeWords(count: number): string {
  return `${count} ${count === 1 ? 'word' : 'words'}`;
}

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function Words() {
  const navigate = useNavigate();
  const toast = useToast();

  // Folder data
  const cachedFolders = getCached<FolderListResponse>('folders_list');
  const [folders, setFolders] = useState<Folder[]>(cachedFolders ? cachedFolders.folders : []);
  const [ungroupedCount, setUngroupedCount] = useState(cachedFolders ? cachedFolders.ungroupedCount : 0);
  const [foldersLoading, setFoldersLoading] = useState(!cachedFolders);

  // Current view: null = folder grid, string = specific folder ID, 'ungrouped' = ungrouped
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [activeFolderName, setActiveFolderName] = useState('');

  // Word data (Layer 2)
  const [words, setWords] = useState<WordWithState[]>([]);
  const [wordsLoading, setWordsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters (Layer 2)
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [level, setLevel] = useState('');
  const [status, setStatus] = useState('');

  // Debounce search input only
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Modal states
  const [isWordFormOpen, setIsWordFormOpen] = useState(false);
  const [editingWord, setEditingWord] = useState<WordWithState | undefined>();
  const [isDeleteWordOpen, setIsDeleteWordOpen] = useState(false);
  const [deletingWord, setDeletingWord] = useState<WordWithState | undefined>();

  const [isFolderFormOpen, setIsFolderFormOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<Folder | undefined>();
  const [isDeleteFolderOpen, setIsDeleteFolderOpen] = useState(false);
  const [deletingFolder, setDeletingFolder] = useState<Folder | undefined>();

  // Batch selection (Layer 2)
  const [selectedWordIds, setSelectedWordIds] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);
  const [isBatchDeleteOpen, setIsBatchDeleteOpen] = useState(false);
  const [isBatchCefrOpen, setIsBatchCefrOpen] = useState(false);
  const [batchLevel, setBatchLevel] = useState<CEFRLevel>('A1');
  const [isBatchFolderOpen, setIsBatchFolderOpen] = useState(false);
  const [batchFolderId, setBatchFolderId] = useState('');

  // Fetch folders
  const fetchFolders = useCallback(async () => {
    if (!getCached('folders_list')) {
      setFoldersLoading(true);
    }
    try {
      const data = await getFolders();
      setFolders(data.folders);
      setUngroupedCount(data.ungroupedCount);
      setCached('folders_list', data);
    } catch (err) {
      console.error('Failed to fetch folders:', err);
    } finally {
      setFoldersLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFolders();
  }, [fetchFolders]);

  // Fetch words inside active folder
  const fetchWords = useCallback(async () => {
    if (activeFolderId === null) return;
    setWordsLoading(true);
    try {
      const data = await getWords({
        search: debouncedSearch,
        level,
        status,
        folderId: activeFolderId,
      });
      setWords(data);
      setError(null);
    } catch (err) {
      setError('An error occurred while loading words.');
    } finally {
      setWordsLoading(false);
    }
  }, [activeFolderId, debouncedSearch, level, status]);

  // Immediately fetch words on folder or filter dropdown changes
  useEffect(() => {
    if (activeFolderId === null) return;
    fetchWords();
  }, [fetchWords]);

  // Keep selection limited to currently visible words (e.g. after filtering),
  // so batch actions never affect words the user cannot see.
  useEffect(() => {
    setSelectedWordIds((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(words.map((w) => w.id));
      const next = new Set([...prev].filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [words]);

  const clearSelection = () => setSelectedWordIds(new Set());

  // Navigation handlers
  const openFolder = (folderId: string, folderName: string) => {
    setActiveFolderId(folderId);
    setActiveFolderName(folderName);
    setSearch('');
    setDebouncedSearch('');
    setLevel('');
    setStatus('');
    clearSelection();
  };

  const goBack = () => {
    setActiveFolderId(null);
    setActiveFolderName('');
    setWords([]);
    clearSelection();
    fetchFolders();
  };

  // Word CRUD handlers
  const handleAddWordClick = () => {
    setEditingWord(undefined);
    setIsWordFormOpen(true);
  };

  const handleEditWordClick = (word: WordWithState) => {
    setEditingWord(word);
    setIsWordFormOpen(true);
  };

  const handleDeleteWordClick = (word: WordWithState) => {
    setDeletingWord(word);
    setIsDeleteWordOpen(true);
  };

  const handleWordFormSubmit = async (data: any) => {
    try {
      if (editingWord) {
        await updateWord(editingWord.id, data);
        toast.success('Word updated.');
      } else {
        await createWord(data);
        toast.success('Word added.');
      }
    } catch (err) {
      toast.error(getErrorMessage(err, editingWord ? 'Failed to update word.' : 'Failed to add word.'));
      throw err;
    }
    setIsWordFormOpen(false);
    if (activeFolderId !== null) {
      fetchWords();
    }
    fetchFolders();
  };

  const confirmDeleteWord = async () => {
    if (!deletingWord) return;
    try {
      await deleteWord(deletingWord.id);
      setIsDeleteWordOpen(false);
      setDeletingWord(undefined);
      toast.success('Word deleted.');
      if (activeFolderId !== null) {
        fetchWords();
      }
      fetchFolders();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to delete word.'));
    }
  };

  const handleRemoveFromFolder = async (word: WordWithState) => {
    if (!activeFolderId || activeFolderId === 'ungrouped') return;
    try {
      await removeWordFromFolder(word.id, activeFolderId);
      toast.success('Word removed from folder.');
      fetchWords();
      fetchFolders();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to remove word from folder.'));
    }
  };

  // Batch selection handlers
  const handleToggleSelect = (id: string) => {
    setSelectedWordIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    const allSelected = words.length > 0 && words.every((w) => selectedWordIds.has(w.id));
    setSelectedWordIds(allSelected ? new Set() : new Set(words.map((w) => w.id)));
  };

  const isRealFolder = activeFolderId !== null && activeFolderId !== 'ungrouped';
  const addTargetFolders = folders.filter((f) => f.id !== activeFolderId);

  const runBatchAction = async (
    action: () => Promise<string>,
    fallbackError: string,
    onSuccess?: () => void
  ) => {
    setBatchBusy(true);
    try {
      const message = await action();
      onSuccess?.();
      toast.success(message);
      clearSelection();
      fetchWords();
      fetchFolders();
    } catch (err) {
      toast.error(getErrorMessage(err, fallbackError));
    } finally {
      setBatchBusy(false);
    }
  };

  const openBatchCefr = () => {
    setBatchLevel('A1');
    setIsBatchCefrOpen(true);
  };

  const openBatchFolder = () => {
    setBatchFolderId(addTargetFolders[0]?.id ?? '');
    setIsBatchFolderOpen(true);
  };

  const confirmBatchCefr = async () => {
    const ids = [...selectedWordIds];
    await runBatchAction(async () => {
      const { count } = await batchUpdateCefr(ids, batchLevel);
      return `Level set to ${batchLevel} for ${pluralizeWords(count)}.`;
    }, 'Failed to update CEFR level.', () => setIsBatchCefrOpen(false));
  };

  const confirmBatchDelete = async () => {
    const ids = [...selectedWordIds];
    await runBatchAction(async () => {
      const { count } = await batchDeleteWords(ids);
      return `${pluralizeWords(count)} deleted.`;
    }, 'Failed to delete words.', () => setIsBatchDeleteOpen(false));
  };

  const confirmBatchAddToFolder = async () => {
    if (!batchFolderId) return;
    const ids = [...selectedWordIds];
    const folderName = folders.find((f) => f.id === batchFolderId)?.name ?? 'folder';
    await runBatchAction(async () => {
      await batchUpdateFolder(ids, batchFolderId, 'add');
      return `${pluralizeWords(ids.length)} added to ${folderName}.`;
    }, 'Failed to add words to folder.', () => setIsBatchFolderOpen(false));
  };

  const handleBatchRemoveFromFolder = async () => {
    if (!isRealFolder || !activeFolderId) return;
    const ids = [...selectedWordIds];
    await runBatchAction(async () => {
      await batchUpdateFolder(ids, activeFolderId, 'remove');
      return `${pluralizeWords(ids.length)} removed from ${activeFolderName}.`;
    }, 'Failed to remove words from folder.');
  };

  // Folder CRUD handlers
  const handleCreateFolderClick = () => {
    setEditingFolder(undefined);
    setIsFolderFormOpen(true);
  };

  const handleEditFolderClick = (e: React.MouseEvent, folder: Folder) => {
    e.stopPropagation();
    setEditingFolder(folder);
    setIsFolderFormOpen(true);
  };

  const handleDeleteFolderClick = (e: React.MouseEvent, folder: Folder) => {
    e.stopPropagation();
    setDeletingFolder(folder);
    setIsDeleteFolderOpen(true);
  };

  const handleFolderFormSubmit = async (data: { name: string; color: string }) => {
    try {
      if (editingFolder) {
        await updateFolder(editingFolder.id, data);
        toast.success('Folder updated.');
      } else {
        await createFolder(data);
        toast.success('Folder created.');
      }
    } catch (err) {
      toast.error(getErrorMessage(err, editingFolder ? 'Failed to update folder.' : 'Failed to create folder.'));
      throw err;
    }
    setIsFolderFormOpen(false);
    setEditingFolder(undefined);
    fetchFolders();
  };

  const confirmDeleteFolder = async () => {
    if (!deletingFolder) return;
    try {
      await deleteFolderApi(deletingFolder.id);
      setIsDeleteFolderOpen(false);
      setDeletingFolder(undefined);
      toast.success('Folder deleted.');
      fetchFolders();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to delete folder.'));
    }
  };

  const getPreSelectedFolderIds = (): string[] => {
    if (activeFolderId && activeFolderId !== 'ungrouped') {
      return [activeFolderId];
    }
    return [];
  };

  return (
    <>
      {activeFolderId === null ? (
        /* Layer 1: Folder Grid */
        <FolderGrid
          folders={folders}
          ungroupedCount={ungroupedCount}
          loading={foldersLoading}
          onOpenFolder={openFolder}
          onNewFolder={handleCreateFolderClick}
          onAddWord={handleAddWordClick}
          onEditFolder={handleEditFolderClick}
          onDeleteFolder={handleDeleteFolderClick}
        />
      ) : (
        /* Layer 2: Folder Contents */
        <div className={`py-8 space-y-6 ${selectedWordIds.size > 0 ? 'pb-32' : ''}`}>
          {/* Top Bar */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={goBack}
                className="text-surface-400 hover:text-surface-900 transition-colors flex items-center gap-1 text-sm"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>
              <h1 className="text-2xl font-bold text-surface-900">{activeFolderName}</h1>
            </div>
            <div className="flex gap-3">
              <Button
                variant="secondary"
                onClick={() => navigate(activeFolderId ? `/study?folderId=${activeFolderId}` : '/study')}
              >
                Study Now
              </Button>
              <Button onClick={handleAddWordClick}>Add Word</Button>
            </div>
          </div>

          {/* Filters */}
          <WordsFilterBar
            search={search}
            onSearchChange={setSearch}
            level={level}
            onLevelChange={setLevel}
            status={status}
            onStatusChange={setStatus}
          />

          {/* Word Table */}
          <WordsTable
            words={words}
            loading={wordsLoading}
            error={error}
            isUngrouped={activeFolderId === 'ungrouped'}
            selectedWordIds={selectedWordIds}
            onToggleSelect={handleToggleSelect}
            onToggleSelectAll={handleToggleSelectAll}
            onEditWord={handleEditWordClick}
            onRemoveFromFolder={handleRemoveFromFolder}
            onDeleteWord={handleDeleteWordClick}
          />

          <BatchActionBar
            selectedCount={selectedWordIds.size}
            canRemoveFromFolder={isRealFolder}
            disabled={batchBusy}
            onChangeLevel={openBatchCefr}
            onAddToFolder={openBatchFolder}
            onRemoveFromFolder={handleBatchRemoveFromFolder}
            onDelete={() => setIsBatchDeleteOpen(true)}
            onClear={clearSelection}
          />
        </div>
      )}

      {/* Word Form Modal */}
      <Modal
        isOpen={isWordFormOpen}
        onClose={() => setIsWordFormOpen(false)}
        title={editingWord ? 'Edit Word' : 'Add Word'}
      >
        <WordForm
          initialData={editingWord}
          onSubmit={handleWordFormSubmit}
          onCancel={() => setIsWordFormOpen(false)}
          preSelectedFolderIds={!editingWord ? getPreSelectedFolderIds() : undefined}
        />
      </Modal>

      {/* Delete Word Confirmation */}
      <Modal
        isOpen={isDeleteWordOpen}
        onClose={() => setIsDeleteWordOpen(false)}
        title="Delete Word"
      >
        <div className="space-y-6">
          <p className="text-surface-600">
            Are you sure you want to delete <strong>{deletingWord?.word}</strong> and its entire study history? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setIsDeleteWordOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmDeleteWord}>
              Delete
            </Button>
          </div>
        </div>
      </Modal>

      {/* Folder Form Modal */}
      <Modal
        isOpen={isFolderFormOpen}
        onClose={() => { setIsFolderFormOpen(false); setEditingFolder(undefined); }}
        title={editingFolder ? 'Edit Folder' : 'New Folder'}
      >
        <FolderForm
          initialData={editingFolder}
          onSubmit={handleFolderFormSubmit}
          onCancel={() => { setIsFolderFormOpen(false); setEditingFolder(undefined); }}
        />
      </Modal>

      {/* Delete Folder Confirmation */}
      <Modal
        isOpen={isDeleteFolderOpen}
        onClose={() => setIsDeleteFolderOpen(false)}
        title="Delete Folder"
      >
        <div className="space-y-6">
          <p className="text-surface-600">
            Are you sure you want to delete <strong>{deletingFolder?.name}</strong>? The words inside will not be deleted — they will become ungrouped.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setIsDeleteFolderOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmDeleteFolder}>
              Delete
            </Button>
          </div>
        </div>
      </Modal>

      {/* Batch Delete Confirmation */}
      <Modal
        isOpen={isBatchDeleteOpen}
        onClose={() => setIsBatchDeleteOpen(false)}
        title="Delete Words"
      >
        <div className="space-y-6">
          <p className="text-surface-600">
            Are you sure you want to permanently delete <strong>{pluralizeWords(selectedWordIds.size)}</strong> and their entire study history? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setIsBatchDeleteOpen(false)} disabled={batchBusy}>
              Cancel
            </Button>
            <Button id="batch-delete-confirm" variant="danger" onClick={confirmBatchDelete} disabled={batchBusy}>
              Delete {pluralizeWords(selectedWordIds.size)}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Batch CEFR Level */}
      <Modal
        isOpen={isBatchCefrOpen}
        onClose={() => setIsBatchCefrOpen(false)}
        title="Change Level"
      >
        <div className="space-y-6">
          <p className="text-surface-600">
            Set the CEFR level for <strong>{pluralizeWords(selectedWordIds.size)}</strong>. Learning progress is not affected.
          </p>
          <Select
            id="batch-cefr-level"
            label="CEFR Level"
            options={CEFR_OPTIONS}
            value={batchLevel}
            onChange={(e) => setBatchLevel(e.target.value as CEFRLevel)}
          />
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setIsBatchCefrOpen(false)} disabled={batchBusy}>
              Cancel
            </Button>
            <Button id="batch-cefr-confirm" onClick={confirmBatchCefr} disabled={batchBusy}>
              Apply
            </Button>
          </div>
        </div>
      </Modal>

      {/* Batch Add to Folder */}
      <Modal
        isOpen={isBatchFolderOpen}
        onClose={() => setIsBatchFolderOpen(false)}
        title="Add to Folder"
      >
        <div className="space-y-6">
          {addTargetFolders.length === 0 ? (
            <p className="text-surface-600">
              There are no other folders yet. Create a folder first from the folder overview.
            </p>
          ) : (
            <>
              <p className="text-surface-600">
                Add <strong>{pluralizeWords(selectedWordIds.size)}</strong> to a folder. Existing folder memberships are kept.
              </p>
              <Select
                id="batch-folder-select"
                label="Folder"
                options={addTargetFolders.map((f) => ({ value: f.id, label: f.name }))}
                value={batchFolderId}
                onChange={(e) => setBatchFolderId(e.target.value)}
              />
            </>
          )}
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setIsBatchFolderOpen(false)} disabled={batchBusy}>
              Cancel
            </Button>
            <Button
              id="batch-folder-confirm"
              onClick={confirmBatchAddToFolder}
              disabled={batchBusy || !batchFolderId}
            >
              Add
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
