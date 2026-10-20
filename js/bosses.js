'use strict';

// =====================================================================
//  Jefes: rotan por piso (Slime, Nigromante, Gólem de Lava, Reina
//  Arácnida, Ojo del Abismo) y regresan más fuertes con número romano.
// =====================================================================

const KING_NAMES = ['REY SLIME', 'REY SLIME DE LA CRIPTA', 'REY SLIME DE FUEGO'];
const BOSS_BASE_NAMES = [null, 'NIGROMANTE', 'GÓLEM DE LAVA', 'REINA ARÁCNIDA', 'OJO DEL ABISMO'];
const BOSS_HINTS = [
  'Esquiva su salto aplastante',
  'Sus orbes verdes te persiguen',
  'Esquiva sus embestidas y la lava',
  'Sus telarañas te frenan',
  'Rueda para cruzar el láser',
];

function toRoman(n) {
  const map = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let s = '';
  for (const [v, r] of map) while (n >= v) { s += r; n -= v; }
  return s;
}

function bossIndex(floor) { return (floor - 1) % BOSS_BASE_NAMES.length; }
function bossHint(floor) { return BOSS_HINTS[bossIndex(floor)]; }
function bossName(floor) {
  const i = bossIndex(floor);
  const base = i === 0 ? KING_NAMES[themeIndex(floor)] : BOSS_BASE_NAMES[i];
  const cycle = Math.floor((floor - 1) / BOSS_BASE_NAMES.length);
  return base + (cycle > 0 ? ' ' + toRoman(cycle + 1) : '');
}

// Punto final de un rayo desde (x, y) en dirección a, hasta chocar con un muro
function rayEnd(x, y, a, max = 520) {
  const dx = Math.cos(a), dy = Math.sin(a);
  for (let d = 0; d < max; d += 6) {
    if (solidAt(x + dx * d, y + dy * d)) return [x + dx * d, y + dy * d];
  }
  return [x + dx * max, y + dy * max];
}
function distToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const t = clamp(((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy || 1), 0, 1);
  return dist(px, py, ax + vx * t, ay + vy * t);
}

// ---------- Base común ----------
class BossBase {
  constructor(x, y, o) {
    this.type = 'boss'; this.isBoss = true;
    this.x = x; this.y = y; this.hw = o.hw; this.hh = o.hh; this.r = o.r;
    this.maxHp = this.hp = Math.round((300 + 170 * (G.floor - 1)) * o.hp);
    this.name = bossName(G.floor);
    this.color = o.color;
    this.flash = 0; this.state = 'intro'; this.timer = 1.0;
    this.z = 0; this.hidden = false; this.last = '';
    this.dead = false; this.face = 1; this.anim = 0;
    this.shotT = 0; this.count = 0; this.spin = 0;
  }

  get phase2() { return this.hp < this.maxHp * 0.5; }
  get air() { return this.z > 6 || this.hidden; }
  get rage() { return this.phase2 ? 1.35 : 1; }

  toMove(t) { this.state = 'move'; this.timer = t || rnd(1.0, 1.6); }

  pick(list) {
    const opts = list.filter(o => o !== this.last);
    const a = opts[Math.floor(Math.random() * opts.length)];
    this.last = a;
    return a;
  }

  tick(dt) {
    this.anim += dt; this.flash -= dt;
    this.face = G.player.x >= this.x ? 1 : -1;
    this.timer -= dt * (this.state === 'move' ? this.rage : 1);
  }

  aim() { return angleTo(this.x, this.y, G.player.x, G.player.y); }

  ring(n, speed, color, off = 0, r = 4) {
    for (let i = 0; i < n; i++) enemyShoot(this.x, this.y, off + i * Math.PI * 2 / n, speed, { color, r });
    Sfx.play('eshoot');
  }

  summon(type, n, radius = 40) {
    if (G.enemies.length >= 8) return;
    for (let i = 0; i < n; i++) {
      const a = i * Math.PI * 2 / n + rnd(0, 1);
      let x = this.x + Math.cos(a) * radius, y = this.y + Math.sin(a) * radius;
      if (boxCollides(x, y, 6, 6)) { x = this.x; y = this.y; }
      G.markers.push({ type, x, y, t: 0.6 });
    }
    Sfx.play('spawn');
  }

