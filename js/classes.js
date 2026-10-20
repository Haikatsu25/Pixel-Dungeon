'use strict';

// =====================================================================
//  Clases jugables: cada una con su sprite, estadísticas y habilidad (R)
// =====================================================================

const SKIN = { s: '#f2c49b', S: '#c98e6b', e: '#1a1c2c' };

// Las dos últimas filas de cada sprite son las piernas: se generan dos cuadros de caminata
const CLASS_ART = {
  knight: {
    rows: [
      '......rrr.....',
      '.....rrr......',
      '....kkkkkk....',
      '...kwggggdk...',
      '...kggggggk...',
      '...kccccccdk..',
      '...kgcgcgcdk..',
      '...kdggggddk..',
      '....kkkkkkk...',
      '...kdgyyygdk..',
      '..kgkgggggkbbk',
      '..kgkdgggdkbyk',
      '...kkdkkdkkbbk',
      '....kddkddk.k.',
    ],
    legsA: ['....kdk.kdk...', '....kkk.kkk...'],
    legsB: ['.....kdkdk....', '.....kkkkk....'],
    pal: { k: '#1a1c2c', w: '#ffffff', g: '#b4bccf', d: '#6b7290', c: '#2a2c3e', r: '#e43b44', y: '#ffcd75', b: '#8f563b' },
  },
  ranger: {
    rows: [
      '.....kkkk.....',
      '....khhhhk....',
      '...khhhhhhk...',
      '..khhhHHHhhk..',
      '..khHssssHhk..',
      '..khsssesesk..',
      '..khHsssssk...',
      '...khHSSSk....',
      '..khhhkkkhk...',
      '..khttbbbtk...',
      '.kshttttttkk..',
      '.kkTtttttTsk..',
      '...kTbbbbTkk..',
      '...kTTkkTTk...',
    ],
    legsA: ['...kbbk.kbbk..', '...kkk..kkk...'],
    legsB: ['....kbkkbk....', '....kkkkkk....'],
    pal: Object.assign({ k: '#1a1c2c', h: '#3b7d4f', H: '#25533a', t: '#4f8a4f', T: '#2f5a35', b: '#8f563b' }, SKIN),
  },
  rogue: {
    rows: [
      '....kkkkk.....',
      '...khhhhhkk...',
      '..khhhhhhhhk..',
      '..khhsssshhhkk',
      '..khsssesesk.hk',
      '..khssssssk..k',
      '...khsSSSk....',
      '....kkSSkk....',
      '...kllLllck...',
      '..klllllllck..',
      '.kskLlllllLk..',
      '.kk.kcccclkk..',
      '....kLlklLk...',
      '....kLlklLk...',
    ],
    legsA: ['....kLk.kLk...', '....kkk.kkk...'],
    legsB: ['.....kLkLk....', '.....kkkkk....'],
    pal: Object.assign({ k: '#1a1c2c', h: '#6b3f22', l: '#8f563b', L: '#5c3a28', c: '#c4884a' }, SKIN),
  },
  witch: {
    rows: [
      '........kk....',
      '.......krrk...',
      '......krrrk...',
      '.....krrrRk...',
      '..kkkkyyyykkk.',
      '.krrrrrrrrrrRk',
      '..kooooooook..',
      '..kossesesok..',
      '..koosssssok..',
      '...kooSSSok...',
      '..kppppppppk..',
      '.kspPppppPpsk.',
      '.kk.kPpppPk.kk',
      '...kPPppPPk...',
    ],
    legsA: ['...kpk..kpk...', '...kkk..kkk...'],
    legsB: ['....kpkkpk....', '....kkkkkk....'],
    pal: Object.assign({ k: '#1a1c2c', r: '#c4302b', R: '#8a1c22', y: '#ffcd75', o: '#e8743b', p: '#7b3fa0', P: '#4a2370' }, SKIN),
  },
  wizard: {
    rows: [
      '......kk......',
      '.....kbbk.....',
      '....kbbbbk....',
      '...kbbBbbbk...',
      '.kkkkkkkkkkkk.',
      '.kBbbbbbbbbBk.',
      '..kssesesssk..',
      '..kgssSssgk...',
      '..kggggggggk..',
      '..kbgggggbbk..',
      '.ksbbgggbbbsk.',
      '.kkbBbgbBbbkk.',
      '...kbbbbbBk...',
      '...kBbbbbBk...',
    ],
    legsA: ['...kBk..kBk...', '...kkk..kkk...'],
    legsB: ['....kBkkBk....', '....kkkkkk....'],
    pal: Object.assign({ k: '#1a1c2c', b: '#3b5dc9', B: '#29366f', g: '#e3e3ec', G: '#9a9ab0' }, SKIN),
  },
  dwarf: {
    rows: [
      '..............',
      '....kkkkkk....',
      '..kkwggggGkk..',
      '.kyk.gggggkyk.',
      '.ky.kgggggk.yk',
      '...kGGGGGGk...',
      '...ksesesSk...',
      '..krrsSSSrrk..',
      '..krrrrrrrrk..',
      '.kgkrrrrrrkgk.',
      '.ksgkrrrrkgsk.',
      '.kkaaarraaakk.',
      '..kaayyyaak...',
      '..kttttttttk..',
    ],
    legsA: ['..ktk...ktk...', '..kkkk..kkkk..'],
    legsB: ['...ktk.ktk....', '...kkkkkkk....'],
    pal: Object.assign({ k: '#1a1c2c', w: '#ffffff', g: '#8b93af', G: '#5a6080', y: '#e8e0d0', r: '#d9562b', a: '#5a5a6a', t: '#5c3a28' }, SKIN),
  },
};

