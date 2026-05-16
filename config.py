import os
from dotenv import load_dotenv

load_dotenv()

UMNICO_TOKEN = os.getenv("UMNICO_TOKEN")
UMNICO_USER_ID = os.getenv("UMNICO_USER_ID")

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
