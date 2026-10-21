import { Router } from 'express';
import { StudyService } from '../services/study';
import { ReviewRating, StudyMode } from '../../src/types';

const router = Router();

// GET /api/study/queue
router.get('/queue', (req, res) => {
  try {
    const folderId = req.query.folderId as string | undefined;
    const mode: StudyMode = req.query.mode === 'sentences' ? 'sentences' : 'words';
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const practiceAll = req.query.practiceAll === 'true';
    const queue = StudyService.getStudyQueue(isNaN(limit) ? 50 : limit, folderId, mode, practiceAll);
    res.json(queue);
  } catch (error) {
    console.error('Error fetching study queue:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/study/review
router.post('/review', (req, res) => {
  try {
    const { wordId, rating, mode } = req.body as { wordId: string; rating: ReviewRating; mode?: StudyMode };

    if (!wordId || !rating) {
      return res.status(400).json({ error: 'wordId and rating are required' });
    }

    if (!['again', 'hard', 'good', 'easy'].includes(rating)) {
      return res.status(400).json({ error: 'Invalid rating' });
    }

    const studyMode: StudyMode = mode === 'sentences' ? 'sentences' : 'words';
    const updatedWord = StudyService.processReview(wordId, rating, studyMode);
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
