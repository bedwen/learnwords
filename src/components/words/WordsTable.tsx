import { useEffect, useRef } from 'react';
import { WordWithState } from '../../types';
import { Badge } from '../ui/Badge';

interface WordsTableProps {
  words: WordWithState[];
  loading: boolean;
  error: string | null;
  isUngrouped: boolean;
  selectedWordIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onEditWord: (word: WordWithState) => void;
  onRemoveFromFolder: (word: WordWithState) => void;
  onDeleteWord: (word: WordWithState) => void;
}

const checkboxClass =
  'h-4 w-4 rounded border-surface-300 accent-surface-900 cursor-pointer align-middle';

export function WordsTable({
  words,
  loading,
  error,
  isUngrouped,
  selectedWordIds,
  onToggleSelect,
  onToggleSelectAll,
  onEditWord,
  onRemoveFromFolder,
  onDeleteWord,
}: WordsTableProps) {
  const headerCheckboxRef = useRef<HTMLInputElement>(null);
  const allSelected = words.length > 0 && words.every((w) => selectedWordIds.has(w.id));
  const someSelected = words.some((w) => selectedWordIds.has(w.id));

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someSelected && !allSelected;
    }
  }, [someSelected, allSelected]);

  const getStatusLabel = (mastery: number) => {
    const statuses = ['New', 'Learning', 'Familiar', 'Strong', 'Mastered'];
    return statuses[mastery] || 'New';
  };

  return (
    <div className="bg-card transition-colors duration-200 rounded-xl shadow-sm border border-surface-100 overflow-hidden">
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
                <th className="pl-6 pr-2 py-4 w-10">
                  <input
                    id="words-select-all"
                    ref={headerCheckboxRef}
                    type="checkbox"
                    className={checkboxClass}
                    checked={allSelected}
                    onChange={onToggleSelectAll}
                    aria-label="Select all words"
                  />
                </th>
                <th className="px-6 py-4 font-medium">Word</th>
                <th className="px-6 py-4 font-medium">CEFR Level</th>
                <th className="px-6 py-4 font-medium">Meaning</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {words.map((word) => {
                const isSelected = selectedWordIds.has(word.id);
                return (
                <tr
                  key={word.id}
                  className={`transition-colors ${
                    isSelected ? 'bg-surface-50/70 dark:bg-surface-800/40' : 'hover:bg-surface-50/50'
                  }`}
                >
                  <td className="pl-6 pr-2 py-4 w-10">
                    <input
                      id={`word-select-${word.id}`}
                      type="checkbox"
                      className={checkboxClass}
                      checked={isSelected}
                      onChange={() => onToggleSelect(word.id)}
                      aria-label={`Select ${word.word}`}
                    />
                  </td>
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
                      onClick={() => onEditWord(word)}
                      className="text-surface-400 hover:text-surface-900 mx-2 transition-colors"
                    >
                      Edit
                    </button>
                    {!isUngrouped && (
                      <button
                        onClick={() => onRemoveFromFolder(word)}
                        className="text-surface-400 hover:text-amber-600 mx-2 transition-colors"
                      >
                        Remove
                      </button>
                    )}
                    <button
                      onClick={() => onDeleteWord(word)}
                      className="text-surface-400 hover:text-red-600 mx-2 transition-colors"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
