import { expect, test } from 'claude-code/testing'

import { columnWidths, segments, splitRow } from '../hooks/tables'

const REPLY = [
  'Here is the plan.',
  '',
  '| Command | What it does |',
  '| :- | :- |',
  '| `/tldr:settings` | Every setting as a table |',
  '| `/tldr:on` / `/tldr:off` | TLDR on \\| off |',
  '',
  'Done.',
].join('\n')

const message = (text: string, surface: 'terminal' | 'desktop') => ({
  plugin: 'reply-ui',
  component: 'AssistantMessage',
  requestId: 'msg-1',
  surface,
  viewport: { columns: 80, rows: 40 },
  props: { text, isFirstOfReply: true },
}) as const

test('parser: tables split out, pipes in code and escaped pipes stay in the cell', () => {
  const segs = segments(REPLY)
  expect(segs.map(s => s.kind)).toEqual(['md', 'table', 'md'])
  const t = segs[1]
  if (t?.kind !== 'table') throw new Error('no table')
  expect(t.header).toEqual(['Command', 'What it does'])
  expect(t.rows[1]).toEqual(['`/tldr:on` / `/tldr:off`', 'TLDR on | off'])
  expect(splitRow('| `a|b` | c |')).toEqual(['`a|b`', 'c'])
})

test('parser: a table inside a code fence stays markdown', () => {
  const segs = segments('```\n| a | b |\n| - | - |\n| 1 | 2 |\n```')
  expect(segs.every(s => s.kind === 'md')).toBe(true)
})

test('widths fit the room, widest column shrinks first', () => {
  const w = columnWidths(['a', 'b'], [['x'.repeat(50), 'y'.repeat(10)]], 40)
  expect(w[0]! + w[1]!).toBe(40)
  expect(w[1]).toBe(10)
})

test('a reply with a table is drawn by the mod: header, rules, cells', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const ui = await $.ui.mount(message(REPLY, 'terminal'))
  expect(await ui.find({ type: 'Text', text: /^Command$/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /━━━/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /─────/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /^engine$/ })).toBeFalsy()
  await ui.unmount()
})

test('a reply without a table, or on another surface, goes to the engine', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  for (const m of [message('Just text, a | pipe.', 'terminal'), message(REPLY, 'desktop')]) {
    const ui = await $.ui.mount(m)
    expect(await ui.find({ type: 'Text', text: /^engine$/ })).toBeTruthy()
    await ui.unmount()
  }
})

const prompt = (kind: 'composer' | 'task-notification') => ({
  plugin: 'reply-ui',
  component: 'UserMessage',
  requestId: 'msg-u',
  surface: 'terminal',
  viewport: { columns: 80, rows: 40 },
  props: { text: 'hello', origin: { kind }, isExpanded: true },
}) as const

test('a typed prompt keeps the engine row inside a gray band', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine row</Text>
  })
  const ui = await $.ui.mount(prompt('composer'))
  expect(await ui.find({ type: 'Text', text: /^engine row$/ })).toBeTruthy()
  expect(await ui.find({ type: 'Box', props: { backgroundColor: '#292929' } })).toBeTruthy()
  await ui.unmount()
})

test('other user-side rows are left alone', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine row</Text>
  })
  const ui = await $.ui.mount(prompt('task-notification'))
  expect(await ui.find({ type: 'Box', props: { backgroundColor: '#292929' } })).toBeFalsy()
  await ui.unmount()
})

test('the table sits on its own lighter gray', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const ui = await $.ui.mount(message(REPLY, 'terminal'))
  expect(await ui.find({ type: 'Box', props: { backgroundColor: '#1c1c1c' } })).toBeTruthy()
  await ui.unmount()
})

import { blocks, parseOption } from '../hooks/blocks'

const WITH_PICK = [
  'The answer.',
  '',
  'TLDR:',
  '- Outcome with **numbers**.',
  '- Needs you: nothing',
  '',
  '**Pick:**',
  '',
  'Gray level',
  '- `a` keep these two (recommended): Codex prompt gray, subtler tables',
  '- `o` stronger contrast: easier to spot, heavier look',
  '',
  'Ship it',
  '- `e` commit (recommended): public on GitHub',
  '- `u` wait',
  '',
  'Reply with keys, or `.` for all recommended.',
].join('\n')

test('blocks: TLDR and Pick split out, options parsed', () => {
  const b = blocks(WITH_PICK)
  expect(b.map(x => x.kind)).toEqual(['md', 'tldr', 'pick'])
  const p = b[2]
  if (p?.kind !== 'pick') throw new Error('no pick')
  expect(p.decisions.map(d => d.name)).toEqual(['Gray level', 'Ship it'])
  expect(p.decisions[0]!.options[0]).toEqual({
    key: 'a', label: 'keep these two', info: 'Codex prompt gray, subtler tables', recommended: true,
  })
  expect(p.decisions[1]!.options[1]).toEqual({ key: 'u', label: 'wait', info: '', recommended: false })
  expect(parseOption('h', '`a:b` label: info').label).toBe('`a:b` label')
})

test('blocks: TLDR or Pick inside a code fence, or prose mentioning them, stay markdown', () => {
  expect(blocks('```\nTLDR:\n- x\n```').every(x => x.kind === 'md')).toBe(true)
  expect(blocks('TLDR: this is a sentence, not a block.').every(x => x.kind === 'md')).toBe(true)
})

test('a reply with TLDR and Pick is drawn as a card and badges', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const ui = await $.ui.mount(message(WITH_PICK, 'terminal'))
  expect(await ui.find({ type: 'Box', props: { borderStyle: 'round' } })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /^ a $/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /★ recommended/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /= ae \(all recommended\)/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /^engine$/ })).toBeFalsy()
  await ui.unmount()
})
