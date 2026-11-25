// Rua e adereços 3D da cidade: chão, calçada, mobiliário de rua, adereços de fachada,
// telhados, becos (vãos entre prédios) e viaduto com trem.
// Quase tudo é mesclado em uma única malha (cor por vértice + atlas), para manter poucos draw calls.
//
// Regra que orienta todas as posições: os painéis dos slides são HTML por cima do canvas,
// então nada pode ficar entre a câmera e um painel. Em z > 0.3 só existe coisa abaixo de y = 3,
// ou colada à fachada (z ≤ 1.2) fora do retângulo painel+moldura.

export default function buildStreet(ctx) {
  const { THREE, scene, rnd, ri, pick, tex, NEON, WARM, span, lots, onFrame } = ctx;
  const SP = ctx.SPACING, HW = ctx.BW / 2, BD = ctx.BD;
  const X0 = -130, X1 = span + 130, LEN = X1 - X0 + 40, MX = (X0 + X1) / 2;
  const DARK = '#0a0a18', METAL = '#3a3558', STEEL = '#5c6078', CONC = '#211f38', CONC2 = '#2a2848';

  /* ── atlas 128×128: [x, y, w, h] em pixels ── */
  const A = 128;
  const CELL = {
    white: [1, 1, 6, 6], ac: [16, 0, 16, 16], vent: [32, 0, 16, 16], train: [64, 0, 64, 16],
    v0: [0, 16, 16, 48], v1: [16, 16, 16, 48], v2: [32, 16, 16, 48], v3: [48, 16, 16, 48],
    h0: [64, 16, 48, 16], h1: [64, 32, 48, 16], h2: [64, 48, 48, 16],
    vend: [112, 16, 16, 32], fence: [0, 64, 32, 32], win: [32, 64, 16, 16], bill: [64, 64, 64, 32],
  };
  const atlas = tex(A, A, g => {
    const R = (c, x, y, w, h) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    // placa neon em tons de cinza: a cor vem do vértice (cinza escuro vira neon apagado)
    const sign = ([x, y, w, h], step) => {
      R('#fff', x, y, w, h); R('#3c3c3c', x + 1, y + 1, w - 2, h - 2);
      for (let gx = x + 3; gx < x + w - step; gx += step + 1) for (let gy = y + 3; gy < y + h - step; gy += step + 1)
        if (rnd() < .75) R('#fff', gx, gy, ri(1, step), ri(1, step));   // glifos abstratos em blocos
    };
    R('#fff', 0, 0, 8, 8);
    R('#6a6e86', 16, 0, 16, 16); R('#23243a', 18, 2, 10, 10); R('#4a4d64', 22, 2, 2, 10); R('#4a4d64', 18, 6, 10, 2);
    R('#1FE6A6', 29, 13, 1, 1); R('#3a3d52', 16, 15, 16, 1);
    R('#4a4d64', 32, 0, 16, 16); for (let y = 1; y < 16; y += 2) R('#1c1d2e', 33, y, 14, 1);
    R('#2a2f4a', 64, 0, 64, 16); R('#1a1d30', 64, 0, 64, 2); R('#00E6DF', 64, 12, 64, 1);
    for (let x = 66; x < 126; x += 8) R(rnd() < .8 ? '#ffd27a' : '#9fe8ff', x, 4, 6, 5);
    for (const k of ['v0', 'v1', 'v2', 'v3']) sign(CELL[k], 3);
    for (const k of ['h0', 'h1', 'h2']) sign(CELL[k], 3);
    sign(CELL.bill, 5);
    R('#101426', 112, 16, 16, 32); R('#9fe8ff', 113, 17, 14, 2);
    for (let y = 21; y < 38; y += 4) for (let x = 114; x < 126; x += 3) R(pick(NEON), x, y, 2, 3);
    R('#00E6DF', 113, 40, 14, 1); R('#05060c', 115, 42, 10, 4);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++)                 // tela de arame (resto fica transparente)
      if ((x + y) % 8 === 0 || (x - y + 32) % 8 === 0) R('#6d7090', x, 64 + y, 1, 1);
    R('#ffb14a', 32, 64, 16, 16); R('#1a1420', 32, 64, 16, 1); R('#1a1420', 39, 64, 2, 16);
    for (let y = 67; y < 80; y += 3) R('#b06a20', 32, y, 16, 1);
  });
  for (const k in CELL) {   // px → uv (u0, v baixo, u1, v topo), com folga para não vazar da célula vizinha
    const [x, y, w, h] = CELL[k];
    CELL[k] = [(x + .05) / A, 1 - (y + h - .05) / A, (x + w - .05) / A, 1 - (y + .05) / A];
  }
  const V = () => CELL['v' + ri(0, 3)], H = () => CELL['h' + ri(0, 2)];
  const mat = () => new THREE.MeshBasicMaterial({ map: atlas, vertexColors: true, alphaTest: .5, side: THREE.DoubleSide });

  /* ── lote de geometria mesclada ── */
  function batch() {
    const P = [], C = [], U = [], I = [], k = new THREE.Color();
    const b = {
      // cantos: inf-esq, inf-dir, sup-dir, sup-esq
      quad(p0, p1, p2, p3, color, cell = CELL.white, shade = 1) {
        const n = P.length / 3; k.set(color);
        P.push(...p0, ...p1, ...p2, ...p3);
        for (let i = 0; i < 4; i++) C.push(k.r * shade, k.g * shade, k.b * shade);
        U.push(cell[0], cell[1], cell[2], cell[1], cell[2], cell[3], cell[0], cell[3]);
        I.push(n, n + 1, n + 2, n, n + 2, n + 3);
      },
      // caixa por centro em x/z e base em y; lit = sem sombreamento falso (para pontos de luz)
      box(x, y0, z, w, h, d, color, lit) {
        const xa = x - w / 2, xb = x + w / 2, y1 = y0 + h, za = z - d / 2, zb = z + d / 2;
        const s = lit ? [1, 1, 1, 1] : [1, .8, .58, .42];   // topo, frente, lados, trás/baixo
        b.quad([xa, y0, zb], [xb, y0, zb], [xb, y1, zb], [xa, y1, zb], color, undefined, s[1]);
        b.quad([xb, y0, za], [xa, y0, za], [xa, y1, za], [xb, y1, za], color, undefined, s[3]);
        b.quad([xa, y0, za], [xa, y0, zb], [xa, y1, zb], [xa, y1, za], color, undefined, s[2]);
        b.quad([xb, y0, zb], [xb, y0, za], [xb, y1, za], [xb, y1, zb], color, undefined, s[2]);
        b.quad([xa, y1, zb], [xb, y1, zb], [xb, y1, za], [xa, y1, za], color, undefined, s[0]);
        b.quad([xa, y0, za], [xb, y0, za], [xb, y0, zb], [xa, y0, zb], color, undefined, s[3]);
      },
      mesh(material) {
        if (!P.length) return null;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
        g.setIndex(I);
        const m = new THREE.Mesh(g, material); scene.add(m); return m;
      },
    };
    return b;
  }
  const S = batch(), FL = batch(), BL = [batch(), batch()], TR = batch();   // estático, neon falhando, pisca A/B, trem

  /* ── peças reutilizadas ── */
  // letreiro em bandeira: placa no plano yz (perpendicular à fachada), z de 0.05 a 1.1
  function flagSign(x, y0, h, color) {
    S.box(x, y0, .575, .16, h, 1.05, DARK);
    for (const s of [-1, 1]) {
      const fx = x + s * .09;
      S.quad([fx, y0 + .08, .1], [fx, y0 + .08, 1.05], [fx, y0 + h - .08, 1.05], [fx, y0 + h - .08, .1], color, V());
    }
    S.box(x, y0 + h, .3, .08, .08, .6, METAL);
  }
  // letreiro chapado de frente para a rua; z = centro da caixa (0.14 de profundidade)
  function flatSign(b, x, y0, w, h, z, color, cell) {
    b.box(x, y0, z, w, h, .14, DARK);
    b.quad([x - w / 2 + .06, y0 + .06, z + .08], [x + w / 2 - .06, y0 + .06, z + .08],
           [x + w / 2 - .06, y0 + h - .06, z + .08], [x - w / 2 + .06, y0 + h - .06, z + .08], color, cell);
  }
  function ac(x, y0, z) {   // frente em z + 0.24
    S.box(x, y0, z, .8, .6, .45, STEEL);
    S.quad([x - .36, y0 + .04, z + .235], [x + .36, y0 + .04, z + .235], [x + .36, y0 + .56, z + .235], [x - .36, y0 + .56, z + .235], '#fff', CELL.ac);
    S.box(x, y0 - .1, z - .05, .7, .1, .3, METAL);
  }
  // cabo com barriga, no plano xy
  function wire(x1, y1, x2, y2, z, sag) {
    let px = x1, py = y1;
    for (let k = 1; k <= 6; k++) {
      const f = k / 6, nx = x1 + (x2 - x1) * f, ny = y1 + (y2 - y1) * f - sag * 4 * f * (1 - f);
      S.quad([px, py, z], [nx, ny, z], [nx, ny + .12, z], [px, py + .12, z], '#15131f');
      px = nx; py = ny;
    }
  }
  function fence(xa, xb, z, h) {
    for (let x = xa; x < xb - .01; x += 2) {
      S.quad([x, 0, z], [x + 2, 0, z], [x + 2, h, z], [x, h, z], '#fff', CELL.fence);
      S.box(x, 0, z, .1, h + .1, .1, METAL);
    }
    S.box(xb, 0, z, .1, h + .1, .1, METAL);
    S.box((xa + xb) / 2, h, z, xb - xa, .08, .08, METAL);
  }
  function lamp(x, z, dz) {   // poste curto (topo em 2.64); dz = para que lado o braço aponta
    S.box(x, 0, z, .16, 2.5, .16, METAL);
    S.box(x, 2.5, z + dz * .25, .3, .14, .8, METAL);
    S.box(x, 2.42, z + dz * .45, .24, .08, .36, WARM[2], true);
  }
  function crates(x, z) {
    const n = ri(2, 4);
    for (let i = 0, y = 0; i < n; i++) {
      const s = .6 + rnd() * .3;
      if (i === 2) { S.box(x + .9, 0, z + .1, s, s, s, '#3d2f28'); continue; }
      S.box(x + rnd() * .2, y, z, s, s, s, pick(['#4a3a2c', '#3a3c52', '#2d3140'])); y += s;
    }
  }
  function bin(x, z) { S.box(x, 0, z, .7, 1, .7, '#1f3a36'); S.box(x, 1, z, .78, .1, .78, '#2c524c'); }
  function hydrant(x, z) { S.box(x, 0, z, .32, .7, .32, '#a8322c'); S.box(x, .7, z, .22, .14, .22, '#d04a3a'); S.box(x, .4, z, .5, .14, .14, '#d04a3a'); }
  function vending(x) {
    S.box(x, 0, .5, 1.1, 2.2, .7, '#1a2240');
    S.quad([x - .5, .1, .86], [x + .5, .1, .86], [x + .5, 2.1, .86], [x - .5, 2.1, .86], '#fff', CELL.vend);
  }
  function scooter(x, z, color) {
    for (const s of [-.62, .62]) S.box(x + s, 0, z, .42, .42, .16, '#07070c');
    S.box(x, .22, z, 1.2, .38, .4, color);
    S.box(x - .3, .6, z, .7, .16, .36, '#15151f');
    S.box(x + .55, .3, z, .14, .85, .3, color);
    S.box(x + .55, 1.12, z, .1, .1, .7, '#15151f');
    S.box(x + .66, .78, z, .06, .14, .16, WARM[2], true);
    S.box(x - .62, .5, z, .06, .1, .2, '#ff4a4a', true);
  }
  function car(x, z, color, dir) {   // dir = ±1: lado dos faróis
    for (const s of [-1.3, 1.3]) S.box(x + s, 0, z, .7, .62, 1.9, '#07070c');
    S.box(x, .28, z, 4.2, .66, 1.8, color);
    S.box(x - dir * .3, .94, z, 2.3, .6, 1.6, '#12121f');
    S.box(x - dir * .3, 1.04, z, 2.0, .34, 1.64, '#2c3a5c');
    S.box(x + dir * 2.1, .55, z, .08, .2, 1.5, WARM[2], true);
    S.box(x - dir * 2.1, .55, z, .08, .2, 1.5, '#ff4a4a', true);
  }

  /* ── chão ── */
  const PX = 8, GZ0 = -14, GZ1 = 50, TILE = SP * 2;          // faixa detalhada: 8 px por unidade, repete a cada 2 lotes
  const zp = z => Math.round((z - GZ0) * PX);
  const strip = tex(TILE * PX, (GZ1 - GZ0) * PX, (g, w, h) => {
    const R = (c, x, y, a, b) => { g.fillStyle = c; g.fillRect(x, y, a, b); };
    R('#0b0a18', 0, 0, w, h);
    R('#0e0d1c', 0, zp(5), w, zp(27) - zp(5));               // asfalto
    for (let i = 0; i < 500; i++) R(pick(['#141327', '#090812']), ri(0, w - 3), ri(zp(5), zp(27) - 1), ri(1, 3), 1);
    for (const [za, zb] of [[0, 5], [27, 32]]) {             // calçadas em lajotas
      const ya = zp(za), hh = zp(zb) - ya;
      R('#22203a', 0, ya, w, hh);
      for (let i = 0; i < 60; i++) R(pick(['#2a2846', '#1c1a30']), ri(0, w / 8 - 1) * 8, ya + ri(0, 4) * 8, 8, 8);
      for (let x = 0; x < w; x += 8) R('#17152a', x, ya, 1, hh);
      for (let y = ya; y < ya + hh; y += 8) R('#17152a', 0, y, w, 1);
    }
    R('#100f1f', 0, zp(32), w, h - zp(32));                  // terreno além da calçada oposta
    for (let i = 0; i < 120; i++) R(pick(['#16152a', '#0b0a16']), ri(0, w - 8), ri(zp(32), h - 2), ri(2, 9), ri(1, 2));
    for (let x = 0; x < w; x += 12) for (const z of [7.9, 24.2]) if (rnd() < .85) R('#3a3856', x, zp(z), 12, 1);   // bordas da pista
    for (let x = 4; x < w; x += 48) R('#7d6a2c', x, zp(16), 24, 2);                                              // faixa central
    for (let y = zp(8.6); y < zp(23.4); y += 12) R('#4d4b68', w / 2 - 14, y, 28, 6);   // faixa de pedestres, alinhada a um vão
    for (let i = 0; i < 4; i++) { const x = ri(8, w - 16), y = ri(zp(9), zp(23)); R('#06050c', x, y, 8, 8); R('#1c1b30', x + 1, y + 1, 6, 6); R('#06050c', x + 2, y + 3, 4, 1); }   // bueiros
    for (let i = 0; i < 16; i++) {                           // poças
      const cx = ri(0, w - 30), cy = ri(zp(1), zp(30));
      for (let j = 0; j < 5; j++) R('#05040b', cx + ri(-10, 10), cy + ri(-4, 4), ri(8, 26), ri(3, 8));
    }
    for (let i = 0; i < 60; i++) {                           // reflexos neon escorridos na direção da câmera
      const x = ri(0, w - 8), sw = ri(2, 7), y0 = ri(zp(.3), zp(22)), len = ri(14, 90);
      g.globalAlpha = .12 + rnd() * .3; g.fillStyle = rnd() < .7 ? pick(NEON) : pick(WARM);
      for (let y = y0; y < y0 + len; y++) if (y % 3 !== 2 || rnd() < .5) g.fillRect(x + (rnd() < .15 ? ri(-1, 1) : 0), y, sw, 1);
    }
    g.globalAlpha = .3; g.fillStyle = WARM[2];               // luz dos postes, pontilhada
    const pool = (cx, cy) => { for (let dy = -9; dy <= 9; dy++) for (let dx = -20; dx <= 20; dx++) if (!((dx + dy) & 1) && dx * dx / 4 + dy * dy < 81) g.fillRect(cx + dx, cy + dy, 1, 1); };
    for (const lx of [SP / 2, SP * 1.5]) { pool((lx - 7) * PX, zp(4)); pool((lx + 7) * PX, zp(4)); pool(lx * PX, zp(28.2)); }
    g.globalAlpha = 1;
  });
  const far = tex(64, 64, (g, w, h) => {
    g.fillStyle = '#0b0a18'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) { g.fillStyle = pick(['#121126', '#080711']); g.fillRect(ri(0, w - 4), ri(0, h - 1), ri(1, 5), 1); }
    for (let i = 0; i < 7; i++) { g.globalAlpha = .1 + rnd() * .15; g.fillStyle = pick(NEON); g.fillRect(ri(0, w - 2), ri(0, h - 12), 1, ri(4, 12)); }
    g.globalAlpha = 1;
  });
  strip.wrapS = far.wrapS = far.wrapT = THREE.RepeatWrapping;
  const GX0 = lots[0].x - SP / 2 - TILE * 4, NT = Math.ceil((X1 + 30 - GX0) / TILE), GX1 = GX0 + NT * TILE;
  // rects: [x0, x1, z0, z1, u0, u1, v em z0, v em z1]
  function ground(map, rects) {
    const P = [], U = [], I = [];
    for (const [xa, xb, za, zb, ua, ub, va, vb] of rects) {
      const n = P.length / 3;
      P.push(xa, 0, zb, xb, 0, zb, xb, 0, za, xa, 0, za); U.push(ua, vb, ub, vb, ub, va, ua, va);
      I.push(n, n + 1, n + 2, n, n + 2, n + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.setIndex(I);
    scene.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map })));
  }
  ground(strip, [[GX0, GX1, GZ0, GZ1, 0, NT, 1, 0]]);
  ground(far, [[GX0, GX1, -165, GZ0, GX0 / 16, GX1 / 16, 165 / 16, -GZ0 / 16], [GX0, GX1, GZ1, 115, GX0 / 16, GX1 / 16, -GZ1 / 16, -115 / 16]]);
  S.box(MX, 0, 5.15, LEN, .18, .3, '#4a4868');               // meios-fios
  S.box(MX, 0, 26.85, LEN, .18, .3, '#4a4868');

  /* ── rua: se repete também além dos prédios dos slides ── */
  const n = lots.length, CARS = ['#3a2030', '#1c3040', '#22264a', '#40301c'];
  for (let k = -4; k <= n + 3; k++) {
    const vx = lots[0].x + k * SP, real = k >= 0 && k < n;
    lamp(vx - 7, 4.5, -1); lamp(vx + 7, 4.5, -1); lamp(vx, 27.5, 1);
    for (const dx of [-10, -4, 2, 8]) { S.box(vx + dx, 0, 4.8, .18, .7, .18, METAL); S.box(vx + dx, .7, 4.8, .18, .08, .18, NEON[0], true); }
    if (real) for (const dx of [-8, -5, -2, 1, 4, 7]) {      // encostados na fachada, tudo abaixo de 2.3
      const r = rnd();
      if (r < .2) vending(vx + dx); else if (r < .5) crates(vx + dx, .8); else if (r < .65) bin(vx + dx, .75); else if (r < .75) hydrant(vx + dx, 3.9);
    }
    const r = rnd();                                          // estacionados junto ao meio-fio
    if (r < .4) scooter(vx + ri(-8, 8), 5.9, pick([NEON[2], NEON[1], '#c8ccd8']));
    else if (r < .7) car(vx + ri(-5, 5), 6.5, pick(CARS), pick([-1, 1]));
    if (rnd() < .4) for (let i = 0; i < 3; i++) { const cx = vx + 9 + i * .9; S.box(cx, 0, 7.6, .3, .5, .3, NEON[2]); S.box(cx, .2, 7.6, .32, .1, .32, '#e8e8f0'); }   // cones
    if (rnd() < .45) car(vx + ri(-6, 6), 25.6, pick(CARS), pick([-1, 1]));
    fence(vx - SP / 2, vx + SP / 2, 31.6, 2.4);
    if (rnd() < .6) crates(vx + ri(-9, 9), 30.6);
    if (rnd() < .5) bin(vx + ri(-9, 9), 30.4);
    for (let i = ri(1, 2); i > 0; i--) {                      // contêineres no terreno oposto (topo em 2.7)
      const along = rnd() < .6, w = along ? 6 : 2.4, d = along ? 2.4 : 6, cx = vx + (i * 2 - 3) * 5.5 + rnd() * 2, cz = ri(36, 45);
      S.box(cx, 0, cz, w, 2.6, d, pick(['#1c3040', '#3a2030', '#22264a', '#3d2a1c']));
      S.box(cx, 2.6, cz + d / 2 - .1, w, .1, .1, pick(NEON), true);
      if (rnd() < .5) S.quad([cx - .5, 1, cz + d / 2 + .02], [cx + .5, 1, cz + d / 2 + .02], [cx + .5, 2, cz + d / 2 + .02], [cx - .5, 2, cz + d / 2 + .02], '#fff', CELL.win);
    }
  }

  /* ── prédios dos slides: fachada e telhado ── */
  lots.forEach((L, i) => {
    const { x, y, h } = L;
    // faixa esquerda (|dx| ≥ 9.07): letreiros em bandeira. Só à esquerda, porque a panorâmica vem da direita
    // e um letreiro saliente à direita se projetaria sobre o painel.
    flagSign(x - 9.15, y + ri(-4, -2), ri(3, 5), pick(NEON));
    flagSign(x - 9.15, y + 6, ri(3, 5), L.color);
    S.box(x - 9.8, 0, .1, .18, h, .18, METAL);
    // faixa direita (|dx| ≥ 8.85): só peças rasas (z ≤ 0.47)
    S.box(x + 9.8, 0, .1, .18, h, .18, METAL);
    for (const dy of [-4.4, -2, .4, 2.8]) {
      const r = rnd();
      if (r < .4) ac(x + 9.25, y + dy + .7, .23); else if (r < .8) flatSign(S, x + 9.2, y + dy + .1, .7, 2, .07, pick(NEON), V());
    }
    // acima do painel
    for (let yy = y + 5.8; yy < h - 1.7; yy += 2.3) {
      const s0 = pick([-1, 1]);
      for (let j = ri(1, 2); j > 0; j--) {
        const px = x + (j === 1 ? s0 : -s0) * ri(1, 7), r = rnd();
        if (r < .55) ac(px, yy + .3, .23); else if (r < .82) flatSign(S, x + (px - x) * .8, yy, 3.2, 1.1, .07, pick(NEON), H()); else flagSign(px, yy, 1.5, pick(NEON));
      }
    }
    // abaixo do painel (quando sobra parede) e toldo no térreo, com topo em 2.76
    for (let yy = 3.3; yy < y - 6.8; yy += 2.2) {
      const px = x + ri(-7, 7);
      if (rnd() < .5) ac(px, yy + .3, .23); else flatSign(S, x + (px - x) * .8, yy, 3.2, 1.1, .07, pick(NEON), H());
    }
    const ax = x + ri(-5, 5);
    for (let j = -2; j <= 2; j++) S.box(ax + j, 2.62, .6, 1, .14, 1.1, j & 1 ? '#2a2440' : L.color);
    S.box(ax, 2.4, 1.12, 5, .22, .06, '#1a1830');
    S.box(ax, 2.5, .3, 1.2, .1, .2, WARM[0], true);
    // telhado
    S.box(x, h, -.2, HW * 2, .35, .4, CONC2);
    for (const s of [-1, 1]) S.box(x + s * (HW - .2), h, -BD / 2, .4, .35, BD, CONC2);
    const tx = x + ri(-7, 7), tz = -ri(4, 9);                 // caixa-d'água
    for (const sx of [-.8, .8]) for (const sz of [-.8, .8]) S.box(tx + sx, h, tz + sz, .15, 1, .15, METAL);
    S.box(tx, h + 1, tz, 2, 1.8, 2, '#3b2f3a');
    for (const by of [1.3, 2.3]) S.box(tx, h + by, tz, 2.06, .1, 2.06, '#57454f');
    S.box(tx, h + 2.8, tz, 1.4, .3, 1.4, '#2a2230');
    const mx = x + ri(-8, 8), mz = -ri(2, 10), mh = ri(4, 8);  // antena com luz piscando
    S.box(mx, h, mz, .14, mh, .14, METAL);
    S.box(mx, h + mh - 1, mz, 1.4, .08, .08, METAL); S.box(mx, h + mh - 1.8, mz, .9, .08, .08, METAL);
    BL[i % 2].box(mx, h + mh, mz, .3, .3, .3, '#ff4a4a', true);
    const ux = x + ri(-6, 6), uz = -ri(2, 5);                  // condensadora grande e duto
    S.box(ux, h, uz, 2.6, 1.1, 1.6, STEEL);
    S.quad([ux - 1.1, h + .1, uz + .82], [ux - .1, h + .1, uz + .82], [ux - .1, h + 1, uz + .82], [ux - 1.1, h + 1, uz + .82], '#fff', CELL.ac);
    S.quad([ux + .1, h + .1, uz + .82], [ux + 1.1, h + .1, uz + .82], [ux + 1.1, h + 1, uz + .82], [ux + .1, h + 1, uz + .82], '#fff', CELL.vent);
    S.box(ux, h + .3, uz - 3, .5, .5, 4.4, '#4a4d64');
    if (rnd() < .65) {                                         // letreiro de topo
      const sx = x + ri(-4, 4), sw = ri(6, 10);
      for (const s of [-1, 1]) S.box(sx + s * (sw / 2 - .6), h, -.6, .16, 1, .16, METAL);
      flatSign(S, sx, h + 1, sw, 2.4, -.6, L.color, CELL.bill);
      S.box(sx, h + 3.4, -.6, sw, .1, .14, L.color, true);
    }
  });

  /* ── becos: vãos entre prédios vizinhos, tudo em z ≤ 0.3 ── */
  for (let i = 0; i < n - 1; i++) {
    const xa = lots[i].x + HW, xb = lots[i + 1].x - HW, mid = (xa + xb) / 2, top = Math.min(lots[i].h, lots[i + 1].h);
    for (const z of [-9, -5, -2.5, .15]) {
      const y1 = ri(6, top - 2), y2 = Math.min(top - 1, y1 + ri(-2, 2)), sag = .4 + rnd() * .5;
      wire(xa, y1, xb, y2, z, sag);
      if (rnd() < .5) S.box(mid, (y1 + y2) / 2 - sag - .32, z, .26, .34, .2, pick(WARM), true);   // lanterna pendurada
    }
    wire(xa, lots[i].h + .3, xb, lots[i + 1].h + .3, -2, .7);
    const flick = rnd() < .5;                                  // letreiros na quina, de frente para a rua
    flatSign(flick ? FL : S, xa + .75, ri(4, top - 7), 1.3, ri(3, 5), .15, pick(NEON), V());
    flatSign(S, xb - .75, ri(4, top - 7), 1.3, ri(3, 5), .15, pick(NEON), V());
    const hy = ri(8, top - 3);                                 // placa pendurada no fundo do beco
    S.box(mid, hy + 1, -4, xb - xa, .1, .1, METAL);
    flatSign(S, mid, hy, 2.6, 1, -4, pick(NEON), H());
    for (const [wx, s] of [[xa, 1], [xb, -1]]) {               // canos, condensadoras e luz nas paredes laterais
      S.box(wx + s * .12, 0, -ri(2, 10), .2, top - ri(0, 4), .2, METAL);
      for (let j = ri(2, 3); j > 0; j--) S.box(wx + s * .25, ri(4, top - 3), -ri(1, 10), .5, .6, .8, STEEL);
    }
    S.box(xa + .2, 3.4, -2.5, .3, .2, .3, WARM[0], true);
    fence(xa, xb, -1.2, 2.6);
    const dx = mid + pick([-1, 1]) * .9;                       // caçamba
    S.box(dx, 0, -4.5, 1.6, 1.1, 1, '#1f3a36'); S.box(dx, 1.1, -4.5, 1.7, .12, 1.1, '#2c524c');
  }

  /* ── viaduto atrás dos prédios (z de −23 a −17): aparece nos vãos ── */
  const DY = 12;
  S.box(MX, DY, -20, LEN, 1, 6, '#1a1930');
  for (const z of [-17.15, -22.85]) S.box(MX, DY + 1, z, LEN, .5, .3, CONC2);
  S.box(MX, DY + .4, -16.97, LEN, .12, .06, NEON[0], true);
  S.box(MX, DY + 3.9, -22.6, LEN, .1, .1, DARK);               // catenária
  for (let k = -5; k <= n + 4; k++) {
    const px = lots[0].x - SP / 2 + k * SP;                    // pilares alinhados aos vãos
    S.box(px, 0, -20, 1.6, DY - .8, 2.2, CONC);
    S.box(px, DY - .8, -20, 2.6, .8, 5.4, CONC2);
    S.box(px, 1, -18.88, 1.62, .4, .04, WARM[1], true);
    for (const dx of [0, SP / 2]) {
      S.box(px + dx, DY + 1, -22.6, .14, 3, .14, METAL);
      S.box(px + dx + 3, DY - .2, -17.5, .6, .2, .4, WARM[0], true);
    }
  }
  for (let c = 0; c < 5; c++) {                                // trem: 5 vagões, origem na frente do primeiro
    const cx = -4.5 - c * 9.5;
    TR.box(cx, DY + 1.1, -20, 9, 2.3, 2.6, '#2a2f4a');
    TR.quad([cx - 4.5, DY + 1.1, -18.68], [cx + 4.5, DY + 1.1, -18.68], [cx + 4.5, DY + 3.4, -18.68], [cx - 4.5, DY + 3.4, -18.68], '#fff', CELL.train);
    TR.box(cx, DY + 3.4, -20, 8.4, .2, 2, '#3a3f5c');
  }
  TR.box(.05, DY + 1.5, -20, .1, .4, 2, WARM[2], true);
  TR.box(-47.05, DY + 1.5, -20, .1, .3, 2, '#ff4a4a', true);

  /* ── malhas e animação ── */
  const main = mat(), flickMat = mat(), blinkMat = [mat(), mat()];
  S.mesh(main); FL.mesh(flickMat); BL[0].mesh(blinkMat[0]); BL[1].mesh(blinkMat[1]);
  const train = TR.mesh(main);
  train.position.x = X0 - 60;
  onFrame((dt, now) => {
    train.position.x += 34 * dt;
    if (train.position.x > X1 + 120) train.position.x = X0 - 260;   // a folga vira intervalo entre passagens
    const t = now % 1600, f = now % 4700;
    blinkMat[0].color.setScalar(t < 250 ? 1 : .12);
    blinkMat[1].color.setScalar(t > 800 && t < 1050 ? 1 : .12);
    flickMat.color.setScalar(f < 70 || (f > 140 && f < 200) || (f > 2300 && f < 2380) ? .25 : 1);
  });
}
