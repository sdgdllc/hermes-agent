// Native OpenTUI composer — single-line input wired to submit.
// Maps FROM ui-tui/src/components/textInput.tsx (Phase 1 minimal: no multiline,
// history, or paste yet). Uses OpenTUI's native <input> (focus + cursor + Enter).
import type { InputRenderable } from '@opentui/core'
import { useRenderer } from '@opentui/react'
import React, { useCallback, useEffect, useRef } from 'react'

import type { Theme } from '../theme.ts'

export function Composer({
  t,
  cols,
  onSubmit,
  focused,
  busy
}: {
  t: Theme
  cols: number
  onSubmit: (text: string) => void
  focused: boolean
  busy: boolean
}) {
  const renderer = useRenderer()
  // The <input> is UNCONTROLLED (no value prop), so we clear it imperatively
  // via its renderable after submit — without a ref it kept the typed text
  // forever (BUG 1). InputRenderable exposes a `value` setter (input.mdx).
  const inputRef = useRef<InputRenderable | null>(null)
  // Synchronous guard against a double-Enter race: onSubmit → setBusy(true) is
  // async, so a fast second Enter could fire before `busy` re-renders the input
  // unfocused. Released once the turn ends (busy → false).
  const submitting = useRef(false)

  useEffect(() => {
    if (!busy) {
      submitting.current = false
    }
  }, [busy])

  const handleSubmit = useCallback(
    (value: string) => {
      const text = (typeof value === 'string' ? value : '').trim()

      if (!text || submitting.current) {
        return
      }

      submitting.current = true
      onSubmit(text)

      // Clear the typed text now that it's been sent.
      if (inputRef.current) {
        inputRef.current.value = ''
      }

      renderer.requestRender()
    },
    [onSubmit, renderer]
  )

  return (
    // flexShrink:0 — the composer must keep its full 2 rows (rule + input). With
    // default flexShrink the input row collapses onto the rule once the
    // transcript fills the viewport, overlapping them (the placeholder words end
    // up `─`-separated and unreadable). The PromptOverlay slot is already pinned
    // this way in app.tsx; the composer needs the same guarantee.
    <box style={{ flexDirection: 'column', flexShrink: 0 }}>
      <text fg={t.color.border}>{'─'.repeat(cols)}</text>
      <box style={{ flexDirection: 'row', paddingLeft: 1, paddingRight: 1 }}>
        <text fg={t.color.label}>
          <b>{'> '}</b>
        </text>
        <input
          cursorColor={t.color.accent}
          focused={focused}
          // The `as never` is REQUIRED, not lazy. @opentui/react's JSX namespace
          // declares `IntrinsicElements extends React.JSX.IntrinsicElements`, so
          // `<input>` inherits BOTH OpenTUI's `onSubmit: (value: string) => void`
          // AND React's HTML `onSubmit: FormEventHandler`. The two intersect into
          // a call signature no concrete handler satisfies (string & FormEvent),
          // so the prop must be cast. The runtime delivers the input string
          // (see node_modules/@opentui/react InputProps.onSubmit). No cleaner
          // typed overload exists while the namespace extends React's intrinsics.
          onSubmit={handleSubmit as never}
          placeholder={busy ? 'streaming…' : 'Type a message, Enter to send · Ctrl+C to quit'}
          // Same intersection issue on `ref` (HTMLInputElement vs InputRenderable);
          // the reconciler hands us the InputRenderable at runtime.
          ref={
            ((r: InputRenderable | null) => {
              inputRef.current = r
            }) as never
          }
          style={{ flexGrow: 1 }}
          textColor={t.color.text}
        />
      </box>
    </box>
  )
}
