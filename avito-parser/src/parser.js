import sharp from 'sharp';
import { createWorker } from 'tesseract.js';
import fs from 'fs';
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

export async function scanAndProcessChats(page) {
    console.log('\n🌐 Переходим в сообщения...');
    await page.goto('https://www.avito.ru/profile/messenger', {
        waitUntil: 'domcontentloaded',
        timeout: 60000
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

    const hasSupport = checkText.toLowerCase().includes('поддержка') ||
        checkText.toLowerCase().includes('будем рады') ||
        checkText.toLowerCase().includes('рады помочь');

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

    const worker = await initOCR();
    const { data: { text } } = await worker.recognize('chats_only.png');

    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 3);

    const chats = [];
    for (let i = 0; i < lines.length - 2; i += 3) {
        let title = lines[i].trim();
        if (title.toLowerCase().includes('поддержка') || title.toLowerCase().includes('будем рады') || title.length < 5) continue;

        title = title
            .replace(/е$/, '')
            .replace(/о$/, '')
            .replace(/^[^\wА-Яа-я\s-]+/, '')
            .replace(/\s+[A-Z]$/, '')
            .trim();

        chats.push({ title });
    }

    console.log(`\n🎯 Найдено чатов: ${chats.length}`);

    if (chats.length === 0) return;

    console.log(`\n🔍 Открываем чат: ${chats[0].title}`);
    const clickY = top + 45;
    await page.mouse.click(left + 120, clickY);
    await page.waitForTimeout(7000);

    // ====================== ОБЛАСТЬ СООБЩЕНИЙ ======================
    console.log('📸 Делаем скриншот открытого чата...');
    const fullScreenshot = await page.screenshot({ fullPage: true });

    const metadata = await sharp(fullScreenshot).metadata();
    console.log(`📐 Размер скриншота: ${metadata.width}×${metadata.height}`);

    let messagesArea = {
        left: 400,
        top: 215,
        width: 620,
        height: 500
    };

    if (messagesArea.left + messagesArea.width > metadata.width) {
        messagesArea.width = metadata.width - messagesArea.left - 30;
    }
    if (messagesArea.top + messagesArea.height > metadata.height) {
        messagesArea.height = metadata.height - messagesArea.top - 30;
    }

    // Специальные параметры для чата (без сильного greyscale)
    await sharp(fullScreenshot)
        .extract(messagesArea)
        .resize(1600)                    // чуть больше
        .modulate({ brightness: 1.15, contrast: 1.1 })  // лёгкое улучшение
        .sharpen(0.8)                    // слабое sharpening
        .toFile('chat_messages.png');

    console.log(`✅ Область сообщений сохранена в chat_messages.png (специальные параметры)`);

    // OCR
    const { data: { text: messagesText } } = await worker.recognize('chat_messages.png');

    console.log('\n📝 Распознанный текст:');
    console.log(messagesText);

    // === СТРУКТУРИЗАЦИЯ ===
    const msgLines = messagesText.split('\n').map(l => l.trim()).filter(l => l.length > 3);

    console.log('\n📋 Структурированные сообщения:');
    let currentDate = '';

    for (let line of msgLines) {
        if (line.includes('Прочитано') || line.includes('печатает') || line.length < 4) continue;

        if (/^(Понедельник|Вторник|Среда|Четверг|Пятница|Суббота|Воскресенье|Сегодня|Вчера)/.test(line)) {
            currentDate = line;
            console.log(`\n📅 ${currentDate}`);
            continue;
        }

        let cleanLine = line.replace(/[✓✔️]{1,4}/g, '').trim();

        const timeLeft = cleanLine.match(/^(\d{1,2}:\d{2})\s+(.+)$/);
        const timeRight = cleanLine.match(/^(.+?)\s+(\d{1,2}:\d{2})$/);

        if (timeLeft) {
            console.log(`Менеджер ${timeLeft[1]}: ${timeLeft[2]}`);
        } else if (timeRight) {
            console.log(`Клиент ${timeRight[2]}: ${timeRight[1]}`);
        } else if (cleanLine.length > 5) {
            console.log(`? ${cleanLine}`);
        }
    }

    const chatId = chats[0].title;
    db.prepare('INSERT OR IGNORE INTO chats (chat_id, title) VALUES (?, ?)').run(chatId, chats[0].title);

    console.log('\n💾 Данные сохранены в БД');
}