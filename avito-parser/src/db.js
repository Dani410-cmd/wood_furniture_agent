import Database from 'better-sqlite3';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const db = new Database(join(__dirname, '../../avito.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS chats (
    chat_id TEXT PRIMARY KEY,
    title TEXT,
    last_updated TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT,
    text TEXT,
    sender TEXT,
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(chat_id, text, timestamp)
  );
`);

console.log('✅ База данных avito.db готова');

export { db };