'use strict';
/* ============ Schnobbis Quiz ============ */
const $app = document.getElementById('app');
const $sheet = document.getElementById('sheet');
const $toast = document.getElementById('toast');

const LS = {
  game: 'sq_game_v1',
  players: 'sq_players_v1',
  used: 'sq_used_v1',
  settings: 'sq_settings_v1',
};
const EMOJIS = ['🦊','🐼','🐸','🦁','🐙','🐧','🦄','🐯','🐨','🐵','🦉','🐢','🐷','🐰','🦖','🐳'];
const COLORS = ['#EDBABC','#598099','#BB7B85','#E8CF97','#313857','#9DBACB','#D6969E','#7C87AE','#C7A2B8','#8FAE9F','#E3A587','#6E9BB5'];
const PRESETS = [3, 5, 10, 15, 20];
const TIMERS = [0, 15, 30, 60];

const QMAP = Object.fromEntries(QUESTIONS.map(q => [q.id, q]));
const PMAP = Object.fromEntries(PAIRS.map(p => [p.id, p]));

function load(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function buzz(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} }

let game = load(LS.game, null);
let players = load(LS.players, []);
let setup = Object.assign(
  { mode: 'klassik', perPlayer: 5, streakBonus: true, jokers: 1, cats: [], diffs: [], timer: 0, steal: true, finale: true, sound: true, diffPoints: false, rising: true },
  load(LS.settings, {})
);
let view = 'home';
let lastView = null;
let catsOpen = false;

function saveGame() { save(LS.game, game); }
function saveSetup() { save(LS.players, players); save(LS.settings, setup); }

/* ---------- Sound (kleine Töne, ohne Dateien) ---------- */
let actx = null;
function tone(freqs, dur = 0.12, type = 'sine', gap = 0.09) {
  if (!setup.sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    freqs.forEach((f, i) => {
      const o = actx.createOscillator(), g = actx.createGain();
      const t0 = actx.currentTime + i * gap;
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(actx.destination);
      o.start(t0); o.stop(t0 + dur + 0.02);
    });
  } catch (e) {}
}
const sfx = {
  ok: () => tone([660, 880], 0.14),
  no: () => tone([300, 220], 0.18, 'triangle', 0.12),
  bonus: () => tone([660, 880, 1100, 1320], 0.12, 'sine', 0.07),
  tick: () => tone([880], 0.05, 'square'),
  timeup: () => tone([440, 330, 220], 0.2, 'sawtooth', 0.14),
  win: () => tone([523, 659, 784, 1046, 784, 1046], 0.16, 'triangle', 0.12),
};

/* ---------- Bildschirm wach halten ---------- */
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && !wakeLock && 'wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch (e) { wakeLock = null; }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && view === 'play') keepAwake(true);
});

/* ---------- Fragen ziehen (ohne Wiederholung über mehrere Spiele) ---------- */
function getUsed() { const u = load(LS.used, {}); return { klassik: u.klassik || [], duell: u.duell || [] }; }
function klassikIds(cats, diffs) {
  return QUESTIONS.filter(q => (!cats || !cats.length || cats.includes(q.c)) && (!diffs || !diffs.length || diffs.includes(q.d))).map(q => q.id);
}
function duellIds(diffs) {
  return PAIRS.filter(p => !diffs || !diffs.length || diffs.includes(p.d)).map(p => p.id);
}
function poolIds(pool, cats, diffs) { return pool === 'duell' ? duellIds(diffs) : klassikIds(cats, diffs); }
function pick(pool, count, exclude = [], cats = [], diffs = []) {
  const used = getUsed();
  let all = poolIds(pool, cats, diffs);
  if (!all.length) all = poolIds(pool, cats, []);
  if (!all.length) all = poolIds(pool, [], []);
  let avail = all.filter(id => !used[pool].includes(id) && !exclude.includes(id));
  if (avail.length < count) {
    // Pool (für diese Auswahl) aufgebraucht → diese Fragen wieder freigeben
    used[pool] = used[pool].filter(id => !all.includes(id));
    avail = all.filter(id => !exclude.includes(id));
  }
  const out = []; let bag = shuffle(avail);
  while (out.length < count) { if (!bag.length) bag = shuffle(all); out.push(bag.shift()); }
  used[pool] = [...new Set([...used[pool], ...out])];
  save(LS.used, used);
  return out;
}
function unplayed(pool, cats, diffs) {
  const used = getUsed()[pool];
  const all = poolIds(pool, cats, diffs);
  return all.filter(id => !used.includes(id)).length;
}

