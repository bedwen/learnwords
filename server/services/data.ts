import Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import Papa from 'papaparse';

export interface ExportData {
  schemaVersion: number;
  exportedAt: string;
  wordCount: number;
  data: {
    words: any[];
    learning_states: any[];
    review_history: any[];
    folders: any[];
    word_folders: any[];
  };
}

export function exportAllData(db: Database.Database): ExportData {
  const words = db.prepare('SELECT * FROM words').all();
  const learning_states = db.prepare('SELECT * FROM learning_states').all();
  const review_history = db.prepare('SELECT * FROM review_history').all();
  const folders = db.prepare('SELECT * FROM folders').all();
  const word_folders = db.prepare('SELECT * FROM word_folders').all();

  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    wordCount: words.length,
    data: {
      words,
      learning_states,
      review_history,
      folders,
      word_folders,
    },
  };
}

export function importAllData(db: Database.Database, data: ExportData): void {
  // Validate schema version
  if (data.schemaVersion !== 1) {
    throw new Error('Unsupported schema version');
  }

  // Validate data shape
  if (!data.data || typeof data.data !== 'object') {
    throw new Error('Invalid data payload');
  }

  const { words, learning_states, review_history, folders, word_folders } = data.data;

  if (!Array.isArray(words) || !Array.isArray(learning_states) || !Array.isArray(review_history) || !Array.isArray(folders) || !Array.isArray(word_folders)) {
    throw new Error('Missing or invalid tables in data payload');
  }

  // Run in a single transaction
  const transaction = db.transaction(() => {
    // Disable foreign keys temporarily
    db.pragma('foreign_keys = OFF');

    try {
      // Clear all existing data in reverse order of dependencies
      db.prepare('DELETE FROM word_folders').run();
      db.prepare('DELETE FROM review_history').run();
      db.prepare('DELETE FROM learning_states').run();
      db.prepare('DELETE FROM folders').run();
      db.prepare('DELETE FROM words').run();

      // 1. Words
      if (words.length > 0) {
        const insertWord = db.prepare(`INSERT INTO words (id, word, meaning, level, part_of_speech, example_sentence, example_translation, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        for (const w of words) {
          insertWord.run(w.id, w.word, w.meaning, w.level, w.part_of_speech ?? null, w.example_sentence ?? null, w.example_translation ?? null, w.notes ?? null, w.created_at, w.updated_at);
        }
      }

      // 2. Learning States
      if (learning_states.length > 0) {
        const insertLs = db.prepare(`INSERT INTO learning_states (id, word_id, mastery, interval_step, next_review, last_reviewed, review_count, correct_count, wrong_count, consecutive_correct) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        for (const ls of learning_states) {
          insertLs.run(ls.id, ls.word_id, ls.mastery, ls.interval_step, ls.next_review, ls.last_reviewed ?? null, ls.review_count, ls.correct_count, ls.wrong_count, ls.consecutive_correct);
        }
      }

      // 3. Review History
      if (review_history.length > 0) {
        const insertRh = db.prepare(`INSERT INTO review_history (id, word_id, rating, mastery_before, mastery_after, interval_step_before, interval_step_after, reviewed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
        for (const rh of review_history) {
          insertRh.run(rh.id, rh.word_id, rh.rating, rh.mastery_before, rh.mastery_after, rh.interval_step_before, rh.interval_step_after, rh.reviewed_at);
        }
      }

      // 4. Folders
      if (folders.length > 0) {
        const insertFolder = db.prepare(`INSERT INTO folders (id, name, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`);
        for (const f of folders) {
          insertFolder.run(f.id, f.name, f.color ?? '#94a3b8', f.created_at, f.updated_at);
        }
      }

      // 5. Word Folders
      if (word_folders.length > 0) {
        const insertWf = db.prepare(`INSERT INTO word_folders (word_id, folder_id) VALUES (?, ?)`);
        for (const wf of word_folders) {
          insertWf.run(wf.word_id, wf.folder_id);
        }
      }
    } finally {
      // Always re-enable foreign keys
      db.pragma('foreign_keys = ON');
    }
  });

  transaction();
}

export interface CsvImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  errors: string[];
}

export function importWordsCsv(db: Database.Database, csvContent: string): CsvImportResult {
  const result: CsvImportResult = {
    success: true,
    imported: 0,
    skipped: 0,
    errors: [],
  };

  const parsed = Papa.parse(csvContent, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length > 0) {
    result.success = false;
    result.errors.push(`CSV Parse Error: ${parsed.errors[0].message}`);
    return result;
  }

  const rows = parsed.data as any[];

  if (rows.length === 0) {
    result.success = false;
    result.errors.push('The CSV file is empty.');
    return result;
  }

  if (rows.length > 5000) {
    result.success = false;
    result.errors.push('Maximum limit of 5000 words exceeded.');
    return result;
  }

  // Whitelist columns
  const allowedColumns = ['word', 'meaning', 'level', 'part_of_speech', 'example_sentence', 'example_translation', 'notes'];
  const actualColumns = parsed.meta.fields || [];
  
  for (const col of actualColumns) {
    if (!allowedColumns.includes(col)) {
      result.success = false;
      result.errors.push(`Invalid column found: '${col}'. Allowed columns are: ${allowedColumns.join(', ')}`);
      return result;
    }
  }

  // Pre-validate rows and normalize
  const validRows: any[] = [];
  const allowedLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const allowedPos = ['noun', 'verb', 'adjective', 'adverb', 'preposition', 'conjunction', 'pronoun', 'interjection', 'determiner', 'phrase'];

  const stripControlChars = (str: any) => {
    if (typeof str !== 'string') return null;
    // Strip control characters except Tab (\\x09), LF (\\x0A), CR (\\x0D)
    return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // +1 for header, +1 for 0-index

    const word = stripControlChars(row.word);
    if (!word || word.length === 0) {
      result.errors.push(`Row ${rowNum}: 'word' is required.`);
      continue;
    }
    if (word.length > 200) {
      result.errors.push(`Row ${rowNum}: 'word' exceeds 200 characters.`);
      continue;
    }

    const meaning = stripControlChars(row.meaning);
    if (!meaning || meaning.length === 0) {
      result.errors.push(`Row ${rowNum}: 'meaning' is required.`);
      continue;
    }
    if (meaning.length > 500) {
      result.errors.push(`Row ${rowNum}: 'meaning' exceeds 500 characters.`);
      continue;
    }

    let level = stripControlChars(row.level)?.toUpperCase();
    if (!level || !allowedLevels.includes(level)) {
      result.errors.push(`Row ${rowNum}: 'level' must be one of ${allowedLevels.join(', ')}.`);
      continue;
    }

    let pos = stripControlChars(row.part_of_speech)?.toLowerCase();
    if (pos && !allowedPos.includes(pos)) {
      result.errors.push(`Row ${rowNum}: 'part_of_speech' must be one of ${allowedPos.join(', ')} or empty.`);
      continue;
    }
    if (!pos) pos = null;

    const exSen = stripControlChars(row.example_sentence);
    if (exSen && exSen.length > 1000) {
      result.errors.push(`Row ${rowNum}: 'example_sentence' exceeds 1000 characters.`);
      continue;
    }

    const exTrans = stripControlChars(row.example_translation);
    if (exTrans && exTrans.length > 1000) {
      result.errors.push(`Row ${rowNum}: 'example_translation' exceeds 1000 characters.`);
      continue;
    }

    const notes = stripControlChars(row.notes);
    if (notes && notes.length > 2000) {
      result.errors.push(`Row ${rowNum}: 'notes' exceeds 2000 characters.`);
      continue;
    }

    validRows.push({
      word,
      meaning,
      level,
      pos,
      exSen: exSen || null,
      exTrans: exTrans || null,
      notes: notes || null
    });
  }

  if (result.errors.length > 0) {
    result.success = false;
    return result;
  }

  const now = new Date().toISOString();

  const transaction = db.transaction(() => {
    const checkStmt = db.prepare('SELECT id FROM words WHERE word = ? COLLATE NOCASE');
    const insertWord = db.prepare(`
      INSERT INTO words (id, word, meaning, level, part_of_speech, example_sentence, example_translation, notes, created_at, updated_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertLs = db.prepare(`
      INSERT INTO learning_states (id, word_id, mastery, interval_step, next_review, review_count, correct_count, wrong_count, consecutive_correct)
      VALUES (?, ?, 0, 0, ?, 0, 0, 0, 0)
    `);

    for (const r of validRows) {
      const existing = checkStmt.get(r.word);
      if (existing) {
        result.skipped++;
        continue;
      }

      const wordId = nanoid();
      insertWord.run(wordId, r.word, r.meaning, r.level, r.pos, r.exSen, r.exTrans, r.notes, now, now);
      
      const lsId = nanoid();
      insertLs.run(lsId, wordId, now);

      result.imported++;
    }
  });

  transaction();
  
  return result;
}

export function exportWordsCsv(db: Database.Database, folderId?: string): string {
  let query = `
    SELECT w.word, w.meaning, w.level, w.part_of_speech, w.example_sentence, w.example_translation, w.notes
    FROM words w
  `;
  const params: any[] = [];

  if (folderId === 'ungrouped') {
    query += ` WHERE NOT EXISTS (SELECT 1 FROM word_folders wf WHERE wf.word_id = w.id)`;
  } else if (folderId) {
    query += ` JOIN word_folders wf ON w.id = wf.word_id AND wf.folder_id = ?`;
    params.push(folderId);
  }
  
  query += ` ORDER BY w.word ASC`;

  const rows = db.prepare(query).all(...params) as any[];
  
  if (rows.length === 0) {
    return "";
  }

  // Replace null/undefined with empty strings
  const cleanedRows = rows.map(row => {
    const clean: any = {};
    for (const key in row) {
      clean[key] = row[key] ?? '';
    }
    return clean;
  });

  return Papa.unparse(cleanedRows);
}