  randomSpot(minDist) {
    const r = G.activeRoom, p = G.player;
    if (!r) return [this.x, this.y];
    for (let i = 0; i < 40; i++) {
      const x = (r.x0 + 2 + Math.floor(Math.random() * (r.w - 4)) + 0.5) * TILE;
      const y = (r.y0 + 2 + Math.floor(Math.random() * (r.h - 4)) + 0.5) * TILE;
      if (dist(x, y, p.x, p.y) >= minDist && !boxCollides(x, y, this.hw, this.hh)) return [x, y];
    }
    return [this.x, this.y];
  }

  contact() {
    const p = G.player;
    if (!this.air && !p.dead && dist(this.x, this.y, p.x, p.y) < this.r + p.r - 2) p.hurt();
  }

  rageFx() {
    if (this.phase2 && Math.random() < 0.15) {
      G.particles.push({ x: this.x + rnd(-14, 14), y: this.y + rnd(-10, 10) - this.z, vx: 0, vy: -20, life: 0.5, max: 0.5, color: '#ff5a5a', size: 2 });
    }
  }

  damage(amount) {
    if (this.dead || this.air) return;
    this.hp -= amount;
    G.player.chargeUlt(amount);
    this.flash = 0.06;
    addText(this.x + rnd(-10, 10), this.y - 30, String(Math.round(amount)), '#ffffff', 0.45);
    Sfx.play('hit');
    if (this.hp <= 0) this.die();
  }

  die() {
    this.dead = true;
    spawnParticles(this.x, this.y, 60, this.color, 200, 0.9, 3);
    spawnParticles(this.x, this.y, 30, '#ffcd75', 160, 0.9, 2);
    Sfx.play('kill'); Sfx.play('victory');
    addShake(14);
    G.onKill(this);
    for (let i = 0; i < 8; i++) dropPickup('coin', this.x, this.y);
    dropPickup('weapon', this.x, this.y, { weapon: { id: G.rng.pick(WEAPON_POOL), rar: Math.min(G.floor, 3) } });
    G.onBossKilled(this);
  }

  drawScaled(c, name, sc, ox = 0, oy = 0, alpha = 1) {
    const img = SPR[name + (this.flash > 0 ? '_w' : '')];
    const w = img.width * sc, h = img.height * sc;
    c.globalAlpha = alpha;
    c.save();
    c.translate(Math.round(this.x + ox), Math.round(this.y + oy - this.z));
    if (this.face < 0) c.scale(-1, 1);
    c.drawImage(img, -Math.round(w / 2), -Math.round(h / 2), w, h);
    c.restore();
    c.globalAlpha = 1;
  }

  drawTarget(c, tx, ty) {
    c.strokeStyle = 'rgba(255,60,90,0.85)'; c.lineWidth = 1.5;
    c.beginPath(); c.ellipse(tx, ty + 6, 22, 9, 0, 0, Math.PI * 2); c.stroke();
    c.fillStyle = 'rgba(255,60,90,0.15)'; c.fill();
  }
}

// ---------- 1. Rey Slime ----------
class KingSlime extends BossBase {
  constructor(x, y) {
    super(x, y, { hw: 16, hh: 12, r: 18, hp: 1, color: '#38b764' });
    this.tx = x; this.ty = y; this.sx = x; this.sy = y;
  }

  nextAttack() {
    const a = this.pick(['spiral', 'burst', 'jump', 'summon']);
    if (a === 'spiral') { this.state = 'spiral'; this.timer = 2.6; this.shotT = 0; }
    if (a === 'burst') { this.state = 'burst'; this.count = 3; this.shotT = 0.3; }
    if (a === 'jump') { this.state = 'jumpUp'; this.timer = 0.4; Sfx.play('jump'); }
    if (a === 'summon') { this.state = 'summon'; this.timer = 0.8; }
  }

