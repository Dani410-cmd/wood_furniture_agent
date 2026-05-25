import { db } from './db.js';

console.log('\n💬 Чаты:');

const chats = db.prepare(`
    SELECT chat_id, title, last_updated
    FROM chats
    ORDER BY last_updated DESC
`).all();

for (const chat of chats) {
    console.log(`\n🔗 ${chat.title}`);
    console.log(chat.chat_id);
    console.log(`Обновлён: ${chat.last_updated}`);

    const messages = db.prepare(`
        SELECT sender, time, date, text
        FROM messages
        WHERE chat_id = ?
        ORDER BY id ASC
    `).all(chat.chat_id);

    for (const message of messages) {
        const sender = message.sender === 'client' ? 'Клиент' : 'Менеджер';
        const time = message.time ? ` ${message.time}` : '';
        const date = message.date ? `[${message.date}] ` : '';

        console.log(`${date}${sender}${time}: ${message.text}`);
    }
}