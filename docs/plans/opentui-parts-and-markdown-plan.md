# Plan: OpenTUI engine — chronological parts ordering + native markdown

> **⚠️ FILE TARGETS SUPERSEDED (2026-06-08).** This plan targets the React `ui-tui-opentui/`
> files (`eventAdapter.ts`, `app.tsx`, `messageLine.tsx`, …). Per `opentui-rewrite-v4-spec.md` the
> build is now **Solid + Effect-at-boundary, pure scratch** — those React files are reference-only.
> The DESIGN survives intact (ordered `parts[]` model + native `<markdown>` + the gotchas) and is
> folded into v4 **§7**; treat this doc as the detailed design rationale, but implement against the
> v4 Solid package layout, not these file paths.

**Status:** PREP / BLOCKED on a clean worktree. A parallel agent is actively
editing the exact files this plan rewrites (`eventAdapter.ts`, `app.tsx`,
`transcript.tsx`, `messageLine.tsx`, `demo.tsx`, `check.sh`, `model.ts`) — see
the uncommitted BUG-3 "session resume + scroll-clip" workstream. Do NOT start
editing until those land/commit and `git status` is clean. This doc captures the
full design so execution is mechanical once unblocked.

**Source handoff:** `~/.hermes/tmp/handoff-opentui-md-ordering-*.md`.
**Recon (authoritative):** `opentui` skill →
`references/real-world-patterns-opencode.md` §5 (markdown) + §6 (parts ordering),
plus `references/docs/components/{markdown,code}.mdx`. opencode repo at
`~/github/opencode/packages/tui` is the proven reference.

**Priority:** Feature 2 (parts model — structural) FIRST, then Feature 1
(native markdown) plugs into the new `text` part. They interlock.

---

## Why (the confirmed bug)

`eventAdapter.ts` uses a flat `Msg[]` model that DISCARDS chronology within a
turn:
- `message.delta` appends ALL assistant text into ONE in-flight bubble
  (`liveIdx`).
- `tool.start` attaches the name to that bubble's `tools[]` side-array;
  `tool.complete` pushes a SEPARATE `role:'tool'` Msg AFTER the bubble.
- `reasoning.delta` appends to the bubble's `thinking` side-FIELD (unpositioned).

→ Real model loop `text → tool → thinking → tool → text` collapses to "one text
bubble, then all tools dumped below" — the "tool calls show below the message /
chain not followed" symptom. Ink does it right via an ordered
`segmentMessages[]` + `flushStreamingSegment()` (turnController.ts). opencode
does it right via one message = ordered `parts[]` + a single dispatch loop. We
mirror opencode (cleaner, and it makes streaming markdown natural).

---

## Feature 2 — ordered parts model

### 2.1 Data model (`model.ts`)

Add a discriminated-union `Part` and an assistant `Turn`. Keep the existing
`ToolMsg` STRUCTURED fields (BUG-2) — the `tool` part reuses them, don't
re-derive.

```ts
export type PartId = string // monotonic sortable: `${turnSeq}:${partSeq}`

export interface TextPart    { type: 'text';      id: PartId; text: string }
export interface ReasoningPart { type: 'reasoning'; id: PartId; text: string }
export interface ToolPart    {
  type: 'tool'; id: PartId
  name: string
  state: 'running' | 'complete'
  resultText?: string   // envelope-stripped (engine/toolOutput.ts)
  summary?: string
  error?: string
  lineCount?: number
}
export type Part = ReasoningPart | TextPart | ToolPart

// An assistant turn carries ordered parts; user/system/tool-on-resume stay flat
// Msgs for back-compat with the resume mapper + FakeGateway seed.
export interface AssistantTurn { role: 'assistant'; id: string; parts: Part[]; streaming?: boolean }
```

**Decision — keep `Msg[]` OR go full turn model?** opencode uses one message
with `parts[]`. Our transcript is `Msg[]` with `role`. Cleanest minimal change
that preserves user/system/resume rows:
- Introduce an `AssistantTurn` row type alongside `Msg` (a union the transcript
  renders), OR
- Extend `Msg` with an optional `parts?: Part[]` on assistant rows and render
  parts when present, else fall back to `text` (keeps user/system/resume Msgs
  untouched, and the resume tool-row mapping the parallel agent just wrote).

**Recommended: extend `Msg` with `parts?: Part[]`** — least disruptive to the
resume mapper (`loadTranscript`) and FakeGateway seed, which produce plain
text/tool Msgs that render fine as today. Only the LIVE assistant turn uses
`parts`. This also means the standalone `role:'tool'` resume rows keep working.

