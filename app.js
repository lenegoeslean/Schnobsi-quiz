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
const COLORS = ['#ff8fab','#7cc6fe','#7ddc8a','#ffc94d','#b79cff','#ff9f68','#4fd6c4','#f39be8','#8fa8ff','#ffb48a','#a8d672','#ff8a8a'];

const QMAP = Object.fromEntries(QUESTIONS.map(q => [q.id, q]));
const PMAP = Object.fromEntries(PAIRS.map(p => [p.id, p]));

function load(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function buzz(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} }

let game = load(LS.game, null);
let players = load(LS.players, []);
let setup = Object.assign({ mode: 'klassik', perPlayer: 5, streakBonus: true, jokers: 1 }, load(LS.settings, {}));
let view = 'home';
let lastView = null;

function saveGame() { save(LS.game, game); }
function saveSetup() { save(LS.players, players); save(LS.settings, setup); }

/* ---------- Fragen ziehen (ohne Wiederholung über mehrere Spiele) ---------- */
function getUsed() { const u = load(LS.used, {}); return { klassik: u.klassik || [], duell: u.duell || [] }; }
function pick(pool, count, exclude = []) {
  const used = getUsed();
  const all = (pool === 'duell' ? PAIRS : QUESTIONS).map(x => x.id);
  let avail = all.filter(id => !used[pool].includes(id) && !exclude.includes(id));
  if (avail.length < count) { used[pool] = []; avail = all.filter(id => !exclude.includes(id)); }
  const out = []; let bag = shuffle(avail);
  while (out.length < count) { if (!bag.length) bag = shuffle(all); out.push(bag.shift()); }
  used[pool] = [...new Set([...used[pool], ...out])];
  save(LS.used, used);
  return out;
}
function unplayed(pool) {
  const used = getUsed()[pool];
  const all = pool === 'duell' ? PAIRS : QUESTIONS;
  return all.filter(x => !used.includes(x.id)).length;
}

/* ---------- Spiel anlegen ---------- */
function newGame() {
  const ps = players.map(p => ({ ...p, score: 0, correct: 0, answered: 0, streak: 0, best: 0, jokers: setup.jokers, duelsWon: 0 }));
  const n = ps.length;
  const turns = [];
  if (setup.mode === 'klassik') {
    const qs = pick('klassik', n * setup.perPlayer);
    for (let r = 0; r < setup.perPlayer; r++)
      for (let i = 0; i < n; i++) turns.push({ p: i, q: qs[r * n + i], res: null });
  } else {
    const D = Math.ceil((n * setup.perPlayer) / 2);
    const pairs = pick('duell', D);
    for (let k = 0; k < D; k++) {
      const pr = PMAP[pairs[k]];
      const sw = Math.random() < 0.5;
      const a = (2 * k) % n, b = (2 * k + 1) % n;
      turns.push({ p: a, q: sw ? pr.b : pr.a, res: null, duel: k, side: 0 });
      turns.push({ p: b, q: sw ? pr.a : pr.b, res: null, duel: k, side: 1 });
    }
  }
  game = {
    mode: setup.mode, streakBonus: setup.streakBonus, perPlayer: setup.perPlayer, jokersStart: setup.jokers,
    players: ps, turns, idx: 0, phase: 'intro', history: [], finished: false, started: Date.now(),
  };
  saveGame();
  view = 'play';
  render();
}

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
  saveGame();
  view = 'play';
  closeSheet();
  render();
  toast('↩️ Rückgängig gemacht');
}

/* ---------- Spielzüge ---------- */
const curTurn = () => game.turns[game.idx];

function reveal() { game.phase = 'revealed'; saveGame(); render(); }
function showQuestion() { game.phase = 'question'; saveGame(); render(); }

function useJoker() {
  const t = curTurn(), p = game.players[t.p];
  if (p.jokers <= 0 || game.phase !== 'question') return;
  snapshot();
  const inGame = game.turns.map(x => x.q);
  const [nq] = pick('klassik', 1, inGame);
  t.q = nq; t.joker = true; p.jokers--;
  saveGame(); render();
  toast('🃏 Joker! Neue Frage für ' + p.name);
}

