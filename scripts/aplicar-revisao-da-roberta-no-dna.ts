/**
 * Leva ao DNA de PRODUÇÃO da Real Gelateria e do O Quintal Parrilla o que a
 * Roberta aprovou na revisão da voz de 13/09/2026.
 *
 * Por que isto existe: a voz compacta (PR 13) é SÍNTESE do DNA — a guarda de
 * fidelidade (`conferirTextoDeMarca`) recusa frase que a voz traga e o DNA não
 * tenha. As frases que ela aprovou estavam só na voz proposta, então a
 * migração travava em `fora-do-dna`. O DNA vem primeiro; a voz segue.
 *
 * ⚠️ Escopo ESTREITO e declarado: cada troca abaixo tem o texto EXATO que está
 * no banco. Não casou, ou casou mais de uma vez, o script ABORTA sem gravar
 * nada — nada é reescrito "de passagem".
 *
 * Uso (o .env aponta para PRODUÇÃO, e aqui isso é deliberado):
 *   npx dotenv-cli -e ../../../.env -- npx tsx scripts/aplicar-revisao-da-roberta-no-dna.ts
 *   npx dotenv-cli -e ../../../.env -- npx tsx scripts/aplicar-revisao-da-roberta-no-dna.ts --gravar
 *
 * Sem `--gravar` é dry-run: mostra antes → depois e não toca no banco.
 */

import { db } from '../src/lib/db'
import { updateBrandDNA } from '../src/lib/brand/brand-context'

const EM = '2026-09-13'
const MOTIVO = `(${EM} — revisão da voz pela Roberta em 13/09/2026)`

interface Troca {
  /** O texto EXATO que está no banco. Não casou, não troca. */
  de: string
  para: string
}

interface Alvo {
  projectId: number
  marca: string
  trocas: Troca[]
  /** Linhas acrescentadas ao fim de toneOfVoice, sob "Regras aprendidas na prática". */
  acrescentar: string[]
  /** As frases que a VOZ carrega e o DNA precisa passar a ter. */
  exigidas: string[]
}

const ALVOS: Alvo[] = [
  {
    projectId: 1,
    marca: 'Real Gelateria',
    trocas: [
      {
        de: 'Aqueça seu dia com sabores Real',
        para: 'Aqueça seu dia na Real',
      },
      {
        de: 'Desacelere e desfrute · Porque hoje é dia de se permitir · Viva o Extraordinário · Il vero gelato onde você estiver · Experimente o sabor do dia · Sua próxima parada do Passaporte Real · Vem provar (sazonal, com data: "Vem provar! Só até 09 de julho").',
        para: 'Desacelere e desfrute · Desacelere e viva o Extraordinário · Porque hoje é dia de se permitir · Viva o Extraordinário · Il vero gelato onde você estiver · Hoje você merece sabores Real! · Sua próxima parada do Passaporte Real',
      },
    ],
    acrescentar: [
      `- A lista fechada de CTAs passa a ser: Desacelere e desfrute · Desacelere e viva o Extraordinário · Porque hoje é dia de se permitir · Viva o Extraordinário · Il vero gelato onde você estiver · Hoje você merece sabores Real! · Sua próxima parada do Passaporte Real. Saem "Experimente o sabor do dia" e "Vem provar"; entram "Desacelere e viva o Extraordinário" e "Hoje você merece sabores Real!". No banco de frases-assinatura, "Aqueça seu dia com sabores Real" passa a ser "Aqueça seu dia na Real". Cópia literal; CTA novo só com aprovação. ${MOTIVO}`,
    ],
    exigidas: [
      'Aqueça seu dia na Real',
      'Desacelere e viva o Extraordinário',
      'Hoje você merece sabores Real!',
    ],
  },
  {
    projectId: 2,
    marca: 'O Quintal Parrilla',
    trocas: [
      {
        de: '- Sexta: SEXTA É DIA DE QUINTAL · FIM DE SEMANA COMEÇA AGORA',
        para: '- Sexta: SEXTA É NO QUINTAL · FIM DE SEMANA COMEÇA AQUI!',
      },
      {
        de: '- Happy hour: HAPPY HOUR · CHOPE EM DOBRO · HH DO QUINTAL',
        para: '- Happy hour: HAPPY HOUR · HAPPY HOUR É AQUI! · CHOPE EM DOBRO · HH DO QUINTAL',
      },
      {
        de: '- Almoço: ALMOÇO EXECUTIVO · ALMOÇO NA BRASA · HORA DO ALMOÇO',
        para: '- Almoço: ALMOÇO EXECUTIVO · ALMOÇO É NO QUINTAL · ALMOÇO NA BRASA',
      },
    ],
    acrescentar: [
      `- A lista fechada de CTAs passa a ter NOVE: Bora pro quintal? · A brasa tá acesa · Chega mais · Reserva sua mesa · Junta a galera · Te esperamos aqui · Vem pra cá · A mesa é de vocês · Chega pra resenha. "Vem que tem" SAI da lista; "A mesa é de vocês" e "Chega pra resenha" entram. Esta lista de nove substitui a de oito da linha anterior. Cópia literal; CTA novo só com aprovação. ${MOTIVO}`,
      `- "A brasa tá acesa" é assinatura da casa: só em peça de parrilla ou corte, de preferência como manchete. "Reserva sua mesa" só quando há reserva de verdade; "Te esperamos aqui" com moderação; "Vem pra cá" no story; "Chega pra dividir" só com produto divisível. ${MOTIVO}`,
      `- Nos pré-títulos, passam a valer SEXTA É NO QUINTAL e FIM DE SEMANA COMEÇA AQUI! (sexta), HAPPY HOUR É AQUI! (happy hour) e ALMOÇO É NO QUINTAL (almoço, no lugar de HORA DO ALMOÇO). ${MOTIVO}`,
    ],
    exigidas: [
      'A mesa é de vocês',
      'Chega pra resenha',
      'ALMOÇO É NO QUINTAL',
      'HAPPY HOUR É AQUI!',
      'SEXTA É NO QUINTAL',
      'FIM DE SEMANA COMEÇA AQUI!',
    ],
  },
]

