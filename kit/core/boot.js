/* kit/core/boot.js — 每页唯一的一行脚本。
   用法：<script src="…/kit/core/boot.js" data-book="../"></script>
   data-book = 从当前页面到「书根目录」的相对路径（index.html 用 "./"，sections/ 下用 "../"）。
   依赖按顺序注入；全部用 <script>/<link>，绝不使用 fetch/XHR（file:// 下会被 CORS 拦）。 */
(function () {
  'use strict';
  var self = document.currentScript;
  if (!self) return;
  var kitCore = self.src.replace(/[^/]*$/, '');
  var kitRoot = kitCore.replace(/core\/$/, '');
  var bookRoot = self.getAttribute('data-book') || './';
  if (bookRoot.charAt(bookRoot.length - 1) !== '/') bookRoot += '/';

  var CSS = [
    kitCore + 'site.css',
    kitCore + 'print.css',
    kitCore + 'katex/katex.min.css',
    kitRoot + 'packs/control/pack.css'
  ];
  var JS = [
    kitCore + 'katex/katex.min.js',
    kitCore + 'katex/contrib/auto-render.min.js',
    kitCore + 'd3.min.js',
    kitCore + 'lib/canvas.js',
    kitCore + 'ui/ui.js',
    kitRoot + 'packs/control/control.js',
    bookRoot + 'book.config.js',
    bookRoot + 'search-index.js'
  ];

  for (var i = 0; i < CSS.length; i++) {
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = CSS[i];
    document.head.appendChild(link);
  }

  var n = 0;
  function step() {
    if (n >= JS.length) {
      if (window.Ctl && window.Ctl.mount) window.Ctl.mount({ kitCore: kitCore, kitRoot: kitRoot, bookRoot: bookRoot });
      return;
    }
    var s = document.createElement('script');
    s.src = JS[n++];
    s.onload = step;
    s.onerror = step;
    document.body.appendChild(s);
  }
  step();
})();
