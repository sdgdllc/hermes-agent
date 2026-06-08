// Message model — a trimmed mirror of ui-tui/src/types.ts `Msg`.
// Phase 2: extended to carry streaming + tool-call indicators emitted by the
// real gateway event stream (see src/gateway/eventAdapter.ts).
import type { Role } from './theme.ts'

/**
 * Structured tool-result payload for a `role:'tool'` Msg (BUG 2). The view
 * (messageLine.tsx) renders compactly from these fields instead of dumping a
 * raw `"$ name\n<json>"` string into a full-width box. `resultText` is already
 * JSON-envelope-stripped (see engine/toolOutput.ts) so the view shows the
 * actual `output`, not the `{output, exit_code}` wrapper.
 */
export interface ToolMsg {
  name: string
  /** Envelope-stripped output (may be multi-line; the view caps it). */
  resultText?: string
  /** Short one-line status when there's no substantial output. */
  summary?: string
  error?: string
  lineCount?: number
}

export interface Msg {
  role: Role
  text: string
  kind?: 'slash' | 'trail' | 'diff'
  thinking?: string
  /** Tool indicator labels (e.g. "terminal", "read_file") attached to a turn. */
  tools?: string[]
  /** Structured tool result for a `role:'tool'` row (BUG 2). */
  tool?: ToolMsg
  /** True while the assistant reply is still streaming in. */
  streaming?: boolean
}

// ── Interactive prompt model (Phase 4) ────────────────────────────────────
//
// The 4 BLOCKING gateway requests (clarify/approval/sudo/secret) plus the
// local non-gateway `confirm` dialog. Each turn that triggers one of these
// blocks the Python agent until the client answers via the matching *.respond
// RPC, so dropping these events deadlocks the agent. See
// src/gateway/eventAdapter.ts. Payload shapes mirror
// ui-tui/src/gatewayTypes.ts ('*.request' variants) verbatim.

/** Clarifying question — optional multiple-choice + always a free-text path. */
export interface ClarifyPrompt {
  kind: 'clarify'
  choices: string[] | null
  question: string
  requestId: string
}

/** Dangerous-command approval — once / session / always / deny. */
export interface ApprovalPrompt {
  kind: 'approval'
  command: string
  description: string
}

/** Masked sudo password entry. */
export interface SudoPrompt {
  kind: 'sudo'
  requestId: string
}

/** Masked secret/env-var entry. */
export interface SecretPrompt {
  kind: 'secret'
  envVar: string
  prompt: string
  requestId: string
}

/** Local (non-gateway) yes/no confirmation used by /new, /clear. */
export interface ConfirmPrompt {
  kind: 'confirm'
  title: string
  detail?: string
  danger?: boolean
  confirmLabel?: string
  cancelLabel?: string
}

/** The active prompt overlay, or null when none is pending. */
export type PromptState = ApprovalPrompt | ClarifyPrompt | ConfirmPrompt | SecretPrompt | SudoPrompt
