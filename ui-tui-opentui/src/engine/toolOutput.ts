// Pure text-shaping helpers for compact tool-result rendering (BUG 2).
//
// No OpenTUI / React imports — just string work, so they're trivially
// unit-testable from the headless demos. Mirrors opencode's
// util/collapse-tool-output.ts (line-AND-char cap) + the gateway tool-result
// JSON-envelope unwrap. Lives under engine/ per the spec §2 canonical layout
// (engine/ = native OpenTUI rendering helpers).

/** Result of collapsing tool output for the block render. */
export interface Collapsed {
  lines: string[]
  /** How many trailing lines were dropped (0 when nothing was hidden). */
  hiddenLines: number
  truncated: boolean
}

/** Truncate a single line to `width` columns, adding an ellipsis when cut. */
export function truncate(s: string, width: number): string {
  const w = Math.max(1, width)

  return s.length > w ? s.slice(0, Math.max(1, w - 1)) + '…' : s
}

/**
 * Unwrap the gateway's tool-result JSON envelope so the view shows the actual
 * output, not the wrapper. Many tools return
 * `{"output": "...", "exit_code": 0, "error": null}`. If `raw` parses to such
 * an object, return its `output` (plus a compact error/exit suffix when the
 * command failed); otherwise return `raw` unchanged.
 */
export function stripToolEnvelope(raw: string): string {
  const s = (raw ?? '').trim()

  if (!s.startsWith('{')) {
    return raw ?? ''
  }

  try {
    const obj = JSON.parse(s) as Record<string, unknown>

    if (obj && typeof obj === 'object' && !Array.isArray(obj) && 'output' in obj) {
      let out = typeof obj.output === 'string' ? obj.output : JSON.stringify(obj.output, null, 2)
      const err = obj.error
      const code = obj.exit_code

      if (typeof err === 'string' && err) {
        out += `\n[error] ${err}`
      } else if (typeof code === 'number' && code !== 0) {
        out += `\n[exit ${code}]`
      }

      return out
    }
  } catch {
    // not JSON — fall through and return raw
  }

  return raw ?? ''
}

/**
 * Collapse text to at most `maxLines` lines, each capped to `width` columns.
 * The view renders an overflow marker from `hiddenLines`; this function adds
 * no marker itself (keeps it pure/testable).
 */
export function collapseToolOutput(text: string, maxLines: number, width: number): Collapsed {
  const all = (text ?? '').replace(/\s+$/, '').split('\n')
  const limit = Math.max(1, maxLines)
  const lines = all.slice(0, limit).map(l => truncate(l, width))
  const hiddenLines = Math.max(0, all.length - lines.length)

  return { hiddenLines, lines, truncated: hiddenLines > 0 }
}
