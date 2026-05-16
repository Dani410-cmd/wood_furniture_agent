import { chromium } from 'playwright';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const STORAGE_STATE = process.env.STORAGE_STATE || './auth/storageState.json';

export async function createBrowserContext() {
    const authDir = path.dirname(STORAGE_STATE);
    if (!fs.existsSync(authDir)) {
        fs.mkdirSync(authDir, { recursive: true });
    }

    console.log('🚀 Запуск браузера...');

    const browser = await chromium.launch({
        headless: process.env.HEADLESS === 'true',
        args: [
            '--no-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--disable-features=IsolateOrigins,site-per-process',
            '--start-maximized'
        ],
    });

    const contextOptions = {
        viewport: { width: 1366, height: 900 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
    };

    if (fs.existsSync(STORAGE_STATE)) {
        console.log('📂 Используем сохранённую сессию');
        contextOptions.storageState = STORAGE_STATE;
    }

    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();

    // Принудительно убираем about:blank
    await page.goto('https://www.avito.ru', {
        waitUntil: 'domcontentloaded',
        timeout: 60000
    });

    // Скрываем автоматизацию
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    console.log('✅ Браузер запущен с сессией');
    return { browser, context, page };
}

export async function saveStorageState(context) {
    await context.storageState({ path: STORAGE_STATE });
    console.log('✅ Сессия сохранена');
}