import { Router } from 'express';
import { WordService } from '../services/words';
import { CreateWordDto, UpdateWordDto } from '../../src/types';

const router = Router();

// GET /api/words
router.get('/', (req, res) => {
  try {
    const words = WordService.getWords({
      search: req.query.search as string,
      level: req.query.level as string,
      status: req.query.status as string,
      sortBy: req.query.sortBy as 'created_at' | 'word',
      order: req.query.order as 'asc' | 'desc'
    });
    res.json(words);
  } catch (error) {
    console.error('Error fetching words:', error);
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

export default router;
