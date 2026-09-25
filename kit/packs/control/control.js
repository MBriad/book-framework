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

  /* 图下的「读图提示」。**必须由组件自己输出**——只有它知道当前是哪个模式/哪一步。
     写死在页面里的提示，一切换模式就对不上了（用户明确指出过这一点）。
     返回一个 setter，调用时顺带跑一次 KaTeX。 */
  function figNote(el) {
    var d = mk('div', 'ctl-fig-note');
    el.appendChild(d);
    return function (html) {
      d.innerHTML = html;
      if (global.renderMathInElement) {
        try {
          global.renderMathInElement(d, { delimiters: [{ left: '$', right: '$', display: false }], throwOnError: false });
        } catch (e) { /* 失败不阻断 */ }
      }
    };
  }
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
  /* 离散参数的选值器。**离散就別用滑块**——滑块能停在族里没有的值上，
     于是画出来的曲线不在参考族里、读数和看得见的曲线也对不上。
     复用 .ctl-seg 的样式，返回 set / setValues 两个方法。 */
  function chips(parent, label, values, initial, fmt, onpick) {
    var w = mk('div', 'ctl-ctl');
    var s = mk('span'); s.textContent = label; w.appendChild(s);
    var d = mk('div', 'ctl-seg'); w.appendChild(d); parent.appendChild(w);
    var vals = values.slice(), btns = [];
    function build() {
      d.innerHTML = ''; btns = [];
      vals.forEach(function (val) {
        var b = mk('button'); b.type = 'button'; b.textContent = fmt(val);
        b.addEventListener('click', function () {
          btns.forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
          b.setAttribute('aria-pressed', 'true');
          onpick(val);
        });
        btns.push(b); d.appendChild(b);
      });
    }
    function set(val) {
      btns.forEach(function (b, k) {
        b.setAttribute('aria-pressed', Math.abs(vals[k] - val) < 1e-9 ? 'true' : 'false');
      });
    }
    build(); set(initial);
    return {
      set: set,
      setValues: function (v2, keep) { vals = v2.slice(); build(); set(keep === undefined ? vals[0] : keep); }
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
  /* ---------------- ⑭ 拖 K：极点沿根轨迹移动 → 指标怎么变 ----------------
     G(s) = K/(s(s+1)(s+2))，单位反馈。左：根轨迹与闭环极点；右：闭环阶跃响应。
     这是「指标 → 怎么达到」那一步的正解：K 只让极点沿一条固定轨迹滑动。 */
  Ctl.Pack.register('root-locus', function (el) {
    var wrap = scaffold(el);   // scaffold 内部已加标题
    var fz = figBox(wrap, 'ctl-h-md'), fs = figBox(wrap, 'ctl-h-md');
    var note = figNote(el);
    var ctl = controls(el), ro = readout(el);

    var KMAX = 20, SAMPLES = 400;
    var locus = [];
    for (var i = 0; i <= SAMPLES; i++) {
      var k = KMAX * i / SAMPLES;
      locus.push({ K: k, roots: rootsOf([1, 3, 2, k]) });
    }
    var cur = 0.5, pts = [], info = { m: { peak: 0, tp: 0, overshoot: 0, ts: 0 }, tmax: 10, ymax: 1.6 };

    function rebuild() {
      var den = [1, 3, 2, cur], num = [cur];
      var rs = rootsOf(den);
      var slowest = Math.max.apply(null, rs.map(function (z) { return z[0]; }));
      var tmax = slowest < -1e-3 ? Math.min(30, Math.max(4, 5 / Math.abs(slowest))) : 20;
      pts = stepFromTF(den, num, tmax, tmax / 900);
      info.m = stepMetrics(pts, 1);
      info.tmax = tmax;
      info.ymax = Math.max(1.6, info.m.peak * 1.15);
      figS.spec.xlim = [0, tmax];   // figS 才是 Fig 对象；fs 是 figBox 的 {box, canvas}
      figS.spec.ylim = [0, info.ymax];
    }
    var figZ = Fig.create(fz.canvas, {
      xlim: [-5, 1], ylim: [-3, 3], equal: true, xlabel: 'Re', ylabel: 'Im',
      draw: function (P) {
        var C = P.C, j, q;
        P.line([[0, P.yinv(P.B)], [0, P.yinv(P.T)]], C.line, 1);
        P.line([[P.xinv(P.L), 0], [P.xinv(P.R), 0]], C.line, 1);
        for (j = 0; j < locus.length; j++) {
          for (q = 0; q < locus[j].roots.length; q++) P.dot(locus[j].roots[q][0], locus[j].roots[q][1], C.grid, 1.1);
        }
        P.dot(0, 0, C.accent2, 4.5); P.dot(-1, 0, C.accent2, 4.5); P.dot(-2, 0, C.accent2, 4.5);
        var r = rootsOf([1, 3, 2, cur]);
        for (j = 0; j < r.length; j++) P.dot(r[j][0], r[j][1], C.accent, 5.5);
        P.text('× 开环极点　● 当前闭环极点', P.x(P.xinv(P.L) + 0.15), P.y(P.yinv(P.T)) + 12, C.muted, 'left', 'middle');
      }
    });
    var figS = Fig.create(fs.canvas, {
      xlim: [0, 10], ylim: [0, 1.6], xlabel: 't (s)', ylabel: 'y(t)',
      draw: function (P) {
        var C = P.C;
        P.line([[0, 1], [P.xinv(P.R), 1]], C.muted, 1.2, [5, 4]);
        P.line(pts, C.ink, 2);
        if (info.m.peak > 1.001) {
          P.line([[info.m.tp, 1], [info.m.tp, info.m.peak]], C.accent2, 1.8);
          P.dot(info.m.tp, info.m.peak, C.accent2, 3.5);
          P.text('Mp = ' + info.m.overshoot.toFixed(1) + '%', P.x(info.m.tp) + 8, P.y((1 + info.m.peak) / 2), C.accent2, 'left', 'middle');
        }
      }
    });
    function criticalK() {
      for (var i2 = 1; i2 < locus.length; i2++) {
        var a = Math.max.apply(null, locus[i2 - 1].roots.map(function (z) { return z[0]; }));
        var b = Math.max.apply(null, locus[i2].roots.map(function (z) { return z[0]; }));
        if (a <= 0 && b > 0) {
          var t = a / (a - b || 1);
          return locus[i2 - 1].K + (locus[i2].K - locus[i2 - 1].K) * t;
        }
      }
      return null;
    }
    var kc = criticalK();
    function update() {
      rebuild();
      var r = rootsOf([1, 3, 2, cur]);
      var stable = r.every(function (z) { return z[0] < -1e-9; });
      var margin = r.some(function (z) { return Math.abs(z[0]) < 1e-6; });
      setReadout(ro, [
        ['K', cur.toFixed(2)],
        ['闭环极点', r.map(function (z) { return z[0].toFixed(2) + (Math.abs(z[1]) > 1e-3 ? (z[1] > 0 ? '+' : '') + 'j' + z[1].toFixed(2) : ''); }).join(', ')],
        ['稳定性', stable ? '稳定' : (margin ? '临界' : '不稳定')],
        ['临界 K', kc !== null ? kc.toFixed(2) : '超出扫描范围'],
        ['Mp', info.m.overshoot.toFixed(1) + '%'],
        ['ts ±1%', info.m.ts.toFixed(2) + ' s']
      ]);
      note(stable
        ? '看左边：<b>K 只让极点沿这条固定轨迹滑动</b>。当前三个极点全在左半平面 → 右边是衰减振荡。$K$ 越大，极点越往右跑，$M_p$ 越大、振荡拖得越久。'
        : margin
        ? '极点正好落在虚轴上 → <b>等幅振荡</b>，$t_s$ 失去意义（永远不进入 $\pm1\%$ 带）。摸到临界 $K$ 了。'
        : '已有极点越过虚轴进入<b>右半平面</b> → 发散，右边曲线往上冲。这就是"动参数前先判稳"的原因。');
      Fig.renderAll();
    }
    slider(ctl, 'K', 0.05, KMAX, 0.05, cur, function (v) { return v.toFixed(2); }, function (v) { cur = v; update(); });
    toolbar(el, figZ, 'root-locus');
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
    var note = figNote(el);
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
      note('链上现在有 <b>' + n + '</b> 级 <code>1/s</code>：方块数 = 状态变量数 = 分母最高次 = ' + n + '。换个 n，看这三个数一起变——这就是「同一个东西」。');
    }
    chips(ctl, '阶数 n', [1, 2, 3, 4, 5], st.n, function (v) { return String(v); },
      function (v) { st.n = v; refresh(); });
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
    var note = figNote(el);
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
      note(which === 'ctrl'
        ? '看两类抽头：$a_i$ 从各状态<b>回到输入端求和点</b>（所以矩阵第一行），$b_i$ 从各状态<b>汇到输出求和点</b>（所以在 $C$ 里）。'
        : '看三处换位：$b_i$ 变成<b>输入灌进各状态</b>（所以在 $B$ 里）；$a_i$ 不回输入端，而是<b>作用在状态之间</b>（所以矩阵第一列）；$y$ 直接取 $x_1$。');
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
    var wrap = scaffold(el), f = figBox(wrap, 'ctl-h-md');
    var note = figNote(el);
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
        // 终值线
        P.line([[P.xinv(P.L), 1], [P.xinv(P.R), 1]], C.muted, 1, [5, 4]);

        if (st.mode === 'first') {
          // t=0 的切线正好在 t=τ 处碰到终值——这是 τ 的几何本质。
          // 用红色，与橙色的 τ 竖线区分开，免得看不出哪条是切线。
          P.line([[0, 0], [st.tau, 1]], C.c5, 2.2);
          P.dot(0, 0, C.c5, 3.5);
          P.text('t = 0 处的切线', P.x(st.tau), P.y(1.13), C.c5, 'center', 'middle');
          P.line([[st.tau, 0], [st.tau, 1]], C.accent2, 1.2, [2, 3]);
          P.dot(st.tau, info.tauY, C.accent2, 4);
          P.text('τ = ' + st.tau.toFixed(2) + '　到 63.2%', P.x(st.tau) + 10, P.y(info.tauY), C.accent2, 'left', 'middle');
        } else {
          var m = info.m;
          var kk = 1 / Math.sqrt(Math.max(1e-6, 1 - st.zeta * st.zeta));
          var env = [];
          for (var e = 0; e <= 180; e++) { var te = tmax * e / 180; env.push([te, 1 + Math.exp(-info.sigma * te) * kk]); }
          P.line(env, C.accent, 1.3, [5, 4]);
          if (m.peak > 1.001) {
            P.line([[m.tp, 1], [m.tp, m.peak]], C.accent2, 2);
            P.dot(m.tp, m.peak, C.accent2, 4);
            P.text('Mp = ' + m.overshoot.toFixed(1) + '%', P.x(m.tp) + 8, P.y((1 + m.peak) / 2), C.accent2, 'left', 'middle');
            P.line([[m.tp, 0], [m.tp, m.peak]], C.c3, 1.2, [3, 3]);
            P.text('tp', P.x(m.tp), P.y(info.ymax * 0.05), C.c3, 'center', 'middle');
          }
        }

        P.line(pts, C.ink, 2);

        // 上升时间：10%→90% 的尺寸线
        if (isFinite(info.tr)) {
          var yb = info.ymax * 0.92;
          P.line([[info.t10, 0.1], [info.t10, yb]], C.accent, 1, [2, 3]);
          P.line([[info.t90, 0.9], [info.t90, yb]], C.accent, 1, [2, 3]);
          P.line([[info.t10, yb], [info.t90, yb]], C.accent, 1.4);
          P.text('tr = ' + info.tr.toFixed(2) + ' s（10%→90%）', P.x((info.t10 + info.t90) / 2), P.y(yb) - 11, C.accent, 'center', 'middle');
        }

        // 调节时间：只打一个刻度。±1% 带在这个纵轴范围里只有约 3 像素，
        // 画出来会糊成一条压在终值线上——那是噪声，不是信息。
        if (isFinite(info.ts) && info.ts <= tmax) {
          P.line([[info.ts, 0], [info.ts, info.ymax * 0.07]], C.c3, 2.5);
          P.dot(info.ts, 0, C.c3, 3.5);
          var right = info.ts > tmax * 0.6;
          P.text('ts = ' + info.ts.toFixed(2) + ' s（±1%）', P.x(info.ts) + (right ? -8 : 8), P.y(info.ymax * 0.11), C.c3, right ? 'right' : 'left', 'middle');
        }
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
      note(st.mode === 'first'
        ? '看<b>红色那条</b>：它是 $t=0$ 处的切线，一路斜上去，正好在 $t=\tau$ 处碰到终值——这一条同时给出 $\tau$（横坐标）和初始斜率 $1/\tau$（斜率）。'
        : '看<b>橙色</b>：竖线是 $M_p$、虚线是衰减包络。拖 $\zeta$ 只改 $M_p$，拖 $\omega_n$ 只改时间轴——<b>峰值高度不动</b>，因为 $M_p$ 只由 $\zeta$ 决定。');
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
    var wrap = scaffold(el);
    var fz = figBox(wrap, 'ctl-h-md', true), fs = figBox(wrap, 'ctl-h-md');
    var lg = mk('div', 'ctl-legend');
    el.appendChild(lg);
    var note = figNote(el);
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
          // Franklin Fig 3.18：θ = arcsin ζ，从 jω 轴量到极点方向
          var rr = Math.min(1.6, info.wn * 0.55);
          var span = Math.PI / 2 - info.beta;           // = arcsin ζ
          var arc = [];
          for (var k = 0; k <= 30; k++) {
            var th = Math.PI / 2 + span * (k / 30);
            arc.push([rr * Math.cos(th), rr * Math.sin(th)]);
          }
          P.line(arc, C.accent2, 1.6);
          if (span > 0.04) {
            var mid = Math.PI / 2 + span / 2;
            P.text('θ = ' + (span * 180 / Math.PI).toFixed(0) + '°',
              P.x(rr * 1.5 * Math.cos(mid)), P.y(rr * 1.5 * Math.sin(mid)), C.accent2, 'center', 'middle');
          }
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
        note('看图上那段<b>水平距离</b>：极点到虚轴的 σ（蓝）就是 1/τ。σ 越大，右图曲线越快贴上 1，ts 越短。');
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
        note('四个几何量各管一条指标：<b>到虚轴的水平距离</b> σ（蓝）→ ts；<b>到实轴的垂直距离</b> ωd（青）→ tp；<b>到原点的距离</b> ωn（紫）→ tr；<b>与 jω 轴的夹角</b> θ（橙）→ Mp。左图动一下，右图对应指标立刻跟着动。');
      }
      Fig.renderAll();
    }
    toolbar(el, figZ, 'splane-geometry');
    build(); refresh();
  });

  /* ---------------- ⑫ 极点位置图鉴（Franklin Fig 3.16 那种） ----------------
     左：s 平面上 6 个代表点；右：6 条小波形一一对应。纯定性、无交互——
     图鉴的价值就在"一眼看全"，加拖拽反而毁掉它。 */
  Ctl.Pack.register('pole-catalog', function (el) {
    el.classList.add('ctl-widget');
    var wrap = scaffold(el);   // scaffold 内部已加标题，不要再手写一遍
    var fz = figBox(wrap, 'ctl-h-lg'), fs = figBox(wrap, 'ctl-h-xl');

    var TMAX = 4;
    var CASES = [
      { n: '①', lab: 's = −3', sub: '迅速衰减', pos: [[-3, 0]], f: function (t) { return Math.exp(-3 * t); } },
      { n: '②', lab: 's = −0.5', sub: '缓缓衰减', pos: [[-0.5, 0]], f: function (t) { return Math.exp(-0.5 * t); } },
      { n: '③', lab: 's = −0.5 ± j3', sub: '衰减振荡', pos: [[-0.5, 3], [-0.5, -3]], f: function (t) { return Math.exp(-0.5 * t) * Math.sin(3 * t); } },
      { n: '④', lab: 's = ±j3', sub: '等幅振荡', pos: [[0, 3], [0, -3]], f: function (t) { return Math.sin(3 * t); } },
      { n: '⑤', lab: 's = +0.5', sub: '发散', pos: [[0.5, 0]], f: function (t) { return Math.exp(0.5 * t); } },
      { n: '⑥', lab: 's = 0', sub: '不衰减也不发散', pos: [[0, 0]], f: function (t) { return 1; } }
    ];
    // 各自归一化到 max|y| = 1：形状保留（发散那条也从 0 涨到 1，仍看得出涨）
    CASES.forEach(function (c) {
      var mx = 0;
      for (var k = 0; k <= 200; k++) mx = Math.max(mx, Math.abs(c.f(TMAX * k / 200)));
      c.norm = mx || 1;
    });

    Fig.create(fz.canvas, {
      xlim: [-3.7, 1.3], ylim: [-3.5, 3.5], equal: true, xlabel: 'Re', ylabel: 'Im',
      draw: function (P) {
        var C = P.C;
        P.line([[0, P.yinv(P.B)], [0, P.yinv(P.T)]], C.line, 1);
        P.line([[P.xinv(P.L), 0], [P.xinv(P.R), 0]], C.line, 1);
        for (var i = 0; i < CASES.length; i++) {
          var c = CASES[i];
          for (var k = 0; k < c.pos.length; k++) {
            var x = c.pos[k][0], y = c.pos[k][1];
            P.line([[x - 0.11, y - 0.11], [x + 0.11, y + 0.11]], C.ink, 1.6);
            P.line([[x - 0.11, y + 0.11], [x + 0.11, y - 0.11]], C.ink, 1.6);
          }
          var p0 = c.pos[0];
          P.text(c.n, P.x(p0[0]) + (p0[0] < -0.2 ? -17 : 17), P.y(p0[1]) + (p0[1] > 0 ? -15 : 15), C.accent, 'center', 'middle');
        }
      }
    });

    Fig.create(fs.canvas, {
      bare: true, xlim: [0, 1], ylim: [0, 1], padding: { l: 6, r: 6, t: 6, b: 6 },
      draw: function (P) {
        var C = P.C, ctx = P.ctx, n = CASES.length;
        var top0 = P.T, band = (P.B - P.T) / n;
        for (var i = 0; i < n; i++) {
          var c = CASES[i];
          var top = top0 + i * band + 6, bot = top0 + (i + 1) * band - 6;
          var mid = (top + bot) / 2, amp = (bot - top) / 2 - 3;
          var x0 = P.L + 118, x1 = P.R - 8;
          var px = function (t) { return x0 + (x1 - x0) * (t / TMAX); };
          var py = function (v) { return mid - v * amp; };
          ctx.save();
          ctx.beginPath(); ctx.moveTo(x0, mid); ctx.lineTo(x1, mid);
          ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
          ctx.beginPath();
          for (var k = 0; k <= 240; k++) {
            var t = TMAX * k / 240;
            var X = px(t), Y = py(c.f(t) / c.norm);
            if (k === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
          }
          ctx.strokeStyle = C.ink; ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.stroke();
          if (i > 0) {
            ctx.beginPath(); ctx.moveTo(P.L, top0 + i * band); ctx.lineTo(P.R, top0 + i * band);
            ctx.strokeStyle = C.grid; ctx.lineWidth = 1; ctx.stroke();
          }
          ctx.restore();
          P.text(c.n, P.L + 22, mid - 8, C.accent, 'center', 'middle');
          P.text(c.lab, P.L + 38, mid - 8, C.ink, 'left', 'middle');
          P.text(c.sub, P.L + 38, mid + 9, C.muted, 'left', 'middle');
        }
        P.text('t →', (P.L + P.R) / 2, P.B + 11, C.muted, 'center', 'middle');
      }
    });

    var lg = mk('div', 'ctl-legend');
    lg.innerHTML = '<span>六条都是<b>冲激响应</b>（自然响应）；横轴同一时间尺度 0–4 s，纵轴各自归一化——<b>只看形状与快慢</b></span>';
    el.appendChild(lg);
  });

  /* ---------------- ⑬ 零点 / 附加极点的影响：一族阶跃响应 ----------------
     三种模式共用同一个归一化参数 α（式 3.80 / 3.82），归一化时间 τ = ωn·t。
     所有曲线都归一化到直流增益 1 —— 所以终值全停在 1，差别只在瞬态。
     用户问的「零点对 steady value 的影响」在这里一眼可见。 */
  Ctl.Pack.register('zero-pole-family', function (el) {
    el.classList.add('ctl-widget');
    var wrap = scaffold(el), f = figBox(wrap, 'ctl-h-lg'), fz = figBox(wrap, 'ctl-h-lg');
    var note = figNote(el);
    var ctl = controls(el), ro = readout(el);

    var st = { mode: 'lhp', zeta: 0.5, alpha: 1 };
    var TMAX = 10;
    var FAM = { lhp: [0.5, 1, 2, 3, 10], rhp: [-0.5, -1, -2, -4], pole: [0.5, 1, 2, 3, 10] };
    var cache = {};

    function tfFor(mode, zeta, alpha) {
      var den0 = [1, 2 * zeta, 1];
      if (mode === 'pole') return { den: mulReal([1 / (alpha * zeta), 1], den0), num: [1] };
      return { den: den0, num: [1 / (alpha * zeta), 1] };
    }
    function family() {
      var key = st.mode + '|' + st.zeta;
      if (!cache[key]) {
        var o = {};
        FAM[st.mode].forEach(function (a) {
          var tf = tfFor(st.mode, st.zeta, a);
          o[a] = stepFromTF(tf.den, tf.num, TMAX, TMAX / 900);
        });
        // 三种模式都要这条基准（提示里承诺的紫色虚线），别只在零点模式下算
        o['base'] = stepFromTF([1, 2 * st.zeta, 1], [1], TMAX, TMAX / 900);
        cache[key] = o;
      }
      return cache[key];
    }
    var fig = Fig.create(f.canvas, {
      xlim: [0, TMAX], ylim: [0, 2], xlabel: '归一化时间 τ = ωn·t', ylabel: 'y',
      draw: function (P) {
        var C = P.C, cs = family();
        P.line([[0, 1], [P.xinv(P.R), 1]], C.muted, 1.4, [5, 4]);
        FAM[st.mode].forEach(function (a) {
          if (Math.abs(a - st.alpha) < 1e-9) return;
          P.line(cs[a], C.line, 1.2);
        });
        if (cs['base']) P.line(cs['base'], C.c4, 1.2, [4, 3]);
        var cur = cs[st.alpha];
        if (cur) P.line(cur, C.accent, 2.6);
        P.text('终值恒为 1', P.x(TMAX * 0.72), P.y(1.05), C.muted, 'center', 'middle');
      }
    });
    /* 右图：同一个 α 在 s 平面上的样子。左图那条高亮曲线就是这个位置的零/极点
       生出来的——两张图必须能对上，否则 α 只是一个没来由的旋钮。
       纵向两根横条的长度之比**正好就是 α**；灰虚线是 Franklin 的 4× 判据。 */
    var figZ = Fig.create(fz.canvas, {
      xlim: [-3, 0.9], ylim: [-1.4, 1.4], equal: true, xlabel: 'Re', ylabel: 'Im',
      padding: { l: 44, r: 12, t: 14, b: 92 },   // 底部整条留给两根量长度的横条
      draw: function (P) {
        var C = P.C, z = st.zeta, i;
        P.line([[0, P.yinv(P.B)], [0, P.yinv(P.T)]], C.line, 1);
        P.line([[P.xinv(P.L), 0], [P.xinv(P.R), 0]], C.line, 1);
        // 每像素多少数据单位 —— 面板是等比的，所以用它画的圆/叉不会被 α 拉伸变形
        var ux = (P.xinv(P.R) - P.xinv(P.L)) / Math.max(1, P.R - P.L);
        var s = 5 * ux;
        // ωn 已归一化成 1（时间轴本来就是 τ = ωn·t），所以复极点被钉在单位圆上：
        // **只有 ζ 能让它沿圆弧滑动，α 一点都不动它。**
        var re = -z, im = Math.sqrt(Math.max(0, 1 - z * z));
        // 4× 判据线：零/极点离虚轴的距离超过复极点实部的 4 倍，影响就基本看不出来
        P.line([[-4 * z, P.yinv(P.T)], [-4 * z, P.yinv(P.B)]], C.muted, 1.2, [4, 4]);
        P.text('4×', P.x(-4 * z), P.y(P.yinv(P.T)) + 10, C.muted, 'center', 'middle');
        // 复极点对（×）
        for (i = 0; i < 2; i++) {
          var py = i === 0 ? im : -im;
          P.line([[re - s, py - s], [re + s, py + s]], C.ink, 1.6);
          P.line([[re - s, py + s], [re + s, py - s]], C.ink, 1.6);
          P.dot(re, py, C.ink, 2.5);
        }
        P.text('复极点', P.x(re) + 10, P.y(im) - 8, C.ink, 'left', 'middle');
        // 零（○）/ 附加极点（×）—— 位置随 α 走，左图那条高亮曲线就是它生出来的
        var zr = (st.mode === 'rhp' ? 1 : -1) * st.alpha * z;
        if (st.mode === 'pole') {
          // 极点是叉、零点是圈：附加极点模式画圈会让人误以为在挪零点
          P.line([[zr - s, -s], [zr + s, s]], C.accent, 1.8);
          P.line([[zr - s, s], [zr + s, -s]], C.accent, 1.8);
          P.text('附加极点', P.x(zr) + 12, P.y(0) - 13, C.accent, 'left', 'middle');
        } else {
          var ring = [];
          for (i = 0; i <= 18; i++) {
            var th = i / 18 * Math.PI * 2;
            ring.push([zr + s * 1.15 * Math.cos(th), s * 1.15 * Math.sin(th)]);
          }
          P.line(ring, C.accent, 1.8);
          P.text('零点', P.x(zr) + 12, P.y(0) - 13, C.accent, 'left', 'middle');
        }
        // 底部两条量长度的横条：ζ（深）与 αζ（蓝），长度之比 = α
        var y1 = P.yinv(P.B + 24), y2 = P.yinv(P.B + 56);
        P.line([[0, y1], [re, y1]], C.ink, 1.6);
        P.line([[re, y1 - s * 0.8], [re, y1 + s * 0.8]], C.ink, 1.4);
        P.text('复极点到虚轴 ζ = ' + z.toFixed(2), P.x(re / 2), P.y(y1) + 11, C.ink, 'center', 'middle');
        P.line([[0, y2], [zr, y2]], C.accent, 1.8);
        P.line([[zr, y2 - s * 0.8], [zr, y2 + s * 0.8]], C.accent, 1.4);
        P.text((st.mode === 'pole' ? '附加极点到虚轴 αζ = ' : '零点到虚轴 αζ = ') + Math.abs(zr).toFixed(2),
          P.x(zr / 2), P.y(y2) + 11, C.accent, 'center', 'middle');
      }
    });
    var slZ = slider(ctl, 'ζ', 0.15, 1, 0.05, st.zeta, function (v) { return v.toFixed(2); },
      function (v) { st.zeta = v; refresh(); });
    /* α 是**离散**的：族里就只有 FAM[mode] 这几个值。滑块能停在 7.2 这种
       既不在族里、读数和灰线也对不上的位置上——所以用选值。 */
    var chA = chips(ctl, 'α', FAM[st.mode], st.alpha, function (v) { return String(v); },
      function (v) { st.alpha = v; refresh(); });
    var segs = segmented(ctl, [{ label: 'LHP 零点' }, { label: 'RHP 零点' }, { label: '附加极点' }], function (it, k) {
      st.mode = k === 0 ? 'lhp' : (k === 1 ? 'rhp' : 'pole');
      st.alpha = st.mode === 'rhp' ? -1 : 1;
      chA.setValues(FAM[st.mode], st.alpha);
      refresh();
    });
    // 允许页面用 data-default="rhp" / "pole" 指定初始模式
    var def = el.getAttribute('data-default');
    if (def === 'rhp') { st.mode = 'rhp'; st.alpha = -1; }
    else if (def === 'pole') { st.mode = 'pole'; }
    if (st.mode !== 'lhp') {
      segs.forEach(function (b2, kk) {
        var want = (st.mode === 'rhp' && kk === 1) || (st.mode === 'pole' && kk === 2);
        b2.setAttribute('aria-pressed', want ? 'true' : 'false');
      });
      chA.setValues(FAM[st.mode], st.alpha);
    }
    function refresh() {
      var cs = family(), cur = cs[st.alpha];   // α 一定是族里的值（选值器保证）
      var m = stepMetrics(cur, 1);
      var t10 = firstCrossT(cur, 0.1), t90 = firstCrossT(cur, 0.9);
      var name = st.mode === 'lhp' ? 'LHP 零点 α' : (st.mode === 'rhp' ? 'RHP 零点 α' : '附加极点 α');
      setReadout(ro, [
        [name, String(st.alpha)],
        ['离复极点实部', Math.abs(st.alpha).toFixed(1) + ' 倍' +
          (Math.abs(st.alpha) <= 4 ? '（4× 以内 → 影响明显）' : '（超出 4× → 基本看不出来）')],
        ['ζ', st.zeta.toFixed(2)],
        ['Mp', m.overshoot.toFixed(1) + '%'],
        ['tr（10→90%）', (t90 - t10).toFixed(2)],
        ['终值', '1.000（直流增益归一化，与 α 无关）']
      ]);
      note((st.mode === 'lhp'
        ? '左图看终值线：<b>所有曲线最后都汇到 1</b>——LHP 零点<b>只改瞬态</b>（紫虚线是<b>无零点</b>基准）。右图是同一个 α 的 s 平面：<b>蓝圈就是零点</b>，它到虚轴的距离是复极点实部的 α 倍；蓝圈越过灰虚线（4×）后，左图那条高亮线就贴着基准了。'
        : st.mode === 'rhp'
        ? '左图看开头：曲线<b>先往下冲出坑，再回升到 1</b>——这就是右半平面零点（非最小相位）。右图里<b>蓝圈翻到了虚轴右侧</b>：离虚轴越近（α 越小）坑越深，越往右远处去反冲越弱。'
        : '左图看上升段：附加极点主要<b>拖长上升时间</b>，不像零点那样加超调。右图里蓝<b>叉</b>与复极点<b>同侧</b>：α 越大它越靠左、左图上升越慢；越过 4× 灰线后与基准（紫虚线）重合。')
        + ' 右图把 $\omega_n$ 归一化成 1（时间轴本来就是 $\tau=\omega_n t$），所以复极点被钉在<b>单位圆</b>上——'
        + '<b>只有 ζ 能让它沿圆弧滑动，换 α 一点都不动它</b>，α 只挪零/极点。');
      // s 平面范围跟着零/极点走，否则 α=10 时蓝圈跑到画外
      var za = st.alpha * st.zeta;
      figZ.spec.xlim = st.mode === 'rhp'
        ? [-1.7, Math.max(0.9, za * 1.3)]
        : [Math.min(-1.7, -za * 1.3), 0.9];
      Fig.renderAll();
    }
    toolbar(el, fig, 'zero-pole-family');
    refresh();
  });

  Ctl.ControlMath = {
    rootsOf: rootsOf, polyFromRoots: polyFromRoots, tfEval: tfEval,
    stepFromTF: stepFromTF, stepMetrics: stepMetrics
  };
})(window);
