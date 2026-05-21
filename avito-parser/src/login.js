import { createBrowserContext, saveStorageState } from './browser.js';

async function login() {
    console.log('🚀 Запуск браузера для логина...');

    const { browser, context, page } = await createBrowserContext();

    try {
        await page.goto('https://www.avito.ru', {
            waitUntil: 'domcontentloaded',
            timeout: 90000
        });

        await page.waitForTimeout(5000);

        console.log('\n👤 Залогинься вручную в открывшемся браузере.');
        console.log('После успешного входа подожди 10 секунд и нажми Enter здесь...\n');

        process.stdin.once('data', async () => {
            console.log('\n💾 Сохраняю сессию...');
            await saveStorageState(context);
            console.log('🎉 Сессия успешно сохранена!');
            await browser.close();
            process.exit(0);
        });

    } catch (error) {
        console.error('❌ Ошибка:', error.message);
        await browser.close();
    }
}

login();