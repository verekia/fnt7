/**
 * wawoff2's Emscripten output has dead `require('fs')` / `require('path')`
 * branches behind a Node-only runtime check, but bundlers still try to
 * resolve them statically. webpack's `resolve.fallback` cleanly turns these
 * into empty modules for browser builds without affecting server code.
 *
 * Dev runs via `next dev --webpack` (not Turbopack) because the same trick
 * applied to Turbopack's `resolveAlias` ends up aliasing the bundler's own
 * internal `path` / `fs` usage on the server.
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  reactStrictMode: true,
  reactCompiler: true,
  output: 'export',
  webpack: config => {
    config.resolve = config.resolve ?? {}
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
    }
    return config
  },
}

export default nextConfig