/* ---------- Spiel anlegen ---------- */
function levelPlan(R) {
  const levels = setup.diffs.length ? setup.diffs.slice().sort() : [1, 2, 3];
  return Array.from({ length: R }, (_, r) => levels[Math.floor(r * levels.length / R)]);
}
function newGame() {
  const ps = players.map(p => ({ ...p, score: 0, correct: 0, answered: 0, streak: 0, best: 0, jokers: setup.jokers, duelsWon: 0, steals: 0 }));
  const n = ps.length;
  const turns = [];
  if (setup.mode === 'klassik') {
    const R = setup.perPlayer;
    let qs;
    if (setup.rising) {
      // Steigend: Runden gleichmäßig auf die Stufen verteilen (erst leicht, dann schwerer);
      // innerhalb einer Runde haben alle die gleiche Stufe → fair
      const lv = levelPlan(R);
      qs = [];
      [1, 2, 3].forEach(d => {
        const rounds = lv.filter(x => x === d).length;
        if (rounds) qs.push(...pick('klassik', rounds * n, qs, setup.cats, [d]));
      });
    } else {
      qs = pick('klassik', n * R, [], setup.cats, setup.diffs);
    }
    for (let r = 0; r < setup.perPlayer; r++)
      for (let i = 0; i < n; i++) turns.push({ p: i, q: qs[r * n + i], res: null });
  } else {
    const D = Math.ceil((n * setup.perPlayer) / 2);
    let pairs;
    if (setup.rising) {
      const lv = levelPlan(D);
      pairs = [];
      [1, 2, 3].forEach(d => {
        const k = lv.filter(x => x === d).length;
        if (k) pairs.push(...pick('duell', k, pairs, [], [d]));
      });
    } else {
      pairs = pick('duell', D, [], [], setup.diffs);
    }
    for (let k = 0; k < D; k++) {
      const pr = PMAP[pairs[k]];
      const sw = Math.random() < 0.5;
      const a = (2 * k) % n, b = (2 * k + 1) % n;
      turns.push({ p: a, q: sw ? pr.b : pr.a, res: null, duel: k, side: 0, pair: pr.id });
      turns.push({ p: b, q: sw ? pr.a : pr.b, res: null, duel: k, side: 1, pair: pr.id });
    }
  }
  game = {
    mode: setup.mode, streakBonus: setup.streakBonus, perPlayer: setup.perPlayer, jokersStart: setup.jokers,
    cats: setup.cats.slice(), diffs: setup.diffs.slice(), diffPoints: setup.diffPoints, rising: setup.rising, timer: setup.timer, steal: setup.steal && n > 1, finale: setup.finale,
    players: ps, turns, idx: 0, phase: 'intro', history: [], finished: false, started: Date.now(), qStart: 0,
  };
  saveGame();
  view = 'play';
  render();
}

function isFinal(i = game.idx) {
  if (!game.finale) return false;
  const t = game.turns[i];
  if (!t) return false;
  if (t.duel !== undefined) return t.duel === game.turns[game.turns.length - 1].duel;
  return i >= game.turns.length - game.players.length;
}
function basePoints(i = game.idx) { return game.diffPoints ? QMAP[game.turns[i].q].d : 1; }
function pointsFor(i = game.idx) { return basePoints(i) * (isFinal(i) ? 2 : 1); }
function diffBadge(d) { const x = DIFFS[d - 1]; return `<span class="diff d${d}">${x.icon} ${x.label}</span>`; }

/* ---------- Rückgängig ---------- */
function snapshot() {
  const { history, ...rest } = game;
  game.history.push(JSON.stringify(rest));
  if (game.history.length > 40) game.history.shift();
}
function undo() {
  if (!game || !game.history.length) return;
  const h = game.history;
  const prev = JSON.parse(h.pop());
  game = { ...prev, history: h };
  if (game.phase === 'question') game.qStart = Date.now();
  saveGame();
  view = 'play';
  closeSheet();
  render();
  toast('↩️ Rückgängig gemacht');
}

/* ---------- Spielzüge ---------- */
const curTurn = () => game.turns[game.idx];

function showQuestion() { game.phase = 'question'; game.qStart = Date.now(); saveGame(); render(); }
function reveal() { game.phase = 'revealed'; saveGame(); render(); }

function useJoker() {
  const t = curTurn(), p = game.players[t.p];
  if (p.jokers <= 0 || game.phase !== 'question') return;
  snapshot();
  const inGame = game.turns.map(x => x.q);
  const [nq] = pick('klassik', 1, inGame, game.cats, [QMAP[t.q].d]);
  t.q = nq; t.joker = true; p.jokers--;
  game.qStart = Date.now();
  saveGame(); render();
  toast('🃏 Joker! Neue Frage für ' + p.name);
}

function judge(ok) {
  snapshot();
  const t = curTurn(), p = game.players[t.p];
  const pts = pointsFor();
  t.res = ok ? 'ok' : 'no';
  p.answered++;
  let msg = null;
  if (ok) {
    p.score += pts; p.correct++; p.streak++; p.best = Math.max(p.best, p.streak);
    if (game.streakBonus && p.streak % 3 === 0) { p.score++; t.bonus = 1; msg = `🔥 ${p.name}: ${p.streak}er-Serie! +1 Bonus`; }
    msg ? sfx.bonus() : sfx.ok();
    buzz(30);
  } else {
    p.streak = 0; sfx.no(); buzz([20, 60, 20]);
  }
  if (t.duel !== undefined && t.side === 1) {
    const t0 = game.turns[game.idx - 1];
    const p0 = game.players[t0.p];
    if (t0.res === 'ok' && t.res !== 'ok') { p0.score++; p0.duelsWon++; t0.duelBonus = 1; }
    else if (t.res === 'ok' && t0.res !== 'ok') { p.score++; p.duelsWon++; t.duelBonus = 1; }
    game.phase = 'duelResult';
  } else if (!ok && game.steal && t.duel === undefined) {
    game.phase = 'steal';
  } else {
    advance();
  }
  saveGame(); render();
  if (msg) toast(msg);
}

