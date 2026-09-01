import { LearningState, ReviewRating } from '../../src/types';

export interface ReviewHistoryRecord {
  rating: ReviewRating;
  reviewed_at: string;
}

export interface EngineResult {
  mastery: number;
  interval_step: number;
  next_review: string;
}

const INTERVAL_STEPS_DAYS = [
  1,   // Step 0
  3,   // Step 1
  7,   // Step 2
  14,  // Step 3
  30,  // Step 4
  60,  // Step 5
  120, // Step 6
  180  // Step 7
];

export class LearningEngine {
  /**
   * Calculate the new state after a review.
   * Pure function, absolutely deterministic.
   */
  static processReview(
    currentState: LearningState,
    history: ReviewHistoryRecord[],
    rating: ReviewRating,
    nowIsoString: string
  ): EngineResult {
    const now = new Date(nowIsoString);

    let newIntervalStep = currentState.interval_step;
    let newMastery = currentState.mastery;

    // 1. Calculate new interval step based on rating
    switch (rating) {
      case 'again':
        newIntervalStep = Math.max(0, currentState.interval_step - 1);
        break;
      case 'hard':
        // Stay at current step
        break;
      case 'good':
        newIntervalStep = Math.min(7, currentState.interval_step + 1);
        break;
      case 'easy':
        newIntervalStep = Math.min(7, currentState.interval_step + 2);
        break;
    }

    // 2. Calculate Mastery Progression / Regression
    if (rating === 'again') {
      // Mastery Regression
      if (currentState.mastery === 1 || currentState.mastery === 2) {
        newMastery = 1; // Learning, Familiar -> Learning
      } else if (currentState.mastery === 3) {
        newMastery = 2; // Strong -> Familiar
      } else if (currentState.mastery === 4) {
        newMastery = 3; // Mastered -> Strong
      }
    } else if (rating === 'good' || rating === 'easy') {
      // Progression
      if (currentState.mastery < 3) {
        newMastery = currentState.mastery + 1;
      }
    }

    // 3. The Mastered Criterion Check
    // "A word may become Mastered only when all conditions are true"
    // We only need to check if the newMastery could be 4 (if it was 3) or if it's already 4.
    if (newMastery === 3 || newMastery === 4) {
      const isMastered = this.checkMasteredCriteria(currentState, history, rating, newIntervalStep, nowIsoString);
      if (isMastered) {
        newMastery = 4;
      } else if (newMastery === 4) {
        newMastery = 3;
      }
    }

    // 4. Calculate next_review date
    const intervalDays = INTERVAL_STEPS_DAYS[newIntervalStep];
    const nextReviewDate = new Date(now);
    nextReviewDate.setDate(nextReviewDate.getDate() + intervalDays);
    
    return {
      mastery: newMastery,
      interval_step: newIntervalStep,
      next_review: nextReviewDate.toISOString(),
    };
  }

  private static checkMasteredCriteria(
    _currentState: LearningState,
    history: ReviewHistoryRecord[],
    currentRating: ReviewRating,
    newIntervalStep: number,
    nowIsoString: string
  ): boolean {
    // interval is at least 30 days (Step 4)
    if (INTERVAL_STEPS_DAYS[newIntervalStep] < 30) return false;

    // at least 5 successful reviews
    const allRatings = [...history.map(h => h.rating), currentRating];
    const successfulRatings = allRatings.filter(r => r === 'good' || r === 'easy');
    if (successfulRatings.length < 5) return false;

    // the last 3 reviews were successful
    if (allRatings.length < 3) return false;
    const lastThree = allRatings.slice(-3);
    const lastThreeSuccessful = lastThree.every(r => r === 'good' || r === 'easy');
    if (!lastThreeSuccessful) return false;

    // reviews occurred on at least 3 different calendar days
    const days = new Set(history.map(h => h.reviewed_at.split('T')[0]));
    days.add(nowIsoString.split('T')[0]);
    if (days.size < 3) return false;

    return true; 
  }
}
