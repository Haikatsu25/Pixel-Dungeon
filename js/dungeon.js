'use strict';

// Generación de mazmorra: salas en una cuadrícula conectadas como árbol
const GRID = 7;
const CELL = 26;

function tileAt(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= G.mapW || ty >= G.mapH) return T_VOID;
  return G.map[ty * G.mapW + tx];
}
function isSolid(t) { return t === T_VOID || t === T_WALL || t === T_DOOR_CLOSED; }
function solidAt(px, py) { return isSolid(tileAt(Math.floor(px / TILE), Math.floor(py / TILE))); }

function boxCollides(x, y, hw, hh) {
  const x0 = Math.floor((x - hw) / TILE), x1 = Math.floor((x + hw - 0.001) / TILE);
  const y0 = Math.floor((y - hh) / TILE), y1 = Math.floor((y + hh - 0.001) / TILE);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) if (isSolid(tileAt(tx, ty))) return true;
  }
  return false;
}

function moveEntity(e, dx, dy) {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 4));
  const sx = dx / steps, sy = dy / steps;
  let hitX = false, hitY = false;
  for (let i = 0; i < steps; i++) {
    if (!hitX) { e.x += sx; if (boxCollides(e.x, e.y, e.hw, e.hh)) { e.x -= sx; hitX = true; } }
    if (!hitY) { e.y += sy; if (boxCollides(e.x, e.y, e.hw, e.hh)) { e.y -= sy; hitY = true; } }
  }
  return { hitX, hitY };
}

function roomAt(px, py, margin) {
  if (!G.dungeon) return null;
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
  for (const r of G.dungeon.rooms) {
    if (tx >= r.x0 + margin && tx < r.x0 + r.w - margin && ty >= r.y0 + margin && ty < r.y0 + r.h - margin) return r;
  }
  return null;
}

// Línea de visión entre dos puntos (muestreo cada 6 px)
function hasLOS(ax, ay, bx, by) {
  const d = dist(ax, ay, bx, by), n = Math.ceil(d / 6);
  for (let i = 1; i < n; i++) {
    const k = i / n;
    if (solidAt(ax + (bx - ax) * k, ay + (by - ay) * k)) return false;
  }
  return true;
}

// Campo de flujo (BFS) desde la baldosa del jugador dentro de la sala activa
const Flow = { room: null, ptx: -1, pty: -1, dist: null };

function updateFlow() {
  const r = G.activeRoom, p = G.player;
  if (!r || !p) { Flow.room = null; return; }
  const ptx = Math.floor(p.x / TILE), pty = Math.floor(p.y / TILE);
  if (Flow.room === r && Flow.ptx === ptx && Flow.pty === pty) return;
  Flow.room = r; Flow.ptx = ptx; Flow.pty = pty;
  const w = r.w, h = r.h, n = w * h;
  if (!Flow.dist || Flow.dist.length < n) Flow.dist = new Int16Array(n);
  Flow.dist.fill(-1, 0, n);
  const lx = ptx - r.x0, ly = pty - r.y0;
  if (lx < 0 || ly < 0 || lx >= w || ly >= h) return;
  const q = [lx + ly * w];
  Flow.dist[q[0]] = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi], x = i % w, y = (i / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = nx + ny * w;
      if (Flow.dist[ni] !== -1 || isSolid(tileAt(r.x0 + nx, r.y0 + ny))) continue;
      Flow.dist[ni] = Flow.dist[i] + 1;
      q.push(ni);
    }
  }
}

// Ángulo para perseguir al jugador: directo si hay visión, si no sigue el campo de flujo
function chaseAngle(e) {
  const p = G.player;
  const direct = angleTo(e.x, e.y, p.x, p.y);
  const r = Flow.room;
  if (!r || hasLOS(e.x, e.y, p.x, p.y)) return direct;
  const tx = Math.floor(e.x / TILE) - r.x0, ty = Math.floor(e.y / TILE) - r.y0;
  if (tx < 0 || ty < 0 || tx >= r.w || ty >= r.h) return direct;
  const cur = Flow.dist[tx + ty * r.w];
  let best = cur < 0 ? 1e9 : cur, bx = -1, by = -1;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = tx + dx, ny = ty + dy;
    if (nx < 0 || ny < 0 || nx >= r.w || ny >= r.h) continue;
    const v = Flow.dist[nx + ny * r.w];
    if (v >= 0 && v < best) { best = v; bx = nx; by = ny; }
  }
  if (bx < 0) return direct;
  return angleTo(e.x, e.y, (r.x0 + bx + 0.5) * TILE, (r.y0 + by + 0.5) * TILE);
}

