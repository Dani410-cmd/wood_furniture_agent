import sharp from 'sharp';
import { createWorker } from 'tesseract.js';
import fs from 'fs';

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

export async function scanChats(page) {
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

    console.log(`✅ Обрезана зона (top = ${top})`);

    const worker = await initOCR();
    const { data: { text } } = await worker.recognize('chats_only.png');

    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 3);

    const chats = [];
    for (let i = 0; i < lines.length - 2; i += 3) {
        let title = lines[i].trim();

        const titleLower = title.toLowerCase();
        if (titleLower.includes('поддержка') || titleLower.includes('будем рады') || title.length < 5) {
            continue;
        }

        // === УЛУЧШЕННАЯ ОЧИСТКА НАЗВАНИЙ ===
        title = title
            .replace(/е$/, '')
            .replace(/о$/, '')
            .replace(/^[^\wА-Яа-я\s-]+/, '')
            .replace(/ДвижоОКК?/i, 'ДвижОК')     // исправляем ДвижОКК и ДвижоОК
            .replace(/\s+[A-Z]$/, '')            // убираем одиночные буквы E, I и т.д.
            .trim();

        let announcement = lines[i + 1] || '';
        let lastMessage = lines[i + 2] || '';

        announcement = announcement
            .replace(/[\s·•-]+\s*(\d[\d\s.,]*)\s*[РP2]/i, ' - $1 Р')
            .replace(/,\s*(\d)/g, ' - $1')
            .replace(/^Ф/, '')
            .replace(/-+/g, '-')
            .trim();

        if (lastMessage.includes('Чат создан') || lastMessage.includes('Задайте вопрос')) {
            lastMessage = 'Новый чат';
        }

        chats.push({
            title: title,
            announcement: announcement,
            lastMessage: lastMessage
        });
    }

    console.log(`\n🎯 Найдено чатов: ${chats.length}\n`);
    chats.forEach((chat, i) => {
        console.log(`#${i + 1} ${chat.title}`);
        console.log(`   Объявление: ${chat.announcement}`);
        console.log(`   Сообщение: ${chat.lastMessage}`);
        console.log('─'.repeat(80));
    });

    return chats;
}