# kit —— 可复用的「书 → 交互式 HTML 复习站」框架

内容与框架分离。换一本书时 **只改 `books/<slug>/`，`kit/` 一行都不用动**。

## 目录职责

| 路径 | 职责 |
|---|---|
| `kit/core/` | 通用能力：页头、面包屑、全站搜索、暗色切换、打印、自测样式、公式渲染（KaTeX）、Canvas 底座 |
| `kit/packs/<学科>/` | 学科组件。当前只有 `control`：`step-2nd` `bode-cursor` `polezero-drag` `step-presets` `root-locus` |
| `kit/tools/` | 可选的命令行工具（不跑也能看页面） |
| `books/<slug>/` | 一本书：配置 + 每节一个 HTML + 搜索索引 |
| `books/_template/` | 空白书模板 |

## 四条硬约束（不要破坏）

1. 双击 `file://` 直接可开，不需要任何服务器。
2. 零构建步骤——看的时候不需要跑命令。
3. 零绝对路径。
4. 整个目录复制到任何地方都能跑。

因此：**绝不使用 `fetch` / `XHR`**（`file://` 下会被 CORS 拦），一律用 `<script src>` / `<link href>`。

## 写一节页面

一节 = 一个 HTML 文件，正文写在 `<main class="ctl-main">` 里，末尾一行脚本：

```html
<body data-ch="ch03">
<main class="ctl-main">
  <h1>Ch3 · Dynamic Response</h1>
  ...正文...
</main>
<script src="../../../kit/core/boot.js" data-book="../"></script>
</body>
```

`data-book` 是从当前页面到书根目录的相对路径（`index.html` 用 `"./"`，`sections/` 下用 `"../"`）。
页头、面包屑、搜索框、暗色开关、打印按钮，以及**左栏章节导航与右栏本页目录**，全部由 `boot.js` 注入。

- 右栏目录自动扫描本页的 `<h2>/<h3>` 生成（不足 2 个标题时整栏不出现），随滚动高亮；写正文时不用维护它。
- 左栏由 `book.config.js` 的 `chapters` 生成，当前页自动高亮。
- 版面：栅格最宽 1440px（`--ctl-wide`），两条侧栏用 `clamp()` 往边缘推，正文列自己 `margin:0 auto` 居中并限宽 780px（`--ctl-read`）。改这两个变量就能整体调阅读区宽度。
- 宽度 ≤1200px 隐藏右栏；≤940px 左栏折叠为顶栏「目录」按钮弹出的抽屉；打印时两栏都不输出。
- 想让某页不带侧栏（例如总览页正文本身已有章节表）：给 `<body>` 加 `data-rails="off"`。
- 顶栏是**单行通栏**（高度 56px，内容贴视口两侧，不受 `--ctl-wide` 约束），依次为：标题 / 面包屑 / 目录(窄屏) / 暗色 / 搜索+打印。正文与侧栏仍受 `--ctl-wide` 约束。
- 顶栏下滑时收起、上滑时恢复（顶部 140px 内不收起；抽屉打开时强制可见；打印时不受影响）。收起状态由 `body.ctl-header-hidden` 控制。
- **页尾翻章**：序列 = `front` + `chapters`（与左栏同源），每本书自动获得。样式参考 d2l.ai 的底部翻页：
  箭头在外、章名在内、下一节用强调色；打印时隐藏（`ctl-chnav`）。
- 曾做过左右滑动翻页并已实测可用，但**用起来别扭**，且那份"控件黑名单"是永久维护耦合（每加一个交互组件都要登记），
  已整体移除。**结论：翻页用按钮，不用手势。**
- **竖屏平板**：抽屉展开时会盖一层遮罩（`.ctl-rail-backdrop`），**点屏幕任意处即收起**，同时挡住下层链接的误触；
  按 Esc 也能收起。窗口大于 940px 时遮罩自动失效。

## 前置页（书开头）

每本书可以在 `book.config.js` 里声明若干**前置页**，它们排在左栏「总览」之后、各章之前：

```js
front: [
  { id: 'knowledge', title: '知识点速查', zh: '做题时卡住就来这查' }
]
```

页面文件放在书根（`books/<slug>/knowledge.html`），`<body data-ch="knowledge">` 与 `id` 对上即可在左栏高亮。