  update(dt) {
    this.tick(dt);
    const p = G.player, ang = this.aim();
    switch (this.state) {
      case 'intro':
        if (this.timer <= 0) this.toMove();
        break;
      case 'move':
        moveEntity(this, Math.cos(ang) * 28 * this.rage * dt, Math.sin(ang) * 28 * this.rage * dt);
        if (this.timer <= 0) this.nextAttack();
        break;
      case 'spiral':
        this.shotT -= dt;
        if (this.shotT <= 0) {
          this.shotT = this.phase2 ? 0.075 : 0.1;
          const arms = this.phase2 ? 4 : 3;
          for (let a = 0; a < arms; a++) enemyShoot(this.x, this.y, this.spin + a * Math.PI * 2 / arms, 95, { color: '#7dff6b', r: 4 });
          this.spin += 0.23;
          Sfx.play('eshoot');
        }
        if (this.timer <= 0) this.toMove();
        break;
      case 'burst':
        this.shotT -= dt;
        if (this.shotT <= 0) {
          if (this.count > 0) {
            this.count--; this.shotT = 0.45;
            const n = this.phase2 ? 7 : 5;
            for (let i = 0; i < n; i++) enemyShoot(this.x, this.y, ang + (i - (n - 1) / 2) * 0.18, 150, { color: '#ff4a6e', r: 4 });
            Sfx.play('eshoot');
          } else this.toMove();
        }
        break;
      case 'jumpUp':
        this.z += 220 * dt;
        if (this.timer <= 0) {
          this.state = 'jumpAir'; this.timer = 0.7;
          this.tx = p.x; this.ty = p.y; this.sx = this.x; this.sy = this.y;
        }
        break;
      case 'jumpAir': {
        const k = clamp(1 - this.timer / 0.7, 0, 1);
        moveEntity(this, lerp(this.sx, this.tx, k) - this.x, lerp(this.sy, this.ty, k) - this.y);
        this.z = 88 * (1 - k);
        if (this.timer <= 0) {
          this.z = 0;
          this.ring(this.phase2 ? 24 : 16, 110, '#ffcd75');
          addShake(10); Sfx.play('land');
          spawnParticles(this.x, this.y + 12, 24, '#38b764', 120, 0.5, 3);
          this.toMove(0.9);
        }
        break;
      }
      case 'summon':
        if (this.timer <= 0) { this.summon('minislime', this.phase2 ? 4 : 3); this.toMove(); }
        break;
    }
    this.rageFx();
    this.contact();
  }

  draw(c) {
    if (this.state === 'jumpAir') this.drawTarget(c, this.tx, this.ty);
    if (this.state === 'jumpUp') this.drawTarget(c, G.player.x, G.player.y);
    const shs = 1 - Math.min(0.6, this.z / 150);
    drawShadow(c, this.x, this.y + 15, 22 * shs, 6 * shs);
    const img = SPR['king' + (themeIndex(G.floor) + 1) + (this.flash > 0 ? '_w' : '')];
    let squash = this.state === 'move' ? Math.sin(this.anim * 7) * 0.06 : 0;
    if (this.state === 'jumpUp') squash = -0.15;
    if (this.state === 'intro') squash = Math.sin(this.anim * 20) * 0.08;
    const dw = img.width * 4 * (1 + squash), dh = img.height * 4 * (1 - squash);
    const dx = Math.round(this.x - dw / 2), dy = Math.round(this.y + 16 - dh - this.z);
    c.drawImage(img, dx, dy, dw, dh);
    const cr = SPR.crown;
    c.drawImage(cr, Math.round(this.x - cr.width), dy - cr.height * 2 + 6, cr.width * 2, cr.height * 2);
  }
}

// ---------- 2. Nigromante: se teletransporta, invoca esqueletos, orbes que persiguen ----------
class Necromancer extends BossBase {
  constructor(x, y) {
    super(x, y, { hw: 7, hh: 10, r: 11, hp: 0.9, color: '#7dff6b' });
    this.alpha = 1;
    this.charge = 0;
  }

  nextAttack() {
    const a = this.pick(['teleport', 'summon', 'orbs', 'spears']);
    if (a === 'teleport') { this.state = 'fadeOut'; this.timer = 0.35; this.hidden = true; Sfx.play('teleport'); }
    if (a === 'summon') { this.state = 'summon'; this.timer = 0.8; }
    if (a === 'orbs') { this.state = 'orbs'; this.timer = 0.7; }
    if (a === 'spears') { this.state = 'spears'; this.count = this.phase2 ? 4 : 3; this.shotT = 0.35; }
  }

