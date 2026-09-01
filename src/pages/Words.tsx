import React, { useEffect, useState, useCallback } from 'react';
import { WordWithState } from '../types';
import { getWords, createWord, updateWord, deleteWord } from '../api/words';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { WordForm } from '../components/words/WordForm';

export function Words() {
  const [words, setWords] = useState<WordWithState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState('');
  const [status, setStatus] = useState('');

  // Modal states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingWord, setEditingWord] = useState<WordWithState | undefined>();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deletingWord, setDeletingWord] = useState<WordWithState | undefined>();

  const fetchWords = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getWords({ search, level, status });
      setWords(data);
      setError(null);
    } catch (err: any) {
      setError('An error occurred while loading words.');
    } finally {
      setLoading(false);
    }
  }, [search, level, status]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchWords();
    }, 300); // debounce search
    return () => clearTimeout(timer);
  }, [fetchWords]);

  const handleAddClick = () => {
    setEditingWord(undefined);
    setIsFormOpen(true);
  };

  const handleEditClick = (word: WordWithState) => {
    setEditingWord(word);
    setIsFormOpen(true);
  };

  const handleDeleteClick = (word: WordWithState) => {
    setDeletingWord(word);
    setIsDeleteOpen(true);
  };

  const handleFormSubmit = async (data: any) => {
    if (editingWord) {
      await updateWord(editingWord.id, data);
    } else {
      await createWord(data);
    }
    setIsFormOpen(false);
    fetchWords();
  };

  const confirmDelete = async () => {
    if (!deletingWord) return;
    try {
      await deleteWord(deletingWord.id);
      setIsDeleteOpen(false);
      setDeletingWord(undefined);
      fetchWords();
    } catch (err) {
      alert('Delete operation failed.');
    }
  };

  const getStatusLabel = (mastery: number) => {
    const statuses = ['New', 'Learning', 'Familiar', 'Strong', 'Mastered'];
    return statuses[mastery] || 'New';
  };

  return (
    <div className="py-8 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Word List</h1>
          <p className="text-sm text-surface-500 mt-1">{words.length} words found</p>
        </div>
        <Button onClick={handleAddClick}>Add Word</Button>
      </div>

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

      <div className="bg-white rounded-xl shadow-sm border border-surface-100 overflow-hidden">
        {error ? (
          <div className="p-8 text-center text-red-600">{error}</div>
        ) : loading && words.length === 0 ? (
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
                        onClick={() => handleEditClick(word)}
                        className="text-surface-400 hover:text-surface-900 mx-2 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteClick(word)}
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

      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingWord ? 'Edit Word' : 'Add Word'}
      >
        <WordForm
          initialData={editingWord}
          onSubmit={handleFormSubmit}
          onCancel={() => setIsFormOpen(false)}
        />
      </Modal>

      <Modal
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        title="Delete Word"
      >
        <div className="space-y-6">
          <p className="text-surface-600">
            Are you sure you want to delete <strong>{deletingWord?.word}</strong> and its entire study history? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setIsDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmDelete}>
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