// Estadísticas y habilidad de cada clase.
// skill.dmg/rate/speed/multishot/rollCd se aplican mientras la habilidad está activa.
const CLASSES = {
  knight: {
    name: 'CABALLERO', desc: 'Equilibrado y resistente.',
    shield: 3, speed: 95, rollCd: 0.75, weapon: 'pistol',
    skill: { name: 'FURIA', desc: 'Onda expansiva, daño x2 y +60% de cadencia por 6 s.', charge: 140, time: 6, color: '#ff5a3c', dmg: 2, rate: 1.6, speed: 1.2 },
  },
  ranger: {
    name: 'EXPLORADORA', desc: 'Ágil, empieza con el arco láser.',
    shield: 2, speed: 102, rollCd: 0.7, weapon: 'laser',
    skill: { name: 'RÁFAGA', desc: 'Cada disparo sale triple durante 6 s.', charge: 140, time: 6, color: '#7dff6b', multishot: 2, rate: 1.25 },
  },
  rogue: {
    name: 'PÍCARA', desc: 'La más rápida, rueda más seguido.',
    shield: 2, speed: 110, rollCd: 0.55, weapon: 'smg',
    skill: { name: 'SOMBRA', desc: 'Velocidad, rodar sin espera y daño x1.5 por 5 s.', charge: 120, time: 5, color: '#9a93b8', dmg: 1.5, speed: 1.35, rollCd: 0.12 },
  },
  witch: {
    name: 'HECHICERA', desc: 'Empieza con escopeta. Fuego a distancia.',
    shield: 3, speed: 95, rollCd: 0.75, weapon: 'shotgun',
    skill: { name: 'METEORO', desc: 'Cae un meteoro enorme donde apuntas.', charge: 150, time: 0, color: '#ff9a3c' },
  },
  wizard: {
    name: 'MAGO', desc: 'Controla el campo de batalla.',
    shield: 3, speed: 93, rollCd: 0.75, weapon: 'pistol',
    skill: { name: 'HIELO', desc: 'Congela a enemigos, jefes y balas por 3.5 s.', charge: 180, time: 3.5, color: '#9ad0ff' },
  },
  dwarf: {
    name: 'ENANO', desc: 'Lento pero con 5 escudos. Empieza con espada.',
    shield: 5, speed: 84, rollCd: 0.85, weapon: 'sword',
    skill: { name: 'MURALLA', desc: 'Recarga el escudo, 3 s invulnerable y empuja a todos.', charge: 130, time: 3, color: '#c2c3c7' },
  },
};
const CLASS_ORDER = ['knight', 'ranger', 'rogue', 'witch', 'wizard', 'dwarf'];

