import Database from 'better-sqlite3';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const db = new Database(join(__dirname, '../../avito.db'));

console.log('📦 SQLite DB path:', db.name);

function tableExists(tableName) {
  const row = db.prepare(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table' AND name = ?
    `).get(tableName);

  return Boolean(row);
}

function columnExists(tableName, columnName) {
  if (!tableExists(tableName)) return false;

  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return columns.some(column => column.name === columnName);
}

function addColumnIfMissing(tableName, columnName, columnDefinition) {
  if (!columnExists(tableName, columnName)) {
    db.prepare(`
            ALTER TABLE ${tableName}
            ADD COLUMN ${columnName} ${columnDefinition}
        `).run();

    console.log(`➕ Добавлена колонка ${tableName}.${columnName}`);
  }
}

db.prepare(`
    CREATE TABLE IF NOT EXISTS chats (
        chat_id TEXT PRIMARY KEY,
        title TEXT,
        last_updated TEXT DEFAULT CURRENT_TIMESTAMP
    )
`).run();

addColumnIfMissing('chats', 'last_message_hash', 'TEXT');
addColumnIfMissing('chats', 'last_message_text', 'TEXT');
addColumnIfMissing('chats', 'last_message_time', 'TEXT');
addColumnIfMissing('chats', 'last_message_sender', 'TEXT');
addColumnIfMissing('chats', 'last_message_date', 'TEXT');

addColumnIfMissing('chats', 'listing', 'TEXT');
addColumnIfMissing('chats', 'preview', 'TEXT');
addColumnIfMissing('chats', 'is_empty_lead', 'INTEGER DEFAULT 0');

db.prepare(`
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT NOT NULL,
        sender TEXT,
        text TEXT NOT NULL,
        time TEXT,
        date TEXT,
        message_hash TEXT,
        created_at TEXT,
        FOREIGN KEY(chat_id) REFERENCES chats(chat_id)
    )
`).run();

addColumnIfMissing('messages', 'time', 'TEXT');
addColumnIfMissing('messages', 'date', 'TEXT');
addColumnIfMissing('messages', 'message_hash', 'TEXT');
addColumnIfMissing('messages', 'created_at', 'TEXT');

db.prepare(`
    UPDATE messages
    SET created_at = CURRENT_TIMESTAMP
    WHERE created_at IS NULL
`).run();

db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_messages_chat_id
    ON messages(chat_id)
`).run();

db.prepare(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_hash
    ON messages(message_hash)
`).run();

console.log('✅ База данных avito.db готова');

export { db };