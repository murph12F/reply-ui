import type { Register } from 'claude-code'

import { blocks, type PickDecision } from './blocks'
import { columnWidths, segments, spans } from './tables'

// Codex-style tables in the terminal: the reply's markdown stays the engine's
// own drawing (as a Markdown element); only its tables are drawn here.
const ACCENT = 'warning' // theme key: yellow/amber in the default themes
const CODE = 'suggestion' // theme key used for inline code in cells
const GAP = 2 // cells between columns
const INDENT = 2 // the reply's bullet column
// Grays from Codex's tui/src/style.rs: white blended over a black terminal
// background. A mod cannot read the terminal's own background (Codex probes
// it at startup), so these assume a dark theme.
const PROMPT_BG = '#292929' // 16%: Codex's submitted-prompt fill
const TABLE_BG = '#1c1c1c' // 11%: lighter than a prompt, so a table never reads as one
const REC = 'success' // theme key: green, for the recommended tag

export const register: Register = on => {
  // Typed prompts get Codex's gray band, so prompts and answers alternate.
  on('ui.render', { component: 'UserMessage', props: { origin: { kind: 'composer' } } }, async ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)
    const { Box } = $.ui.resolve(e)
    return (
      <Box backgroundColor={PROMPT_BG} paddingX={1} flexDirection="column">
        {await next(e)}
      </Box>
    )
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.isSummary) return next(e)
    // Tables first, then TLDR and Pick blocks inside the markdown runs.
    const segs = segments(e.props.text).flatMap(s => (s.kind === 'md' ? blocks(s.text) : [s]))
    if (segs.every(s => s.kind === 'md')) return next(e)

    const { Box, Text, Markdown } = $.ui.resolve(e)
    const columns = e.viewport?.columns ?? 100
    // The bullet column, the table's own side padding, one cell of slack.
    const avail = Math.max(20, columns - INDENT - 2 - 1)

    const cell = (text: string, width: number, header: boolean) => (
      <Box width={width} flexShrink={0}>
        <Text wrap="wrap" bold={header} color={header ? ACCENT : undefined}>
          {spans(text).map(s =>
            s.code ? (
              <Text color={CODE}>{s.text}</Text>
            ) : s.bold ? (
              <Text bold>{s.text}</Text>
            ) : (
              s.text
            ),
          )}
        </Text>
      </Box>
    )

    const rule = (widths: number[], ch: string) => (
      <Box flexDirection="row" columnGap={GAP}>
        {widths.map(w => (
          <Text dimColor={ch === '─'} color={ch === '━' ? ACCENT : undefined}>
            {ch.repeat(w)}
          </Text>
        ))}
      </Box>
    )

    const table = (header: string[], rows: string[][]) => {
      const widths = columnWidths(header, rows, avail - GAP * (header.length - 1))
      const line = (cells: string[], isHeader: boolean) => (
        <Box flexDirection="row" columnGap={GAP}>
          {cells.map((c, i) => cell(c, widths[i], isHeader))}
        </Box>
      )
      return (
        <Box flexDirection="column" marginY={1} paddingX={1} backgroundColor={TABLE_BG}>
          {line(header, true)}
          {rule(widths, '━')}
          {rows.flatMap((r, i) => (i === 0 ? [line(r, false)] : [rule(widths, '─'), line(r, false)]))}
        </Box>
      )
    }

    const inline = (text: string) =>
      spans(text).map(s =>
        s.code ? <Text color={CODE}>{s.text}</Text> : s.bold ? <Text bold>{s.text}</Text> : s.text,
      )

    // TLDR: a rounded card with an accent title.
    const tldr = (text: string) => (
      <Box flexDirection="column" marginY={1} borderStyle="round" borderColor={ACCENT} paddingX={1}>
        <Text bold color={ACCENT}>TLDR</Text>
        <Markdown text={text} />
      </Box>
    )

    // Pick: key badges, a recommended tag, the explanation dim beneath.
    const pick = (decisions: PickDecision[], allKey: string, moreKey: string) => {
      const rec = decisions.flatMap(d => d.options.filter(o => o.recommended).slice(0, 1).map(o => o.key))
      return (
        <Box flexDirection="column" marginY={1} paddingX={1} paddingY={1} backgroundColor={TABLE_BG} rowGap={1}>
          <Text bold color={ACCENT}>Pick</Text>
          {decisions.map(d => (
            <Box flexDirection="column">
              {d.name ? <Text bold>{d.name}</Text> : null}
              {d.options.map(o => (
                <Box flexDirection="row" columnGap={1}>
                  <Box flexShrink={0}>
                    <Text bold color="black" backgroundColor={ACCENT}>{` ${o.key} `}</Text>
                  </Box>
                  <Box flexDirection="column" flexGrow={1} flexShrink={1}>
                    <Text wrap="wrap">
                      {inline(o.label)}
                      {o.recommended ? <Text color={REC}>{'  ★ recommended'}</Text> : null}
                    </Text>
                    {o.info ? <Text wrap="wrap" dimColor>{inline(o.info)}</Text> : null}
                  </Box>
                </Box>
              ))}
            </Box>
          ))}
          <Text dimColor>
            {'Reply with keys'}
            {rec.length && allKey ? <Text>{'  ·  '}<Text color={ACCENT} bold>{allKey}</Text>{` = ${rec.join('')} (all recommended)`}</Text> : null}
            {moreKey ? <Text>{'  ·  '}<Text color={ACCENT} bold>{moreKey}</Text>{' = explain more'}</Text> : null}
          </Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="row">
        <Box width={INDENT} flexShrink={0}>
          <Text>{e.props.isFirstOfReply ? '●' : ' '}</Text>
        </Box>
        <Box flexDirection="column" flexGrow={1}>
          {segs.map(s =>
            s.kind === 'md' ? <Markdown text={s.text} />
            : s.kind === 'table' ? table(s.header, s.rows)
            : s.kind === 'tldr' ? tldr(s.text)
            : pick(s.decisions, s.allKey, s.moreKey),
          )}
        </Box>
      </Box>
    )
  })
}
