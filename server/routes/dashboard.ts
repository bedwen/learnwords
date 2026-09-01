import { Router } from 'express';
import { DashboardService } from '../services/dashboard';

const router = Router();

// GET /api/dashboard/summary
router.get('/summary', (_req, res) => {
  try {
    const summary = DashboardService.getDashboardSummary();
    res.json(summary);
  } catch (error) {
    console.error('Error fetching dashboard summary:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/dashboard/detailed
router.get('/detailed', (_req, res) => {
  try {
    const stats = DashboardService.getDetailedStats();
    res.json(stats);
  } catch (error) {
    console.error('Error fetching detailed stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
