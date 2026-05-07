import os
from dotenv import load_dotenv
from langchain_ollama import ChatOllama
from langchain_core.messages import SystemMessage, HumanMessage, BaseMessage
from typing import Tuple, List

from utils.rag import get_product_info
from ai.memory import memory

load_dotenv()


model = ChatOllama(model="qwen3:8b", temperature=0.35)

SYSTEM_PROMPT = """
Ты — опытный AI-менеджер мебельной мастерской (массив дерева).

Правила поведения:
1. Всегда используй инструмент get_product_info, когда клиент спрашивает про товар, цену или наличие.
2. Помни контекст предыдущих сообщений клиента — если он продолжает обсуждение, учитывай это.
3. Если клиент пишет несколько сообщений подряд, они обычно относятся к одному вопросу — объединяй их в общий контекст.
4. После ответа по товару/цене — мягко предлагай перейти к живому менеджеру в удобный мессенджер.
5. Определяй уровень интереса клиента:
   - Тёплый: спрашивает цену, размеры, сроки, доставку, материалы, хочет фото/варианты.
   - В этом случае обязательно предлагай handover.

Стиль: профессиональный, доброжелательный, уверенный. Отвечай на русском, коротко и ясно.
"""


async def get_ai_response(user_message: str, chat_id: str = None) -> Tuple[str, bool]:
    """
    Возвращает (ответ_от_ии, нужно_передать_менеджеру)
    Учитывает историю предыдущих сообщений из памяти
    """
    try:
        # Построить полную историю с контекстом
        messages: List[BaseMessage] = [SystemMessage(content=SYSTEM_PROMPT)]

        # Добавить последние сообщения из истории (если есть)
        if chat_id:
            history = memory.get_history(chat_id)
            for msg in history[-8:]:  # последние 8 сообщений для контекста
                if msg["role"] == "user":
                    messages.append(HumanMessage(content=msg["content"]))
                else:
                    messages.append(
                        HumanMessage(
                            content=f"[Ты ответил ранее]: {msg['content'][:200]}"
                        )
                    )

        # Добавить текущее сообщение
        messages.append(HumanMessage(content=user_message))

        # Получить ответ модели
        response = await model.ainvoke(messages)
        text = response.content

        # Сохранить сообщение и ответ в памяти
        if chat_id:
            memory.add_message(chat_id, "user", user_message)
            memory.add_message(chat_id, "assistant", text)

        # Определить нужен ли handover
        need_handover = any(
            word in text.lower()
            for word in [
                "менеджер",
                "whatsapp",
                "wa.me",
                "тг",
                "vk",
                "свяжется",
                "пришлю фото",
            ]
        )

        return text, need_handover

    except Exception as e:
        print(f"Ошибка в get_ai_response: {e}")
        return "Извините, возникла ошибка. Передаю ваш запрос менеджеру.", True


# Для теста
if __name__ == "__main__":
    import asyncio

    async def test():
        print("Тест 1:")
        print(await get_ai_response("сколько стоит стол из дуба?"))
        print("\nТест 2:")
        print(await get_ai_response("хочу кровать 160x200, покажите варианты"))

    asyncio.run(test())
