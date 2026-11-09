// Splits a markdown run into plain markdown, a TLDR block and a Pick block,
// as the tldr plugin's rules write them. Pure: no engine calls.

export type PickOption = { key: string; label: string; info: string; recommended: boolean }
export type PickDecision = { name: string; options: PickOption[] }

export type Block =
  | { kind: 'md'; text: string }
  | { kind: 'tldr'; text: string }
  | { kind: 'pick'; decisions: PickDecision[]; allKey: string; moreKey: string }

const TLDR_HEAD = /^\s*\**\s*TLDR\s*:?\s*\**\s*:?\s*$/i
const PICK_HEAD = /^\s*\**\s*Pick\s*:?\s*\**\s*:?\s*$/i
const OPTION = /^\s*[-*+]\s*`([a-z0-9])`\s+(\S.*)$/
const LIST_ITEM = /^\s*([-*+]|\d+\.)\s+/
const FOOTER = /^\s*reply with keys/i

// The reply keys are the user's (tldr's all_key / more_key): read them from the
// footer the rules write, "Reply with keys, `.` for all recommended, or `+` to
// explain more.", so a changed key shows here too. '' when the footer has none.
export function replyKeys(lines: string[]): { allKey: string; moreKey: string } {
  const f = lines.find(l => FOOTER.test(l)) ?? ''
  const all = /`([^`a-z0-9\s])`\s+for all recommended/i.exec(f)
  const more = /`([^`a-z0-9\s])`\s+to explain more/i.exec(f)
  return { allKey: all?.[1] ?? '', moreKey: more?.[1] ?? '' }
}

export function parseOption(key: string, rest: string): PickOption {
  const recommended = /\(recommended\)/i.test(rest)
  const clean = rest.replace(/\s*\(recommended\)\s*/i, ' ').trim()
  // "label: what it does and its cost"; a colon inside backticks is not the split.
  let split = -1
  let inCode = false
  for (let i = 0; i < clean.length - 1; i++) {
    if (clean[i] === '`') inCode = !inCode
    else if (!inCode && clean[i] === ':' && clean[i + 1] === ' ') {
      split = i
      break
    }
  }
  const label = (split < 0 ? clean : clean.slice(0, split)).trim()
  const info = split < 0 ? '' : clean.slice(split + 1).trim()
  return { key, label, info, recommended }
}

function parsePick(lines: string[]): PickDecision[] {
  const out: PickDecision[] = []
  for (const line of lines) {
    if (!line.trim() || FOOTER.test(line)) continue
    const m = OPTION.exec(line)
    if (m) {
      if (!out.length) out.push({ name: '', options: [] })
      out[out.length - 1]!.options.push(parseOption(m[1]!, m[2]!))
    } else {
      out.push({ name: line.replace(/[*_`]/g, '').replace(/:\s*$/, '').trim(), options: [] })
    }
  }
  return out.filter(d => d.options.length > 0)
}

export function blocks(text: string): Block[] {
  const lines = text.split('\n')
  const out: Block[] = []
  let md: string[] = []
  let inFence = false
  const flush = () => {
    const t = md.join('\n').replace(/^\s*\n+|\n+\s*$/g, '')
    if (t.trim()) out.push({ kind: 'md', text: t })
    md = []
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence
    if (!inFence && PICK_HEAD.test(line)) {
      // The Pick block runs to the end of the reply, as the rules place it.
      const rest = lines.slice(i + 1)
      const decisions = parsePick(rest)
      if (decisions.length) {
        flush()
        out.push({ kind: 'pick', decisions, ...replyKeys(rest) })
        return out
      }
    }
    if (!inFence && TLDR_HEAD.test(line)) {
      // Bullets (and their wrapped lines) up to a blank line, a Pick, or the end.
      let j = i + 1
      const body: string[] = []
      while (j < lines.length && !PICK_HEAD.test(lines[j]!)) {
        const l = lines[j]!
        if (!l.trim() && body.length) break
        if (l.trim() && !body.length && !LIST_ITEM.test(l)) break
        if (l.trim()) body.push(l)
        j++
      }
      if (body.length) {
        flush()
        out.push({ kind: 'tldr', text: body.join('\n') })
        i = j - 1
        continue
      }
    }
    md.push(line)
  }
  flush()
  return out
}
