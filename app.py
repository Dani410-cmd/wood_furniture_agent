import asyncio
import json
import os
import sys
import requests
from dotenv import load_dotenv
from fastapi import FastAPI, Request
import uvicorn

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ai.manager import get_ai_response
from db.models import init_db, add_test_products

load_dotenv()

UMNICO_TOKEN = os.getenv("UMNICO_TOKEN")
ENV_USER_ID = os.getenv("UMNICO_USER_ID")
if ENV_USER_ID:
    ENV_USER_ID = int(ENV_USER_ID)
PROCESSED_MESSAGE_IDS = set()
PENDING_MESSAGES = []

app = FastAPI(title="Furniture AI Assistant")


@app.on_event("startup")
async def startup():
    await init_db()
    await add_test_products()
    print("✅ AI-Агент запущен и готов к работе")
    if ENV_USER_ID:
        print(f"🔐 Используем ENV_USER_ID = {ENV_USER_ID}")


def send_reply_to_umnico(data: dict, message: str):
    global ENV_USER_ID

    if not UMNICO_TOKEN:
        print("⚠️ UMNICO_TOKEN не найден")
        return False

    lead_id = data.get("leadId")
    if not lead_id:
        print("⚠️ leadId не найден в данных")
        return False

    msg_obj = data.get("message", {})
    source_obj = msg_obj.get("source", {})
    source = source_obj.get("realId") or source_obj.get("id")
    if not source:
        print("⚠️ Не найден source.id")
        return False

    lead = data.get("lead", {})
    user_id = lead.get("userId") or ENV_USER_ID

    if not user_id:
        print("⏳ userId пока неизвестен — ставим сообщение в очередь")
        PENDING_MESSAGES.append((data, message))
        return False

    url = f"https://api.umnico.com/v1.3/messaging/{lead_id}/send"
    headers = {
        "Authorization": f"Bearer {UMNICO_TOKEN}",
        "Content-Type": "application/json",
    }
    payload = {
        "message": {"text": message[:1800]},
        "source": str(source),
        "userId": user_id,
    }

    sa_id = msg_obj.get("sa", {}).get("id")
    if sa_id:
        payload["saId"] = sa_id

    try:
        response = requests.post(url, json=payload, headers=headers)
        print(f"Отправка lead_id={lead_id} → статус: {response.status_code}")
        if response.status_code in (200, 201):
            print("✅ Ответ отправлен клиенту")
            return True
        else:
            print(f"❌ Ошибка: {response.status_code} - {response.text[:300]}")
            return False
    except Exception as e:
        print(f"❌ Exception: {e}")
        return False


@app.post("/webhook")
async def webhook(request: Request):
    try:
        data = await request.json()
        print("📦 Входящий вебхук:", json.dumps(data, indent=2, ensure_ascii=False))

        event_type = data.get("type")
        if event_type != "message.incoming":
            print(f"⏭️ Пропускаем событие типа {event_type}")
            return {"status": "ignored"}

        msg_obj = data.get("message", {})
        msg_id = msg_obj.get("messageId")
        if msg_id and msg_id in PROCESSED_MESSAGE_IDS:
            print(f"⏭️ Сообщение {msg_id} уже обработано, пропускаем")
            return {"status": "already_processed"}
        if msg_id:
            PROCESSED_MESSAGE_IDS.add(msg_id)
            if len(PROCESSED_MESSAGE_IDS) > 1000:
                PROCESSED_MESSAGE_IDS.clear()

        inner_msg = msg_obj.get("message", {})
        message_text = inner_msg.get("text") or data.get("text") or ""
        chat_id = (
            data.get("chat_id")
            or inner_msg.get("sender", {}).get("id")
            or data.get("leadId")
        )
        channel = data.get("type", "unknown")

        if not message_text or len(str(message_text).strip()) < 2:
            return {"status": "ok"}

        print(f"📨 [{channel}] {message_text}")

        response_text, need_handover = await get_ai_response(str(message_text), chat_id)
        print(f"🤖 Ответ агента: {response_text[:200]}...")

        send_reply_to_umnico(data, response_text)

        if need_handover:
            print("🔥 Тёплый лид → handover")

        return {"status": "success"}

    except Exception as e:
        print(f"❌ Ошибка webhook: {e}")
        return {"status": "error"}


@app.get("/")
async def root():
    return {"status": "AI Assistant is running"}


if __name__ == "__main__":
    print("🚀 Запуск FastAPI...")
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