  update(dt) {
    this.tick(dt);
    const p = G.player, ang = this.aim(), d = dist(this.x, this.y, p.x, p.y);
    this.charge = 0;
    switch (this.state) {
      case 'intro':
        if (this.timer <= 0) this.toMove();
        break;
      case 'move': {
        // Mantiene la distancia mientras te rodea
        const want = d < 100 ? -1 : d > 160 ? 1 : 0, side = ang + Math.PI / 2;
        const s = this.rage * dt;
        moveEntity(this, (Math.cos(ang) * want * 40 + Math.cos(side) * 25) * s, (Math.sin(ang) * want * 40 + Math.sin(side) * 25) * s);
        if (this.timer <= 0) this.nextAttack();
        break;
      }
      case 'fadeOut':
        this.alpha = clamp(this.timer / 0.35, 0, 1);
        if (this.timer <= 0) {
          spawnParticles(this.x, this.y, 14, '#7dff6b', 70, 0.5, 2);
          [this.x, this.y] = this.randomSpot(110);
          this.state = 'fadeIn'; this.timer = 0.35;
        }
        break;
      case 'fadeIn':
        this.alpha = 1 - clamp(this.timer / 0.35, 0, 1);
        if (this.timer <= 0) {
          this.hidden = false; this.alpha = 1;
          spawnParticles(this.x, this.y, 14, '#7dff6b', 70, 0.5, 2);
          this.ring(this.phase2 ? 20 : 14, 70, '#7dff6b', rnd(0, 1));
          this.toMove();
        }
        break;
      case 'summon':
        this.charge = 1 - this.timer / 0.8;
        if (this.timer <= 0) { this.summon('skeleton', this.phase2 ? 3 : 2, 36); this.toMove(); }
        break;
      case 'orbs':
        this.charge = 1 - this.timer / 0.7;
        if (this.timer <= 0) {
          const n = this.phase2 ? 5 : 3;
          for (let i = 0; i < n; i++) {
            enemyShoot(this.x, this.y - 14, ang + (i - (n - 1) / 2) * 0.55, 62, { color: '#7dff6b', r: 5, life: 6, homing: 3.2, turn: 2.3 });
          }
          Sfx.play('teleport');
          this.toMove(1.2);
        }
        break;
      case 'spears':
        this.shotT -= dt;
        if (this.shotT <= 0) {
          if (this.count > 0) {
            this.count--; this.shotT = 0.5;
            // "Lanza de hueso": 4 balas en fila con distinta velocidad
            for (let k = 0; k < 4; k++) enemyShoot(this.x, this.y, ang, 130 + k * 28, { color: '#e8e0d0', r: 3 });
            Sfx.play('eshoot');
          } else this.toMove();
        }
        break;
    }
    this.rageFx();
    this.contact();
  }

  draw(c) {
    drawShadow(c, this.x, this.y + 14, 10 * this.alpha, 3 * this.alpha);
    const bob = Math.sin(this.anim * 2.5) * 2;
    this.drawScaled(c, 'necro', 3, 0, bob - 4, this.alpha);
    // Báculo con gema
    const sx = this.x + 14 * this.face, top = this.y - 26 + bob;
    c.globalAlpha = this.alpha;
    c.fillStyle = '#5c3a28'; c.fillRect(Math.round(sx), Math.round(top), 2, 34);
    const glow = 3 + this.charge * 6 + Math.sin(this.anim * 6);
    c.fillStyle = 'rgba(125,255,107,0.35)';
    c.beginPath(); c.arc(sx + 1, top, Math.max(1, glow + 2), 0, Math.PI * 2); c.fill();
    c.fillStyle = '#c8ffb8';
    c.beginPath(); c.arc(sx + 1, top, Math.max(1, glow * 0.5), 0, Math.PI * 2); c.fill();
    c.globalAlpha = 1;
  }
}

// ---------- 3. Gólem de Lava: embestidas, charcos de lava y rocas que explotan ----------
class LavaGolem extends BossBase {
  constructor(x, y) {
    super(x, y, { hw: 13, hh: 11, r: 19, hp: 1.3, color: '#ff7a1a' });
    this.dashA = 0;
  }

