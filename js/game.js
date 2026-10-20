'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const lightCanvas = newCanvas(VIEW_W * RS, VIEW_H * RS);
const lctx = lightCanvas.getContext('2d');

// ---------- Entrada ----------
const Input = {
  keys: {}, hits: {},
  mouse: { x: VIEW_W / 2, y: VIEW_H / 2, wx: 0, wy: 0, down: false },
  down(c) { return !!this.keys[c]; },
  hit(c) { return !!this.hits[c]; },
  endFrame() { this.hits = {}; },
};

window.addEventListener('keydown', e => {
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT') return;
  if (!Input.keys[e.code]) Input.hits[e.code] = true;
  Input.keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && G.state !== 'menu' && G.state !== 'over') e.preventDefault();
});
window.addEventListener('keyup', e => { Input.keys[e.code] = false; });
window.addEventListener('blur', () => {
  Input.keys = {}; Input.mouse.down = false;
  if (G.state === 'play') setPaused(true);
});
canvas.addEventListener('mousedown', e => {
  if (e.button === 0) Input.mouse.down = true;
  if (e.button === 2) Input.hits.Ult = true;
  Sfx.init();
});
window.addEventListener('mouseup', e => { if (e.button === 0) Input.mouse.down = false; });
window.addEventListener('mousemove', e => {
  const r = canvas.getBoundingClientRect();
  Input.mouse.x = (e.clientX - r.left) / r.width * VIEW_W;
  Input.mouse.y = (e.clientY - r.top) / r.height * VIEW_H;
});
canvas.addEventListener('wheel', e => {
  if (G.state === 'play' && G.player) G.player.switchWeapon();
  e.preventDefault();
}, { passive: false });
canvas.addEventListener('contextmenu', e => e.preventDefault());

// ---------- Estado global ----------
const G = {
  state: 'menu', time: 0, floor: 1, seed: 0, seedText: '', name: 'JUGADOR',
  map: null, mapW: 0, mapH: 0, dungeon: null,
  player: null, enemies: [], bullets: [], pickups: [], props: [], particles: [], texts: [], markers: [], effects: [], hazards: [],
  boss: null, activeRoom: null, currentRoom: null, interact: null,
  cam: { x: 0, y: 0 }, shake: 0, flash: 0,
  score: 0, combo: { count: 0, timer: 0 }, stats: null,
  banner: null, endTimer: 0, rng: new RNG(1), transition: null,
};

// ---------- Puntuación ----------
const COMBO_WINDOW = 3.0;
const BOSS_PTS = 1500;
const COIN_PTS = 5;
const LIFE_BONUS = 1000;

// Cada piso vale +0.5x más que el anterior, sin límite
function floorMult() { return 1 + 0.5 * (G.floor - 1); }
function comboMult() { return Math.min(4, 1 + Math.floor(G.combo.count / 3) * 0.25); }

function showBanner(text, sub, color, dur) {
  G.banner = { text, sub, color, t: dur, max: dur };
}

G.onKill = function (e) {
  const before = comboMult();
  const base = e.isBoss ? BOSS_PTS : e.def.pts;
  const pts = Math.round(base * comboMult() * floorMult());
  G.score += pts;
  G.stats.kills++;
  G.stats.killPts += pts;
  addText(e.x, e.y - 16, '+' + pts, '#ffb547', 0.9);
  G.combo.count++;
  G.combo.timer = COMBO_WINDOW;
  G.stats.maxCombo = Math.max(G.stats.maxCombo, G.combo.count);
  if (comboMult() > before) {
    addText(G.player.x, G.player.y - 26, 'COMBO x' + comboMult().toFixed(2), '#ff7de9', 1.1);
    Sfx.play('combo');
  }
};

G.onPlayerHit = function () {
  if (G.combo.count >= 3) addText(G.player.x, G.player.y - 26, 'COMBO A LA MITAD', '#ff7a85', 1);
  G.combo.count = Math.floor(G.combo.count / 2);
  if (G.activeRoom) G.activeRoom.flawless = false;
};

G.onLifeLost = function () {
  G.stats.livesLost++;
  const left = G.player.lives;
  if (left > 0) showBanner('-1 VIDA', left === 1 ? 'Te queda la última' : 'Te quedan ' + left, '#ff3b5c', 1.6);
};

G.playerDied = function () {
  const p = G.player;
  p.dead = true;
  spawnParticles(p.x, p.y, 50, '#c2c3c7', 160, 0.9, 3);
  spawnParticles(p.x, p.y, 30, '#e43b44', 120, 0.9, 2);
  Sfx.play('gameover');
  G.state = 'dying';
  G.endTimer = 2.4;
};

