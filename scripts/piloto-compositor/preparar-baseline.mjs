import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
const out = '.tmp-medicao-compositor'
mkdirSync(out, { recursive: true })
for (const modulo of ['compor', 'assinatura']) {
  let source = execFileSync('git', ['show', `7dfbde33:src/lib/compositor/${modulo}.ts`], { encoding: 'utf8' })
  source = source.replaceAll("'./", "'@/lib/compositor/")
  if (modulo === 'compor') source = source.replace("'@/lib/compositor/assinatura'", "'./baseline-assinatura'")
  writeFileSync(`${out}/baseline-${modulo}.ts`, source)
}