function lockDoors(r, closed) {
  for (const idx of r.doors) G.map[idx] = closed ? T_DOOR_CLOSED : T_DOOR;
}

const ENEMY_POOLS = [
  ['slime', 'slime', 'slime', 'bat', 'bat', 'skeleton'],
  ['slime', 'bat', 'bat', 'skeleton', 'skeleton', 'mage'],
  ['slime', 'bat', 'skeleton', 'skeleton', 'mage', 'mage', 'golem'],
];

const SHOP_OFFERS = {
  maxshield: { kind: 'maxshield', price: 35, label: 'ESCUDO MÁX. +1' },
  shield: { kind: 'shield', price: 12, label: 'RECARGAR ESCUDO' },
  weapon: { kind: 'weapon', price: 20, label: '' },
};

function generateDungeon(seed, floor) {
  const rng = new RNG((seed + Math.imul(floor, 0x9E3779B1)) >>> 0);
  const nRooms = 6 + Math.min(floor, 5);
  const cells = new Map();
  const rooms = [];
  const links = [];
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const key = (x, y) => x + ',' + y;

  const addRoom = (gx, gy, parent) => {
    const r = {
      gx, gy, links: [], doors: [], type: 'normal', cleared: false, visited: false,
      waves: [], wave: 0, flawless: true, timer: 0, waveWait: 0, bossDelay: 0,
    };
    rooms.push(r);
    cells.set(key(gx, gy), r);
    if (parent) { parent.links.push(r); r.links.push(parent); links.push([parent, r]); }
    return r;
  };

  addRoom(3, 3, null);
  let guard = 0;
  while (rooms.length < nRooms && guard++ < 5000) {
    const base = rng.pick(rooms);
    const d = rng.pick(DIRS);
    const nx = base.gx + d[0], ny = base.gy + d[1];
    if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID || cells.has(key(nx, ny))) continue;
    let n = 0;
    for (const dd of DIRS) if (cells.has(key(nx + dd[0], ny + dd[1]))) n++;
    if (n > 1 && rng.chance(0.9)) continue;
    addRoom(nx, ny, base);
  }

  // Profundidad desde el inicio (BFS) para poner al jefe lo más lejos posible
  const start = rooms[0];
  start.depth = 0;
  const q = [start], seen = new Set([start]);
  while (q.length) {
    const r = q.shift();
    for (const l of r.links) if (!seen.has(l)) { seen.add(l); l.depth = r.depth + 1; q.push(l); }
  }
  start.type = 'start'; start.cleared = true;
  const others = rooms.filter(r => r !== start);
  const leaves = others.filter(r => r.links.length === 1);
  const boss = (leaves.length ? leaves : others).slice().sort((a, b) => b.depth - a.depth)[0];
  boss.type = 'boss';

  const pickSpecial = (type) => {
    const free = rooms.filter(r => r.type === 'normal');
    if (free.length <= 2) return null;
    const lf = free.filter(r => r.links.length === 1);
    const r = lf.length ? rng.pick(lf) : rng.pick(free);
    r.type = type; r.cleared = true;
    return r;
  };
  const chestRoom = pickSpecial('chest');
  const shopRoom = pickSpecial('shop');

  // Tallar salas
  const W = GRID * CELL, H = GRID * CELL;
  const map = new Uint8Array(W * H);
  for (const r of rooms) {
    let w, h;
    if (r.type === 'boss') { w = 21; h = 15; }
    else if (r.type === 'normal') { w = rng.pick([13, 15, 17]); h = rng.pick([11, 13]); }
    else if (r.type === 'start') { w = 15; h = 11; }
    else { w = 11; h = 9; }
    r.w = w; r.h = h;
    r.cx = r.gx * CELL + 13; r.cy = r.gy * CELL + 13;
    r.x0 = r.cx - (w >> 1); r.y0 = r.cy - (h >> 1);
    for (let y = r.y0 - 1; y <= r.y0 + h; y++) {
      for (let x = r.x0 - 1; x <= r.x0 + w; x++) {
        const border = x < r.x0 || y < r.y0 || x >= r.x0 + w || y >= r.y0 + h;
        map[y * W + x] = border ? T_WALL : T_FLOOR;
      }
    }
  }

  // Pasillos con puertas
  for (const [a, b] of links) {
    if (a.gy === b.gy) {
      const L = a.gx < b.gx ? a : b, R = L === a ? b : a;
      const xs = L.x0 + L.w, xe = R.x0 - 1, cy = L.cy;
      for (let x = xs; x <= xe; x++) {
        for (let dy = -1; dy <= 1; dy++) {
          const i = (cy + dy) * W + x;
          if (x === xs) { map[i] = T_DOOR; L.doors.push(i); }
          else if (x === xe) { map[i] = T_DOOR; R.doors.push(i); }
          else map[i] = T_FLOOR;
        }
        if (x > xs && x < xe) {
          for (const y of [cy - 2, cy + 2]) if (map[y * W + x] === T_VOID) map[y * W + x] = T_WALL;
        }
      }
    } else {
      const T = a.gy < b.gy ? a : b, B = T === a ? b : a;
      const ys = T.y0 + T.h, ye = B.y0 - 1, cx = T.cx;
      for (let y = ys; y <= ye; y++) {
        for (let dx = -1; dx <= 1; dx++) {
          const i = y * W + cx + dx;
          if (y === ys) { map[i] = T_DOOR; T.doors.push(i); }
          else if (y === ye) { map[i] = T_DOOR; B.doors.push(i); }
          else map[i] = T_FLOOR;
        }
        if (y > ys && y < ye) {
          for (const x of [cx - 2, cx + 2]) if (map[y * W + x] === T_VOID) map[y * W + x] = T_WALL;
        }
      }
    }
  }

  // Pilares, oleadas, cofre y tienda
  const pool = ENEMY_POOLS[Math.min(floor, 3) - 1];
  const maxGolems = floor >= 5 ? 2 : 1;
  for (const r of rooms) {
    if (r.type === 'normal') {
      const p = rng.int(0, 3);
      const spots = [];
      const mx = r.w >> 1, my = r.h >> 1;
      if (p === 1) spots.push([3, 3], [r.w - 4, 3], [3, r.h - 4], [r.w - 4, r.h - 4]);
      if (p === 2) spots.push([mx, my], [mx - 1, my], [mx + 1, my], [mx, my - 1], [mx, my + 1]);
      if (p === 3) {
        for (const [bx, by] of [[3, 3], [r.w - 5, 3], [3, r.h - 5], [r.w - 5, r.h - 5]]) {
          spots.push([bx, by], [bx + 1, by], [bx, by + 1], [bx + 1, by + 1]);
        }
      }
      for (const [sx, sy] of spots) map[(r.y0 + sy) * W + r.x0 + sx] = T_WALL;

      const free = [];
      for (let y = r.y0 + 1; y < r.y0 + r.h - 1; y++) {
        for (let x = r.x0 + 1; x < r.x0 + r.w - 1; x++) if (map[y * W + x] === T_FLOOR) free.push([x, y]);
      }
      const nWaves = floor >= 6 ? 4 : floor >= 3 ? 3 : 2;
      for (let wv = 0; wv < nWaves; wv++) {
        const count = 2 + Math.min(floor, 6) + rng.int(0, 1) + (wv === nWaves - 1 ? 1 : 0);
        const wave = [];
        let golems = 0;
        for (let i = 0; i < count; i++) {
          let type = rng.pick(pool);
          if (type === 'golem' && golems++ >= maxGolems) type = 'skeleton';
          const [tx, ty] = rng.pick(free);
          wave.push({ type, x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE });
        }
        r.waves.push(wave);
      }
    }
  }
  // El cofre nunca baja de: común (piso 1), rara (piso 2), épica (piso 3)
  if (chestRoom) chestRoom.chestWeapon = { id: rng.pick(WEAPON_POOL), rar: Math.max(Math.min(floor - 1, 3), rollRarity(rng, floor)) };
  if (shopRoom) {
    const guns = rng.shuffle(WEAPON_POOL.slice()).slice(0, 2);
    shopRoom.offers = [guns[0], 'maxshield', 'shield'].map(k => {
      if (SHOP_OFFERS[k]) return Object.assign({}, SHOP_OFFERS[k]);
      const item = { id: k, rar: rollRarity(rng, floor) };
      return Object.assign({}, SHOP_OFFERS.weapon, { weapon: item, label: weaponLabel(item), price: SHOP_OFFERS.weapon.price + 15 * item.rar });
    });
  }

  // Antorchas en el muro superior de cada sala
  const torches = [];
  for (const r of rooms) {
    const xs = [r.x0 + 2, r.x0 + r.w - 3];
    if (r.w >= 15) xs.push(r.cx - 4, r.cx + 4);
    const y = r.y0 - 1;
    for (const x of xs) {
      if (map[y * W + x] === T_WALL) torches.push({ x: (x + 0.5) * TILE, y: (y + 1) * TILE - 7, ph: rng.next() * 10 });
    }
  }

  return { map, w: W, h: H, rooms, start, boss, torches };
}
