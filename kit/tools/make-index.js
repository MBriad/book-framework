#!/usr/bin/env node
/* kit/tools/make-index.js — 可选工具：扫描一本书的 HTML 页面，生成 search-index.js。
   不运行它页面也能正常打开（file:// 下搜索用的是上一次生成的索引，可能滞后）。
   用法：node kit/tools/make-index.js books/franklin */
'use strict';
const fs = require('fs');
const path = require('path');

const bookDir = process.argv[2];
if (!bookDir) {
  console.error('用法: node kit/tools/make-index.js books/<slug>');
  process.exit(1);
}

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function collect(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith('.html') && f.charAt(0) !== '_') out.push(f);
  }
  return out.sort();
}

const targets = [];
for (const f of collect(bookDir)) {
  if (f !== 'index.html') targets.push(['', f]);   // 书根的前置页（如 knowledge.html）
}
for (const f of collect(path.join(bookDir, 'sections'))) targets.push(['sections/', f]);
for (const f of collect(path.join(bookDir, 'samples'))) targets.push(['samples/', f]);

const entries = targets.map(([dir, f]) => {
  const html = fs.readFileSync(path.join(bookDir, dir, f), 'utf8');
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = stripTags(m ? m[1] : f) || f;
  const kw = html.match(/<meta\s+name="keywords"\s+content="([^"]*)"/i);
  const body = stripTags(html.replace(/<head[\s\S]*?<\/head>/i, ' '));
  return { t: title, p: dir + f, k: kw ? kw[1] : '', s: body.slice(0, 90) };
});

const target = path.join(bookDir, 'search-index.js');
fs.writeFileSync(target, 'window.SEARCH_INDEX = ' + JSON.stringify(entries, null, 2) + ';\n', 'utf8');
console.log('已写入 ' + target + '（' + entries.length + ' 条）');
