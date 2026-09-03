/**
 * Confere que a régua por VISÃO não exige a LOGO como texto.
 *
 * Não toca no banco, não chama a API, não gasta nada — roda com
 * `npx tsx scripts/validar-regua-sem-marca.ts`.
 *
 * Os casos são as transcrições REAIS de 03/09/2026 (TERO) e 02/09/2026
 * (Quintal), lidas pelo `transcreverTextosDaArte` de produção. Eram elas que
 * faziam toda melhoria de arte do canvas do TERO reprovar por "texto
 * divergente" — a logo é colada por código depois da conferência.
 */

import { semTextosDaMarca } from '@/lib/ai/text-comparison'

const casos: Array<{
  nome: string
  blocos: string[]
  marca: string
  logo: string[]
  regua: string[]
  descontados: string[]
}> = [
  {
    nome: 'TERO executivo (03/09): "TERO" e "BRASA E VINHO" saem; "SABORES TERO" fica',
    blocos: ['TERO', 'BRASA E VINHO', 'HOJE SEU ALMOÇO', 'SABORES TERO', 'ALMOÇO EXECUTIVO', 'TERÇA A SEXTA • 11H30 ÀS 16H'],
    marca: 'TERO',
    logo: ['TERO', 'BRASA E VINHO'],
    regua: ['HOJE SEU ALMOÇO', 'SABORES TERO', 'ALMOÇO EXECUTIVO', 'TERÇA A SEXTA • 11H30 ÀS 16H'],
    descontados: ['TERO', 'BRASA E VINHO'],
  },
  {
    nome: 'TERO funcionamento (03/09): a ligadura lida como "TRO" sai',
    blocos: ['QUINTA MERECE', 'VINHO E SABOR', 'TRO', 'FUNCIONAMENTO - 11H30 ÀS 23H30', 'R.EUGÊNIO NETTO, 326, PRAIA DO CANTO'],
    marca: 'TERO',
    logo: ['TERO', 'BRASA E VINHO'],
    regua: ['QUINTA MERECE', 'VINHO E SABOR', 'FUNCIONAMENTO - 11H30 ÀS 23H30', 'R.EUGÊNIO NETTO, 326, PRAIA DO CANTO'],
    descontados: ['TRO'],
  },
  {
    nome: 'ligadura em outras leituras já vistas: "TLRO" e "TERRO"',
    blocos: ['TLRO', 'TERRO', 'HAPPY HOUR'],
    marca: 'TERO',
    logo: [],
    regua: ['HAPPY HOUR'],
    descontados: ['TLRO', 'TERRO'],
  },
  {
    nome: 'Quintal (02/09): assinatura quebrada em "O QUINTAL" / "PARRILLA BAR" sai, sem transcrição da logo',
    blocos: ['O QUINTAL', 'PARRILLA BAR', 'ALMOÇO EXECUTIVO', 'TERÇA A SEXTA'],
    marca: 'O Quintal Parrilla',
    logo: [],
    regua: ['ALMOÇO EXECUTIVO', 'TERÇA A SEXTA'],
    descontados: ['O QUINTAL', 'PARRILLA BAR'],
  },
  {
    nome: 'copy que CITA a marca não é logo: "VEM PRO TERO" e "VINHO E SABOR" ficam',
    blocos: ['VEM PRO TERO', 'VINHO E SABOR', 'BRASA'],
    marca: 'TERO',
    logo: ['TERO', 'BRASA E VINHO'],
    regua: ['VEM PRO TERO', 'VINHO E SABOR'],
    descontados: ['BRASA'],
  },
  {
    nome: 'sem marca nem logo: nada é descontado',
    blocos: ['HOJE TEM', 'RODÍZIO'],
    marca: '',
    logo: [],
    regua: ['HOJE TEM', 'RODÍZIO'],
    descontados: [],
  },
  {
    nome: 'palavra curta comum NÃO vira marca por distância ("BAR" só sai como genérico; "MAR" fica)',
    blocos: ['MAR', 'SOL'],
    marca: 'TERO',
    logo: [],
    regua: ['MAR', 'SOL'],
    descontados: [],
  },
]

let falhas = 0
for (const c of casos) {
  const r = semTextosDaMarca(c.blocos, { nomeDaMarca: c.marca, textosDaLogo: c.logo })
  const ok = JSON.stringify(r.regua) === JSON.stringify(c.regua) && JSON.stringify(r.descontados) === JSON.stringify(c.descontados)
  console.log(`${ok ? '✅' : '❌'} ${c.nome}`)
  if (!ok) {
    falhas++
    console.log('   régua      :', JSON.stringify(r.regua))
    console.log('   esperada   :', JSON.stringify(c.regua))
    console.log('   descontados:', JSON.stringify(r.descontados))
    console.log('   esperados  :', JSON.stringify(c.descontados))
  }
}
console.log(falhas === 0 ? `\n${casos.length} casos OK` : `\n${falhas} caso(s) falharam`)
process.exit(falhas === 0 ? 0 : 1)
