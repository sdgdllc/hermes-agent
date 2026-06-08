// Native OpenTUI message row — maps FROM ui-tui/src/components/messageLine.tsx.
// Role gutter + body. Assistant body uses native Markdown spans; user/system
// are plain styled text; tool results render COMPACTLY (BUG 2):
//   - default: a one-line row  `⚡ <name>  <short status>`  (no border)
//   - multi-line output: a left-bar block capped to ~10 lines with a
//     "… +N more (click to expand)" affordance — never a full-width rounded
//     box dumping raw JSON.
import React, { useState } from 'react'

import { collapseToolOutput, truncate } from '../engine/toolOutput.ts'
import type { Msg, ToolMsg } from '../model.ts'
import { roleStyle, type Theme } from '../theme.ts'

import { Markdown } from './markdown.tsx'

const GUTTER = 3
const TOOL_MAX_LINES = 10

function ToolRow({ tool, t, cols }: { tool: ToolMsg; t: Theme; cols: number }) {
  const [expanded, setExpanded] = useState(false)
  const bodyWidth = Math.max(20, cols - GUTTER - 2)
  const result = (tool.resultText ?? '').replace(/\s+$/, '')
  const allLines = result ? result.split('\n') : []
  const multiline = allLines.length > 1

  // Inline (default): one line, no border. Used for tools with no/short output.
  if (!multiline) {
    const status = tool.error ? `✗ ${tool.error}` : (allLines[0] ?? tool.summary ?? '')
    const statusFg = tool.error ? t.color.error : t.color.muted
    const room = bodyWidth - tool.name.length - 2

    return (
      <box style={{ flexDirection: 'row', marginTop: 1 }}>
        <box style={{ width: GUTTER }}>
          <text fg={t.color.muted}>⚡ </text>
        </box>
        <box style={{ flexDirection: 'row', width: bodyWidth }}>
          <text fg={t.color.label}>{tool.name}</text>
          {status ? <text fg={statusFg}>{`  ${truncate(status, room)}`}</text> : null}
        </box>
      </box>
    )
  }

  // Block: left bar (1-col bg, no rounded box) + capped lines + expand hint.
  const { hiddenLines, lines } = collapseToolOutput(result, expanded ? allLines.length : TOOL_MAX_LINES, bodyWidth - 2)

  return (
    <box style={{ flexDirection: 'row', marginTop: 1 }}>
      <box style={{ width: GUTTER }}>
        <text fg={t.color.muted}>⚡ </text>
      </box>
      <box onMouseDown={() => setExpanded(e => !e)} style={{ flexDirection: 'row', width: bodyWidth }}>
        <box style={{ backgroundColor: tool.error ? t.color.error : t.color.border, flexShrink: 0, width: 1 }} />
        <box style={{ flexDirection: 'column', flexGrow: 1, paddingLeft: 1 }}>
          <text fg={t.color.label}>{tool.name}</text>
          {lines.map((l, i) => (
            <text fg={t.color.muted} key={i}>
              {l}
            </text>
          ))}
          {hiddenLines > 0 ? (
            <text
              fg={t.color.accent}
            >{`… +${hiddenLines} more line${hiddenLines === 1 ? '' : 's'} (click to expand)`}</text>
          ) : expanded ? (
            <text fg={t.color.accent}>(click to collapse)</text>
          ) : null}
          {tool.error ? <text fg={t.color.error}>{truncate(tool.error, bodyWidth - 2)}</text> : null}
        </box>
      </box>
    </box>
  )
}

export function MessageLine({ msg, t, cols }: { msg: Msg; t: Theme; cols: number }) {
  const { glyph, prefix, body } = roleStyle(msg.role, t)
  const bodyWidth = Math.max(20, cols - GUTTER - 2)

  // Tool result: compact render (BUG 2). Falls back to a synthetic ToolMsg for
  // any legacy text-only tool Msg (e.g. an older FakeGateway seed).
  if (msg.role === 'tool') {
    const tool = msg.tool ?? { name: '', resultText: msg.text }

    return <ToolRow cols={cols} t={t} tool={tool} />
  }

  const isAssistant = msg.role === 'assistant'

  return (
    <box style={{ flexDirection: 'row', marginTop: msg.role === 'user' ? 1 : 0 }}>
      <box style={{ width: GUTTER }}>
        <text fg={prefix}>{msg.role === 'user' ? <b>{glyph}</b> : glyph} </text>
      </box>
      <box style={{ width: bodyWidth, flexDirection: 'column' }}>
        {isAssistant ? (
          <Markdown t={t} text={msg.text || (msg.streaming ? '▍' : '')} width={bodyWidth} />
        ) : (
          <text fg={body || t.color.text}>{msg.text}</text>
        )}
        {isAssistant && msg.streaming && msg.text ? <text fg={t.color.muted}>▍</text> : null}
      </box>
    </box>
  )
}
