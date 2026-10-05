import { getDatabase, initializeSchema, closeDatabase } from './db';
import { createApp } from './app';

const app = createApp();
const PORT = 3001;
// Bind to loopback only so the API is never exposed to the LAN (D018).
const HOST = '127.0.0.1';

// Initialize database and start server
const db = getDatabase();
initializeSchema(db);

const server = app.listen(PORT, HOST, () => {
  console.log(`LearnWords API running on http://${HOST}:${PORT}`);
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
