import { createBrowserContext, saveStorageState } from './browser.js';

async function login() {
    console.log('🚀 Запуск браузера для логина...');

    const { browser, context, page } = await createBrowserContext();

    try {
        await page.goto('https://www.avito.ru', {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        await page.waitForTimeout(3000);

        console.log('\n✅ Браузер открыт.');
        console.log('👤 Залогинься в Avito вручную (если ещё не залогинен).');
        console.log('После успешного входа вернись сюда и нажми **Enter**...\n');

        process.stdin.once('data', async () => {
            console.log('\n💾 Сохраняю сессию...');

            try {
                await saveStorageState(context);
                console.log('🎉 Сессия успешно сохранена!');
            } catch (e) {
                console.error('❌ Ошибка сохранения сессии:', e.message);
            }

            await browser.close();
            console.log('🔒 Браузер закрыт.');
            process.exit(0);
        });

    } catch (error) {
        console.error('❌ Ошибка:', error.message);
        await browser.close();
    }
}

login();