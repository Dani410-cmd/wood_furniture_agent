import sharp from 'sharp';
import { createWorker } from 'tesseract.js';
import crypto from 'crypto';
import { db } from './db.js';

let worker = null;

async function initOCR() {
    if (!worker) {
        worker = await createWorker('rus+eng', 1, { logger: () => { } });

        await worker.setParameters({
            tessedit_char_whitelist: 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюяABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789₽-.,:;!?()[]% ',
            tessedit_pageseg_mode: '6',
        });
    }

    return worker;
}

function isDateLine(line) {
    return /^(Понедельник|Вторник|Среда|Четверг|Пятница|Суббота|Воскресенье|Сегодня|Вчера)/i.test(line);
}

function cleanOcrText(text) {
    return text
        .replace(/[✓✔️√]+/g, '')
        .replace(/Прочитано/gi, '')
        .replace(/печатает/gi, '')
        .replace(/\bCM\b/g, 'см')
        .replace(/\bcm\b/g, 'см')
        .replace(/\s+/g, ' ')
        .trim();
}

function createMessageHash(chatId, message) {
    return crypto
        .createHash('sha256')
        .update([
            chatId,
            message.date || '',
            message.sender || '',
            message.time || '',
            message.text || ''
        ].join('|'))
        .digest('hex');
}

function extractTimeAndText(rawText) {
    let text = cleanOcrText(rawText);

    if (!text) {
        return {
            time: null,
            text: '',
        };
    }

    const timeRegex = /\b\d{1,2}:\d{2}\b/g;
    const times = text.match(timeRegex);

    if (!times || times.length === 0) {
        return {
            time: null,
            text,
        };
    }

    const time = times[times.length - 1];

    text = text
        .replace(time, '')
        .replace(/\s+/g, ' ')
        .trim();

    return {
        time,
        text,
    };
}

async function extractMessageBlocks(imagePath) {
    const image = sharp(imagePath);
    const metadata = await image.metadata();

    const width = metadata.width;
    const height = metadata.height;

    const raw = await image
        .greyscale()
        .raw()
        .toBuffer();

    const activeRows = [];

    for (let y = 0; y < height; y++) {
        let darkPixels = 0;

        for (let x = 0; x < width; x++) {
            const pixel = raw[y * width + x];

            if (pixel < 235) {
                darkPixels++;
            }
        }

        const ratio = darkPixels / width;

        if (ratio > 0.01) {
            activeRows.push(y);
        }
    }

    if (activeRows.length === 0) {
        return [];
    }

    const rowGroups = [];
    let start = activeRows[0];
    let prev = activeRows[0];

    for (let i = 1; i < activeRows.length; i++) {
        const y = activeRows[i];

        if (y - prev > 12) {
            rowGroups.push({ top: start, bottom: prev });
            start = y;
        }

        prev = y;
    }

    rowGroups.push({ top: start, bottom: prev });

    const blocks = [];

    for (const group of rowGroups) {
        let top = Math.max(0, group.top - 8);
        let bottom = Math.min(height, group.bottom + 8);
        let blockHeight = bottom - top;

        if (blockHeight < 18) continue;

        let minX = width;
        let maxX = 0;

        for (let y = top; y < bottom; y++) {
            for (let x = 0; x < width; x++) {
                const pixel = raw[y * width + x];

                if (pixel < 235) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                }
            }
        }

        if (minX >= maxX) continue;

        let left = Math.max(0, minX - 14);
        let right = Math.min(width, maxX + 14);
        let blockWidth = right - left;

        if (blockWidth < 40) continue;

        const centerX = left + blockWidth / 2;
        const sender = centerX < width / 2 ? 'client' : 'manager';

        blocks.push({
            left,
            top,
            width: blockWidth,
            height: blockHeight,
            centerX,
            sender,
        });
    }

    const merged = [];

    for (const block of blocks) {
        const last = merged[merged.length - 1];

        if (!last) {
            merged.push(block);
            continue;
        }

        const verticalGap = block.top - (last.top + last.height);
        const sameSide = block.sender === last.sender;
        const closeHorizontally = Math.abs(block.centerX - last.centerX) < width * 0.28;

        if (verticalGap <= 18 && sameSide && closeHorizontally) {
            const newLeft = Math.min(last.left, block.left);
            const newTop = Math.min(last.top, block.top);
            const newRight = Math.max(last.left + last.width, block.left + block.width);
            const newBottom = Math.max(last.top + last.height, block.top + block.height);

            last.left = newLeft;
            last.top = newTop;
            last.width = newRight - newLeft;
            last.height = newBottom - newTop;
            last.centerX = last.left + last.width / 2;
        } else {
            merged.push(block);
        }
    }

    return merged;
}

