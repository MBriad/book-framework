#!/usr/bin/env node
/* kit/tools/check-assets.js — 静态自检，补上「我无法渲染」这个缺口。

出过的事故：删一个组件时按标记切 pack.css，把后面两个组件的样式一起切掉了，
SVG 失去 fill:none 被填成黑块——而 node --check 只看 JS 语法，完全查不出来。
用法：node kit/tools/check-assets.js
*/
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', '..');

const controlJs = fs.readFileSync(path.join(root, 'kit', 'packs', 'control', 'control.js'), 'utf8');
const packCss = fs.readFileSync(path.join(root, 'kit', 'packs', 'control', 'pack.css'), 'utf8');

let bad = 0;

// 1) 页面里用到的每个 data-primitive 都必须已注册
const registered = new Set([...controlJs.matchAll(/register\('([^']+)'/g)].map(m => m[1]));
const used = new Map();
(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (f.endsWith('.html')) {
      const t = fs.readFileSync(p, 'utf8');
      for (const m of t.matchAll(/data-primitive="([^"]+)"/g)) {
        if (!used.has(m[1])) used.set(m[1], []);
        used.get(m[1]).push(path.relative(root, p));
      }
    }
  }
})(path.join(root, 'books'));

for (const entry of used) {
  if (!registered.has(entry[0])) {
    console.log('✗ 页面用了未注册的组件: ' + entry[0] + '  ← ' + entry[1].join(', '));
    bad++;
  }
}

// 2) 组件依赖的样式选择器必须都在 pack.css
const REQUIRED = [
  '.ctl-mason .br', '.ctl-mason .nd', '.ctl-mason .nl', '.ctl-mason .gl',
  '.ctl-ichain .ibox', '.ctl-ichain .ibl', '.ctl-ichain .ind', '.ctl-ichain .il',
  '.ctl-cpair svg'
];
for (const sel of REQUIRED) {
  if (!packCss.includes(sel)) { console.log('✗ pack.css 缺样式: ' + sel); bad++; }
}

// 3) 描边用的 SVG 路径必须显式 fill:none，否则会被填成黑块
if (!/\.ctl-mason \.br\{[^}]*fill:none/.test(packCss)) {
  console.log('✗ .ctl-mason .br 缺 fill:none —— 弧线与圆点会被填成黑块');
  bad++;
}

// 4) 调了 scaffold() 又手写标题 → 标题会重复（scaffold 内部已经加过一次）
for (const b of controlJs.matchAll(/register\('([^']+)'[\s\S]*?(?=register\('|Ctl\.ControlMath)/g)) {
  if (b[0].includes('scaffold(el)') && b[0].includes("'ctl-widget-title'")) {
    console.log('✗ ' + b[1] + '：调了 scaffold() 又手写 ctl-widget-title —— 标题会重复显示两次');
    bad++;
  }
}

// 5) 信息性报告：注册了但没有任何页面在用的组件（腐烂预警，不算失败）
const unused = [...registered].filter(n => !used.has(n));
console.log('已注册组件: ' + [...registered].join(', '));
console.log('页面在用组件: ' + [...used.keys()].join(', '));
if (unused.length) console.log('⚠ 注册但无人使用: ' + unused.join(', ') + '（不是错误，但要盯住）');
console.log(bad === 0 ? 'ASSET CHECK PASS' : 'ASSET CHECK FAIL (' + bad + ' 项)');
process.exit(bad === 0 ? 0 : 1);
