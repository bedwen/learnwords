import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  Folder as FolderIcon,
  RotateCw,
  ArrowRight,
  BookOpen,
  Keyboard,
  ChevronDown,
} from 'lucide-react';
import { WordWithState, ReviewRating, Folder, FolderListResponse } from '../types';
import { getStudyQueue, submitReview } from '../api/study';
import { getFolders } from '../api/folders';
import { getCached, setCached } from '../api/cache';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';

interface StudyProps {
  folderId?: string;
}

export function Study({ folderId }: StudyProps = {}) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [queue, setQueue] = useState<WordWithState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // State for the current card
  const [isRevealed, setIsRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // When true, disables CSS transition so the card flips instantly
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Folder filtering
  const [activeFolderId, setActiveFolderId] = useState<string | undefined>(
    () => searchParams.get('folderId') || folderId || undefined
  );
  const cachedFolders = getCached<FolderListResponse>('folders_list');
  const [folders, setFolders] = useState<Folder[]>(cachedFolders ? cachedFolders.folders : []);
  const [folderSwitcherOpen, setFolderSwitcherOpen] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);

  // Sync activeFolderId if URL search parameters change
  useEffect(() => {
    const urlFolderId = searchParams.get('folderId') || folderId || undefined;
    setActiveFolderId(urlFolderId);
  }, [searchParams, folderId]);

  // Load folders for the switcher and for word labels
  useEffect(() => {
    getFolders()
      .then((data) => {
        setFolders(data.folders);
        setCached('folders_list', data);
      })
      .catch(console.error);
  }, []);

  // Close switcher on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setFolderSwitcherOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getStudyQueue(activeFolderId);
      setQueue(data);
      setError(null);
    } catch (err) {
      setError('Failed to load study queue.');
    } finally {
      setLoading(false);
    }
  }, [activeFolderId]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const handleRating = useCallback(
    async (rating: ReviewRating) => {
      if (queue.length === 0 || submitting) return;

      setSubmitting(true);
      const currentWord = queue[0];

      try {
        setIsTransitioning(true);
        setIsRevealed(false);
        setQueue((prev) => prev.slice(1));

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setIsTransitioning(false);
          });
        });

        await submitReview(currentWord.id, rating);
      } catch (err) {
        console.error('Failed to submit review:', err);
      } finally {
        setSubmitting(false);
      }
    },
    [queue, submitting]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (!isRevealed && queue.length > 0 && !loading && !submitting) {
          setIsRevealed(true);
        }
        return;
      }

      if (isRevealed && !submitting && queue.length > 0) {
        switch (e.key) {
          case '1':
            handleRating('again');
            break;
          case '2':
            handleRating('hard');
            break;
          case '3':
            handleRating('good');
            break;
          case '4':
            handleRating('easy');
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRevealed, queue.length, loading, submitting, handleRating]);

  const getWordFolderLabels = (word: WordWithState): string => {
    if (!word.folderIds || word.folderIds.length === 0) {
      return 'Ungrouped';
    }
    return word.folderIds
      .map((id) => folders.find((f) => f.id === id)?.name || 'Unknown')
      .join(', ');
  };

  const getActiveFolderName = (): string => {
    if (!activeFolderId) return 'All Words';
    if (activeFolderId === 'ungrouped') return 'Ungrouped';
    return folders.find((f) => f.id === activeFolderId)?.name || 'Folder';
  };

  const handleFolderSwitch = (fId: string | undefined) => {
    setActiveFolderId(fId);
    setSearchParams(fId ? { folderId: fId } : {});
    setFolderSwitcherOpen(false);
    setIsRevealed(false);
  };

  if (loading && queue.length === 0) {
    return (
      <div className="py-24 flex flex-col items-center justify-center space-y-4">
        <div className="h-10 w-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground animate-pulse">Loading study queue...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-24 flex flex-col items-center justify-center text-center space-y-4">
        <p className="text-destructive font-medium">{error}</p>
        <Button onClick={fetchQueue} variant="outline">
          Retry
        </Button>
      </div>
    );
  }

  if (queue.length === 0) {
    return (
      <div className="py-20 flex flex-col items-center justify-center text-center max-w-lg mx-auto">
        <Card className="w-full border-border p-8 space-y-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-xs">
            <CheckCircle2 className="h-8 w-8" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              Queue Complete!
            </h2>
            <p className="text-sm text-muted-foreground">
              {activeFolderId
                ? `No more words due in "${getActiveFolderName()}" right now.`
                : "Great job! All scheduled reviews for today are finished."}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Button
              variant="secondary"
              className="w-full sm:w-auto gap-2"
              onClick={() => navigate('/')}
            >
              <span>Home</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="w-full sm:w-auto gap-2"
              onClick={fetchQueue}
            >
              <RotateCw className="h-4 w-4" />
              <span>Check Again</span>
            </Button>
            <Button
              variant="ghost"
              className="w-full sm:w-auto gap-2 text-muted-foreground"
              onClick={() => navigate('/words')}
            >
              <BookOpen className="h-4 w-4" />
              <span>Browse Words</span>
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const currentWord = queue[0];

  const getStatusLabel = (mastery: number) => {
    const statuses = ['New', 'Learning', 'Familiar', 'Strong', 'Mastered'];
    return statuses[mastery] || 'New';
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-140px)] py-6 space-y-6">
      {/* Session Top Bar: Folder Switcher & Queue Count */}
      <div className="flex flex-wrap items-center justify-between w-full max-w-[540px] px-2 gap-3">
        {/* Folder Switcher */}
        <div className="relative" ref={switcherRef}>
          <button
            type="button"
            onClick={() => setFolderSwitcherOpen(!folderSwitcherOpen)}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border border-border bg-card hover:bg-secondary transition-colors text-foreground shadow-2xs"
          >
            <FolderIcon className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Folder: <strong>{getActiveFolderName()}</strong></span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>

          {folderSwitcherOpen && (
            <div className="absolute top-full mt-1.5 left-0 bg-card rounded-xl shadow-lg border border-border py-1.5 min-w-[200px] z-50 animate-in fade-in-0 zoom-in-95 duration-150">
              <button
                type="button"
                onClick={() => handleFolderSwitch(undefined)}
                className={`w-full text-left px-3.5 py-1.5 text-xs hover:bg-secondary transition-colors ${
                  !activeFolderId ? 'text-foreground font-semibold bg-secondary/50' : 'text-muted-foreground'
                }`}
              >
                All Words
              </button>
              {folders.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => handleFolderSwitch(f.id)}
                  className={`w-full text-left px-3.5 py-1.5 text-xs hover:bg-secondary transition-colors flex items-center gap-2 ${
                    activeFolderId === f.id ? 'text-foreground font-semibold bg-secondary/50' : 'text-muted-foreground'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: f.color }}
                  />
                  <span>{f.name}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => handleFolderSwitch('ungrouped')}
                className={`w-full text-left px-3.5 py-1.5 text-xs hover:bg-secondary transition-colors flex items-center gap-2 ${
                  activeFolderId === 'ungrouped' ? 'text-foreground font-semibold bg-secondary/50' : 'text-muted-foreground'
                }`}
              >
                <span className="w-2 h-2 rounded-full shrink-0 bg-muted-foreground" />
                <span>Ungrouped</span>
              </button>
            </div>
          )}
        </div>

        {/* Queue badge */}
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs font-medium">
            {queue.length} {queue.length === 1 ? 'word' : 'words'} in queue
          </Badge>
        </div>
      </div>

      {/* The Flashcard */}
      <div className="w-full max-w-[540px] [perspective:1000px]">
        <div
          className={`relative w-full [transform-style:preserve-3d] ${
            isTransitioning ? '' : 'transition-transform duration-500'
          } ${isRevealed ? '[transform:rotateY(180deg)]' : ''}`}
          style={{ minHeight: '420px' }}
        >
          {/* FRONT FACE */}
          <div
            className="absolute inset-0 [-webkit-backface-visibility:hidden] [backface-visibility:hidden] [transform:rotateY(0deg)] bg-card rounded-2xl shadow-md border border-border px-6 py-6 sm:px-10 sm:py-8 flex flex-col items-center justify-between text-center"
            style={{ pointerEvents: isRevealed ? 'none' : 'auto' }}
          >
            {/* Header info */}
            <div className="w-full flex items-center justify-between text-xs text-muted-foreground">
              <span>{getWordFolderLabels(currentWord)}</span>
              <div className="flex items-center gap-1.5">
                <Badge variant={currentWord.level}>{currentWord.level}</Badge>
                <Badge variant={getStatusLabel(currentWord.learning_state.mastery) as any}>
                  {getStatusLabel(currentWord.learning_state.mastery)}
                </Badge>
              </div>
            </div>

            {/* English Word */}
            <div className="flex-1 flex flex-col justify-center items-center w-full py-6">
              <h2 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground break-words w-full">
                {currentWord.word}
              </h2>
              {currentWord.part_of_speech && (
                <span className="text-sm text-muted-foreground font-medium italic mt-2">
                  ({currentWord.part_of_speech})
                </span>
              )}
            </div>

            {/* Flip Action */}
            <div className="w-full flex flex-col items-center gap-2 pt-2">
              <Button
                variant="primary"
                size="lg"
                onClick={() => setIsRevealed(true)}
                className="w-full sm:w-auto px-8 py-2.5 font-semibold shadow-xs"
              >
                SHOW ANSWER
              </Button>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Keyboard className="h-3 w-3" /> Press <strong className="font-semibold text-foreground">Space</strong> to flip
              </span>
            </div>
          </div>

          {/* BACK FACE */}
          <div
            className="absolute inset-0 [-webkit-backface-visibility:hidden] [backface-visibility:hidden] [transform:rotateY(180deg)] bg-card rounded-2xl shadow-md border border-border px-6 py-6 sm:px-10 sm:py-7 flex flex-col items-center text-center"
            style={{ pointerEvents: isRevealed ? 'auto' : 'none' }}
          >
            {/* Word Header */}
            <div className="w-full flex items-center justify-between border-b border-border pb-3 mb-4 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground text-sm">{currentWord.word}</span>
              <Badge variant={currentWord.level}>{currentWord.level}</Badge>
            </div>

            {/* Scrollable details */}
            <div className="flex-1 w-full min-h-0 overflow-y-auto my-auto pr-1 space-y-4 text-center overscroll-contain">
              <div className="space-y-1">
                <p className="text-2xl font-bold text-foreground break-words">
                  {currentWord.meaning}
                </p>
              </div>

              {(currentWord.example_sentence || currentWord.example_translation) && (
                <div className="p-3.5 rounded-xl bg-secondary/50 border border-border/60 text-left space-y-1.5">
                  {currentWord.example_sentence && (
                    <p className="text-sm text-foreground font-medium italic">
                      "{currentWord.example_sentence}"
                    </p>
                  )}
                  {currentWord.example_translation && (
                    <p className="text-xs text-muted-foreground">
                      {currentWord.example_translation}
                    </p>
                  )}
                </div>
              )}

              {currentWord.notes && (
                <div className="p-2.5 rounded-lg bg-muted/40 text-left">
                  <p className="text-xs text-muted-foreground">
                    <strong className="text-foreground">Note:</strong> {currentWord.notes}
                  </p>
                </div>
              )}
            </div>

            {/* SRS Rating Buttons with Keyboard Shortcuts */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 w-full mt-auto pt-4 border-t border-border flex-shrink-0">
              <button
                type="button"
                onClick={() => handleRating('again')}
                className="flex flex-col items-center justify-center py-2.5 px-2 rounded-lg font-medium text-xs transition-all bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20 hover:bg-rose-500/20 active:scale-95 cursor-pointer"
              >
                <span className="font-bold text-sm">Again</span>
                <span className="text-2xs opacity-70 mt-0.5">[1]</span>
              </button>

              <button
                type="button"
                onClick={() => handleRating('hard')}
                className="flex flex-col items-center justify-center py-2.5 px-2 rounded-lg font-medium text-xs transition-all bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 hover:bg-amber-500/20 active:scale-95 cursor-pointer"
              >
                <span className="font-bold text-sm">Hard</span>
                <span className="text-2xs opacity-70 mt-0.5">[2]</span>
              </button>

              <button
                type="button"
                onClick={() => handleRating('good')}
                className="flex flex-col items-center justify-center py-2.5 px-2 rounded-lg font-medium text-xs transition-all bg-emerald-600/10 text-emerald-700 dark:text-emerald-300 border border-emerald-600/20 hover:bg-emerald-600/20 active:scale-95 cursor-pointer"
              >
                <span className="font-bold text-sm">Good</span>
                <span className="text-2xs opacity-70 mt-0.5">[3]</span>
              </button>

              <button
                type="button"
                onClick={() => handleRating('easy')}
                className="flex flex-col items-center justify-center py-2.5 px-2 rounded-lg font-medium text-xs transition-all bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20 hover:bg-sky-500/20 active:scale-95 cursor-pointer"
              >
                <span className="font-bold text-sm">Easy</span>
                <span className="text-2xs opacity-70 mt-0.5">[4]</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