function steal(i) {
  snapshot();
  const t = curTurn();
  if (i >= 0) {
    const pts = pointsFor();
    game.players[i].score += pts; game.players[i].steals++;
    t.stolenBy = i;
    sfx.ok();
    toast(`🫳 ${game.players[i].name} klaut ${pts === 2 ? '2 Punkte' : 'den Punkt'}!`);
  }
  advance(); saveGame(); render();
}

function advance() {
  game.idx++;
  game.phase = 'intro';
  if (game.idx >= game.turns.length) { game.finished = true; view = 'end'; sfx.win(); }
}
function nextAfterDuel() { snapshot(); advance(); saveGame(); render(); }

function adjustScore(i, d) { snapshot(); game.players[i].score += d; saveGame(); renderSheet(); render(); }
function endEarly() {
  if (!confirm('Spiel jetzt beenden und Ergebnis zeigen?')) return;
  snapshot(); game.finished = true; view = 'end'; saveGame(); closeSheet(); render(); sfx.win();
}

/* ---------- Timer ---------- */
let timerInt = null;
function stopTimer() { clearInterval(timerInt); timerInt = null; }
function startTimer() {
  stopTimer();
  if (!game || !game.timer || game.phase !== 'question') return;
  let lastSec = null;
  const update = () => {
    const bar = document.getElementById('timerBar'), num = document.getElementById('timerNum'), box = document.getElementById('timer');
    if (!bar) return stopTimer();
    const left = Math.max(0, game.timer - (Date.now() - game.qStart) / 1000);
    const sec = Math.ceil(left);
    bar.style.width = (left / game.timer * 100) + '%';
    num.textContent = left > 0 ? sec + ' s' : '⏰ Zeit um!';
    box.classList.toggle('warn', left > 0 && left <= 5);
    if (left > 0 && left <= 5 && sec !== lastSec) sfx.tick();
    lastSec = sec;
    if (left <= 0) { box.classList.add('over'); sfx.timeup(); buzz([200, 80, 200]); stopTimer(); }
  };
  update();
  timerInt = setInterval(update, 200);
}

/* ---------- Spieler-Setup ---------- */
function addPlayer(name) {
  name = name.trim();
  if (!name) return;
  if (players.length >= 12) { toast('Maximal 12 Spieler'); return; }
  const usedE = players.map(p => p.emoji);
  const emoji = EMOJIS.find(e => !usedE.includes(e)) || EMOJIS[players.length % EMOJIS.length];
  const usedC = players.map(p => p.color);
  const color = COLORS.find(c => !usedC.includes(c)) || COLORS[players.length % COLORS.length];
  players.push({ id: Date.now() + Math.random(), name: name.slice(0, 16), emoji, color });
  saveSetup(); render();
  const inp = document.getElementById('newName'); if (inp) inp.focus();
}
function cycleEmoji(i) {
  const cur = EMOJIS.indexOf(players[i].emoji);
  players[i].emoji = EMOJIS[(cur + 1) % EMOJIS.length];
  saveSetup(); render();
}
function movePlayer(i, d) {
  const j = i + d; if (j < 0 || j >= players.length) return;
  [players[i], players[j]] = [players[j], players[i]];
  saveSetup(); render();
}
function toggleDiff(v) {
  if (v === '*') setup.diffs = [];
  else {
    v = +v;
    const st = new Set(setup.diffs);
    st.has(v) ? st.delete(v) : st.add(v);
    setup.diffs = [...st].sort();
    if (setup.diffs.length === DIFFS.length) setup.diffs = [];
  }
  saveSetup(); render();
}
function toggleCat(c) {
  if (c === '*') setup.cats = [];
  else {
    const s = new Set(setup.cats);
    s.has(c) ? s.delete(c) : s.add(c);
    setup.cats = [...s];
    if (setup.cats.length === CATEGORIES.length) setup.cats = [];
  }
  saveSetup(); render();
}

/* ============ RENDER ============ */
function avatar(p, size = '') {
  return `<span class="avatar ${size}" style="--pc:${p.color}">${p.emoji}</span>`;
}

function render() {
  if (view === 'play' && (!game || game.finished)) view = game && game.finished ? 'end' : 'home';
  const y = view === lastView && view === 'setup' ? window.scrollY : 0;
  const fn = { home: renderHome, setup: renderSetup, play: renderPlay, end: renderEnd }[view];
  stopTimer();
  $app.innerHTML = fn();
  $app.dataset.view = view;
  if (view === 'end' && lastView !== 'end') confetti();
  else if (view !== 'end') stopConfetti();
  keepAwake(view === 'play');
  if (view === 'play') startTimer();
  lastView = view;
  window.scrollTo(0, y);
}

