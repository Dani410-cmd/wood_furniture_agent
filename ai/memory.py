from typing import Dict, List
from datetime import datetime
from collections import defaultdict


class ConversationMemory:
    """Управляет историей сообщений по чатам"""

    def __init__(self, max_messages: int = 20):
        self.max_messages = max_messages
        self.conversations: Dict[str, List[Dict]] = defaultdict(list)

    def add_message(self, chat_id: str, role: str, content: str):
        """Добавить сообщение в историю"""
        message = {
            "role": role,  # "user" или "assistant"
            "content": content,
            "timestamp": datetime.now().isoformat(),
        }
        self.conversations[chat_id].append(message)

        # Удалить старые сообщения если превышен лимит
        if len(self.conversations[chat_id]) > self.max_messages:
            self.conversations[chat_id] = self.conversations[chat_id][
                -self.max_messages :
            ]

    def get_history(self, chat_id: str) -> List[Dict]:
        """Получить историю сообщений для чата"""
        return self.conversations.get(chat_id, [])

    def clear_history(self, chat_id: str = None):
        """Очистить историю для чата или всех чатов"""
        if chat_id:
            self.conversations[chat_id] = []
        else:
            self.conversations.clear()

    def get_context_summary(self, chat_id: str) -> str:
        """Получить краткую сводку предыдущих сообщений"""
        history = self.get_history(chat_id)
        if not history:
            return ""

        summary_lines = []
        for msg in history[-10:]:  # последние 10 сообщений
            role = "Клиент" if msg["role"] == "user" else "Ты"
            summary_lines.append(f"{role}: {msg['content'][:100]}")

        return "\n".join(summary_lines)


# Глобальный экземпляр памяти
memory = ConversationMemory()
