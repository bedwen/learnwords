import { useEffect, useRef } from 'react';
import { Pencil, FolderMinus, Trash2, BookOpen, RotateCcw } from 'lucide-react';
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
  isTrash?: boolean;
  selectedWordIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onEditWord?: (word: WordWithState) => void;
  onRemoveFromFolder?: (word: WordWithState) => void;
  onDeleteWord?: (word: WordWithState) => void;
  onRestoreWord?: (word: WordWithState) => void;
  onPermanentDeleteWord?: (word: WordWithState) => void;
}

const checkboxClass =
  'h-4 w-4 rounded border-input bg-card text-primary focus:ring-ring focus:ring-2 cursor-pointer align-middle transition-colors';

export function WordsTable({
  words,
  loading,
  error,
  isUngrouped,
  isTrash = false,
  selectedWordIds,
  onToggleSelect,
  onToggleSelectAll,
  onEditWord,
  onRemoveFromFolder,
  onDeleteWord,
  onRestoreWord,
  onPermanentDeleteWord,
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
            {isTrash ? <Trash2 className="h-6 w-6" /> : <BookOpen className="h-6 w-6" />}
          </div>
          <h3 className="text-base font-semibold text-foreground">
            {isTrash ? 'Trash bin is empty' : 'No words found'}
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            {isTrash
              ? 'Words you delete will appear here.'
              : 'Try adjusting your search criteria or add new words to start learning.'}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop Table View (md: and above) */}
          <div className="hidden md:block">
            <Table className="hidden md:table">
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
                  <TableHead className="px-6 py-3.5 font-semibold text-foreground">
                    {isTrash ? 'Deleted Date' : 'Status'}
                  </TableHead>
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
                      {isTrash ? (
                        <TableCell className="px-6 py-3.5 text-muted-foreground text-xs font-medium">
                          {word.deleted_at ? new Date(word.deleted_at).toLocaleDateString() : '—'}
                        </TableCell>
                      ) : (
                        <TableCell className="px-6 py-3.5">
                          <Badge variant={statusLabel as any}>
                            {statusLabel}
                          </Badge>
                        </TableCell>
                      )}
                      <TableCell className="px-6 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {isTrash ? (
                            <>
                              <Button
                                id={`restore-word-${word.id}`}
                                variant="ghost"
                                size="sm"
                                onClick={() => onRestoreWord?.(word)}
                                className="h-8 px-2 text-muted-foreground hover:text-primary"
                                title="Restore word"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                                <span className="ml-1 text-xs">Restore</span>
                              </Button>
                              <Button
                                id={`permanent-delete-word-${word.id}`}
                                variant="ghost"
                                size="sm"
                                onClick={() => onPermanentDeleteWord?.(word)}
                                className="h-8 px-2 text-muted-foreground hover:text-destructive"
                                title="Delete forever"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span className="ml-1 text-xs">Delete Forever</span>
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => onEditWord?.(word)}
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
                                  onClick={() => onRemoveFromFolder?.(word)}
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
                                onClick={() => onDeleteWord?.(word)}
                                className="h-8 px-2 text-muted-foreground hover:text-destructive"
                                title="Delete word"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span className="ml-1 text-xs">Delete</span>
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile Vertical Card List (<md:) */}
          <div className="md:hidden divide-y divide-border">
            <div className="px-4 py-2.5 bg-secondary/30 flex items-center justify-between text-xs text-muted-foreground">
              <label className="flex items-center gap-3 cursor-pointer font-medium text-foreground">
                <input
                  id="mobile-words-select-all"
                  type="checkbox"
                  className={checkboxClass}
                  checked={allSelected}
                  onChange={onToggleSelectAll}
                  aria-label="Select all words"
                />
                <span>Select All ({words.length})</span>
              </label>
              {selectedWordIds.size > 0 && (
                <span className="font-semibold text-primary">
                  {selectedWordIds.size} selected
                </span>
              )}
            </div>
            {words.map((word) => {
              const isSelected = selectedWordIds.has(word.id);
              const statusLabel = getStatusLabel(word.learning_state.mastery);

              return (
                <div
                  key={word.id}
                  className={`p-4 space-y-2.5 transition-colors ${
                    isSelected ? 'bg-secondary/60' : 'hover:bg-secondary/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <input
                        id={`mobile-word-select-${word.id}`}
                        type="checkbox"
                        className={checkboxClass}
                        checked={isSelected}
                        onChange={() => onToggleSelect(word.id)}
                        aria-label={`Select ${word.word}`}
                      />
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-base text-foreground break-words">{word.word}</span>
                        {word.part_of_speech && (
                          <span className="text-xs text-muted-foreground italic font-normal">
                            ({word.part_of_speech})
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant={word.level} className="font-semibold text-xs">
                        {word.level}
                      </Badge>
                      {isTrash ? (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          {word.deleted_at ? new Date(word.deleted_at).toLocaleDateString() : 'Deleted'}
                        </Badge>
                      ) : (
                        <Badge variant={statusLabel as any} className="text-xs">
                          {statusLabel}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <p className="text-sm text-foreground/90 font-medium pl-7 break-words">
                    {word.meaning}
                  </p>

                  <div className="flex items-center justify-end gap-1 pt-1 border-t border-border/40 pl-7">
                    {isTrash ? (
                      <>
                        <Button
                          id={`mobile-restore-word-${word.id}`}
                          variant="ghost"
                          size="sm"
                          onClick={() => onRestoreWord?.(word)}
                          className="h-9 px-3 text-muted-foreground hover:text-primary touch-manipulation"
                          title="Restore word"
                        >
                          <RotateCcw className="h-4 w-4" />
                          <span className="ml-1.5 text-xs font-medium">Restore</span>
                        </Button>
                        <Button
                          id={`mobile-permanent-delete-word-${word.id}`}
                          variant="ghost"
                          size="sm"
                          onClick={() => onPermanentDeleteWord?.(word)}
                          className="h-9 px-3 text-muted-foreground hover:text-destructive touch-manipulation"
                          title="Delete forever"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="ml-1.5 text-xs font-medium">Delete Forever</span>
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onEditWord?.(word)}
                          className="h-9 px-3 text-muted-foreground hover:text-foreground touch-manipulation"
                          title="Edit word"
                        >
                          <Pencil className="h-4 w-4" />
                          <span className="ml-1.5 text-xs font-medium">Edit</span>
                        </Button>
                        {!isUngrouped && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onRemoveFromFolder?.(word)}
                            className="h-9 px-3 text-muted-foreground hover:text-amber-600 touch-manipulation"
                            title="Remove from folder"
                          >
                            <FolderMinus className="h-4 w-4" />
                            <span className="ml-1.5 text-xs font-medium">Remove</span>
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onDeleteWord?.(word)}
                          className="h-9 px-3 text-muted-foreground hover:text-destructive touch-manipulation"
                          title="Delete word"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="ml-1.5 text-xs font-medium">Delete</span>
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
