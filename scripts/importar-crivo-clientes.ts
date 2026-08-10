/**
 * Importa o CRIVO DE APROVAÇÃO dos `DNA.md` de `~/Documents/Clientes` para
 * `BrandDNA.approvalChecklist` (item 4 da Fase 2 do plano).
 *
 * O crivo é a lista de perguntas binárias que cada marca roda antes de
 * agendar. Ela existia só nos arquivos de texto do Mac; aqui vira o checklist
 * que a bancada mostra antes de mandar a arte para a agenda.
 *
 * Por que sem LLM (diferente do `importar-dna-clientes.ts`): o crivo já É uma
 * lista. Destilar reescreveria as perguntas, e uma pergunta reescrita é outra
 * pergunta — "o vermelho está ocupando mais que um acento pequeno?" e "use o
 * vermelho com parcimônia" não conferem a mesma coisa. Extração literal.
 *
 * DRY-RUN POR PADRÃO:
 *   npx tsx scripts/importar-crivo-clientes.ts
 *   npx tsx scripts/importar-crivo-clientes.ts --aplicar
 *   npx tsx scripts/importar-crivo-clientes.ts --projeto 7 --aplicar
 */
import * as fs from 'fs'
import * as path from 'path'
import { db } from '../src/lib/db'
import { parseApprovalChecklist } from '../src/lib/brand/approval-checklist'

const CLIENTES_ROOT = process.env.CLIENTES_ROOT || path.join(process.env.HOME || '', 'Documents/Clientes')

/** Projeto do Studio → pasta em ~/Documents/Clientes. */
const PASTA_POR_PROJETO: Record<number, string> = {
  1: 'real-gelateria',
  2: 'o-quintal-parrilla',
  3: 'tero',
  4: 'seu-quinto',
  5: 'bacana',
  6: 'espeto-gaucho',
  7: 'by-rock',
  11: 'wine-vix',
  12: 'emporio-fonseca',
}

/**
 * O cabeçalho do crivo tem nome diferente em cada DNA — foram escritos em
 * sessões diferentes. Medido nos 9 arquivos em 10/08/2026: "Crivo de
 * aprovação", "Crivo rápido antes de aprovar", "Checklist de aprovação",
 * "Checklist antes de agendar", "Auditoria antes de publicar", "Portões de
 * revisão humana", "Gates humanos".
 */
/**
 * Candidatos com PESO — e o peso é o que faz a extração acertar. Pegar o
 * primeiro cabeçalho que casa levava, em 4 dos 9 DNAs, a uma seção
 * "Gates humanos em automação" que aparece antes no documento e fala de quem
 * revisa o quê, não de conferir a peça. O crivo de verdade vem depois.
 */
const PADROES: Array<{ re: RegExp; peso: number }> = [
  { re: /crivo/i, peso: 100 },
  { re: /checklist de aprova/i, peso: 90 },
  { re: /checklist antes de/i, peso: 90 },
  { re: /auditoria antes de publicar/i, peso: 80 },
  { re: /port(õ|o)es de revis(ã|a)o/i, peso: 30 },
  { re: /gates humanos/i, peso: 30 },
]

interface Candidato {
  titulo: string
  corpo: string
  peso: number
  itens: string[]
}

/**
 * Varre TODOS os cabeçalhos candidatos e devolve o melhor: maior peso e, em
 * empate, o que tem mais perguntas. Seção sem pelo menos 3 itens de lista é
 * descartada — é prosa sobre revisão, não crivo.
 */
