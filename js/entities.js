'use strict';

// ---------- Utilidades de efectos ----------
function spawnParticles(x, y, n, color, speed, life, size) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = speed * rnd(0.3, 1);
    const l = life * rnd(0.6, 1.2);
    G.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: l, max: l, color, size: size || 2 });
  }
}
function addText(x, y, text, color, life = 0.8) {
  G.texts.push({ x, y, text, color, life, max: life });
}
function addShake(v) { G.shake = Math.max(G.shake, v); }

function enemyShoot(x, y, ang, speed, opts = {}) {
  const sp = speed * (1 + 0.1 * (G.floor - 1));
  G.bullets.push({
    x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, r: opts.r || 3.5, dmg: 1,
    from: 'e', color: opts.color || '#ff3b6b', life: opts.life || 4,
  });
}

function dropPickup(kind, x, y, extra) {
  const a = rnd(0, Math.PI * 2), s = rnd(30, 80);
  G.pickups.push(Object.assign({ kind, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0 }, extra || {}));
}

function drawShadow(c, x, y, rx, ry) {
  c.fillStyle = 'rgba(0,0,0,0.35)';
  c.beginPath();
  c.ellipse(Math.round(x), Math.round(y), rx, ry, 0, 0, Math.PI * 2);
  c.fill();
}

// ---------- Jugador ----------
class Player {
  constructor(x, y) {
    this.x = x; this.y = y; this.hw = 5; this.hh = 5; this.r = 6;
    this.lives = 3; this.maxLives = 3;
    this.maxShield = 3; this.shield = 3;
    this.sinceHit = 99; this.regenT = 0;
    this.coins = 0;
    this.weapons = [{ id: 'pistol', rar: 0 }]; this.cur = 0;
    this.cool = 0; this.aim = 0;
    this.invuln = 0;
    this.roll = 0; this.rollCd = 0; this.rdx = 1; this.rdy = 0;
    this.walkT = 0; this.moving = false; this.face = 1;
    this.recoil = 0; this.swing = 0; this.swingDir = 1;
    this.dead = false; this.wheelCd = 0;
    this.ult = 0; this.ultT = 0;
  }

  get item() { return this.weapons[this.cur]; }
  get weapon() { return WEAPONS[this.item.id]; }

  update(dt) {
    if (this.dead) return;
    let mx = 0, my = 0;
    if (Input.down('KeyA') || Input.down('ArrowLeft')) mx -= 1;
    if (Input.down('KeyD') || Input.down('ArrowRight')) mx += 1;
    if (Input.down('KeyW') || Input.down('ArrowUp')) my -= 1;
    if (Input.down('KeyS') || Input.down('ArrowDown')) my += 1;
    const len = Math.hypot(mx, my);
    if (len) { mx /= len; my /= len; }
    this.moving = len > 0;

    this.rollCd -= dt;
    if (Input.hit('Space') && this.roll <= 0 && this.rollCd <= 0) {
      if (!len) { mx = Math.cos(this.aim); my = Math.sin(this.aim); }
      this.roll = 0.24; this.rollCd = 0.75; this.rdx = mx; this.rdy = my;
      Sfx.play('roll');
    }

    let vx, vy;
    if (this.roll > 0) {
      this.roll -= dt;
      vx = this.rdx * 240; vy = this.rdy * 240;
      if (Math.random() < 0.6) {
        G.particles.push({ x: this.x + rnd(-3, 3), y: this.y + 6, vx: 0, vy: -10, life: 0.3, max: 0.3, color: '#8b8fb0', size: 2 });
      }
    } else {
      const sp = this.ultT > 0 ? 115 : 95;
      vx = mx * sp; vy = my * sp;
    }
    moveEntity(this, vx * dt, vy * dt);
    if (this.moving || this.roll > 0) this.walkT += dt;

    this.aim = angleTo(this.x, this.y, Input.mouse.wx, Input.mouse.wy);
    this.face = Math.cos(this.aim) >= 0 ? 1 : -1;

    this.wheelCd -= dt;
    if (Input.hit('KeyQ')) this.switchWeapon();
    if (Input.hit('KeyR') || Input.hit('Ult')) this.activateUlt();
    if (this.ultT > 0) {
      this.ultT -= dt;
      if (Math.random() < 0.5) {
        G.particles.push({ x: this.x + rnd(-6, 6), y: this.y + rnd(-4, 8), vx: rnd(-8, 8), vy: -40, life: 0.4, max: 0.4, color: Math.random() < 0.5 ? '#ff3b3b' : '#ffb547', size: 2 });
      }
      if (this.ultT <= 0) addText(this.x, this.y - 22, 'FURIA TERMINADA', '#9a93b8', 1);
    }
    this.cool -= dt;
    if (Input.mouse.down && this.cool <= 0 && this.roll <= 0) fireWeapon(this);
    this.recoil = Math.max(0, this.recoil - dt * 20);
    this.swing = Math.max(0, this.swing - dt);
    this.invuln -= dt;

    // Escudo: se recarga solo si pasas 3.5 s sin recibir daño
    this.sinceHit += dt;
    if (this.sinceHit > 3.5 && this.shield < this.maxShield) {
      this.regenT += dt;
      if (this.regenT >= 1) {
        this.regenT = 0; this.shield++;
        Sfx.play('regen');
        spawnParticles(this.x, this.y, 6, '#5ab8ff', 40, 0.4, 2);
      }
    } else this.regenT = 0;
  }

