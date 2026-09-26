import React, { useEffect, useState, useCallback } from 'react';
import { WordWithState, Folder } from '../types';
import { getWords, createWord, updateWord, deleteWord, removeWordFromFolder } from '../api/words';
import { getFolders, createFolder, updateFolder, deleteFolder as deleteFolderApi } from '../api/folders';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { WordForm } from '../components/words/WordForm';
import { FolderForm } from '../components/words/FolderForm';

interface WordsProps {
  onNavigateToStudy: (folderId?: string) => void;
}

export function Words({ onNavigateToStudy }: WordsProps) {
  // Folder data
  const [folders, setFolders] = useState<Folder[]>([]);
  const [ungroupedCount, setUngroupedCount] = useState(0);
  const [foldersLoading, setFoldersLoading] = useState(true);

  // Current view: null = folder grid, string = specific folder ID, 'ungrouped' = ungrouped
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [activeFolderName, setActiveFolderName] = useState('');

  // Word data (for layer 2)
  const [words, setWords] = useState<WordWithState[]>([]);
  const [wordsLoading, setWordsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters (layer 2)
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState('');
  const [status, setStatus] = useState('');

  // Word modal states
  const [isWordFormOpen, setIsWordFormOpen] = useState(false);
  const [editingWord, setEditingWord] = useState<WordWithState | undefined>();
  const [isDeleteWordOpen, setIsDeleteWordOpen] = useState(false);
  const [deletingWord, setDeletingWord] = useState<WordWithState | undefined>();

  // Folder modal states
  const [isFolderFormOpen, setIsFolderFormOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<Folder | undefined>();
  const [isDeleteFolderOpen, setIsDeleteFolderOpen] = useState(false);
  const [deletingFolder, setDeletingFolder] = useState<Folder | undefined>();

  // Fetch folders
  const fetchFolders = useCallback(async () => {
    setFoldersLoading(true);
    try {
      const data = await getFolders();
      setFolders(data.folders);
      setUngroupedCount(data.ungroupedCount);
    } catch (err) {
      console.error('Failed to fetch folders:', err);
    } finally {
      setFoldersLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFolders();
  }, [fetchFolders]);

  // Fetch words when inside a folder
  const fetchWords = useCallback(async () => {
    if (activeFolderId === null) return;
    setWordsLoading(true);
    try {
      const data = await getWords({
        search,
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
  }, [activeFolderId, search, level, status]);

  useEffect(() => {
    if (activeFolderId === null) return;
    const timer = setTimeout(() => {
      fetchWords();
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchWords]);

  // Open a folder
  const openFolder = (folderId: string, folderName: string) => {
    setActiveFolderId(folderId);
    setActiveFolderName(folderName);
    setSearch('');
    setLevel('');
    setStatus('');
  };

  // Go back to folder grid
  const goBack = () => {
    setActiveFolderId(null);
    setActiveFolderName('');
    setWords([]);
    fetchFolders();
  };

  // Word handlers
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
    if (editingWord) {
      await updateWord(editingWord.id, data);
    } else {
      await createWord(data);
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
      if (activeFolderId !== null) {
        fetchWords();
      }
      fetchFolders();
    } catch (err) {
      alert('Delete operation failed.');
    }
  };

  const handleRemoveFromFolder = async (word: WordWithState) => {
    if (!activeFolderId || activeFolderId === 'ungrouped') return;
    try {
      await removeWordFromFolder(word.id, activeFolderId);
      fetchWords();
      fetchFolders();
    } catch (err) {
      alert('Failed to remove word from folder.');
    }
  };

  // Folder handlers
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
    if (editingFolder) {
      await updateFolder(editingFolder.id, data);
    } else {
      await createFolder(data);
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
      fetchFolders();
    } catch (err) {
      alert('Delete operation failed.');
    }
  };

  const getStatusLabel = (mastery: number) => {
    const statuses = ['New', 'Learning', 'Familiar', 'Strong', 'Mastered'];
    return statuses[mastery] || 'New';
  };

  // Pre-selected folder IDs for the word form when adding from inside a folder
  const getPreSelectedFolderIds = (): string[] => {
    if (activeFolderId && activeFolderId !== 'ungrouped') {
      return [activeFolderId];
    }
    return [];
  };

  // ───── LAYER 1: Folder Grid ─────
  if (activeFolderId === null) {
    return (
      <div className="py-8 space-y-6">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-surface-900">Words</h1>
            <p className="text-sm text-surface-500 mt-1">Organize your vocabulary into folders</p>
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={handleCreateFolderClick}>New Folder</Button>
            <Button onClick={handleAddWordClick}>Add Word</Button>
          </div>
        </div>

        {/* Folder Grid */}
        {foldersLoading ? (
          <div className="py-12 text-center text-surface-500">Loading...</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {/* User folders */}
            {folders.map((folder) => (
              <button
                key={folder.id}
                onClick={() => openFolder(folder.id, folder.name)}
                className="group relative bg-white rounded-2xl shadow-sm border border-surface-100 p-5 text-left transition-shadow hover:shadow-md"
              >
                {/* Color accent — left border */}
                <div
                  className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full"
                  style={{ backgroundColor: folder.color }}
                />

                {/* Edit / Delete icons (top right, visible on hover) */}
                <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span
                    onClick={(e) => handleEditFolderClick(e, folder)}
                    className="p-1.5 rounded-md hover:bg-surface-100 text-surface-400 hover:text-surface-700 transition-colors cursor-pointer"
                    title="Edit folder"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </span>
                  <span
                    onClick={(e) => handleDeleteFolderClick(e, folder)}
                    className="p-1.5 rounded-md hover:bg-red-50 text-surface-400 hover:text-red-600 transition-colors cursor-pointer"
                    title="Delete folder"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </span>
                </div>

                <div className="pl-3">
                  <h3 className="text-base font-semibold text-surface-900 mb-1">{folder.name}</h3>
                  <p className="text-sm text-surface-400">{folder.wordCount} {folder.wordCount === 1 ? 'word' : 'words'}</p>
                </div>
              </button>
            ))}

            {/* Ungrouped card */}
            <button
              onClick={() => openFolder('ungrouped', 'Ungrouped')}
              className="relative bg-white rounded-2xl shadow-sm border border-dashed border-surface-200 p-5 text-left transition-shadow hover:shadow-md"
            >
              <div className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full bg-surface-300" />
              <div className="pl-3">
                <h3 className="text-base font-semibold text-surface-500 mb-1">Ungrouped</h3>
                <p className="text-sm text-surface-400">{ungroupedCount} {ungroupedCount === 1 ? 'word' : 'words'}</p>
              </div>
            </button>
          </div>
        )}

        {/* Word Form Modal (from folder grid "Add Word") */}
        <Modal
          isOpen={isWordFormOpen}
          onClose={() => setIsWordFormOpen(false)}
          title={editingWord ? 'Edit Word' : 'Add Word'}
        >
          <WordForm
            initialData={editingWord}
            onSubmit={handleWordFormSubmit}
            onCancel={() => setIsWordFormOpen(false)}
          />
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
                Delete Folder
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    );
  }

  // ───── LAYER 2: Folder Contents ─────
  return (
    <div className="py-8 space-y-6">
      {/* Top bar */}
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
          <Button variant="secondary" onClick={() => onNavigateToStudy(activeFolderId)}>
            Study Now
          </Button>
          <Button onClick={handleAddWordClick}>Add Word</Button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-surface-100">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <Input
              placeholder="Search word or meaning..."
              value={search}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
            />
          </div>
          <div className="w-full sm:w-48">
            <Select
              options={[
                { value: '', label: 'All Levels' },
                { value: 'A1', label: 'A1' },
                { value: 'A2', label: 'A2' },
                { value: 'B1', label: 'B1' },
                { value: 'B2', label: 'B2' },
                { value: 'C1', label: 'C1' },
                { value: 'C2', label: 'C2' },
              ]}
              value={level}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setLevel(e.target.value)}
            />
          </div>
          <div className="w-full sm:w-48">
            <Select
              options={[
                { value: '', label: 'All Statuses' },
                { value: 'New', label: 'New' },
                { value: 'Learning', label: 'Learning' },
                { value: 'Familiar', label: 'Familiar' },
                { value: 'Strong', label: 'Strong' },
                { value: 'Mastered', label: 'Mastered' },
              ]}
              value={status}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setStatus(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Word Table */}
      <div className="bg-white rounded-xl shadow-sm border border-surface-100 overflow-hidden">
        {error ? (
          <div className="p-8 text-center text-red-600">{error}</div>
        ) : wordsLoading && words.length === 0 ? (
          <div className="p-8 text-center text-surface-500">Loading...</div>
        ) : words.length === 0 ? (
          <div className="p-12 text-center text-surface-500">
            <p>No words found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-50 text-surface-500 border-b border-surface-100">
                <tr>
                  <th className="px-6 py-4 font-medium">Word</th>
                  <th className="px-6 py-4 font-medium">CEFR Level</th>
                  <th className="px-6 py-4 font-medium">Meaning</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {words.map((word) => (
                  <tr key={word.id} className="hover:bg-surface-50/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-surface-900">{word.word}</td>
                    <td className="px-6 py-4">
                      <Badge variant={word.level}>{word.level}</Badge>
                    </td>
                    <td className="px-6 py-4 text-surface-600">{word.meaning}</td>
                    <td className="px-6 py-4">
                      <Badge variant={getStatusLabel(word.learning_state.mastery) as any}>
                        {getStatusLabel(word.learning_state.mastery)}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleEditWordClick(word)}
                        className="text-surface-400 hover:text-surface-900 mx-2 transition-colors"
                      >
                        Edit
                      </button>
                      {activeFolderId !== 'ungrouped' && (
                        <button
                          onClick={() => handleRemoveFromFolder(word)}
                          className="text-surface-400 hover:text-amber-600 mx-2 transition-colors"
                        >
                          Remove
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteWordClick(word)}
                        className="text-surface-400 hover:text-red-600 mx-2 transition-colors"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
    </div>
  );
}