### 2.2 eventAdapter rewrite (core change)

Replace the `liveIdx` + `tools[]` + `thinking` side-field model with ordered
parts on the in-flight assistant Msg. Track `turnSeq` (++ per `message.start`)
and `partSeq` (++ per pushed part) for monotonic ids.

- `message.start` → push `{ role:'assistant', text:'', parts:[], streaming:true }`;
  set `liveIdx`; `turnSeq++`, reset `partSeq`.
- `message.delta` → on the live turn: if the LAST part isn't an open `text`
  part, PUSH a new `text` part; else append the chunk to it. (This is the
  segment-flush equivalent — a tool/reasoning between text deltas forces a new
  text part after it, giving correct interleave.)
- `tool.start` → PUSH a `tool` part `{state:'running', name}`. Remember its
  `id` (or find by name+running) so `tool.complete` updates THE SAME part.
- `tool.complete` → update that tool part in place: `state:'complete'` +
  structured fields (`stripToolEnvelope(result_text)`, `summary`, `error`,
  `lineCount`) — reuse the exact BUG-2 logic already in `tool.complete`.
  **Do NOT push a separate `role:'tool'` Msg anymore** (that was the dump-below
  bug). Note: if `message.start` never fired before a tool (rare), open a turn
  first via an `ensureLiveTurn()` helper.
- `reasoning.delta`/`thinking.delta` → if the last part isn't an open
  `reasoning` part, push one; else append. (positioned, not a side-field).
- `message.complete` → set the live turn `streaming:false`; finalize the last
  `text` part's text from `p.text ?? p.rendered` if present; `liveIdx = -1`.

**Ordering resilience (optional but recommended):** our stream is a single
ordered NDJSON pipe, so insertion order suffices (opencode v2). If we want the
v1 robustness, port the 12-line binary `search()` over `part.id`
(`opencode .../context/sync.tsx:42-53`) and splice — but only if we observe
out-of-order events. Start with insertion order; add binary-insert only if
needed.

**`loadTranscript` (resume):** settled turns can stay single-text Msgs (no
`parts`) — fine, they render via the text fallback. The parallel agent's
standalone tool-row mapping for resumed `{name,context}` rows is preserved
(those are historical, already in order). No change needed beyond not breaking
it.

### 2.3 Render loop

- `messageLine.tsx`: when an assistant `Msg` has `parts`, render
  `parts.map(p => { const C = PART_MAPPING[p.type]; return C && <C key={p.id} .../> })`
  inside the assistant body column. Tool/reasoning parts render as inline flex
  siblings BETWEEN text parts → correct interleave. Stable `key={part.id}` stops
  the streaming `<markdown>` above a new tool part from remounting/
  re-tokenizing (preserves Feature-1 no-flicker).
- `PART_MAPPING = { text: TextPart, reasoning: ReasoningPart, tool: ToolPart }`.
  - `TextPart` → `<Markdown>` (Feature 1).
  - `ToolPart` → REUSE the existing `ToolRow` (BUG-2 compact render) — extract
    it so both the part renderer and any legacy `role:'tool'` Msg can use it.
  - `ReasoningPart` → a dim `<code filetype="markdown" streaming>` or a muted
    `<Markdown>` variant (lighter styling).
- Keep ONE `<scrollbox>` (transcript.tsx) — do NOT write to scrollback
  (opencode §2: viewport clips growing output; scrollback-writing corrupts).

### 2.4 Verify (Feature 2)

New headless `demo.parts.tsx` (mirror demo.prompts.tsx style): drive a synthetic
ordered stream `message.start → delta("explaining…") → tool.start(ls) →
tool.complete → delta("done.") → message.complete`, render, and assert via
`captureCharFrame` that the tool row appears BETWEEN the two text blocks (string
index of tool name is > index of "explaining" and < index of "done"). Add as a
HARD gate in check.sh. Also drive text→reasoning→text and assert order.
LIVE in tmux: prompt "explain, then ls, then summarize" → tool renders inline,
not at the bottom.

---

## Feature 1 — native markdown (replace the hand-rolled parser)

### 1.1 Delete `markdown.tsx`'s parser; wrap `<markdown>`

`components/markdown.tsx` is currently a hand-rolled `**bold**/*italic*/`code`/
bullets` parser. Replace with a thin wrapper around the native
`MarkdownRenderable` (`<markdown>`), keeping the same `{ text, t, width }` props
so `messageLine.tsx` / the `TextPart` renderer don't change call-sites.