  // FURIA: se carga haciendo daño (ULT_CHARGE puntos de daño la llenan)
  chargeUlt(amount) {
    if (this.ultT > 0 || this.ult >= 1 || this.dead) return;
    this.ult = Math.min(1, this.ult + amount / ULT_CHARGE);
    if (this.ult >= 1) {
      Sfx.play('ultReady');
      addText(this.x, this.y - 24, 'FURIA LISTA: R', '#ff5a3c', 1.4);
    }
  }

  activateUlt() {
    if (this.ult < 1 || this.ultT > 0 || this.dead || this.roll > 0) {
      if (this.ult < 1 && this.ultT <= 0) Sfx.play('empty');
      return;
    }
    this.ult = 0;
    this.ultT = ULT_TIME;
    this.invuln = Math.max(this.invuln, 0.5);
    G.stats.ults++;
    Sfx.play('ult');
    addShake(8);
    showBanner('¡FURIA!', 'Daño x2 durante ' + ULT_TIME + ' s', '#ff5a3c', 1.3);
    // Onda expansiva: daña a los cercanos y borra las balas enemigas
    G.effects.push({ type: 'wave', x: this.x, y: this.y, life: 0.4, max: 0.4, range: ULT_WAVE_RANGE });
    for (const e of G.enemies) {
      if (e.dead || e.air) continue;
      const d = dist(this.x, this.y, e.x, e.y);
      if (d < ULT_WAVE_RANGE + e.r) {
        const a = angleTo(this.x, this.y, e.x, e.y);
        e.damage(ULT_WAVE_DMG, Math.cos(a) * 200, Math.sin(a) * 200);
      }
    }
    for (const b of G.bullets) {
      if (b.from === 'e' && dist(this.x, this.y, b.x, b.y) < ULT_WAVE_RANGE + 30) {
        b.dead = true;
        spawnParticles(b.x, b.y, 3, '#ff9a3c', 40, 0.25, 2);
      }
    }
    for (let i = 0; i < 32; i++) {
      const a = i / 32 * Math.PI * 2;
      G.particles.push({ x: this.x, y: this.y, vx: Math.cos(a) * 220, vy: Math.sin(a) * 220, life: 0.35, max: 0.35, color: '#ff5a3c', size: 3 });
    }
  }