async function main() {
  const gravar = process.argv.includes('--gravar')
  console.log(gravar ? '=== GRAVANDO EM PRODUÇÃO ===\n' : '=== DRY-RUN (use --gravar) ===\n')

  let problemas = 0

  for (const alvo of ALVOS) {
    const dna = await db.brandDNA.findUnique({ where: { projectId: alvo.projectId } })
    if (!dna?.toneOfVoice) {
      console.log(`❌ ${alvo.marca}: sem toneOfVoice no banco`)
      problemas++
      continue
    }

    let texto = dna.toneOfVoice
    console.log(`\n### ${alvo.marca} (projeto ${alvo.projectId})`)

    for (const t of alvo.trocas) {
      const ocorrencias = texto.split(t.de).length - 1
      if (ocorrencias !== 1) {
        console.log(`   ❌ "${t.de.slice(0, 60)}…" aparece ${ocorrencias}× (esperado: 1)`)
        problemas++
        continue
      }
      texto = texto.replace(t.de, t.para)
      console.log(`   ✏️  ${t.de.slice(0, 70)}`)
      console.log(`    →  ${t.para.slice(0, 70)}`)
    }

    for (const linha of alvo.acrescentar) {
      if (texto.includes(linha)) {
        console.log(`   ⏭️  linha já registrada, pulando`)
        continue
      }
      texto = `${texto.trimEnd()}\n${linha}`
      console.log(`   ➕ ${linha.slice(0, 80)}…`)
    }

    const faltando = alvo.exigidas.filter((f) => !texto.includes(f))
    if (faltando.length > 0) {
      console.log(`   ❌ ainda fora do DNA: ${faltando.join(' · ')}`)
      problemas++
      continue
    }
    console.log(`   ✅ as ${alvo.exigidas.length} frases da voz estão no DNA`)

    if (gravar) {
      await updateBrandDNA(alvo.projectId, { toneOfVoice: texto })
      console.log(`   💾 gravado (${dna.toneOfVoice.length} → ${texto.length} caracteres)`)
    }
  }

  console.log(problemas === 0 ? '\n✅ tudo certo' : `\n❌ ${problemas} problema(s) — nada foi gravado neles`)
  await db.$disconnect()
  process.exit(problemas === 0 ? 0 : 1)
}

main()
