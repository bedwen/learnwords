// Shared types between frontend and backend

export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export type ReviewRating = 'again' | 'hard' | 'good' | 'easy';
export type StudyMode = 'words' | 'sentences';
export type SentencePracticeDirection = 'sentence_to_translation' | 'translation_to_sentence';

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
  updated_at: number;
  sync_id: string;
  deleted_at: number | null;
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
  sentence_mastery?: number;
  sentence_interval_step?: number;
  sentence_next_review?: string | null;
  sentence_last_reviewed?: string | null;
}

export interface WordWithState extends Word {
  learning_state: LearningState;
  folderIds?: string[];
}

export interface CreateWordDto {
  word: string;
  meaning: string;
  level: CEFRLevel;
  part_of_speech?: string;
  example_sentence?: string;
  example_translation?: string;
  notes?: string;
  folderIds?: string[];
}

export interface UpdateWordDto {
  word?: string;
  meaning?: string;
  level?: CEFRLevel;
  part_of_speech?: string | null;
  example_sentence?: string | null;
  example_translation?: string | null;
  notes?: string | null;
  folderIds?: string[];
}

export interface BatchCefrDto {
  wordIds: string[];
  level: CEFRLevel;
}

export interface BatchDeleteDto {
  wordIds: string[];
}

export interface BatchFolderDto {
  wordIds: string[];
  folderId: string;
  action: 'add' | 'remove';
}

export interface TrashCountResponse {
  count: number;
}

export interface BatchRestoreDto {
  wordIds: string[];
}

export interface BatchPermanentDeleteDto {
  wordIds: string[];
}

export interface CEFRStats {
  level: CEFRLevel;
  totalWords: number;
  masteredWords: number; // mastery = 4
}

export interface ActivityDay {
  date: string; // 'YYYY-MM-DD'
  count: number; // total = reviews + wordsAdded
  reviews: number;
  wordsAdded: number;
}

export type ReviewActivityDay = ActivityDay;

export interface HomeSummary {
  totalWords: number;
  dueForReview: number;
  cefrDistribution: CEFRStats[];
  activityDays?: ActivityDay[];
  activeDaysLast90?: number;
  totalContributionsLast90?: number;
  // Backwards-compatibility fallbacks
  activeDaysLastYear?: number;
  totalContributionsLastYear?: number;
  reviewActivity?: ActivityDay[];
  activeDaysLast60?: number;
  totalReviewsLast60?: number;
  currentStreak?: number;
}

export type DashboardSummary = HomeSummary;

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

// Folder types
export interface Folder {
  id: string;
  name: string;
  color: string;
  wordCount: number;
  created_at: string;
  updated_at: number;
  sync_id: string;
  deleted_at: number | null;
}

export interface FolderListResponse {
  folders: Folder[];
  ungroupedCount: number;
}

// Review History types
export interface ReviewHistoryRecord {
  sync_id?: string;
  rating: ReviewRating;
  reviewed_at: string;
}

export interface LocalReviewHistoryRecord {
  id: string;
  sync_id: string;
  word_id: string;
  rating: ReviewRating;
  mastery_before: number;
  mastery_after: number;
  interval_step_before: number;
  interval_step_after: number;
  reviewed_at: string;
}

// Sync Bundle types
export interface SyncBundle {
  version: 1;
  deviceId: string;
  exportedAt: string;
  words: Word[];
  folders: Folder[];
  word_folders: { word_id: string; folder_id: string }[];
  review_history: LocalReviewHistoryRecord[];
}

export interface SyncMergeResult {
  success: boolean;
  wordsAdded: number;
  wordsUpdated: number;
  wordsDeleted: number;
  foldersAdded: number;
  foldersUpdated: number;
  foldersDeleted: number;
  reviewsMerged: number;
}

export interface ExportData {
  schemaVersion: number;
  exportedAt: string;
  wordCount: number;
  data: {
    words: any[];
    learning_states: any[];
    review_history: any[];
    folders: any[];
    word_folders: any[];
  };
}

export interface CsvImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  errors: string[];
}

export interface SessionReviewItem {
  wordId: string;
  rating: ReviewRating;
  mode: StudyMode;
}



