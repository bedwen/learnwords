import { Router } from 'express';
import { WordService, CEFR_LEVELS, FolderNotFoundError } from '../services/words';
import { FolderService } from '../services/folders';
import { CreateWordDto, UpdateWordDto, BatchCefrDto, BatchDeleteDto, BatchFolderDto } from '../../src/types';

const router = Router();

function isValidIdList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((id) => typeof id === 'string' && id.trim().length > 0)
  );
}

// GET /api/words
router.get('/', (req, res) => {
  try {
    const words = WordService.getWords({
      search: req.query.search as string,
      level: req.query.level as string,
      status: req.query.status as string,
      sortBy: req.query.sortBy as 'created_at' | 'word',
      order: req.query.order as 'asc' | 'desc',
      folderId: req.query.folderId as string,
    });
    res.json(words);
  } catch (error) {
    console.error('Error fetching words:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Batch routes (must be declared before /:id routes) ---

// POST /api/words/batch/cefr — Manually change CEFR level for multiple words
router.post('/batch/cefr', (req, res) => {
  try {
    const { wordIds, level } = (req.body ?? {}) as Partial<BatchCefrDto>;
    if (!isValidIdList(wordIds)) {
      return res.status(400).json({ error: 'wordIds must be a non-empty array of IDs' });
    }
    if (typeof level !== 'string' || !CEFR_LEVELS.includes(level)) {
      return res.status(400).json({ error: 'Invalid CEFR level' });
    }

    const count = WordService.batchUpdateCefr(wordIds, level);
    res.json({ success: true, count });
  } catch (error) {
    console.error('Error batch updating CEFR level:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/words/batch/delete — Delete multiple words
router.post('/batch/delete', (req, res) => {
  try {
    const { wordIds } = (req.body ?? {}) as Partial<BatchDeleteDto>;
    if (!isValidIdList(wordIds)) {
      return res.status(400).json({ error: 'wordIds must be a non-empty array of IDs' });
    }

    const count = WordService.batchDeleteWords(wordIds);
    res.json({ success: true, count });
  } catch (error) {
    console.error('Error batch deleting words:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/words/batch/folder — Add/remove multiple words to/from a folder
router.post('/batch/folder', (req, res) => {
  try {
    const { wordIds, folderId, action } = (req.body ?? {}) as Partial<BatchFolderDto>;
    if (!isValidIdList(wordIds)) {
      return res.status(400).json({ error: 'wordIds must be a non-empty array of IDs' });
    }
    if (typeof folderId !== 'string' || folderId.trim().length === 0) {
      return res.status(400).json({ error: 'folderId is required' });
    }
    if (action !== 'add' && action !== 'remove') {
      return res.status(400).json({ error: "action must be 'add' or 'remove'" });
    }

    WordService.batchUpdateFolder(wordIds, folderId, action);
    res.json({ success: true });
  } catch (error) {
    if (error instanceof FolderNotFoundError) {
      return res.status(404).json({ error: 'Folder not found' });
    }
    console.error('Error batch updating folder:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/words/:id
router.get('/:id', (req, res) => {
  try {
    const word = WordService.getWordById(req.params.id);
    if (!word) {
      return res.status(404).json({ error: 'Word not found' });
    }
    res.json(word);
  } catch (error) {
    console.error('Error fetching word:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/words
router.post('/', (req, res) => {
  try {
    const data: CreateWordDto = req.body;
    
    // Basic validation
    if (!data.word || !data.meaning || !data.level) {
      return res.status(400).json({ error: 'Word, meaning, and level are required' });
    }
    if (!['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(data.level)) {
      return res.status(400).json({ error: 'Invalid CEFR level' });
    }

    const word = WordService.createWord(data);
    res.status(201).json(word);
  } catch (error) {
    console.error('Error creating word:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/words/:id
router.put('/:id', (req, res) => {
  try {
    const data: UpdateWordDto = req.body;
    
    if (data.level && !['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(data.level)) {
      return res.status(400).json({ error: 'Invalid CEFR level' });
    }

    const word = WordService.updateWord(req.params.id, data);
    if (!word) {
      return res.status(404).json({ error: 'Word not found' });
    }
    
    res.json(word);
  } catch (error) {
    console.error('Error updating word:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/words/:id
router.delete('/:id', (req, res) => {
  try {
    const success = WordService.deleteWord(req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Word not found' });
    }
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting word:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/words/:wordId/folders — Set folder associations (replaces all)
router.post('/:wordId/folders', (req, res) => {
  try {
    const { folderIds } = req.body as { folderIds: string[] };
    
    if (!Array.isArray(folderIds)) {
      return res.status(400).json({ error: 'folderIds must be an array' });
    }

    FolderService.setWordFolders(req.params.wordId, folderIds);
    res.json({ success: true });
  } catch (error) {
    console.error('Error setting word folders:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/words/:wordId/folders/:folderId — Remove word from a folder
router.delete('/:wordId/folders/:folderId', (req, res) => {
  try {
    const success = FolderService.removeWordFromFolder(req.params.wordId, req.params.folderId);
    if (!success) {
      return res.status(404).json({ error: 'Association not found' });
    }
    res.status(204).send();
  } catch (error) {
    console.error('Error removing word from folder:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
