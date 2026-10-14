import { useEffect, useRef } from 'react';
import { Pencil, FolderMinus, Trash2, BookOpen } from 'lucide-react';
import { WordWithState } from '../../types';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../ui/Table';

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
  'h-4 w-4 rounded border-input bg-card text-primary focus:ring-ring focus:ring-2 cursor-pointer align-middle transition-colors';

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
    <div className="bg-card rounded-xl shadow-xs border border-border overflow-hidden">
      {error ? (
        <div className="p-8 text-center text-destructive font-medium">{error}</div>
      ) : loading && words.length === 0 ? (
        <div className="p-12 text-center text-muted-foreground animate-pulse">
          Loading vocabulary...
        </div>
      ) : words.length === 0 ? (
        <div className="p-16 text-center space-y-3">
          <div className="mx-auto w-12 h-12 rounded-full bg-secondary flex items-center justify-center text-muted-foreground">
            <BookOpen className="h-6 w-6" />
          </div>
          <h3 className="text-base font-semibold text-foreground">No words found</h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Try adjusting your search criteria or add new words to start learning.
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader className="bg-secondary/40">
            <TableRow>
              <TableHead className="pl-6 pr-2 py-3.5 w-10">
                <input
                  id="words-select-all"
                  ref={headerCheckboxRef}
                  type="checkbox"
                  className={checkboxClass}
                  checked={allSelected}
                  onChange={onToggleSelectAll}
                  aria-label="Select all words"
                />
              </TableHead>
              <TableHead className="px-6 py-3.5 font-semibold text-foreground">Word</TableHead>
              <TableHead className="px-6 py-3.5 font-semibold text-foreground">Level</TableHead>
              <TableHead className="px-6 py-3.5 font-semibold text-foreground">Meaning</TableHead>
              <TableHead className="px-6 py-3.5 font-semibold text-foreground">Status</TableHead>
              <TableHead className="px-6 py-3.5 font-semibold text-foreground text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {words.map((word) => {
              const isSelected = selectedWordIds.has(word.id);
              const statusLabel = getStatusLabel(word.learning_state.mastery);

              return (
                <TableRow
                  key={word.id}
                  className={`transition-colors ${
                    isSelected ? 'bg-secondary/60' : 'hover:bg-secondary/30'
                  }`}
                >
                  <TableCell className="pl-6 pr-2 py-3.5 w-10">
                    <input
                      id={`word-select-${word.id}`}
                      type="checkbox"
                      className={checkboxClass}
                      checked={isSelected}
                      onChange={() => onToggleSelect(word.id)}
                      aria-label={`Select ${word.word}`}
                    />
                  </TableCell>
                  <TableCell className="px-6 py-3.5 font-semibold text-foreground">
                    <div className="flex items-center gap-2">
                      <span>{word.word}</span>
                      {word.part_of_speech && (
                        <span className="text-xs text-muted-foreground font-normal italic">
                          ({word.part_of_speech})
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="px-6 py-3.5">
                    <Badge variant={word.level} className="font-semibold text-xs">
                      {word.level}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-6 py-3.5 text-muted-foreground font-medium max-w-xs truncate">
                    {word.meaning}
                  </TableCell>
                  <TableCell className="px-6 py-3.5">
                    <Badge variant={statusLabel as any}>
                      {statusLabel}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-6 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onEditWord(word)}
                        className="h-8 px-2 text-muted-foreground hover:text-foreground"
                        title="Edit word"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        <span className="ml-1 text-xs">Edit</span>
                      </Button>
                      {!isUngrouped && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onRemoveFromFolder(word)}
                          className="h-8 px-2 text-muted-foreground hover:text-amber-600"
                          title="Remove from folder"
                        >
                          <FolderMinus className="h-3.5 w-3.5" />
                          <span className="ml-1 text-xs">Remove</span>
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDeleteWord(word)}
                        className="h-8 px-2 text-muted-foreground hover:text-destructive"
                        title="Delete word"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span className="ml-1 text-xs">Delete</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