function judge(ok) {
  snapshot();
  const t = curTurn(), p = game.players[t.p];
  t.res = ok ? 'ok' : 'no';
  p.answered++;
  let msg = null;
  if (ok) {
    p.score++; p.correct++; p.streak++; p.best = Math.max(p.best, p.streak);
    if (game.streakBonus && p.streak % 3 === 0) { p.score++; t.bonus = 1; msg = `🔥 ${p.name}: ${p.streak}er-Serie! +1 Bonus`; }
    buzz(30);
  } else {
    p.streak = 0; buzz([20, 60, 20]);
  }
  if (t.duel !== undefined && t.side === 1) {
    const t0 = game.turns[game.idx - 1];
    const p0 = game.players[t0.p];
    if (t0.res === 'ok' && t.res !== 'ok') { p0.score++; p0.duelsWon++; t0.duelBonus = 1; }
    else if (t.res === 'ok' && t0.res !== 'ok') { p.score++; p.duelsWon++; t.duelBonus = 1; }
    game.phase = 'duelResult';
  } else {
    advance();
  }
  saveGame(); render();
  if (msg) toast(msg);
}

function advance() {
  game.idx++;
  game.phase = 'intro';
  if (game.idx >= game.turns.length) { game.finished = true; view = 'end'; }
}
function nextAfterDuel() { snapshot(); advance(); saveGame(); render(); }

