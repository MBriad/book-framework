/* kit/core/ui/ui.js — 注入页面外壳（页头/面包屑/搜索/暗色/打印），挂载交互组件。
   页面只需 <body data-ch="ch03"> + 正文 HTML + 一行 boot.js。 */
(function (global) {
  'use strict';
  var Ctl = global.Ctl = global.Ctl || {};
  var THEME_KEY = 'ctl-theme';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;';
    });
  }
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function chapterOf(id) {
    var list = (global.BOOK && global.BOOK.chapters) || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function breadcrumb(bookRoot) {
    var chId = document.body.getAttribute('data-ch');
    var parts = [];
    parts.push('<a href="' + esc(bookRoot) + 'index.html">' + esc((global.BOOK && global.BOOK.short) || '总览') + '</a>');
    var ch = chId ? chapterOf(chId) : null;
    if (ch) {
      parts.push(esc(ch.num + ' · ' + ch.title));
      var sec = document.body.getAttribute('data-sec');
      if (sec) parts.push(esc(sec));
    } else {
      var t = document.body.getAttribute('data-title');
      if (t) parts.push(esc(t));
    }
    return parts.join(' <span aria-hidden="true">/</span> ');
  }

  function applyTheme(t, toggleBtn) {
    document.documentElement.setAttribute('data-theme', t);
    try { global.localStorage.setItem(THEME_KEY, t); } catch (e) { /* file:// 下可能有隐私限制 */ }
    if (toggleBtn) toggleBtn.textContent = t === 'dark' ? '亮色' : '暗色';
    document.dispatchEvent(new CustomEvent('ctl:theme', { detail: { theme: t } }));
  }

  function buildSearch(bookRoot) {
    var bar = el('div', 'ctl-searchbar');
    var input = el('input');
    input.type = 'search';
    input.id = 'ctl-search';
    input.setAttribute('placeholder', '搜索全站…');
    input.setAttribute('aria-label', '搜索全站');
    var print = el('button', 'ctl-btn', '打印');
    print.type = 'button';
    print.addEventListener('click', function () { global.print(); });
    var png = el('button', 'ctl-btn', '导出 PNG');
    png.type = 'button';
    png.title = '把整个页面导出为一张 PNG（交互图按当前参数快照嵌入）';
    png.addEventListener('click', function () { exportPagePNG(png); });
    bar.appendChild(input);
    bar.appendChild(print);
    bar.appendChild(png);

    var box = el('div', 'ctl-results');
    box.id = 'ctl-results';
    box.hidden = true;

    function render(q) {
      var idx = global.SEARCH_INDEX || [];
      if (!q) { box.hidden = true; box.innerHTML = ''; return; }
      var needle = q.toLowerCase();
      var hits = [];
      for (var i = 0; i < idx.length && hits.length < 12; i++) {
        var e = idx[i];
        var hay = (e.t + ' ' + (e.k || '') + ' ' + (e.s || '')).toLowerCase();
        if (hay.indexOf(needle) >= 0) hits.push(e);
      }
      var html = hits.length
        ? '<ul>' + hits.map(function (e) {
            return '<li><a href="' + esc(bookRoot + e.p) + '">' + esc(e.t) +
              (e.s ? '<span class="ctl-hit">' + esc(e.s) + '</span>' : '') + '</a></li>';
          }).join('') + '</ul>'
        : '<div class="ctl-none">没有匹配项</div>';
      box.innerHTML = html;
      box.hidden = false;
    }
    input.addEventListener('input', function () { render(input.value.trim()); });
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') { input.value = ''; render(''); }
      if (ev.key === 'Enter') {
        var a = box.querySelector('a');
        if (a) global.location.href = a.getAttribute('href');
      }
    });
    return { bar: bar, box: box };
  }

  function buildLeftRail(bookRoot) {
    var rail = el('aside', 'ctl-rail ctl-rail-left ctl-noprint');
    rail.id = 'ctl-rail-left';
    rail.setAttribute('aria-label', '章节导航');
    rail.appendChild(el('p', 'ctl-rail-title', '章节'));
    var ul = el('ul', 'ctl-nav');
    var cur = document.body.getAttribute('data-ch');
    var home = el('li');
    home.innerHTML = '<a class="ctl-nav-link' + (cur ? '' : ' is-active') + '" href="' + esc(bookRoot) + 'index.html">' +
      '<span class="ctl-nav-num">—</span><span class="ctl-nav-name">总览</span></a>';
    ul.appendChild(home);
    ((global.BOOK && global.BOOK.chapters) || []).forEach(function (c) {
      var li = el('li');
      li.innerHTML = '<a class="ctl-nav-link' + (c.id === cur ? ' is-active' : '') + '" href="' +
        esc(bookRoot + 'sections/' + c.id + '.html') + '"><span class="ctl-nav-num">' + esc(c.num) +
        '</span><span class="ctl-nav-name">' + esc(c.title) + '</span></a>';
      ul.appendChild(li);
    });
    rail.appendChild(ul);
    return rail;
  }

  function buildToc(main) {
    var heads = main.querySelectorAll('h2, h3');
    if (heads.length < 2) return null;
    var rail = el('aside', 'ctl-rail ctl-rail-right ctl-noprint');
    rail.id = 'ctl-rail-toc';
    rail.setAttribute('aria-label', '本页目录');
    rail.appendChild(el('p', 'ctl-rail-title', '本页目录'));
    var ul = el('ul', 'ctl-toc');
    var links = [];
    for (var i = 0; i < heads.length; i++) {
      var h = heads[i];
      if (!h.id) h.id = 'sec-' + (i + 1);
      var li = el('li', 'ctl-toc-' + h.tagName.toLowerCase());
      var a = el('a');
      a.href = '#' + h.id;
      a.textContent = h.textContent;
      li.appendChild(a);
      ul.appendChild(li);
      links.push({ a: a, h: h });
    }
    rail.appendChild(ul);
    rail._links = links;
    return rail;
  }

  function spyToc(rail) {
    if (!rail || !rail._links) return;
    var links = rail._links, raf = null;
    function update() {
      raf = null;
      var best = 0;
      for (var i = 0; i < links.length; i++) if (links[i].h.getBoundingClientRect().top <= 110) best = i;
      for (i = 0; i < links.length; i++) links[i].a.className = (i === best ? 'is-active' : '');
    }
    global.addEventListener('scroll', function () {
      if (!raf) raf = global.requestAnimationFrame(update);
    }, { passive: true });
    update();
  }

  /* 下滑收起顶栏、上滑立刻恢复。顶部 140px 内不收起，避免刚进页面就抖动；
     抽屉打开时强制保持可见，否则窄屏上会够不到「目录」按钮。 */
  function wireHeaderCollapse() {
    var last = global.pageYOffset || 0, raf = null, hidden = false;
    function update() {
      raf = null;
      var y = global.pageYOffset || 0;
      var dy = y - last;
      if (Math.abs(dy) < 6) return;
      var shouldHide = dy > 0 && y > 140;
      if (document.body.classList.contains('ctl-rail-open')) shouldHide = false;
      if (shouldHide !== hidden) {
        hidden = shouldHide;
        document.body.classList.toggle('ctl-header-hidden', hidden);
      }
      last = y;
    }
    global.addEventListener('scroll', function () {
      if (!raf) raf = global.requestAnimationFrame(update);
    }, { passive: true });
  }

  /* ---------------- 整页 PNG 导出 ----------------
     html2canvas 在活文档里用 fillText 绘制，因此能直接使用已加载的 KaTeX 字体
     （foreignObject 那套在 SVG 隔离环境里拿不到 web 字体，公式会退化）。
     本地化引入，点击时才加载，不联网。 */
  function loadHtml2Canvas(cb) {
    if (global.html2canvas) return cb(null);
    var s = document.createElement('script');
    s.src = Ctl.kitCore + 'html2canvas.min.js';
    s.onload = function () { cb(global.html2canvas ? null : new Error('html2canvas 未暴露全局变量')); };
    s.onerror = function () { cb(new Error('加载 kit/core/html2canvas.min.js 失败')); };
    document.body.appendChild(s);
  }

  function pageFileName() {
    var t = ((global.BOOK && global.BOOK.short) ? global.BOOK.short + '-' : '') + (document.title || 'page');
    return t.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').slice(0, 80) + '.png';
  }

  function exportPagePNG(btn) {
    var old = btn.textContent;
    var wasHidden = document.body.classList.contains('ctl-header-hidden');
    if (wasHidden) document.body.classList.remove('ctl-header-hidden');   // 收起状态的顶栏不该进图
    btn.disabled = true;
    btn.textContent = '导出中…';
    function done() {
      btn.disabled = false;
      btn.textContent = old;
      if (wasHidden) document.body.classList.add('ctl-header-hidden');
    }
    function fail(msg) {
      done();
      global.alert('PNG 导出失败：' + msg + '\n可改用「打印 → 另存为 PDF」。');
    }
    loadHtml2Canvas(function (err) {
      if (err) return fail(err.message);
      var docEl = document.documentElement, body = document.body;
      var w = Math.max(docEl.scrollWidth, body.scrollWidth);
      var h = Math.max(docEl.scrollHeight, body.scrollHeight);
      var scale = 2;
      if (h * scale > 30000) scale = Math.max(1, 30000 / h);   // 浏览器画布尺寸上限保护
      global.html2canvas(body, {
        backgroundColor: global.getComputedStyle(body).backgroundColor || '#ffffff',
        width: w, height: h, windowWidth: w, windowHeight: h,
        scrollX: 0, scrollY: 0, scale: scale, logging: false,
        onclone: function (cloned) {
          // canvas 不会自己进图，换成当前内容的位图
          var srcC = document.querySelectorAll('canvas');
          var dstC = cloned.querySelectorAll('canvas');
          for (var i = 0; i < srcC.length && i < dstC.length; i++) {
            try {
              var cs = global.getComputedStyle(srcC[i]);
              var img = cloned.createElement('img');
              img.src = srcC[i].toDataURL('image/png');
              img.setAttribute('style', 'display:block;width:' + cs.width + ';height:' + cs.height +
                ';border-radius:' + cs.borderRadius);
              dstC[i].parentNode.replaceChild(img, dstC[i]);
            } catch (e) { /* 单张失败不阻断整页 */ }
          }
          // sticky 会让侧栏/顶栏在长图里错位，按文档流还原
          var fixed = cloned.querySelectorAll('.ctl-header, .ctl-rail');
          for (var k = 0; k < fixed.length; k++) fixed[k].style.position = 'static';
        }
      }).then(function (canvas) {
        var a = document.createElement('a');
        a.href = canvas.toDataURL('image/png');
        a.download = pageFileName();
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        done();
      }).catch(function (e) { fail(e && e.message ? e.message : String(e)); });
    });
  }

  function mountPrimitives() {
    var nodes = document.querySelectorAll('[data-primitive]');
    if (!nodes.length) return;
    if (!Ctl.Pack || !Ctl.Pack.get) return;
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var name = node.getAttribute('data-primitive');
      var factory = Ctl.Pack.get(name);
      if (!factory) {
        node.innerHTML = '<p class="ctl-note">未知组件：' + esc(name) + '</p>';
        continue;
      }
      try { factory(node); } catch (e) {
        node.innerHTML = '<p class="ctl-katex-error">组件 ' + esc(name) + ' 初始化失败：' + esc(e.message) + '</p>';
      }
    }
  }

  function typeset() {
    if (!global.renderMathInElement) return;
    try {
      global.renderMathInElement(document.body, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '\\[', right: '\\]', display: true },
          { left: '$', right: '$', display: false },
          { left: '\\(', right: '\\)', display: false }
        ],
        throwOnError: false,
        ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'option']
      });
    } catch (e) { /* 渲染失败不应阻断页面 */ }
  }

  Ctl.mount = function (opts) {
    var bookRoot = opts.bookRoot;
    var body = document.body;
    Ctl.kitCore = opts.kitCore;   // 懒加载本地库（html2canvas）时要用

    // 主题：先应用，避免暗色用户看到亮色
    var saved = null;
    try { saved = global.localStorage.getItem(THEME_KEY); } catch (e) { saved = null; }
    if (saved !== 'dark' && saved !== 'light') saved = 'light';

    var header = el('header', 'ctl-header');
    var inner = el('div', 'ctl-header-in');
    inner.appendChild(el('span', 'ctl-title',
      '<a href="' + esc(bookRoot) + 'index.html">' + esc((global.BOOK && global.BOOK.title) || 'Study Kit') + '</a>'));
    inner.appendChild(el('span', 'ctl-crumb', breadcrumb(bookRoot)));
    var themeBtn = el('button', 'ctl-btn ctl-noprint', '暗色');
    themeBtn.type = 'button';
    themeBtn.addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      applyTheme(cur, themeBtn);
    });
    inner.appendChild(themeBtn);
    header.appendChild(inner);

    var s = buildSearch(bookRoot);
    inner.appendChild(s.bar);   // 单行通栏：搜索与打印跟标题同一行

    var main = document.querySelector('main.ctl-main');
    if (main) {
      var bare = body.getAttribute('data-rails') === 'off';
      var layout = el('div', 'ctl-layout' + (bare ? ' ctl-layout-bare' : ''));
      main.parentNode.insertBefore(layout, main);
      layout.appendChild(main);
      if (!bare) {
        var left = buildLeftRail(bookRoot);
        layout.insertBefore(left, main);
        var toc = buildToc(main);
        if (toc) { layout.appendChild(toc); spyToc(toc); }
        var railBtn = el('button', 'ctl-btn ctl-only-narrow', '目录');
        railBtn.type = 'button';
        railBtn.setAttribute('aria-controls', 'ctl-rail-left');
        railBtn.addEventListener('click', function () {
          body.classList.toggle('ctl-rail-open');
          if (body.classList.contains('ctl-rail-open')) body.classList.remove('ctl-header-hidden');
        });
        inner.insertBefore(railBtn, themeBtn);
        left.addEventListener('click', function (ev) {
          if (ev.target && ev.target.closest && ev.target.closest('a')) body.classList.remove('ctl-rail-open');
        });
      }
      body.insertBefore(header, layout);
      body.insertBefore(s.box, layout);
    } else {
      body.insertBefore(header, body.firstChild);
      body.insertBefore(s.box, header.nextSibling);
    }
    if (!body.querySelector('footer.ctl-footer')) {
      var f = el('footer', 'ctl-footer ctl-noprint');
      f.style.cssText = 'max-width:var(--ctl-wide);margin:0 auto;padding:0 24px 40px;color:var(--ctl-muted);font-size:12px';
      f.textContent = '本页由 kit/core 生成 · ' + new Date().getFullYear();
      body.appendChild(f);
    }

    var prog = document.querySelector('[data-progress]');
    if (prog) {
      prog.innerHTML = ((global.BOOK && global.BOOK.chapters) || []).map(function (c) {
        var label = c.status === 'done' ? '已填' : c.status === 'partial' ? '部分' : '待填';
        return '<li><span class="ctl-ch">' + esc(c.num) + '</span>' +
          '<span class="ctl-nm"><a href="' + esc(bookRoot + 'sections/' + c.id + '.html') + '">' + esc(c.title) + '</a>' +
          (c.zh ? '<br><span class="ctl-note">' + esc(c.zh) + '</span>' : '') + '</span>' +
          '<span class="ctl-badge" data-status="' + esc(c.status) + '">' + label + '</span></li>';
      }).join('');
    }

    applyTheme(saved, themeBtn);
    typeset();
    mountPrimitives();
    wireHeaderCollapse();
  };
})(window);