  switchWeapon() {
    if (this.weapons.length < 2 || this.wheelCd > 0) return;
    this.wheelCd = 0.15;
    this.cur = (this.cur + 1) % this.weapons.length;
    this.cool = Math.max(this.cool, 0.12);
    Sfx.play('switch');
  }

  hurt() {
    if (this.dead || this.invuln > 0 || this.roll > 0 || G.state !== 'play') return false;
    this.sinceHit = 0; this.regenT = 0;
    G.onPlayerHit();
    // El escudo absorbe el golpe; sin escudo se pierde una vida (las vidas no se recuperan)
    if (this.shield > 0) {
      this.shield--;
      this.invuln = 0.8;
      Sfx.play('shield');
      addShake(3);
      spawnParticles(this.x, this.y, 10, '#5ab8ff', 90, 0.4, 2);
      return true;
    }
    this.lives--;
    this.invuln = 2.0;
    addShake(9);
    G.flash = 0.35;
    Sfx.play('hurt');
    spawnParticles(this.x, this.y, 24, '#ff3b5c', 140, 0.6, 3);
    G.onLifeLost();
    if (this.lives <= 0) G.playerDied();
    else this.shield = this.maxShield;
    return true;
  }

  draw(c) {
    if (this.dead) return;
    drawShadow(c, this.x, this.y + 7, 6, 2.5);
    if (this.ultT > 0) {
      const pulse = 11 + Math.sin(G.time * 14) * 2;
      c.fillStyle = 'rgba(255,70,50,0.22)';
      c.beginPath(); c.arc(this.x, this.y, pulse + 4, 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(255,140,60,0.8)'; c.lineWidth = 1;
      c.beginPath(); c.arc(this.x, this.y, pulse, 0, Math.PI * 2); c.stroke();
    }
    if (this.invuln > 0 && this.roll <= 0 && Math.floor(G.time * 18) % 2 === 0) return;
    const step = Math.floor(this.walkT * 9) % 2;
    const img = this.moving && step ? SPR.knightB : SPR.knightA;
    const bob = this.moving ? step : 0;
    if (this.roll > 0) {
      const k = 1 - this.roll / 0.24;
      c.save();
      c.translate(Math.round(this.x), Math.round(this.y - 2));
      c.rotate(k * Math.PI * 2 * (this.rdx >= 0 ? 1 : -1));
      c.drawImage(img, -img.width / 2, -img.height / 2);
      c.restore();
      return;
    }
    drawSprite(c, img, this.x, this.y - 3 - bob, this.face < 0);
    this.drawWeapon(c);
  }

  drawWeapon(c) {
    const w = this.weapon, img = SPR[w.spr];
    let a = this.aim;
    if (w.melee && this.swing > 0) a += this.swingDir * (1 - 2 * (1 - this.swing / 0.18)) * 1.2;
    c.save();
    c.translate(Math.round(this.x), Math.round(this.y + 1));
    c.rotate(a);
    if (Math.cos(this.aim) < 0) c.scale(1, -1);
    c.drawImage(img, Math.round(3 - this.recoil), -Math.floor(img.height / 2));
    c.restore();
  }
}

// ---------- Enemigos ----------
const ENEMY_DEFS = {
  slime:     { hp: 9,  r: 6, pts: 25, spr: 'slime',     hw: 5, hh: 4, color: '#38b764' },
  minislime: { hp: 4,  r: 4, pts: 10, spr: 'minislime', hw: 3, hh: 3, color: '#73eff7' },
  bat:       { hp: 5,  r: 5, pts: 35, spr: 'batA',      hw: 4, hh: 3, color: '#8e3fa0' },
  skeleton:  { hp: 11, r: 6, pts: 50, spr: 'skeleton',  hw: 4, hh: 5, color: '#e8e8e8' },
  mage:      { hp: 13, r: 6, pts: 60, spr: 'mage',      hw: 4, hh: 5, color: '#b05ad6' },
  golem:     { hp: 42, r: 9, pts: 90, spr: 'golem',     hw: 7, hh: 6, color: '#a3a3b5' },
};

class Enemy {
  constructor(type, x, y) {
    const d = ENEMY_DEFS[type];
    this.type = type; this.def = d;
    this.x = x; this.y = y; this.hw = d.hw; this.hh = d.hh; this.r = d.r;
    this.maxHp = this.hp = Math.round(d.hp * (1 + 0.45 * (G.floor - 1)));
    this.flash = 0; this.kx = 0; this.ky = 0;
    this.state = 'idle'; this.timer = rnd(0.3, 0.9);
    this.atk = rnd(1.0, 2.0);
    this.wob = rnd(0, 6.28); this.anim = rnd(0, 1);
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.dead = false; this.face = 1;
  }