async function recognizeMessageBlocks(imagePath) {
    const ocrWorker = await initOCR();
    const blocks = await extractMessageBlocks(imagePath);

    const messages = [];
    let currentDate = '';

    console.log(`\n🧩 Найдено OCR-блоков: ${blocks.length}`);

    for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];

        const cropPath = `message_block_${String(i + 1).padStart(2, '0')}.png`;

        await sharp(imagePath)
            .extract({
                left: Math.round(block.left),
                top: Math.round(block.top),
                width: Math.round(block.width),
                height: Math.round(block.height),
            })
            .resize({ width: Math.min(900, Math.round(block.width * 2)) })
            .greyscale()
            .normalize()
            .sharpen()
            .toFile(cropPath);

        const { data: { text } } = await ocrWorker.recognize(cropPath);
        const cleaned = cleanOcrText(text);

        if (!cleaned || cleaned.length < 2) {
            continue;
        }

        if (isDateLine(cleaned)) {
            currentDate = cleaned;
            continue;
        }

        const { time, text: messageText } = extractTimeAndText(cleaned);

        if (!messageText || messageText.length < 2) {
            continue;
        }

        messages.push({
            date: currentDate,
            sender: block.sender,
            time,
            text: messageText,
            block: {
                left: block.left,
                top: block.top,
                width: block.width,
                height: block.height,
            },
        });
    }

    return messages;
}

function printStructuredMessages(messages) {
    console.log('\n📋 Структурированные сообщения:');

    let lastDate = null;

    for (const message of messages) {
        if (message.date && message.date !== lastDate) {
            console.log(`\n📅 ${message.date}`);
            lastDate = message.date;
        }

        const senderLabel = message.sender === 'client' ? 'Клиент' : 'Менеджер';
        const timeLabel = message.time ? ` ${message.time}` : '';

        console.log(`${senderLabel}${timeLabel}: ${message.text}`);
    }
}

async function recognizeChatsList(imagePath) {
    const ocrWorker = await initOCR();
    const { data: { text } } = await ocrWorker.recognize(imagePath);

    const lines = text
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 3);

    const chats = [];

    for (let i = 0; i < lines.length - 2; i += 3) {
        let title = lines[i].trim();

        if (
            title.toLowerCase().includes('поддержка') ||
            title.toLowerCase().includes('будем рады') ||
            title.toLowerCase().includes('рады помочь') ||
            title.length < 5
        ) {
            continue;
        }

        title = title
            .replace(/^[^\wА-Яа-я\s-]+/, '')
            .replace(/\s+[A-Z]$/, '')
            .trim();

        if (!title) continue;

        chats.push({ title });
    }

    return chats;
}

function ensureDbSchema() {
    db.prepare(`
        CREATE TABLE IF NOT EXISTS chats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id TEXT UNIQUE NOT NULL,
            title TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `).run();

    db.prepare(`
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id INTEGER NOT NULL,
            sender TEXT,
            text TEXT,
            time TEXT,
            date TEXT,
            message_hash TEXT UNIQUE NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(chat_id) REFERENCES chats(id)
        )
    `).run();

    db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_messages_chat_id 
        ON messages(chat_id)
    `).run();

    db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_messages_hash 
        ON messages(message_hash)
    `).run();
}