function renderHome() {
  const running = game && !game.finished;
  const t = running ? game.turns.length : 0;
  return `
  <div class="screen home">
    <div class="deco"><span class="d-arch"></span><span class="d-sun"></span><span class="d-pill"></span><span class="d-flower"><svg viewBox="0 0 100 100"><path d="M50 8c9 0 15 9 14 19 9-6 21-3 24 6s-3 18-12 20c9 4 12 15 6 23s-18 8-24 1c0 10-8 17-17 15s-14-11-11-20c-7 7-19 6-23-2s0-19 9-21c-9-3-13-14-8-22s17-8 23-1C40 16 42 8 50 8z"/></svg></span></div>
    <div class="logo-wrap">
      <div class="logo">?</div>
      <h1>Schnobbis Quiz</h1>
      <p class="muted">Allgemeinwissen für den Spieleabend</p>
    </div>
    ${running ? `
      <div class="card resume">
        <div class="row-between">
          <strong>Laufendes Spiel</strong>
          <span class="pill">${game.mode === 'duell' ? '⚔️ Duell' : '🎯 Klassik'}</span>
        </div>
        <div class="avatars">${game.players.map(p => avatar(p, 'sm')).join('')}</div>
        <div class="progress"><div style="width:${Math.round(game.idx / t * 100)}%"></div></div>
        <p class="muted small">Frage ${Math.min(game.idx + 1, t)} von ${t}</p>
        <button class="btn primary big" data-a="resume">▶️ Weiterspielen</button>
      </div>` : ''}
    <button class="btn ${running ? 'ghost' : 'primary big'}" data-a="toSetup">✨ Neues Spiel</button>
    <div class="card pool">
      <div class="row-between"><span>🎯 Fragen ungespielt</span><strong>${unplayed('klassik')} / ${QUESTIONS.length}</strong></div>
      <div class="diffcount">${DIFFS.map(d => `<span class="diff d${d.v}">${d.icon} ${d.label} <b>${QUESTIONS.filter(q => q.d === d.v).length}</b></span>`).join('')}</div>
      <div class="row-between"><span>⚔️ Duell-Paare ungespielt</span><strong>${unplayed('duell')} / ${PAIRS.length}</strong></div>
      <button class="link" data-a="resetPool">Gespielte Fragen zurücksetzen</button>
    </div>
  </div>`;
}

