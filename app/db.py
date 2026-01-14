import aiosqlite
import secrets

DB_PATH = "db.sqlite3"

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  tg_id INTEGER PRIMARY KEY,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS deposits_profile (
  tg_id INTEGER PRIMARY KEY,
  memo TEXT NOT NULL UNIQUE,
  FOREIGN KEY (tg_id) REFERENCES users(tg_id)
);

CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tg_id INTEGER NOT NULL,
  amount_nano INTEGER NOT NULL, -- +deposit, -withdraw
  kind TEXT NOT NULL,
  tx_hash TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (tg_id) REFERENCES users(tg_id)
);

CREATE TABLE IF NOT EXISTS processed_txs (
  tx_hash TEXT PRIMARY KEY,
  created_at TEXT DEFAULT (datetime('now'))
);
"""

async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.executescript(SCHEMA)
        await db.commit()

async def ensure_user(tg_id: int):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("INSERT OR IGNORE INTO users(tg_id) VALUES (?)", (tg_id,))
        await db.commit()

async def get_or_create_memo(tg_id: int) -> str:
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute("SELECT memo FROM deposits_profile WHERE tg_id=?", (tg_id,))
        row = await cur.fetchone()
        if row:
            return row[0]

        memo = secrets.token_urlsafe(10)  # уникальный мемо-код
        await db.execute(
            "INSERT INTO deposits_profile(tg_id, memo) VALUES (?,?)",
            (tg_id, memo)
        )
        await db.commit()
        return memo

async def find_user_by_memo(memo: str) -> int | None:
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute("SELECT tg_id FROM deposits_profile WHERE memo=?", (memo,))
        row = await cur.fetchone()
        return int(row[0]) if row else None

async def get_balance_nano(tg_id: int) -> int:
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute("SELECT COALESCE(SUM(amount_nano),0) FROM ledger WHERE tg_id=?", (tg_id,))
        (s,) = await cur.fetchone()
        return int(s)

async def mark_tx_processed(tx_hash: str) -> bool:
    """True если новый tx, False если уже обработан."""
    async with aiosqlite.connect(DB_PATH) as db:
        try:
            await db.execute("INSERT INTO processed_txs(tx_hash) VALUES (?)", (tx_hash,))
            await db.commit()
            return True
        except Exception:
            return False

async def credit_deposit(tg_id: int, amount_nano: int, tx_hash: str):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO ledger(tg_id, amount_nano, kind, tx_hash) VALUES (?,?,?,?)",
            (tg_id, amount_nano, "deposit", tx_hash)
        )
        await db.commit()