  nextAttack() {
    const a = this.pick(['charge', 'pools', 'rocks', 'slam']);
    if (a === 'charge') { this.state = 'aimCharge'; this.timer = 0.85; Sfx.play('roar'); }
    if (a === 'pools') { this.state = 'pools'; this.timer = 0.6; }
    if (a === 'rocks') { this.state = 'rocks'; this.timer = 0.5; }
    if (a === 'slam') { this.state = 'slam'; this.count = 3; this.shotT = 0.4; }
  }

  update(dt) {
    this.tick(dt);
    const p = G.player, ang = this.aim();
    switch (this.state) {
      case 'intro':
        if (this.timer <= 0) this.toMove();
        break;
      case 'move':
        moveEntity(this, Math.cos(ang) * 20 * this.rage * dt, Math.sin(ang) * 20 * this.rage * dt);
        if (this.timer <= 0) this.nextAttack();
        break;
      case 'aimCharge':
        if (this.timer > 0.3) this.dashA = ang; // apunta y luego se fija
        if (this.timer <= 0) { this.state = 'dash'; this.timer = 1.2; }
        break;
      case 'dash': {
        const sp = 260 * this.rage;
        const res = moveEntity(this, Math.cos(this.dashA) * sp * dt, Math.sin(this.dashA) * sp * dt);
        if (Math.random() < 0.7) G.particles.push({ x: this.x + rnd(-10, 10), y: this.y + 10, vx: 0, vy: -15, life: 0.4, max: 0.4, color: '#ff7a1a', size: 3 });
        if (res.hitX || res.hitY || this.timer <= 0) {
          if (res.hitX || res.hitY) {
            addShake(10); Sfx.play('land');
            this.ring(this.phase2 ? 16 : 12, 95, '#ff9a3c', rnd(0, 1), 4.5);
            spawnParticles(this.x, this.y, 20, '#a3a3b5', 120, 0.5, 3);
          }
          this.state = 'stunned'; this.timer = 1.0;
        }
        break;
      }
      case 'stunned':
        if (this.timer <= 0) this.toMove(0.6);
        break;
      case 'pools':
        if (this.timer <= 0) {
          const n = this.phase2 ? 6 : 4;
          G.hazards.push({ x: p.x, y: p.y, r: 18, warn: 0.9, t: 4.5 });
          for (let i = 1; i < n; i++) {
            const [x, y] = this.randomSpot(0);
            G.hazards.push({ x, y, r: 18, warn: 0.9 + i * 0.1, t: 4.5 });
          }
          Sfx.play('spawn');
          this.toMove();
        }
        break;
      case 'rocks':
        if (this.timer <= 0) {
          const n = this.phase2 ? 4 : 3;
          for (let i = 0; i < n; i++) {
            enemyShoot(this.x, this.y - 10, ang + (i - (n - 1) / 2) * 0.35, 95, {
              color: '#c4661f', r: 6, life: 1.0, split: { n: 8, speed: 110, color: '#ffb547' },
            });
          }
          Sfx.play('shotgun');
          this.toMove();
        }
        break;
      case 'slam':
        this.shotT -= dt;
        if (this.shotT <= 0) {
          if (this.count > 0) {
            this.count--; this.shotT = 0.38;
            this.ring(this.phase2 ? 22 : 18, 80, '#ff5a1f', this.count * 0.17);
            addShake(4); Sfx.play('land');
          } else this.toMove();
        }
        break;
    }
    this.rageFx();
    this.contact();
  }

