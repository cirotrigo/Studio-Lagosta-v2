/**
 * Atalho do PILOTO SINTÉTICO de autonomia (contrato: docs/PLANO-2026-10-17-PILOTO-SINTETICO-CONTRATO.md).
 *
 *   npx tsx scripts/piloto-sintetico.ts                 # amostra padrão (1/6 com cobertura mínima)
 *   npx tsx scripts/piloto-sintetico.ts --completo      # o lote inteiro
 *   npx tsx scripts/piloto-sintetico.ts --calibracao 20 # só as N primeiras peças da amostra
 *   npx tsx scripts/piloto-sintetico.ts --cliente cliente-00 [--sem-repeticao]
 *
 * Roda o vitest do piloto com a variável de ambiente; nada toca produção (banco falso, Blob falso, efeitos espionados).
 * Saída: human-output/relatorios/piloto-sintetico/<data>-<rodada>/ (relatório integral + PNGs; fora do versionamento) e o
 * resumo.md para copiar em docs/piloto-sintetico/ quando a rodada for a oficial.
 */
import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2)
const flag = (nome: string) => {
  const i = args.indexOf(nome)
  return i >= 0 ? (args[i + 1] ?? '1') : null
}
const env: NodeJS.ProcessEnv = { ...process.env, PILOTO_SINTETICO: args.includes('--completo') ? 'completo' : '1' }
const calibracao = flag('--calibracao')
if (calibracao && calibracao !== '1') env.PILOTO_CALIBRACAO = calibracao
const cliente = flag('--cliente')
if (cliente && cliente !== '1') env.PILOTO_CLIENTE = cliente
if (args.includes('--sem-repeticao')) env.PILOTO_SEM_REPETICAO = '1'
const r = spawnSync('npx', ['vitest', 'run', 'src/lib/direcao-de-arte/__tests__/piloto-sintetico.test.ts', '--maxWorkers=1'], { stdio: 'inherit', env })
process.exit(r.status ?? 1)
