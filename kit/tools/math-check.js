global.window = global;
require(require('path').join(__dirname, '..', 'packs', 'control', 'control.js'));
var M = global.Ctl.ControlMath;
function approx(name, got, want, tol) {
  var ok = Math.abs(got - want) <= tol;
  console.log((ok ? 'PASS ' : 'FAIL ') + name + '  got=' + got + '  want=' + want);
  return ok;
}
var all = true;

// 1) 二阶欠阻尼：ζ=0.2, ωn=2  → den = s^2+0.8s+4, 理论超调 52.66%
var den1 = M.polyFromRoots([[-0.4, 2 * Math.sqrt(0.96)], [-0.4, -2 * Math.sqrt(0.96)]]);
console.log('den1 =', JSON.stringify(den1));
all &= approx('den1 a1', den1[1], 0.8, 1e-9);
all &= approx('den1 a2', den1[2], 4, 1e-9);
var m1 = M.stepMetrics(M.stepFromTF(den1, [4], 12, 12 / 2000), 1);
all &= approx('ζ=0.2 超调(%)', m1.overshoot, 52.66, 0.05);
all &= approx('ζ=0.2 终值', m1.final, 1, 1e-6);
all &= approx('ζ=0.2 ts(2%)', m1.ts, Math.log(50) / 0.4, 0.2);

// 2) 临界阻尼 ζ=1 → den = (s+2)^2
var den2 = M.polyFromRoots([[-2, 0], [-2, 0]]);
console.log('den2 =', JSON.stringify(den2));
var m2 = M.stepMetrics(M.stepFromTF(den2, [4], 12, 12 / 2000), 1);
all &= approx('ζ=1 超调(%)', m2.overshoot, 0, 0.05);

// 3) 无阻尼 ζ=0 → 1-cos(2t)，峰值应为 2
var den3 = M.polyFromRoots([[0, 2], [0, -2]]);
console.log('den3 =', JSON.stringify(den3));
var m3 = M.stepMetrics(M.stepFromTF(den3, [4], 12, 12 / 2000), 1);
all &= approx('ζ=0 峰值', m3.peak, 2, 0.01);

// 4) Durand-Kerner：s^3+3s^2+2s+6 的根应为 -3, ±j√2
var r4 = M.rootsOf([1, 3, 2, 6]).map(function (z) { return [Math.round(z[0] * 1e6) / 1e6, Math.round(z[1] * 1e6) / 1e6]; });
r4.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
console.log('roots =', JSON.stringify(r4));
all &= approx('临界K=6 根1', r4[0][0], -3, 1e-5);
all &= approx('临界K=6 根2 实部', r4[1][0], 0, 1e-5);
all &= approx('临界K=6 根2 虚部', Math.abs(r4[1][1]), Math.SQRT2, 1e-5);

// 5) Bode：G=30/(s(s+1)(s+10))，ωc≈1.62、PM≈22°、GM≈11 dB、ω180=√10
var poles = [[0, 0], [-1, 0], [-10, 0]];
function dbAt(w) { var g = M.tfEval(30, [], poles, [0, w]); return 20 * Math.log10(Math.sqrt(g[0] * g[0] + g[1] * g[1])); }
function phAt(w) { var g = M.tfEval(30, [], poles, [0, w]); return Math.atan2(g[1], g[0]) * 180 / Math.PI; }
var prev = null, sp = [];
for (var i = 0; i <= 2000; i++) {
  var w = 0.1 * Math.pow(1000, i / 2000), ph = phAt(w);
  if (prev !== null) { while (ph - prev > 180) ph -= 360; while (prev - ph > 180) ph += 360; }
  prev = ph; sp.push([w, dbAt(w), ph]);
}
function cross(k) {
  for (var i = 1; i < sp.length; i++) {
    var a = k === 'm' ? sp[i - 1][1] : sp[i - 1][2] + 180, b = k === 'm' ? sp[i][1] : sp[i][2] + 180;
    if ((a <= 0 && b >= 0) || (a >= 0 && b <= 0)) { var t = a / (a - b); return sp[i - 1][0] * Math.pow(sp[i][0] / sp[i - 1][0], t); }
  }
  return null;
}
var wc = cross('m'), w180 = cross('p');
all &= approx('ωc', wc, 1.585, 0.005);
all &= approx('相位裕度(°)', 180 + phAt(wc), 23.3, 0.3);
all &= approx('ω180', w180, Math.sqrt(10), 0.02);
all &= approx('增益裕度(dB)', -dbAt(w180), 11.3, 0.4);

console.log(all ? 'ALL PASS' : 'SOME FAILED');