  update(dt) {
    const p = G.player;
    this.flash -= dt; this.anim += dt;
    const dx = p.x - this.x, dy = p.y - this.y;
    const d = Math.hypot(dx, dy) || 1, ang = Math.atan2(dy, dx);
    this.face = dx >= 0 ? 1 : -1;
    const fm = 1 + 0.12 * (G.floor - 1);
    const ca = this.type === 'mage' ? ang : chaseAngle(this);
    let mvx = 0, mvy = 0;

    switch (this.type) {
      case 'slime':
      case 'minislime': {
        this.timer -= dt;
        if (this.state === 'idle') {
          if (this.timer <= 0) { this.state = 'hop'; this.timer = 0.38; this.hopA = ca + rnd(-0.3, 0.3); }
        } else {
          const sp = (this.type === 'slime' ? 75 : 95) * fm;
          mvx = Math.cos(this.hopA) * sp; mvy = Math.sin(this.hopA) * sp;
          if (this.timer <= 0) { this.state = 'idle'; this.timer = rnd(0.5, 0.9) / fm; }
        }
        break;
      }
      case 'bat': {
        this.wob += dt * 6;
        if (this.state === 'retreat') {
          this.timer -= dt;
          mvx = -Math.cos(ang) * 70; mvy = -Math.sin(ang) * 70;
          if (this.timer <= 0) this.state = 'idle';
        } else {
          const sp = 78 * fm, perp = ca + Math.PI / 2, w = Math.sin(this.wob) * 60;
          mvx = Math.cos(ca) * sp + Math.cos(perp) * w;
          mvy = Math.sin(ca) * sp + Math.sin(perp) * w;
        }
        break;
      }
      case 'skeleton': {
        this.atk -= dt;
        if (this.state === 'aim') {
          this.timer -= dt;
          if (this.timer <= 0) {
            enemyShoot(this.x, this.y, ang, 150, { color: '#ffd0a0', r: 3 });
            Sfx.play('eshoot');
            this.state = 'idle'; this.atk = rnd(1.5, 2.3) / fm;
            if (Math.random() < 0.4) this.strafe *= -1;
          }
        } else {
          const sp = 42;
          if (d > 140 || ca !== ang) { mvx = Math.cos(ca) * sp; mvy = Math.sin(ca) * sp; }
          else if (d < 85) { mvx = -dx / d * sp; mvy = -dy / d * sp; }
          else { const pa = ang + Math.PI / 2 * this.strafe; mvx = Math.cos(pa) * sp * 0.7; mvy = Math.sin(pa) * sp * 0.7; }
          if (this.atk <= 0 && d < 260 && ca === ang) { this.state = 'aim'; this.timer = 0.45; }
        }
        break;
      }
      case 'mage': {
        this.atk -= dt;
        if (this.state === 'cast') {
          this.timer -= dt;
          if (this.timer <= 0) {
            const n = G.floor >= 3 ? 12 : 8, off = rnd(0, Math.PI * 2);
            for (let i = 0; i < n; i++) enemyShoot(this.x, this.y, off + i * Math.PI * 2 / n, 85, { color: '#c77dff', r: 4 });
            Sfx.play('eshoot');
            this.state = 'idle'; this.atk = rnd(2.6, 3.4) / fm;
          }
        } else {
          this.wob += dt * 0.8;
          mvx = Math.cos(this.wob) * 20; mvy = Math.sin(this.wob * 1.3) * 20;
          if (this.atk <= 0) { this.teleport(); this.state = 'cast'; this.timer = 0.65; }
        }
        break;
      }
      case 'golem': {
        this.atk -= dt;
        if (this.state === 'wind') {
          this.timer -= dt;
          if (this.timer <= 0) {
            const n = 14, off = rnd(0, 1);
            for (let i = 0; i < n; i++) enemyShoot(this.x, this.y, off + i * Math.PI * 2 / n, 105, { color: '#ff9a3c', r: 4 });
            addShake(5); Sfx.play('land');
            spawnParticles(this.x, this.y + 6, 12, '#a3a3b5', 80, 0.4, 2);
            this.state = 'idle'; this.atk = rnd(3, 4) / fm;
          }
        } else {
          mvx = Math.cos(ca) * 26 * fm; mvy = Math.sin(ca) * 26 * fm;
          if (this.atk <= 0 && d < 200) { this.state = 'wind'; this.timer = 0.7; }
        }
        break;
      }
    }

    mvx += this.kx; mvy += this.ky;
    const decay = Math.max(0, 1 - dt * 10);
    this.kx *= decay; this.ky *= decay;
    moveEntity(this, mvx * dt, mvy * dt);

    if (!p.dead && dist(this.x, this.y, p.x, p.y) < this.r + p.r - 1) {
      if (p.hurt() && this.type === 'bat') { this.state = 'retreat'; this.timer = 0.6; }
    }
  }