```tsx
export function Markdown({ text, t, width, streaming }: {...}) {
  return (
    <markdown
      content={text}
      syntaxStyle={syntaxStyleFor(t)}
      streaming={streaming ?? false}
      internalBlockMode="top-level"
      tableOptions={{ style: 'grid' }}
      conceal
      fg={t.color.text}
      // width via wrapping <box style={{ width }}> if <markdown> doesn't take width directly
    />
  )
}
```

### 1.2 One `SyntaxStyle` from `theme.ts`, memoized

Build ONE `SyntaxStyle.fromStyles({...})` per theme (mirror opencode's
`syntax()`), memoized at module scope keyed by theme (theme is a singleton today,
so a module-level const is fine; use a `WeakMap<Theme, SyntaxStyle>` if themes
multiply). Use `markup.*` keys for markdown tokens + language tokens for fences.
Provide a dimmer `subtleSyntax()` for reasoning parts (opencode
`generateSubtleSyntax`). Map our `theme.ts` colors:
- `markup.heading.1/2/3` → accent, bold
- `markup.bold`/`markup.strong` → text, bold
- `markup.italic` → text, italic
- `markup.raw`/`markup.raw.block` (inline/fenced code) → accent (+ bg for inline)
- `markup.list` → accent
- `markup.link`/`markup.link.url` → accent, underline
- `markup.quote` → muted, italic
- language tokens (keyword/string/comment/number/function/type/…) → a small
  palette derived from theme; `default` → text.
- Tree-sitter highlighting for fenced code is automatic (bundled in
  `@opentui/core`).

### 1.3 Streaming wiring

The live `text` part passes `streaming={true}` + `internalBlockMode="top-level"`
+ a reactive `content` (the part's growing `text`). Flip `streaming={false}` when
`message.complete` lands (the part renderer can read the turn's `streaming` flag,
or pass `streaming={turn.streaming && isLastPart}`). NEVER re-tokenize manually —
the renderable does incremental re-tokenization and skips stable prefix blocks
(`_stableBlockCount`).

### 1.4 Verify (Feature 1)

- demo.tsx (FakeGateway) already asserts `0 markdown markers leaked` — keep it
  green (native conceal hides `**`/`` ` `` markers, so 0 is still expected; if
  the native renderer surfaces markers differently, update the assertion to
  check rendered emphasis instead).
- Add a markdown snapshot to demo.parts or a new demo: feed a heading + bullet +
  fenced ```ts code block + a table, assert (a) heading text present, (b) code
  content highlighted/present, (c) table borders (`│`/`─`) present.
- LIVE in tmux: prompt for a fenced code block + a table → confirm syntax
  highlight + grid table.

---

## Execution order (once worktree is clean)

1. `git status` clean + `bun run check` green on the committed base FIRST.
2. model.ts: add `Part`/`parts?:` (Feature 2.1).
3. eventAdapter.ts: parts rewrite (2.2) — the big change. Re-read the CURRENT
   committed file first; the resume `loadTranscript` + BUG-2 `tool.complete`
   logic must be preserved/reused.
4. messageLine.tsx: PART_MAPPING dispatch + extract `ToolRow` (2.3).
5. markdown.tsx: native `<markdown>` + SyntaxStyle (Feature 1).
6. demo.parts.tsx + check.sh gate (2.4); keep demo.prompts/resume/real green.
7. `bun run check` green (incl. real gateway). tmux live-verify both features.
8. Update spec §10 + feature-map (markdown row + ordering note).
9. Commit on `feat/opentui-native-engine`; do NOT push without asking glitch.

## Pitfalls / discipline
- Only edit under `ui-tui-opentui/`. Ink (`ui-tui/`) untouched.
- OpenTUI core is Bun/FFI-only — run everything via `bun`, never node.
- Headless verify via `createTestRenderer`+`captureCharFrame` (dev shell is
  non-TTY); for any Ctrl+C-bearing demo, pass `exitOnCtrlC:false` (learned in
  Phase 4 — the test renderer defaults true and tears down on first Ctrl+C).
- Stable `key={part.id}` is load-bearing: it stops the streaming `<markdown>`
  remounting/re-tokenizing when a tool part is appended below.
- Reuse BUG-2 structured tool fields + `stripToolEnvelope`; don't re-derive.
- Coordinate: this rewrite collides with any concurrent eventAdapter/app/
  transcript edits — confirm the worktree is solely yours before starting.
