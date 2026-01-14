import asyncio
import os
from dotenv import load_dotenv

from .ton import TonCenterClient
from .db import mark_tx_processed, find_user_by_memo, credit_deposit

load_dotenv()

BANK_ADDRESS = os.getenv("BANK_ADDRESS", "").strip()
TONCENTER_BASE = os.getenv("TONCENTER_BASE", "").strip()
TONCENTER_API_KEY = (os.getenv("TONCENTER_API_KEY") or "").strip()
POLL_SEC = int(os.getenv("POLL_SEC", "8"))

async def loop():
    if not BANK_ADDRESS:
        raise RuntimeError("BANK_ADDRESS пустой в .env")
    if not TONCENTER_BASE:
        raise RuntimeError("TONCENTER_BASE пустой в .env")

    client = TonCenterClient(TONCENTER_BASE, TONCENTER_API_KEY)

    print(f"[worker] watching BANK_ADDRESS={BANK_ADDRESS}")
    while True:
        try:
            txs = await client.get_recent_txs(BANK_ADDRESS, limit=25)
            for tx in txs:
                is_new = await mark_tx_processed(tx.tx_hash)
                if not is_new:
                    continue

                memo = (tx.in_comment or "").strip()
                if not memo:
                    continue

                tg_id = await find_user_by_memo(memo)
                if tg_id is None:
                    continue

                if tx.in_value_nano > 0:
                    await credit_deposit(tg_id, tx.in_value_nano, tx.tx_hash)
                    print(f"[worker] credited tg_id={tg_id} +{tx.in_value_nano} nano, tx={tx.tx_hash}")

        except Exception as e:
            print("[worker] error:", repr(e))

        await asyncio.sleep(POLL_SEC)

def main():
    asyncio.run(loop())

if __name__ == "__main__":
    main()