  teleport() {
    const r = G.activeRoom;
    if (!r) return;
    const p = G.player;
    for (let i = 0; i < 25; i++) {
      const tx = r.x0 + 1 + Math.floor(Math.random() * (r.w - 2));
      const ty = r.y0 + 1 + Math.floor(Math.random() * (r.h - 2));
      const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE;
      if (dist(x, y, p.x, p.y) < 90 || boxCollides(x, y, this.hw, this.hh)) continue;
      spawnParticles(this.x, this.y, 10, '#c77dff', 60, 0.4, 2);
      this.x = x; this.y = y;
      spawnParticles(x, y, 10, '#c77dff', 60, 0.4, 2);
      Sfx.play('teleport');
      return;
    }
  }

  damage(amount, kx = 0, ky = 0) {
    if (this.dead) return;
    this.hp -= amount;
    G.player.chargeUlt(amount);
    this.flash = 0.08;
    const kb = this.type === 'golem' ? 0.2 : 1;
    this.kx += kx * kb; this.ky += ky * kb;
    addText(this.x + rnd(-4, 4), this.y - 12, String(Math.round(amount)), '#ffffff', 0.45);
    Sfx.play('hit');
    if (this.hp <= 0) this.die();
  }

  die() {
    this.dead = true;
    spawnParticles(this.x, this.y, 14, this.def.color, 110, 0.5, 2);
    Sfx.play('kill');
    addShake(2);
    G.onKill(this);
    const r = G.rng;
    let coins = r.int(0, this.type === 'golem' ? 3 : 1) + (r.chance(0.2) ? 1 : 0);
    if (this.type === 'minislime') coins = r.chance(0.2) ? 1 : 0;
    for (let i = 0; i < coins; i++) dropPickup('coin', this.x, this.y);
  }

