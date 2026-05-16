import { createBrowserContext } from './browser.js';
import { scanChats } from './parser.js';   // ← важно: scanChats

async function main() {
    console.log('🚀 Avito Chat Parser запущен\n');

    const { browser, page } = await createBrowserContext();

    try {
        await scanChats(page);
    } catch (error) {
        console.error('❌ Ошибка:', error.message);
    } finally {
        // await browser.close(); // оставляем закомментированным
    }
}

main();