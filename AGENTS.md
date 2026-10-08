# AGENTS.md — how content is produced in this repo

This file covers **output format only**. For what to include, see `CONTENT.md` — that file wins.

## One sum = exactly three things

When the user hands over a passage of his own notes ("my words"), the output is **only** these
three, in this order:

1. **His words** — quoted verbatim. Do not rewrite, translate, or polish.
   Use `<div class="ctl-quote"><span class="ctl-qlabel">你的原话</span>…</div>`
2. **A short correction** — fix and complete only what is wrong or missing in that one sentence.
   **Two or three sentences is enough** (`<div class="ctl-fix">`). No tables, no ①②③,
   no running on into a long essay.
3. **One interactive figure** — `<div data-primitive="…">`. The "what to look at" hint is emitted
   by the component itself. If a figure already shows the same thing, do **not** draw another one —
   change the angle (curve → ruler, number → picture) or reuse that figure.

**Pick the title yourself.**

**Nothing else.** No extra self-test, no extra "formal notation" fold-out, no extra tables or
charts, no extra sections — unless the user asks for them by name.

## Do not rewrite what is already published

The user said: **"以前已经写得就不改了，以后按这个原则"** — what is already written stays;
follow this from now on. This format rule applies **going forward only**. Long-form sections
already in the pages stay as they are; do not go back and trim them to match.

## Always self-check after editing

At minimum:

```
node kit/tools/check-assets.js      # component registration, CSS selectors, .spec targets, LaTeX escapes in JS strings
node kit/tools/math-check.js        # numeric kernel
node kit/tools/routh-check.js       # every number quoted on the §3.6 page
```

And **verify each individual edit actually succeeded** (`CONTENT.md` rule 4.6) — there was an
incident where an `edit` returned FAIL, the return value was ignored, and the commit message
claimed a change that had never been applied.

## Everything else

Terminology (敏感度 / sensitivity), geometry-first, traceable numbers, the four hard constraints,
the framework freeze, "organising is my job, not the user's", and "the rules file stops growing" —
all live in `CONTENT.md`.