  draw(c) {
    let name = this.def.spr;
    if (this.type === 'bat') name = Math.floor(this.anim * 10) % 2 ? 'batA' : 'batB';
    const img = SPR[name + (this.flash > 0 ? '_w' : '')];
    let oy = 0, sx = 0;
    if ((this.type === 'slime' || this.type === 'minislime') && this.state === 'hop') {
      oy = -Math.sin((1 - this.timer / 0.38) * Math.PI) * 5;
    }
    if (this.type === 'bat') oy = -7 + Math.sin(this.anim * 8) * 2;
    if (this.type === 'golem' && this.state === 'wind') sx = rnd(-1, 1);

    drawShadow(c, this.x, this.y + img.height / 2 - 1 - (this.type === 'bat' ? -4 : 0), this.r, this.r * 0.4);

    // Avisos de ataque
    if (this.type === 'skeleton' && this.state === 'aim') {
      const p = G.player, a = angleTo(this.x, this.y, p.x, p.y);
      c.strokeStyle = 'rgba(255,90,90,0.45)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(this.x, this.y); c.lineTo(this.x + Math.cos(a) * 60, this.y + Math.sin(a) * 60); c.stroke();
    }
    if (this.type === 'mage' && this.state === 'cast') {
      c.strokeStyle = 'rgba(199,125,255,0.8)'; c.lineWidth = 1;
      c.beginPath(); c.arc(this.x, this.y, 4 + (1 - this.timer / 0.65) * 14, 0, Math.PI * 2); c.stroke();
    }
    if (this.type === 'golem' && this.state === 'wind') {
      c.fillStyle = 'rgba(255,120,30,0.25)';
      c.beginPath(); c.arc(this.x, this.y, 16, 0, Math.PI * 2); c.fill();
    }

    drawSprite(c, img, this.x + sx, this.y + oy, this.face < 0);

    if (this.hp < this.maxHp) {
      const w = 14, y = this.y + oy - img.height / 2 - 4;
      c.fillStyle = '#1a1c2c'; c.fillRect(Math.round(this.x - w / 2) - 1, Math.round(y) - 1, w + 2, 3);
      c.fillStyle = '#e43b44'; c.fillRect(Math.round(this.x - w / 2), Math.round(y), Math.max(0, w * this.hp / this.maxHp), 1);
    }
  }
}

// ---------- Jefe: Rey Slime ----------
const BOSS_NAMES = ['REY SLIME', 'REY SLIME DE LA CRIPTA', 'REY SLIME DE FUEGO'];

class Boss {
  constructor(x, y) {
    this.type = 'boss'; this.isBoss = true;
    this.x = x; this.y = y; this.hw = 16; this.hh = 12; this.r = 18;
    this.maxHp = this.hp = 300 + 170 * (G.floor - 1);
    this.name = BOSS_NAMES[G.floor - 1];
    this.flash = 0; this.state = 'intro'; this.timer = 1.0;
    this.z = 0; this.spin = 0; this.shotT = 0; this.count = 0; this.last = '';
    this.dead = false; this.face = 1; this.anim = 0;
    this.tx = x; this.ty = y; this.sx = x; this.sy = y;
  }

  get phase2() { return this.hp < this.maxHp * 0.5; }
  get air() { return this.z > 6; }

  toMove(t) { this.state = 'move'; this.timer = t || rnd(1.0, 1.6); }

  nextAttack() {
    const opts = ['spiral', 'burst', 'jump', 'summon'].filter(o => o !== this.last);
    const a = opts[Math.floor(Math.random() * opts.length)];
    this.last = a;
    if (a === 'spiral') { this.state = 'spiral'; this.timer = 2.6; this.shotT = 0; }
    if (a === 'burst') { this.state = 'burst'; this.count = 3; this.shotT = 0.3; }
    if (a === 'jump') { this.state = 'jumpUp'; this.timer = 0.4; Sfx.play('jump'); }
    if (a === 'summon') { this.state = 'summon'; this.timer = 0.8; }
  }

