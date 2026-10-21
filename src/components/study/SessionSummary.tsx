import {
  CheckCircle2,
  BookOpen,
  Target,
  Sparkles,
  RotateCw,
  Languages,
  ArrowRight,
} from 'lucide-react';
import { ReviewRating, StudyMode, SessionReviewItem } from '../../types';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';

export interface SessionSummaryProps {
  reviews: SessionReviewItem[];
  mode: StudyMode;
  folderName: string;
  onPracticeAll: () => void;
  onToggleMode: () => void;
  onNavigateHome: () => void;
  onNavigateWords: () => void;
}

export interface SessionMetrics {
  total: number;
  againCount: number;
  hardCount: number;
  goodCount: number;
  easyCount: number;
  correctCount: number;
  needsReviewCount: number;
  accuracy: number;
}

export function calculateSessionMetrics(
  reviews: Array<{ rating: ReviewRating }>
): SessionMetrics {
  const total = reviews.length;
  const againCount = reviews.filter((r) => r.rating === 'again').length;
  const hardCount = reviews.filter((r) => r.rating === 'hard').length;
  const goodCount = reviews.filter((r) => r.rating === 'good').length;
  const easyCount = reviews.filter((r) => r.rating === 'easy').length;
  const correctCount = goodCount + easyCount;
  const needsReviewCount = againCount + hardCount;
  const accuracy = total > 0 ? Math.round((correctCount / total) * 100) : 0;

  return {
    total,
    againCount,
    hardCount,
    goodCount,
    easyCount,
    correctCount,
    needsReviewCount,
    accuracy,
  };
}

export function SessionSummary({
  reviews,
  mode,
  folderName,
  onPracticeAll,
  onToggleMode,
  onNavigateHome,
  onNavigateWords,
}: SessionSummaryProps) {
  const {
    total,
    againCount,
    hardCount,
    goodCount,
    easyCount,
    correctCount,
    needsReviewCount,
    accuracy,
  } = calculateSessionMetrics(reviews);

  return (
    <div className="py-12 sm:py-20 flex flex-col items-center justify-center text-center max-w-xl mx-auto w-full px-4">
      <Card className="w-full border-border p-6 sm:p-8 space-y-6 shadow-sm rounded-3xl bg-card">
        {/* Header */}
        <div className="space-y-3">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center shadow-xs">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <div className="space-y-1">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Session Complete!
            </h2>
            <p className="text-sm text-muted-foreground">
              {mode === 'sentences' ? 'Sentence Practice' : 'Word Flashcards'} ·{' '}
              <span className="font-medium text-foreground">{folderName}</span>
            </p>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-1">
          <div className="p-3.5 rounded-2xl bg-secondary/40 border border-border/60 flex flex-col items-center justify-center space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
              <BookOpen className="h-3.5 w-3.5 text-primary" />
              <span>Reviewed</span>
            </div>
            <span className="text-2xl font-bold text-foreground" data-testid="metric-total">
              {total}
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-secondary/40 border border-border/60 flex flex-col items-center justify-center space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
              <Target className="h-3.5 w-3.5 text-primary" />
              <span>Accuracy</span>
            </div>
            <span className="text-2xl font-bold text-foreground" data-testid="metric-accuracy">
              {accuracy}%
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-secondary/40 border border-border/60 flex flex-col items-center justify-center space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
              <Sparkles className="h-3.5 w-3.5 text-recall-good" />
              <span>Retained</span>
            </div>
            <span className="text-2xl font-bold text-recall-good" data-testid="metric-retained">
              {correctCount}
            </span>
            <span className="text-2xs text-muted-foreground">Good + Easy</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-secondary/40 border border-border/60 flex flex-col items-center justify-center space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
              <RotateCw className="h-3.5 w-3.5 text-recall-again" />
              <span>Needs Review</span>
            </div>
            <span className="text-2xl font-bold text-recall-again" data-testid="metric-needs-review">
              {needsReviewCount}
            </span>
            <span className="text-2xs text-muted-foreground">Again + Hard</span>
          </div>
        </div>

        {/* Rating Distribution */}
        <div className="space-y-2 pt-1 text-left">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider block text-center">
            Rating Distribution
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold bg-recall-again/10 text-recall-again border border-recall-again/20">
              <span>Again</span>
              <span data-testid="count-again">{againCount}</span>
            </div>
            <div className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold bg-recall-hard/10 text-recall-hard border border-recall-hard/20">
              <span>Hard</span>
              <span data-testid="count-hard">{hardCount}</span>
            </div>
            <div className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold bg-recall-good/10 text-recall-good border border-recall-good/20">
              <span>Good</span>
              <span data-testid="count-good">{goodCount}</span>
            </div>
            <div className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold bg-recall-easy/10 text-recall-easy border border-recall-easy/20">
              <span>Easy</span>
              <span data-testid="count-easy">{easyCount}</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-3 pt-2">
          <Button
            variant="primary"
            className="w-full sm:w-auto gap-2"
            onClick={onPracticeAll}
          >
            <RotateCw className="h-4 w-4" />
            <span>
              {mode === 'sentences' ? 'Practice All Sentences' : 'Practice All Words'}
            </span>
          </Button>

          <Button
            variant="outline"
            className="w-full sm:w-auto gap-2"
            onClick={onToggleMode}
          >
            {mode === 'sentences' ? (
              <>
                <BookOpen className="h-4 w-4" />
                <span>Switch to Word Flashcards</span>
              </>
            ) : (
              <>
                <Languages className="h-4 w-4" />
                <span>Switch to Sentence Practice</span>
              </>
            )}
          </Button>

          <Button
            variant="ghost"
            className="w-full sm:w-auto gap-2 text-muted-foreground"
            onClick={onNavigateHome}
          >
            <span>Home</span>
            <ArrowRight className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            className="w-full sm:w-auto gap-2 text-muted-foreground"
            onClick={onNavigateWords}
          >
            <BookOpen className="h-4 w-4" />
            <span>Browse Words</span>
          </Button>
        </div>
      </Card>
    </div>
  );
}
