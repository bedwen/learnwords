import { Router } from 'express';
import express from 'express';
import multer from 'multer';
import { getDatabase } from '../db';
import { exportAllData, importAllData, importWordsCsv, exportWordsCsv, ExportData } from '../services/data';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB limit
    files: 1,
  },
});

router.get('/export', (_req, res) => {
  try {
    const db = getDatabase();
    const data = exportAllData(db);
    res.json(data);
  } catch (error: any) {
    console.error('Error exporting data:', error);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

router.post('/import', express.json({ limit: '10mb' }), (req, res) => {
  try {
    if (req.headers['x-confirm-replace'] !== 'true') {
      return res.status(400).json({ error: 'Missing X-Confirm-Replace header' });
    }
    const db = getDatabase();
    const payload: ExportData = req.body;
    importAllData(db, payload);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error importing data:', error);
    res.status(400).json({ error: error.message || 'Invalid export data' });
  }
});

router.post('/import-words', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No CSV file uploaded' });
    }
    const db = getDatabase();
    const csvContent = req.file.buffer.toString('utf-8');
    const result = importWordsCsv(db, csvContent);
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    res.json(result);
  } catch (error: any) {
    console.error('Error importing CSV words:', error);
    res.status(500).json({ error: 'Internal server error during CSV import' });
  }
});

router.get('/export-words', (req, res) => {
  try {
    const db = getDatabase();
    const folderId = req.query.folderId as string | undefined;
    
    const csvString = exportWordsCsv(db, folderId);
    
    if (!csvString) {
      return res.status(404).json({ error: 'No words found for the selected filter.' });
    }

    let folderNamePart = 'all';
    if (folderId === 'ungrouped') {
      folderNamePart = 'ungrouped';
    } else if (folderId) {
      const folder = db.prepare('SELECT name FROM folders WHERE id = ?').get(folderId) as { name: string } | undefined;
      if (folder) {
        folderNamePart = folder.name.replace(/[^a-z0-9]/gi, '_');
      }
    }

    const date = new Date().toISOString().split('T')[0];
    const filename = `learnwords-words-${folderNamePart}-${date}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvString);
  } catch (error: any) {
    console.error('Error exporting CSV words:', error);
    res.status(500).json({ error: 'Internal server error during CSV export' });
  }
});

export default router;