G.onBossKilled = function () {
  const r = G.activeRoom;
  const timeBonus = Math.max(0, Math.round((150 - r.timer) * 8 * floorMult()));
  G.score += timeBonus;
  G.stats.timeBonus += timeBonus;
  for (const e of G.enemies) {
    if (!e.isBoss && !e.dead) { e.dead = true; spawnParticles(e.x, e.y, 8, e.def.color, 80, 0.4, 2); }
  }
  G.markers.length = 0;
  G.hazards.length = 0;
  for (const b of G.bullets) if (b.from === 'e') b.dead = true;
  clearRoom(r);
  G.boss = null;
  showBanner('¡JEFE DERROTADO!', '+' + timeBonus + ' DE BONO POR TIEMPO', '#ffb547', 2.6);
  // La mazmorra no tiene fondo: siempre hay un portal al siguiente piso
  G.props.push({ kind: 'portal', x: (r.cx + 0.5) * TILE, y: (r.cy + 0.5) * TILE, t: 0, delay: 1.5 });
};

// ---------- Salas ----------
function beginRoom(r) {
  G.activeRoom = r;
  r.flawless = true; r.timer = 0; r.wave = 0; r.waveWait = 0;
  lockDoors(r, true);
  Sfx.play('door');
  addShake(3);
  if (r.type === 'boss') {
    r.bossDelay = 1.6;
    showBanner(bossName(G.floor), bossHint(G.floor), '#ff3b5c', 2.2);
    Sfx.play('roar');
  } else {
    spawnWave(r);
  }
}

function spawnWave(r) {
  const p = G.player;
  for (const s of r.waves[r.wave]) {
    let x = s.x, y = s.y;
    if (dist(x, y, p.x, p.y) < 70) {
      x = 2 * (r.cx + 0.5) * TILE - x;
      y = 2 * (r.cy + 0.5) * TILE - y;
    }
    G.markers.push({ type: s.type, x, y, t: 0.8 });
  }
  Sfx.play('spawn');
  if (r.waves.length > 1) addText(p.x, p.y - 28, 'OLEADA ' + (r.wave + 1) + '/' + r.waves.length, '#9ad0ff', 1.2);
}

function updateRooms(dt) {
  const p = G.player;
  if (!p.dead) {
    const any = roomAt(p.x, p.y, 0);
    if (any) { any.visited = true; G.currentRoom = any; }
    const inner = roomAt(p.x, p.y, 1);
    if (inner && !inner.cleared && !G.activeRoom) beginRoom(inner);
  }
  const r = G.activeRoom;
  if (!r) return;
  r.timer += dt;
  if (r.type === 'boss') {
    if (!G.boss && r.bossDelay > 0) {
      r.bossDelay -= dt;
      if (r.bossDelay <= 0) {
        G.boss = createBoss((r.cx + 0.5) * TILE, (r.cy - 2) * TILE);
        G.enemies.push(G.boss);
        spawnParticles(G.boss.x, G.boss.y, 30, G.boss.color, 120, 0.6, 3);
        addShake(6);
      }
    }
    return;
  }
  if (G.enemies.length === 0 && G.markers.length === 0) {
    if (r.wave + 1 < r.waves.length) {
      r.waveWait += dt;
      if (r.waveWait > 0.7) { r.waveWait = 0; r.wave++; spawnWave(r); }
    } else {
      clearRoom(r);
    }
  }
}

function clearRoom(r) {
  r.cleared = true;
  G.activeRoom = null;
  lockDoors(r, false);
  Sfx.play('door');
  G.stats.rooms++;
  const clearPts = Math.round(100 * floorMult());
  G.score += clearPts;
  G.stats.clearPts += clearPts;
  if (r.flawless) {
    const bonus = Math.round((r.type === 'boss' ? 600 : 250) * floorMult());
    G.score += bonus;
    G.stats.perfect++;
    G.stats.perfectPts += bonus;
    showBanner('SALA PERFECTA', '+' + (bonus + clearPts) + ' PUNTOS', '#38b764', 1.6);
    Sfx.play('perfect');
  } else {
    showBanner('SALA DESPEJADA', '+' + clearPts + ' PUNTOS', '#9ad0ff', 1.3);
    Sfx.play('clear');
  }
}

// ---------- Interacción (armas, cofres, tienda) ----------
function findInteractable() {
  const p = G.player;
  let best = null, bd = 22;
  for (const pk of G.pickups) {
    if (pk.kind !== 'weapon') continue;
    const d = dist(p.x, p.y, pk.x, pk.y);
    if (d < bd) { bd = d; best = pk; }
  }
  for (const pr of G.props) {
    if ((pr.kind === 'chest' && !pr.opened) || (pr.kind === 'shop' && !pr.sold)) {
      const d = dist(p.x, p.y, pr.x, pr.y);
      if (d < bd) { bd = d; best = pr; }
    }
  }
  return best;
}

// ¿Ya tienes esta arma con igual o mejor rareza?
function ownsBetter(item) {
  return G.player.weapons.some(w => w.id === item.id && w.rar >= item.rar);
}

