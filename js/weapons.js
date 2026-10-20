'use strict';

const WEAPONS = {
  pistol:  { id: 'pistol',  name: 'PISTOLA',       fem: true,  spr: 'w_pistol',  rate: 0.28,  dmg: 3, speed: 330, spread: 0.05, count: 1, color: '#ffe066', r: 3,   life: 1.2,  sfx: 'shoot',   recoil: 1 },
  shotgun: { id: 'shotgun', name: 'ESCOPETA',      fem: true,  spr: 'w_shotgun', rate: 0.7,   dmg: 2, speed: 300, spread: 0.55, count: 6, color: '#ffa24a', r: 2.5, life: 0.42, sfx: 'shotgun', recoil: 4,
             // Más daño cuanto más cerca: x1.8 a quemarropa, baja hasta x0.45 al final del alcance
             falloff: { near: 28, far: 120, max: 1.8, min: 0.45 } },
  smg:     { id: 'smg',     name: 'AMETRALLADORA', fem: true,  spr: 'w_smg',     rate: 0.1,   dmg: 2, speed: 380, spread: 0.16, count: 1, color: '#7cf5ff', r: 2.2, life: 0.9,  sfx: 'smg',     recoil: 1 },
  laser:   { id: 'laser',   name: 'ARCO LÁSER',    fem: false, spr: 'w_laser',   rate: 0.55,  dmg: 7, speed: 560, spread: 0,    count: 1, color: '#ff5cf0', r: 3,   life: 1,    sfx: 'laser',   recoil: 3, pierce: true },
  sword:   { id: 'sword',   name: 'ESPADA',        fem: true,  spr: 'w_sword',   rate: 0.36,  dmg: 7, melee: true, range: 32, arc: 2.0, sfx: 'slash', recoil: 0 },
};
const WEAPON_POOL = ['shotgun', 'smg', 'laser', 'sword'];

// Rarezas: a mayor rareza, más daño. Los pisos profundos dan mejores armas.
const RARITY = [
  { names: ['COMÚN', 'COMÚN'],           mult: 1,    color: '#c2c3c7', glow: 'rgba(194,195,199,0.18)' },
  { names: ['RARO', 'RARA'],             mult: 1.35, color: '#41a6f6', glow: 'rgba(65,166,246,0.28)' },
  { names: ['ÉPICO', 'ÉPICA'],           mult: 1.75, color: '#c77dff', glow: 'rgba(199,125,255,0.32)' },
  { names: ['LEGENDARIO', 'LEGENDARIA'], mult: 2.3,  color: '#ffcd75', glow: 'rgba(255,205,117,0.4)' },
];
// Probabilidad (en %) de cada rareza según el piso
const RARITY_ODDS = [
  [70, 25, 5, 0],
  [30, 42, 23, 5],
  [8, 32, 38, 22],
];

function rollRarity(rng, floor) {
  const odds = RARITY_ODDS[floor - 1];
  let roll = rng.next() * 100;
  for (let i = 0; i < odds.length; i++) {
    if (roll < odds[i]) return i;
    roll -= odds[i];
  }
  return 0;
}
// Multiplicador de daño según la distancia recorrida por la bala (escopeta)
function falloffMult(b) {
  const f = b.falloff;
  if (!f) return 1;
  const k = clamp((dist(b.x0, b.y0, b.x, b.y) - f.near) / (f.far - f.near), 0, 1);
  return lerp(f.max, f.min, k);
}

function rarityName(item) { return RARITY[item.rar].names[WEAPONS[item.id].fem ? 1 : 0]; }
function weaponLabel(item) { return WEAPONS[item.id].name + ' ' + rarityName(item); }

// Habilidad FURIA
const ULT_CHARGE = 140;     // daño necesario para llenarla
const ULT_TIME = 6;         // segundos de duración
const ULT_DMG = 2;          // multiplicador de daño
const ULT_RATE = 1.6;       // multiplicador de cadencia
const ULT_WAVE_DMG = 12;    // daño de la onda al activarla
const ULT_WAVE_RANGE = 70;

function fireWeapon(p) {
  const w = p.weapon;
  const fury = p.ultT > 0;
  const dmg = Math.round(w.dmg * RARITY[p.item.rar].mult * (fury ? ULT_DMG : 1) * 10) / 10;
  p.cool = w.rate / (fury ? ULT_RATE : 1);
  Sfx.play(w.sfx);
  const a = p.aim;

  if (w.melee) {
    p.swing = 0.18;
    p.swingDir = -(p.swingDir || 1);
    G.effects.push({ type: 'slash', x: p.x, y: p.y, a, life: 0.14, max: 0.14, range: w.range, arc: w.arc });
    for (const e of G.enemies) {
      if (e.dead || e.air) continue;
      const d = dist(p.x, p.y, e.x, e.y);
      if (d > w.range + e.r) continue;
      if (Math.abs(angleDiff(a, angleTo(p.x, p.y, e.x, e.y))) > w.arc / 2 && d > e.r + 4) continue;
      e.damage(dmg, Math.cos(a) * 140, Math.sin(a) * 140);
    }
    // La espada devuelve las balas enemigas
    for (const b of G.bullets) {
      if (b.dead || b.from !== 'e') continue;
      if (dist(p.x, p.y, b.x, b.y) > w.range + 6) continue;
      if (Math.abs(angleDiff(a, angleTo(p.x, p.y, b.x, b.y))) > w.arc / 2) continue;
      const sp = Math.hypot(b.vx, b.vy) * 1.5;
      b.from = 'p'; b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
      b.dmg = 4 * (fury ? ULT_DMG : 1); b.color = '#9dff7a'; b.life = 1.2;
      G.stats.deflects++;
      Sfx.play('deflect');
    }
    return;
  }

  const mx = p.x + Math.cos(a) * 12, my = p.y + 1 + Math.sin(a) * 12;
  for (let i = 0; i < w.count; i++) {
    let ang = a;
    if (w.count > 1) ang += w.spread * (i / (w.count - 1) - 0.5) + rnd(-0.05, 0.05);
    else ang += rnd(-w.spread / 2, w.spread / 2);
    const sp = w.speed * (w.count > 1 ? rnd(0.85, 1.1) : 1);
    G.bullets.push({
      x: mx, y: my, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, r: w.r * (fury ? 1.3 : 1), dmg,
      from: 'p', color: fury ? '#ff5a3c' : w.color, life: w.life, pierce: !!w.pierce, hits: w.pierce ? new Set() : null, laser: !!w.pierce,
      falloff: w.falloff || null, x0: p.x, y0: p.y,
    });
  }
  spawnParticles(mx, my, 3, w.color, 40, 0.12, 2);
  p.recoil = w.recoil;
  if (w.recoil >= 3) addShake(w.recoil * 0.6);
}
