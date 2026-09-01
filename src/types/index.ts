// Shared types between frontend and backend

export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export type ReviewRating = 'again' | 'hard' | 'good' | 'easy';

export interface Word {
  id: string;
  word: string;
  meaning: string;
  level: CEFRLevel;
  part_of_speech?: string | null;
  example_sentence?: string | null;
  example_translation?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface LearningState {
  id: string;
  word_id: string;
  mastery: number;
  interval_step: number;
  next_review: string;
  last_reviewed?: string | null;
  review_count: number;
  correct_count: number;
  wrong_count: number;
  consecutive_correct: number;
}

export interface WordWithState extends Word {
  learning_state: LearningState;
}

export interface CreateWordDto {
  word: string;
  meaning: string;
  level: CEFRLevel;
  part_of_speech?: string;
  example_sentence?: string;
  example_translation?: string;
  notes?: string;
}

export interface UpdateWordDto {
  word?: string;
  meaning?: string;
  level?: CEFRLevel;
  part_of_speech?: string | null;
  example_sentence?: string | null;
  example_translation?: string | null;
  notes?: string | null;
}

export interface CEFRStats {
  level: CEFRLevel;
  totalWords: number;
  masteredWords: number; // mastery = 4
}

export interface DashboardSummary {
  totalWords: number;
  dueForReview: number;
  cefrDistribution: CEFRStats[];
}

export interface DetailedStats {
  totalWords: number;
  cefrDistribution: { level: CEFRLevel; count: number }[];
  masteryDistribution: { mastery: number; count: number }[];
  totalReviews: number;
  totalCorrect: number;
  totalWrong: number;
  accuracy: number;
  difficultWords: WordWithState[]; // recently failed heavily
  recentReviews: {
    word: string;
    level: CEFRLevel;
    rating: ReviewRating;
    reviewed_at: string;
  }[];
}