function pickupWeapon(item) {
  const p = G.player;
  if (ownsBetter(item)) {
    addText(p.x, p.y - 20, 'YA TIENES UNA IGUAL O MEJOR', '#ff7a85', 1);
    Sfx.play('empty');
    return false;
  }
  const dropOld = old => G.pickups.push({ kind: 'weapon', weapon: old, x: p.x, y: p.y + 8, vx: 0, vy: 0, t: 0 });
  const same = p.weapons.findIndex(w => w.id === item.id);
  if (same >= 0) {
    // Mejora de rareza de un arma que ya llevas
    dropOld(p.weapons[same]);
    p.weapons[same] = item;
    p.cur = same;
  } else if (p.weapons.length < 2) {
    p.weapons.push(item);
    p.cur = p.weapons.length - 1;
  } else {
    dropOld(p.weapons[p.cur]);
    p.weapons[p.cur] = item;
  }
  addText(p.x, p.y - 20, weaponLabel(item), RARITY[item.rar].color, 1.3);
  Sfx.play(item.rar >= 3 ? 'chest' : 'pickup');
  if (item.rar >= 2) spawnParticles(p.x, p.y, 16, RARITY[item.rar].color, 90, 0.5, 2);
  return true;
}

function doInteract(it) {
  const p = G.player;
  if (it.kind === 'weapon') {
    if (pickupWeapon(it.weapon)) it.dead = true;
  } else if (it.kind === 'chest') {
    it.opened = true;
    Sfx.play('chest');
    spawnParticles(it.x, it.y, 20, '#ffcd75', 90, 0.6, 2);
    G.pickups.push({ kind: 'weapon', weapon: it.weapon, x: it.x, y: it.y + 16, vx: 0, vy: 0, t: 0 });
    for (let i = 0; i < 3; i++) dropPickup('coin', it.x, it.y + 4);
  } else if (it.kind === 'shop') {
    const o = it.offer;
    const fail = msg => { addText(it.x, it.y - 22, msg, '#ff7a85', 1); Sfx.play('empty'); };
    if (p.coins < o.price) return fail('TE FALTAN ' + (o.price - p.coins) + ' MONEDAS');
    if (o.kind === 'maxshield' && p.maxShield >= 5) return fail('ESCUDO AL MÁXIMO');
    if (o.kind === 'shield' && p.shield >= p.maxShield) return fail('ESCUDO LLENO');
    if (o.kind === 'weapon' && ownsBetter(o.weapon)) return fail('YA TIENES UNA IGUAL O MEJOR');
    p.coins -= o.price;
    it.sold = true;
    if (o.kind === 'maxshield') { p.maxShield++; p.shield++; }
    if (o.kind === 'shield') p.shield = p.maxShield;
    if (o.kind === 'weapon') pickupWeapon(o.weapon);
    Sfx.play('buy');
    addText(it.x, it.y - 22, 'COMPRADO', '#38b764', 1);
  }
}

// ---------- Flujo de partida ----------
function startRun(name, seedText) {
  Sfx.init();
  G.name = String(name || 'JUGADOR').toUpperCase().slice(0, 10);
  seedText = String(seedText || '').trim().toUpperCase();
  if (!seedText) seedText = String(Math.floor(10000 + Math.random() * 90000));
  G.seedText = seedText;
  G.seed = /^\d+$/.test(seedText) ? (parseInt(seedText, 10) >>> 0) : hashString(seedText);
  G.rng = new RNG(G.seed ^ 0x5bd1e995);
  G.score = 0;
  G.combo = { count: 0, timer: 0 };
  G.stats = {
    kills: 0, killPts: 0, maxCombo: 0, perfect: 0, perfectPts: 0, timeBonus: 0,
    livesLost: 0, lifeBonus: 0, ults: 0, rooms: 0, clearPts: 0, coinPts: 0, deflects: 0,
  };
  G.player = new Player(0, 0);
  G.transition = null;
  loadFloor(1);
  G.state = 'play';
  UI.hideAll();
}

function loadFloor(n) {
  G.floor = n;
  const d = generateDungeon(G.seed, n);
  G.dungeon = d; G.map = d.map; G.mapW = d.w; G.mapH = d.h;
  buildTiles(n);
  G.enemies = []; G.bullets = []; G.pickups = []; G.props = [];
  G.particles = []; G.texts = []; G.markers = []; G.effects = []; G.hazards = [];
  G.boss = null; G.activeRoom = null; G.currentRoom = d.start;
  d.start.visited = true;
  for (const r of d.rooms) {
    const cx = (r.cx + 0.5) * TILE, cy = (r.cy + 0.5) * TILE;
    if (r.type === 'chest') G.props.push({ kind: 'chest', x: cx, y: cy, opened: false, weapon: r.chestWeapon });
    if (r.type === 'shop') {
      r.offers.forEach((o, i) => G.props.push({ kind: 'shop', x: cx + (i - 1) * 48, y: cy + 8, offer: o, sold: false }));
    }
  }
  const p = G.player;
  if (p) {
    p.x = (d.start.cx + 0.5) * TILE; p.y = (d.start.cy + 0.5) * TILE;
    p.shield = p.maxShield; p.invuln = 1; p.roll = 0;
    G.cam.x = p.x - VIEW_W / 2; G.cam.y = p.y - VIEW_H / 2;
  }
  showBanner('PISO ' + n, themeOf(n).name.toUpperCase(), '#f2dfb4', 2.4);
}

