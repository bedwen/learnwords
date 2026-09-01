import { useEffect, useState, useCallback } from 'react';
import { WordWithState, ReviewRating } from '../types';
import { getStudyQueue, submitReview } from '../api/study';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';

export function Study() {
  const [queue, setQueue] = useState<WordWithState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // State for the current card
  const [isRevealed, setIsRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // When true, disables CSS transition so the card flips instantly (no animation)
  const [isTransitioning, setIsTransitioning] = useState(false);

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getStudyQueue();
      setQueue(data);
      setError(null);
    } catch (err) {
      setError('Failed to load study queue.');
    } finally {
      setLoading(false);
    }
  }, []);

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
    return (
      <div className="py-32 flex flex-col items-center justify-center text-center">
        <h2 className="text-2xl font-semibold text-surface-900 mb-2">No Words to Study</h2>
        <p className="text-surface-500 mb-6 max-w-md">
          Great! You've finished all words due for review right now.
          You can add new words or come back later.
        </p>
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
      
      {!isRevealed && (
        <p className="text-surface-400 text-sm mb-6 transition-opacity">
          Focus only on this word.
        </p>
      )}

      {/* The Flashcard */}
      <div className="w-full max-w-[520px] [perspective:1000px]">
        <div className={`relative w-full [transform-style:preserve-3d] ${isTransitioning ? '' : 'transition-transform duration-500'} ${isRevealed ? '[transform:rotateY(180deg)]' : ''}`} style={{ minHeight: '400px' }}>
          
          {/* FRONT FACE */}
          <div className="absolute inset-0 [-webkit-backface-visibility:hidden] [backface-visibility:hidden] [transform:rotateY(0deg)] bg-white rounded-2xl shadow-md border border-surface-100 p-8 sm:p-12 flex flex-col items-center text-center" style={{ pointerEvents: isRevealed ? 'none' : 'auto' }}>
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
          <div className="absolute inset-0 [-webkit-backface-visibility:hidden] [backface-visibility:hidden] [transform:rotateY(180deg)] bg-white rounded-2xl shadow-md border border-surface-100 p-8 sm:p-12 flex flex-col items-center text-center" style={{ pointerEvents: isRevealed ? 'auto' : 'none' }}>
            
            {/* English Word (Small) */}
            <h3 className="text-lg font-medium text-surface-400 mb-6">{currentWord.word}</h3>
            
            <div className="flex-1 w-full flex flex-col items-center justify-center space-y-6">
              <p className="text-2xl text-surface-900 font-semibold pb-6 border-b border-surface-100 w-full">
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
            </div>

            {/* Rating Buttons */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full mt-auto pt-4">
              <button 
                onClick={() => handleRating('again')}
                className="px-4 py-3 rounded-lg font-medium text-sm transition-colors bg-red-100 text-red-700 hover:bg-red-200"
              >
                Again
              </button>
              <button 
                onClick={() => handleRating('hard')}
                className="px-4 py-3 rounded-lg font-medium text-sm transition-colors bg-amber-100 text-amber-700 hover:bg-amber-200"
              >
                Hard
              </button>
              <button 
                onClick={() => handleRating('good')}
                className="px-4 py-3 rounded-lg font-medium text-sm transition-colors bg-green-100 text-green-700 hover:bg-green-200"
              >
                Good
              </button>
              <button 
                onClick={() => handleRating('easy')}
                className="px-4 py-3 rounded-lg font-medium text-sm transition-colors bg-blue-100 text-blue-700 hover:bg-blue-200"
              >
                Easy
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Meta info below card */}
      <div className="mt-6 text-sm text-surface-400">
        {currentWord.level} • {getStatusLabel(currentWord.learning_state.mastery)}
      </div>

      {queue.length > 1 && (
        <div className="mt-4 text-xs text-surface-300">
          {queue.length - 1} more words in queue
        </div>
      )}
    </div>
  );
}
