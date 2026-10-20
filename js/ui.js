'use strict';

// ---------- Texto y paneles en canvas ----------
// La fuente pixelada no trae mayúsculas acentuadas: se dibujan sin tilde
const plainCache = new Map();
function plain(str) {
  let v = plainCache.get(str);
  if (v === undefined) {
    v = str.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[¡¿]/g, '');
    if (plainCache.size > 500) plainCache.clear();
    plainCache.set(str, v);
  }
  return v;
}

function drawText(c, str, x, y, size, color, align = 'left', alpha = 1) {
  str = plain(str);
  c.font = size + 'px ' + FONT;
  c.textAlign = align;
  c.textBaseline = 'top';
  c.globalAlpha = alpha;
  c.fillStyle = '#000000';
  c.fillText(str, x + 1, y + 1);
  c.fillStyle = color;
  c.fillText(str, x, y);
  c.globalAlpha = 1;
}

function panel(c, x, y, w, h) {
  c.fillStyle = 'rgba(12,10,28,0.78)';
  c.fillRect(x, y, w, h);
  c.strokeStyle = '#3a3560';
  c.lineWidth = 1;
  c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

// ---------- Tabla de récords (localStorage) ----------
const LB_KEY = 'pixeldungeon_top10';

function loadScores() {
  try { return JSON.parse(localStorage.getItem(LB_KEY)) || []; } catch (e) { return []; }
}
function saveScore(entry) {
  const list = loadScores();
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  const top = list.slice(0, 10);
  try { localStorage.setItem(LB_KEY, JSON.stringify(top)); } catch (e) { /* sin almacenamiento */ }
  return top.indexOf(entry);
}
function bestScore() {
  const l = loadScores();
  return l.length ? l[0].score : 0;
}

// ---------- HUD ----------
function drawHUD(c) {
  const p = G.player;

  // Vidas y escudo
  panel(c, 6, 6, 80, 66);
  for (let i = 0; i < p.maxLives; i++) {
    c.drawImage(i < p.lives ? SPR.heart : SPR.heartEmpty, 12 + i * 22, 11, 18, 16);
  }
  for (let i = 0; i < p.maxShield; i++) {
    c.drawImage(i < p.shield ? SPR.shield : SPR.shieldEmpty, 12 + i * 12, 33);
  }
  if (p.shield < p.maxShield && p.sinceHit > 3.5) {
    c.fillStyle = 'rgba(90,184,255,0.7)';
    c.fillRect(12 + p.shield * 12, 43, 9 * p.regenT, 1);
  }
  // Barra de FURIA
  const ready = p.ult >= 1, active = p.ultT > 0;
  const blink = Math.floor(G.time * 4) % 2 === 0;
  let label = 'FURIA', col = '#9a93b8', fill = p.ult;
  if (active) { label = 'FURIA ' + Math.ceil(p.ultT); col = '#ff5a3c'; fill = p.ultT / ULT_TIME; }
  else if (ready) { label = 'R: FURIA'; col = blink ? '#ff5a3c' : '#ffb547'; }
  drawText(c, label, 12, 48, 8, col);
  c.fillStyle = '#1a1c2c'; c.fillRect(12, 59, 68, 7);
  c.fillStyle = active ? '#ff5a3c' : ready ? (blink ? '#ff5a3c' : '#ffb547') : '#b84a2e';
  c.fillRect(13, 60, 66 * clamp(fill, 0, 1), 5);
  c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(13, 60, 66 * clamp(fill, 0, 1), 1);

  // Puntuación y combo
  const cx = VIEW_W / 2;
  drawText(c, String(G.score).padStart(7, '0'), cx, 8, 16, '#ffb547', 'center');
  if (G.combo.count > 0) {
    const m = comboMult();
    drawText(c, 'COMBO ' + G.combo.count + '  x' + m.toFixed(2), cx, 29, 8, m > 1 ? '#ff7de9' : '#f2dfb4', 'center');
    c.fillStyle = '#1a1c2c'; c.fillRect(cx - 40, 40, 80, 3);
    c.fillStyle = m > 1 ? '#ff7de9' : '#f2dfb4';
    c.fillRect(cx - 40, 40, 80 * clamp(G.combo.timer / COMBO_WINDOW, 0, 1), 3);
  } else {
    drawText(c, 'PUNTOS', cx, 29, 8, '#9a93b8', 'center');
  }

  // Minimapa y récord
  const mm = drawMinimap(c);
  const best = Math.max(bestScore(), 0);
  drawText(c, 'RÉCORD ' + best, VIEW_W - 6, mm + 6, 8, G.score > best && best > 0 ? '#38b764' : '#9a93b8', 'right');

  // Piso, monedas
  panel(c, 6, VIEW_H - 36, 150, 30);
  drawText(c, 'PISO ' + G.floor + '/3', 12, VIEW_H - 31, 8, '#f2dfb4');
  drawText(c, 'x' + floorMult(), 92, VIEW_H - 31, 8, '#ffb547');
  c.drawImage(SPR.coin, 12, VIEW_H - 19);
  drawText(c, String(p.coins), 22, VIEW_H - 19, 8, '#ffcd75');
  drawText(c, 'SEM ' + G.seedText, 150, VIEW_H - 19, 8, '#6c6590', 'right');

  // Arma
  const it = p.item, w = p.weapon, rr = RARITY[it.rar];
  panel(c, VIEW_W - 166, VIEW_H - 46, 160, 40);
  c.strokeStyle = rr.color; c.globalAlpha = 0.6;
  c.strokeRect(VIEW_W - 165.5, VIEW_H - 45.5, 158, 38);
  c.globalAlpha = 1;
  const img = SPR[w.spr];
  c.drawImage(img, VIEW_W - 160, VIEW_H - 30 - img.height, img.width * 2, img.height * 2);
  drawText(c, w.name, VIEW_W - 12, VIEW_H - 41, 8, '#f2dfb4', 'right');
  drawText(c, rarityName(it) + ' x' + rr.mult, VIEW_W - 12, VIEW_H - 30, 8, rr.color, 'right');
  if (p.weapons.length > 1) {
    const o = p.weapons[(p.cur + 1) % 2];
    drawText(c, 'Q ' + WEAPONS[o.id].name, VIEW_W - 12, VIEW_H - 19, 8, RARITY[o.rar].color, 'right', 0.55);
  }

  // Indicador de interacción
  if (G.interact) {
    const it = G.interact;
    const label = plain(interactLabel(it));
    const sx = it.x - G.cam.x, sy = it.y - G.cam.y - 22;
    c.font = '8px ' + FONT;
    const tw = c.measureText(label).width;
    c.fillStyle = 'rgba(12,10,28,0.85)';
    c.fillRect(Math.round(sx - tw / 2 - 4), Math.round(sy - 3), Math.round(tw + 8), 14);
    drawText(c, label, Math.round(sx), Math.round(sy), 8, '#ffb547', 'center');
  }

  // Barra del jefe
  if (G.boss && !G.boss.dead) {
    const b = G.boss, bw = 290, bx = (VIEW_W - bw) / 2, by = VIEW_H - 22;
    drawText(c, b.name, VIEW_W / 2, by - 13, 8, '#ff7a85', 'center');
    c.fillStyle = '#1a1c2c'; c.fillRect(bx - 2, by - 2, bw + 4, 10);
    c.fillStyle = '#5d1a26'; c.fillRect(bx, by, bw, 6);
    c.fillStyle = b.phase2 ? '#ff3b5c' : '#e43b44';
    c.fillRect(bx, by, bw * Math.max(0, b.hp) / b.maxHp, 6);
    c.fillStyle = 'rgba(255,255,255,0.3)'; c.fillRect(bx, by, bw * Math.max(0, b.hp) / b.maxHp, 2);
    c.fillStyle = '#1a1c2c'; c.fillRect(bx + bw / 2, by, 1, 6);
  }

  // Banner central
  if (G.banner) {
    const bn = G.banner;
    const a = Math.min(1, bn.t / 0.3, (bn.max - bn.t) / 0.2 + 0.0001);
    drawText(c, bn.text, VIEW_W / 2, VIEW_H * 0.26, 16, bn.color, 'center', clamp(a, 0, 1));
    if (bn.sub) drawText(c, bn.sub, VIEW_W / 2, VIEW_H * 0.26 + 22, 8, '#f2dfb4', 'center', clamp(a, 0, 1));
  }

  if (Sfx.muted) drawText(c, 'SIN SONIDO', 6, 78, 8, '#6c6590');

  // Mira
  if (G.state === 'play') {
    const mx = Math.round(Input.mouse.x), my = Math.round(Input.mouse.y);
    c.fillStyle = '#1a1c2c';
    c.fillRect(mx - 7, my - 1, 5, 3); c.fillRect(mx + 3, my - 1, 5, 3);
    c.fillRect(mx - 1, my - 7, 3, 5); c.fillRect(mx - 1, my + 3, 3, 5);
    c.fillStyle = '#ffffff';
    c.fillRect(mx - 6, my, 4, 1); c.fillRect(mx + 3, my, 4, 1);
    c.fillRect(mx, my - 6, 1, 4); c.fillRect(mx, my + 3, 1, 4);
    c.fillStyle = '#ff3b5c'; c.fillRect(mx, my, 1, 1);
  }
}

function interactLabel(it) {
  if (it.kind === 'weapon') return '[E] ' + weaponLabel(it.weapon);
  if (it.kind === 'chest') return '[E] ABRIR COFRE';
  if (it.kind === 'shop') return '[E] ' + it.offer.label + ' - ' + it.offer.price;
  return '[E]';
}

function drawMinimap(c) {
  const rooms = G.dungeon.rooms;
  let minX = 99, minY = 99, maxX = -1, maxY = -1;
  for (const r of rooms) {
    minX = Math.min(minX, r.gx); maxX = Math.max(maxX, r.gx);
    minY = Math.min(minY, r.gy); maxY = Math.max(maxY, r.gy);
  }
  const sx = 13, sy = 10;
  const w = (maxX - minX + 1) * sx + 7, h = (maxY - minY + 1) * sy + 7;
  const x0 = VIEW_W - 6 - w, y0 = 6;
  panel(c, x0, y0, w, h);
  const pos = r => [x0 + 4 + (r.gx - minX) * sx, y0 + 4 + (r.gy - minY) * sy];
  const known = r => r.visited || r.links.some(l => l.visited);

  c.fillStyle = '#4a4470';
  for (const r of rooms) {
    if (!r.visited) continue;
    const [ax, ay] = pos(r);
    for (const l of r.links) {
      const [bx, by] = pos(l);
      if (ax === bx) c.fillRect(ax + 4, Math.min(ay, by) + 3, 2, Math.abs(by - ay));
      else c.fillRect(Math.min(ax, bx) + 4, ay + 3, Math.abs(bx - ax), 2);
    }
  }
  for (const r of rooms) {
    if (!known(r)) continue;
    const [x, y] = pos(r);
    let col = r.visited ? '#7a72a8' : '#2e2a4a';
    if (r === G.currentRoom) col = '#f2dfb4';
    c.fillStyle = col;
    c.fillRect(x, y, 10, 7);
    let icon = null;
    if (r.type === 'boss') icon = '#e43b44';
    if (r.type === 'shop') icon = '#ffcd75';
    if (r.type === 'chest') icon = '#c4661f';
    if (r.type === 'normal' && r.visited && !r.cleared) icon = '#ff7de9';
    if (icon) { c.fillStyle = icon; c.fillRect(x + 3, y + 2, 4, 3); }
  }
  return y0 + h;
}

// ---------- Pantalla completa ----------
function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}
// En Chrome/Edge se bloquea Esc: una pulsación corta pausa el juego y solo
// mantener Esc ~2 s sale de pantalla completa (límite de seguridad del navegador).
function lockEscape() {
  try {
    if (navigator.keyboard && navigator.keyboard.lock) navigator.keyboard.lock(['Escape']).catch(() => {});
  } catch (e) { /* sin soporte */ }
}
function unlockEscape() {
  try { if (navigator.keyboard && navigator.keyboard.unlock) navigator.keyboard.unlock(); } catch (e) { /* sin soporte */ }
}
function toggleFullscreen() {
  const el = document.documentElement;
  try {
    if (isFullscreen()) {
      unlockEscape();
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } else {
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req) {
        const r = req.call(el);
        if (r && r.then) r.then(lockEscape, () => {});
        else lockEscape();
      }
    }
  } catch (e) { /* el navegador no lo permite */ }
}
function updateFullscreenButtons() {
  const label = isFullscreen() ? 'Salir de pantalla completa (F)' : 'Pantalla completa (F)';
  document.querySelectorAll('.btnFull').forEach(b => { b.textContent = label; });
}

