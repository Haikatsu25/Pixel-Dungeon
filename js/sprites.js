'use strict';

// Pixel art definido como texto: cada carácter es un color de la paleta, '.' es transparente.
const SPR = {};
const TILES = {};

const THEMES = [
  {
    name: 'Calabozo de piedra',
    floor: '#33364a', floor2: '#2a2c3f', speck: '#41455c', crack: '#22243a',
    face: '#565b7a', face2: '#4b4f6c', mortar: '#2a2c3e', top: '#1b1c2d', topEdge: '#3a3d56',
    ambient: 'rgba(6,5,16,0.66)',
  },
  {
    name: 'Cripta musgosa',
    floor: '#2c3932', floor2: '#25302a', speck: '#384a3d', crack: '#1c2621',
    face: '#4a6454', face2: '#405848', mortar: '#1e2923', top: '#141c17', topEdge: '#2e4035', moss: '#4f8a4f',
    ambient: 'rgba(3,10,6,0.68)',
  },
  {
    name: 'Forja infernal',
    floor: '#3a2929', floor2: '#312222', speck: '#4b3232', crack: '#ff5a1f',
    face: '#6a3a35', face2: '#5b312d', mortar: '#2a1515', top: '#1e1010', topEdge: '#4a2626',
    ambient: 'rgba(14,4,2,0.62)',
  },
];

function newCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function makeSprite(rows, pal) {
  const h = rows.length;
  const w = Math.max(...rows.map(r => r.length));
  const c = newCanvas(w, h);
  const x = c.getContext('2d');
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < rows[j].length; i++) {
      const col = pal[rows[j][i]];
      if (!col) continue;
      x.fillStyle = col;
      x.fillRect(i, j, 1, 1);
    }
  }
  return c;
}