function renderSetup() {
  const n = players.length;
  const duelOk = n >= 2;
  if (!duelOk && setup.mode === 'duell') setup.mode = 'klassik';
  const isK = setup.mode === 'klassik';
  const total = isK ? n * setup.perPlayer : Math.ceil(n * setup.perPlayer / 2) * 2;
  const poolSize = isK ? klassikIds(setup.cats, setup.diffs).length : duellIds(setup.diffs).length * 2;
  const fresh = isK ? unplayed('klassik', setup.cats, setup.diffs) : unplayed('duell', [], setup.diffs) * 2;
  const catLabel = setup.cats.length ? `${setup.cats.length} ausgewählt` : 'Alle';
  const mins = Math.max(1, Math.round(total * 0.6));
  return `
  <div class="screen setup">
    <header class="topbar"><button class="icon-btn" data-a="home">‹</button><h2>Neues Spiel</h2><span></span></header>

    <section class="card">
      <h3>👥 Spieler <span class="muted small">(${n})</span></h3>
      <form class="add-row" data-form="add">
        <input id="newName" type="text" placeholder="Name eingeben" maxlength="16" autocomplete="off" enterkeyhint="done">
        <button class="btn primary" type="submit">＋</button>
      </form>
      ${n ? `<ul class="plist">${players.map((p, i) => `
        <li>
          <button class="avatar-btn" data-a="emoji" data-i="${i}" title="Emoji ändern">${avatar(p)}</button>
          <span class="pname">${esc(p.name)}</span>
          <span class="pctrl">
            <button class="icon-btn s" data-a="up" data-i="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button class="icon-btn s" data-a="down" data-i="${i}" ${i === n - 1 ? 'disabled' : ''}>↓</button>
            <button class="icon-btn s danger" data-a="del" data-i="${i}">✕</button>
          </span>
        </li>`).join('')}</ul>
        <p class="muted small hint">Tipp aufs Tier = anderes Emoji · Reihenfolge = Spielreihenfolge</p>
        ${n > 1 ? `<button class="link" data-a="shufflePlayers">🔀 Reihenfolge mischen</button>` : ''}`
      : `<p class="empty">Noch keine Spieler – leg los! 🎉</p>`}
    </section>

    <section class="card">
      <h3>🎮 Spielmodus</h3>
      <div class="modes">
        <button class="mode ${isK ? 'on' : ''}" data-a="mode" data-v="klassik">
          <span class="mi">🎯</span><strong>Klassik</strong><span class="muted small">Jeder bekommt reihum eine eigene Frage</span>
        </button>
        <button class="mode ${!isK ? 'on' : ''}" data-a="mode" data-v="duell" ${duelOk ? '' : 'disabled'}>
          <span class="mi">⚔️</span><strong>Duell</strong><span class="muted small">${duelOk ? 'Zwei Spieler, zwei vergleichbare Fragen. Nur einer richtig = +1 Extrapunkt' : 'Ab 2 Spielern'}</span>
        </button>
      </div>
    </section>

    <section class="card">
      <h3>❓ Fragen pro Spieler</h3>
      <div class="presets">
        ${PRESETS.map(v => `<button class="preset ${setup.perPlayer === v ? 'on' : ''}" data-a="ppSet" data-v="${v}">${v}</button>`).join('')}
      </div>
      <div class="setting fine">
        <div class="muted small">Feinjustieren</div>
        <div class="stepper"><button data-a="pp" data-v="-1">−</button><span>${setup.perPlayer}</span><button data-a="pp" data-v="1">＋</button></div>
      </div>
      ${n ? `<p class="summary">= <strong>${total} Fragen</strong> insgesamt · ca. ${mins} Min.${total > fresh ? `<br><span class="muted small">Davon ${Math.min(fresh, total)} noch ungespielt – danach kommen schon gespielte wieder dran.</span>` : ''}</p>` : ''}
    </section>

    <section class="card">
      <h3>📶 Schwierigkeit</h3>
      <div class="diffpick">
        <button class="dchip ${!setup.diffs.length ? 'on' : ''}" data-a="diff" data-v="*">✨ Alle</button>
        ${DIFFS.map(d => `<button class="dchip d${d.v} ${setup.diffs.includes(d.v) ? 'on' : ''}" data-a="diff" data-v="${d.v}">${d.icon} ${d.label}</button>`).join('')}
      </div>
      <p class="muted small hint">${poolSize} Fragen in dieser Auswahl${isK ? '' : ` (${poolSize / 2} Duell-Paare)`}</p>
      <div class="setting">
        <div><strong>📈 Steigend</strong><div class="muted small">Es wird von Runde zu Runde schwerer</div></div>
        ${sw('rising', setup.rising)}
      </div>
      <div class="setting">
        <div><strong>💎 Schwer zählt mehr</strong><div class="muted small">Leicht 1 · Mittel 2 · Schwer 3 Punkte</div></div>
        ${sw('diffPoints', setup.diffPoints)}
      </div>
    </section>

    ${isK ? `
    <section class="card">
      <button class="row-between collapse" data-a="cats">
        <h3>🏷️ Kategorien</h3>
        <span class="muted small">${catLabel} · ${poolSize} Fragen ${catsOpen ? '▲' : '▼'}</span>
      </button>
      ${catsOpen ? `
      <div class="cats">
        <button class="catchip ${!setup.cats.length ? 'on' : ''}" data-a="cat" data-v="*">✨ Alle</button>
        ${CATEGORIES.map(c => `<button class="catchip ${setup.cats.includes(c) ? 'on' : ''}" data-a="cat" data-v="${esc(c)}">${CAT_ICONS[c]} ${esc(c)}</button>`).join('')}
      </div>` : ''}
    </section>` : ''}

    <section class="card">
      <h3>⚙️ Spielregeln</h3>
      <div class="setting">
        <div><strong>⏱️ Antwort-Timer</strong><div class="muted small">Countdown pro Frage</div></div>
        <div class="seg">${TIMERS.map(v => `<button class="${setup.timer === v ? 'on' : ''}" data-a="timer" data-v="${v}">${v ? v + 's' : 'Aus'}</button>`).join('')}</div>
      </div>
      <div class="setting">
        <div><strong>🃏 Joker pro Spieler</strong><div class="muted small">Frage tauschen, ohne Punktverlust</div></div>
        <div class="stepper"><button data-a="jk" data-v="-1">−</button><span>${setup.jokers}</span><button data-a="jk" data-v="1">＋</button></div>
      </div>
      <div class="setting">
        <div><strong>🔥 Serien-Bonus</strong><div class="muted small">Alle 3 richtigen am Stück +1</div></div>
        ${sw('streakBonus', setup.streakBonus)}
      </div>
      ${isK ? `<div class="setting">
        <div><strong>🫳 Klauen</strong><div class="muted small">Falsch? Wer es wusste, schnappt sich den Punkt</div></div>
        ${sw('steal', setup.steal)}
      </div>` : ''}
      <div class="setting">
        <div><strong>🎉 Finale</strong><div class="muted small">Letzte Runde zählt doppelt</div></div>
        ${sw('finale', setup.finale)}
      </div>
      <div class="setting">
        <div><strong>🔊 Sounds</strong></div>
        ${sw('sound', setup.sound)}
      </div>
    </section>

    <div class="sticky-bottom">
      <button class="btn primary big" data-a="start" ${n ? '' : 'disabled'}>🚀 Spiel starten${n ? ` · ${total} Fragen` : ''}</button>
    </div>
  </div>`;
}
function sw(key, on) { return `<button class="switch ${on ? 'on' : ''}" data-a="toggle" data-v="${key}" aria-label="${key}"><span></span></button>`; }

function scoreStrip() {
  const t = curTurn();
  return `<button class="strip" data-a="sheet">${game.players.map((p, i) => `
    <span class="chip ${t && t.p === i ? 'active' : ''}" style="--pc:${p.color}">${p.emoji}<b>${p.score}</b></span>`).join('')}
    <span class="chip more">⋯</span></button>`;
}

