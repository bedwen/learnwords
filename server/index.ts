import { getDatabase, initializeSchema, closeDatabase } from './db';
import { createApp, getLanIpAddress } from './app';

const app = createApp();
const PORT = 3001;

const isLan = process.argv.includes('--lan');
const HOST = isLan ? '0.0.0.0' : (process.env.HOST || '127.0.0.1');

// Initialize database and start server
const db = getDatabase();
initializeSchema(db);

const server = app.listen(PORT, HOST, () => {
  if (isLan) {
    const lanIp = getLanIpAddress();
    console.log(`LearnWords API running in LAN mode on http://${HOST}:${PORT}`);
    if (lanIp) {
      console.log(`Mobile Peer URL: http://${lanIp}:${PORT}`);
    } else {
      console.log(`Mobile Peer URL: http://<LAN-IP>:${PORT}`);
    }
  } else {
    console.log(`LearnWords API running on http://${HOST}:${PORT}`);
  }
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