  draw(c) {
    if (this.state === 'aimCharge') {
      const [ex, ey] = rayEnd(this.x, this.y, this.dashA, 400);
      c.strokeStyle = 'rgba(255,90,40,' + (0.4 + 0.4 * Math.abs(Math.sin(G.time * 16))) + ')';
      c.lineWidth = 2; c.setLineDash([6, 4]);
      c.beginPath(); c.moveTo(this.x, this.y); c.lineTo(ex, ey); c.stroke();
      c.setLineDash([]);
    }
    drawShadow(c, this.x, this.y + 18, 20, 6);
    const shake = this.state === 'aimCharge' ? rnd(-1.5, 1.5) : 0;
    this.drawScaled(c, 'lavagolem', 3, shake, -4);
    // Grietas de lava que laten
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = 'rgba(255,110,30,' + (0.18 + 0.1 * Math.sin(this.anim * 5)) + ')';
    c.beginPath(); c.ellipse(this.x, this.y - 4, 18, 14, 0, 0, Math.PI * 2); c.fill();
    c.restore();
    if (this.state === 'stunned') {
      for (let i = 0; i < 3; i++) {
        const a = this.anim * 4 + i * 2.1;
        c.fillStyle = '#ffe066';
        c.fillRect(Math.round(this.x + Math.cos(a) * 12), Math.round(this.y - 30 + Math.sin(a) * 3), 2, 2);
      }
    }
  }
}

// ---------- 4. Reina Arácnida: telarañas que frenan, arañitas y saltos ----------
class SpiderQueen extends BossBase {
  constructor(x, y) {
    super(x, y, { hw: 12, hh: 8, r: 15, hp: 0.9, color: '#8e3fa0' });
    this.strafe = 1; this.tx = x; this.ty = y; this.sx = x; this.sy = y; this.sweepA = 0;
  }

  nextAttack() {
    const a = this.pick(['webs', 'spawn', 'leap', 'sweep']);
    if (a === 'webs') { this.state = 'webs'; this.count = this.phase2 ? 3 : 2; this.shotT = 0.3; }
    if (a === 'spawn') { this.state = 'spawn'; this.timer = 0.7; }
    if (a === 'leap') { this.state = 'leapUp'; this.timer = 0.35; Sfx.play('jump'); }
    if (a === 'sweep') { this.state = 'sweep'; this.timer = 1.5; this.shotT = 0; this.sweepA = this.aim(); }
  }

  update(dt) {
    this.tick(dt);
    const ang = this.aim();
    switch (this.state) {
      case 'intro':
        if (this.timer <= 0) this.toMove();
        break;
      case 'move': {
        if (Math.random() < dt * 0.6) this.strafe *= -1;
        const a = ang + this.strafe * 0.9, sp = 45 * this.rage;
        moveEntity(this, Math.cos(a) * sp * dt, Math.sin(a) * sp * dt);
        if (this.timer <= 0) this.nextAttack();
        break;
      }
      case 'webs':
        this.shotT -= dt;
        if (this.shotT <= 0) {
          if (this.count > 0) {
            this.count--; this.shotT = 0.55;
            const n = this.phase2 ? 7 : 5;
            for (let i = 0; i < n; i++) enemyShoot(this.x, this.y, ang + (i - (n - 1) / 2) * 0.22, 115, { color: '#e8e8f0', r: 4.5, slow: true });
            Sfx.play('eshoot');
          } else this.toMove();
        }
        break;
      case 'spawn':
        if (this.timer <= 0) { this.summon('spiderling', this.phase2 ? 5 : 3, 30); this.toMove(); }
        break;
      case 'leapUp':
        this.z += 240 * dt;
        if (this.timer <= 0) {
          this.state = 'leapAir'; this.timer = 0.6;
          [this.tx, this.ty] = this.randomSpot(90);
          this.sx = this.x; this.sy = this.y;
        }
        break;
      case 'leapAir': {
        const k = clamp(1 - this.timer / 0.6, 0, 1);
        moveEntity(this, lerp(this.sx, this.tx, k) - this.x, lerp(this.sy, this.ty, k) - this.y);
        this.z = 84 * (1 - k);
        if (this.timer <= 0) {
          this.z = 0;
          this.ring(12, 100, '#c77dff', rnd(0, 1));
          addShake(6); Sfx.play('land');
          // Al caer barre la zona con un abanico
          this.state = 'sweep'; this.timer = 1.2; this.shotT = 0.15; this.sweepA = this.aim();
        }
        break;
      }
      case 'sweep': {
        this.shotT -= dt;
        if (this.shotT <= 0) {
          this.shotT = this.phase2 ? 0.045 : 0.06;
          const k = 1 - this.timer / 1.5;
          const off = this.phase2 ? Math.sin(k * Math.PI * 2) * 1.3 : lerp(-1.3, 1.3, k);
          enemyShoot(this.x, this.y, this.sweepA + off, 140, { color: '#ff4a6e', r: 3.5 });
          Sfx.play('eshoot');
        }
        if (this.timer <= 0) this.toMove();
        break;
      }
    }
    this.rageFx();
    this.contact();
  }

