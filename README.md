# reply-ui

A Claude Code mod that draws Claude's replies better in the terminal:

- **Tables** the way Codex draws them: bold yellow header, a `━` rule under it, dim `─` rules between rows, cells that wrap inside their column, `code` colored, on a slightly lighter gray.
- **Your prompts** on a gray band (Codex's prompt gray), so prompts and answers alternate.
- **TLDR blocks** as a rounded card with a yellow title.
- **Pick blocks** (from the [tldr](https://github.com/murph12F/tldr) plugin) as yellow key badges, a green `★ recommended` tag, the explanation dimmed under each option, and a footer with your reply keys (read from the block, so keys you changed in tldr show too).

Only the drawing changes: what Claude wrote and what the transcript stores stay the same. Replies with none of these blocks, and every surface but the terminal, are drawn by Claude Code as usual.

## Install

At the prompt of a terminal session:

```
/plugin install reply-ui --marketplace murph12F/reply-ui
```

From a shell:

```bash
claude plugin install reply-ui --marketplace murph12F/reply-ui
```

Answer `y` to add the marketplace, then pick the user scope. The mod is active right away in that session, and in every session after.

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `murph12F/reply-ui`, then Add plugin.

## What it touches

`claude plugin validate` reports exactly two hooks and one call:

- hooks: `ui.render` on `AssistantMessage` (finished replies) and on `UserMessage` from the composer (your typed prompts)
- calls: `$.ui.resolve` (the elements it draws with)

No files, network, processes, tool calls or prompts.

## Limits

- **Dark terminals:** the grays assume a dark background. A mod cannot read the terminal's real background color (Codex probes it at startup).
- **One redraw per reply:** while a reply streams, Claude Code draws it; the mod redraws it once it is finished. Mods have no hook on the live text.
- Built on Claude Code's early-access mod API, which may change between releases. If a hook breaks, Claude Code skips it and draws the reply as usual.

## Tests

```bash
claude plugin test .
```

## License

MIT
