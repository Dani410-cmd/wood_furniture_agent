import asyncio
import os
from dotenv import load_dotenv

from aiogram import Bot, Dispatcher
from aiogram.filters import Command
from aiogram.types import Message

from db.models import init_db, add_test_products
from ai.manager import get_ai_response

load_dotenv()

TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
if not TOKEN:
    raise ValueError("TELEGRAM_BOT_TOKEN не найден!")

bot = Bot(token=TOKEN)
dp = Dispatcher()

model = ChatOllama(
    model="qwen3:8b",
    temperature=0.4,
)

# === ОБНОВЛЁННЫЙ ПРОМПТ ===
SYSTEM_PROMPT = """
Ты — дружелюбный и профессиональный AI-менеджер мебельной мастерской.

Твои главные цели:
1. Быстро дать информацию по цене и наличию (используй инструмент get_product_info).
2. После предоставления цены или информации о товаре — старайся мягко и естественно перевести клиента в удобный ему мессенджер для дальнейшего общения с живым менеджером.
3. Предлагай отправить фото товаров, эскизы или варианты в WhatsApp / Telegram / VK.

Примеры хороших фраз для перехода:
- "Отлично, цена на такой стол — 45 000 ₽. Давайте я пришлю вам несколько фото вариантов в наличии в WhatsApp? Не против перейти туда?"
- "Хорошо, у меня есть несколько похожих кроватей. Удобнее будет продолжить в WhatsApp у менеджера Макса — там сразу пришлю фото и все детали."
- "Чтобы показать реальные фото и обсудить размеры, предлагаю перейти в Telegram/WhatsApp к нашему менеджеру."

Будь вежливым, инициативным и ориентированным на быстрый переход к живому общению.
Отвечай на русском языке, развёрнуто, но не слишком длинно.
"""


@dp.message(Command("start"))
async def start_handler(message: Message):
    await message.answer(
        "👋 Добро пожаловать!\n\n"
        "Я помогу подобрать мебель и узнать цены.\n"
        "Что вас интересует?"
    )


@dp.message()
async def message_handler(message: Message):
    await bot.send_chat_action(message.chat.id, "typing")

    try:
        conversation = [
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(content=message.text),
        ]

        response = await model.ainvoke(conversation)
        await message.answer(response.content)

    except Exception as e:
        print(f"Ошибка: {e}")
        await message.answer("Извините, что-то пошло не так. Попробуйте ещё раз.")


async def main():
    print("🚀 Бот запущен — Шаг 6")
    await init_db()
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