function endRun(won) {
  if (G.state === 'over') return;
  UI.hidePause();
  if (won) {
    G.stats.lifeBonus = G.player.lives * LIFE_BONUS;
    G.score += G.stats.lifeBonus;
  }
  G.state = 'over';
  const entry = {
    name: G.name, score: G.score, floor: G.floor, won,
    seed: G.seedText, date: new Date().toLocaleDateString('es-ES'),
  };
  const rank = saveScore(entry);
  UI.showOver(won, entry, rank, G.stats);
}

// Mazmorra de fondo para el menú
function initPreview() {
  G.state = 'menu';
  G.player = null;
  G.floor = 1;
  G.seed = Math.floor(Math.random() * 1e9);
  const d = generateDungeon(G.seed, 1);
  G.dungeon = d; G.map = d.map; G.mapW = d.w; G.mapH = d.h;
  buildTiles(1);
  G.enemies = []; G.bullets = []; G.pickups = []; G.props = [];
  G.particles = []; G.texts = []; G.markers = []; G.effects = []; G.hazards = [];
  G.boss = null; G.banner = null; G.activeRoom = null;
}

function updateMenu(dt) {
  G.time += dt;
  const s = G.dungeon.start;
  G.cam.x = (s.cx + 0.5) * TILE - VIEW_W / 2 + Math.cos(G.time * 0.12) * 180;
  G.cam.y = (s.cy + 0.5) * TILE - VIEW_H / 2 + Math.sin(G.time * 0.17) * 110;
}

