import express from 'express';
import cors from 'cors';
import { getDatabase, initializeSchema, closeDatabase } from './db';

import wordsRouter from './routes/words';
import studyRouter from './routes/study';
import dashboardRouter from './routes/dashboard';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

app.use('/api/words', wordsRouter);
app.use('/api/study', studyRouter);
app.use('/api/dashboard', dashboardRouter);

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Initialize database and start server
const db = getDatabase();
initializeSchema(db);

const server = app.listen(PORT, () => {
  console.log(`LearnWords API running on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down...');
  server.close();
  closeDatabase();
  process.exit(0);
});

process.on('SIGTERM', () => {
  server.close();
  closeDatabase();
  process.exit(0);
});

export default app;
