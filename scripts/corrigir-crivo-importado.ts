/**
 * Conserta as perguntas do crivo de aprovação que a IMPORTAÇÃO do DNA.md
 * quebrou — e só elas.
 *
 * O crivo de cada marca veio dos arquivos `DNA.md` das skills, e algumas linhas
 * trouxeram junto o caminho da PASTA LOCAL do designer: no Wine Vix e no TERO,
 * "As fontes são as de referencias/fonte/?" pergunta por um diretório que não
 * existe em lugar nenhum do Studio. Quem lê a pergunta na bancada não tem como
 * respondê-la, e a conferência automática também não — ela sai repetindo o
 * caminho vazado na evidência.
 *
 * ⚠️ Escopo deliberadamente ESTREITO. Só entra aqui linha com defeito ÓBVIO de
 * importação: caminho de arquivo/pasta vazado, ou frase truncada no meio.
 * Pergunta comprida, específica ou estranha NÃO é defeito — é o crivo daquela
 * marca, escrito por quem conhece a marca. Cada troca é declarada uma a uma
 * abaixo, com o texto exato de origem, para nada ser reescrito "de passagem".
 *
 * Uso:
 *   npx dotenv-cli -e .env -- npx tsx scripts/corrigir-crivo-importado.ts
 *   npx dotenv-cli -e .env -- npx tsx scripts/corrigir-crivo-importado.ts --gravar
 *
 * Sem `--gravar` é dry-run: mostra antes → depois e não toca no banco.
 */

import { db } from '../src/lib/db'
import { parseApprovalChecklist } from '../src/lib/brand/approval-checklist'
import { updateBrandDNA } from '../src/lib/brand/brand-context'

interface Correcao {
  projectId: number
  marca: string
  /** O texto EXATO que está no banco. Não casou, não troca. */
  de: string
  para: string
  motivo: string
}

const CORRECOES: Correcao[] = [
  {
    projectId: 3,
    marca: 'TERO',
    de: 'As fontes são as de referencias/fonte/?',
    para: 'As fontes usadas são as oficiais da marca?',
    motivo: 'caminho de pasta local vazado do DNA.md; não existe no Studio',
  },
  {
    projectId: 11,
    marca: 'Wine Vix',
    de: 'As fontes são as de referencias/fonte/?',
    para: 'As fontes usadas são as oficiais da marca?',
    motivo: 'caminho de pasta local vazado do DNA.md; não existe no Studio',
  },
]

async function main() {
  const gravar = process.argv.includes('--gravar')
  console.log(gravar ? '=== GRAVANDO ===' : '=== DRY-RUN (use --gravar) ===\n')

  for (const c of CORRECOES) {
    const dna = await db.brandDNA.findUnique({
      where: { projectId: c.projectId },
      select: { approvalChecklist: true },
    })
    const bruto = dna?.approvalChecklist
    if (!bruto) {
      console.log(`⚠️  [${c.projectId}] ${c.marca}: sem crivo cadastrado — pulando`)
      continue
    }

    const itens = parseApprovalChecklist(bruto)
    const indice = itens.indexOf(c.de)
    if (indice === -1) {
      // Texto já corrigido, ou mudou desde que isto foi escrito. Não force.
      console.log(`⏭️  [${c.projectId}] ${c.marca}: pergunta de origem não encontrada — nada a fazer`)
      continue
    }

    const novos = itens.slice()
    novos[indice] = c.para
    // O crivo é gravado como uma pergunta por linha, sem numeração — é a
    // forma que `parseApprovalChecklist` lê de volta.
    const texto = novos.join('\n')

    console.log(`\n[${c.projectId}] ${c.marca} — pergunta ${indice + 1} de ${itens.length}`)
    console.log(`  motivo: ${c.motivo}`)
    console.log(`  antes:  ${c.de}`)
    console.log(`  depois: ${c.para}`)
    console.log(`  (as outras ${itens.length - 1} perguntas ficam intactas)`)

    if (gravar) {
      // Serviço, nunca update direto — é a regra da casa para o DNA.
      await updateBrandDNA(c.projectId, { approvalChecklist: texto })
      console.log('  ✅ gravado')
    }
  }

  await db.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