// ---------- Actualización ----------
function update(dt) {
  G.time += dt;
  const p = G.player;

  if (G.transition) {
    const tr = G.transition;
    tr.t += dt;
    if (tr.phase === 'out' && tr.t >= 0.6) { loadFloor(G.floor + 1); tr.phase = 'in'; tr.t = 0; }
    else if (tr.phase === 'in' && tr.t >= 0.6) { G.transition = null; G.state = 'play'; }
  }

  if (G.state === 'play') {
    p.update(dt);
    G.interact = findInteractable();
    if (G.interact && Input.hit('KeyE')) doInteract(G.interact);
    updateRooms(dt);
  } else {
    G.interact = null;
  }

  if (G.combo.timer > 0) {
    G.combo.timer -= dt;
    if (G.combo.timer <= 0) G.combo.count = 0;
  }

  for (const m of G.markers) {
    m.t -= dt;
    if (m.t <= 0) {
      m.dead = true;
      G.enemies.push(new Enemy(m.type, m.x, m.y));
      spawnParticles(m.x, m.y, 8, '#ff5a7a', 60, 0.3, 2);
    }
  }

  updateFlow();
  for (const e of G.enemies) if (!e.dead) e.update(dt);

  // Separación entre enemigos
  const es = G.enemies;
  for (let i = 0; i < es.length; i++) {
    const a = es[i];
    if (a.dead || a.isBoss) continue;
    for (let j = i + 1; j < es.length; j++) {
      const b = es[j];
      if (b.dead || b.isBoss) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = a.r + b.r;
      if (d > 0.01 && d < min) {
        const push = (min - d) / 2, nx = dx / d, ny = dy / d;
        moveEntity(a, -nx * push, -ny * push);
        moveEntity(b, nx * push, ny * push);
      }
    }
  }

  // Balas
  for (const b of G.bullets) {
    if (b.dead) continue;
    // Orbes que persiguen al jugador durante un tiempo
    if (b.homing > 0 && p && !p.dead) {
      b.homing -= dt;
      const sp = Math.hypot(b.vx, b.vy), cur = Math.atan2(b.vy, b.vx);
      const na = cur + clamp(angleDiff(cur, angleTo(b.x, b.y, p.x, p.y)), -b.turn * dt, b.turn * dt);
      b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
    }
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (b.life <= 0) { b.dead = true; if (b.split) splitBullet(b); continue; }
    if (solidAt(b.x, b.y)) {
      b.dead = true;
      if (b.split) splitBullet(b);
      spawnParticles(b.x - b.vx * dt, b.y - b.vy * dt, 4, b.color, 50, 0.2, 1.5);
      continue;
    }
    if (b.from === 'p') {
      for (const e of G.enemies) {
        if (e.dead || e.air) continue;
        if (b.hits && b.hits.has(e)) continue;
        if (dist(b.x, b.y, e.x, e.y) < e.r + b.r) {
          const sp = Math.hypot(b.vx, b.vy) || 1;
          const fm = falloffMult(b);
          e.damage(Math.round(b.dmg * fm * 10) / 10, b.vx / sp * 90 * fm, b.vy / sp * 90 * fm);
          if (b.pierce) b.hits.add(e);
          else { b.dead = true; break; }
        }
      }
    } else if (p && !p.dead && dist(b.x, b.y, p.x, p.y) < b.r + 4) {
      if (p.hurt()) {
        b.dead = true;
        if (b.slow) { p.slowT = 1.6; addText(p.x, p.y - 20, 'ATRAPADO', '#e8e8f0', 0.8); }
      }
    }
  }

  // Charcos de lava: aviso y luego queman al pisarlos (rodar te protege)
  for (const h of G.hazards) {
    if (h.warn > 0) { h.warn -= dt; continue; }
    h.t -= dt;
    if (p && !p.dead && dist(h.x, h.y, p.x, p.y) < h.r) p.hurt();
    if (Math.random() < 0.2) G.particles.push({ x: h.x + rnd(-h.r, h.r) * 0.7, y: h.y + rnd(-h.r, h.r) * 0.5, vx: 0, vy: -20, life: 0.4, max: 0.4, color: '#ffb547', size: 2 });
  }
  G.hazards = G.hazards.filter(h => h.warn > 0 || h.t > 0);

  // Monedas, energía y armas en el suelo
  for (const pk of G.pickups) {
    if (pk.dead) continue;
    pk.t += dt;
    const ox = pk.x, oy = pk.y;
    pk.x += pk.vx * dt; pk.y += pk.vy * dt;
    const f = Math.max(0, 1 - dt * 5);
    pk.vx *= f; pk.vy *= f;
    if (solidAt(pk.x, pk.y)) { pk.x = ox; pk.y = oy; pk.vx = 0; pk.vy = 0; }
    if (pk.kind === 'weapon' || !p || p.dead) continue;
    const d = dist(pk.x, pk.y, p.x, p.y);
    if (pk.t > 0.4 && d < 48) {
      const a = angleTo(pk.x, pk.y, p.x, p.y);
      pk.x += Math.cos(a) * 220 * dt; pk.y += Math.sin(a) * 220 * dt;
    }
    if (pk.t > 0.3 && d < 9) {
      pk.dead = true;
      if (pk.kind === 'coin') { p.coins++; G.score += COIN_PTS; G.stats.coinPts += COIN_PTS; Sfx.play('coin'); }
    }
  }

  // Portal al siguiente piso
  for (const pr of G.props) {
    if (pr.kind !== 'portal') continue;
    pr.t += dt;
    if (pr.delay > 0) { pr.delay -= dt; continue; }
    if (Math.random() < 0.5) {
      const a = rnd(0, Math.PI * 2);
      G.particles.push({ x: pr.x + Math.cos(a) * 14, y: pr.y + Math.sin(a) * 8, vx: 0, vy: -25, life: 0.6, max: 0.6, color: Math.random() < 0.5 ? '#c77dff' : '#7cf5ff', size: 2 });
    }
    if (G.state === 'play' && p && dist(p.x, p.y, pr.x, pr.y) < 14) {
      G.state = 'transition';
      G.transition = { phase: 'out', t: 0 };
      Sfx.play('portal');
    }
  }

  for (const pt of G.particles) {
    pt.x += pt.vx * dt; pt.y += pt.vy * dt;
    const f = Math.max(0, 1 - dt * 3);
    pt.vx *= f; pt.vy *= f;
    pt.life -= dt;
  }
  for (const t of G.texts) { t.y -= 18 * dt; t.life -= dt; }
  for (const ef of G.effects) ef.life -= dt;

  G.enemies = G.enemies.filter(e => !e.dead);
  G.bullets = G.bullets.filter(b => !b.dead);
  G.pickups = G.pickups.filter(pk => !pk.dead);
  G.markers = G.markers.filter(m => !m.dead);
  G.particles = G.particles.filter(pt => pt.life > 0);
  if (G.particles.length > 900) G.particles.splice(0, G.particles.length - 900);
  G.texts = G.texts.filter(t => t.life > 0);
  G.effects = G.effects.filter(ef => ef.life > 0);

  // Cámara con ligera anticipación hacia la mira
  if (p) {
    const tx = p.x + (Input.mouse.x - VIEW_W / 2) * 0.18 - VIEW_W / 2;
    const ty = p.y + (Input.mouse.y - VIEW_H / 2) * 0.18 - VIEW_H / 2;
    const k = 1 - Math.exp(-8 * dt);
    G.cam.x = lerp(G.cam.x, tx, k);
    G.cam.y = lerp(G.cam.y, ty, k);
  }

  G.shake = Math.max(0, G.shake - dt * 25);
  G.flash = Math.max(0, G.flash - dt);
  if (G.banner) { G.banner.t -= dt; if (G.banner.t <= 0) G.banner = null; }

  if (G.state === 'dying') {
    G.endTimer -= dt;
    if (G.endTimer <= 0) endRun(false);
  }
}

