import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { WordWithState, ReviewRating, Folder, FolderListResponse } from '../types';
import { getStudyQueue, submitReview } from '../api/study';
import { getFolders } from '../api/folders';
import { getCached, setCached } from '../api/cache';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';

interface StudyProps {
  folderId?: string;
}

export function Study({ folderId }: StudyProps = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [queue, setQueue] = useState<WordWithState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // State for the current card
  const [isRevealed, setIsRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // When true, disables CSS transition so the card flips instantly (no animation)
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
      .then(data => {
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

  const handleRating = useCallback(async (rating: ReviewRating) => {
    if (queue.length === 0 || submitting) return;
    
    setSubmitting(true);
    const currentWord = queue[0];
    
    try {
      // 1. Disable CSS transition so the flip-back is instant (no animation)
      setIsTransitioning(true);
      // 2. Flip card to front and load next word in the same render batch
      setIsRevealed(false);
      setQueue(prev => prev.slice(1));
      
      // 3. Re-enable transitions on the next frame so future flips animate normally
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsTransitioning(false);
        });
      });
      
      // Fire API in background
      await submitReview(currentWord.id, rating);
    } catch (err) {
      console.error('Failed to submit review:', err);
    } finally {
      setSubmitting(false);
    }
  }, [queue, submitting]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
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
          case '1': handleRating('again'); break;
          case '2': handleRating('hard'); break;
          case '3': handleRating('good'); break;
          case '4': handleRating('easy'); break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRevealed, queue.length, loading, submitting, handleRating]);

  // Get folder names for the current word
  const getWordFolderLabels = (word: WordWithState): string => {
    if (!word.folderIds || word.folderIds.length === 0) {
      return 'Ungrouped';
    }
    return word.folderIds
      .map(id => folders.find(f => f.id === id)?.name || 'Unknown')
      .join(', ');
  };

  // Get active folder name for display
  const getActiveFolderName = (): string => {
    if (!activeFolderId) return 'All Words';
    if (activeFolderId === 'ungrouped') return 'Ungrouped';
    return folders.find(f => f.id === activeFolderId)?.name || 'Folder';
  };

  const handleFolderSwitch = (fId: string | undefined) => {
    setActiveFolderId(fId);
    setSearchParams(fId ? { folderId: fId } : {});
    setFolderSwitcherOpen(false);
    setIsRevealed(false);
  };

  if (loading && queue.length === 0) {
    return <div className="py-20 text-center text-surface-500">Loading...</div>;
  }

  if (error) {
    return (
      <div className="py-20 text-center">
        <p className="text-red-600 mb-4">{error}</p>
        <Button onClick={fetchQueue}>Retry</Button>
      </div>
    );
  }

  if (queue.length === 0) {
    const emptyMessage = activeFolderId
      ? `No words to study in ${getActiveFolderName()} right now.`
      : "Great! You've finished all words due for review right now. You can add new words or come back later.";
    
    return (
      <div className="py-32 flex flex-col items-center justify-center text-center">
        <h2 className="text-2xl font-semibold text-surface-900 mb-2">No Words to Study</h2>
        <p className="text-surface-500 mb-6 max-w-md">{emptyMessage}</p>
        <Button onClick={fetchQueue}>Refresh</Button>
      </div>
    );
  }

  const currentWord = queue[0];

  const getStatusLabel = (mastery: number) => {
    const statuses = ['New', 'Learning', 'Familiar', 'Strong', 'Mastered'];
    return statuses[mastery] || 'New';
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-100px)] py-8">
      
      {/* Folder label above card */}
      <p className="text-surface-400 text-xs mb-1">
        {getWordFolderLabels(currentWord)}
      </p>

      <p 
        className={`text-surface-400 text-sm mb-6 transition-opacity duration-200 ${
          isRevealed ? 'opacity-0 select-none pointer-events-none' : 'opacity-100'
        }`}
        aria-hidden={isRevealed}
      >
        Focus only on this word.
      </p>

      {/* The Flashcard */}
      <div className="w-full max-w-[520px] [perspective:1000px]">
        <div className={`relative w-full [transform-style:preserve-3d] ${isTransitioning ? '' : 'transition-transform duration-500'} ${isRevealed ? '[transform:rotateY(180deg)]' : ''}`} style={{ minHeight: '400px' }}>
          
          {/* FRONT FACE */}
          <div className="absolute inset-0 [-webkit-backface-visibility:hidden] [backface-visibility:hidden] [transform:rotateY(0deg)] bg-card transition-colors duration-200 rounded-2xl shadow-md border border-surface-100 px-6 py-6 sm:px-10 sm:py-8 flex flex-col items-center text-center" style={{ pointerEvents: isRevealed ? 'none' : 'auto' }}>
            {/* Top Badge */}
            <div className="absolute top-6 left-0 right-0 flex justify-center">
              <Badge variant={currentWord.level}>{currentWord.level}</Badge>
            </div>

            {/* English Word */}
            <div className="flex-1 flex flex-col justify-center items-center w-full mt-6">
              <h2 className="text-4xl sm:text-5xl font-bold text-surface-900 mb-8 break-words w-full">
                {currentWord.word}
              </h2>
              <Button variant="secondary" onClick={() => setIsRevealed(true)} className="px-8 py-3">
                SHOW ANSWER
              </Button>
            </div>
          </div>

          {/* BACK FACE */}
          <div className="absolute inset-0 [-webkit-backface-visibility:hidden] [backface-visibility:hidden] [transform:rotateY(180deg)] bg-card transition-colors duration-200 rounded-2xl shadow-md border border-surface-100 px-6 py-6 sm:px-10 sm:py-8 flex flex-col items-center text-center" style={{ pointerEvents: isRevealed ? 'auto' : 'none' }}>
            
            {/* English Word (Small) */}
            <h3 className="text-lg font-medium text-surface-400 mb-6">{currentWord.word}</h3>
            
            <div className="flex-1 w-full min-h-0 overflow-y-auto my-auto pr-1 space-y-4 text-center overscroll-contain">
              <p className="text-xl sm:text-2xl font-semibold text-surface-900 pb-4 border-b border-surface-100 w-full break-words">
                {currentWord.meaning}
              </p>
              
              {(currentWord.example_sentence || currentWord.example_translation) && (
                <div className="space-y-2 pb-2">
                  {currentWord.example_sentence && (
                    <p className="text-surface-700 italic">"{currentWord.example_sentence}"</p>
                  )}
                  {currentWord.example_translation && (
                    <p className="text-surface-400 text-sm">"{currentWord.example_translation}"</p>
                  )}
                </div>
              )}

              {currentWord.notes && (
                <p className="text-surface-500 text-xs italic mt-2">
                  Note: {currentWord.notes}
                </p>
              )}
            </div>

            {/* Rating Buttons */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full mt-auto pt-4 flex-shrink-0">
              <button 
                onClick={() => handleRating('again')}
                className="px-4 py-3 rounded-lg font-medium text-sm transition-colors bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-950/50 dark:text-red-300 dark:hover:bg-red-900/50"
              >
                Again
              </button>
              <button 
                onClick={() => handleRating('hard')}
                className="px-4 py-3 rounded-lg font-medium text-sm transition-colors bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:hover:bg-amber-900/50"
              >
                Hard
              </button>
              <button 
                onClick={() => handleRating('good')}
                className="px-4 py-3 rounded-lg font-medium text-sm transition-colors bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-950/50 dark:text-green-300 dark:hover:bg-green-900/50"
              >
                Good
              </button>
              <button 
                onClick={() => handleRating('easy')}
                className="px-4 py-3 rounded-lg font-medium text-sm transition-colors bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:hover:bg-blue-900/50"
              >
                Easy
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Meta info below card */}
      <div className="mt-6 text-sm text-surface-400">
        {currentWord.level} · {getStatusLabel(currentWord.learning_state.mastery)}
      </div>

      {/* Folder switcher */}
      <div className="mt-3 relative" ref={switcherRef}>
        <button
          onClick={() => setFolderSwitcherOpen(!folderSwitcherOpen)}
          className="text-xs text-surface-400 hover:text-surface-600 transition-colors"
        >
          Study by Folder: <span className="underline">{getActiveFolderName()}</span>
        </button>
        
        {folderSwitcherOpen && (
          <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-card transition-colors duration-200 rounded-xl shadow-lg border border-surface-100 py-2 min-w-[200px] z-50">
            <button
              onClick={() => handleFolderSwitch(undefined)}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-surface-50 transition-colors ${
                !activeFolderId ? 'text-surface-900 font-medium' : 'text-surface-600'
              }`}
            >
              All Words
            </button>
            {folders.map(f => (
              <button
                key={f.id}
                onClick={() => handleFolderSwitch(f.id)}
                className={`w-full text-left px-4 py-2 text-sm hover:bg-surface-50 transition-colors flex items-center gap-2 ${
                  activeFolderId === f.id ? 'text-surface-900 font-medium' : 'text-surface-600'
                }`}
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: f.color }} />
                {f.name}
              </button>
            ))}
            <button
              onClick={() => handleFolderSwitch('ungrouped')}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-surface-50 transition-colors flex items-center gap-2 ${
                activeFolderId === 'ungrouped' ? 'text-surface-900 font-medium' : 'text-surface-600'
              }`}
            >
              <span className="w-2 h-2 rounded-full flex-shrink-0 bg-surface-300" />
              Ungrouped
            </button>
          </div>
        )}
      </div>

      {queue.length > 1 && (
        <div className="mt-4 text-xs text-surface-300">
          {queue.length - 1} more words in queue
        </div>
      )}
    </div>
  );
}