  draw(c) {
    if (this.state === 'leapAir') this.drawTarget(c, this.tx, this.ty);
    const shs = 1 - Math.min(0.6, this.z / 150);
    drawShadow(c, this.x, this.y + 12, 20 * shs, 5 * shs);
    const twitch = this.state === 'move' ? Math.round(Math.sin(this.anim * 18)) : 0;
    this.drawScaled(c, 'spider', 3, 0, twitch - 2);
  }
}

// ---------- 5. Ojo del Abismo: láser giratorio, flores de balas, murciélagos ----------
class AbyssEye extends BossBase {
  constructor(x, y) {
    super(x, y, { hw: 12, hh: 12, r: 16, hp: 1.0, color: '#c77dff' });
    this.beamA = 0; this.beamOn = false; this.beamWarn = false; this.beamDir = 1;
  }

  nextAttack() {
    const a = this.pick(['laser', 'flower', 'tears', 'summon']);
    if (a === 'laser') { this.state = 'laserAim'; this.timer = 1.0; this.beamA = this.aim(); this.beamWarn = true; }
    if (a === 'flower') { this.state = 'flower'; this.count = 4; this.shotT = 0.2; }
    if (a === 'tears') { this.state = 'tears'; this.timer = 2.0; this.shotT = 0; }
    if (a === 'summon') { this.state = 'summon'; this.timer = 0.7; }
  }

  beams() { return this.phase2 ? [this.beamA, this.beamA + Math.PI] : [this.beamA]; }

  update(dt) {
    this.tick(dt);
    const p = G.player, ang = this.aim();
    switch (this.state) {
      case 'intro':
        if (this.timer <= 0) this.toMove();
        break;
      case 'move': {
        // Flota alrededor del centro de la sala
        const r = G.activeRoom;
        const cx = r ? (r.cx + 0.5) * TILE : this.x, cy = r ? (r.cy + 0.5) * TILE : this.y;
        const tx = cx + Math.cos(this.anim * 0.5) * 50, ty = cy + Math.sin(this.anim * 0.7) * 30;
        const a = angleTo(this.x, this.y, tx, ty), d = dist(this.x, this.y, tx, ty);
        const sp = Math.min(d, 30 * this.rage) * dt;
        moveEntity(this, Math.cos(a) * sp, Math.sin(a) * sp);
        if (this.timer <= 0) this.nextAttack();
        break;
      }
      case 'laserAim':
        // Sigue al jugador despacio mientras carga
        this.beamA += clamp(angleDiff(this.beamA, ang), -1.6 * dt, 1.6 * dt);
        if (this.timer <= 0) {
          this.beamWarn = false; this.beamOn = true;
          this.state = 'laser'; this.timer = 1.8;
          this.beamDir = angleDiff(this.beamA, ang) >= 0 ? 1 : -1;
          Sfx.play('laser'); addShake(4);
        }
        break;
      case 'laser':
        this.beamA += this.beamDir * 0.95 * this.rage * dt;
        if (!p.dead) {
          for (const a of this.beams()) {
            const [ex, ey] = rayEnd(this.x, this.y, a);
            if (distToSegment(p.x, p.y, this.x, this.y, ex, ey) < 7) p.hurt();
          }
        }
        if (Math.random() < 0.4) Sfx.play('eshoot');
        if (this.timer <= 0) { this.beamOn = false; this.toMove(); }
        break;
      case 'flower':
        this.shotT -= dt;
        if (this.shotT <= 0) {
          if (this.count > 0) {
            this.count--; this.shotT = 0.32;
            this.ring(this.phase2 ? 16 : 12, 85, this.count % 2 ? '#c77dff' : '#ff5cf0', this.count * Math.PI / 12);
          } else this.toMove();
        }
        break;
      case 'tears':
        this.shotT -= dt;
        if (this.shotT <= 0) {
          this.shotT = this.phase2 ? 0.045 : 0.065;
          enemyShoot(this.x, this.y, rnd(0, Math.PI * 2), rnd(60, 120), { color: '#9ad0ff', r: 3 });
          Sfx.play('eshoot');
        }
        if (this.timer <= 0) this.toMove();
        break;
      case 'summon':
        if (this.timer <= 0) { this.summon('bat', this.phase2 ? 4 : 3, 34); this.toMove(); }
        break;
    }
    this.rageFx();
    this.contact();
  }

