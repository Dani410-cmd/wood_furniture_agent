import Database from 'better-sqlite3';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const db = new Database(join(__dirname, '../../avito.db'));

console.log('📦 SQLite DB path:', db.name);

function columnExists(tableName, columnName) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return columns.some(column => column.name === columnName);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS chats (
    chat_id TEXT PRIMARY KEY,
    title TEXT,
    last_updated TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT NOT NULL,
    sender TEXT,
    text TEXT NOT NULL,
    time TEXT,
    date TEXT,
    message_hash TEXT UNIQUE NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(chat_id) REFERENCES chats(chat_id)
  );

  CREATE INDEX IF NOT EXISTS idx_messages_chat_id
  ON messages(chat_id);

  CREATE INDEX IF NOT EXISTS idx_messages_hash
  ON messages(message_hash);
`);

if (!columnExists('chats', 'last_message_hash')) {
  db.prepare(`ALTER TABLE chats ADD COLUMN last_message_hash TEXT`).run();
}

if (!columnExists('chats', 'last_message_text')) {
  db.prepare(`ALTER TABLE chats ADD COLUMN last_message_text TEXT`).run();
}

if (!columnExists('chats', 'last_message_time')) {
  db.prepare(`ALTER TABLE chats ADD COLUMN last_message_time TEXT`).run();
}

if (!columnExists('chats', 'last_message_sender')) {
  db.prepare(`ALTER TABLE chats ADD COLUMN last_message_sender TEXT`).run();
}

if (!columnExists('chats', 'last_message_date')) {
  db.prepare(`ALTER TABLE chats ADD COLUMN last_message_date TEXT`).run();
}

console.log('✅ База данных avito.db готова');

export { db };