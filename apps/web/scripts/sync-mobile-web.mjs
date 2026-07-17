#!/usr/bin/env node
/**
 * Copy Nuxt client assets into Capacitor webDir (`www/`).
 * Prefer `.output/public` from `nuxt build` / `nuxt generate`.
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(root, '.output', 'public')
const target = join(root, 'www')

if (!existsSync(source)) {
  console.error(
    `[sync-mobile-web] Missing ${source}. Run \`pnpm --filter @pms/web build\` or \`generate\` first.`,
  )
  process.exit(1)
}

rmSync(target, { recursive: true, force: true })
mkdirSync(target, { recursive: true })
cpSync(source, target, { recursive: true })

// Capacitor needs an index entry; Nuxt SSR builds may only ship hashed assets.
if (!existsSync(join(target, 'index.html'))) {
  writeFileSync(
    join(target, 'index.html'),
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="viewport-fit=cover, width=device-width, initial-scale=1.0" />
    <title>PMS OS</title>
    <meta http-equiv="refresh" content="0;url=/" />
  </head>
  <body>
    <p>PMS OS mobile shell — open against the hosted app via CAPACITOR_SERVER_URL for live API.</p>
  </body>
</html>
`,
  )
}

console.log(`[sync-mobile-web] Synced ${source} → ${target}`)
