// Texturas de fachada em pixel art. Só fillRect em coordenadas inteiras;
// aleatoriedade só via o.rnd/ri/pick (a cidade é idêntica a cada abertura).
const DARK = '#0a0a18', IRON = '#14131f', METAL = '#3a3558', METAL_HI = '#6a6590';
const COOL = ['#39d6d0', '#ff5fb0', '#9fe8ff'];
const FLOOR_H = { res: 18, com: 22, ind: 26 };

export function paintFacade(g, w, h, o) {
  const { base, lit, signs, far, panel, rnd, ri, pick, NEON, WARM } = o;

  const R = (c, x, y, rw, rh, a = 1) => {
    if (rw < 1 || rh < 1) return;
    g.globalAlpha = a; g.fillStyle = c; g.fillRect(x | 0, y | 0, rw | 0, rh | 0); g.globalAlpha = 1;
  };
  const frame = (c, x, y, rw, rh, a) => { R(c, x, y, rw, 1, a); R(c, x, y + rh - 1, rw, 1, a); R(c, x, y + 1, 1, rh - 2, a); R(c, x + rw - 1, y + 1, 1, rh - 2, a); };
  const lightColor = () => rnd() < .75 ? pick(WARM) : pick(COOL);

  // áreas ocupadas: outdoor do slide (com a moldura 3D, ~5 texels a mais), letreiros, aparelhos
  const blocked = panel && { x: panel.x - 5, y: panel.y - 5, w: panel.w + 10, h: panel.h + 10 };
  const used = blocked ? [blocked] : [];
  const over = (u, x, y, rw, rh) => x < u.x + u.w && x + rw > u.x && y < u.y + u.h && y + rh > u.y;
  const hit = (x, y, rw, rh) => x < 0 || y < 0 || x + rw > w || y + rh > h || used.some(u => over(u, x, y, rw, rh));
  const take = (x, y, rw, rh) => used.push({ x, y, w: rw, h: rh });
  const inPanel = (x, y, rw, rh) => blocked && over(blocked, x, y, rw, rh);
  const place = (rw, rh, y0, y1, draw) => {
    for (let i = 0; i < 14; i++) {
      const x = ri(2, Math.max(2, w - 2 - rw)), y = ri(y0, Math.max(y0, y1 - rh));
      if (!hit(x - 1, y - 1, rw + 2, rh + 2)) { draw(x, y, rw, rh); return; }
    }
  };

  // glifos abstratos: barras soltas em células, sem imitar escrita real
  const glyphs = (c, x, y, gw, gh) => {
    const s = Math.max(3, Math.min(7, gw, gh)), n = s - 1;
    const nx = Math.max(1, (gw + 1) / s | 0), ny = Math.max(1, (gh + 1) / s | 0);
    const ox = x + ((gw - nx * s + 1) >> 1), oy = y + ((gh - ny * s + 1) >> 1);
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      if (rnd() < .12) continue;
      const cx = ox + i * s, cy = oy + j * s;
      for (let k = ri(2, 3); k--;) rnd() < .5 ? R(c, cx, cy + ri(0, n - 1), n, 1) : R(c, cx + ri(0, n - 1), cy, 1, n);
    }
  };

  const sign = (x, y, sw, sh, c = pick(NEON)) => {
    take(x - 1, y - 1, sw + 2, sh + 2);
    R(DARK, x - 1, y - 1, sw + 2, sh + 2); R(c, x - 1, y - 1, sw + 2, sh + 2, .4);   // halo: mesma cor, mais escura
    if (rnd() < .3) {                                   // caixa de luz cheia
      R(c, x, y, sw, sh); R('#fff', x, y, sw, 1, .35);
      glyphs(DARK, x + 2, y + 2, sw - 4, sh - 4);
    } else {                                            // tubo neon sobre fundo escuro
      R(DARK, x, y, sw, sh); R(c, x, y, sw, sh, .16); frame(c, x, y, sw, sh);
      if (sw > 16 && sh > 16) frame(c, x + 2, y + 2, sw - 4, sh - 4, .45);
      const m = sw > 16 && sh > 16 ? 4 : 2;
      glyphs(rnd() < .7 ? c : '#f4f6ff', x + m, y + m, sw - 2 * m, sh - 2 * m);
    }
  };

  // ---------- torres distantes: silhueta, janelas miúdas, 1–2 letreiros grandes ----------
  if (far) {
    R(base, 0, 0, w, h);
    for (let y = 4; y < h - 4; y += 5) {
      const band = rnd() < .1;                          // andar inteiro aceso
      for (let x = 3; x < w - 5; x += 5)
        rnd() < (band ? .85 : lit) ? R(lightColor(), x, y, 3, 2) : R(DARK, x, y, 3, 2, .5);
    }
    R('#000', 0, 0, 2, h, .3); R('#000', w - 2, 0, 2, h, .3);
    for (let i = Math.min(signs, 2); i--;) {
      const v = rnd() < .5;
      place(Math.min(w - 6, v ? ri(9, 13) : ri(24, 38)), Math.min(h - 12, v ? ri(34, 60) : ri(12, 18)), 6, h * .6 | 0, sign);
    }
    R('#ff4a4a', w >> 1, 0, 2, 2);                       // luz de topo
    return;
  }

  const style = pick(['res', 'com', 'ind']);
  const FH = FLOOR_H[style], G = h >= 96 ? 28 : 0, TOP = 8;

  // ---------- aparelhos ----------
  const ac = (x, y) => {
    take(x, y, 9, 9);
    R('#000', x + 4, y + 7, 1, ri(6, 20), .28);          // mancha de água escorrida
    R('#6b6f88', x, y, 9, 7); R('#3d405a', x, y + 6, 9, 1);
    R('#1c1d30', x + 1, y + 1, 5, 5); R('#6b6f88', x + 3, y + 1, 1, 5, .6); R('#6b6f88', x + 1, y + 3, 5, 1, .6);
    R('#3d405a', x + 7, y + 1, 1, 1); R('#3d405a', x + 7, y + 3, 1, 1);
    R(rnd() < .6 ? '#1FE6A6' : '#ff4a4a', x + 7, y + 5, 1, 1);
    R(IRON, x + 1, y + 7, 1, 2); R(IRON, x + 7, y + 7, 1, 2);
  };
  const elecBox = (x, y) => {
    take(x, y, 7, 9);
    R(DARK, x + 2, y - ri(6, 18), 1, 30, .6);            // fiação atravessando a caixa
    R('#4d5a5e', x, y, 7, 9); R('#2c3438', x, y + 8, 7, 1); R('#2c3438', x + 3, y + 1, 1, 7);
    R('#ffd27a', x + 1, y + 1, 1, 1); R('#ff4a4a', x + 5, y + 6, 1, 1);
  };
  const vent = (x, y) => {
    take(x, y, 9, 9);
    R(IRON, x, y, 9, 9); frame(METAL_HI, x, y, 9, 9, .7);
    for (let k = 2; k < 7; k += 2) R(METAL, x + 2, y + k, 5, 1);
    R('#000', x + 1, y + 9, 7, ri(4, 12), .2);
  };

  // ---------- janelas ----------
  const litWin = (x, y, ww, wh) => {
    const c = lightColor();
    R(c, x - 1, y - 1, ww + 2, wh + 2, .22); R(c, x, y, ww, wh);
    for (let k = 0, b = ri(2, wh); k < b; k += 2) R('#000', x, y + k, ww, 1, .4);   // persiana meio baixada
    if (rnd() < .3) R(DARK, x + ri(1, ww - 3), y + wh - 4, 2, 4, .7);              // silhueta
  };
  const darkWin = (x, y, ww, wh) => { R('#0c0c1c', x, y, ww, wh); R('#7890c8', x, y, ww, 1, .2); if (rnd() < .3) R('#7890c8', x, y, 2, wh, .1); };
  const win = (x, y, ww, wh, p = lit) => {
    R('#000', x - 1, y - 1, ww + 2, wh + 2, .4);
    rnd() < p ? litWin(x, y, ww, wh) : darkWin(x, y, ww, wh);
    R('#fff', x - 1, y + wh, ww + 2, 1, .1);            // peitoril
  };

  const floors = {
    res(fy) {                                           // janelas com persiana, sacadas, ar sob a janela
      const n = (w - 6) / 16 | 0, x0 = (w - n * 16 + 6) >> 1;
      for (let i = 0; i < n; i++) {
        const x = x0 + i * 16, y = fy + 3;
        if (inPanel(x - 2, y, 14, FH - 3)) continue;
        win(x, y, 10, 9);
        const r = rnd();
        if (r < .3) {                                   // sacada
          R(IRON, x - 2, y + 10, 14, 5); R(METAL_HI, x - 2, y + 9, 14, 1);
          for (let k = 0; k < 14; k += 2) R(METAL, x - 2 + k, y + 10, 1, 4);
          if (rnd() < .5) R(pick(['#1FE6A6', '#2a8a5a', '#c9c4b0']), x + ri(0, 7), y + 7, ri(2, 4), 3);   // vaso/roupa
        } else if (r < .42) ac(x, y + 9);
      }
    },
    com(fy) {                                           // faixa contínua de vidro com montantes
      const gy = fy + 5, gh = FH - 10;
      let on = rnd() < lit, c = lightColor();
      for (let x = 3; x + 7 <= w - 3; x += 8) {
        if (rnd() < .3) { on = rnd() < lit + .15; c = lightColor(); }
        if (inPanel(x, gy, 8, gh)) continue;
        R('#000', x - 1, gy - 1, 9, gh + 2, .4);
        if (on) {
          R(c, x, gy, 7, gh); R('#000', x, gy, 7, ri(0, 6), .35);
          if (rnd() < .4) R(DARK, x + ri(0, 4), gy + gh - 3, ri(2, 3), 3, .65);
        } else darkWin(x, gy, 7, gh);
      }
      R('#fff', 2, gy + gh + 1, w - 4, 1, .08);
    },
    ind(fy) {                                           // duto horizontal, venezianas ou janelinhas gradeadas
      const m = ri(0, 3);
      if (m === 0) {
        R('#2e2c44', 0, fy + 7, w, 6); R(METAL_HI, 0, fy + 7, w, 1, .7); R('#000', 0, fy + 13, w, 1, .4);
        for (let x = ri(2, 12); x < w; x += 16) R(IRON, x, fy + 6, 2, 8);
      } else if (m === 1) {
        for (let x = 5; x + 14 <= w - 3; x += 20) {
          if (inPanel(x, fy + 4, 14, FH - 9)) continue;
          R(IRON, x, fy + 4, 14, FH - 9);
          for (let k = 1; k < FH - 10; k += 2) R(METAL, x + 1, fy + 4 + k, 12, 1);
        }
      } else {
        for (let x = 6; x + 7 <= w - 3; x += 14) {
          if (inPanel(x, fy + 6, 7, 8)) continue;
          win(x, fy + 6, 7, 8, lit * .8);
          R(IRON, x + 3, fy + 6, 1, 8, .7);
        }
      }
    },
  };

  const fireEscape = () => {
    const fx = ri(3, w - 26), c = '#2e2c44';
    let dir = rnd() < .5;
    for (let py = TOP + FH * 2 - 3; py < h - G - 2; py += FH, dir = !dir) {
      if (inPanel(fx, py - 6, 22, FH + 6)) continue;
      if (py + FH < h - G) for (let k = 0; k < FH; k++) R(c, fx + 3 + ((dir ? k : FH - 1 - k) * 14 / FH | 0), py + k, 3, 1);   // lance de escada
      R(c, fx, py - 6, 22, 1);
      for (let k = 0; k < 22; k += 3) R(c, fx + k, py - 5, 1, 5);
      R(IRON, fx - 1, py, 24, 2); R(METAL_HI, fx - 1, py, 24, 1, .5);
    }
  };

  const ground = y0 => {                                // térreo: lojas com porta de enrolar, vitrine, toldo
    R('#000', 0, y0, w, G, .3);
    if (style === 'ind') for (let x = 0; x < w; x += 6) R(x / 6 & 1 ? IRON : '#ffb14a', x, y0, 6, 2);
    else { R(METAL, 0, y0, w, 2); R('#000', 0, y0 + 2, w, 1, .4); }
    for (let x = 2; x < w - 12;) {
      let bw = ri(20, 40);
      if (w - 2 - x - bw < 14) bw = w - 2 - x;
      const r = rnd(), ty = y0 + 10, th = G - 12;
      if (r < .35) {                                    // porta de enrolar
        R('#4a4d63', x, ty, bw, th);
        for (let k = 1; k < th; k += 2) R('#000', x, ty + k, bw, 1, .3);
        R('#2a2c3e', x + (bw >> 1) - 1, ty + th - 2, 3, 2);
        for (let k = ri(0, 3); k--;) R(pick(NEON), x + ri(1, bw - 7), ty + ri(2, th - 5), ri(2, 6), ri(1, 3), .45);   // pichação
      } else if (r < .75) {                             // vitrine acesa
        const c = lightColor();
        R(c, x - 1, ty - 1, bw + 2, th + 2, .25); R(c, x, ty, bw, th); R('#fff', x, ty, bw, 2, .25);
        for (let k = 1; k < bw - 2; k += ri(3, 6)) { const hh = ri(2, 8); R(DARK, x + k, ty + th - hh, ri(1, 3), hh, .75); }
        for (let k = 9; k < bw - 2; k += 10) R(IRON, x + k, ty, 1, th);
      } else {                                          // porta de serviço, lâmpada, cartazes
        R(IRON, x, ty - 1, bw, th + 1, .5);
        const dx = x + ri(1, Math.max(1, bw - 11)), lamp = pick(WARM);
        R('#23243a', dx, ty, 9, th); R(METAL, dx, ty, 9, 1); R(lamp, dx + 2, ty + 2, 5, 4); R(DARK, dx + 4, ty + 2, 1, 4);
        R(lamp, dx, ty - 4, 9, 3, .3); R(lamp, dx + 1, ty - 3, 7, 1);
        for (let k = ri(2, 4); k--;) R(pick(['#c9c4b0', ...NEON]), x + ri(0, bw - 4), ty + ri(1, th - 6), ri(2, 4), ri(3, 5), .55);
      }
      if (rnd() < .45) {                                // toldo listrado
        const c = pick(NEON);
        for (let k = 0; k < bw + 2; k += 3) R(k / 3 & 1 ? '#e8e6f0' : c, x - 1 + k, y0 + 5, Math.min(3, bw + 2 - k), 4);
        R('#000', x - 1, y0 + 8, bw + 2, 1, .35);
      } else sign(x + 1, y0 + 2, bw - 2, 7);
      x += bw + 2;
    }
    R('#000', 0, h - 2, w, 2, .5);
    take(0, y0, w, G);
  };

  // ---------- composição ----------
  R(base, 0, 0, w, h);
  for (let fy = TOP; fy + FH <= h - G; fy += FH) {      // variação de tom por andar + faixa de laje
    R(pick(['#000', '#1c2c5c', '#44205a']), 0, fy, w, FH, rnd() * .2);
    R('#000', 0, fy + FH - 1, w, 1, .4); R('#fff', 0, fy + FH - 2, w, 1, .06);
  }
  for (let i = w * h / 500 | 0; i--;) R('#000', ri(0, w - 1), ri(0, h - 10), 1, ri(4, 24), .1 + rnd() * .15);       // escorridos
  for (let i = w * h / 2500 | 0; i--;) R(rnd() < .7 ? '#000' : '#8a80b0', ri(0, w - 8), ri(0, h - 6), ri(4, 14), ri(3, 8), .08);   // manchas
  for (let x = style === 'ind' ? 20 : 32; x < w; x += style === 'ind' ? 20 : 32) R('#000', x, TOP, 1, h - TOP - G, .22);   // juntas

  for (let fy = TOP; fy + FH <= h - G; fy += FH) floors[style](fy);

  for (let i = style === 'ind' ? ri(4, 6) : ri(2, 3); i--;) {   // canos verticais com abraçadeiras
    const x = ri(2, w - 5), y0 = ri(0, h >> 1), pw = style === 'ind' ? ri(2, 3) : 2;
    R(METAL, x, y0, pw, h - G - y0); R(METAL_HI, x, y0, 1, h - G - y0, .6);
    for (let y = y0 + 6; y < h - G; y += 14) R('#55507a', x - 1, y, pw + 2, 2);
  }
  if (w >= 64 && (style === 'res' || rnd() < .35)) fireEscape();

  R('#000', 0, 0, w, TOP - 2, .4); R('#fff', 0, TOP - 2, w, 1, .1);            // platibanda
  R('#000', 0, 0, 1, h, .35); R('#000', w - 1, 0, 1, h, .35);
  if (G) ground(h - G);

  if (panel) {
    // a câmera para aqui: letreiros verticais nos flancos e fileiras acima/abaixo do outdoor
    const top = blocked.y, bot = blocked.y + blocked.h;
    for (const x0 of [1, bot && blocked.x + blocked.w + 1]) {
      const gap = (x0 === 1 ? blocked.x : w) - x0 - 1;
      if (gap < 8) continue;
      for (let y = Math.max(TOP, top - ri(0, 10)); y < bot;) {
        const sh = ri(18, 34);
        if (y + sh > h - G - 2) break;
        if (rnd() < .65) { sign(x0, y, Math.min(gap, ri(8, 10)), sh); y += sh + 3; }
        else { gap >= 9 ? ac(x0, y) : elecBox(x0, y); y += 13; }
      }
    }
    for (const above of [true, false]) for (let x = ri(2, 10); x < w - 20;) {
      const sw = Math.min(ri(16, 40), w - 2 - x), sh = ri(9, 13);
      const y = above ? top - sh - ri(1, 4) : bot + ri(1, 4);
      if (rnd() < .75 && !hit(x - 1, y - 1, sw + 2, sh + 2)) sign(x, y, sw, sh);
      x += sw + ri(3, 10);
    }
  }

  for (let i = signs; i--;) {
    const k = rnd();
    const [sw, sh] = k < .4 ? [ri(9, 13), ri(28, 56)] : k < .85 ? [ri(22, 46), ri(10, 16)] : [ri(22, 30), ri(22, 30)];
    place(Math.min(sw, w - 6), Math.min(sh, h - G - TOP - 4), TOP, h - G, sign);
  }
  for (let i = w * h / 1400 | 0; i--;) {
    const r = rnd();
    place(9, 9, TOP, h - G - 10, r < .55 ? ac : r < .8 ? elecBox : vent);
  }
}
