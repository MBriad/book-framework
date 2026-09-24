# Feedback Control of Dynamic Systems · 交互式复习站

一个「书 → 交互式 HTML」的**可复用框架**，以及用它做的第一本书（Franklin《Feedback Control of Dynamic Systems》）。

## 打开

**在线**（平板用这个）：<https://mbriad.github.io/book-framework/>
→ 进入书目后点 <https://mbriad.github.io/book-framework/books/franklin/index.html>

**本地**：双击 `books/franklin/index.html`。**不需要服务器，不需要构建。**

**局域网**（不想联网时）：

```
python -m http.server 8000
```

平板浏览器打开 `http://<电脑局域网IP>:8000/books/franklin/index.html`（首次需在 Windows 防火墙授权弹窗里放行）。

## 目录

| 路径 | 职责 |
|---|---|
| `kit/` | 可复用框架：通用版式、学科组件、第三方库本地化。**换书只改 `books/`，`kit/` 一行不用动。** |
| `books/franklin/` | 第一本书：章节骨架 + 技术样板页 |
| `books/_template/` | 空白书模板，复制它就能开新书 |

## 文档

框架用法、三层内容写法、交互原语表、Canvas 铁律、新增一本书的步骤 → `kit/README.md`

## 四条硬约束

1. `file://` 双击可开（不需要任何服务器）
2. 零构建步骤（看的时候不需要跑命令）
3. 零绝对路径
4. 整目录复制到任何地方都能跑

## 第三方库

`kit/core/katex/`（KaTeX 0.16.22，MIT）与 `kit/core/d3.min.js`（d3 7.9.0，ISC）为本地化副本，
保证断网可用；许可文件随包放在 `kit/core/` 内。