// ---------- Dibujo ----------
function drawTiles(camX, camY) {
  const W = G.mapW;
  const x0 = Math.max(0, Math.floor(camX / TILE)), y0 = Math.max(0, Math.floor(camY / TILE));
  const x1 = Math.min(W - 1, Math.floor((camX + VIEW_W) / TILE)), y1 = Math.min(G.mapH - 1, Math.floor((camY + VIEW_H) / TILE));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const t = G.map[y * W + x];
      if (t === T_VOID) continue;
      const px = x * TILE, py = y * TILE;
      if (t === T_WALL) {
        const below = tileAt(x, y + 1);
        ctx.drawImage(below === T_FLOOR || below === T_DOOR || below === T_DOOR_CLOSED ? TILES.wallFace : TILES.wallTop, px, py);
        continue;
      }
      ctx.drawImage(TILES.floor[tileHash(x, y) % TILES.floor.length], px, py);
      if (tileAt(x, y - 1) === T_WALL) { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(px, py, TILE, 4); }
      if (t === T_DOOR_CLOSED) ctx.drawImage(TILES.doorClosed, px, py);
    }
  }
}

function drawFloorDecor() {
  const d = G.dungeon;
  if (G.floor === 1 && G.state !== 'menu') {
    const s = d.start, cx = (s.cx + 0.5) * TILE, cy = (s.cy + 0.5) * TILE;
    const lines = ['WASD: MOVER', 'CLIC: DISPARAR', 'ESPACIO: RODAR', 'Q: CAMBIAR  E: USAR'];
    lines.forEach((l, i) => drawText(ctx, l, cx, cy - 34 + i * 14, 8, '#9a93b8', 'center', 0.55));
  }
  for (const r of d.rooms) {
    if (r.type === 'shop') drawText(ctx, 'TIENDA', (r.cx + 0.5) * TILE, (r.y0 + 1) * TILE, 8, '#ffcd75', 'center', 0.8);
  }
}

function drawProp(o) {
  if (o.kind === 'chest') {
    drawShadow(ctx, o.x, o.y + 6, 8, 2.5);
    drawSprite(ctx, o.opened ? SPR.chestOpen : SPR.chest, o.x, o.y);
  } else if (o.kind === 'shop') {
    ctx.fillStyle = '#1a1c2c'; ctx.fillRect(Math.round(o.x - 10), Math.round(o.y + 2), 20, 8);
    ctx.fillStyle = '#3a3560'; ctx.fillRect(Math.round(o.x - 9), Math.round(o.y + 2), 18, 3);
    if (o.sold) return;
    const bob = Math.round(Math.sin(G.time * 3 + o.x) * 1.5);
    const of = o.offer;
    if (of.kind === 'shield' || of.kind === 'maxshield') {
      drawSprite(ctx, SPR.shield, o.x, o.y - 6 + bob);
      if (of.kind === 'maxshield') drawText(ctx, '+', o.x + 7, o.y - 14 + bob, 8, '#f2dfb4');
    } else if (of.kind === 'weapon') {
      ctx.fillStyle = RARITY[of.weapon.rar].glow;
      ctx.beginPath(); ctx.arc(o.x, o.y - 6 + bob, 10, 0, Math.PI * 2); ctx.fill();
      drawSprite(ctx, SPR[WEAPONS[of.weapon.id].spr], o.x, o.y - 6 + bob);
    }
    drawText(ctx, String(of.price), o.x + 4, o.y + 12, 8, '#ffcd75', 'center');
    ctx.drawImage(SPR.coin, Math.round(o.x - 14), Math.round(o.y + 12));
  }
}

