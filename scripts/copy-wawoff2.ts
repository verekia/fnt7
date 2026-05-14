import { copyFileSync, existsSync, mkdirSync } from 'node:fs'

/**
 * Copy wawoff2's Emscripten bindings to /public so they can be loaded by the
 * Web Worker via `importScripts`. Bypassing wawoff2's wrapper avoids a
 * webpack-bundled bug where the binding's `module.exports = Module` is gated
 * on ENVIRONMENT_IS_NODE and never runs in the browser, so the wrapper's
 * `await runtimeInit` hangs forever.
 */
const destDir = 'public/wawoff2'
mkdirSync(destDir, { recursive: true })

let copied = 0
for (const file of ['compress_binding.js', 'decompress_binding.js']) {
  const src = `node_modules/wawoff2/build/${file}`
  if (!existsSync(src)) {
    console.warn(`[copy-wawoff2] missing ${src} — run \`bun install\` first`)
    continue
  }
  copyFileSync(src, `${destDir}/${file}`)
  copied++
}
console.log(`[copy-wawoff2] copied ${copied} binding(s) to ${destDir}`)