function adjustScore(i, d) { snapshot(); game.players[i].score += d; saveGame(); renderSheet(); render(); }
function endEarly() {
  if (!confirm('Spiel jetzt beenden und Ergebnis zeigen?')) return;
  snapshot(); game.finished = true; view = 'end'; saveGame(); closeSheet(); render();
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

/* ============ RENDER ============ */
function avatar(p, size = '') {
  return `<span class="avatar ${size}" style="--pc:${p.color}">${p.emoji}</span>`;
}

function render() {
  if (view === 'play' && (!game || game.finished)) view = game && game.finished ? 'end' : 'home';
  const fn = { home: renderHome, setup: renderSetup, play: renderPlay, end: renderEnd }[view];
  $app.innerHTML = fn();
  $app.dataset.view = view;
  if (view === 'end' && lastView !== 'end') confetti();
  else if (view !== 'end') stopConfetti();
  lastView = view;
  window.scrollTo(0, 0);
}

function renderHome() {
  const running = game && !game.finished;
  const t = running ? game.turns.length : 0;
  return `
  <div class="screen home">
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
      <div class="row-between"><span>🎯 Klassik-Fragen ungespielt</span><strong>${unplayed('klassik')} / ${QUESTIONS.length}</strong></div>
      <div class="row-between"><span>⚔️ Duell-Paare ungespielt</span><strong>${unplayed('duell')} / ${PAIRS.length}</strong></div>
      <button class="link" data-a="resetPool">Gespielte Fragen zurücksetzen</button>
    </div>
  </div>`;
}

function renderSetup() {
  const n = players.length;
  const duelOk = n >= 2;
  if (!duelOk && setup.mode === 'duell') setup.mode = 'klassik';
  const total = setup.mode === 'klassik' ? n * setup.perPlayer : Math.ceil(n * setup.perPlayer / 2) * 2;
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
        <button class="mode ${setup.mode === 'klassik' ? 'on' : ''}" data-a="mode" data-v="klassik">
          <span class="mi">🎯</span><strong>Klassik</strong><span class="muted small">Jeder bekommt reihum eine eigene Frage</span>
        </button>
        <button class="mode ${setup.mode === 'duell' ? 'on' : ''}" data-a="mode" data-v="duell" ${duelOk ? '' : 'disabled'}>
          <span class="mi">⚔️</span><strong>Duell</strong><span class="muted small">${duelOk ? 'Zwei Spieler, zwei vergleichbare Fragen. Nur einer richtig = +1 Extrapunkt' : 'Ab 2 Spielern'}</span>
        </button>
      </div>
    </section>

    <section class="card">
      <h3>⚙️ Einstellungen</h3>
      <div class="setting">
        <div><strong>Fragen pro Spieler</strong></div>
        <div class="stepper"><button data-a="pp" data-v="-1">−</button><span>${setup.perPlayer}</span><button data-a="pp" data-v="1">＋</button></div>
      </div>
      <div class="setting">
        <div><strong>🃏 Joker pro Spieler</strong><div class="muted small">Frage tauschen, ohne Punktverlust</div></div>
        <div class="stepper"><button data-a="jk" data-v="-1">−</button><span>${setup.jokers}</span><button data-a="jk" data-v="1">＋</button></div>
      </div>
      <div class="setting">
        <div><strong>🔥 Serien-Bonus</strong><div class="muted small">Alle 3 richtigen Antworten am Stück +1</div></div>
        <button class="switch ${setup.streakBonus ? 'on' : ''}" data-a="streak" aria-label="Serien-Bonus"><span></span></button>
      </div>
    </section>

    <div class="sticky-bottom">
      <button class="btn primary big" data-a="start" ${n ? '' : 'disabled'}>🚀 Spiel starten${n ? ` · ${total} Fragen` : ''}</button>
    </div>
  </div>`;
}

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
  const totalDuels = isDuel ? game.turns.length / 2 : 0;
  const prog = isDuel ? `Duell ${t.duel + 1} / ${totalDuels}` : `Frage ${game.idx + 1} / ${game.turns.length}`;
  const pct = Math.round(game.idx / game.turns.length * 100);
  let body = '';

  if (game.phase === 'intro') {
    if (isDuel && t.side === 0) {
      const t1 = game.turns[game.idx + 1], p1 = game.players[t1.p];
      body = `
      <div class="intro duel-intro pop">
        <div class="kicker">⚔️ Duell</div>
        <div class="vs">
          <div>${avatar(p, 'xl')}<strong>${esc(p.name)}</strong></div>
          <span class="vs-badge">VS</span>
          <div>${avatar(p1, 'xl')}<strong>${esc(p1.name)}</strong></div>
        </div>
        <p class="cat-hint">Thema: <strong>${esc(q.c)}</strong></p>
        <p class="muted">${esc(p.name)} fängt an</p>
        <button class="btn primary big" data-a="show">Frage zeigen</button>
      </div>`;
    } else {
      body = `
      <div class="intro pop">
        ${avatar(p, 'xxl')}
        <h2 class="turn-name">${esc(p.name)} ist dran!</h2>
        ${isDuel ? `<p class="cat-hint">Gleiches Thema: <strong>${esc(q.c)}</strong></p>` : `<p class="muted">Punkte: ${p.score}${p.streak >= 2 ? ` · 🔥 Serie ${p.streak}` : ''}</p>`}
        <button class="btn primary big" data-a="show">Frage zeigen</button>
      </div>`;
    }
  } else if (game.phase === 'question' || game.phase === 'revealed') {
    const revealed = game.phase === 'revealed';
    body = `
    <div class="qwrap">
      <div class="who">${avatar(p, 'sm')}<strong>${esc(p.name)}</strong>${p.streak >= 2 ? `<span class="pill fire">🔥 ${p.streak}</span>` : ''}</div>
      <div class="qcard ${revealed ? 'flipped' : ''}">
        <span class="cat">${esc(q.c)}</span>
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
  <div class="screen play">
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
  // Platzierung mit Gleichstand
  let place = 0, last = null;
  ps.forEach((p, k) => { if (p.score !== last) { place = k + 1; last = p.score; } p.place = place; });
  return ps;
}

function renderEnd() {
  const r = ranking();
  const top = r.slice(0, 3);
  const order = top.length === 3 ? [top[1], top[0], top[2]] : top.length === 2 ? [top[1], top[0]] : top;
  const winners = r.filter(p => p.place === 1);
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
  ctx.scale(dpr, dpr);
  const parts = Array.from({ length: 140 }, () => ({
    x: Math.random() * innerWidth, y: -20 - Math.random() * innerHeight * 0.6,
    w: 6 + Math.random() * 6, h: 8 + Math.random() * 8,
    vy: 2 + Math.random() * 3, vx: -1.5 + Math.random() * 3,
    r: Math.random() * Math.PI, vr: -0.2 + Math.random() * 0.4,
    col: COLORS[Math.floor(Math.random() * COLORS.length)],
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
    case 'pp': setup.perPlayer = Math.min(20, Math.max(1, setup.perPlayer + +v)); saveSetup(); render(); break;
    case 'jk': setup.jokers = Math.min(5, Math.max(0, setup.jokers + +v)); saveSetup(); render(); break;
    case 'streak': setup.streakBonus = !setup.streakBonus; saveSetup(); render(); break;
    case 'start':
      if (game && !game.finished && !confirm('Das laufende Spiel wird überschrieben. Neues Spiel starten?')) return;
      newGame(); break;
    case 'show': showQuestion(); break;
    case 'reveal': reveal(); break;
    case 'joker': useJoker(); break;
    case 'ok': judge(true); break;
    case 'no': judge(false); break;
    case 'nextDuel': nextAfterDuel(); break;
    case 'undo': undo(); break;
    case 'sheet': openSheet(); break;
    case 'closeSheet': closeSheet(); break;
    case 'adj': adjustScore(i, +v); break;
    case 'endEarly': endEarly(); break;
    case 'rematch':
      players = game.players.map(({ id, name, emoji, color }) => ({ id, name, emoji, color }));
      setup.mode = game.mode; setup.perPlayer = game.perPlayer; setup.jokers = game.jokersStart; setup.streakBonus = game.streakBonus;
      saveSetup(); newGame(); break;
  }
});
document.addEventListener('submit', e => {
  if (e.target.dataset.form === 'add') {
    e.preventDefault();
    addPlayer(document.getElementById('newName').value);
  }
});

render();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