  update(dt) {
    const p = G.player;
    this.anim += dt; this.flash -= dt;
    const ang = angleTo(this.x, this.y, p.x, p.y);
    this.face = p.x >= this.x ? 1 : -1;
    const sp2 = this.phase2 ? 1.35 : 1;
    this.timer -= dt * (this.state === 'move' ? sp2 : 1);

    switch (this.state) {
      case 'intro':
        if (this.timer <= 0) this.toMove();
        break;
      case 'move':
        moveEntity(this, Math.cos(ang) * 28 * sp2 * dt, Math.sin(ang) * 28 * sp2 * dt);
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
          const n = this.phase2 ? 24 : 16;
          for (let i = 0; i < n; i++) enemyShoot(this.x, this.y, i * Math.PI * 2 / n, 110, { color: '#ffcd75', r: 4 });
          addShake(10); Sfx.play('land');
          spawnParticles(this.x, this.y + 12, 24, '#38b764', 120, 0.5, 3);
          this.toMove(0.9);
        }
        break;
      }
      case 'summon':
        if (this.timer <= 0) {
          const n = this.phase2 ? 4 : 3;
          if (G.enemies.length < 8) {
            for (let i = 0; i < n; i++) {
              const a = i * Math.PI * 2 / n + rnd(0, 1);
              let x = this.x + Math.cos(a) * 40, y = this.y + Math.sin(a) * 40;
              if (boxCollides(x, y, 4, 4)) { x = this.x; y = this.y; }
              G.markers.push({ type: 'minislime', x, y, t: 0.6 });
            }
            Sfx.play('spawn');
          }
          this.toMove();
        }
        break;
    }

    if (this.phase2 && Math.random() < 0.15) {
      G.particles.push({ x: this.x + rnd(-16, 16), y: this.y + rnd(-10, 10) - this.z, vx: 0, vy: -20, life: 0.5, max: 0.5, color: '#ff5a5a', size: 2 });
    }
    if (!this.air && !p.dead && dist(this.x, this.y, p.x, p.y) < this.r + p.r - 2) p.hurt();
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
    spawnParticles(this.x, this.y, 60, '#38b764', 200, 0.9, 3);
    spawnParticles(this.x, this.y, 30, '#ffcd75', 160, 0.9, 2);
    Sfx.play('kill'); Sfx.play('victory');
    addShake(14);
    G.onKill(this);
    for (let i = 0; i < 8; i++) dropPickup('coin', this.x, this.y);
    if (G.floor < 3) dropPickup('weapon', this.x, this.y, { weapon: { id: G.rng.pick(WEAPON_POOL), rar: G.floor } });
    G.onBossKilled(this);
  }

  draw(c) {
    if (this.state === 'jumpAir' || this.state === 'jumpUp') {
      const tx = this.state === 'jumpAir' ? this.tx : G.player.x;
      const ty = this.state === 'jumpAir' ? this.ty : G.player.y;
      c.strokeStyle = 'rgba(255,60,90,0.85)'; c.lineWidth = 1.5;
      c.beginPath(); c.ellipse(tx, ty + 6, 22, 9, 0, 0, Math.PI * 2); c.stroke();
      c.fillStyle = 'rgba(255,60,90,0.15)'; c.fill();
    }
    const shs = 1 - Math.min(0.6, this.z / 150);
    drawShadow(c, this.x, this.y + 15, 22 * shs, 6 * shs);

    const img = SPR['king' + G.floor + (this.flash > 0 ? '_w' : '')];
    const sc = 4;
    let squash = this.state === 'move' ? Math.sin(this.anim * 7) * 0.06 : 0;
    if (this.state === 'jumpUp') squash = -0.15;
    if (this.state === 'intro') squash = Math.sin(this.anim * 20) * 0.08;
    const dw = img.width * sc * (1 + squash), dh = img.height * sc * (1 - squash);
    const dx = Math.round(this.x - dw / 2), dy = Math.round(this.y + 16 - dh - this.z);
    c.drawImage(img, dx, dy, dw, dh);
    const cr = SPR.crown;
    c.drawImage(cr, Math.round(this.x - cr.width), dy - cr.height * 2 + 6, cr.width * 2, cr.height * 2);
  }
}