function whiteVersion(src) {
  const c = newCanvas(src.width, src.height);
  const x = c.getContext('2d');
  x.drawImage(src, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = '#ffffff';
  x.fillRect(0, 0, c.width, c.height);
  return c;
}

function def(name, rows, pal) {
  const s = makeSprite(rows, pal);
  SPR[name] = s;
  SPR[name + '_w'] = whiteVersion(s);
  return s;
}

function drawSprite(c, img, x, y, flip) {
  const w = img.width, h = img.height;
  const dx = Math.round(x - w / 2), dy = Math.round(y - h / 2);
  if (!flip) { c.drawImage(img, dx, dy); return; }
  c.save();
  c.translate(dx + w, dy);
  c.scale(-1, 1);
  c.drawImage(img, 0, 0);
  c.restore();
}

function buildSprites() {
  const K = '#1a1c2c';

  // ---------- Caballero ----------
  const knightPal = { k: K, s: '#c2c3c7', g: '#8b93af', w: '#ffffff', v: '#29366f', b: '#3b5dc9', y: '#ffcd75', r: '#e43b44' };
  const knightTop = [
    '....rrr.....',
    '...rr.......',
    '..kkkkkkk...',
    '.kssssssgk..',
    '.kswssssgk..',
    '.ksskvvvvk..',
    '.ksskvwvwk..',
    '.kgsssssgk..',
    '..kkkkkkk...',
    '.kbbyyybbk..',
    '.kbbsssbbk..',
    '..kbbbbbk...',
  ];
  def('knightA', knightTop.concat(['..kk...kk...', '..kk...kk...']), knightPal);
  def('knightB', knightTop.concat(['...kk.kk....', '...kk.kk....']), knightPal);

  // ---------- Slimes ----------
  const SLIME = [
    '....kkkk....',
    '..kkggggkk..',
    '.kgwwgggggk.',
    '.kgwgggggggk',
    'kggggggggggk',
    'kgggkggkgggk',
    'kgggkggkgggk',
    'kggggggggddk',
    '.kddddddddk.',
    '..kkkkkkkk..',
  ];
  def('slime', SLIME, { k: K, g: '#38b764', d: '#257953', w: '#a7f070' });
  def('king1', SLIME, { k: K, g: '#38b764', d: '#257953', w: '#a7f070' });
  def('king2', SLIME, { k: K, g: '#b05ad6', d: '#6e2a8a', w: '#e8a6ff' });
  def('king3', SLIME, { k: K, g: '#ef7d57', d: '#b13e53', w: '#ffcd75' });
  def('minislime', [
    '..kkkk..',
    '.kggggk.',
    'kgwggggk',
    'kgkggkgk',
    'kggggddk',
    '.kkkkkk.',
  ], { k: K, g: '#73eff7', d: '#41a6f6', w: '#ffffff' });

  def('crown', [
    '.y...y...y.',
    '.yy.yyy.yy.',
    '.yyyyyyyyy.',
    '.yryyryyry.',
    'kyyyyyyyyyk',
    'kkkkkkkkkkk',
  ], { k: K, y: '#ffcd75', r: '#e43b44' });

  // ---------- Murciélago ----------
  const batPal = { k: K, p: '#5d275d', q: '#8e3fa0', r: '#ff2e4d' };
  def('batA', [
    'k............k',
    'kk..k....k..kk',
    'kpk.kkkkkk.kpk',
    'kppkqqqqqqkppk',
    '.kppqrqqrqppk.',
    '..kkpqqqqpkk..',
    '....kkkkkk....',
  ], batPal);
  def('batB', [
    '....k....k....',
    '....kkkkkk....',
    '..kkqqqqqqkk..',
    '.kppqrqqrqppk.',
    'kppkpqqqqpkppk',
    'kpk.kkkkkk.kpk',
    'kk..........kk',
  ], batPal);

  // ---------- Esqueleto arquero ----------
  def('skeleton', [
    '..kkkkkk..',
    '.kwwwwwwk.',
    '.kwkwwkwk.',
    '.kwwwwwwk.',
    '..kwgwgk..',
    '...kkkk...',
    '..kwwwwk..',
    '.kgkwwkgk.',
    '.kwkwwkwk.',
    '...kwwk...',
    '..kgkkgk..',
    '..kwk.kwk.',
    '..kk...kk.',
  ], { k: K, w: '#f4f4f4', g: '#94b0c2' });

  // ---------- Mago ----------
  def('mage', [
    '....kk....',
    '...kppk...',
    '..kpppk...',
    '..kppppk..',
    '.kppppppk.',
    '.kpkkkkpk.',
    '.kkykkykk.',
    '.kpkkkkpk.',
    'kppppppppk',
    'kpdppppdpk',
    'kpdppppdpk',
    'kppppppppk',
    '.kddddddk.',
    '..kkkkkk..',
  ], { k: K, p: '#7b3fa0', d: '#4a2370', y: '#ffe066' });

  // ---------- Gólem ----------
  def('golem', [
    '....kkkkkkkk....',
    '...kllllllllk...',
    '..klggggggggdk..',
    '..kgrrggggrrgk..',
    '..kggggggggggk..',
    '..kgdkkkkkkdgk..',
    'kkkgggggggggdkkk',
    'klggggggggggggdk',
    'klglggggggglggdk',
    'kggggggggggggddk',
    'kkkgggggggggdkkk',
    '..kggggkkgggdk..',
    '..kgggk..kggdk..',
    '..kdddk..kdddk..',
    '..kkkkk..kkkkk..',
  ], { k: K, g: '#7d7d8c', l: '#a3a3b5', d: '#4d4d5c', r: '#ff7a1a' });

  // ---------- Objetos ----------
  def('coin', [
    '.kkkk.',
    'kywyyk',
    'kwyyok',
    'kyyyok',
    'kyoook',
    '.kkkk.',
  ], { k: K, y: '#ffcd75', o: '#f4a23a', w: '#fff7d6' });

  const HEART = [
    '.kk...kk.',
    'krwk.krrk',
    'krrrkrrrk',
    'krrrrrrrk',
    '.krrrrrk.',
    '..krrrk..',
    '...krk...',
    '....k....',
  ];
  def('heart', HEART, { k: K, r: '#e43b44', w: '#ffb3b8' });
  def('heartEmpty', HEART, { k: K, r: '#3b2a3f', w: '#4a3550' });

  const SHIELD = [
    'kkkkkkkkk',
    'kwcccccdk',
    'kwcccccdk',
    'kccccccdk',
    'kccccccdk',
    '.kccccdk.',
    '..kccdk..',
    '...kdk...',
    '....k....',
  ];
  def('shield', SHIELD, { k: K, c: '#5ab8ff', w: '#d0f0ff', d: '#2b6cb0' });
  def('shieldEmpty', SHIELD, { k: K, c: '#262a40', w: '#323750', d: '#1f2235' });


  const chestPal = { k: K, b: '#8f563b', d: '#5c3a28', y: '#ffcd75', w: '#fff2a8' };
  def('chest', [
    '.kkkkkkkkkkkk.',
    'kbbbbbbbbbbbbk',
    'kbdbbbbbbbbdbk',
    'kyyyyyyyyyyyyk',
    'kkkkkkyykkkkkk',
    'kbbbbbkykbbbbk',
    'kbdbbbbbbbbdbk',
    'kbbbbbbbbbbbbk',
    'kyyyyyyyyyyyyk',
    'kkkkkkkkkkkkkk',
  ], chestPal);
  def('chestOpen', [
    '.kkkkkkkkkkkk.',
    'kbbbbbbbbbbbbk',
    'kyyyyyyyyyyyyk',
    'kkkkkkkkkkkkkk',
    'kkwwwwwwwwwwkk',
    'kbkkkkkkkkkkbk',
    'kbdbbbbbbbbdbk',
    'kbbbbbbbbbbbbk',
    'kyyyyyyyyyyyyk',
    'kkkkkkkkkkkkkk',
  ], chestPal);

  // ---------- Armas (apuntando a la derecha, empuñadura a la izquierda) ----------
  const wPal = { k: K, g: '#8b93af', w: '#ffffff', b: '#5c3a28', c: '#41a6f6', m: '#ff5cf0', y: '#ffcd75', s: '#d6e4f0', o: '#ff9a3c' };
  def('w_pistol', [
    'kkkkkkkkk.',
    'kgggggggwk',
    'kgggggggkk',
    'kkkbbk....',
    '..kbbk....',
    '..kkkk....',
  ], wPal);
  def('w_shotgun', [
    'kkkkkkkkkkkkkkk.',
    'kbbbbbkgggggggwk',
    'kbbbbbkkkkkkkkk.',
    'kbbbk...........',
    'kkkkk...........',
  ], wPal);
  def('w_smg', [
    '..kkkkkkkkkkk',
    'kkgggggggggwk',
    'kggggkkkkkkkk',
    'kkkkgk.......',
    '...kgk.......',
    '...kgk.......',
    '...kkk.......',
  ], wPal);
  def('w_laser', [
    '.kkkkkkkkkkkkk.',
    'kccccccccccmmmk',
    'kcckkkkkkkkkkk.',
    'kkck...........',
    '..ck...........',
    '..kk...........',
  ], wPal);
  def('w_sword', [
    '..k..............',
    '.kyk.kkkkkkkkkkk.',
    'kbykkwwwwwwwwwwwk',
    '.kyk.kkkkkkkkkkk.',
    '..k..............',
  ], wPal);
}

// Baldosas generadas por código según el tema del piso
function buildTiles(floor) {
  const th = THEMES[floor - 1];
  TILES.floor = [];
  for (let v = 0; v < 4; v++) {
    const c = newCanvas(TILE, TILE), x = c.getContext('2d');
    x.fillStyle = th.floor; x.fillRect(0, 0, 16, 16);
    x.fillStyle = th.floor2;
    x.fillRect(0, 15, 16, 1); x.fillRect(15, 0, 1, 16);
    if (v % 2 === 0) { x.fillRect(0, 7, 15, 1); x.fillRect(7, 8, 1, 7); }
    for (let i = 0; i < 7; i++) {
      x.fillStyle = Math.random() < 0.5 ? th.speck : th.floor2;
      x.fillRect(Math.floor(Math.random() * 15), Math.floor(Math.random() * 15), 1, 1);
    }
    if (v === 3) {
      x.fillStyle = th.crack;
      let cx = 3, cy = 3;
      for (let i = 0; i < 8; i++) { x.fillRect(cx, cy, 1, 1); cx += Math.random() < 0.6 ? 1 : 0; cy += 1; }
    }
    if (th.moss && v === 1) {
      x.fillStyle = th.moss;
      for (let i = 0; i < 6; i++) x.fillRect(1 + Math.floor(Math.random() * 5), 9 + Math.floor(Math.random() * 5), 1, 1);
    }
    TILES.floor.push(c);
  }

  let c = newCanvas(TILE, TILE), x = c.getContext('2d');
  x.fillStyle = th.face; x.fillRect(0, 0, 16, 16);
  for (let r = 0; r < 4; r++) {
    x.fillStyle = th.mortar;
    x.fillRect(0, r * 4 + 3, 16, 1);
    const off = (r % 2) * 4;
    for (let bx = off + 3; bx < 16; bx += 8) x.fillRect(bx, r * 4, 1, 3);
    x.fillStyle = th.face2;
    x.fillRect(Math.floor(Math.random() * 14), r * 4 + 1, 2, 1);
  }
  x.fillStyle = th.topEdge; x.fillRect(0, 0, 16, 1);
  x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(0, 14, 16, 2);
  if (th.moss) { x.fillStyle = th.moss; x.fillRect(2, 0, 3, 1); x.fillRect(3, 1, 1, 2); x.fillRect(11, 0, 2, 1); }
  TILES.wallFace = c;

  c = newCanvas(TILE, TILE); x = c.getContext('2d');
  x.fillStyle = th.top; x.fillRect(0, 0, 16, 16);
  x.fillStyle = th.topEdge;
  for (let i = 0; i < 4; i++) x.fillRect(Math.floor(Math.random() * 16), Math.floor(Math.random() * 16), 1, 1);
  TILES.wallTop = c;

  c = newCanvas(TILE, TILE); x = c.getContext('2d');
  for (const bx of [2, 7, 12]) {
    x.fillStyle = '#1a1c2c'; x.fillRect(bx - 1, 0, 4, 16);
    x.fillStyle = '#b8862e'; x.fillRect(bx, 0, 2, 16);
    x.fillStyle = '#ffe39a'; x.fillRect(bx, 0, 1, 16);
  }
  x.fillStyle = '#1a1c2c'; x.fillRect(0, 5, 16, 4);
  x.fillStyle = '#b8862e'; x.fillRect(0, 6, 16, 2);
  TILES.doorClosed = c;
}
