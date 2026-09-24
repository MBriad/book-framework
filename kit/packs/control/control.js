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
  /* finalValue 传解析终值（直流增益）；不传则退回最后一个采样点。
     峰值用三点抛物线插值细化，否则离散采样的峰值会系统性低于理论超调量。 */
  function stepMetrics(ys, finalValue) {
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
    for (i = ys.length - 1; i >= 0; i--) if (Math.abs(ys[i][1] - fin) > 0.02 * Math.abs(fin)) { ts = ys[i][0]; break; }
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
      var thTs = z > 0 ? 4 / (z * wn) : NaN;
      setReadout(ro, [
        ['ζ', z.toFixed(2)], ['ωn', wn.toFixed(2) + ' rad/s'],
        ['超调量（仿真）', m.overshoot.toFixed(1) + '%'], ['超调量（理论）', thr.toFixed(1) + '%'],
        ['调节时间 2%（仿真）', m.ts.toFixed(2) + ' s'],
        ['调节时间（理论 4/ζωn 近似）', isFinite(thTs) ? thTs.toFixed(2) + ' s' : '—']
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
        ['超调量', m.overshoot.toFixed(1) + '%'], ['调节时间 2%', m.ts.toFixed(2) + ' s']
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
        ['调节时间 2%', m.ts.toFixed(2) + ' s']
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

  Ctl.ControlMath = {
    rootsOf: rootsOf, polyFromRoots: polyFromRoots, tfEval: tfEval,
    stepFromTF: stepFromTF, stepMetrics: stepMetrics
  };
})(window);
