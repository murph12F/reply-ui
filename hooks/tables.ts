// Pure markdown-table parsing and column sizing, no engine calls.

export type Segment =
  | { kind: 'md'; text: string }
  | { kind: 'table'; header: string[]; rows: string[][] }

export type Span = { text: string; code?: true; bold?: true }

const DELIM = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/
const FENCE = /^\s*(```|~~~)/

/** Split one table line into cells: pipes inside backticks or escaped stay. */
export function splitRow(line: string): string[] {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1)
  const cells: string[] = []
  let cur = ''
  let inCode = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === '\\' && s[i + 1] === '|') {
      cur += '|'
      i++
    } else if (ch === '`') {
      inCode = !inCode
      cur += ch
    } else if (ch === '|' && !inCode) {
      cells.push(cur.trim())
      cur = ''
    } else {
      cur += ch
    }
  }
  cells.push(cur.trim())
  return cells
}

/** Split a reply into markdown runs and tables (tables inside code fences stay markdown). */
export function segments(text: string): Segment[] {
  const lines = text.split('\n')
  const out: Segment[] = []
  let md: string[] = []
  let inFence = false
  const flush = () => {
    if (md.length) out.push({ kind: 'md', text: md.join('\n') })
    md = []
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (FENCE.test(line)) inFence = !inFence
    const next = lines[i + 1]
    if (!inFence && line.includes('|') && next !== undefined && DELIM.test(next) && next.includes('-')) {
      const header = splitRow(line)
      if (splitRow(next).length === header.length || header.length > 1) {
        const rows: string[][] = []
        let j = i + 2
        while (j < lines.length && lines[j].includes('|') && lines[j].trim() !== '') {
          const cells = splitRow(lines[j])
          rows.push(header.map((_, c) => cells[c] ?? ''))
          j++
        }
        flush()
        out.push({ kind: 'table', header, rows })
        i = j - 1
        continue
      }
    }
    md.push(line)
  }
  flush()
  // Blank edges of markdown runs would draw as empty rows around a table.
  return out
    .map(s => (s.kind === 'md' ? { ...s, text: s.text.replace(/^\s*\n+|\n+\s*$/g, '') } : s))
    .filter(s => s.kind === 'table' || s.text.trim() !== '')
}

export function hasTable(text: string): boolean {
  return segments(text).some(s => s.kind === 'table')
}

/** Inline spans of a cell: `code` and **bold**; other markdown drawn as written. */
export function spans(cell: string): Span[] {
  const out: Span[] = []
  const re = /`([^`]+)`|\*\*([^*]+)\*\*/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(cell))) {
    if (m.index > last) out.push({ text: cell.slice(last, m.index) })
    if (m[1] !== undefined) out.push({ text: m[1], code: true })
    else out.push({ text: m[2], bold: true })
    last = m.index + m[0].length
  }
  if (last < cell.length) out.push({ text: cell.slice(last) })
  return out
}

export function visibleLength(cell: string): number {
  return spans(cell).reduce((n, s) => n + [...s.text].length, 0)
}

/**
 * Column widths that fit `avail` cells: natural widths when they fit, else the
 * widest column gives up a cell at a time, never below `min` (or its natural).
 */
export function columnWidths(header: string[], rows: string[][], avail: number, min = 6): number[] {
  const widths = header.map((h, c) =>
    Math.max(visibleLength(h), ...rows.map(r => visibleLength(r[c] ?? '')), 1),
  )
  const floor = widths.map(w => Math.min(w, min))
  let total = widths.reduce((a, b) => a + b, 0)
  while (total > avail) {
    let widest = -1
    for (let c = 0; c < widths.length; c++) {
      if (widths[c] > floor[c] && (widest < 0 || widths[c] > widths[widest])) widest = c
    }
    if (widest < 0) break
    widths[widest]--
    total--
  }
  return widths
}
