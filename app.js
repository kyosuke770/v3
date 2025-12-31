/*************************************************
 * Storage (SRS)
 *************************************************/
const SRS_KEY = "srs_v3_min";
function loadSrs() {
  return JSON.parse(localStorage.getItem(SRS_KEY)) || {};
}
function saveSrs() {
  localStorage.setItem(SRS_KEY, JSON.stringify(srs));
}
let srs = loadSrs(); // { [no]: { interval: number, due: number } }

/*************************************************
 * Time helpers
 *************************************************/
function todayDay() {
  return Math.floor(Date.now() / 86400000);
}

/*************************************************
 * State
 *************************************************/
let cards = [];
let cardsByMode = [];
let index = 0;
let revealed = false;

let currentAnswer = "";
let currentJp = "";

/*************************************************
 * DOM
 *************************************************/
const jpEl = document.getElementById("jp");
const enEl = document.getElementById("en");
const cardEl = document.getElementById("card");
const nextBtn = document.getElementById("next");
const videoBtn = document.getElementById("videoOrder");
const againBtn = document.getElementById("again");
const goodBtn = document.getElementById("good");
const reviewBtn = document.getElementById("review");

/*************************************************
 * CSV Loader
 *************************************************/
async function loadCSV() {
  const res = await fetch("data.csv");
  const text = await res.text();
  cards = parseCSV(text);

  cardsByMode = getCardsByBlock(1);
  index = 0;
  revealed = false;
  render();

  renderBlockButtons();
}

function parseCSV(text) {
  const lines = text.trim().split("\n");
  lines.shift();

  return lines.map(line => {
    const cols = splitCSV(line);
    const no = Number(cols[0]);
    const jp = cols[1];
    const en = cols[2];
    const slotsRaw = cols[3];
    const video = cols[4];
    const lv = Number(cols[5]);

    let slots = null;
    if (slotsRaw) {
      slots = slotsRaw.split("|").map(s => {
        const [jpSlot, enSlot] = s.split("=");
        return { jp: jpSlot, en: enSlot };
      });
    }
    return { no, jp, en, slots, video, lv };
  });
}

function splitCSV(line) {
  const result = [];
  let cur = "";
  let inQuotes = false;
  for (let c of line) {
    if (c === '"') inQuotes = !inQuotes;
    else if (c === "," && !inQuotes) {
      result.push(cur);
      cur = "";
    } else cur += c;
  }
  result.push(cur);
  return result.map(s => s.replace(/^"|"$/g, ""));
}

/*************************************************
 * Block helpers
 *************************************************/
function getBlockIndex(no) {
  return Math.floor((no - 1) / 30) + 1;
}
function getCardsByBlock(blockIndex) {
  return [...cards]
    .filter(c => getBlockIndex(c.no) === blockIndex)
    .sort((a, b) => a.no - b.no);
}
function getMaxBlock() {
  if (!cards.length) return 1;
  const maxNo = Math.max(...cards.map(c => c.no));
  return Math.ceil(maxNo / 30);
}

/*************************************************
 * Mode starters
 *************************************************/
function startBlock(blockIndex) {
  const list = getCardsByBlock(blockIndex);
  if (!list.length) {
    alert(`ブロック ${blockIndex} に問題がありません`);
    return;
  }
  cardsByMode = list;
  index = 0;
  revealed = false;
  render();
}

function startVideoOrder() {
  cardsByMode = [...cards].sort((a, b) => a.no - b.no);
  index = 0;
  revealed = false;
  render();
}

/*************************************************
 * Review (Due) mode
 *************************************************/
function getDueCards() {
  const t = todayDay();
  return [...cards]
    .filter(c => (srs[c.no]?.due ?? t) <= t) // 未登録は「今日Due」扱い
    .sort((a, b) => a.no - b.no);
}

function startReviewDue() {
  const due = getDueCards();
  if (!due.length) {
    alert("復習（Due）はありません");
    return;
  }
  cardsByMode = due;
  index = 0;
  revealed = false;
  render();
}

/*************************************************
 * UI helpers
 *************************************************/
function renderBlockButtons() {
  const wrap = document.getElementById("blocks");
  if (!wrap) return;

  wrap.innerHTML = "";
  const max = getMaxBlock();

  for (let b = 1; b <= max; b++) {
    const btn = document.createElement("button");
    const start = (b - 1) * 30 + 1;
    const end = b * 30;
    btn.textContent = `${start}-${end}`;
    btn.onclick = () => startBlock(b);
    wrap.appendChild(btn);
  }
}

/*************************************************
 * Card Logic
 *************************************************/
function pickSlot(card) {
  if (!card.slots) return null;
  const i = Math.floor(Math.random() * card.slots.length);
  return card.slots[i];
}

function render() {
  if (!cardsByMode.length) return;

  const card = cardsByMode[index];
  const slot = pickSlot(card);

  if (slot) {
    currentJp = card.jp.replace("{x}", slot.jp);
    currentAnswer = card.en.replace("{x}", slot.en);
    jpEl.textContent = currentJp;
    enEl.textContent = revealed
      ? currentAnswer
      : card.en.replace("{x}", "___");
  } else {
    currentJp = card.jp;
    currentAnswer = card.en;
    jpEl.textContent = currentJp;
    enEl.textContent = revealed ? currentAnswer : "タップして答え";
  }
}

/*************************************************
 * SRS grading (GOOD / AGAIN)
 *
 * interval (days): 0 → 1 → 2 → 4 → 7 → 15 → 30 ...
 *************************************************/
function nextIntervalGood(prev) {
  if (prev <= 0) return 1;
  if (prev === 1) return 2;
  if (prev === 2) return 4;
  if (prev === 4) return 7;
  if (prev === 7) return 15;
  if (prev === 15) return 30;
  return Math.min(120, Math.round(prev * 2));
}

function gradeAgain() {
  if (!cardsByMode.length) return;
  const card = cardsByMode[index];
  const t = todayDay();
  srs[card.no] = { interval: 0, due: t };
  saveSrs();

  // 次へ（即次カード）
  index = (index + 1) % cardsByMode.length;
  revealed = false;
  render();
}

function gradeGood() {
  if (!cardsByMode.length) return;
  const card = cardsByMode[index];
  const t = todayDay();

  const prev = srs[card.no]?.interval ?? 0;
  const interval = nextIntervalGood(prev);
  const due = t + interval;

  srs[card.no] = { interval, due };
  saveSrs();

  index = (index + 1) % cardsByMode.length;
  revealed = false;
  render();
}

/*************************************************
 * Events
 *************************************************/
cardEl.addEventListener("click", () => {
  revealed = !revealed;
  enEl.textContent = revealed ? currentAnswer : "タップして答え";
});

nextBtn.addEventListener("click", () => {
  index = (index + 1) % cardsByMode.length;
  revealed = false;
  render();
});

videoBtn?.addEventListener("click", startVideoOrder);
againBtn?.addEventListener("click", gradeAgain);
goodBtn?.addEventListener("click", gradeGood);
reviewBtn?.addEventListener("click", startReviewDue);

/*************************************************
 * Init
 *************************************************/
loadCSV();
