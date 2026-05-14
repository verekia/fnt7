# FNT7

A focused editor for stylized A-Z / a-z / 0-9 display fonts.

- Named bezier presets shared across all glyphs (with per-vertex references).
- Lowercase falls back to uppercase when not designed yet.
- SVG-as-project-file (round-trips via `data-f7-*` attributes).
- TTF / OTF / WOFF2 export via opentype.js.

## Development

```sh
bun install
bun run dev
```

See [CLAUDE.md](./CLAUDE.md) for the full architecture overview.
