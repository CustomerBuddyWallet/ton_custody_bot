import os
import hmac
import hashlib
import urllib.parse
from typing import Optional

from fastapi import FastAPI, Header, HTTPException
from dotenv import load_dotenv

from .db import init_db, ensure_user, get_balance_nano, get_or_create_memo

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN", "").strip()
BANK_ADDRESS = os.getenv("BANK_ADDRESS", "").strip()
WITHDRAW_ENABLED = os.getenv("WITHDRAW_ENABLED", "0").strip() == "1"

app = FastAPI(title="TonBuddy API")

def ton_fmt(nano: int) -> str:
    return f"{nano/1e9:.9f}"

def verify_init_data(init_data: str) -> dict:
    """
    Проверка подписи Telegram WebApp initData.
    Возвращает распарсенный user (dict) если ок, иначе 401.
    """
    if not init_data:
        raise HTTPException(status_code=401, detail="Missing initData")

    parsed = dict(urllib.parse.parse_qsl(init_data, keep_blank_values=True))
    received_hash = parsed.pop("hash", None)
    if not received_hash:
        raise HTTPException(status_code=401, detail="Missing hash")

    # data_check_string
    data_check_string = "\n".join(f"{k}={parsed[k]}" for k in sorted(parsed.keys()))

    secret_key = hmac.new(b"WebAppData", BOT_TOKEN.encode(), hashlib.sha256).digest()
    computed_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(computed_hash, received_hash):
        raise HTTPException(status_code=401, detail="Bad signature")

    # user приходит как JSON-строка
    import json
    user_raw = parsed.get("user")
    if not user_raw:
        raise HTTPException(status_code=401, detail="Missing user")
    user = json.loads(user_raw)
    return user

@app.on_event("startup")
async def startup():
    await init_db()

@app.get("/api/balance")
async def api_balance(x_tg_init_data: Optional[str] = Header(default=None)):
    user = verify_init_data(x_tg_init_data)
    tg_id = int(user["id"])
    await ensure_user(tg_id)
    bal = await get_balance_nano(tg_id)
    return {"ton": ton_fmt(bal), "nano": bal}

@app.get("/api/deposit")
async def api_deposit(x_tg_init_data: Optional[str] = Header(default=None)):
    user = verify_init_data(x_tg_init_data)
    tg_id = int(user["id"])
    await ensure_user(tg_id)
    memo = await get_or_create_memo(tg_id)
    return {"bank_address": BANK_ADDRESS, "memo": memo}

@app.post("/api/withdraw")
async def api_withdraw(x_tg_init_data: Optional[str] = Header(default=None)):
    # Пока выключено, просто отдаём статус
    verify_init_data(x_tg_init_data)
    if not WITHDRAW_ENABLED:
        return {"ok": False, "reason": "withdraw_disabled"}
    return {"ok": False, "reason": "not_implemented"}
