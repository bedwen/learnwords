import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowRight,
  ArrowLeftRight,
  CheckCircle2,
  Check,
  RotateCw,
  BookOpen,
  Keyboard,
  Sparkles,
} from 'lucide-react';
import {
  WordWithState,
  ReviewRating,
  Folder,
  SentencePracticeDirection,
} from '../../types';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

const DIRECTION_STORAGE_KEY = 'learnwords_sentence_direction';

interface SentencePracticeViewProps {
  queue: WordWithState[];
  folders: Folder[];
  onReview: (rating: ReviewRating) => Promise<void>;
  onSwitchToFlashcards: () => void;
  onRefreshQueue: () => void;
}

export function SentencePracticeView({
  queue,
  folders,
  onReview,
  onSwitchToFlashcards,
  onRefreshQueue,
}: SentencePracticeViewProps) {
  const [direction, setDirection] = useState<SentencePracticeDirection>(() => {
    try {
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem(DIRECTION_STORAGE_KEY);
        if (saved === 'translation_to_sentence' || saved === 'sentence_to_translation') {
          return saved;
        }
      }
    } catch {
      // Ignore storage access errors in restricted or test environments
    }
    return 'sentence_to_translation';
  });

  const [input, setInput] = useState('');
  const [isRevealed, setIsRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const currentWord = queue[0];

  // Reset input and revelation state whenever the active card changes
  useEffect(() => {
    setIsRevealed(false);
    setInput('');
  }, [currentWord?.id]);

  // Focus input when moving to a new word or un-revealing
  useEffect(() => {
    if (!isRevealed && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isRevealed, currentWord?.id]);

  const handleDirectionChange = (newDirection: SentencePracticeDirection) => {
    setDirection(newDirection);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(DIRECTION_STORAGE_KEY, newDirection);
      }
    } catch {
      // Ignore storage access errors
    }
  };

  const handleReveal = useCallback(() => {
    if (isRevealed || queue.length === 0) return;
    setIsRevealed(true);
  }, [isRevealed, queue.length]);

  const handleRatingSubmit = useCallback(
    async (rating: ReviewRating) => {
      if (submitting || queue.length === 0) return;
      setInput('');
      setIsRevealed(false);
      setSubmitting(true);
      try {
        await onReview(rating);
      } catch (err) {
        console.error('Failed to submit sentence review:', err);
      } finally {
        setSubmitting(false);
      }
    },
    [submitting, queue.length, onReview]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // If answer is revealed and user presses 1-4, trigger rating
      if (isRevealed && !submitting && queue.length > 0) {
        if (e.key === '1') {
          e.preventDefault();
          handleRatingSubmit('again');
        } else if (e.key === '2') {
          e.preventDefault();
          handleRatingSubmit('hard');
        } else if (e.key === '3') {
          e.preventDefault();
          handleRatingSubmit('good');
        } else if (e.key === '4') {
          e.preventDefault();
          handleRatingSubmit('easy');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRevealed, submitting, queue.length, handleRatingSubmit]);

  const getWordFolderLabels = (word: WordWithState): string => {
    if (!word.folderIds || word.folderIds.length === 0) {
      return 'Ungrouped';
    }
    return word.folderIds
      .map((id) => folders.find((f) => f.id === id)?.name || 'Unknown')
      .join(', ');
  };

  const getStatusLabel = (mastery: number) => {
    const statuses = ['New', 'Learning', 'Familiar', 'Strong', 'Mastered'];
    return statuses[mastery] || 'New';
  };

  if (queue.length === 0) {
    return (
      <div className="py-20 flex flex-col items-center justify-center text-center max-w-lg mx-auto w-full">
        <Card className="w-full border-border p-8 space-y-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-xs">
            <CheckCircle2 className="h-8 w-8" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              Sentence Practice Complete!
            </h2>
            <p className="text-sm text-muted-foreground">
              No sentence practice cards due in this queue. Words require both an example sentence and translation.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Button
              variant="primary"
              className="w-full sm:w-auto gap-2"
              onClick={onSwitchToFlashcards}
            >
              <BookOpen className="h-4 w-4" />
              <span>Switch to Word Flashcards</span>
            </Button>
            <Button
              variant="outline"
              className="w-full sm:w-auto gap-2"
              onClick={onRefreshQueue}
            >
              <RotateCw className="h-4 w-4" />
              <span>Check Again</span>
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const promptSentence =
    direction === 'sentence_to_translation'
      ? currentWord.example_sentence
      : currentWord.example_translation;

  const referenceAnswer =
    direction === 'sentence_to_translation'
      ? currentWord.example_translation
      : currentWord.example_sentence;

  return (
    <div className="flex flex-col items-center w-full max-w-[620px] mx-auto space-y-4">
      {/* Practice Direction Selector */}
      <div className="flex items-center justify-between w-full px-1">
        <div className="inline-flex p-1 bg-secondary/60 rounded-xl border border-border text-xs font-medium">
          <button
            type="button"
            onClick={() => handleDirectionChange('sentence_to_translation')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              direction === 'sentence_to_translation'
                ? 'bg-card text-foreground font-semibold shadow-2xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span>Sentence → Translation</span>
          </button>
          <button
            type="button"
            onClick={() => handleDirectionChange('translation_to_sentence')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              direction === 'translation_to_sentence'
                ? 'bg-card text-foreground font-semibold shadow-2xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span>Translation → Sentence</span>
          </button>
        </div>

        <div className="hidden sm:flex items-center gap-1 text-2xs text-muted-foreground">
          <ArrowLeftRight className="h-3 w-3" />
          <span>Active Context Mode</span>
        </div>
      </div>

      {/* Main Prompt Card */}
      <Card className="w-full border-border bg-card p-5 sm:p-7 space-y-5 shadow-sm rounded-2xl">
        {/* Card Header */}
        <div className="flex items-center justify-between text-xs text-muted-foreground border-b border-border/60 pb-3">
          <span className="truncate max-w-[200px]">{getWordFolderLabels(currentWord)}</span>
          <div className="flex items-center gap-1.5 shrink-0">
            <Badge variant={currentWord.level}>{currentWord.level}</Badge>
            <Badge variant={getStatusLabel(currentWord.learning_state.mastery) as any}>
              {getStatusLabel(currentWord.learning_state.mastery)}
            </Badge>
          </div>
        </div>

        {/* Prompt Content */}
        <div className="space-y-3 py-2 text-left">
          <div className="flex items-center justify-between">
            <span className="text-2xs font-semibold uppercase tracking-wider text-primary">
              {direction === 'sentence_to_translation' ? 'Sentence Prompt' : 'Translation Prompt'}
            </span>
            <div className="inline-flex items-center gap-1 text-xs text-muted-foreground font-medium">
              <span>Target:</span>
              <strong className="text-foreground">{currentWord.word}</strong>
              {currentWord.part_of_speech && (
                <span className="italic text-muted-foreground">({currentWord.part_of_speech})</span>
              )}
            </div>
          </div>

          <p className="text-lg sm:text-2xl font-serif md:font-sans font-medium text-foreground leading-relaxed">
            "{promptSentence}"
          </p>
        </div>

        {/* Input & Check Block (When NOT revealed) */}
        {!isRevealed ? (
          <div className="space-y-3 pt-2">
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleReveal();
                  }
                }}
                rows={3}
                placeholder={
                  direction === 'sentence_to_translation'
                    ? 'Type your translation here...'
                    : `Type the sentence containing "${currentWord.word}" here...`
                }
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm sm:text-base text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all resize-none shadow-2xs"
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-2xs text-muted-foreground hidden sm:flex items-center gap-1">
                <Keyboard className="h-3 w-3" /> Press <strong className="text-foreground">Enter</strong> to check
              </span>
              <Button
                variant="primary"
                onClick={handleReveal}
                className="w-full sm:w-auto px-6 font-semibold shadow-xs gap-1.5 ml-auto"
              >
                <span>Check Answer</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          /* Revealed Comparison State */
          <div className="space-y-4 pt-2 border-t border-border/80 animate-in fade-in-50 duration-200">
            {/* Comparison Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
              {/* Canonical Reference */}
              <div className="p-3.5 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/30 space-y-1.5">
                <div className="flex items-center gap-1 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
                  <Check className="h-3.5 w-3.5" />
                  <span>Reference Answer</span>
                </div>
                <p className="text-sm sm:text-base text-foreground font-medium">
                  {referenceAnswer}
                </p>
              </div>

              {/* User Answer */}
              <div className="p-3.5 rounded-xl bg-secondary/50 border border-border space-y-1.5">
                <div className="text-xs font-semibold text-muted-foreground">
                  <span>Your Answer</span>
                </div>
                <p className="text-sm sm:text-base text-foreground break-words">
                  {input.trim() ? input : <span className="text-muted-foreground italic font-normal">(No text entered)</span>}
                </p>
              </div>
            </div>

            {/* Target Word Details */}
            <div className="p-3 rounded-xl bg-muted/40 border border-border/60 text-left flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div>
                <strong className="text-foreground text-sm mr-2">{currentWord.word}</strong>
                <span className="text-muted-foreground">{currentWord.meaning}</span>
              </div>
              {currentWord.notes && (
                <div className="text-2xs text-muted-foreground">
                  <strong>Note:</strong> {currentWord.notes}
                </div>
              )}
            </div>

            {/* SRS Self-Assessment Buttons */}
            <div className="pt-2 space-y-2">
              <div className="flex items-center justify-between text-2xs text-muted-foreground px-1">
                <span className="flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-primary" /> How well did you recall it?
                </span>
                <span className="hidden sm:inline">Use keys 1-4 to rate</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5 w-full">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleRatingSubmit('again')}
                  className="flex flex-col items-center justify-center min-h-[46px] py-1.5 px-2 rounded-xl font-medium text-xs transition-all bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20 hover:bg-rose-500/20 active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  <span className="font-bold text-sm">Again</span>
                  <span className="text-2xs opacity-70 mt-0.5">[1]</span>
                </button>

                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleRatingSubmit('hard')}
                  className="flex flex-col items-center justify-center min-h-[46px] py-1.5 px-2 rounded-xl font-medium text-xs transition-all bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 hover:bg-amber-500/20 active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  <span className="font-bold text-sm">Hard</span>
                  <span className="text-2xs opacity-70 mt-0.5">[2]</span>
                </button>

                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleRatingSubmit('good')}
                  className="flex flex-col items-center justify-center min-h-[46px] py-1.5 px-2 rounded-xl font-medium text-xs transition-all bg-emerald-600/10 text-emerald-700 dark:text-emerald-300 border border-emerald-600/20 hover:bg-emerald-600/20 active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  <span className="font-bold text-sm">Good</span>
                  <span className="text-2xs opacity-70 mt-0.5">[3]</span>
                </button>

                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleRatingSubmit('easy')}
                  className="flex flex-col items-center justify-center min-h-[46px] py-1.5 px-2 rounded-xl font-medium text-xs transition-all bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20 hover:bg-sky-500/20 active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  <span className="font-bold text-sm">Easy</span>
                  <span className="text-2xs opacity-70 mt-0.5">[4]</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