// Onda que daña y empuja a los enemigos cercanos y borra balas enemigas
function skillWave(p, range, dmg, knock, color) {
  G.effects.push({ type: 'wave', x: p.x, y: p.y, life: 0.4, max: 0.4, range, color });
  for (const e of G.enemies) {
    if (e.dead || e.air) continue;
    if (dist(p.x, p.y, e.x, e.y) < range + e.r) {
      const a = angleTo(p.x, p.y, e.x, e.y);
      e.damage(dmg, Math.cos(a) * knock, Math.sin(a) * knock);
    }
  }
  for (const b of G.bullets) {
    if (b.from === 'e' && dist(p.x, p.y, b.x, b.y) < range + 30) {
      b.dead = true;
      spawnParticles(b.x, b.y, 3, color, 40, 0.25, 2);
    }
  }
  for (let i = 0; i < 32; i++) {
    const a = i / 32 * Math.PI * 2;
    G.particles.push({ x: p.x, y: p.y, vx: Math.cos(a) * 220, vy: Math.sin(a) * 220, life: 0.35, max: 0.35, color, size: 3 });
  }
}

// Daño de las habilidades que escala con el piso (como la vida de los enemigos)
function skillDamage(base) { return Math.round(base * (1 + 0.45 * (G.floor - 1))); }

const SKILL_ACTIVATE = {
  knight(p) { skillWave(p, 70, skillDamage(12), 200, '#ff5a3c'); },
  ranger(p) { spawnParticles(p.x, p.y, 20, '#7dff6b', 90, 0.5, 2); },
  rogue(p) { spawnParticles(p.x, p.y, 26, '#4a4470', 80, 0.6, 3); },
  witch(p) {
    G.effects.push({ type: 'meteor', x: Input.mouse.wx, y: Input.mouse.wy, life: 0.55, max: 0.55, range: 64 });
  },
  wizard() {
    G.freezeT = 3.5;
    for (const e of G.enemies) spawnParticles(e.x, e.y, 8, '#9ad0ff', 60, 0.5, 2);
  },
  dwarf(p) {
    p.shield = p.maxShield;
    p.invuln = Math.max(p.invuln, 3);
    skillWave(p, 85, skillDamage(10), 340, '#c2c3c7');
  },
};

// Explosión del meteoro de la hechicera
function meteorImpact(ef) {
  addShake(12);
  Sfx.play('land'); Sfx.play('shotgun');
  spawnParticles(ef.x, ef.y, 50, '#ff9a3c', 200, 0.7, 3);
  spawnParticles(ef.x, ef.y, 30, '#ffe066', 140, 0.6, 2);
  G.effects.push({ type: 'wave', x: ef.x, y: ef.y, life: 0.35, max: 0.35, range: ef.range, color: '#ff9a3c' });
  for (const e of G.enemies) {
    if (e.dead || e.air) continue;
    if (dist(ef.x, ef.y, e.x, e.y) < ef.range + e.r) {
      const a = angleTo(ef.x, ef.y, e.x, e.y);
      e.damage(skillDamage(30), Math.cos(a) * 260, Math.sin(a) * 260);
    }
  }
  for (const b of G.bullets) if (b.from === 'e' && dist(ef.x, ef.y, b.x, b.y) < ef.range + 10) b.dead = true;
}

function buildClassSprites() {
  for (const [id, art] of Object.entries(CLASS_ART)) {
    def('cls_' + id + 'A', art.rows.concat(art.legsA), art.pal);
    def('cls_' + id + 'B', art.rows.concat(art.legsB), art.pal);
  }
}
