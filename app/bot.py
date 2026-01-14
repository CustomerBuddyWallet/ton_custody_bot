import asyncio
import os
import json

from aiogram import Bot, Dispatcher, F
from aiogram.filters import CommandStart
from aiogram.types import Message, CallbackQuery, WebAppInfo
from aiogram.utils.keyboard import InlineKeyboardBuilder
from dotenv import load_dotenv

from .db import init_db, ensure_user, get_or_create_memo, get_balance_nano

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN", "").strip()
BANK_ADDRESS = os.getenv("BANK_ADDRESS", "").strip()
WITHDRAW_ENABLED = os.getenv("WITHDRAW_ENABLED", "0").strip() == "1"
WEBAPP_URL = os.getenv("WEBAPP_URL", "").strip()

def main_kb():
    kb = InlineKeyboardBuilder()
    if WEBAPP_URL:
        kb.button(text="💳 Открыть кошелёк", web_app=WebAppInfo(url=WEBAPP_URL))
    kb.button(text="💰 Баланс", callback_data="bal")
    kb.button(text="➕ Пополнить", callback_data="dep")
    kb.button(text="📤 Вывод", callback_data="wd")
    kb.adjust(1, 2, 1)
    return kb.as_markup()


def ton_fmt(nano: int) -> str:
    return f"{nano/1e9:.9f}"

async def cmd_start(message: Message):
    await ensure_user(message.from_user.id)
    await message.answer(
        "Йо. Это кошелёк (MVP).\n Выбирай действие:",
        reply_markup=main_kb()
    )

async def on_bal(call: CallbackQuery):
    tg_id = call.from_user.id
    bal = await get_balance_nano(tg_id)
    await call.message.answer(f"Твой баланс: {ton_fmt(bal)} TON")
    await call.answer()

async def on_dep(call: CallbackQuery):
    tg_id = call.from_user.id
    memo = await get_or_create_memo(tg_id)

    text = (
        "➕ *Пополнение*\n\n"
        "1) Отправь TON на адрес банка:\n"
        f"`{BANK_ADDRESS}`\n\n"
        "2) В *Комментарий* вставь этот код:\n"
        f"`{memo}`\n\n"
        "_Комментарий нужен, чтобы пополнение зачислилось автоматически._"
    )
    await call.message.answer(text, parse_mode="Markdown")
    await call.answer()

async def on_wd(call: CallbackQuery):
    if not WITHDRAW_ENABLED:
        WEBAPP_URL = os.getenv("WEBAPP_URL", "").strip()
        await call.message.answer("📤 Выводы временно отключены (техработы).")
        await call.answer()
        return

    await call.message.answer("Вывод включён, но пока не реализован.")
    await call.answer()

async def main():
    if not BOT_TOKEN:
        raise RuntimeError("BOT_TOKEN пустой в .env")
    if not BANK_ADDRESS:
        raise RuntimeError("BANK_ADDRESS пустой в .env")

    await init_db()

    bot = Bot(BOT_TOKEN)
    dp = Dispatcher()
    dp.message.register(on_webapp_data, F.web_app_data)
    dp.message.register(cmd_start, CommandStart())
    dp.callback_query.register(on_bal, F.data == "bal")
    dp.callback_query.register(on_dep, F.data == "dep")
    dp.callback_query.register(on_wd, F.data == "wd")

    print("[bot] started")
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
async def on_me(call: CallbackQuery):
    u = call.from_user
    bal = await get_balance_nano(u.id)

    username = f"@{u.username}" if u.username else "(без username)"
    name = f"{u.first_name or ''} {u.last_name or ''}".strip() or "(без имени)"

    text = (
        "👤 *Профиль*\n\n"
        f"Имя: *{name}*\n"
        f"Юзер: *{username}*\n"
        f"ID: `{u.id}`\n\n"
        f"Баланс: *{ton_fmt(bal)} TON*"
    )
    await call.message.answer(text, parse_mode="Markdown")
    await call.answer()
    from aiogram.types import WebAppInfo
import json
async def on_webapp_data(message: Message):
    try:
        payload = json.loads(message.web_app_data.data)
    except Exception:
        await message.answer("Не понял данные от Mini App.")
        return

    action = payload.get("action")
    if action == "balance":
        bal = await get_balance_nano(message.from_user.id)
        await message.answer(f"💰 Баланс: {ton_fmt(bal)} TON")
    elif action == "deposit":
        # дернем то же, что и кнопка "Пополнить"
        class DummyCall: pass
        # проще: просто вызвать логику пополнения напрямую
        memo = await get_or_create_memo(message.from_user.id)
        text = (
            "➕ *Пополнение*\n\n"
            f"Адрес банка:\n`{BANK_ADDRESS}`\n\n"
            f"Комментарий (memo):\n`{memo}`\n\n"
            "_Комментарий нужен, чтобы пополнение зачлось автоматически._"
        )
        await message.answer(text, parse_mode="Markdown")
    elif action == "withdraw":
        if not WITHDRAW_ENABLED:
            await message.answer("📤 Выводы временно отключены (техработы).")
        else:
            await message.answer("Вывод включён, но пока не реализован.")
    else:
        await message.answer("Неизвестная команда из Mini App.")