  draw(c) {
    drawShadow(c, this.x, this.y + 16, 16, 4);
    const fy = this.y - 8 + Math.sin(this.anim * 2) * 3;
    // Tentáculos
    c.strokeStyle = '#2b2140'; c.lineWidth = 3;
    for (let i = 0; i < 5; i++) {
      const bx = this.x - 10 + i * 5;
      c.beginPath(); c.moveTo(bx, fy + 8);
      for (let s = 1; s <= 4; s++) c.lineTo(bx + Math.sin(this.anim * 4 + i + s) * 3, fy + 8 + s * 5);
      c.stroke();
    }
    const white = this.flash > 0;
    c.fillStyle = '#1a1c2c';
    c.beginPath(); c.arc(this.x, fy, 16, 0, Math.PI * 2); c.fill();
    c.fillStyle = white ? '#ffffff' : '#efe4f0';
    c.beginPath(); c.arc(this.x, fy, 14, 0, Math.PI * 2); c.fill();
    if (!white) {
      c.strokeStyle = '#e43b44'; c.lineWidth = 1;
      for (const [a, l] of [[0.4, 9], [2.2, 8], [3.6, 10], [5.2, 7]]) {
        c.beginPath(); c.moveTo(this.x + Math.cos(a) * 14, fy + Math.sin(a) * 14);
        c.lineTo(this.x + Math.cos(a + 0.3) * (14 - l), fy + Math.sin(a + 0.3) * (14 - l)); c.stroke();
      }
      // Iris que mira al jugador
      const la = this.state === 'laser' || this.state === 'laserAim' ? this.beamA : this.aim();
      const ix = this.x + Math.cos(la) * 5, iy = fy + Math.sin(la) * 5;
      c.fillStyle = this.phase2 ? '#ff3b5c' : '#c77dff';
      c.beginPath(); c.arc(ix, iy, 6.5, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#1a1c2c';
      c.beginPath(); c.arc(ix, iy, 3, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ffffff';
      c.fillRect(Math.round(ix - 3), Math.round(iy - 4), 2, 2);
    }
  }

  // Se dibuja después de la iluminación para que el láser brille
  drawFx(c) {
    if (!this.beamWarn && !this.beamOn) return;
    const fy = this.y;
    for (const a of this.beams()) {
      const [ex, ey] = rayEnd(this.x, fy, a);
      if (this.beamWarn) {
        c.strokeStyle = 'rgba(255,60,90,' + (0.3 + 0.4 * Math.abs(Math.sin(G.time * 20))) + ')';
        c.lineWidth = 1;
        c.beginPath(); c.moveTo(this.x, fy); c.lineTo(ex, ey); c.stroke();
      } else {
        c.strokeStyle = 'rgba(255,60,90,0.45)'; c.lineWidth = 12;
        c.beginPath(); c.moveTo(this.x, fy); c.lineTo(ex, ey); c.stroke();
        c.strokeStyle = '#ff9aa8'; c.lineWidth = 5;
        c.beginPath(); c.moveTo(this.x, fy); c.lineTo(ex, ey); c.stroke();
        c.strokeStyle = '#ffffff'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(this.x, fy); c.lineTo(ex, ey); c.stroke();
        if (Math.random() < 0.6) spawnParticles(ex, ey, 2, '#ff9aa8', 60, 0.25, 2);
      }
    }
  }
}

const BOSS_TYPES = [KingSlime, Necromancer, LavaGolem, SpiderQueen, AbyssEye];
function createBoss(x, y) { return new BOSS_TYPES[bossIndex(G.floor)](x, y); }
