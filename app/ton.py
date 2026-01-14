import httpx
from dataclasses import dataclass

@dataclass
class TonTx:
    tx_hash: str
    in_comment: str | None
    in_value_nano: int

class TonCenterClient:
    def __init__(self, base_url: str, api_key: str | None = None):
        self.base_url = base_url.rstrip("/")
        self.headers = {}
        if api_key:
            self.headers["X-API-Key"] = api_key

    async def get_recent_txs(self, address: str, limit: int = 20) -> list[TonTx]:
        # toncenter v2 endpoint
        url = f"{self.base_url}/getTransactions"
        params = {"address": address, "limit": str(limit)}

        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(url, params=params, headers=self.headers)
            r.raise_for_status()
            data = r.json()

        out: list[TonTx] = []
        for item in data.get("result", []) or []:
            tx_hash = (item.get("transaction_id") or {}).get("hash")
            in_msg = item.get("in_msg") or {}
            comment = in_msg.get("message")
            value = int(in_msg.get("value", 0))

            if tx_hash:
                out.append(TonTx(tx_hash=tx_hash, in_comment=comment, in_value_nano=value))
        return out