function escolherSecao(markdown: string): Candidato | null {
  const linhas = markdown.split('\n')
  const candidatos: Candidato[] = []

  for (let i = 0; i < linhas.length; i++) {
    const cab = linhas[i].match(/^(#{2,4})\s+(.*)$/)
    if (!cab) continue
    const titulo = cab[2].trim()
    const padrao = PADROES.find((p) => p.re.test(titulo))
    if (!padrao) continue

    const nivel = cab[1].length
    const corpo: string[] = []
    for (let j = i + 1; j < linhas.length; j++) {
      const prox = linhas[j].match(/^(#{1,6})\s/)
      if (prox && prox[1].length <= nivel) break
      corpo.push(linhas[j])
    }
    const texto = corpo.join('\n')
    candidatos.push({ titulo, corpo: texto, peso: padrao.peso, itens: extrairItens(texto) })
  }

  const validos = candidatos.filter((c) => c.itens.length >= 3)
  if (validos.length === 0) return null
  validos.sort((a, b) => b.peso - a.peso || b.itens.length - a.itens.length)
  return validos[0]
}

/**
 * Do corpo em markdown para uma pergunta por linha.
 *
 * Só linhas de LISTA entram (numeradas ou com bullet): o corpo costuma abrir
 * com um parágrafo de contexto ("Toda peça passa por esta lista…") que não é
 * item de conferência e só faria a pessoa marcar um checkbox à toa.
 */
function extrairItens(corpo: string): string[] {
  const itens: string[] = []
  for (const linha of corpo.split('\n')) {
    const t = linha.trim()
    if (!/^(\d+[.)]|[-*•])\s+/.test(t)) continue
    const texto = t
      .replace(/^(?:\d+[.)]|[-*•])\s*/, '')
      // Caixa de marcação do markdown ("- [ ] pergunta"): a UI desenha a dela.
      .replace(/^\[[ xX]?\]\s*/, '')
      .replace(/\*\*/g, '')
      .replace(/`/g, '')
      .trim()
    // Sublinha de tabela, separador e sobra de formatação não são pergunta.
    if (texto.length < 8) continue
    itens.push(texto)
  }
  return itens
}

async function main() {
  const aplicar = process.argv.includes('--aplicar')
  const filtroIdx = process.argv.indexOf('--projeto')
  const filtro = filtroIdx >= 0 ? Number(process.argv[filtroIdx + 1]) : null

  console.log(aplicar ? '🔴 MODO APLICAR — grava no banco\n' : '🔵 DRY-RUN — nada é gravado (use --aplicar)\n')

  let gravados = 0
  let pulados = 0

  for (const [idRaw, pasta] of Object.entries(PASTA_POR_PROJETO)) {
    const id = Number(idRaw)
    if (filtro !== null && id !== filtro) continue

    const projeto = await db.project.findUnique({
      where: { id },
      select: { id: true, name: true, brandDNA: { select: { approvalChecklist: true } } },
    })
    if (!projeto) {
      console.log(`[${id}] projeto não existe — pulando\n`)
      pulados++
      continue
    }

    const dnaPath = path.join(CLIENTES_ROOT, pasta, 'human-output/dna', pasta, 'resultado/DNA.md')
    if (!fs.existsSync(dnaPath)) {
      console.log(`[${id}] ${projeto.name}: DNA.md não encontrado em ${dnaPath} — pulando\n`)
      pulados++
      continue
    }

    const secao = escolherSecao(fs.readFileSync(dnaPath, 'utf8'))
    if (!secao) {
      console.log(`[${id}] ${projeto.name}: nenhuma seção de crivo com itens reconhecida — pulando\n`)
      pulados++
      continue
    }

    const itens = secao.itens
    const atual = parseApprovalChecklist(projeto.brandDNA?.approvalChecklist ?? null)
    console.log(`[${id}] ${projeto.name} — seção "${secao.titulo}" → ${itens.length} perguntas`)
    if (atual.length > 0) {
      console.log(`      ⚠️ já existe crivo com ${atual.length} itens; --aplicar SUBSTITUI.`)
    }
    for (const item of itens) console.log(`      • ${item.slice(0, 110)}`)

    if (aplicar) {
      const texto = itens.join('\n')
      await db.brandDNA.upsert({
        where: { projectId: id },
        create: { projectId: id, approvalChecklist: texto },
        update: { approvalChecklist: texto },
      })
      console.log('      ✅ gravado')
      gravados++
    }
    console.log('')
  }

  console.log(aplicar ? `${gravados} projeto(s) gravado(s), ${pulados} pulado(s).` : 'Nada foi gravado. Confira acima e rode com --aplicar.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
