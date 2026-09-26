import { Router } from 'express';
import { FolderService } from '../services/folders';

const router = Router();

// GET /api/folders — List all folders with word counts + ungrouped count
router.get('/', (_req, res) => {
  try {
    const result = FolderService.listFolders();
    res.json(result);
  } catch (error) {
    console.error('Error fetching folders:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/folders — Create a folder
router.post('/', (req, res) => {
  try {
    const { name, color } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Folder name is required' });
    }

    const folder = FolderService.createFolder(name, color || '#94a3b8');
    res.status(201).json(folder);
  } catch (error) {
    console.error('Error creating folder:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/folders/:id — Update a folder
router.put('/:id', (req, res) => {
  try {
    const { name, color } = req.body;

    const folder = FolderService.updateFolder(req.params.id, { name, color });
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    res.json(folder);
  } catch (error) {
    console.error('Error updating folder:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/folders/:id — Delete a folder
router.delete('/:id', (req, res) => {
  try {
    const success = FolderService.deleteFolder(req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Folder not found' });
    }
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting folder:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
