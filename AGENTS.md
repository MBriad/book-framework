# AGENTS.md — how content is produced in this repo

The single source of truth. (This file merges the former `AGENTS.md` + `CONTENT.md`.)

Written **for future me / the next session**. Sessions in this project are long; rules kept in
memory get lost. **When the user changes a rule, change it here.**

The repo builds an interactive HTML review site for a textbook. The user supplies his own notes,
one passage at a time; I turn each passage into a **sum**.

---

## 1. One semicolon = one sum

Split the user's note at the **semicolons**. Everything between two semicolons is one sum
(one unit of knowledge) — **not** an article.

> Counter-example: expanding four semicolon-separated topics into "5 h2 + 2 tables +
> 2 big widgets + 5 self-test questions". The user's word for it: 「太乱」.

## 2. A sum is exactly three things

Output **only** these three, in this order:

1. **His words** — quoted verbatim. Do not rewrite, translate, or polish.
   `<div class="ctl-quote"><span class="ctl-qlabel">你的原话</span>…</div>`
2. **A short correction** — fix and complete only what is wrong or missing in that one sentence.
   **Two or three sentences is enough** (`<div class="ctl-fix">`). No tables, no ①②③,
   no running on into a long essay. Symbols unified to Franklin's notation, gaps filled, errors fixed.
3. **One geometric / intuitive interactive figure + a one-or-two-sentence "what to look at" hint**
   — `<div data-primitive="…">`. The hint is **emitted by the component itself** (see 3.6) and
   says *where to look*, **never restating the formula**. If a figure already shows the same
   thing, do **not** draw another — change the angle (curve → ruler, number → picture) or reuse it.

**Pick the title yourself.**

**Nothing else.** No extra self-test, no extra "formal notation" fold-out, no extra tables or
charts, no extra sections — unless the user asks for them by name.

**Symbol matrices and formula tables are demoted below the figure**, shrunk to a small block, as
"the form to memorise". Get this order backwards and it reads as a mess.

**A geometric quantity and the time-domain quantity it governs must share one colour.** Saying
"σ sets the decay rate" is an *assertion*, not a demonstration — draw σ and the quantity it
governs (ts, the envelope) in the **same colour** so the correspondence is visible, and name the
colours in the legend and the readout so colour-blind readers can follow too.

> The user called this out on SUM 2: 「有体现 s 域的实部虚部夹角对应时域指标吗」 — at the time the
> figure only labelled the four geometric quantities; the correspondence lived entirely in prose,
> which is as good as not doing it.

**Never open a fourth section for "intuition".** If the figure isn't self-explanatory, **fix the
figure** (add labels, guides, put the key quantity on it) — don't append an essay underneath.
That is both "too messy" and where the bloat comes from.

## 3. Geometry / intuition first

Before building any interaction, ask: **is there a geometric or intuitive representation of this?**

- Prefer: block diagrams, integrator chains, plane plots (s-plane), vectors, time axes,
  geometric constructions
- Symbol matrices are **not** the star
- **Simulated waveforms still use canvas** — don't force DOM/SVG just to dodge canvas pitfalls

## 3.5 Every number must be traceable

**Every number** on a figure must be traceable on the figure itself or in the derivation chain.

> Counter-example: the Mason flow-graph branches were labelled only with the letters $a,b,c,e$,
> while the readout jumped straight to $P_1=16$ — the intermediate step $a=b=c=e=2$ never appeared.
> The user's words: 「这个 16 意义不明」.

How:
- **Put values on the figure** (`a = 2`, not `a`)
- **Give the full substitution in the readout** (`abce = 2×2×2×2 = 16`, not `16`)
- List intermediate quantities on their own row and say where they come from
- Show 「？」 for steps not yet reached; don't leak the answer early

## 3.6 Controls, copy and picture must agree

**Discrete parameters must not use a slider.** A slider can sit on a value that isn't in the
family at all — so the highlighted curve has to be computed on the fly, it isn't one of the grey
reference curves, and yet the readout prints that value. The user: 「这种离散值触发图的，
你换成选值不是滑块不是更好吗」. If it's discrete, use a **value picker** (`chips()`).

