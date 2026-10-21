import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  SessionSummary,
  calculateSessionMetrics,
  SessionSummaryProps,
} from '../src/components/study/SessionSummary';
import { SessionReviewItem } from '../src/types';

describe('calculateSessionMetrics', () => {
  it('returns zeros and 0% accuracy when reviews array is empty', () => {
    const metrics = calculateSessionMetrics([]);
    expect(metrics).toEqual({
      total: 0,
      againCount: 0,
      hardCount: 0,
      goodCount: 0,
      easyCount: 0,
      correctCount: 0,
      needsReviewCount: 0,
      accuracy: 0,
    });
  });

  it('correctly aggregates rating counts and calculates 100% accuracy', () => {
    const reviews: SessionReviewItem[] = [
      { wordId: 'w1', rating: 'good', mode: 'words' },
      { wordId: 'w2', rating: 'easy', mode: 'words' },
      { wordId: 'w3', rating: 'good', mode: 'words' },
    ];
    const metrics = calculateSessionMetrics(reviews);
    expect(metrics.total).toBe(3);
    expect(metrics.goodCount).toBe(2);
    expect(metrics.easyCount).toBe(1);
    expect(metrics.againCount).toBe(0);
    expect(metrics.hardCount).toBe(0);
    expect(metrics.correctCount).toBe(3);
    expect(metrics.needsReviewCount).toBe(0);
    expect(metrics.accuracy).toBe(100);
  });

  it('correctly aggregates rating counts and calculates 0% accuracy for failed cards', () => {
    const reviews: SessionReviewItem[] = [
      { wordId: 'w1', rating: 'again', mode: 'words' },
      { wordId: 'w2', rating: 'hard', mode: 'words' },
    ];
    const metrics = calculateSessionMetrics(reviews);
    expect(metrics.total).toBe(2);
    expect(metrics.correctCount).toBe(0);
    expect(metrics.needsReviewCount).toBe(2);
    expect(metrics.accuracy).toBe(0);
  });

  it('rounds accuracy percentage to nearest integer (e.g. 2/3 = 67% and 1/3 = 33%)', () => {
    const reviews67: SessionReviewItem[] = [
      { wordId: 'w1', rating: 'good', mode: 'sentences' },
      { wordId: 'w2', rating: 'good', mode: 'sentences' },
      { wordId: 'w3', rating: 'again', mode: 'sentences' },
    ];
    expect(calculateSessionMetrics(reviews67).accuracy).toBe(67);

    const reviews33: SessionReviewItem[] = [
      { wordId: 'w1', rating: 'easy', mode: 'words' },
      { wordId: 'w2', rating: 'hard', mode: 'words' },
      { wordId: 'w3', rating: 'again', mode: 'words' },
    ];
    expect(calculateSessionMetrics(reviews33).accuracy).toBe(33);
  });
});

describe('SessionSummary Component Markup', () => {
  it('renders session complete header with folder and word mode', () => {
    const reviews: SessionReviewItem[] = [
      { wordId: 'w1', rating: 'good', mode: 'words' },
      { wordId: 'w2', rating: 'hard', mode: 'words' },
    ];
    const html = renderToStaticMarkup(
      <SessionSummary
        reviews={reviews}
        mode="words"
        folderName="Academic Vocabulary"
        onPracticeAll={() => {}}
        onToggleMode={() => {}}
        onNavigateHome={() => {}}
        onNavigateWords={() => {}}
      />
    );

    expect(html).toContain('Session Complete!');
    expect(html).toContain('Word Flashcards');
    expect(html).toContain('Academic Vocabulary');
    expect(html).toContain('Practice All Words');
    expect(html).toContain('Switch to Sentence Practice');
    expect(html).toContain('Home');
    expect(html).toContain('Browse Words');
  });

  it('renders sentence practice mode title and switch button in sentences mode', () => {
    const reviews: SessionReviewItem[] = [
      { wordId: 'w1', rating: 'easy', mode: 'sentences' },
    ];
    const html = renderToStaticMarkup(
      <SessionSummary
        reviews={reviews}
        mode="sentences"
        folderName="Technology"
        onPracticeAll={() => {}}
        onToggleMode={() => {}}
        onNavigateHome={() => {}}
        onNavigateWords={() => {}}
      />
    );

    expect(html).toContain('Sentence Practice');
    expect(html).toContain('Technology');
    expect(html).toContain('Practice All Sentences');
    expect(html).toContain('Switch to Word Flashcards');
  });

  it('renders metric cards with correct values and recall token styling', () => {
    const reviews: SessionReviewItem[] = [
      { wordId: 'w1', rating: 'again', mode: 'words' },
      { wordId: 'w2', rating: 'hard', mode: 'words' },
      { wordId: 'w3', rating: 'good', mode: 'words' },
      { wordId: 'w4', rating: 'easy', mode: 'words' },
    ];
    const html = renderToStaticMarkup(
      <SessionSummary
        reviews={reviews}
        mode="words"
        folderName="All Words"
        onPracticeAll={() => {}}
        onToggleMode={() => {}}
        onNavigateHome={() => {}}
        onNavigateWords={() => {}}
      />
    );

    // Accuracy is 2/4 = 50%
    expect(html).toContain('50%');
    expect(html).toContain('Reviewed');
    expect(html).toContain('Accuracy');
    expect(html).toContain('Retained');
    expect(html).toContain('Needs Review');

    // Recall tokens
    expect(html).toContain('bg-recall-again/10 text-recall-again border border-recall-again/20');
    expect(html).toContain('bg-recall-hard/10 text-recall-hard border border-recall-hard/20');
    expect(html).toContain('bg-recall-good/10 text-recall-good border border-recall-good/20');
    expect(html).toContain('bg-recall-easy/10 text-recall-easy border border-recall-easy/20');
  });
});

