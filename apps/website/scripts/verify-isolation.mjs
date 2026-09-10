import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
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
const homepagePath = join(root, 'app/pages/index.vue')
let page = ''
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
    if (path === homepagePath) page = text
    if (forbiddenImport.test(text)) {
      console.error(`Forbidden @pms import in ${relative(root, path)}`)
      process.exit(1)
    }
  }
}

console.log('website isolation ok')

if (!page) {
  console.error('app/pages/index.vue not scanned during isolation walk')
  process.exit(1)
}
const nuxt = readFileSync(join(root, 'nuxt.config.ts'), 'utf8')
const required = [
  'PMS.do',
  'hello@pms.do',
  'app.pms.do/signup',
  '/setup',
  'WEB-DO-Cloud/pms-os',
  'Caribbean',
  'United States',
  'United Kingdom',
  'European Union',
  'Canada',
]
for (const needle of required) {
  if (!page.includes(needle)) {
    console.error(`Homepage copy missing required string: ${needle}`)
    process.exit(1)
  }
}
if (!/title:\s*['"]PMS\.do/.test(nuxt)) {
  console.error('nuxt.config title must lead with PMS.do')
  process.exit(1)
}
if (page.includes('PMS OS') || nuxt.includes('PMS OS')) {
  console.error('PMS OS brand must not remain on the marketing site')
  process.exit(1)
}
const forbiddenCopy = [
  /restaurant POS/i,
  /\bMCP\b/,
  /\bGST\b/,
  /GSTR-1/i,
  /live rates, not a screenshot/i,
  /WhatsApp/i,
  /\$6\.9/,
  /\$20\b/,
]
for (const re of forbiddenCopy) {
  if (re.test(page) || re.test(nuxt)) {
    console.error(`Homepage copy contains forbidden claim: ${re}`)
    process.exit(1)
  }
}
if (
  (nuxt.includes('hero-coastal-villa.jpg') || page.includes('hero-coastal-villa.jpg')) &&
  !existsSync(join(root, 'public/hero-coastal-villa.jpg'))
) {
  console.error('hero-coastal-villa.jpg is referenced but public/hero-coastal-villa.jpg is missing')
  process.exit(1)
}
console.log('website homepage copy ok')