function renderPlay() {
  const t = curTurn();
  const p = game.players[t.p];
  const q = QMAP[t.q];
  const isDuel = t.duel !== undefined;
  const pair = isDuel ? PMAP[t.pair] : null;
  const topic = pair && !t.joker ? pair.t : q.c;
  const totalDuels = isDuel ? game.turns.length / 2 : 0;
  const prog = isDuel ? `Duell ${t.duel + 1} / ${totalDuels}` : `Frage ${game.idx + 1} / ${game.turns.length}`;
  const pct = Math.round(game.idx / game.turns.length * 100);
  const fin = isFinal();
  const finBadge = fin ? `<div class="final-badge">🎉 Finale · doppelte Punkte</div>` : '';
  let body = '';

  if (game.phase === 'intro') {
    if (isDuel && t.side === 0) {
      const t1 = game.turns[game.idx + 1], p1 = game.players[t1.p];
      body = `
      <div class="intro duel-intro pop">
        ${finBadge}
        <div class="kicker">⚔️ Duell</div>
        <div class="vs">
          <div>${avatar(p, 'xl')}<strong>${esc(p.name)}</strong></div>
          <span class="vs-badge">VS</span>
          <div>${avatar(p1, 'xl')}<strong>${esc(p1.name)}</strong></div>
        </div>
        <p class="cat-hint">Thema: <strong>${esc(topic)}</strong></p>
        <p class="intro-diff">${diffBadge(pair ? pair.d : q.d)}</p>
        <p class="muted">${esc(p.name)} fängt an</p>
        <button class="btn primary big" data-a="show">Frage zeigen</button>
      </div>`;
    } else {
      body = `
      <div class="intro pop">
        ${finBadge}
        ${avatar(p, 'xxl')}
        <h2 class="turn-name">${esc(p.name)} ist dran!</h2>
        ${isDuel ? `<p class="cat-hint">Gleiches Thema: <strong>${esc(topic)}</strong></p>` : `<p class="muted">Punkte: ${p.score}${p.streak >= 2 ? ` · 🔥 Serie ${p.streak}` : ''}</p>`}
        <p class="intro-diff">${diffBadge(q.d)}${pointsFor() > 1 ? `<span class="muted small">zählt ${pointsFor()} Punkte</span>` : ''}</p>
        <button class="btn primary big" data-a="show">Frage zeigen</button>
      </div>`;
    }
  } else if (game.phase === 'question' || game.phase === 'revealed') {
    const revealed = game.phase === 'revealed';
    body = `
    <div class="qwrap">
      <div class="who">${avatar(p, 'sm')}<strong>${esc(p.name)}</strong>${p.streak >= 2 ? `<span class="pill fire">🔥 ${p.streak}</span>` : ''}${pointsFor() > 1 ? `<span class="pill gold">+${pointsFor()}</span>` : ''}</div>
      ${game.timer && !revealed ? `<div class="timer" id="timer"><div class="tbar"><div id="timerBar"></div></div><span id="timerNum">${game.timer} s</span></div>` : ''}
      <div class="qcard">
        <div class="qmeta"><span class="cat">${CAT_ICONS[q.c] || ''} ${esc(topic)}</span>${diffBadge(q.d)}</div>
        <p class="question">${esc(q.q)}</p>
        ${revealed ? `<div class="answer slide"><span class="muted small">Lösung</span><p>${esc(q.a)}</p></div>` : ''}
      </div>
      ${revealed ? `
        <div class="judge">
          <button class="btn no big" data-a="no">❌ Falsch</button>
          <button class="btn ok big" data-a="ok">✅ Richtig</button>
        </div>` : `
        <button class="btn primary big" data-a="reveal">👀 Lösung zeigen</button>
        ${p.jokers > 0 ? `<button class="btn ghost" data-a="joker">🃏 Joker nutzen (${p.jokers} übrig)</button>` : ''}`}
    </div>`;
  } else if (game.phase === 'steal') {
    const pts = pointsFor();
    body = `
    <div class="intro pop">
      <div class="kicker">🫳 Klau-Chance</div>
      <h2 class="turn-name">Wer wusste es?</h2>
      <p class="muted">Lösung: <strong>${esc(q.a)}</strong></p>
      <div class="steal-grid">
        ${game.players.map((o, i) => i === t.p ? '' : `
          <button class="steal-btn" data-a="steal" data-i="${i}" style="--pc:${o.color}">${avatar(o, 'lg')}<strong>${esc(o.name)}</strong><span class="muted small">+${pts}</span></button>`).join('')}
      </div>
      <button class="btn ghost" data-a="steal" data-i="-1">🙈 Keiner – weiter</button>
    </div>`;
  } else if (game.phase === 'duelResult') {
    const t0 = game.turns[game.idx - 1], p0 = game.players[t0.p];
    const winner = t0.duelBonus ? p0 : t.duelBonus ? p : null;
    const both = t0.res === 'ok' && t.res === 'ok';
    body = `
    <div class="intro pop">
      <div class="kicker">⚔️ Duell-Ergebnis</div>
      <div class="vs">
        <div class="${t0.res === 'ok' ? '' : 'dim'}">${avatar(p0, 'xl')}<strong>${esc(p0.name)}</strong><span class="res">${t0.res === 'ok' ? '✅' : '❌'}</span></div>
        <span class="vs-badge">VS</span>
        <div class="${t.res === 'ok' ? '' : 'dim'}">${avatar(p, 'xl')}<strong>${esc(p.name)}</strong><span class="res">${t.res === 'ok' ? '✅' : '❌'}</span></div>
      </div>
      <h2 class="turn-name">${winner ? `🏆 ${esc(winner.name)} gewinnt! <span class="plus">+1</span>` : both ? '🤝 Beide richtig!' : '😅 Beide daneben!'}</h2>
      <p class="muted">${winner ? 'Extrapunkt für den Duell-Sieg' : 'Unentschieden – kein Extrapunkt'}</p>
      <button class="btn primary big" data-a="nextDuel">Weiter</button>
    </div>`;
  }

  return `
  <div class="screen play ${fin ? 'is-final' : ''}">
    <header class="topbar">
      <button class="icon-btn" data-a="home" aria-label="Startseite">⌂</button>
      <div class="prog"><span>${prog}</span><div class="progress"><div style="width:${pct}%"></div></div></div>
      <button class="icon-btn" data-a="undo" ${game.history.length ? '' : 'disabled'} aria-label="Rückgängig">↩︎</button>
    </header>
    ${scoreStrip()}
    <main class="stage">${body}</main>
  </div>`;
}

