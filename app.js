/* global Telegram */
const tg = window.Telegram?.WebApp;

const $ = (id) => document.getElementById(id);

const API_BASE =
  // 1) для локального теста:
  // "http://127.0.0.1:8000"
  // 2) для прода (Render/Fly и т.п.) поставим позже:
  (window.API_BASE_OVERRIDE || "http://127.0.0.1:8000");

let hideDust = false;

// CoinGecko ids (актуально и удобно)
const COINS = [
  { sym: "TON", name: "Toncoin",  cg: "toncoin" },
  { sym: "NOT", name: "Notcoin",  cg: "notcoin" },
  { sym: "USDT", name: "Tether",  cg: "tether" },
  { sym: "DOGE", name: "Dogecoin", cg: "dogecoin" },
  { sym: "PEPE", name: "Pepe",     cg: "pepe" },
  { sym: "MAJOR", name: "MAJOR",   cg: "major" },
];

function setStatus(msg) { $("statusLine").textContent = msg; }

function fmtUsd(x){
  if (!isFinite(x)) return "$0.00";
  return "$" + x.toFixed(2);
}

function fmtAmt(x){
  if (!isFinite(x)) return "0";
  if (x === 0) return "0";
  if (x < 0.0001) return x.toFixed(8);
  if (x < 1) return x.toFixed(6);
  return x.toFixed(4);
}

async function apiGet(path){
  const url = API_BASE.replace(/\/$/, "") + path;
  const initData = tg?.initData || "";
  const r = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      // чтобы бек понимал, кто юзер:
      "X-TG-INITDATA": initData,
    },
  });
  if (!r.ok) throw new Error(`API ${r.status}`);
  return r.json();
}

async function apiPost(path, body){
  const url = API_BASE.replace(/\/$/, "") + path;
  const initData = tg?.initData || "";
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-TG-INITDATA": initData,
    },
    body: JSON.stringify(body || {}),
  });
  if (!r.ok) throw new Error(`API ${r.status}`);
  return r.json();
}

async function fetchPricesUsd(){
  // CoinGecko simple price (без ключа, но не долби каждую секунду)
  const ids = COINS.map(c => c.cg).join(",");
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd&include_24hr_change=true`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("Price fetch failed");
  return r.json();
}

function renderAssets(balances, prices){
  // balances: { TON: number, ... } (в твоей базе пока реалистично только TON)
  const list = $("assetsList");
  list.innerHTML = "";

  for (const c of COINS){
    const bal = Number(balances?.[c.sym] || 0);
    const p = prices?.[c.cg]?.usd ?? 0;
    const change = prices?.[c.cg]?.usd_24h_change;

    const fiat = bal * p;

    if (hideDust && fiat < 0.01) continue;

    const el = document.createElement("div");
    el.className = "asset";

    const badge = c.sym.slice(0,1);

    const chStr = (typeof change === "number")
      ? ` • ${change >= 0 ? "+" : ""}${change.toFixed(2)}%`
      : "";

    el.innerHTML = `
      <div class="left">
        <div class="coinIcon">${badge}</div>
        <div class="meta">
          <div class="coinName">${c.name}</div>
          <div class="coinSub">${c.sym} • $${Number(p || 0).toFixed(6)}${chStr}</div>
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
    const [balRes, prices] = await Promise.all([
      apiGet("/api/balance"),
      fetchPricesUsd(),
    ]);

    // balRes пример: { ton: 0.123456789 }
    const ton = Number(balRes?.ton || 0);
    const tonPrice = Number(prices?.toncoin?.usd || 0);
    $("totalTon").textContent = `${ton.toFixed(9)} TON`;
    $("totalFiat").textContent = fmtUsd(ton * tonPrice);

    // Пока мульти-активов в базе нет — показываем 0, но с реальным курсом.
    renderAssets({ TON: ton, NOT: 0, USDT: 0, DOGE: 0, PEPE: 0, MAJOR: 0 }, prices);

    setStatus("Готово.");
  }catch(e){
    console.error(e);
    setStatus("Ошибка обновления. Проверь API_BASE/хостинг и CORS.");
  }
}

async function openDeposit(){
  try{
    $("depositCard").style.display = "block";
    setStatus("Получаю реквизиты…");
    const dep = await apiGet("/api/deposit");
    // dep: { address: "...", memo: "..." }
    $("depAddress").textContent = dep.address || "—";
    $("depMemo").textContent = dep.memo || "—";
    setStatus("Реквизиты готовы.");
  }catch(e){
    console.error(e);
    setStatus("Не могу получить реквизиты. Нужен доступ к API.");
  }
}

function copyText(txt){
  if (!txt || txt === "—") return;
  navigator.clipboard.writeText(txt).then(() => {
    tg?.HapticFeedback?.notificationOccurred("success");
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
    $("userLine").textContent = `${name} • ${uname}`;
  } else {
    $("userLine").textContent = "Открыто вне Telegram (локальный тест)";
  }

  $("btnRefresh").addEventListener("click", refreshAll);
  $("btnDeposit").addEventListener("click", openDeposit);

  $("btnWithdraw").addEventListener("click", async () => {
    // Кнопка есть, но вывод отключён
    setStatus("Вывод временно отключён.");
    tg?.showPopup?.({
      title: "Вывод",
      message: "Вывод временно отключён.",
      buttons: [{type:"ok"}]
    });
  });

  $("btnSwap").addEventListener("click", () => {
    setStatus("Обмен скоро будет (пока заглушка).");
    tg?.showPopup?.({
      title: "Обмен",
      message: "Обмен в разработке.",
      buttons: [{type:"ok"}]
    });
  });

  $("closeDeposit").addEventListener("click", () => {
    $("depositCard").style.display = "none";
  });

  document.querySelectorAll(".copyBtn").forEach(btn => {
    btn.addEventListener("click", () => {
      const t = btn.getAttribute("data-copy");
      if (t === "address") copyText($("depAddress").textContent.trim());
      if (t === "memo") copyText($("depMemo").textContent.trim());
    });
  });

  $("toggleDust").addEventListener("click", () => {
    hideDust = !hideDust;
    $("toggleDust").textContent = hideDust ? "Показать мелкие" : "Скрыть мелкие";
    refreshAll();
  });

  refreshAll();
}

boot();
