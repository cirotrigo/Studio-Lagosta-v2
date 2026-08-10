import { normalizeForComparison as n } from '@/lib/ai/creative-text-verification'

const casos: Array<[string, string, boolean]> = [
  ['Garanta sua mesa · Praia do Canto, Vitória-ES', 'GARANTA SUA MESA . PRAIA DO CANTO , VITÓRIA - ES', true],
  ['R$ 49,90 por pessoa', 'R$ 49,90 por pessoa', true],
  ['R$ 49,90', 'R$ 4990', false],
  ['Até 50% OFF', 'ATE 50% OFF', true],
  ['das 16h às 20h', 'das 16h as 20h', true],
  ['Todos os dias, das 16h às 20h', 'TODOS OS DIAS , DAS 16H AS 20H', true],
]
let falhas = 0
for (const [esp, transcrito, deveCasar] of casos) {
  const casa = n(transcrito).includes(n(esp))
  const ok = casa === deveCasar
  if (!ok) falhas++
  console.log(`${ok ? '✓' : '✗'} ${JSON.stringify(esp)} → casa=${casa} (esperado ${deveCasar})`)
}
process.exit(falhas ? 1 : 0)
