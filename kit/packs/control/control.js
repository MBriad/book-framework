/* kit/packs/control/control.js — 控制学科交互原语（四件套 + 根轨迹）。
   原语：step-2nd 参数滑块 / bode-cursor 游标联动 / polezero-drag 零极点拖拽 /
        step-presets 情形切换 / root-locus 根轨迹。
   所有可调参数都从 data-* 读，组件本身不写死具体内容。 */
(function (global) {
  'use strict';
  var Ctl = global.Ctl = global.Ctl || {};
  var Fig = Ctl.Fig;
  var registry = {};
  Ctl.Pack = {
    register: function (n, f) { registry[n] = f; },
    get: function (n) { return registry[n]; },
    list: function () { return Object.keys(registry); }
  };

  /* ---------------- 复数与多项式 ---------------- */
  function cmul(a, b) { return [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]]; }
  function csub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
  function cdiv(a, b) {
    var d = b[0] * b[0] + b[1] * b[1] || 1e-300;
    return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
  }
  function cabs(a) { return Math.sqrt(a[0] * a[0] + a[1] * a[1]); }
  function peval(c, s) {
    var r = [c[0], 0];
    for (var i = 1; i < c.length; i++) r = [r[0] * s[0] - r[1] * s[1] + c[i], r[0] * s[1] + r[1] * s[0]];
    return r;
  }
  /* Durand-Kerner：系数按降幂给出，返回全部复根 */
  function rootsOf(c) {
    var n = c.length - 1;
    if (n < 1) return [];
    var a = c.map(function (v) { return v / c[0]; });
    var bound = 1, i;
    for (i = 1; i < a.length; i++) bound = Math.max(bound, Math.abs(a[i]));
    var rs = [];
    for (i = 0; i < n; i++) {
      var ang = 2 * Math.PI * i / n + 0.5;
      rs.push([Math.cos(ang) * bound, Math.sin(ang) * bound]);
    }
    for (var it = 0; it < 400; it++) {
      var maxd = 0;
      for (i = 0; i < n; i++) {
        var num = peval(a, rs[i]);
        var den = [1, 0];
        for (var j = 0; j < n; j++) if (j !== i) den = cmul(den, csub(rs[i], rs[j]));
        if (cabs(den) < 1e-14) den = [1e-14, 1e-14];
        var d = cdiv(num, den);
        rs[i] = csub(rs[i], d);
        maxd = Math.max(maxd, cabs(d));
      }
      if (maxd < 1e-13) break;
    }
    return rs;
  }
  function mulReal(a, b) {
    var out = new Array(a.length + b.length - 1), i, j;
    for (i = 0; i < out.length; i++) out[i] = 0;
    for (i = 0; i < a.length; i++) for (j = 0; j < b.length; j++) out[i + j] += a[i] * b[j];
    return out;
  }
  /* 由（共轭成对的）根构造实系数多项式（降幂）；gain 为可选增益 */
  function polyFromRoots(roots, gain) {
    var c = [gain === undefined ? 1 : gain];
    for (var i = 0; i < roots.length; i++) {
      var re = roots[i][0], im = roots[i][1];
      if (im > 1e-12) c = mulReal(c, [1, -2 * re, re * re + im * im]);
      else if (im < -1e-12) continue;
      else c = mulReal(c, [1, -re]);
    }
    return c;
  }
  function tfEval(gain, zeros, poles, s) {
    var num = [gain, 0], den = [1, 0], i;
    for (i = 0; i < zeros.length; i++) num = cmul(num, csub(s, zeros[i]));
    for (i = 0; i < poles.length; i++) den = cmul(den, csub(s, poles[i]));
    return cdiv(num, den);
  }
  /* 可控标准型 + RK4 求单位阶跃响应；den/num 均按降幂，需 num 次数 < den 次数 */
  function stepFromTF(den, num, tmax, dt) {
    var n = den.length - 1;
    if (n < 1) return [[0, 0]];
    var a = den.slice(1);
    var b = num.slice();
    while (b.length < n) b.unshift(0);
    if (b.length > n) b = b.slice(b.length - n);
    var x = new Array(n), i;
    for (i = 0; i < n; i++) x[i] = 0;
    function deriv(xx) {
      var dx = new Array(n), s = 1, k;
      for (k = 0; k < n; k++) s -= a[k] * xx[k];
      dx[0] = s;
      for (k = 1; k < n; k++) dx[k] = xx[k - 1];
      return dx;
    }
    function shift(xx, dd, h) {
      var o = new Array(n), k;
      for (k = 0; k < n; k++) o[k] = xx[k] + dd[k] * h;
      return o;
    }
    function yof(xx) { var y = 0, k; for (k = 0; k < n; k++) y += b[k] * xx[k]; return y; }
    var steps = Math.max(1, Math.round(tmax / dt));
    var h = tmax / steps;
    var out = [];
    for (var s2 = 0; s2 <= steps; s2++) {
      out.push([s2 * h, yof(x)]);
      var k1 = deriv(x), k2 = deriv(shift(x, k1, h / 2)), k3 = deriv(shift(x, k2, h / 2)), k4 = deriv(shift(x, k3, h));
      for (i = 0; i < n; i++) x[i] += h * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]) / 6;
    }
    return out;
  }
  /* 首次穿越某个水平的时刻（线性插值） */
  function firstCrossT(ys, level) {
    for (var i = 0; i < ys.length; i++) if (ys[i][1] >= level) {
      if (i === 0) return ys[0][0];
      var a = ys[i - 1], b = ys[i];
      var t = (level - a[1]) / ((b[1] - a[1]) || 1);
      return a[0] + (b[0] - a[0]) * t;
    }
    return NaN;
  }

  /* finalValue 传解析终值（直流增益）；不传则退回最后一个采样点。
     band 是调节时间的误差带半宽，**默认 0.01（±1%）——Franklin 全书用的判据**；
     若按 ±2% 口径算会小约 15%，两边不能混用。
     峰值用三点抛物线插值细化，否则离散采样的峰值会系统性低于理论超调量。 */
  function stepMetrics(ys, finalValue, band) {
    var tol = (band === undefined) ? 0.01 : band;
    var fin = (finalValue === undefined) ? (ys[ys.length - 1][1] || 1) : finalValue;
    var i, mi = 0;
    for (i = 0; i < ys.length; i++) if (ys[i][1] > ys[mi][1]) mi = i;
    var peak = ys[mi][1], tp = ys[mi][0];
    if (mi > 0 && mi < ys.length - 1) {
      var y0 = ys[mi - 1][1], y1 = ys[mi][1], y2 = ys[mi + 1][1];
      var den = y0 - 2 * y1 + y2;
      if (Math.abs(den) > 1e-15) {
        var d = 0.5 * (y0 - y2) / den;
        if (Math.abs(d) <= 1) { peak = y1 - 0.25 * (y0 - y2) * d; tp = ys[mi][0] + d * (ys[mi][0] - ys[mi - 1][0]); }
      }
    }
    var ts = 0;
    for (i = ys.length - 1; i >= 0; i--) if (Math.abs(ys[i][1] - fin) > tol * Math.abs(fin)) { ts = ys[i][0]; break; }
    return { final: fin, peak: peak, tp: tp, overshoot: (peak - fin) / Math.abs(fin) * 100, ts: ts };
  }

  /* ---------------- DOM 小工具 ---------------- */
  function mk(tag, cls) { var n = document.createElement(tag); if (cls) n.className = cls; return n; }
  function scaffold(el) {
    el.classList.add('ctl-widget');
    var t = el.getAttribute('data-title');
    if (t) { var p = mk('p', 'ctl-widget-title'); p.textContent = t; el.appendChild(p); }
    var wrap = mk('div', 'ctl-canvas-wrap');
    el.appendChild(wrap);
    return wrap;
  }
  function figBox(wrap, hClass, drag) {
    var box = mk('div');
    box.setAttribute('data-fig', '');
    var c = mk('canvas', 'ctl-canvas ' + (hClass || 'ctl-h-md') + (drag ? ' ctl-drag' : ''));
    box.appendChild(c);
    wrap.appendChild(box);
    return { box: box, canvas: c };
  }
  function controls(el) { var d = mk('div', 'ctl-controls'); el.appendChild(d); return d; }
  function readout(el) { var d = mk('div', 'ctl-readout'); el.appendChild(d); return d; }
  function setReadout(node, pairs) {
    node.innerHTML = pairs.map(function (p) { return '<span>' + p[0] + ' <b>' + p[1] + '</b></span>'; }).join('');
  }
  function toolbar(el, fig, name) {
    var d = mk('div', 'ctl-toolbar');
    var b = mk('button', 'ctl-btn');
    b.type = 'button'; b.textContent = '导出 PNG';
    b.addEventListener('click', function () { Fig.exportPNG(fig, name); });
    d.appendChild(b); el.appendChild(d); return d;
  }
  function slider(parent, label, min, max, step, value, fmt, oninput) {
    var w = mk('label', 'ctl-ctl');
    var s = mk('span'); s.textContent = label;
    var i = mk('input'); i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = value;
    var v = mk('span', 'ctl-val'); v.textContent = fmt(value);
    i.addEventListener('input', function () { var x = parseFloat(i.value); v.textContent = fmt(x); oninput(x); });
    w.appendChild(s); w.appendChild(i); w.appendChild(v); parent.appendChild(w);
    return {
      input: i,
      set: function (x) { i.value = x; v.textContent = fmt(x); }
    };
  }
  function segmented(parent, items, onpick) {
    var d = mk('div', 'ctl-seg'), btns = [];
    items.forEach(function (it, k) {
      var b = mk('button');
      b.type = 'button'; b.textContent = it.label;
      b.setAttribute('aria-pressed', k === 0 ? 'true' : 'false');
      b.addEventListener('click', function () {
        btns.forEach(function (x, j) { x.setAttribute('aria-pressed', j === k ? 'true' : 'false'); });
        onpick(it, k);
      });
      btns.push(b); d.appendChild(b);
    });
    parent.appendChild(d);
    return btns;
  }
  function attachPointer(canvas, onDown, onMove) {
    var active = null;
    canvas.addEventListener('pointerdown', function (e) {
      active = e.pointerId;
      try { canvas.setPointerCapture(active); } catch (err) { /* 部分浏览器不支持 */ }
      onDown(e); e.preventDefault();
    });
    canvas.addEventListener('pointermove', function (e) {
      if (active !== e.pointerId) return;
      onMove(e); e.preventDefault();
    });
    function end(e) {
      if (active !== e.pointerId) return;
      active = null;
      try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    }
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }
  function dataX(P, px) { return P.xinv(px); }
  function dataY(P, py) { return P.yinv(py); }
  function rangeX(P) { return [P.xinv(P.L), P.xinv(P.R)]; }
  function rangeY(P) { return [P.yinv(P.B), P.yinv(P.T)]; }

  /* ---------------- ① 参数滑块：二阶系统阶跃响应 ---------------- */
  Ctl.Pack.register('step-2nd', function (el) {
    var wrap = scaffold(el), f = figBox(wrap, 'ctl-h-md');
    var ctl = controls(el), ro = readout(el);
    var st = { zeta: 0.3, wn: 2 };
    var pts = [], m = { peak: 0, tp: 0, overshoot: 0, ts: 0 };
    var fig = Fig.create(f.canvas, {
      xlim: [0, 10], ylim: [0, 1.6], xlabel: 't (s)', ylabel: 'y(t)',
      draw: function (P) {
        var r = rangeX(P);
        P.line([[r[0], 1], [r[1], 1]], P.C.muted, 1, [4, 4]);
        P.line(pts, P.C.accent, 1.8);
        if (m.peak > 1.001) P.dot(m.tp, m.peak, P.C.accent2, 3);
      }
    });
    function recompute() {
      var z = st.zeta, wn = st.wn;
      var re = -z * wn, im = wn * Math.sqrt(Math.max(0, 1 - z * z));
      var tmax = Math.min(30, Math.max(2, 5 / Math.max(1e-3, Math.abs(re))));
      pts = stepFromTF(polyFromRoots([[re, im], [re, -im]]), [wn * wn], tmax, tmax / 1200);
      m = stepMetrics(pts, 1);
      fig.spec.xlim = [0, tmax];
      fig.spec.ylim = [0, Math.max(1.3, m.peak * 1.15)];
      var thr = z > 0 && z < 1 ? Math.exp(-Math.PI * z / Math.sqrt(1 - z * z)) * 100 : 0;
      var thTs = z > 0 ? 4.6 / (z * wn) : NaN;
      setReadout(ro, [
        ['ζ', z.toFixed(2)], ['ωn', wn.toFixed(2) + ' rad/s'],
        ['超调量（仿真）', m.overshoot.toFixed(1) + '%'], ['超调量（理论）', thr.toFixed(1) + '%'],
        ['调节时间 ±1%（仿真）', m.ts.toFixed(2) + ' s'],
        ['调节时间（理论 4.6/ζωn）', isFinite(thTs) ? thTs.toFixed(2) + ' s' : '—']
      ]);
      Fig.renderAll();
    }
    slider(ctl, 'ζ', 0, 1.5, 0.01, st.zeta, function (v) { return v.toFixed(2); }, function (v) { st.zeta = v; recompute(); });
    slider(ctl, 'ωn', 0.5, 5, 0.1, st.wn, function (v) { return v.toFixed(1); }, function (v) { st.wn = v; recompute(); });
    toolbar(el, fig, 'step-2nd');
    recompute();
  });

  /* ---------------- ② 游标联动：Bode 幅频/相频 ---------------- */
  Ctl.Pack.register('bode-cursor', function (el) {
    var wrap = scaffold(el), fm = figBox(wrap, 'ctl-h-md', true), fp = figBox(wrap, 'ctl-h-md', true);
    var ctl = controls(el), ro = readout(el);
    var K = 30, zeros = [], poles = [[0, 0], [-1, 0], [-10, 0]];
    var WMIN = 0.1, WMAX = 100, N = 480;
    var samples = [], wcur = 1.6;
    (function build() {
      var prev = null;
      for (var i = 0; i <= N; i++) {
        var w = WMIN * Math.pow(WMAX / WMIN, i / N);
        var g = tfEval(K, zeros, poles, [0, w]);
        var ph = Math.atan2(g[1], g[0]) * 180 / Math.PI;
        if (prev !== null) { while (ph - prev > 180) ph -= 360; while (prev - ph > 180) ph += 360; }
        prev = ph;
        samples.push([w, 20 * Math.log10(Math.max(cabs(g), 1e-12)), ph]);
      }
    })();
    function crossing(which) {
      for (var i = 1; i < samples.length; i++) {
        var a = which === 'mag' ? samples[i - 1][1] : samples[i - 1][2] + 180;
        var b = which === 'mag' ? samples[i][1] : samples[i][2] + 180;
        if ((a <= 0 && b >= 0) || (a >= 0 && b <= 0)) {
          var t = a / (a - b || 1);
          return samples[i - 1][0] * Math.pow(samples[i][0] / samples[i - 1][0], t);
        }
      }
      return null;
    }
    function at(w) {
      var i = 1;
      while (i < samples.length - 1 && samples[i][0] < w) i++;
      var a = samples[i - 1], b = samples[i];
      var t = (Math.log(w) - Math.log(a[0])) / ((Math.log(b[0]) - Math.log(a[0])) || 1);
      return { db: a[1] + (b[1] - a[1]) * t, ph: a[2] + (b[2] - a[2]) * t };
    }
    function update() {
      var v = at(wcur);
      var wgc = crossing('mag'), w180 = crossing('ph');
      var pairs = [
        ['ω', wcur.toFixed(3) + ' rad/s'],
        ['|G|', v.db.toFixed(2) + ' dB'],
        ['|G| 绝对值', Math.pow(10, v.db / 20).toFixed(4)],
        ['∠G', v.ph.toFixed(1) + '\u00b0']
      ];
      if (wgc) pairs.push(['剪切频率 ωc（|G|=1）', wgc.toFixed(3) + ' rad/s'], ['相位裕度', (180 + at(wgc).ph).toFixed(1) + '\u00b0']);
      if (w180) pairs.push(['相位交界频率 ω180', w180.toFixed(3) + ' rad/s'], ['增益裕度', (-at(w180).db).toFixed(1) + ' dB']);
      setReadout(ro, pairs);
      Fig.renderAll();
    }
    function cursor(P, ylo, yhi) {
      P.line([[wcur, ylo], [wcur, yhi]], P.C.accent2, 1.2, [4, 3]);
    }
    var figM = Fig.create(fm.canvas, {
      xlim: [WMIN, WMAX], xlog: true, ylim: [-80, 40], xlabel: 'ω (rad/s)', ylabel: '|G| (dB)',
      draw: function (P) {
        var r = rangeY(P);
        cursor(P, r[0], r[1]);
        P.line(samples.map(function (s) { return [s[0], s[1]]; }), P.C.accent, 1.8);
        P.dot(wcur, at(wcur).db, P.C.accent2, 3.5);
      }
    });
    var figP = Fig.create(fp.canvas, {
      xlim: [WMIN, WMAX], xlog: true, ylim: [-270, -60], xlabel: 'ω (rad/s)', ylabel: '∠G (deg)',
      draw: function (P) {
        var r = rangeY(P);
        cursor(P, r[0], r[1]);
        P.line([[WMIN, -180], [WMAX, -180]], P.C.muted, 1, [5, 4]);
        P.line(samples.map(function (s) { return [s[0], s[2]]; }), P.C.accent, 1.8);
        P.dot(wcur, at(wcur).ph, P.C.accent2, 3.5);
      }
    });
    var sl = slider(ctl, 'ω（对数）', Math.log10(WMIN), Math.log10(WMAX), 0.001, Math.log10(wcur),
      function (v) { return Math.pow(10, v).toFixed(3); },
      function (v) { wcur = Math.pow(10, v); update(); });
    function drag(e) {
      var P = figM.P;
      if (!P) return;
      wcur = Math.min(WMAX, Math.max(WMIN, dataX(P, e.offsetX)));
      sl.set(Math.log10(wcur));
      update();
    }
    attachPointer(fm.canvas, drag, drag);
    attachPointer(fp.canvas, drag, drag);
    toolbar(el, figM, 'bode-magnitude');
    update();
  });

  /* ---------------- ③ 零极点拖拽：s 平面 ↔ 阶跃响应 ---------------- */
  Ctl.Pack.register('polezero-drag', function (el) {
    var wrap = scaffold(el);
    var fz = figBox(wrap, 'ctl-h-sm', true), fs = figBox(wrap, 'ctl-h-sm');
    var ctl = controls(el), ro = readout(el);
    var st = { z: -3, pr: -0.6, pi: 0.9 };
    var SX = [-6, 2], SY = [-4, 4];
    var pts = [], m = { overshoot: 0, ts: 0, peak: 0, tp: 0 };
    var figZ = Fig.create(fz.canvas, {
      xlim: SX, ylim: SY, equal: true, xlabel: 'Re', ylabel: 'Im',
      draw: function (P) {
        var rx = rangeX(P), ry = rangeY(P);
        P.line([[0, ry[0]], [0, ry[1]]], P.C.line, 1);
        P.line([[rx[0], 0], [rx[1], 0]], P.C.line, 1);
        P.dot(st.z, 0, P.C.accent2, 4.5);
        P.dot(st.pr, st.pi, P.C.accent, 4.5);
        P.dot(st.pr, -st.pi, P.C.accent, 4.5);
      }
    });
    var figS = Fig.create(fs.canvas, {
      xlim: [0, 10], ylim: [0, 1.6], xlabel: 't (s)', ylabel: 'y(t)',
      draw: function (P) {
        var r = rangeX(P);
        P.line([[r[0], 1], [r[1], 1]], P.C.muted, 1, [4, 4]);
        P.line(pts, P.C.accent, 1.8);
      }
    });
    function recompute() {
      var pr = st.pr, pi = st.pi;
      var wn2 = pr * pr + pi * pi;
      var gain = wn2 / (-st.z);
      var den = polyFromRoots([[pr, pi], [pr, -pi]]);
      var num = polyFromRoots([[st.z, 0]], gain);
      var tmax = Math.abs(pr) > 1e-3 ? Math.min(30, Math.max(3, 5 / Math.abs(pr))) : 24;
      pts = stepFromTF(den, num, tmax, tmax / 1200);
      m = stepMetrics(pts, 1);
      figS.spec.xlim = [0, tmax];
      figS.spec.ylim = [0, Math.max(1.3, m.peak * 1.15)];
      var wnn = Math.sqrt(wn2), zz = wnn > 0 ? -pr / wnn : 0;
      setReadout(ro, [
        ['极点', pr.toFixed(2) + (pi >= 0.005 ? ' ± j' + pi.toFixed(2) : '')],
        ['零点', st.z.toFixed(2)],
        ['ωn', wnn.toFixed(3) + ' rad/s'], ['ζ', zz.toFixed(3)],
        ['超调量', m.overshoot.toFixed(1) + '%'], ['调节时间 ±1%', m.ts.toFixed(2) + ' s']
      ]);
      Fig.renderAll();
    }
    var dragging = null;
    function hit(e) {
      var P = figZ.P;
      if (!P) return null;
      var cands = [{ id: 'z', x: st.z, y: 0 }, { id: 'p', x: st.pr, y: st.pi }];
      var best = null, bd = 16;
      for (var i = 0; i < cands.length; i++) {
        var dx = P.x(cands[i].x) - e.offsetX, dy = P.y(cands[i].y) - e.offsetY;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d < bd) { bd = d; best = cands[i].id; }
      }
      return best;
    }
    attachPointer(fz.canvas, function (e) { dragging = hit(e); if (dragging) move(e); }, function (e) { if (dragging) move(e); });
    function move(e) {
      var P = figZ.P;
      if (!P) return;
      var x = dataX(P, e.offsetX), y = dataY(P, e.offsetY);
      if (dragging === 'z') st.z = Math.min(-0.2, Math.max(-5.5, x));
      else {
        st.pr = Math.min(0.4, Math.max(-5.5, x));
        st.pi = Math.min(3.5, Math.max(0, y));
      }
      recompute();
    }
    slider(ctl, '零点实部', -5.5, -0.2, 0.05, st.z, function (v) { return v.toFixed(2); }, function (v) { st.z = v; recompute(); });
    toolbar(el, figZ, 'pole-zero');
    recompute();
  });

  /* ---------------- ④ 情形切换：四种阻尼对比 ---------------- */
  Ctl.Pack.register('step-presets', function (el) {
    var wrap = scaffold(el), f = figBox(wrap, 'ctl-h-md');
    var ctl = controls(el), ro = readout(el);
    var cases = [
      { label: '欠阻尼 ζ=0.2', zeta: 0.2 },
      { label: '临界阻尼 ζ=1', zeta: 1 },
      { label: '过阻尼 ζ=2', zeta: 2 },
      { label: '无阻尼 ζ=0', zeta: 0 }
    ];
    var WN = 2, TMAX = 12, cur = 0;
    var data = cases.map(function (c) {
      var re = -c.zeta * WN, im = WN * Math.sqrt(Math.max(0, 1 - c.zeta * c.zeta));
      var ys = stepFromTF(polyFromRoots([[re, im], [re, -im]]), [WN * WN], TMAX, TMAX / 900);
      return { pts: ys, m: stepMetrics(ys, 1) };
    });
    var fig = Fig.create(f.canvas, {
      xlim: [0, TMAX], ylim: [0, 2.1], xlabel: 't (s)', ylabel: 'y(t)',
      draw: function (P) {
        var r = rangeX(P);
        P.line([[r[0], 1], [r[1], 1]], P.C.muted, 1, [4, 4]);
        for (var i = 0; i < data.length; i++) P.line(data[i].pts, i === cur ? P.C.accent : P.C.line, i === cur ? 2 : 1.2);
      }
    });
    function show(k) {
      cur = k;
      var c = cases[k], m = data[k].m;
      var z = c.zeta;
      var thr = z > 0 && z < 1 ? Math.exp(-Math.PI * z / Math.sqrt(1 - z * z)) * 100 : 0;
      setReadout(ro, [
        ['当前情形', c.label], ['ωn', WN.toFixed(2) + ' rad/s'],
        ['超调量（仿真）', m.overshoot.toFixed(1) + '%'], ['超调量（理论）', thr.toFixed(1) + '%'],
        ['调节时间 ±1%', m.ts.toFixed(2) + ' s']
      ]);
      Fig.renderAll();
    }
    segmented(ctl, cases, function (it, k) { show(k); });
    toolbar(el, fig, 'step-presets');
    show(0);
  });

  /* ---------------- ⑤ 根轨迹：K 滑块 ---------------- */
  Ctl.Pack.register('root-locus', function (el) {
    var wrap = scaffold(el), f = figBox(wrap, 'ctl-h-md');
    var ctl = controls(el), ro = readout(el);
    var KMAX = 20, SAMPLES = 400;
    var locus = [];
    for (var i = 0; i <= SAMPLES; i++) {
      var k = KMAX * i / SAMPLES;
      locus.push({ K: k, roots: rootsOf([1, 3, 2, k]) });
    }
    var cur = 0.5;
    var fig = Fig.create(f.canvas, {
      xlim: [-5, 1], ylim: [-3, 3], equal: true, xlabel: 'Re', ylabel: 'Im',
      draw: function (P) {
        var rx = rangeX(P), ry = rangeY(P);
        P.line([[0, ry[0]], [0, ry[1]]], P.C.line, 1);
        P.line([[rx[0], 0], [rx[1], 0]], P.C.line, 1);
        var i, j;
        for (i = 0; i < locus.length; i++) {
          for (j = 0; j < locus[i].roots.length; j++) P.dot(locus[i].roots[j][0], locus[i].roots[j][1], P.C.grid, 1.1);
        }
        P.dot(0, 0, P.C.accent2, 4.5); P.dot(-1, 0, P.C.accent2, 4.5); P.dot(-2, 0, P.C.accent2, 4.5);
        var r = rootsOf([1, 3, 2, cur]);
        for (j = 0; j < r.length; j++) P.dot(r[j][0], r[j][1], P.C.accent, 4.5);
      }
    });
    function criticalK() {
      for (var i = 1; i < locus.length; i++) {
        var a = Math.max.apply(null, locus[i - 1].roots.map(function (z) { return z[0]; }));
        var b = Math.max.apply(null, locus[i].roots.map(function (z) { return z[0]; }));
        if (a <= 0 && b > 0) {
          var t = a / (a - b || 1);
          return locus[i - 1].K + (locus[i].K - locus[i - 1].K) * t;
        }
      }
      return null;
    }
    var kc = criticalK();
    function update() {
      var r = rootsOf([1, 3, 2, cur]);
      var stable = r.every(function (z) { return z[0] < -1e-9; });
      var margin = r.some(function (z) { return Math.abs(z[0]) < 1e-6; });
      setReadout(ro, [
        ['K', cur.toFixed(2)],
        ['闭环极点', r.map(function (z) { return z[0].toFixed(2) + (Math.abs(z[1]) > 1e-3 ? (z[1] > 0 ? '+' : '') + 'j' + z[1].toFixed(2) : ''); }).join(', ')],
        ['稳定性', stable ? '稳定' : (margin ? '临界' : '不稳定')],
        ['临界 K', kc !== null ? kc.toFixed(2) : '超出扫描范围']
      ]);
      Fig.renderAll();
    }
    slider(ctl, 'K', 0, KMAX, 0.05, cur, function (v) { return v.toFixed(2); }, function (v) { cur = v; update(); });
    toolbar(el, fig, 'root-locus');
    update();
  });

  /* ---------------- ⑦ Mason 逐步展开 ----------------
     纯 SVG，不用 canvas。例子：P₁=abce、P₂=k，两条回路 f、g 互不接触。
     Mason 结果 G=(P₁Δ₁+P₂Δ₂)/Δ 已与代数解对拍：都等于 65。 */
  Ctl.Pack.register('mason-flow', function (el) {
    el.classList.add('ctl-widget');
    var ttl = el.getAttribute('data-title');
    if (ttl) { var tp = mk('p', 'ctl-widget-title'); tp.textContent = ttl; el.appendChild(tp); }

    var P1 = 16, P2 = 1, L1 = 0.5, L2 = 0.5, L1L2 = 0.25;
    var D = 1 - (L1 + L2) + L1L2;
    var GT = (P1 * 1 + P2 * D) / D;

    var box = mk('div', 'ctl-mason');
    box.innerHTML =
      '<svg viewBox="0 0 600 280" role="img" aria-label="信号流图">' +
      '<defs><marker id="mason-ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">' +
      '<path d="M0,0 L10,5 L0,10 z" style="fill:var(--ctl-muted)"/></marker></defs>' +
      '<path class="br" data-b="k" d="M48,186 C48,258 540,258 540,186" marker-end="url(#mason-ar)"/>' +
      '<text class="gl" x="294" y="268">k = 1</text>' +
      '<line class="br" data-b="a" x1="64" y1="170" x2="150" y2="170" marker-end="url(#mason-ar)"/>' +
      '<text class="gl" x="107" y="160">a = 2</text>' +
      '<line class="br" data-b="b" x1="184" y1="170" x2="270" y2="170" marker-end="url(#mason-ar)"/>' +
      '<text class="gl" x="227" y="160">b = 2</text>' +
      '<line class="br" data-b="c" x1="304" y1="170" x2="390" y2="170" marker-end="url(#mason-ar)"/>' +
      '<text class="gl" x="347" y="160">c = 2</text>' +
      '<line class="br" data-b="e" x1="424" y1="170" x2="522" y2="170" marker-end="url(#mason-ar)"/>' +
      '<text class="gl" x="473" y="160">e = 2</text>' +
      '<path class="br" data-b="f" d="M158,157 C138,112 198,112 178,157" marker-end="url(#mason-ar)"/>' +
      '<text class="gl" x="168" y="104">f = 0.5</text>' +
      '<path class="br" data-b="g" d="M398,157 C378,112 438,112 418,157" marker-end="url(#mason-ar)"/>' +
      '<text class="gl" x="408" y="104">g = 0.5</text>' +
      '<circle class="nd" data-n="1" cx="48" cy="170" r="16"/><text class="nl" x="48" y="175">1</text>' +
      '<circle class="nd" data-n="2" cx="168" cy="170" r="16"/><text class="nl" x="168" y="175">2</text>' +
      '<circle class="nd" data-n="3" cx="288" cy="170" r="16"/><text class="nl" x="288" y="175">3</text>' +
      '<circle class="nd" data-n="4" cx="408" cy="170" r="16"/><text class="nl" x="408" y="175">4</text>' +
      '<circle class="nd" data-n="5" cx="540" cy="170" r="16"/><text class="nl" x="540" y="175">5</text>' +
      '</svg>';
    el.appendChild(box);
    var note = mk('div', 'ctl-mason-note');
    el.appendChild(note);
    var ctl = controls(el);
    var ro = readout(el);

    var STEPS = [
      { t: '整张信号流图。先别急着算，按顺序数：<b>前向通道</b> → <b>回路</b> → <b>互不接触的回路对</b>。', hot: [], hotN: [] },
      { t: '<b>第 1 条前向通道</b>：1→2→3→4→5。$P_1=abce=2\\times2\\times2\\times2=16$。', hot: ['a', 'b', 'c', 'e'], hotN: ['1', '2', '3', '4', '5'] },
      { t: '<b>第 2 条前向通道</b>：1→5 直通，增益 $P_2=k=1$。走下面那条弧线。', hot: ['k'], hotN: ['1', '5'] },
      { t: '<b>回路 L₁</b>：节点 2 上的自环，$L_1=f=0.5$。回路增益 = 环上所有支路增益之积。', hot: ['f'], hotN: ['2'] },
      { t: '<b>回路 L₂</b>：节点 4 上的自环，$L_2=g=0.5$。', hot: ['g'], hotN: ['4'] },
      { t: '<b>互不接触的回路对</b>：L₁ 只碰节点 2、L₂ 只碰节点 4，<b>没有公共节点</b> → 互不接触，产生乘积项 $L_1L_2=0.25$。', hot: ['f', 'g'], hotN: ['2', '4'] },
      { t: '拼出 $\\Delta$ 与 $\\Delta_k$，代入 $G=\\dfrac{P_1\\Delta_1+P_2\\Delta_2}{\\Delta}$。$P_1$ 与两条回路都接触 → $\\Delta_1=1$；$P_2$ 谁都不碰 → $\\Delta_2=\\Delta$。', hot: [], hotN: [] }
    ];
    var cur = 0;

    function typeset(node) {
      if (!global.renderMathInElement) return;
      try {
        global.renderMathInElement(node, {
          delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }],
          throwOnError: false,
          ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'option']
        });
      } catch (e) { /* 失败不阻断 */ }
    }
    function val(x, need) { return cur >= need ? x : '？'; }
    var prevB = mk('button', 'ctl-btn'); prevB.type = 'button'; prevB.textContent = '← 上一步';
    var nextB = mk('button', 'ctl-btn'); nextB.type = 'button'; nextB.textContent = '下一步 →';
    function paint() {
      var s = STEPS[cur];
      var brs = box.querySelectorAll('[data-b]'), nds = box.querySelectorAll('[data-n]'), i, id;
      for (i = 0; i < brs.length; i++) {
        id = brs[i].getAttribute('data-b');
        brs[i].classList.toggle('is-hot', s.hot.indexOf(id) >= 0);
        brs[i].classList.toggle('is-dim', s.hot.length > 0 && s.hot.indexOf(id) < 0);
      }
      for (i = 0; i < nds.length; i++) {
        id = nds[i].getAttribute('data-n');
        nds[i].classList.toggle('is-hot', s.hotN.indexOf(id) >= 0);
      }
      note.innerHTML = '<b>第 ' + (cur + 1) + ' / ' + STEPS.length + ' 步</b>　' + s.t;
      typeset(note);
      setReadout(ro, [
        ['P₁', val('abce = 2×2×2×2 = 16', 1)],
        ['P₂', val('k = 1', 2)],
        ['L₁', val('f = 0.5', 3)],
        ['L₂', val('g = 0.5', 4)],
        ['L₁L₂（互不接触）', val('0.5 × 0.5 = 0.25', 5)],
        ['Δ', val('1 − (0.5+0.5) + 0.25 = 0.25', 5)],
        ['Δ₁ / Δ₂', val('1 / 0.25（P₁ 碰两条回路，P₂ 谁都不碰）', 6)],
        ['G', val('(16×1 + 1×0.25) / 0.25 = 65', 6)]
      ]);
      prevB.disabled = cur === 0;
      nextB.disabled = cur === STEPS.length - 1;
    }
    prevB.addEventListener('click', function () { if (cur > 0) { cur--; paint(); } });
    nextB.addEventListener('click', function () { if (cur < STEPS.length - 1) { cur++; paint(); } });
    ctl.appendChild(prevB); ctl.appendChild(nextB);
    paint();
  });

  /* ---------------- ⑧ 积分器链：阶数 = 积分器个数，几何表示 ----------------
     一排 1/s 方块，零交叉线。滑块改 n，链条长度跟着变。纯 SVG。 */
  Ctl.Pack.register('integrator-chain', function (el) {
    el.classList.add('ctl-widget');
    var ttl = el.getAttribute('data-title');
    if (ttl) { var tp = mk('p', 'ctl-widget-title'); tp.textContent = ttl; el.appendChild(tp); }
    var st = { n: 3 };
    var box = mk('div', 'ctl-ichain');
    el.appendChild(box);
    var ctl = controls(el);
    var ro = readout(el);

    function draw() {
      var n = st.n, W = 620, H = 132, y = 62, bh = 44;
      var x0 = 34, x1 = W - 26, unit = (x1 - x0) / n;
      var bw = Math.min(72, unit * 0.5);
      var p = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="n 级积分器链">' +
        '<defs><marker id="ic-ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">' +
        '<path d="M0,0 L10,5 L0,10 z" style="fill:var(--ctl-muted)"/></marker></defs>';
      p += '<line x1="6" y1="' + y + '" x2="' + (x0 + (unit - bw) / 2 - 8) + '" y2="' + y + '" marker-end="url(#ic-ar)" style="stroke:var(--ctl-ink);stroke-width:1.6;fill:none"/>';
      p += '<text class="il" x="14" y="' + (y - 12) + '">u</text>';
      for (var i = 0; i < n; i++) {
        var bx = x0 + i * unit + (unit - bw) / 2;
        p += '<rect class="ibox" x="' + bx + '" y="' + (y - bh / 2) + '" width="' + bw + '" height="' + bh + '" rx="6"/>';
        p += '<text class="ibl" x="' + (bx + bw / 2) + '" y="' + (y + 5) + '">1/s</text>';
        if (i > 0) {
          var prevEnd = x0 + (i - 1) * unit + (unit - bw) / 2 + bw + 20;
          p += '<line x1="' + prevEnd + '" y1="' + y + '" x2="' + (bx - 6) + '" y2="' + y + '" marker-end="url(#ic-ar)" style="stroke:var(--ctl-ink);stroke-width:1.6;fill:none"/>';
        }
        var nx = bx + bw + 12;
        p += '<circle class="ind" cx="' + nx + '" cy="' + y + '" r="4"/>';
        p += '<text class="il" x="' + nx + '" y="' + (y + 26) + '">x' + (n - i) + '</text>';
      }
      var lastX = x0 + (n - 1) * unit + (unit - bw) / 2 + bw + 12;
      p += '<line x1="' + (lastX + 8) + '" y1="' + y + '" x2="' + (W - 8) + '" y2="' + y + '" marker-end="url(#ic-ar)" style="stroke:var(--ctl-ink);stroke-width:1.6;fill:none"/>';
      p += '<text class="il" x="' + (W - 12) + '" y="' + (y - 12) + '">y</text>';
      p += '</svg>';
      box.innerHTML = p;
    }
    function refresh() {
      draw();
      var n = st.n, terms = [];
      for (var k = n; k >= 0; k--) {
        if (k === n) terms.push('s^' + n);
        else if (k === 1) terms.push('a₁s');
        else if (k === 0) terms.push('a₀');
        else terms.push('a' + k + 's^' + k);
      }
      setReadout(ro, [
        ['积分器个数', n],
        ['状态变量个数', n],
        ['分母最高次', 's^' + n],
        ['特征多项式', terms.join(' + ')],
        ['结论', '这四个数是同一个东西']
      ]);
    }
    slider(ctl, '阶数 n', 1, 5, 1, st.n, function (v) { return String(v); }, function (v) { st.n = v; refresh(); });
    refresh();
  });

  /* ---------------- ⑨ 两种标准型的框图对照 ----------------
     几何原语：控制标准型 / 观测标准型 两张无交叉框图，按钮切换对比。
     data-default="obs" 可让某处默认显示观测型。 */
  Ctl.Pack.register('canonical-pair', function (el) {
    el.classList.add('ctl-widget');
    var ttl = el.getAttribute('data-title');
    if (ttl) { var tp = mk('p', 'ctl-widget-title'); tp.textContent = ttl; el.appendChild(tp); }

    var uid = 'cp' + (Ctl.Pack._uid = (Ctl.Pack._uid || 0) + 1);
    var CTRL = '<svg viewBox="0 0 620 280" role="img" aria-label="控制标准型框图">' +
      '<defs><marker id="__ID__c" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">' +
      '<path d="M0,0 L10,5 L0,10 z" style="fill:var(--ctl-muted)"/></marker></defs>' +
      '<g style="stroke:var(--ctl-ink);stroke-width:1.6;fill:none">' +
      '<line x1="8" y1="90" x2="48" y2="90" marker-end="url(#__ID__c)"/>' +
      '<circle cx="66" cy="90" r="16"/>' +
      '<line x1="82" y1="90" x2="110" y2="90" marker-end="url(#__ID__c)"/>' +
      '<line x1="188" y1="90" x2="226" y2="90" marker-end="url(#__ID__c)"/>' +
      '<circle cx="244" cy="90" r="16"/>' +
      '<line x1="260" y1="90" x2="298" y2="90" marker-end="url(#__ID__c)"/>' +
      '<line x1="376" y1="90" x2="414" y2="90" marker-end="url(#__ID__c)"/>' +
      '<circle cx="432" cy="90" r="16"/>' +
      '<line x1="448" y1="90" x2="490" y2="90" marker-end="url(#__ID__c)"/>' +
      '<circle cx="508" cy="90" r="16"/>' +
      '<line x1="524" y1="90" x2="566" y2="90" marker-end="url(#__ID__c)"/>' +
      '<line x1="244" y1="106" x2="244" y2="212"/>' +
      '<line x1="432" y1="106" x2="432" y2="212"/>' +
      '<line x1="432" y1="212" x2="66" y2="212"/>' +
      '<line x1="66" y1="212" x2="66" y2="108" marker-end="url(#__ID__c)"/>' +
      '<line x1="244" y1="74" x2="244" y2="34"/>' +
      '<line x1="432" y1="74" x2="432" y2="34"/>' +
      '<line x1="244" y1="34" x2="508" y2="34"/>' +
      '<line x1="508" y1="34" x2="508" y2="72" marker-end="url(#__ID__c)"/>' +
      '</g>' +
      '<g style="stroke:var(--ctl-line);fill:var(--ctl-panel)">' +
      '<rect x="112" y="68" width="76" height="44" rx="6"/><rect x="300" y="68" width="76" height="44" rx="6"/></g>' +
      '<g style="fill:var(--ctl-ink);font-size:13px;font-family:inherit;text-anchor:middle">' +
      '<text x="150" y="95">1/s</text><text x="338" y="95">1/s</text>' +
      '<text x="244" y="96">x₁</text><text x="432" y="96">x₂</text>' +
      '<text x="66" y="76">+</text><text x="66" y="120">−</text>' +
      '<text x="508" y="76">+</text><text x="508" y="120">+</text>' +
      '<text x="20" y="76">u</text><text x="578" y="96">y</text>' +
      '<text x="256" y="186">a₁</text><text x="444" y="186">a₀</text>' +
      '<text x="256" y="56">b₁</text><text x="444" y="56">b₀</text></g></svg>';

    var OBS = '<svg viewBox="0 0 620 330" role="img" aria-label="观测标准型框图">' +
      '<defs><marker id="__ID__o" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">' +
      '<path d="M0,0 L10,5 L0,10 z" style="fill:var(--ctl-muted)"/></marker></defs>' +
      '<g style="stroke:var(--ctl-ink);stroke-width:1.6;fill:none">' +
      '<line x1="8" y1="160" x2="36" y2="160"/>' +
      '<line x1="40" y1="80" x2="40" y2="240"/>' +
      '<line x1="40" y1="80" x2="82" y2="80" marker-end="url(#__ID__o)"/>' +
      '<line x1="40" y1="240" x2="82" y2="240" marker-end="url(#__ID__o)"/>' +
      '<circle cx="100" cy="80" r="16"/><circle cx="100" cy="240" r="16"/>' +
      '<line x1="116" y1="80" x2="134" y2="80" marker-end="url(#__ID__o)"/>' +
      '<line x1="212" y1="80" x2="227" y2="80" marker-end="url(#__ID__o)"/>' +
      '<circle cx="244" cy="80" r="15"/>' +
      '<line x1="259" y1="80" x2="320" y2="80" marker-end="url(#__ID__o)"/>' +
      '<line x1="116" y1="240" x2="134" y2="240" marker-end="url(#__ID__o)"/>' +
      '<line x1="212" y1="240" x2="227" y2="240" marker-end="url(#__ID__o)"/>' +
      '<circle cx="244" cy="240" r="15"/>' +
      '<line x1="244" y1="225" x2="244" y2="150"/><line x1="244" y1="150" x2="100" y2="150"/>' +
      '<line x1="100" y1="150" x2="100" y2="96" marker-end="url(#__ID__o)"/>' +
      '<line x1="244" y1="95" x2="244" y2="120"/><line x1="244" y1="120" x2="300" y2="120"/>' +
      '<line x1="300" y1="120" x2="300" y2="290"/><line x1="300" y1="290" x2="100" y2="290"/>' +
      '<line x1="100" y1="290" x2="100" y2="256" marker-end="url(#__ID__o)"/>' +
      '<line x1="244" y1="65" x2="244" y2="20"/><line x1="244" y1="20" x2="100" y2="20"/>' +
      '<line x1="100" y1="20" x2="100" y2="64" marker-end="url(#__ID__o)"/>' +
      '</g>' +
      '<g style="stroke:var(--ctl-line);fill:var(--ctl-panel)">' +
      '<rect x="136" y="58" width="76" height="44" rx="6"/><rect x="136" y="218" width="76" height="44" rx="6"/></g>' +
      '<g style="fill:var(--ctl-ink);font-size:13px;font-family:inherit;text-anchor:middle">' +
      '<text x="174" y="85">1/s</text><text x="174" y="245">1/s</text>' +
      '<text x="244" y="85">x₁</text><text x="244" y="245">x₂</text>' +
      '<text x="84" y="68">+</text><text x="84" y="110">+</text><text x="86" y="48">−</text>' +
      '<text x="84" y="228">+</text><text x="86" y="272">−</text>' +
      '<text x="20" y="148">u</text><text x="330" y="96">y</text>' +
      '<text x="58" y="68">b₁</text><text x="58" y="260">b₀</text>' +
      '<text x="172" y="142">1</text><text x="172" y="12">a₁</text><text x="312" y="182">a₀</text></g></svg>';

    var box = mk('div', 'ctl-cpair');
    box.innerHTML =
      '<div class="cpane" data-form="ctrl">' + CTRL.split('__ID__').join(uid) + '</div>' +
      '<div class="cpane" data-form="obs" hidden>' + OBS.split('__ID__').join(uid) + '</div>';
    el.appendChild(box);
    var ctl = controls(el);
    var ro = readout(el);

    var which = el.getAttribute('data-default') === 'obs' ? 'obs' : 'ctrl';
    function render() {
      var panes = box.querySelectorAll('.cpane');
      for (var k = 0; k < panes.length; k++) panes[k].hidden = panes[k].getAttribute('data-form') !== which;
      if (which === 'ctrl') {
        setReadout(ro, [
          ['闭环 $a_i$ 的位置', '各状态 → 送回输入端求和点'],
          ['$b_i$ 的位置', '各状态 → 汇到输出求和点'],
          ['$y$', '各状态加权之和'],
          ['$A$', '[−a₁, −a₀; 1, 0]'], ['$B$', '[1; 0]'], ['$C$', '[b₁, b₀]']
        ]);
      } else {
        setReadout(ro, [
          ['闭环 $a_i$ 的位置', '作用在状态之间（不回到输入端）'],
          ['$b_i$ 的位置', '输入 → 灌进各个状态'],
          ['$y$', '直接取 $x_1$'],
          ['$A$', '[−a₁, 1; −a₀, 0]'], ['$B$', '[b₁; b₀]'], ['$C$', '[1, 0]']
        ]);
      }
      if (global.renderMathInElement) {
        try { global.renderMathInElement(ro, { delimiters: [{ left: '$', right: '$', display: false }], throwOnError: false }); } catch (e) {}
      }
    }
    segmented(ctl, [{ label: '控制标准型' }, { label: '观测标准型' }], function (it, k) {
      which = k === 0 ? 'ctrl' : 'obs'; render();
    });
    if (which === 'obs') {
      var btns = ctl.querySelectorAll('.ctl-seg button');
      if (btns.length === 2) { btns[0].setAttribute('aria-pressed', 'false'); btns[1].setAttribute('aria-pressed', 'true'); }
    }
    render();
  });

  /* ---------------- ⑩ 时域指标的图像理解：曲线上把指标标出来 ----------------
     canvas（仿真曲线）。一阶默认，可切二阶。对应 Franklin Fig 3.20 的活版。 */
  Ctl.Pack.register('step-metrics', function (el) {
    el.classList.add('ctl-widget');
    var ttl = el.getAttribute('data-title');
    if (ttl) { var tp0 = mk('p', 'ctl-widget-title'); tp0.textContent = ttl; el.appendChild(tp0); }
    var wrap = scaffold(el), f = figBox(wrap, 'ctl-h-md');
    var ctl = controls(el), ro = readout(el);

    var st = { mode: 'first', tau: 1, zeta: 0.3, wn: 2 };
    var pts = [], info = {}, tmax = 6;

    function firstCross(ys, level) {
      for (var i = 0; i < ys.length; i++) if (ys[i][1] >= level) {
        if (i === 0) return ys[0][0];
        var a = ys[i - 1], b2 = ys[i];
        var t = (level - a[1]) / ((b2[1] - a[1]) || 1);
        return a[0] + (b2[0] - a[0]) * t;
      }
      return NaN;
    }
    function build() {
      var den, num;
      if (st.mode === 'first') {
        den = [st.tau, 1]; num = [1];
        info = { tau: st.tau };
      } else {
        var z = st.zeta, wn = st.wn;
        var re = -z * wn, im = wn * Math.sqrt(Math.max(0, 1 - z * z));
        den = polyFromRoots([[re, im], [re, -im]]); num = [wn * wn];
        info = { zeta: z, wn: wn, sigma: -re, wd: im };
      }
      tmax = st.mode === 'first'
        ? 6 * st.tau
        : (info.sigma > 1e-3 ? Math.min(30, Math.max(3, 6 / info.sigma)) : Math.min(20, 4 * 2 * Math.PI / (info.wd || 1)));
      pts = stepFromTF(den, num, tmax, tmax / 1200);
      var m = stepMetrics(pts, 1);
      info.m = m;
      info.t10 = firstCross(pts, 0.1);
      info.t90 = firstCross(pts, 0.9);
      info.tr = info.t90 - info.t10;
      info.ymax = Math.max(1.5, m.peak * 1.12);
      if (st.mode === 'first') {
        info.ts = 4.6 * st.tau;
        info.tauY = 1 - Math.exp(-1);
      } else {
        info.ts = info.sigma > 1e-6 ? -Math.log(0.01 * Math.sqrt(1 - st.zeta * st.zeta)) / info.sigma : NaN;
      }
      Fig.renderAll();
    }
    var fig = Fig.create(f.canvas, {
      xlim: [0, 6], ylim: [0, 1.6], xlabel: 't (s)', ylabel: 'y(t)',
      draw: function (P) {
        var C = P.C;
        // 终值线 + ±1% 带
        P.line([[P.xinv(P.L), 1], [P.xinv(P.R), 1]], C.muted, 1, [5, 4]);
        if (isFinite(info.ts) && info.ts <= tmax) {
          P.line([[info.ts, 0.99], [info.ts, 1.01]], C.accent2, 1.2);
          P.line([[0, 0.99], [tmax, 0.99]], C.accent2, 1, [3, 3]);
          P.line([[0, 1.01], [tmax, 1.01]], C.accent2, 1, [3, 3]);
          P.text('t\u209B', P.x(info.ts), P.y(0.955), C.accent2, 'center', 'middle');
          P.line([[info.ts, 0.98], [info.ts, 1.02]], C.accent2, 1);
        }
        // 上升时间（10%→90%）的尺寸线
        if (isFinite(info.tr)) {
          P.line([[info.t10, 0.1], [info.t10, info.ymax * 0.82]], C.line, 1, [2, 3]);
          P.line([[info.t90, 0.9], [info.t90, info.ymax * 0.82]], C.line, 1, [2, 3]);
          P.line([[info.t10, info.ymax * 0.82], [info.t90, info.ymax * 0.82]], C.accent, 1.2);
          P.dot(info.t10, info.ymax * 0.82, C.accent, 2.5);
          P.dot(info.t90, info.ymax * 0.82, C.accent, 2.5);
          P.text('t\u1D63 (10%→90%)', P.x((info.t10 + info.t90) / 2), P.y(info.ymax * 0.82) - 10, C.accent, 'center', 'middle');
        }
        if (st.mode === 'first') {
          // 初始斜率切线：t=0 处的切线正好在 t=τ 处到达终值
          P.line([[0, 0], [st.tau, 1]], C.accent2, 1.2, [4, 3]);
          P.dot(st.tau, info.tauY, C.accent2, 3.5);
          P.line([[st.tau, 0], [st.tau, info.tauY]], C.accent2, 1, [2, 3]);
          P.text('τ：63.2%', P.x(st.tau) + 34, P.y(info.tauY) + 4, C.accent2, 'center', 'middle');
        } else {
          // 峰值：Mp 与 tp
          var m = info.m;
          if (m.peak > 1.001) {
            P.line([[m.tp, 1], [m.tp, m.peak]], C.accent2, 1.4);
            P.dot(m.tp, m.peak, C.accent2, 3.5);
            P.text('M\u209A', P.x(m.tp) + 16, P.y((1 + m.peak) / 2), C.accent2, 'center', 'middle');
            P.line([[m.tp, 0], [m.tp, m.peak]], C.accent2, 1, [2, 3]);
            P.text('t\u209A', P.x(m.tp), P.y(info.ymax * 0.06), C.accent2, 'center', 'middle');
          }
          // 衰减包络 1 + e^{-σt}/√(1-ζ²)
          var env = [], sig = info.sigma, k = 1 / Math.sqrt(Math.max(1e-6, 1 - st.zeta * st.zeta));
          for (var i = 0; i <= 200; i++) { var t = tmax * i / 200; env.push([t, 1 + Math.exp(-sig * t) * k]); }
          P.line(env, C.accent, 1.2, [5, 4]);
          P.text('包络 1+e^{-σt}/√(1-ζ²)', P.x(tmax * 0.36), P.y(Math.min(info.ymax - 0.12, 1 + 1.2 * k * 0.45)), C.accent, 'center', 'middle');
        }
        P.line(pts, C.ink, 1.8);
      }
    });
    function seg() { return segmented(ctl, [{ label: '一阶' }, { label: '二阶' }], function (it, k) { st.mode = k === 0 ? 'first' : 'second'; syncCtl(); build(); }); }
    var slTau = slider(ctl, 'τ', 0.3, 3, 0.05, st.tau, function (v) { return v.toFixed(2); }, function (v) { st.tau = v; build(); });
    var slZ = slider(ctl, 'ζ', 0, 1.2, 0.02, st.zeta, function (v) { return v.toFixed(2); }, function (v) { st.zeta = v; build(); });
    var slW = slider(ctl, 'ωn', 0.5, 5, 0.1, st.wn, function (v) { return v.toFixed(1); }, function (v) { st.wn = v; build(); });
    function syncCtl() {
      slTau.input.parentNode.style.display = st.mode === 'first' ? '' : 'none';
      slZ.input.parentNode.style.display = st.mode === 'second' ? '' : 'none';
      slW.input.parentNode.style.display = st.mode === 'second' ? '' : 'none';
      var bs = ctl.querySelectorAll('.ctl-seg button');
      if (bs.length === 2) {
        bs[0].setAttribute('aria-pressed', st.mode === 'first' ? 'true' : 'false');
        bs[1].setAttribute('aria-pressed', st.mode === 'second' ? 'true' : 'false');
      }
      fig.spec.xlim = [0, tmax];
      fig.spec.ylim = [0, info.ymax || 1.6];
    }
    function refresh() {
      build();
      syncCtl();
      if (st.mode === 'first') {
        setReadout(ro, [
          ['τ', st.tau.toFixed(2) + ' s'],
          ['t=τ 时到', '63.2%'],
          ['初始斜率', (1 / st.tau).toFixed(2)],
          ['上升时间 10→90%', info.tr.toFixed(3) + ' s'],
          ['调节时间 ±1%', info.ts.toFixed(2) + ' s（= 4.6τ）']
        ]);
      } else {
        setReadout(ro, [
          ['ζ / ωn', st.zeta.toFixed(2) + ' / ' + st.wn.toFixed(1)],
          ['σ = ζωn', info.sigma.toFixed(3)],
          ['ωd', info.wd.toFixed(3)],
          ['Mp（仿真）', info.m.overshoot.toFixed(1) + '%'],
          ['tp', info.m.tp.toFixed(3) + ' s'],
          ['tr 10→90%', info.tr.toFixed(3) + ' s'],
          ['ts ±1%', isFinite(info.ts) ? info.ts.toFixed(2) + ' s' : '—']
        ]);
      }
      Fig.renderAll();
    }
    seg();
    toolbar(el, fig, 'step-metrics');
    build(); syncCtl(); refresh();
  });

  /* ---------------- ⑪ 时域指标的 s 域几何化：极点位置 → 指标 ----------------
     canvas。左边 s 平面标出 σ / ωd / ωn / β 四个几何量，右边阶跃响应联动。 */
  Ctl.Pack.register('splane-geometry', function (el) {
    el.classList.add('ctl-widget');
    var ttl = el.getAttribute('data-title');
    if (ttl) { var tp1 = mk('p', 'ctl-widget-title'); tp1.textContent = ttl; el.appendChild(tp1); }
    var wrap = scaffold(el);
    var fz = figBox(wrap, 'ctl-h-md', true), fs = figBox(wrap, 'ctl-h-md');
    var lg = mk('div', 'ctl-legend');
    el.appendChild(lg);
    var ctl = controls(el), ro = readout(el);

    var st = { mode: 'first', tau: 1, zeta: 0.3, wn: 2 };
    var pts = [], info = {}, SX = [-4, 1.2], SY = [-3, 3];

    function build() {
      var den, num;
      if (st.mode === 'first') {
        den = [st.tau, 1]; num = [1];
        info = { p: -1 / st.tau, sigma: 1 / st.tau };
      } else {
        var z = st.zeta, wn = st.wn;
        var re = -z * wn, im = wn * Math.sqrt(Math.max(0, 1 - z * z));
        den = polyFromRoots([[re, im], [re, -im]]); num = [wn * wn];
        info = { re: re, im: im, sigma: -re, wd: im, wn: wn, beta: Math.acos(Math.min(1, z)) };
      }
      var tmax = st.mode === 'first' ? 6 * st.tau
        : (info.sigma > 1e-3 ? Math.min(30, Math.max(3, 6 / info.sigma)) : Math.min(20, 4 * 2 * Math.PI / (info.wd || 1)));
      pts = stepFromTF(den, num, tmax, tmax / 1200);
      info.tmax = tmax;
      info.m = stepMetrics(pts, 1);
      info.t10 = firstCrossT(pts, 0.1);
      info.t90 = firstCrossT(pts, 0.9);
      info.tr = info.t90 - info.t10;
      info.ymax = Math.max(1.5, info.m.peak * 1.12);
      info.ts = st.mode === 'first'
        ? 4.6 * st.tau
        : (info.sigma > 1e-6 ? -Math.log(0.01 * Math.sqrt(1 - st.zeta * st.zeta)) / info.sigma : NaN);
      figS.spec.xlim = [0, tmax];
      figS.spec.ylim = [0, info.ymax];
      // s 平面范围随参数走，否则 ωn 一大极点就出画
      var rx = st.mode === 'first' ? Math.max(2, 1.5 / st.tau) : Math.max(2, 1.3 * st.wn);
      var ry = st.mode === 'first' ? 1.5 : Math.max(1.2, 1.15 * st.wn);
      figZ.spec.xlim = [-rx, 1];
      figZ.spec.ylim = [-ry, ry];
      Fig.renderAll();
    }
    var figZ = Fig.create(fz.canvas, {
      xlim: SX, ylim: SY, equal: true, xlabel: 'Re', ylabel: 'Im',
      draw: function (P) {
        var C = P.C;
        P.line([[0, P.yinv(P.B)], [0, P.yinv(P.T)]], C.line, 1);
        P.line([[P.xinv(P.L), 0], [P.xinv(P.R), 0]], C.line, 1);
        function dim(x1, y1, x2, y2, label, col, dx, dy) {
          P.line([[x1, y1], [x2, y2]], col, 1.4, [3, 3]);
          P.dot(x1, y1, col, 2.5); P.dot(x2, y2, col, 2.5);
          if (label) P.text(label, P.x((x1 + x2) / 2) + (dx || 0), P.y((y1 + y2) / 2) + (dy || 0), col, 'center', 'middle');
        }
        if (st.mode === 'first') {
          P.dot(info.p, 0, C.ink, 6);
          P.line([[info.p - 0.12, -0.12], [info.p + 0.12, 0.12]], C.ink, 1.6);
          P.line([[info.p - 0.12, 0.12], [info.p + 0.12, -0.12]], C.ink, 1.6);
          dim(0, 0, info.p, 0, 'σ = 1/τ = ' + info.sigma.toFixed(2), C.accent, 0, -18);
        } else {
          var a = [[info.re, info.im], [info.re, -info.im]];
          for (var i = 0; i < 2; i++) {
            P.dot(a[i][0], a[i][1], C.ink, 5);
            P.line([[a[i][0] - 0.11, a[i][1] - 0.11], [a[i][0] + 0.11, a[i][1] + 0.11]], C.ink, 1.6);
            P.line([[a[i][0] - 0.11, a[i][1] + 0.11], [a[i][0] + 0.11, a[i][1] - 0.11]], C.ink, 1.6);
          }
          dim(0, info.im, info.re, info.im, 'σ = ' + info.sigma.toFixed(2), C.accent, 0, -14);
          dim(info.re, 0, info.re, info.im, 'ωd = ' + info.wd.toFixed(2), C.c3, 30, 0);
          dim(0, 0, info.re, info.im, 'ωn = ' + info.wn.toFixed(2), C.c4, -34, 14);
          // 与负实轴的夹角 β
          var rr = Math.min(1.6, info.wn * 0.55);
          var arc = [];
          for (var k = 0; k <= 30; k++) {
            var th = Math.PI - info.beta * (k / 30);   // 从负实轴转到极点方向
            arc.push([rr * Math.cos(th), rr * Math.sin(th)]);
          }
          P.line(arc, C.accent2, 1.6);
          P.text('β = ' + (info.beta * 180 / Math.PI).toFixed(0) + '°',
            P.x(-rr * 1.2), P.y(rr * 0.66), C.accent2, 'right', 'middle');
        }
      }
    });
    var figS = Fig.create(fs.canvas, {
      xlim: [0, 6], ylim: [0, 1.7], xlabel: 't (s)', ylabel: 'y(t)',
      draw: function (P) {
        var C = P.C;
        P.line([[0, 1], [info.tmax, 1]], C.muted, 1, [5, 4]);
        // 蓝 σ：衰减包络（到虚轴的水平距离就是衰减率）
        if (st.mode === 'second') {
          var kk = 1 / Math.sqrt(Math.max(1e-6, 1 - st.zeta * st.zeta));
          var lo = [], hi = [];
          for (var i = 0; i <= 160; i++) {
            var t = info.tmax * i / 160, e = Math.exp(-info.sigma * t) * kk;
            lo.push([t, 1 - e]); hi.push([t, 1 + e]);
          }
          P.line(hi, C.accent, 1.2, [5, 4]);
          P.line(lo, C.accent, 1.2, [5, 4]);
        }
        P.line(pts, C.ink, 1.8);
        // 蓝 σ → ts
        if (isFinite(info.ts) && info.ts <= info.tmax) {
          P.line([[0, 0.99], [info.tmax, 0.99]], C.accent, 1, [3, 3]);
          P.line([[0, 1.01], [info.tmax, 1.01]], C.accent, 1, [3, 3]);
          P.line([[info.ts, 0.99], [info.ts, 1.01]], C.accent, 1.6);
          P.text('ts', P.x(info.ts), P.y(0.93), C.accent, 'center', 'middle');
        }
        // 青 ωd → tp ；橙 β → Mp
        if (st.mode === 'second' && info.m.peak > 1.001) {
          P.line([[info.m.tp, 0], [info.m.tp, info.m.peak]], C.c3, 1.2, [3, 3]);
          P.text('tp', P.x(info.m.tp), P.y(info.ymax * 0.055), C.c3, 'center', 'middle');
          P.line([[info.m.tp, 1], [info.m.tp, info.m.peak]], C.accent2, 1.6);
          P.dot(info.m.tp, info.m.peak, C.accent2, 3.5);
          P.text('Mp', P.x(info.m.tp) + 18, P.y((1 + info.m.peak) / 2), C.accent2, 'center', 'middle');
        }
        // 紫 ωn → tr
        if (isFinite(info.tr) && info.tr > 0) {
          var yb = info.ymax * 0.86;
          P.line([[info.t10, 0.1], [info.t10, yb]], C.c4, 1, [2, 3]);
          P.line([[info.t90, 0.9], [info.t90, yb]], C.c4, 1, [2, 3]);
          P.line([[info.t10, yb], [info.t90, yb]], C.c4, 1.4);
          P.dot(info.t10, yb, C.c4, 2.5); P.dot(info.t90, yb, C.c4, 2.5);
          P.text('tr', P.x((info.t10 + info.t90) / 2), P.y(yb) - 11, C.c4, 'center', 'middle');
        }
      }
    });
    var slTau = slider(ctl, 'τ', 0.3, 3, 0.05, st.tau, function (v) { return v.toFixed(2); }, function (v) { st.tau = v; build(); refresh(); });
    var slZ = slider(ctl, 'ζ', 0, 1.2, 0.02, st.zeta, function (v) { return v.toFixed(2); }, function (v) { st.zeta = v; build(); refresh(); });
    var slW = slider(ctl, 'ωn', 0.5, 5, 0.1, st.wn, function (v) { return v.toFixed(1); }, function (v) { st.wn = v; build(); refresh(); });
    segmented(ctl, [{ label: '一阶' }, { label: '二阶' }], function (it, k) { st.mode = k === 0 ? 'first' : 'second'; build(); refresh(); });
    function refresh() {
      slTau.input.parentNode.style.display = st.mode === 'first' ? '' : 'none';
      slZ.input.parentNode.style.display = st.mode === 'second' ? '' : 'none';
      slW.input.parentNode.style.display = st.mode === 'second' ? '' : 'none';
      if (st.mode === 'first') {
        lg.innerHTML = '<span><i style="background:var(--ctl-accent)"></i>蓝：到虚轴的水平距离 σ = 1/τ → 衰减率，管 ts</span>';
        setReadout(ro, [
          ['极点', info.p.toFixed(2) + '（实轴）'],
          ['σ（蓝）', info.sigma.toFixed(2) + ' = 1/τ'],
          ['结论', '离虚轴越远 → 衰减越快、ts 越短']
        ]);
      } else {
        lg.innerHTML =
          '<span><i style="background:var(--ctl-accent)"></i>蓝 σ 水平距离 → ts</span>' +
          '<span><i style="background:var(--ctl-c3)"></i>青 ωd 垂直距离 → tp</span>' +
          '<span><i style="background:var(--ctl-accent2)"></i>橙 θ 与 jω 轴夹角 → Mp</span>' +
          '<span><i style="background:var(--ctl-c4)"></i>紫 ωn 到原点 → tr</span>';
        setReadout(ro, [
          ['极点', info.re.toFixed(2) + ' ± j' + info.im.toFixed(2)],
          ['σ（蓝，水平）', info.sigma.toFixed(3) + ' → 管 ts'],
          ['ωd（青，垂直）', info.wd.toFixed(3) + ' → 管 tp'],
          ['ωn（紫，到原点）', info.wn.toFixed(3) + ' → 管 tr'],
          ['θ（橙，从 jω 轴）', (Math.asin(Math.min(1, st.zeta)) * 180 / Math.PI).toFixed(1) + '° = arcsin ζ → 管 Mp'],
          ['（从负实轴量）', (info.beta * 180 / Math.PI).toFixed(1) + '° = arccos ζ，与 θ 互余']
        ]);
      }
      Fig.renderAll();
    }
    toolbar(el, figZ, 'splane-geometry');
    build(); refresh();
  });

  Ctl.ControlMath = {
    rootsOf: rootsOf, polyFromRoots: polyFromRoots, tfEval: tfEval,
    stepFromTF: stepFromTF, stepMetrics: stepMetrics
  };
})(window);