describe('SessionSummary Action Callbacks', () => {
  it('triggers onPracticeAll callback when Practice All button is clicked', () => {
    const onPracticeAll = vi.fn();
    const props: SessionSummaryProps = {
      reviews: [{ wordId: 'w1', rating: 'good', mode: 'words' }],
      mode: 'words',
      folderName: 'All Words',
      onPracticeAll,
      onToggleMode: vi.fn(),
      onNavigateHome: vi.fn(),
      onNavigateWords: vi.fn(),
    };

    const tree = SessionSummary(props);
    const card = tree.props.children;
    const buttonContainer = card.props.children[3];
    const btnPracticeAll = buttonContainer.props.children[0];

    btnPracticeAll.props.onClick();
    expect(onPracticeAll).toHaveBeenCalledTimes(1);
  });

  it('triggers onToggleMode callback when Switch Mode button is clicked', () => {
    const onToggleMode = vi.fn();
    const props: SessionSummaryProps = {
      reviews: [{ wordId: 'w1', rating: 'good', mode: 'sentences' }],
      mode: 'sentences',
      folderName: 'All Words',
      onPracticeAll: vi.fn(),
      onToggleMode,
      onNavigateHome: vi.fn(),
      onNavigateWords: vi.fn(),
    };

    const tree = SessionSummary(props);
    const card = tree.props.children;
    const buttonContainer = card.props.children[3];
    const btnToggleMode = buttonContainer.props.children[1];

    btnToggleMode.props.onClick();
    expect(onToggleMode).toHaveBeenCalledTimes(1);
  });

  it('triggers onNavigateHome callback when Home button is clicked', () => {
    const onNavigateHome = vi.fn();
    const props: SessionSummaryProps = {
      reviews: [{ wordId: 'w1', rating: 'good', mode: 'words' }],
      mode: 'words',
      folderName: 'All Words',
      onPracticeAll: vi.fn(),
      onToggleMode: vi.fn(),
      onNavigateHome,
      onNavigateWords: vi.fn(),
    };

    const tree = SessionSummary(props);
    const card = tree.props.children;
    const buttonContainer = card.props.children[3];
    const btnHome = buttonContainer.props.children[2];

    btnHome.props.onClick();
    expect(onNavigateHome).toHaveBeenCalledTimes(1);
  });

  it('triggers onNavigateWords callback when Browse Words button is clicked', () => {
    const onNavigateWords = vi.fn();
    const props: SessionSummaryProps = {
      reviews: [{ wordId: 'w1', rating: 'good', mode: 'words' }],
      mode: 'words',
      folderName: 'All Words',
      onPracticeAll: vi.fn(),
      onToggleMode: vi.fn(),
      onNavigateHome: vi.fn(),
      onNavigateWords,
    };

    const tree = SessionSummary(props);
    const card = tree.props.children;
    const buttonContainer = card.props.children[3];
    const btnWords = buttonContainer.props.children[3];

    btnWords.props.onClick();
    expect(onNavigateWords).toHaveBeenCalledTimes(1);
  });
});
