// Atmosfera e fundo da cidade: céu, névoa, skyline em camadas, letreiros, tráfego aéreo, holofotes e chuva.
// Tudo o que é sólido fica em z ≤ −26 (tráfego: z ≤ −14 ou y > 45), para nunca cruzar os painéis dos slides.
const RAIN = true;          // chuva ligada/desligada
const DROPS = 320, VOL = 56; // gotas e lado do cubo que as recicla ao redor da câmera

export default function buildAtmosphere(ctx) {
  const { THREE, scene, camera, rnd, ri, pick, tex, NEON, WARM, span, onFrame } = ctx;
  const FOG = '#201a56';
  const X0 = -260, X1 = span + 230;

  /* ── geometria mesclada à mão: um draw call por material ── */
  const geo = () => ({ p: [], u: [], i: [] });
  // parede vertical de (ax, az) a (bx, bz), altura h; o lado visível é o que vê a→b da esquerda para a direita
  function quad(G, ax, ay, az, bx, bz, h, u0, v0, u1, v1) {
    const n = G.p.length / 3;
    G.p.push(ax, ay, az, bx, ay, bz, bx, ay + h, bz, ax, ay + h, az);
    G.u.push(u0, v0, u1, v0, u1, v1, u0, v1);
    G.i.push(n, n + 1, n + 2, n, n + 2, n + 3);
  }
  function mesh(G, opts) {
    const b = new THREE.BufferGeometry();
    b.setAttribute('position', new THREE.Float32BufferAttribute(G.p, 3));
    b.setAttribute('uv', new THREE.Float32BufferAttribute(G.u, 2));
    b.setIndex(G.i);
    const m = new THREE.Mesh(b, new THREE.MeshBasicMaterial(opts));
    scene.add(m);
    return m;
  }
  // caixas de cor chapada: [x, y, z, sx, sy, sz, cor]
  function boxes(list, opts) {
    const m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(opts), list.length);
    const M = new THREE.Matrix4(), C = new THREE.Color();
    list.forEach(([x, y, z, sx, sy, sz, c], i) => { m.setMatrixAt(i, M.makeScale(sx, sy, sz).setPosition(x, y, z)); m.setColorAt(i, C.set(c)); });
    scene.add(m);
    return m;
  }

  /* ── 1. céu em faixas (textura de tela, 160×90) e 2. névoa ── */
  scene.fog = new THREE.Fog(FOG, 60, 480);
  scene.background = tex(160, 90, (g, w, h) => {
    const bands = [[0, '#05051a'], [7, '#0b0a2a'], [13, '#150e3e'], [18, '#241352'], [22, '#3b1766'], [25, '#5a1c74'], [28, '#7c267e'],
                   [31, '#9a3486'], [33, '#7a4a96'], [35, '#4a6aa0'], [37, '#2f8aa6'], [40, '#2c9a9c'], [46, '#2a8a98'], [50, FOG]];
    bands.forEach(([y, c], i) => {
      g.fillStyle = c; g.fillRect(0, y, w, h - y);
      if (i) { g.fillStyle = bands[i - 1][1]; for (let x = y & 1; x < w; x += 2) g.fillRect(x, y, 1, 1); }   // pontilhado na troca de faixa
    });
    g.fillStyle = '#c9c4ff'; for (let i = 0; i < 45; i++) g.fillRect(ri(0, w - 1), ri(0, 20), 1, 1);          // estrelas
    g.fillStyle = '#e9dcf2'; [3, 5, 7, 7, 7, 5, 3].forEach((d, r) => g.fillRect(124 - (d >> 1), 8 + r, d, 1)); // lua
    g.fillStyle = '#b9a6d6'; g.fillRect(125, 10, 2, 1); g.fillRect(122, 12, 1, 2);
    g.globalAlpha = .3; g.fillStyle = '#8a4aa8';                                                              // nuvens em blocos
    for (let i = 0; i < 9; i++) { const cx = ri(0, w), cy = ri(12, 34); for (let k = 0; k < 4; k++) g.fillRect(cx + ri(-8, 8), cy + k, ri(8, 26), 1); }
    g.globalAlpha = 1;
  });

  /* ── pano de fundo pintado: arco a 430 un. do centro, sem névoa, recortado por alphaTest ── */
  const backTex = tex(512, 128, (g, w, h) => {
    const B = 100;   // linha de base; abaixo dela é névoa chapada, que emenda com o chão distante
    const row = (cols, hMin, hMax, wins, p) => {
      for (let x = 0; x < w; x += ri(6, 20)) {
        const bw = ri(8, 22), bh = ri(hMin, hMax);
        g.fillStyle = pick(cols); g.fillRect(x, B - bh, bw, bh);
        if (rnd() < .4) g.fillRect(x + (bw >> 2), B - bh - ri(3, 10), bw >> 1, 10);
        for (let y = B - bh + 2; y < B - 2; y += 2) for (let xx = x + 1; xx < x + bw - 1; xx += 2)
          if (rnd() < p) { g.fillStyle = pick(wins); g.fillRect(xx, y, 1, 1); }
      }
    };
    row(['#2a6a86', '#2f7590', '#27607e'], 30, 80, ['#6cc0c4', '#9fe0e0'], .16);                 // megatorres longínquas, mais claras
    row(['#262a6a', '#2b2468', '#222e6e'], 12, 46, ['#7f8ee0', '#d070b0', '#58c8d0', '#e0a060'], .13);
    g.fillStyle = FOG;
    for (let y = B - 8; y < B; y++) for (let x = y & 1; x < w; x += 2) g.fillRect(x, y, 1, 1);
    g.fillRect(0, B, w, h - B);
  });
  backTex.wrapS = THREE.RepeatWrapping; backTex.repeat.x = 2;
  const back = new THREE.Mesh(
    new THREE.CylinderGeometry(430, 430, 200, 48, 1, true, Math.PI / 2 - .4, Math.PI + .8),   // meia-volta atrás + sobra nas pontas, para a panorâmica
    new THREE.MeshBasicMaterial({ map: backTex, alphaTest: .5, side: THREE.BackSide, fog: false }));
  back.position.set(span / 2, 80, 0);
  scene.add(back);

  /* ── 3. skyline em 3 camadas ── */
  const towerTex = (base, dim, lit, p) => {
    const t = tex(128, 256, (g, w, h) => {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      for (let by = 0; by < h; by += 16) for (let bx = 0; bx < w; bx += 16) {
        const q = rnd() < .2 ? p * 2.2 : p * rnd() * 1.4;   // ocupação por bloco: janelas acesas em manchas, não em ruído uniforme
        for (let y = by + 1; y < by + 16; y += 3) for (let x = bx + 1; x < bx + 16; x += 2) {
          g.fillStyle = rnd() < q ? pick(lit) : dim; g.fillRect(x, y, 1, 2);
        }
      }
      for (let i = 0; i < 5; i++) { g.fillStyle = pick(lit); g.fillRect(0, ri(0, 15) * 16, w, 1); }   // andares-faixa
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };
  // dens = texels por unidade: cai com a distância para 1 texel ≈ 1 px de tela (sem mipmap, evita cintilação)
  const LAYERS = [
    { zf: [27, 40],   w: [10, 20], h: [34, 72],  gap: 8,  dens: 2.5, ant: '#0c0d20', map: towerTex('#10122a', '#0a0b1c', [...WARM, '#39d6d0', '#ff5fb0'], .3) },
    { zf: [64, 96],   w: [14, 26], h: [60, 110], gap: 14, dens: 1.5, ant: '#161c46', map: towerTex('#1a2150', '#141a40', ['#7fd0e0', '#ffb14a', '#ff6fb8', '#9fb0ff'], .35) },
    { zf: [125, 170], w: [22, 40], h: [90, 135], gap: 22, dens: 1,   ant: '#1c3566', map: towerTex('#1f3a6e', '#1b3364', ['#6fd0d8', '#9fe8f0', '#d8a0e0'], .4) },
  ];
  const towers = [], flats = [], warn = [[], []];
  LAYERS.forEach((L, li) => {
    const G = geo(), k = L.dens;
    const block = (cx, zf, w, d, y0, y1) => {   // 3 paredes; fundo e teto nunca são vistos
      const xl = cx - w / 2, xr = cx + w / 2, zb = zf - d, u = ri(0, 127) / 128, uw = w * k / 128, ud = d * k / 128, v0 = y0 * k / 256, v1 = y1 * k / 256;
      quad(G, xl, y0, zb, xl, zf, y1 - y0, u, v0, u + ud, v1);
      quad(G, xl, y0, zf, xr, zf, y1 - y0, u + ud, v0, u + ud + uw, v1);
      quad(G, xr, y0, zf, xr, zb, y1 - y0, u + ud + uw, v0, u + 2 * ud + uw, v1);
    };
    for (let x = X0; x < X1;) {
      const w = ri(...L.w), h = ri(...L.h), d = ri(10, 16) + li * 4, zf = -ri(...L.zf), cx = x + w / 2;
      block(cx, zf, w, d, 0, h);
      let top = h;
      if (li && rnd() < .6) { top = Math.min(160, h + ri(10, 30)); block(cx, zf - 2, Math.round(w * .6), d * .6, h, top); }   // recuo no topo
      const a = ri(5, 14) * (1 + li * .5), ax = cx + ri(-2, 2), t = .5 + li * .3;
      flats.push([ax, top + a / 2, zf - d / 2, t, a, t, L.ant]);                                    // antena
      if (top > L.h[0] + 12) warn[ri(0, 1)].push(ax, top + a + .4, zf - d / 2);                     // luz de aviso nas mais altas
      towers.push({ li, x: cx, zf, w, d, h });
      x += w + ri(0, L.gap);
    }
    mesh(G, { map: L.map });
  });
  boxes(flats, {});
  const dots = warn.map(p => {
    const b = new THREE.BufferGeometry();
    b.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    const m = new THREE.Points(b, new THREE.PointsMaterial({ color: 0xff3838, size: 2, sizeAttenuation: false, fog: false }));
    scene.add(m);
    return m;
  });

  /* ── letreiros (atlas fixo) e telões (atlas de 4 quadros, animado por offset) ── */
  function glyphs(g, x, y, w, h, c) {   // glifos abstratos: barras em células de 8 px
    g.fillStyle = c;
    for (let gy = y + 5; gy + 6 <= y + h - 5; gy += 8) for (let gx = x + 5; gx + 6 <= x + w - 5; gx += 8) {
      if (rnd() < .2) continue;
      for (let k = 0; k < 3; k++) { const a = ri(0, 2) * 2, b = ri(0, 2) * 2; rnd() < .5 ? g.fillRect(gx + a, gy + b, 6 - a, 2) : g.fillRect(gx + a, gy + b, 2, 6 - b); }
    }
  }
  function frame(g, x, y, w, h, c, a) {
    g.fillStyle = '#0a0a18'; g.fillRect(x, y, w, h);
    g.globalAlpha = a; g.fillStyle = c; g.fillRect(x, y, w, h); g.globalAlpha = 1;
    g.fillRect(x, y, w, 2); g.fillRect(x, y + h - 2, w, 2); g.fillRect(x, y, 2, h); g.fillRect(x + w - 2, y, 2, h);
  }
  const signTex = tex(128, 128, g => {   // 4 horizontais 64×32 em cima, 4 verticais 32×64 embaixo
    for (let i = 0; i < 8; i++) {
      const c = pick(NEON), [x, y, w, h] = i < 4 ? [(i & 1) * 64, (i >> 1) * 32, 64, 32] : [(i - 4) * 32, 64, 32, 64];
      frame(g, x, y, w, h, c, .22); glyphs(g, x, y, w, h, rnd() < .5 ? c : '#f4f6ff');
    }
  });
  const screenTex = tex(256, 64, g => {
    for (let f = 0; f < 4; f++) {
      const x = f * 64, c = pick(NEON);
      frame(g, x, 0, 64, 64, c, .3);
      for (let i = 0; i < 9; i++) { g.fillStyle = pick([c, '#f4f6ff', pick(NEON)]); g.fillRect(x + ri(1, 11) * 4, ri(1, 11) * 4, ri(1, 4) * 4, ri(1, 3) * 4); }
      g.fillStyle = 'rgba(0,0,0,.3)'; for (let y = 3; y < 62; y += 2) g.fillRect(x + 2, y, 60, 1);   // linhas de varredura
    }
  });
  screenTex.wrapS = THREE.RepeatWrapping;
  const cell = (x, y, w, h) => [x / 128, 1 - (y + h) / 128, (x + w) / 128, 1 - y / 128];
  // placa na fachada da frente (side 0) ou na lateral +x (side 1), 0.3 à frente da parede
  const plate = (G, t, sw, sh, y, side, uv) => {
    const off = (rnd() - .5) * Math.max(0, t.w - sw - 2), xr = t.x + t.w / 2 + .3;
    side ? quad(G, xr, y, t.zf - 1, xr, t.zf - 1 - sw, sh, ...uv)
         : quad(G, t.x - sw / 2 + off, y, t.zf + .3, t.x + sw / 2 + off, t.zf + .3, sh, ...uv);
  };
  const GS = geo(), GT = geo();
  let screens = 0;
  for (const t of towers) {
    if (t.li === 2 && screens < 7 && rnd() < .55) {
      const s = Math.min(t.w - 4, 24), f = ri(0, 3);
      plate(GT, t, s, s, ri(60, t.h - s - 4), 0, [f / 4, 0, (f + 1) / 4, 1]); screens++;
    } else if (rnd() < .5) {
      const s = 1 + t.li * .7, vert = rnd() < .5, sw = vert ? 5 * s : Math.min(t.w - 2, 14 * s), sh = vert ? sw * 2 : sw / 2, yMin = 30 + t.li * 10;
      if (t.h - sh - 2 < yMin) continue;
      plate(GS, t, sw, sh, ri(yMin, t.h - sh - 2), vert && rnd() < .4 ? 1 : 0,
        vert ? cell(ri(0, 3) * 32, 64, 32, 64) : cell(ri(0, 1) * 64, ri(0, 1) * 32, 64, 32));
    }
  }
  mesh(GS, { map: signTex });
  mesh(GT, { map: screenTex });

  /* ── 7. névoa baixa em faixas, entre as camadas ── */
  const mistTex = tex(128, 32, (g, w) => {
    ['#5a2a7a', '#235a78'].forEach((c, k) => {
      g.fillStyle = c;
      for (let y = 0; y < 16; y++) for (let x = 0; x < w; x += 4) if (rnd() < (y + 1) / 14) g.fillRect(x, k * 16 + y, 4, 1);
    });
  });
  mistTex.wrapS = THREE.RepeatWrapping;
  const GM = geo(), ML = X1 - X0 + 160;
  for (const [z, hgt, k] of [[-60, 18, 0], [-121, 26, 1], [-200, 36, 1]])
    quad(GM, X0 - 80, 0, z, X1 + 80, z, hgt, 0, k ? 0 : .504, ML / 256, k ? .496 : 1);
  mesh(GM, { map: mistTex, alphaTest: .5 });

  /* ── 4. tráfego aéreo: pistas ao longo de x, nos corredores livres entre as camadas ── */
  const LANES = [[40, -20, 18], [28, -60, -14], [47, -60, 20], [72, -61, -24], [92, -42, 16], [44, -120, -12], [88, -120, 15],
                 [58, 10, -20], [50, 26, 22]];   // [y, z, velocidade]; as duas últimas passam sobre a rua, acima de y = 45
  const TX0 = X0 - 40, TX1 = X1 + 40, PER = 22, cars = [], vel = [];
  for (const [y, z, v] of LANES) for (let i = 0; i < PER; i++) {
    cars.push([TX0 + (i + rnd() * .7) * (TX1 - TX0) / PER, y + rnd() * .8 - .4, z + rnd() - .5, 2.4, .5, 1,
      v > 0 ? pick(['#ffe9b0', '#ffd27a', NEON[0]]) : pick(['#ff4a4a', NEON[1], NEON[2]])]);
    vel.push(v);
  }
  const traffic = boxes(cars, { fog: false });
  traffic.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  traffic.frustumCulled = false;

  /* ── 6. holofotes: triângulo largo + miolo estreito somados, atrás da última camada ── */
  const beamGeo = new THREE.BufferGeometry();
  beamGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 8, 260, 0, -8, 260, 0, 0, 0, 0, 3, 260, 0, -3, 260, 0], 3));
  const beamMat = new THREE.MeshBasicMaterial({ color: 0x4fd0d8, transparent: true, opacity: .1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
  const beams = [-130, span * .45, span + 90].map(x => {
    const m = new THREE.Mesh(beamGeo, beamMat);
    m.position.set(x, 0, -197);
    scene.add(m);
    return m;
  });

  /* ── 5. chuva: um LineSegments; as gotas vivem num ladrilho de VOL³ que se repete em torno da câmera ── */
  let rain = null, drops = null;
  if (RAIN) {
    drops = new Float32Array(DROPS * 4);   // x, y, z, velocidade
    for (let i = 0; i < DROPS; i++) drops.set([rnd() * VOL, rnd() * VOL, rnd() * VOL, 34 + rnd() * 14], i * 4);
    const b = new THREE.BufferGeometry();
    b.setAttribute('position', new THREE.BufferAttribute(new Float32Array(DROPS * 6), 3).setUsage(THREE.DynamicDrawUsage));
    rain = new THREE.LineSegments(b, new THREE.LineBasicMaterial({ color: 0x9db4ff, transparent: true, opacity: .3, depthWrite: false, fog: false }));
    rain.frustumCulled = false;
    scene.add(rain);
  }
  const wrap = v => ((v % VOL) + VOL * 1.5) % VOL - VOL / 2;   // distância à câmera dobrada para [−VOL/2, VOL/2)

  onFrame((dt, now) => {
    const a = traffic.instanceMatrix.array;
    for (let i = 0; i < vel.length; i++) { const x = a[i * 16 + 12] + vel[i] * dt; a[i * 16 + 12] = x > TX1 ? TX0 : x < TX0 ? TX1 : x; }
    traffic.instanceMatrix.needsUpdate = true;

    dots[0].visible = now % 1600 < 900;
    dots[1].visible = (now + 700) % 1600 < 900;
    screenTex.offset.x = (Math.floor(now / 2400) % 4) / 4;
    mistTex.offset.x += dt * .004;
    for (let i = 0; i < beams.length; i++) beams[i].rotation.z = Math.sin(now * .00012 * (1 + i * .3) + i * 2) * .45;

    if (rain) {
      const p = rain.geometry.attributes.position.array, c = camera.position;
      for (let i = 0; i < DROPS; i++) {
        const j = i * 4, k = i * 6;
        drops[j + 1] = (drops[j + 1] - drops[j + 3] * dt + VOL) % VOL;
        const x = c.x + wrap(drops[j] - c.x), y = c.y + wrap(drops[j + 1] - c.y), z = c.z + wrap(drops[j + 2] - c.z);
        p[k] = x; p[k + 1] = y; p[k + 2] = z;
        p[k + 3] = x - .3; p[k + 4] = y - 1.8; p[k + 5] = z;
      }
      rain.geometry.attributes.position.needsUpdate = true;
    }
  });
}