**知识点速查页的写法**：每条知识点一个 `<h3>`。右侧目录本来就自动扫描 `<h2>/<h3>`，所以跳转索引是白捡的；
顶栏全站搜索也能搜到（记得跑一次 `make-index.js`）。给页面的 `<main>` 加 `ctl-kp-page` 类，`<h3>` 会密排、
不再像大标题。

## 三层内容

| 层 | 写法 |
|---|---|
| 你的内容 | 普通正文；符号与记号统一到原书 |
| 我的补充 | `<div class="ctl-supp"><span class="ctl-tag" data-src="补自 Franklin §3.4">补</span>…</div>` |
| 我改过的错 | `<div class="ctl-fix"><strong>已修正：</strong><span class="ctl-old">原文</span> → 改为…</div>` |
| 缺口（未覆盖） | `<div class="ctl-gap">缺口：未覆盖 §x.y</div>` |
| 折叠推导 / 代码 | `<details class="ctl-fold"><summary>标题</summary>…</details>` |
| 自测 | `<div class="ctl-test"><h4>自测（补）</h4><ol><li>题<details><summary>答案</summary>…</details></li></ol></div>` |

## 导出（打印 / PDF）

顶栏一个按钮，由 `kit/core/ui/ui.js` 注入：

- **打印 / PDF** → 走 `print.css`：隐藏顶栏、左右侧栏与所有交互控件；交互图在 `beforeprint` 里按**当前参数**
  3 倍重绘，图下保留数值表。在打印对话框里选「另存为 PDF」即可存档。

逐图 PNG 由各交互组件自带的「导出 PNG」按钮提供（原生 `canvas.toDataURL()`，3 倍分辨率，与打印走同一套渲染路径）。

> 曾经试过用 html2canvas 做「整页 PNG 导出」，已移除：它**不支持 CSS Grid**，且对 `<details>`、列表与
> sticky 的渲染会压叠错位，产出不可用。同样的目的由打印/PDF 达成，且 PDF 是矢量文字、可选中可搜索。
## 交互组件

放一个空容器，组件自己填充：

```html
<div data-primitive="step-2nd" data-title="拖 ζ 与 ωn"></div>
```

| 原语 | 作用 |
|---|---|
| `step-2nd` | 参数滑块：二阶系统 ζ / ωn → 阶跃响应 + 指标（仿真值 vs 理论值） |
| `bode-cursor` | 游标联动：拖动频率游标（或拖曲线）→ 幅频/相频同步读数 + ωc + 相位裕度 + 增益裕度 |
| `polezero-drag` | 零极点拖拽：s 平面拖极点/零点 → 阶跃响应实时重算 |
| `step-presets` | 情形切换：四种阻尼对比 |
| `root-locus` | 根轨迹：拖 K → 闭环极点移动 |

约定：**每个小节 ≥1 个重交互，小节内每个知识点 ≥1 个轻交互**。

## Canvas 的五条铁律（组件里已经处理好，新组件请照做）

1. 按 `devicePixelRatio` 放大画布再缩放绘制（否则高清屏发虚）。
2. 打印前 `beforeprint` 按 3 倍重绘（否则印出来是低清）。
3. canvas 设 `touch-action:none`（否则触屏拖拽会带着页面滚）。
4. 主题切换要显式重绘（canvas 不是 DOM，颜色不会自动变）。
5. **canvas 只画线**；轴标签、读数、图例用 DOM（否则文字不可选中、不进搜索索引、打印发虚）。
   线条与坐标轴统一走 `Ctl.Fig.create(canvas, spec)`。

## 新增一本书

1. 复制 `books/_template/` 为 `books/<slug>/`，改 `book.config.js`（书名、章节表、状态、`front` 前置页）。
2. 删掉模板里多余的章节页，为每一节建一个 `sections/<id>.html`。
3. 生成搜索索引：`node kit/tools/make-index.js books/<slug>`（可选）。
4. 浏览器双击 `books/<slug>/index.html`。

要把整本书发给别人：把 `kit/` 和 `books/<slug>/` 一起复制（`books/<slug>` 引用了 `../../kit`）。

## 数值内核自检

```
node kit/tools/math-check.js
```

对拍解析解：二阶超调量、无阻尼峰值、临界 K 的闭环极点、Bode 的 ωc / 相位裕度 / 增益裕度。改动 `packs/control` 的数值代码后跑一遍。