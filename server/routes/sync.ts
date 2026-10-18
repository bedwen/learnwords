import { Router } from 'express';
import express from 'express';
import { SyncService } from '../services/sync';
import { getLanIpAddress } from '../app';

const router = Router();
const syncJsonParser = express.json({ limit: '50mb' });

/**
 * GET /api/sync/info
 * Returns LAN peer discovery metadata (host LAN IP and peer URL).
 */
router.get('/info', (_req, res) => {
  const lanIp = getLanIpAddress();
  return res.json({
    status: 'ok',
    lanIp,
    port: 3001,
    peerUrl: lanIp ? `http://${lanIp}:3001` : null,
  });
});

/**
 * POST /api/sync
 * Accepts an incoming client SyncBundle, deterministically merges it into
 * the SQLite database using SmartMerge, and returns the merge statistics
 * along with the updated server SyncBundle.
 */
router.post('/', syncJsonParser, (req, res) => {
  try {
    const bundle = req.body?.bundle || req.body;
    if (!bundle || bundle.version !== 1) {
      return res.status(400).json({ error: 'Invalid sync bundle: missing or unsupported version' });
    }
    const { result, serverBundle } = SyncService.mergeSyncBundle(bundle);
    return res.json({ success: true, result, serverBundle });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'LAN Sync failed' });
  }
});

/**
 * GET /api/sync/bundle
 * Returns current server SyncBundle.
 */
router.get('/bundle', (_req, res) => {
  try {
    const serverBundle = SyncService.exportSyncBundle();
    return res.json(serverBundle);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to export server bundle' });
  }
});

export default router;
