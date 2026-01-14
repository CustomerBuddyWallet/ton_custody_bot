/* global Telegram */
const tg = window.Telegram?.WebApp;
const $ = (id) => document.getElementById(id);

// Можно переопределить в консоли: window.API_BASE_OVERRIDE="http://127.0.0.1:8000"
const API_BASE = (window.API_BASE_OVERRIDE || "https://tonbuddy-api.onrender.com").replace(/\/$/, "");

let hideDust = false;

const COINS = [
  { sym: "TON", name: "Toncoin",  cg: "toncoin" },
  { sym: "NOT", name: "Notcoin",  cg: "notcoin" },
  { sym: "USDT", name: "Tether",  cg: "tether" },
  { sym: "DOGE", name: "Dogecoin", cg: "dogecoin" },
  { sym: "PEPE", name: "Pepe",     cg: "pepe" },
  { sym: "MAJOR", name: "MAJOR",   cg: "major" },
];

function setStatus(msg) {
  const el = $("statusLine");
  if (el) el.textContent = msg;
}

function fmtUsd(x){
  if (!isFinite(x)) return "$0.00";
  return "$" + Number(x).toFixed(2);
}

function fmtAmt(x){
  const n = Number(x);
  if (!isFinite(n)) return "0";
  if (n === 0) return "0";
  if (n < 0.0001) return n.toFixed(8);
  if (n < 1) return n.toFixed(6);
  return n.toFixed(4);
}

function getInitData(){
  return tg?.initData || "";
}

async function apiGet(path){
  const url = API_BASE + path;
  const initData = getInitData();

  const r = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      // ВАЖНО: имя заголовка должно совпадать с FastAPI параметром x_tg_init_data
      "X-Tg-Init-Data": initData,
    },
  });

  let data;
  try { data = await r.json(); } catch { data = null; }

  if (!r.ok){
    const msg = data?.detail ? `${r.status}: ${data.detail}` : `API ${r.status}`;
    throw new Error(msg);
  }
  return data;
}

async function fetchPricesUsd(){
  const ids = COINS.map(c => c.cg).join(",");
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd&include_24hr_change=true`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("Price fetch failed");
  return r.json();
}

function renderAssets(balances, prices){
  const list = $("assetsList");
  if (!list) return;
  list.innerHTML = "";

  for (const c of COINS){
    const bal = Number(balances?.[c.sym] || 0);
    const p = Number(prices?.[c.cg]?.usd ?? 0);
    const change = prices?.[c.cg]?.usd_24h_change;
    const fiat = bal * p;

    if (hideDust && fiat < 0.01) continue;

    const el = document.createElement("div");
    el.className = "asset";

    const chStr = (typeof change === "number")
      ? ` • ${change >= 0 ? "+" : ""}${change.toFixed(2)}%`
      : "";

    el.innerHTML = `
      <div class="left">
        <div class="coinIcon">${c.sym[0]}</div>
        <div class="meta">
          <div class="coinName">${c.name}</div>
          <div class="coinSub">${c.sym} • $${p.toFixed(6)}${chStr}</div>
        </div>
      </div>
      <div class="right">
        <div class="amt">${fmtAmt(bal)} ${c.sym}</div>
        <div class="fiat">${fmtUsd(fiat)}</div>
      </div>
    `;
    list.appendChild(el);
  }
}

async function refreshAll(){
  try{
    setStatus("Обновляю…");

    // Если не из Telegram — initData пустой, бэкенд даст 401. Сразу объясняем.
    if (!getInitData()){
      setStatus("Открой Mini App внутри Telegram (не в браузере).");
      return;
    }

    const [balRes, prices] = await Promise.all([
      apiGet("/api/balance"),
      fetchPricesUsd(),
    ]);

    // balRes: { ton: "0.000000000", nano: 0 }
    const ton = Number(balRes?.ton || 0);
    const tonPrice = Number(prices?.toncoin?.usd || 0);

    const totalTon = $("totalTon");
    const totalFiat = $("totalFiat");
    if (totalTon) totalTon.textContent = `${ton.toFixed(9)} TON`;
    if (totalFiat) totalFiat.textContent = fmtUsd(ton * tonPrice);

    renderAssets({ TON: ton }, prices);
    setStatus("Готово.");
  }catch(e){
    console.error(e);
    setStatus(`Ошибка: ${e.message}`);
  }
}

async function openDeposit(){
  try{
    const card = $("depositCard");
    if (card) card.style.display = "block";

    setStatus("Получаю реквизиты…");

    if (!getInitData()){
      setStatus("Открой Mini App внутри Telegram (нужен initData).");
      return;
    }

    const dep = await apiGet("/api/deposit");
    // dep: { bank_address: "...", memo: "..." }
    const addrEl = $("depAddress");
    const memoEl = $("depMemo");
    if (addrEl) addrEl.textContent = dep?.bank_address || "—";
    if (memoEl) memoEl.textContent = dep?.memo || "—";

    setStatus("Реквизиты готовы.");
  }catch(e){
    console.error(e);
    setStatus(`Ошибка реквизитов: ${e.message}`);
  }
}

function copyText(txt){
  if (!txt || txt === "—") return;
  navigator.clipboard.writeText(txt).then(() => {
    tg?.HapticFeedback?.notificationOccurred?.("success");
    setStatus("Скопировано ✅");
  }).catch(() => setStatus("Не удалось скопировать"));
}

function boot(){
  if (tg){
    tg.ready();
    tg.expand();
    tg.setHeaderColor?.("#0b1220");
    tg.setBackgroundColor?.("#0b1220");

    const u = tg.initDataUnsafe?.user;
    const name = u?.first_name ? `${u.first_name}${u.last_name ? " " + u.last_name : ""}` : "unknown";
    const uname = u?.username ? `@${u.username}` : "(без username)";
    const userLine = $("userLine");
    if (userLine) userLine.textContent = `${name} • ${uname}`;
  } else {
    const userLine = $("userLine");
    if (userLine) userLine.textContent = "Открыто вне Telegram (локальный тест)";
  }

  $("btnRefresh")?.addEventListener("click", refreshAll);
  $("btnDeposit")?.addEventListener("click", openDeposit);

  $("btnWithdraw")?.addEventListener("click", () => {
    setStatus("Вывод временно отключён.");
    tg?.showPopup?.({
      title: "Вывод",
      message: "Вывод временно отключён.",
      buttons: [{ type: "ok" }]
    });
  });

  // Обмен убираем полностью
  const swapBtn = $("btnSwap");
  if (swapBtn) swapBtn.style.display = "none";

  $("closeDeposit")?.addEventListener("click", () => {
    const card = $("depositCard");
    if (card) card.style.display = "none";
  });

  document.querySelectorAll(".copyBtn").forEach(btn => {
    btn.addEventListener("click", () => {
      const t = btn.getAttribute("data-copy");
      if (t === "address") copyText($("depAddress")?.textContent?.trim() || "");
      if (t === "memo") copyText($("depMemo")?.textContent?.trim() || "");
    });
  });

  $("toggleDust")?.addEventListener("click", () => {
    hideDust = !hideDust;
    const td = $("toggleDust");
    if (td) td.textContent = hideDust ? "Показать мелкие" : "Скрыть мелкие";
    refreshAll();
  });

  refreshAll();
}

boot();
