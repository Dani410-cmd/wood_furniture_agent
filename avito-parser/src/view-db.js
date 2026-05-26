import { db } from './db.js';

console.log('\n💬 Чаты в базе:');

const chats = db.prepare(`
    SELECT
        chat_id,
        title,
        listing,
        preview,
        is_empty_lead,
        last_message_text,
        last_message_time,
        last_message_sender,
        last_message_date,
        last_updated
    FROM chats
    ORDER BY last_updated DESC
`).all();

if (chats.length === 0) {
    console.log('Пока нет сохранённых чатов');
    process.exit(0);
}

for (const chat of chats) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`👤 ${chat.title || 'Без имени'}`);
    console.log(`🔗 ${chat.chat_id}`);
    console.log(`📌 Объявление: ${chat.listing || '-'}`);
    console.log(`💬 Preview: ${chat.preview || '-'}`);
    console.log(`🕒 Обновлён: ${chat.last_updated || '-'}`);

    if (chat.is_empty_lead) {
        console.log('🟡 Пустой лид: пользователь создал чат');
    }

    if (chat.last_message_text) {
        const sender =
            chat.last_message_sender === 'client'
                ? 'Клиент'
                : chat.last_message_sender === 'manager'
                    ? 'Менеджер'
                    : 'Неизвестно';

        const time = chat.last_message_time ? ` ${chat.last_message_time}` : '';

        console.log(`🔚 Последнее сообщение внутри чата: ${sender}${time}: ${chat.last_message_text}`);
    }

    const messages = db.prepare(`
        SELECT sender, time, date, text, created_at
        FROM messages
        WHERE chat_id = ?
        ORDER BY id ASC
    `).all(chat.chat_id);

    console.log(`📨 Сообщений в базе: ${messages.length}`);

    for (const message of messages) {
        const sender =
            message.sender === 'client'
                ? 'Клиент'
                : message.sender === 'manager'
                    ? 'Менеджер'
                    : 'Неизвестно';

        const date = message.date ? `[${message.date}] ` : '';
        const time = message.time ? ` ${message.time}` : '';

        console.log(`${date}${sender}${time}: ${message.text}`);
    }
}