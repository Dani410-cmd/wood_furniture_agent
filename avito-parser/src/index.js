import { createBrowserContext } from './browser.js';
import { scanAndProcessChats } from './parser.js';   // ← правильный импорт

async function main() {
    console.log('🚀 Avito Chat Parser запущен\n');

    const { browser, page } = await createBrowserContext();

    try {
        await scanAndProcessChats(page);
        console.log('\n🎉 Парсинг завершён.');
    } catch (error) {
        console.error('❌ Ошибка:', error.message);
    } finally {
        // await browser.close(); // оставляем открытым
    }
}

main();