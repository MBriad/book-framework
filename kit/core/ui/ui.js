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
    var b = global.BOOK || {};
    var list = (b.front || []).concat(b.chapters || []);
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function breadcrumb(bookRoot) {
    var chId = document.body.getAttribute('data-ch');
    var parts = [];
    parts.push('<a href="' + esc(bookRoot) + 'index.html">' + esc((global.BOOK && global.BOOK.short) || '总览') + '</a>');
    var ch = chId ? chapterOf(chId) : null;
    if (ch) {
      parts.push(esc((ch.num ? ch.num + ' · ' : '') + ch.title));
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
    var print = el('button', 'ctl-btn', '打印 / PDF');
    print.type = 'button';
    print.addEventListener('click', function () { global.print(); });
    bar.appendChild(input);
    bar.appendChild(print);

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
    ((global.BOOK && global.BOOK.front) || []).forEach(function (p) {
      var fli = el('li');
      fli.innerHTML = '<a class="ctl-nav-link' + (p.id === cur ? ' is-active' : '') + '" href="' +
        esc(bookRoot + p.id + '.html') + '"><span class="ctl-nav-num">—</span><span class="ctl-nav-name">' +
        esc(p.title) + '</span></a>';
      ul.appendChild(fli);
    });
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

  /* 翻章序列 = 前置页 + 各章（与左栏同源），每本书自动获得 */
  function navContext() {
    var cur = document.body.getAttribute('data-ch');
    if (!cur) return null;
    var b = global.BOOK || {};
    var list = (b.front || []).concat(b.chapters || []);
    var idx = -1;
    for (var i = 0; i < list.length; i++) if (list[i].id === cur) idx = i;
    return idx < 0 ? null : { b: b, list: list, idx: idx };
  }

  function hrefOf(bookRoot, ctx, p) {
    var f = ctx.b.front || [], isFront = false;
    for (var i = 0; i < f.length; i++) if (f[i].id === p.id) isFront = true;
    return bookRoot + (isFront ? p.id + '.html' : 'sections/' + p.id + '.html');
  }

  function navTargets(bookRoot) {
    var ctx = navContext();
    if (!ctx) return null;
    var t = {
      prev: ctx.idx > 0 ? hrefOf(bookRoot, ctx, ctx.list[ctx.idx - 1]) : null,
      next: ctx.idx < ctx.list.length - 1 ? hrefOf(bookRoot, ctx, ctx.list[ctx.idx + 1]) : null
    };
    return (t.prev || t.next) ? t : null;
  }

  /* 左右滑动翻页。四重护栏缺一不可：
     ① 只认单指；
     ② 起点在交互控件内不触发（canvas 拖拽、range 滑杆、代码块、抽屉）；
     ③ 起点距左右边缘 30px 内不触发（避开 iPadOS 的边缘返回手势）；
     ④ 位移 > 60px 且水平位移 > 垂直位移 2 倍（斜着划不算）。 */
  function wireSwipeNav(targets) {
    var MIN = 60, EDGE = 30, RATIO = 2;
    var x0 = 0, y0 = 0, tracking = false;
    var BLOCK = 'canvas, pre, input, textarea, select, button, .ctl-rail, .ctl-rail-backdrop, [data-primitive], .ctl-seg';
    function eligible(target) {
      if (!target || !target.closest) return false;
      if (target.closest(BLOCK)) return false;
      if (document.body.classList.contains('ctl-rail-open')) return false;
      return true;
    }
    document.addEventListener('touchstart', function (e) {
      tracking = false;
      if (e.touches.length !== 1) return;
      var t = e.touches[0];
      if (t.clientX < EDGE || t.clientX > global.innerWidth - EDGE) return;
      if (!eligible(e.target)) return;
      x0 = t.clientX; y0 = t.clientY; tracking = true;
    }, { passive: true });
    document.addEventListener('touchcancel', function () { tracking = false; }, { passive: true });
    document.addEventListener('touchend', function (e) {
      if (!tracking) return;
      tracking = false;
      var t = e.changedTouches && e.changedTouches[0];
      if (!t) return;
      var dx = t.clientX - x0, dy = t.clientY - y0;
      if (Math.abs(dx) < MIN || Math.abs(dx) < Math.abs(dy) * RATIO) return;
      var go = dx < 0 ? targets.next : targets.prev;   // 向左划 = 下一节
      if (go) global.location.href = go;
    }, { passive: true });
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
        // 竖屏平板上最常用：点屏幕任意处收起目录。
        // 用一层遮罩而不是「点外面就关」，否则会顺带点到下面的链接。
        var backdrop = el('div', 'ctl-rail-backdrop ctl-noprint');
        backdrop.addEventListener('click', function () { body.classList.remove('ctl-rail-open'); });
        body.appendChild(backdrop);
        document.addEventListener('keydown', function (ev) {
          if (ev.key === 'Escape') body.classList.remove('ctl-rail-open');
        });
        global.addEventListener('resize', function () {
          if (global.innerWidth > 940) body.classList.remove('ctl-rail-open');
        });
      }
      body.insertBefore(header, layout);
      body.insertBefore(s.box, layout);
    } else {
      body.insertBefore(header, body.firstChild);
      body.insertBefore(s.box, header.nextSibling);
    }
    var targets = navTargets(bookRoot);
    if (targets && main) {
      main.appendChild(el('p', 'ctl-swipe-hint ctl-noprint', '← 左右滑动可翻页'));
      wireSwipeNav(targets);
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