function saveChatAndMessages(chat, messages) {
    db.prepare(`
        INSERT OR IGNORE INTO chats (chat_id, title)
        VALUES (?, ?)
    `).run(chat.chat_id, chat.title);

    let createdMessages = 0;

    const insertMessage = db.prepare(`
        INSERT OR IGNORE INTO messages 
        (chat_id, sender, text, time, date, message_hash)
        VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const message of messages) {
        const result = insertMessage.run(
            chat.chat_id,
            message.sender,
            message.text,
            message.time,
            message.date,
            message.message_hash
        );

        if (result.changes > 0) {
            createdMessages++;
        }
    }

    const lastMessage = messages.length > 0
        ? messages[messages.length - 1]
        : null;

    if (lastMessage) {
        db.prepare(`
            UPDATE chats
            SET 
                title = ?,
                last_updated = CURRENT_TIMESTAMP,
                last_message_hash = ?,
                last_message_text = ?,
                last_message_time = ?,
                last_message_sender = ?,
                last_message_date = ?
            WHERE chat_id = ?
        `).run(
            chat.title,
            lastMessage.message_hash,
            lastMessage.text,
            lastMessage.time,
            lastMessage.sender,
            lastMessage.date,
            chat.chat_id
        );
    } else {
        db.prepare(`
            UPDATE chats
            SET 
                title = ?,
                last_updated = CURRENT_TIMESTAMP
            WHERE chat_id = ?
        `).run(chat.title, chat.chat_id);
    }

    return {
        chat_id: chat.chat_id,
        messages_seen: messages.length,
        messages_created: createdMessages,
        last_message: lastMessage,
    };
}

export async function scanAndProcessChats(page) {
    console.log('\n🌐 Переходим в сообщения...');

    await page.goto('https://www.avito.ru/profile/messenger', {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
    });

    await page.waitForTimeout(5000);

    console.log('\n👉 Когда чаты загрузятся — нажми Enter...');
    await new Promise(resolve => process.stdin.once('data', resolve));

    const screenshot = await page.screenshot({ fullPage: true });

    let top = 320;

    const checkArea = await sharp(screenshot)
        .extract({ left: 380, top: 200, width: 600, height: 180 })
        .greyscale()
        .toBuffer();

    const checkWorker = await initOCR();
    const { data: { text: checkText } } = await checkWorker.recognize(checkArea);

    const lowerCheckText = checkText.toLowerCase();

    const hasSupport =
        lowerCheckText.includes('поддержка') ||
        lowerCheckText.includes('будем рады') ||
        lowerCheckText.includes('рады помочь');

    if (hasSupport) {
        console.log('🔄 Поддержка сверху — сдвигаем');
        top = 420;
    }

    const left = 460;
    const width = 535;
    const height = 810;

    await sharp(screenshot)
        .extract({ left, top, width, height })
        .resize(1450)
        .greyscale()
        .normalize()
        .sharpen()
        .toFile('chats_only.png');

    console.log(`✅ Обрезана зона списка чатов (top = ${top})`);

    const chats = await recognizeChatsList('chats_only.png');

    console.log(`\n🎯 Найдено чатов: ${chats.length}`);

    if (chats.length === 0) {
        console.log('⚠️ Чаты не найдены');
        return;
    }

    console.log(`\n🔍 Открываем чат: ${chats[0].title}`);

    const clickY = top + 45;
    await page.mouse.click(left + 120, clickY);
    await page.waitForTimeout(7000);

    const chatUrl = page.url();
    console.log('🔗 URL открытого чата:', chatUrl);

    console.log('📸 Делаем скриншот открытого чата...');

    const fullScreenshot = await page.screenshot({ fullPage: true });
    const metadata = await sharp(fullScreenshot).metadata();

    console.log(`📐 Размер скриншота: ${metadata.width}×${metadata.height}`);

    let messagesArea = {
        left: 400,
        top: 215,
        width: 620,
        height: 620,
    };

    if (messagesArea.left + messagesArea.width > metadata.width) {
        messagesArea.width = metadata.width - messagesArea.left - 30;
    }

    if (messagesArea.top + messagesArea.height > metadata.height) {
        messagesArea.height = metadata.height - messagesArea.top - 30;
    }

    await sharp(fullScreenshot)
        .extract(messagesArea)
        .resize(1600)
        .modulate({ brightness: 1.12, contrast: 1.08 })
        .sharpen(0.7)
        .toFile('chat_messages.png');

    console.log('✅ Область сообщений сохранена в chat_messages.png');

    const ocrWorker = await initOCR();
    const { data: { text: fullMessagesText } } = await ocrWorker.recognize('chat_messages.png');

    console.log('\n📝 Распознанный текст всей области:');
    console.log(fullMessagesText);

    const structuredMessages = await recognizeMessageBlocks('chat_messages.png');

    const chat = {
        chat_id: chatUrl,
        title: chats[0].title,
        url: chatUrl,
    };

    const messagesWithHash = structuredMessages.map(message => ({
        ...message,
        message_hash: createMessageHash(chat.chat_id, message),
    }));

    printStructuredMessages(messagesWithHash);

    const saveStats = saveChatAndMessages(chat, messagesWithHash);

    console.log('\n💾 Чат и сообщения сохранены в БД');
    console.log(`🧾 Сообщений распознано: ${saveStats.messages_seen}`);
    console.log(`🆕 Новых сообщений сохранено: ${saveStats.messages_created}`);

    if (saveStats.messages_created > 0) {
        console.log(`🔥 Есть новые сообщения: ${saveStats.messages_created}`);
    } else {
        console.log('✅ Новых сообщений нет');
    }

    if (saveStats.last_message) {
        const senderLabel = saveStats.last_message.sender === 'client' ? 'Клиент' : 'Менеджер';
        const timeLabel = saveStats.last_message.time ? ` ${saveStats.last_message.time}` : '';
        console.log(`🔚 Последнее сообщение: ${senderLabel}${timeLabel}: ${saveStats.last_message.text}`);
    }

    return {
        chat,
        messages: messagesWithHash,
        stats: saveStats,
    };
}