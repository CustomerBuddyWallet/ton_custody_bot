const tg = window.Telegram?.WebApp;

const userLine = document.getElementById("userLine");
const uahBalance = document.getElementById("uahBalance");
const tonBalance = document.getElementById("tonBalance");
const statusEl = document.getElementById("status");

const promoCard = document.getElementById("promoCard");
document.getElementById("promoOk").onclick = () => promoCard.style.display = "none";

function setStatus(t){ statusEl.textContent = t; }
function fmt(n, d=2){ if(n===null||n===undefined||Number.isNaN(n)) return "—"; return Number(n).toFixed(d); }

const API_BASE = ""; 
// IMPORTANT: после хостинга сюда не надо ничего — мы будем делать относительные запросы к тому же домену.
// Но пока ты тестишь локально, можно оставить пусто.

async function apiGet(path){
  if (!tg) throw new Error("Open in Telegram");
  const r = await fetch(`${API_BASE}${path}`, {
    headers: {
      "X-TG-INIT-DATA": tg.initData
    }
  });
  if (!r.ok) throw new Error(`API ${r.status}`);
  return await r.json();
}

function setTonAmount(ton){
  tonBalance.textContent = fmt(ton, 9);

  // UAH тут пока условный курс (для красоты)
  const rate = 200; // потом подтянем реальный
  uahBalance.textContent = `₴${fmt((Number(ton)||0)*rate, 2)}`;
}

function showModal(title, body, actions=[]){
  // простой псевдо-модал (без библиотек)
  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position:fixed; inset:0; background:rgba(0,0,0,.55);
    display:flex; align-items:center; justify-content:center;
    padding:16px; z-index:9999;
  `;
  const box = document.createElement("div");
  box.style.cssText = `
    width:min(420px,100%);
    background:rgba(18,26,45,.98);
    border:1px solid rgba(255,255,255,.10);
    border-radius:18px;
    padding:14px;
    box-shadow:0 25px 70px rgba(0,0,0,.55);
  `;
  const h = document.createElement("div");
  h.textContent = title;
  h.style.cssText = "font-weight:950; font-size:16px; margin-bottom:8px;";
  const p = document.createElement("div");
  p.innerHTML = body;
  p.style.cssText = "color:#9fb0d4; font-size:13px; line-height:1.35; white-space:pre-wrap;";
  const row = document.createElement("div");
  row.style.cssText = "display:flex; gap:10px; margin-top:12px;";

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "Закрыть";
  closeBtn.style.cssText = `
    flex:1; padding:12px; border-radius:14px; border:1px solid rgba(255,255,255,.12);
    background:rgba(255,255,255,.06); color:#eaf0ff; font-weight:900; cursor:pointer;
  `;
  closeBtn.onclick = () => overlay.remove();

  row.appendChild(closeBtn);

  for (const a of actions){
    const b = document.createElement("button");
    b.textContent = a.text;
    b.style.cssText = `
      flex:1; padding:12px; border-radius:14px; border:0;
      background:#4b7bec; color:#fff; font-weight:950; cursor:pointer;
    `;
    b.onclick = async () => { try { await a.onClick(); } finally { overlay.remove(); } };
    row.appendChild(b);
  }

  box.appendChild(h);
  box.appendChild(p);
  box.appendChild(row);
  overlay.appendChild(box);
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  document.body.appendChild(overlay);
}

async function refreshBalance(){
  try{
    setStatus("Обновляю баланс…");
    const data = await apiGet("/api/balance");
    setTonAmount(data.ton);
    setStatus("Баланс обновлён.");
  }catch(e){
    setStatus("Не могу получить баланс (пока нет хоста/HTTPS или не из Telegram).");
  }
}

async function openDeposit(){
  try{
    setStatus("Загружаю реквизиты…");
    const d = await apiGet("/api/deposit");
    const body = `
<b>Адрес банка</b>\n${d.bank_address}\n\n
<b>Комментарий (memo)</b>\n${d.memo}\n\n
Комментарий нужен, чтобы пополнение зачлось автоматически.
    `.trim().replaceAll("\n", "<br>");
    showModal("Пополнение", body, [
      { text:"Скопировать", onClick: async ()=>{
        const txt = `${d.bank_address}\n${d.memo}`;
        if (navigator.clipboard) await navigator.clipboard.writeText(txt);
        setStatus("Скопировано.");
      }}
    ]);
    setStatus("Реквизиты готовы.");
  }catch(e){
    setStatus("Не могу получить реквизиты (нужен хост/HTTPS и запуск из Telegram).");
  }
}

function openWithdraw(){
  showModal(
    "Вывод",
    "Выводы временно отключены (техработы).",
    []
  );
}

document.getElementById("actRefresh").onclick = refreshBalance;
document.getElementById("actDeposit").onclick = openDeposit;
document.getElementById("actWithdraw").onclick = openWithdraw;

document.getElementById("actSwap").onclick = () => setStatus("Обмен: скоро.");
document.getElementById("btnHideSmall").onclick = () => setStatus("Скрытие мелких: скоро.");
document.getElementById("btnSettings").onclick = () => setStatus("Настройки: скоро.");

// INIT
if (tg) {
  tg.ready();
  tg.expand();

  const u = tg.initDataUnsafe?.user;
  const name = u ? [u.first_name, u.last_name].filter(Boolean).join(" ") : "unknown";
  const uname = u?.username ? "@"+u.username : "(без username)";
  userLine.textContent = `${name} • ${uname}`;

  setTonAmount(0);
  setStatus("Готово. Нажми «Обновить».");
} else {
  userLine.textContent = "Открой внутри Telegram";
  setStatus("Открой Mini App внутри Telegram, локально API не работает.");
}