function ranking() {
  const ps = game.players.map((p, i) => ({ ...p, i }));
  ps.sort((a, b) => b.score - a.score || b.correct - a.correct || b.best - a.best);
  let place = 0, last = null;
  ps.forEach((p, k) => { if (p.score !== last) { place = k + 1; last = p.score; } p.place = place; });
  return ps;
}

function awards() {
  const ps = game.players;
  const out = [];
  const best = Math.max(...ps.map(p => p.best));
  if (best >= 2) out.push(['🔥', 'Längste Serie', ps.filter(p => p.best === best).map(p => p.name), `${best} am Stück`]);
  const quote = p => p.answered ? p.correct / p.answered : 0;
  const bq = Math.max(...ps.map(quote));
  if (bq > 0) out.push(['🎯', 'Beste Quote', ps.filter(p => quote(p) === bq).map(p => p.name), `${Math.round(bq * 100)} %`]);
  const bs = Math.max(...ps.map(p => p.steals || 0));
  if (bs > 0) out.push(['🫳', 'Meisterdieb', ps.filter(p => p.steals === bs).map(p => p.name), `${bs}× geklaut`]);
  const bd = Math.max(...ps.map(p => p.duelsWon || 0));
  if (game.mode === 'duell' && bd > 0) out.push(['⚔️', 'Duell-König', ps.filter(p => p.duelsWon === bd).map(p => p.name), `${bd} Siege`]);
  return out;
}

function renderEnd() {
  const r = ranking();
  const top = r.slice(0, 3);
  const order = top.length === 3 ? [top[1], top[0], top[2]] : top.length === 2 ? [top[1], top[0]] : top;
  const winners = r.filter(p => p.place === 1);
  const aw = awards();
  return `
  <div class="screen end">
    <div class="logo-wrap">
      <div class="kicker">🎉 Spiel vorbei</div>
      <h1>${winners.length > 1 ? 'Gleichstand!' : `${esc(winners[0].name)} gewinnt!`}</h1>
    </div>
    <div class="podium">
      ${order.map(p => `
        <div class="pod p${p.place}">
          ${p.place === 1 ? '<div class="crown">👑</div>' : ''}
          ${avatar(p, p.place === 1 ? 'xl' : 'lg')}
          <strong>${esc(p.name)}</strong>
          <div class="block"><span>${p.place}</span><b>${p.score} P</b></div>
        </div>`).join('')}
    </div>
    ${aw.length ? `<div class="awards">${aw.map(([ic, title, names, val]) => `
      <div class="award"><span class="aic">${ic}</span><span class="muted small">${title}</span><strong>${esc(names.join(' & '))}</strong><span class="muted small">${val}</span></div>`).join('')}</div>` : ''}
    <section class="card">
      <h3>📊 Auswertung</h3>
      <ul class="results">
        ${r.map(p => `
          <li>
            <span class="place">${p.place}.</span>
            ${avatar(p, 'sm')}
            <span class="pname">${esc(p.name)}</span>
            <span class="stats muted small">✅ ${p.correct}/${p.answered} · 🔥 ${p.best}${game.mode === 'duell' ? ` · ⚔️ ${p.duelsWon}` : ''}</span>
            <strong>${p.score}</strong>
          </li>`).join('')}
      </ul>
    </section>
    <button class="btn primary big" data-a="rematch">🔁 Revanche (gleiche Spieler)</button>
    <button class="btn ghost" data-a="toSetup">✨ Neues Spiel</button>
    ${game.history.length ? `<button class="link" data-a="undo">↩︎ Letzte Bewertung rückgängig</button>` : ''}
  </div>`;
}

/* ---------- Punkte-Sheet ---------- */
function renderSheet() {
  $sheet.innerHTML = `
  <div class="backdrop" data-a="closeSheet"></div>
  <div class="panel">
    <div class="grab"></div>
    <h3>🏅 Punktestand</h3>
    <ul class="results">
      ${ranking().map(p => `
        <li>
          <span class="place">${p.place}.</span>
          ${avatar(p, 'sm')}
          <span class="pname">${esc(p.name)}<span class="muted small"> · 🃏 ${p.jokers}${p.streak >= 2 ? ` · 🔥 ${p.streak}` : ''}</span></span>
          <span class="stepper sm"><button data-a="adj" data-i="${p.i}" data-v="-1">−</button><span>${p.score}</span><button data-a="adj" data-i="${p.i}" data-v="1">＋</button></span>
        </li>`).join('')}
    </ul>
    <p class="muted small">Mit − / ＋ kannst du Punkte von Hand korrigieren.</p>
    <div class="sheet-actions">
      <button class="btn ghost" data-a="undo" ${game.history.length ? '' : 'disabled'}>↩︎ Rückgängig</button>
      <button class="btn ghost danger" data-a="endEarly">🏁 Spiel beenden</button>
    </div>
    <button class="btn primary" data-a="closeSheet">Schließen</button>
  </div>`;
}
function openSheet() { renderSheet(); $sheet.classList.add('open'); }
function closeSheet() { $sheet.classList.remove('open'); }

