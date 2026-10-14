import { Router } from 'express';
import { HomeService } from '../services/home';

const router = Router();

// GET /api/home/summary (and /api/dashboard/summary)
router.get('/summary', (_req, res) => {
  try {
    const summary = HomeService.getHomeSummary();
    res.json(summary);
  } catch (error) {
    console.error('Error fetching home summary:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/home/detailed (and /api/dashboard/detailed)
router.get('/detailed', (_req, res) => {
  try {
    const stats = HomeService.getDetailedStats();
    res.json(stats);
  } catch (error) {
    console.error('Error fetching detailed stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
