/* kit/core/lib/canvas.js — Canvas 底座：DPR 缩放、坐标轴、刻度、导出 PNG、打印高清重绘。
   规则：canvas 只画线；所有文字（轴标签、刻度、读数）由 DOM 或 canvas 文字层承担，
   DOM 部分由各组件自己写在 .ctl-readout 里。 */
(function (global) {
  'use strict';
  var Ctl = global.Ctl = global.Ctl || {};
  var figs = [];

  function cssVar(name, fallback) {
    var v = global.getComputedStyle(document.documentElement).getPropertyValue(name);
    return (v && v.trim()) || fallback;
  }
  function colors() {
    return {
      bg: cssVar('--ctl-bg', '#fff'), panel: cssVar('--ctl-panel', '#fff'),
      ink: cssVar('--ctl-ink', '#111'), muted: cssVar('--ctl-muted', '#666'),
      line: cssVar('--ctl-line', '#ccc'), grid: cssVar('--ctl-grid', '#eee'),
      accent: cssVar('--ctl-accent', '#1f6feb'), accent2: cssVar('--ctl-accent2', '#b45309'),
      c3: cssVar('--ctl-c3', '#0f766e'), c4: cssVar('--ctl-c4', '#7c3aed')
    };
  }

  function linScale(d0, d1, r0, r1) {
    var k = (r1 - r0) / ((d1 - d0) || 1);
    var f = function (v) { return r0 + (v - d0) * k; };
    f.inv = function (p) { return d0 + (p - r0) / (k || 1); };
    return f;
  }
  function logScale(d0, d1, r0, r1) {
    var l0 = Math.log(Math.max(d0, 1e-12)), l1 = Math.log(Math.max(d1, 1e-12));
    var k = (r1 - r0) / ((l1 - l0) || 1);
    var f = function (v) { return r0 + (Math.log(Math.max(v, 1e-12)) - l0) * k; };
    f.inv = function (p) { return Math.exp(l0 + (p - r0) / (k || 1)); };
    return f;
  }
  function linTicks(a, b, count) {
    var span = b - a;
    if (!(span > 0)) return [a];
    var step = Math.pow(10, Math.floor(Math.log10(span / (count || 5))));
    var err = span / (count || 5) / step;
    if (err >= 5) step *= 10; else if (err >= 2) step *= 5; else if (err >= 1) step *= 2;
    var out = [], v = Math.ceil(a / step - 1e-9) * step;
    for (; v <= b + step * 1e-6; v += step) out.push(Math.abs(v) < step * 1e-6 ? 0 : Math.round(v / step) * step);
    return out;
  }
  function logTicks(a, b) {
    var out = [], p = Math.floor(Math.log10(Math.max(a, 1e-12)));
    for (; p <= Math.ceil(Math.log10(Math.max(b, 1e-12))); p++) {
      var v = Math.pow(10, p);
      if (v >= a * 0.999 && v <= b * 1.001) out.push(v);
    }
    return out;
  }
  function fmtNum(v, d) {
    if (!isFinite(v)) return String(v);
    if (v === 0) return '0';
    var av = Math.abs(v);
    if (av >= 1e4 || av < 1e-3) {
      var e = Math.floor(Math.log10(av)), m = Math.round(v / Math.pow(10, e) * 100) / 100;
      if (Math.abs(m - 1) < 1e-9) return '10^' + e;
      if (Math.abs(m + 1) < 1e-9) return '-10^' + e;
      return m + '\u00d710^' + e;
    }
    var s = v.toFixed(d === undefined ? 2 : d);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s;
  }
  function fmtLog(v) {
    var e = Math.round(Math.log10(v));
    if (Math.abs(Math.pow(10, e) - v) < 1e-9 * Math.max(1, v)) return '10^' + e;
    return fmtNum(v);
  }

  function prep(canvas, scale) {
    var r = canvas.getBoundingClientRect();
    var w = Math.round(r.width), h = Math.round(r.height);
    if (w < 10 || h < 10) return null;
    var dpr = Math.max(1, Math.min(4, scale || global.devicePixelRatio || 1));
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx: ctx, w: w, h: h, dpr: dpr };
  }

  function drawFrame(P, spec, C, xl, yl) {
    var ctx = P.ctx;
    ctx.fillStyle = C.panel;
    ctx.fillRect(P.L, P.T, P.R - P.L, P.B - P.T);
    ctx.strokeStyle = C.line; ctx.lineWidth = 1;
    ctx.strokeRect(P.L + 0.5, P.T + 0.5, P.R - P.L - 1, P.B - P.T - 1);

    var xs = spec.xlog ? logTicks(Math.max(xl[0], 1e-12), xl[1]) : linTicks(xl[0], xl[1], 5);
    var ys = spec.ylog ? logTicks(Math.max(yl[0], 1e-12), yl[1]) : linTicks(yl[0], yl[1], 4);
    ctx.font = '11px -apple-system,"Segoe UI","Microsoft YaHei",sans-serif';
    ctx.textBaseline = 'middle';

    var i, v, px, py;
    ctx.strokeStyle = C.grid;
    ctx.beginPath();
    for (i = 0; i < xs.length; i++) { px = Math.round(P.x(xs[i])) + 0.5; ctx.moveTo(px, P.T); ctx.lineTo(px, P.B); }
    for (i = 0; i < ys.length; i++) { py = Math.round(P.y(ys[i])) + 0.5; ctx.moveTo(P.L, py); ctx.lineTo(P.R, py); }
    ctx.stroke();

    ctx.fillStyle = C.muted; ctx.textAlign = 'center';
    for (i = 0; i < xs.length; i++) ctx.fillText(spec.xlog ? fmtLog(xs[i]) : fmtNum(xs[i]), P.x(xs[i]), P.B + 11);
    ctx.textAlign = 'right';
    for (i = 0; i < ys.length; i++) ctx.fillText(spec.ylog ? fmtLog(ys[i]) : fmtNum(ys[i]), P.L - 6, P.y(ys[i]));
    if (spec.xlabel) { ctx.textAlign = 'center'; ctx.fillText(spec.xlabel, (P.L + P.R) / 2, P.h - 6); }
    if (spec.ylabel) {
      ctx.save(); ctx.translate(9, (P.T + P.B) / 2); ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center'; ctx.fillText(spec.ylabel, 0, 0); ctx.restore();
    }
  }

  function create(canvas, spec) {
    spec.padding = spec.padding || { l: 44, r: 12, t: 12, b: 30 };
    var fig = { canvas: canvas, spec: spec };
    fig.render = function (scale) {
      var p = prep(canvas, scale);
      if (!p) { fig._stale = true; return false; }
      fig._stale = false;
      var pad = spec.padding;
      var L = pad.l, R = p.w - pad.r, T = pad.t, Bt = p.h - pad.b;
      if (R - L < 20 || Bt - T < 20) return false;
      var xl = [spec.xlim[0], spec.xlim[1]], yl = [spec.ylim[0], spec.ylim[1]];
      if (spec.equal) {
        var kx = (R - L) / ((xl[1] - xl[0]) || 1);
        if ((yl[1] - yl[0]) * kx <= Bt - T) {
          var halfY = ((Bt - T) / kx) / 2, cy = (yl[0] + yl[1]) / 2;
          yl = [cy - halfY, cy + halfY];
        } else {
          var halfX = ((R - L) * (yl[1] - yl[0]) / (Bt - T)) / 2, cx = (xl[0] + xl[1]) / 2;
          xl = [cx - halfX, cx + halfX];
        }
      }
      var xs = spec.xlog ? logScale(xl[0], xl[1], L, R) : linScale(xl[0], xl[1], L, R);
      var ys = spec.ylog ? logScale(yl[0], yl[1], Bt, T) : linScale(yl[0], yl[1], Bt, T);
      var C = colors();
      var P = {
        ctx: p.ctx, w: p.w, h: p.h, L: L, R: R, T: T, B: Bt, C: C,
        x: xs, y: ys, xinv: xs.inv, yinv: ys.inv,
        clip: function () { var c = p.ctx; c.save(); c.beginPath(); c.rect(L, T, R - L, Bt - T); c.clip(); },
        unclip: function () { p.ctx.restore(); },
        line: function (pts, color, width, dash) {
          if (!pts || pts.length < 2) return;
          var c = p.ctx; c.save(); c.beginPath();
          for (var i = 0; i < pts.length; i++) {
            var X = xs(pts[i][0]), Y = ys(pts[i][1]);
            if (i === 0) c.moveTo(X, Y); else c.lineTo(X, Y);
          }
          c.strokeStyle = color || C.accent; c.lineWidth = width || 1.6;
          c.lineJoin = 'round'; c.lineCap = 'round';
          if (dash) c.setLineDash(dash);
          c.stroke(); c.restore();
        },
        dot: function (X, Y, color, r) {
          var c = p.ctx; c.beginPath(); c.arc(xs(X), ys(Y), r || 3.5, 0, Math.PI * 2);
          c.fillStyle = color || C.accent; c.fill();
        },
        text: function (str, X, Y, color, align, baseline) {
          var c = p.ctx;
          c.font = '11px -apple-system,"Segoe UI","Microsoft YaHei",sans-serif';
          c.fillStyle = color || C.ink; c.textAlign = align || 'left'; c.textBaseline = baseline || 'middle';
          c.fillText(str, X, Y);
        }
      };
      fig.P = P;
      drawFrame(P, spec, C, xl, yl);
      spec.draw(P, spec);
      return true;
    };
    figs.push(fig);
    return fig;
  }

  var raf = null;
  function renderAll(scale) {
    if (raf) { global.cancelAnimationFrame(raf); raf = null; }
    raf = global.requestAnimationFrame(function () {
      raf = null;
      for (var i = 0; i < figs.length; i++) figs[i].render(scale);
    });
  }
  function renderAllNow(scale) { for (var i = 0; i < figs.length; i++) figs[i].render(scale); }

  function exportPNG(fig, name) {
    fig.render(3);
    var url = fig.canvas.toDataURL('image/png');
    fig.render();
    var a = document.createElement('a');
    a.href = url; a.download = (name || 'figure') + '.png';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  var resizeTimer = null;
  global.addEventListener('resize', function () {
    global.clearTimeout(resizeTimer);
    resizeTimer = global.setTimeout(function () { renderAll(); }, 120);
  });
  document.addEventListener('ctl:theme', function () { renderAll(); });
  document.addEventListener('toggle', function () { renderAll(); }, true);

  var themeBeforePrint = null;
  global.addEventListener('beforeprint', function () {
    themeBeforePrint = document.documentElement.getAttribute('data-theme');
    if (themeBeforePrint === 'dark') document.documentElement.setAttribute('data-theme', 'light');
    renderAllNow(3);
  });
  global.addEventListener('afterprint', function () {
    if (themeBeforePrint) document.documentElement.setAttribute('data-theme', themeBeforePrint);
    themeBeforePrint = null;
    renderAllNow();
  });

  Ctl.Fig = {
    create: create, renderAll: renderAll, renderAllNow: renderAllNow, exportPNG: exportPNG,
    colors: colors, linScale: linScale, logScale: logScale, linTicks: linTicks, logTicks: logTicks,
    fmtNum: fmtNum, fmtLog: fmtLog, figs: figs
  };
})(window);
