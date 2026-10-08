#!/usr/bin/env node
/* kit/tools/routh-check.js — 复现「稳定性与劳斯判据」一节里引用的每一个数。

为什么值得留：那一节里写了「10142 个样例 / 10021 个偏小 / 7557 个算对」，
如果脚本不留下来，这些数就是不可复现的断言——而这一路已经栽过好几次
「数字看着合理但其实没验」。用法：node kit/tools/routh-check.js
*/
'use strict';

function routh(a, eps) {
  var n = a.length - 1, i, k, r0 = [], r1 = [];
  for (i = 0; i <= n; i += 2) r0.push(a[i] || 0);
  for (i = 1; i <= n; i += 2) r1.push(a[i] || 0);
  var rows = [r0, r1];
  while (rows.length <= n) {
    var A = rows[rows.length - 2], B = rows[rows.length - 1].slice();
    if (eps !== undefined && Math.abs(B[0]) < 1e-14) B[0] = eps;
    var L = Math.max(A.length, B.length), nr = [];
    for (k = 1; k < L; k++) {
      nr.push(B[0] === 0 ? 0 : (B[0] * (A[k] || 0) - A[0] * (B[k] || 0)) / B[0]);
    }
    rows.push(nr);
  }
  return rows;
}
function cmul(x, y) { return [x[0] * y[0] - x[1] * y[1], x[0] * y[1] + x[1] * y[0]]; }
function csub(x, y) { return [x[0] - y[0], x[1] - y[1]]; }
function cdiv(x, y) { var d = y[0] * y[0] + y[1] * y[1] || 1e-300; return [(x[0] * y[0] + x[1] * y[1]) / d, (x[1] * y[0] - x[0] * y[1]) / d]; }
function cabs(x) { return Math.hypot(x[0], x[1]); }
function peval(a, z) { var r = [0, 0]; for (var i = 0; i < a.length; i++) { r = cmul(r, z); r = [r[0] + a[i], r[1]]; } return r; }
/* 与 control.js 里 rootsOf 同一套 Durand-Kerner（起始点半径取系数上界） */
function roots(c) {
  var a = c.map(function (v) { return v / c[0]; }), n = c.length - 1, bound = 1, i;
  for (i = 1; i < a.length; i++) bound = Math.max(bound, Math.abs(a[i]));
  var rs = [];
  for (i = 0; i < n; i++) { var ang = 2 * Math.PI * i / n + 0.5; rs.push([Math.cos(ang) * bound, Math.sin(ang) * bound]); }
  for (var it = 0; it < 600; it++) {
    for (i = 0; i < n; i++) {
      var num = peval(a, rs[i]), den = [1, 0];
      for (var j = 0; j < n; j++) if (j !== i) den = cmul(den, csub(rs[i], rs[j]));
      if (cabs(den) < 1e-14) den = [1e-14, 1e-14];
      rs[i] = csub(rs[i], cdiv(num, den));
    }
  }
  return rs;
}
function nrhp(a) { return roots(a).filter(function (z) { return z[0] > 1e-7; }).length; }
function changes(col) {
  var s = 0, p = 0;
  col.forEach(function (v) {
    if (Math.abs(v) < 1e-12) return;
    var q = v > 0 ? 1 : -1;
    if (p && q !== p) s++;
    p = q;
  });
  return s;
}
var bad = 0;
function chk(name, got, want) {
  if (got === want) { console.log('PASS ' + name + ' = ' + got); }
  else { console.log('FAIL ' + name + ' got=' + got + ' want=' + want); bad++; }
}

console.log('--- 1) 书上例 3.32：表必须逐格复现原书数组 ---');
var ex = [1, 4, 3, 2, 1, 4, 4];
var want = [[1, 3, 1, 4], [4, 2, 4], [2.5, 0, 4], [2, -2.4], [3, 4], [-76 / 15], [4]];
var got = routh(ex);
got.forEach(function (r, i) {
  var okRow = r.length === want[i].length && r.every(function (v, k) { return Math.abs(v - want[i][k]) < 1e-9; });
  if (!okRow) { console.log('FAIL row' + i + ' = [' + r.join(', ') + '] want [' + want[i].join(', ') + ']'); bad++; }
});
if (!bad) console.log('PASS 7 行全部与原书一致');
chk('例 3.32 第一列符号变化数', changes(got.map(function (r) { return r[0]; })), 2);
chk('例 3.32 真实右半平面根数（原书说 2）', nrhp(ex), 2);

console.log('');
console.log('--- 2) 特例②：整行全 0 → 辅助多项式是偶多项式，根关于原点对称 ---');
var az = routh([1, 1, 4, 4]);
chk('s^3+s^2+4s+4 的全 0 行下标', az.findIndex(function (r) { return r.every(function (v) { return Math.abs(v) < 1e-9; }); }), 2);
var above = az[1], A = [above[0], 0, above[1]];   // 上一行 [1,4] → s^2+4
chk('A(s) 的次数', A.length - 1, 2);
chk('A(s) 的根数', roots(A).length, 2);
console.log('    A(s) 的根 = ' + roots(A).map(function (z) { return z[0].toFixed(3) + (z[1] >= 0 ? '+' : '') + z[1].toFixed(3) + 'j'; }).join(', ') + '   （应为 ±2j，落在虚轴上）');
chk('A(s) 的根全部在虚轴上', roots(A).every(function (z) { return Math.abs(z[0]) < 1e-6; }), true);

console.log('');
console.log('--- 3) 特例①：扫样例，核对「跳过 0 会低估」等三个数 ---');
var stat = { n: 0, naiveLt: 0, epsOK: 0, dist: {} };
function check(a) {
  var rows = routh(a), hit = -1, i;
  for (i = 2; i < rows.length; i++) {
    if (Math.abs(rows[i][0]) < 1e-12 && rows[i].some(function (v) { return Math.abs(v) > 1e-9; })) { hit = i; break; }
  }
  if (hit < 0) return;
  var naive = changes(rows.map(function (r) { return r[0]; }));
  var eps = changes(routh(a, 1e-9).map(function (r) { return r[0]; }));
  var tr = nrhp(a);
  stat.n++;
  if (naive < tr) stat.naiveLt++;
  if (eps === tr) stat.epsOK++;
  stat.dist[tr] = (stat.dist[tr] || 0) + 1;
}
[5, 6].forEach(function (deg) {
  var idx = new Array(deg).fill(1);
  (function rec(k) {
    if (k > deg) return;
    for (var v = 1; v <= 5; v++) {
      idx[k] = v;
      if (k === deg) check([1].concat(idx)); else rec(k + 1);
    }
  })(0);
});
chk('样例数', stat.n, 10142);
chk('跳过 0 数法偏小的个数', stat.naiveLt, 10021);
chk('代 ε=1e-9 算对的个数', stat.epsOK, 7557);
console.log('    真实右半平面根数分布 = ' + JSON.stringify(stat.dist) + '  （应只有 2 和 4，都是偶数）');

console.log('');
console.log(bad === 0 ? 'ROUTH CHECK PASS' : 'ROUTH CHECK FAIL (' + bad + ' 项)');
process.exit(bad === 0 ? 0 : 1);
