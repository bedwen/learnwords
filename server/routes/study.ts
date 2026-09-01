import { Router } from 'express';
import { StudyService } from '../services/study';
import { ReviewRating } from '../../src/types';

const router = Router();

// GET /api/study/queue
router.get('/queue', (_req, res) => {
  try {
    const queue = StudyService.getStudyQueue(20);
    res.json(queue);
  } catch (error) {
    console.error('Error fetching study queue:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/study/review
router.post('/review', (req, res) => {
  try {
    const { wordId, rating } = req.body as { wordId: string; rating: ReviewRating };

    if (!wordId || !rating) {
      return res.status(400).json({ error: 'wordId and rating are required' });
    }

    if (!['again', 'hard', 'good', 'easy'].includes(rating)) {
      return res.status(400).json({ error: 'Invalid rating' });
    }

    const updatedWord = StudyService.processReview(wordId, rating);
    res.json(updatedWord);
  } catch (error: any) {
    console.error('Error processing review:', error);
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