/* ---------- Toast ---------- */
let toastT;
function toast(msg) {
  $toast.textContent = msg;
  $toast.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => $toast.classList.remove('show'), 2400);
}

/* ---------- Konfetti ---------- */
let confettiRun = 0;
function stopConfetti() {
  confettiRun++;
  const c = document.getElementById('confetti');
  c.getContext('2d').clearRect(0, 0, c.width, c.height);
}
function confetti() {
  const run = ++confettiRun;
  const c = document.getElementById('confetti');
  const ctx = c.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  c.width = innerWidth * dpr; c.height = innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cols = [getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#598099', ...COLORS];
  const parts = Array.from({ length: 140 }, () => ({
    x: Math.random() * innerWidth, y: -20 - Math.random() * innerHeight * 0.6,
    w: 6 + Math.random() * 6, h: 8 + Math.random() * 8,
    vy: 2 + Math.random() * 3, vx: -1.5 + Math.random() * 3,
    r: Math.random() * Math.PI, vr: -0.2 + Math.random() * 0.4,
    col: cols[Math.floor(Math.random() * cols.length)],
  }));
  let frame = 0;
  (function tick() {
    if (run !== confettiRun) return;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    parts.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
      ctx.fillStyle = p.col; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
    });
    if (++frame < 260) requestAnimationFrame(tick); else ctx.clearRect(0, 0, innerWidth, innerHeight);
  })();
}

/* ============ EVENTS ============ */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]');
  if (!el || el.disabled) return;
  const a = el.dataset.a, i = +el.dataset.i, v = el.dataset.v;
  switch (a) {
    case 'home': view = 'home'; render(); break;
    case 'resume': view = 'play'; render(); break;
    case 'toSetup': view = 'setup'; render(); break;
    case 'resetPool':
      if (confirm('Alle Fragen wieder als „ungespielt“ markieren?')) { save(LS.used, {}); render(); toast('Fragen-Pool zurückgesetzt'); }
      break;
    case 'emoji': cycleEmoji(i); break;
    case 'up': movePlayer(i, -1); break;
    case 'down': movePlayer(i, 1); break;
    case 'del': players.splice(i, 1); saveSetup(); render(); break;
    case 'shufflePlayers': players = shuffle(players); saveSetup(); render(); break;
    case 'mode': setup.mode = v; saveSetup(); render(); break;
    case 'ppSet': setup.perPlayer = +v; saveSetup(); render(); break;
    case 'pp': setup.perPlayer = Math.min(50, Math.max(1, setup.perPlayer + +v)); saveSetup(); render(); break;
    case 'jk': setup.jokers = Math.min(5, Math.max(0, setup.jokers + +v)); saveSetup(); render(); break;
    case 'timer': setup.timer = +v; saveSetup(); render(); break;
    case 'toggle': setup[v] = !setup[v]; saveSetup(); render(); if (v === 'sound' && setup.sound) sfx.ok(); break;
    case 'cats': catsOpen = !catsOpen; render(); break;
    case 'cat': toggleCat(v); break;
    case 'diff': toggleDiff(v); break;
    case 'start':
      if (game && !game.finished && !confirm('Das laufende Spiel wird überschrieben. Neues Spiel starten?')) return;
      newGame(); break;
    case 'show': showQuestion(); break;
    case 'reveal': reveal(); break;
    case 'joker': useJoker(); break;
    case 'ok': judge(true); break;
    case 'no': judge(false); break;
    case 'steal': steal(i); break;
    case 'nextDuel': nextAfterDuel(); break;
    case 'undo': undo(); break;
    case 'sheet': openSheet(); break;
    case 'closeSheet': closeSheet(); break;
    case 'adj': adjustScore(i, +v); break;
    case 'endEarly': endEarly(); break;
    case 'rematch':
      players = game.players.map(({ id, name, emoji, color }) => ({ id, name, emoji, color }));
      Object.assign(setup, {
        mode: game.mode, perPlayer: game.perPlayer, jokers: game.jokersStart, streakBonus: game.streakBonus,
        cats: game.cats || [], diffs: game.diffs || [], diffPoints: !!game.diffPoints, rising: game.rising ?? setup.rising, timer: game.timer || 0, finale: !!game.finale, steal: game.steal ?? setup.steal,
      });
      saveSetup(); newGame(); break;
  }
});
document.addEventListener('submit', e => {
  if (e.target.dataset.form === 'add') {
    e.preventDefault();
    addPlayer(document.getElementById('newName').value);
  }
});

// Ältere Spielstände (v1) ergänzen
if (game) {
  game.players.forEach(p => { p.steals = p.steals || 0; });
  game.turns.forEach(t => {
    if (t.duel !== undefined && !t.pair) {
      const pr = PAIRS.find(x => x.a === t.q || x.b === t.q);
      if (pr) t.pair = pr.id;
    }
  });
}

render();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
