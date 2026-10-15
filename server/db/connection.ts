import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.resolve(process.cwd(), 'data');
let db: Database.Database | null = null;

/**
 * Get the current resolved database file path.
 * Checks LEARNWORDS_DB_PATH environment variable, defaulting to data/learnwords.db.
 */
export function getDatabasePath(): string {
  if (process.env.LEARNWORDS_DB_PATH) {
    return path.resolve(process.cwd(), process.env.LEARNWORDS_DB_PATH);
  }
  return path.join(DATA_DIR, 'learnwords.db');
}

/**
 * Get or create the database connection.
 * Ensures the target database directory exists and foreign keys are enabled.
 */
export function getDatabase(): Database.Database {
  if (db) return db;

  const targetPath = getDatabasePath();
  const targetDir = path.dirname(targetPath);
  fs.mkdirSync(targetDir, { recursive: true });

  db = new Database(targetPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  return db;
}

/**
 * Close the database connection.
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Create an in-memory database for testing.
 * Returns a fresh database instance with foreign keys enabled.
 */
export function createTestDatabase(): Database.Database {
  const testDb = new Database(':memory:');
  testDb.pragma('foreign_keys = ON');
  return testDb;
}