// ---------- Pantallas HTML ----------
const UI = {
  init() {
    this.menu = document.getElementById('menu');
    this.over = document.getElementById('over');
    this.inName = document.getElementById('inName');
    this.inSeed = document.getElementById('inSeed');
    try { this.inName.value = localStorage.getItem('pd_name') || ''; } catch (e) { /* nada */ }

    const play = () => {
      const name = this.inName.value.trim() || 'JUGADOR';
      try { localStorage.setItem('pd_name', name); } catch (e) { /* nada */ }
      startRun(name, this.inSeed.value);
    };
    document.getElementById('btnPlay').addEventListener('click', play);
    for (const el of [this.inName, this.inSeed]) {
      el.addEventListener('keydown', e => { if (e.key === 'Enter') play(); });
    }
    document.getElementById('btnRetry').addEventListener('click', () => startRun(G.name, G.seedText));
    document.getElementById('btnNew').addEventListener('click', () => startRun(G.name, ''));
    document.getElementById('btnMenu').addEventListener('click', () => this.showMenu());
    document.querySelectorAll('.btnFull').forEach(b => b.addEventListener('click', toggleFullscreen));
    document.addEventListener('fullscreenchange', () => { if (!isFullscreen()) unlockEscape(); updateFullscreenButtons(); });
    this.pause = document.getElementById('pause');
    this.btnMute = document.getElementById('btnMute');
    document.getElementById('btnResume').addEventListener('click', () => setPaused(false));
    document.getElementById('btnQuit').addEventListener('click', () => endRun(false));
    this.btnMute.addEventListener('click', () => { Sfx.toggleMute(); this.updateMute(); });
    document.addEventListener('webkitfullscreenchange', updateFullscreenButtons);
    this.renderBoard('boardMenu', -1);
  },

  updateMute() {
    this.btnMute.textContent = Sfx.muted ? 'Activar sonido (M)' : 'Silenciar (M)';
  },

  showPause() {
    this.updateMute();
    updateFullscreenButtons();
    this.pause.classList.remove('hidden');
    canvas.style.cursor = 'default';
  },

  hidePause() {
    this.pause.classList.add('hidden');
    if (document.activeElement) document.activeElement.blur();
    if (G.state === 'play') canvas.style.cursor = 'none';
  },

  hideAll() {
    this.menu.classList.add('hidden');
    this.over.classList.add('hidden');
    canvas.style.cursor = 'none';
    if (document.activeElement) document.activeElement.blur();
  },

  showMenu() {
    this.over.classList.add('hidden');
    this.menu.classList.remove('hidden');
    canvas.style.cursor = 'default';
    this.inSeed.value = '';
    this.renderBoard('boardMenu', -1);
    initPreview();
  },

  renderBoard(id, highlight) {
    const t = document.getElementById(id);
    const list = loadScores();
    if (!list.length) {
      t.innerHTML = '<tr><td class="empty">Aún no hay partidas. La primera marca la pones tú.</td></tr>';
      return;
    }
    const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    let html = '<tr><th>#</th><th>Nombre</th><th class="num">Puntos</th><th>Piso</th><th>Semilla</th></tr>';
    list.forEach((e, i) => {
      html += '<tr' + (i === highlight ? ' class="me"' : '') + '><td>' + (i + 1) + '</td><td>' + esc(e.name) +
        '</td><td class="num">' + e.score + '</td><td>' + (e.won ? '★' : e.floor) + '</td><td>' + esc(e.seed) + '</td></tr>';
    });
    t.innerHTML = html;
  },

  showOver(won, entry, rank, s) {
    canvas.style.cursor = 'default';
    const title = document.getElementById('overTitle');
    title.textContent = won ? '¡VICTORIA!' : 'GAME OVER';
    title.classList.toggle('win', won);
    document.getElementById('overSub').textContent = won
      ? entry.name + ' escapó de la mazmorra. Semilla ' + entry.seed + '.'
      : entry.name + ' cayó en el piso ' + entry.floor + '. Semilla ' + entry.seed + '.';
    document.getElementById('newRecord').classList.toggle('hidden', rank !== 0);

    const rows = [
      ['Enemigos derrotados (' + s.kills + ')', '+' + s.killPts],
      ['Combo más largo', String(s.maxCombo)],
      ['Furias usadas', String(s.ults)],
      ['Salas despejadas (' + s.rooms + ')', '+' + s.clearPts],
      ['Salas perfectas (' + s.perfect + ')', '+' + s.perfectPts],
      ['Monedas recogidas', '+' + s.coinPts],
      ['Bono de tiempo contra jefes', '+' + s.timeBonus],
      ['Vidas perdidas (no restan puntos)', String(s.livesLost)],
    ];
    if (won) rows.push(['Vidas restantes', '+' + s.lifeBonus]);
    let html = '';
    for (const [a, b, neg] of rows) html += '<tr' + (neg ? ' class="neg"' : '') + '><td>' + a + '</td><td>' + b + '</td></tr>';
    html += '<tr class="total"><td>TOTAL</td><td>' + entry.score + '</td></tr>';
    document.getElementById('breakdown').innerHTML = html;

    this.renderBoard('boardOver', rank);
    this.over.classList.remove('hidden');
    document.getElementById('btnRetry').focus();
  },
};
