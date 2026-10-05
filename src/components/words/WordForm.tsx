import React, { useState, useEffect } from 'react';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { WordWithState, CEFRLevel, Folder } from '../../types';
import { getFolders } from '../../api/folders';

interface WordFormProps {
  initialData?: WordWithState;
  onSubmit: (data: any) => Promise<void>;
  onCancel: () => void;
  preSelectedFolderIds?: string[];
}

export function WordForm({ initialData, onSubmit, onCancel, preSelectedFolderIds }: WordFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [word, setWord] = useState(initialData?.word || '');
  const [meaning, setMeaning] = useState(initialData?.meaning || '');
  const [level, setLevel] = useState<CEFRLevel>(initialData?.level || 'B1');
  const [partOfSpeech, setPartOfSpeech] = useState(initialData?.part_of_speech || '');
  const [exampleSentence, setExampleSentence] = useState(initialData?.example_sentence || '');
  const [exampleTranslation, setExampleTranslation] = useState(initialData?.example_translation || '');
  const [notes, setNotes] = useState(initialData?.notes || '');

  // Folder selection
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>(
    initialData?.folderIds || preSelectedFolderIds || []
  );

  useEffect(() => {
    getFolders()
      .then(data => setFolders(data.folders))
      .catch(console.error);
  }, []);

  const toggleFolder = (folderId: string) => {
    setSelectedFolderIds(prev =>
      prev.includes(folderId)
        ? prev.filter(id => id !== folderId)
        : [...prev, folderId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const payload = {
        word,
        meaning,
        level,
        part_of_speech: partOfSpeech || null,
        example_sentence: exampleSentence || null,
        example_translation: exampleTranslation || null,
        notes: notes || null,
        folderIds: selectedFolderIds,
      };
      await onSubmit(payload);
    } catch (err: any) {
      setError(err.message || 'An error occurred');
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {error && (
        <div className="p-3 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 rounded-lg text-sm">
          {error}
        </div>
      )}

      <Input
        label="Word"
        value={word}
        onChange={(e) => setWord(e.target.value)}
        required
        placeholder="e.g. reluctant"
      />

      <Input
        label="Meaning"
        value={meaning}
        onChange={(e) => setMeaning(e.target.value)}
        required
        placeholder="reluctant / unwilling"
      />

      <div className="flex gap-4">
        <div className="flex-1">
          <Select
            label="CEFR Level"
            value={level}
            onChange={(e) => setLevel(e.target.value as CEFRLevel)}
            required
            options={[
              { value: 'A1', label: 'A1' },
              { value: 'A2', label: 'A2' },
              { value: 'B1', label: 'B1' },
              { value: 'B2', label: 'B2' },
              { value: 'C1', label: 'C1' },
              { value: 'C2', label: 'C2' },
            ]}
          />
        </div>
        <div className="flex-1">
          <Input
            label="Part of Speech"
            value={partOfSpeech}
            onChange={(e) => setPartOfSpeech(e.target.value)}
            placeholder="e.g. adjective"
          />
        </div>
      </div>

      <Input
        label="Example Sentence"
        value={exampleSentence}
        onChange={(e) => setExampleSentence(e.target.value)}
        placeholder="She was reluctant to accept the offer."
      />

      <Input
        label="Example Translation"
        value={exampleTranslation}
        onChange={(e) => setExampleTranslation(e.target.value)}
        placeholder="translation of the example"
      />

      <Input
        label="Notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />

      {/* Folder selection */}
      {folders.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-surface-700">Folders</label>
          <div className="flex flex-wrap gap-2">
            {folders.map((folder) => {
              const isSelected = selectedFolderIds.includes(folder.id);
              return (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => toggleFolder(folder.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                    isSelected
                      ? 'border-surface-900 bg-surface-900 text-card'
                      : 'border-surface-200 bg-card transition-colors duration-200 text-surface-600 hover:border-surface-300'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: isSelected ? 'currentColor' : folder.color }}
                  />
                  {folder.name}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-surface-400 mt-0.5">Click to toggle folder membership</p>
        </div>
      )}

      <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-surface-100">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </form>
  );
}