**Anything the copy promises must actually be drawn.** This happened: the additional-pole mode's
hint said "the violet dashed line is the no-extra-pole baseline", but the code only computed
`base` in non-pole modes — that dashed line did not exist. When you write a hint, glance back at
`draw()`.

**Anything that varies with the parameters or the mode — especially the figure hint — must be
re-emitted by the component in `refresh()`**, never hard-coded in the page. Hard-coded text is
wrong the moment you switch modes. This is also why `canonical-pair` once threw a ReferenceError
(it called `note()` without ever declaring `note`) — when a component throws, the page just goes
blank and never complains.

## 4. Page boundaries belong to the user

When to start a new page / a new subsection is **the user's call**. Do not split pages on your
own initiative.

## 4.5 Framework freeze

**No new interactive primitives** unless all three hold:

1. a **concrete sum** demands it;
2. the existing primitives genuinely cannot do it;
3. the user has **confirmed the geometry first**.

Current primitives (20): `step-2nd` `step-presets` `polezero-drag` `bode-cursor`
`root-locus` `mason-flow` `integrator-chain` `canonical-pair` `step-metrics`
`splane-geometry` `pole-catalog` `zero-pole-family` `nonmin-phase` `spec-region`
`routh` `sensitivity` `sens-band` `sens-freq` `ctrl-forms` `leadlag`.

Keep this list in step with `Ctl.Pack.register` calls — `check-assets.js` prints the real
list every run.

> Why: **content is the main body of this project.** Every component added costs the user another
> round of checking on the tablet, while the content grows by exactly zero words.
> It already happened: d3 was picked to draw figures in round 9, then canvas.js grew its own axes,
> and **it was never removed** — every page quietly downloaded 280 KB and nobody noticed.

Same for tooling: **only add a script if it prevents an error that has already happened.**

## 4.6 Verify every individual edit actually succeeded

**The incident**: an `edit` returned FAIL (I guessed a radius constant wrong and `old_string`
didn't match). I didn't check the return value, went on to edit the same group's readout and
legend, and then wrote "the angle was changed to θ" in the commit message — so **the figure and
the readout disagreed, and the commit message lied about the change**.

Rules:
- Print the return value of every batch of edits and **confirm them one by one**;
- **If a single one FAILED, stop the commit** and fix it first;
- The commit message **only states verified changes** — never "this should already be changed".

## 5. Primary sources first

- Pages the user photographs from the book **are the authority** — don't write criteria,
  definitions or coefficients from memory
- Confirmed Franklin conventions: rise time is $10\%\to90\%$ with $t_r\cong1.8/\omega_n$
  (Eq. 3.49); settling time uses the $\pm1\%$ band, $t_s\cong4.6/\zeta\omega_n$
- With no primary source, say 「我不确定」 rather than inventing a plausible-looking number

## 5.5 Organising is my job, not the user's

The user's words: **「我感觉我要爆炸了，组织文章好难」**.

How to cut sections, how to split sums, the order of the three parts, which page something goes
on, which figure sits on the table — **all of those decisions are mine**. The user supplies
**raw notes** and **corrections after the fact**; he should never be asked to take part in
structural design.

So the default way of working:
- **Write prose only; never add a figure unprompted.** When a new figure is needed, ask once,
  in **one** message, with the geometry described — if the answer is no, drop it.
- **I decide the structure**; at most the user says afterwards 「这里不对」.
- **The rules file stops growing**, unless the same pit is fallen into **again**.

If the user says "stop" or "I can't take any more", switch immediately to **plain-text mode**:
no components, no tooling, no new rules.

## 6. Do not

- Expand an outline into an article
- Fake an interaction just so every knowledge point has one (if it can't be done, say so)
- Add abstractions or configuration the user didn't ask for

---

## 7. After editing: self-check

At minimum:

```
node kit/tools/check-assets.js      # component registration, CSS selectors, .spec targets, LaTeX escapes in JS strings
node kit/tools/math-check.js        # numeric kernel
node kit/tools/routh-check.js       # every number quoted on the §3.6 page
```

Plus §4.6 above: confirm every edit landed before committing.

## 8. Do not rewrite what is already published

The user said: **「以前已经写得就不改了，以后按这个原则」** — what is already written stays;
follow this from now on. Format changes apply **going forward only**. Long-form sections already
in the pages stay as they are; do not go back and trim them to match.