function drawPortal(o) {
  const grow = o.delay > 0 ? 1 - o.delay / 1.5 : 1;
  for (let i = 3; i >= 0; i--) {
    const rr = Math.max(0.5, (6 + i * 4) * grow + Math.sin(G.time * 5 + i) * grow);
    ctx.strokeStyle = i % 2 ? '#c77dff' : '#7cf5ff';
    ctx.globalAlpha = 0.5 + 0.12 * i;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(o.x, o.y, rr, rr * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  if (grow >= 1) drawText(ctx, 'BAJAR', o.x, o.y - 26, 8, '#c77dff', 'center', 0.6 + Math.sin(G.time * 4) * 0.3);
}

function drawPickup(pk) {
  const bob = Math.sin(G.time * 4 + pk.x * 0.3) * 1.5;
  if (pk.kind === 'coin') drawSprite(ctx, SPR.coin, pk.x, pk.y + bob);
  else if (pk.kind === 'weapon') {
    drawShadow(ctx, pk.x, pk.y + 6, 8, 2);
    const rr = RARITY[pk.weapon.rar];
    ctx.fillStyle = rr.glow;
    ctx.beginPath(); ctx.arc(pk.x, pk.y + bob, 11 + pk.weapon.rar, 0, Math.PI * 2); ctx.fill();
    if (pk.weapon.rar >= 2 && Math.random() < 0.15 && G.state !== 'paused') {
      G.particles.push({ x: pk.x + rnd(-8, 8), y: pk.y + rnd(-6, 4), vx: 0, vy: -18, life: 0.5, max: 0.5, color: rr.color, size: 1 });
    }
    drawSprite(ctx, SPR[WEAPONS[pk.weapon.id].spr], pk.x, pk.y + bob - 2);
  }
}

function drawHazard(h) {
  if (h.warn > 0) {
    ctx.strokeStyle = 'rgba(255,110,30,' + (0.4 + 0.5 * Math.abs(Math.sin(G.time * 14))) + ')';
    ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.ellipse(h.x, h.y, h.r, h.r * 0.6, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    return;
  }
  const fade = Math.min(1, h.t / 0.5);
  ctx.globalAlpha = fade;
  ctx.fillStyle = '#7a1f0a';
  ctx.beginPath(); ctx.ellipse(h.x, h.y, h.r + 1, h.r * 0.6 + 1, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ff5a1f';
  ctx.beginPath(); ctx.ellipse(h.x, h.y, h.r, h.r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffb547';
  ctx.beginPath(); ctx.ellipse(h.x + Math.sin(G.time * 3 + h.x) * 3, h.y, h.r * 0.5, h.r * 0.28, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
}

function drawMarker(m) {
  const k = 1 - m.t / 0.8;
  ctx.strokeStyle = 'rgba(255,70,100,' + (0.4 + 0.5 * Math.abs(Math.sin(G.time * 18))) + ')';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(m.x, m.y + 4, 9 * (1 - k * 0.4), 4, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(m.x - 3, m.y + 1); ctx.lineTo(m.x + 3, m.y + 7);
  ctx.moveTo(m.x + 3, m.y + 1); ctx.lineTo(m.x - 3, m.y + 7);
  ctx.stroke();
}

function drawLighting(camX, camY) {
  lctx.setTransform(RS, 0, 0, RS, 0, 0);
  lctx.globalCompositeOperation = 'source-over';
  lctx.clearRect(0, 0, VIEW_W, VIEW_H);
  lctx.fillStyle = themeOf(G.floor).ambient;
  lctx.fillRect(0, 0, VIEW_W, VIEW_H);
  lctx.globalCompositeOperation = 'destination-out';
  const light = (x, y, r, a) => {
    if (x < -r || y < -r || x > VIEW_W + r || y > VIEW_H + r) return;
    const g = lctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(0,0,0,' + a + ')');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    lctx.fillStyle = g;
    lctx.fillRect(x - r, y - r, r * 2, r * 2);
  };
  const p = G.player;
  if (p && !p.dead) light(p.x - camX, p.y - camY, p.ultT > 0 ? 190 : 150, 1);
  else light(VIEW_W / 2, VIEW_H / 2, 260, 0.8);
  for (const t of G.dungeon.torches) {
    light(t.x - camX, t.y - camY + 6, 78 + Math.sin(G.time * 9 + t.ph) * 5, 0.95);
  }
  for (const o of G.props) if (o.kind === 'portal') light(o.x - camX, o.y - camY, 70, 0.9);
  if (G.boss) light(G.boss.x - camX, G.boss.y - camY, 90, 0.7);
  for (const h of G.hazards) if (h.warn <= 0) light(h.x - camX, h.y - camY, h.r * 2.4, 0.75);

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(lightCanvas, 0, 0);
  ctx.restore();

  // Brillo cálido de las antorchas
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const t of G.dungeon.torches) {
    const x = t.x - camX, y = t.y - camY;
    if (x < -60 || y < -60 || x > VIEW_W + 60 || y > VIEW_H + 60) continue;
    const r = 46 + Math.sin(G.time * 11 + t.ph) * 4;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,150,50,0.16)');
    g.addColorStop(1, 'rgba(255,150,50,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.restore();
}

function drawTorches() {
  for (const t of G.dungeon.torches) {
    const x = Math.round(t.x), y = Math.round(t.y);
    ctx.fillStyle = '#1a1c2c'; ctx.fillRect(x - 2, y, 4, 4);
    ctx.fillStyle = '#5c3a28'; ctx.fillRect(x - 1, y + 1, 2, 3);
    const f = Math.floor((G.time * 10 + t.ph) % 3);
    ctx.fillStyle = '#e43b44'; ctx.fillRect(x - 2, y - 5 + (f === 1 ? 1 : 0), 4, 5);
    ctx.fillStyle = '#ff9a3c'; ctx.fillRect(x - 1 + (f === 2 ? 1 : 0), y - 6, 2, 5);
    ctx.fillStyle = '#ffe39a'; ctx.fillRect(x, y - 3, 1, 2);
    if (Math.random() < 0.02 && G.state !== 'paused') {
      G.particles.push({ x, y: y - 6, vx: rnd(-6, 6), vy: -30, life: 0.6, max: 0.6, color: '#ffb547', size: 1 });
    }
  }
}

function render() {
  ctx.setTransform(RS, 0, 0, RS, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#07060f';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  if (!G.map) return;

  let sx = 0, sy = 0;
  if (G.shake > 0 && G.state !== 'paused') { sx = rnd(-G.shake, G.shake); sy = rnd(-G.shake, G.shake); }
  const camX = Math.round(G.cam.x + sx), camY = Math.round(G.cam.y + sy);

  ctx.save();
  ctx.translate(-camX, -camY);
  drawTiles(camX, camY);
  drawFloorDecor();
  for (const o of G.props) if (o.kind === 'portal') drawPortal(o);
  for (const h of G.hazards) drawHazard(h);
  for (const m of G.markers) drawMarker(m);
  for (const pk of G.pickups) drawPickup(pk);
  const list = G.props.filter(o => o.kind !== 'portal').concat(G.enemies);
  if (G.player) list.push(G.player);
  list.sort((a, b) => a.y - b.y);
  for (const o of list) { if (o.draw) o.draw(ctx); else drawProp(o); }
  ctx.restore();

  drawLighting(camX, camY);

  ctx.save();
  ctx.translate(-camX, -camY);
  drawTorches();
  for (const e of G.enemies) if (e.drawFx) e.drawFx(ctx);
  for (const b of G.bullets) {
    if (b.laser) {
      const sp = Math.hypot(b.vx, b.vy) || 1, lx = b.vx / sp * 12, ly = b.vy / sp * 12;
      ctx.strokeStyle = b.color; ctx.lineWidth = 3; ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.moveTo(b.x - lx, b.y - ly); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.moveTo(b.x - lx, b.y - ly); ctx.lineTo(b.x, b.y); ctx.stroke();
      continue;
    }
    if (b.from === 'e') {
      ctx.fillStyle = '#1a1c2c';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 1, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = b.color; ctx.globalAlpha = 0.35;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 2, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(Math.round(b.x - 1), Math.round(b.y - 1), 2, 2);
  }
  for (const pt of G.particles) {
    ctx.globalAlpha = clamp(pt.life / pt.max, 0, 1);
    ctx.fillStyle = pt.color;
    ctx.fillRect(Math.round(pt.x), Math.round(pt.y), pt.size, pt.size);
  }
  ctx.globalAlpha = 1;
  for (const ef of G.effects) {
    if (ef.type === 'wave') {
      const k = 1 - ef.life / ef.max;
      ctx.strokeStyle = 'rgba(255,90,60,' + (1 - k) + ')';
      ctx.lineWidth = 4 * (1 - k) + 1;
      ctx.beginPath(); ctx.arc(ef.x, ef.y, Math.max(1, ef.range * k), 0, Math.PI * 2); ctx.stroke();
      continue;
    }
    if (ef.type !== 'slash') continue;
    const k = ef.life / ef.max;
    ctx.strokeStyle = 'rgba(255,255,255,' + k + ')';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(ef.x, ef.y, ef.range * (1.1 - k * 0.3), ef.a - ef.arc / 2, ef.a + ef.arc / 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(160,220,255,' + k * 0.6 + ')';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(ef.x, ef.y, ef.range * 0.7, ef.a - ef.arc / 2, ef.a + ef.arc / 2); ctx.stroke();
  }
  for (const t of G.texts) drawText(ctx, t.text, Math.round(t.x), Math.round(t.y), 8, t.color, 'center', clamp(t.life / t.max * 1.5, 0, 1));
  ctx.restore();

  if (G.state !== 'menu' && G.player) drawHUD(ctx);

  if (G.flash > 0) {
    ctx.fillStyle = 'rgba(228,59,68,' + G.flash * 0.9 + ')';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  if (G.transition) {
    const a = G.transition.phase === 'out' ? G.transition.t / 0.6 : 1 - G.transition.t / 0.6;
    ctx.fillStyle = 'rgba(7,6,15,' + clamp(a, 0, 1) + ')';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  if (G.state === 'paused') {
    ctx.fillStyle = 'rgba(7,6,15,0.7)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
}

function setPaused(on) {
  if (on && G.state === 'play') {
    G.state = 'paused';
    Input.mouse.down = false;
    UI.showPause();
  } else if (!on && G.state === 'paused') {
    G.state = 'play';
    UI.hidePause();
  }
}

// ---------- Bucle principal ----------
let lastTime = performance.now();
function frame(now) {
  // Se agenda primero: un error en un cuadro nunca debe congelar el juego
  requestAnimationFrame(frame);
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;
  try {
    step(dt);
  } catch (err) {
    console.error(err);
    ctx.restore(); ctx.restore();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  Input.endFrame();
}

function step(dt) {
  Input.mouse.wx = Input.mouse.x + G.cam.x;
  Input.mouse.wy = Input.mouse.y + G.cam.y;

  if (Input.hit('KeyM')) Sfx.toggleMute();
  if (Input.hit('KeyF')) toggleFullscreen();
  if (Input.hit('KeyM') && UI.btnMute) UI.updateMute();
  if (G.state === 'play' && (Input.hit('KeyP') || Input.hit('Escape'))) setPaused(true);
  else if (G.state === 'paused') {
    if (Input.hit('KeyP') || Input.hit('Escape')) setPaused(false);
    else if (Input.hit('KeyX')) endRun(false);
  }

  if (G.state === 'menu') updateMenu(dt);
  else if (G.state === 'play' || G.state === 'dying' || G.state === 'transition') update(dt);

  render();
}

buildSprites();
UI.init();
initPreview();
requestAnimationFrame(frame);
