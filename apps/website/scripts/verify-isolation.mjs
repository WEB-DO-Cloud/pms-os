import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

const deps = {
  ...pkg.dependencies,
  ...pkg.devDependencies,
}

const forbidden = Object.keys(deps).filter(
  (name) => name.startsWith('@pms/') || name.includes('secret'),
)
if (forbidden.length > 0) {
  console.error('Website app must not depend on PMS server packages:', forbidden)
  process.exit(1)
}

const forbiddenImport = /from\s+['"]@pms\//
const stack = [join(root, 'app')]
while (stack.length) {
  const dir = stack.pop()
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      stack.push(path)
      continue
    }
    if (!/\.(vue|ts|js|mjs)$/.test(name)) continue
    const text = readFileSync(path, 'utf8')
    if (forbiddenImport.test(text)) {
      console.error(`Forbidden @pms import in ${relative(root, path)}`)
      process.exit(1)
    }
  }
}

console.log('website isolation ok')
