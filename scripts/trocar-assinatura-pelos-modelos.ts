/**
 * Troca as páginas de STORY da assinatura do compositor pelos modelos da marca
 * recriados no editor. Nasceu no Quintal e no TERO (11/09/2026), por decisão
 * do Ciro: os modelos recriados das artes de referência substituem a
 * assinatura e viram as variantes de story da usina.
 *
 *   npx tsx scripts/trocar-assinatura-pelos-modelos.ts --projeto 2              # dry-run
 *   npx tsx scripts/trocar-assinatura-pelos-modelos.ts --projeto 2 --confirmar  # grava
 *
 * Numa transação por projeto:
 *  - MOVE as páginas do template com a tag `modelos-da-marca` para o template
 *    "Assinatura". Move, não copia: com uma página só, editar o modelo no
 *    editor é editar a assinatura, e a aba Modelos não mostra a mesma peça duas
 *    vezes (ela lista as páginas-modelo de TODOS os templates do projeto);
 *  - as páginas de story que estavam na assinatura vão para um template de
 *    arquivo (categoria `__system_…` → seção Arquivo da aba Templates),
 *    despromovidas e sem a tag `assinatura`. Nada é apagado;
 *  - as páginas de feed e quadrado ficam na assinatura, depois das de story.
 *
 * Recusa quando algum modelo não é story, quando não há modelo para mover (já
 * trocado) ou quando a assinatura não tem página de story.
 * ⚠️ Só depois do compositor com arranjos no ar (PRs #119 e #121): o código
 * anterior não lê texto rich-text nem os elementos dos modelos.
 */
import 'dotenv/config'
import { db } from '@/lib/db'
import { formatoDaPagina, NOME_DO_TEMPLATE_DE_ASSINATURA } from '@/lib/compositor/assinatura'

const CATEGORIA_DO_ARQUIVO = '__system_assinatura_arquivada__'
const TAG_DOS_MODELOS = 'modelos-da-marca'

function argumento(nome: string): string | null {
  const i = process.argv.indexOf(nome)
  return i >= 0 ? (process.argv[i + 1] ?? null) : null
}

const SELECAO = { id: true, name: true, tags: true, width: true, height: true, isTemplate: true, templateName: true, order: true } as const

async function comRetentativa<T>(nome: string, f: () => Promise<T>): Promise<T> {
  for (let tentativa = 1; ; tentativa++) {
    try {
      return await f()
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro)
      const transitorio = /Can't reach|Connection|timed out|P1001|P1017|P2028/i.test(mensagem)
      if (!transitorio || tentativa >= 3) throw erro
      console.log(`  ${nome}: falha transitória (${mensagem.split('\n')[0].slice(0, 90)}), tentando de novo`)
      await new Promise((r) => setTimeout(r, 2000 * tentativa))
    }
  }
}

async function main() {
  const projectId = Number(argumento('--projeto'))
  if (!Number.isInteger(projectId) || projectId <= 0) throw new Error('Uso: --projeto <id> [--confirmar]')
  const confirmar = process.argv.includes('--confirmar')
  const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })

  const [projeto, assinatura, deModelos] = await comRetentativa('leitura', () =>
    Promise.all([
      db.project.findUnique({ where: { id: projectId }, select: { name: true, userId: true } }),
      db.template.findFirst({ where: { projectId, name: NOME_DO_TEMPLATE_DE_ASSINATURA }, select: { id: true, type: true, dimensions: true } }),
      db.template.findMany({ where: { projectId, tags: { has: TAG_DOS_MODELOS } }, select: { id: true, name: true } }),
    ]),
  )
  if (!projeto) throw new Error(`Projeto ${projectId} não existe`)
  if (!assinatura) throw new Error(`${projeto.name}: não há template "${NOME_DO_TEMPLATE_DE_ASSINATURA}"`)
  if (deModelos.length !== 1) throw new Error(`${projeto.name}: esperava 1 template com a tag ${TAG_DOS_MODELOS}, achei ${deModelos.length}`)

  const [modelos, atuais] = await comRetentativa('páginas', () =>
    Promise.all([
      db.page.findMany({ where: { templateId: deModelos[0].id }, select: SELECAO, orderBy: { order: 'asc' } }),
      db.page.findMany({ where: { templateId: assinatura.id }, select: SELECAO, orderBy: { order: 'asc' } }),
    ]),
  )
  if (modelos.length === 0) throw new Error(`${projeto.name}: o template "${deModelos[0].name}" não tem página para mover (a troca já foi feita?)`)
  const naoStory = modelos.filter((m) => formatoDaPagina(m) !== 'story')
  if (naoStory.length > 0) throw new Error(`${projeto.name}: modelos que não são story: ${naoStory.map((m) => m.name).join(', ')}`)
  const storiesAtuais = atuais.filter((p) => formatoDaPagina(p) === 'story')
  const ficam = atuais.filter((p) => formatoDaPagina(p) !== 'story')
  if (storiesAtuais.length === 0) throw new Error(`${projeto.name}: a assinatura não tem página de story para arquivar`)

  console.log(`\n${projeto.name} (projeto ${projectId}) · Assinatura = template ${assinatura.id}`)
  console.log(`\nVão para o arquivo ("Assinatura — arquivada em ${hoje}"):`)
  for (const p of storiesAtuais) console.log(`  - ${p.id} "${p.name}" ${p.width}x${p.height} modelo=${p.isTemplate} tags=${p.tags.join(',')}`)
  console.log(`\nEntram na assinatura (vindos de "${deModelos[0].name}", template ${deModelos[0].id}):`)
  for (const m of modelos) console.log(`  + ${m.id} "${m.name}" templateName=${m.templateName ?? '—'} tags=${m.tags.join(',')}`)
  console.log(`\nFicam na assinatura:`)
  for (const f of ficam) console.log(`  = ${f.id} "${f.name}" ${f.width}x${f.height} (${formatoDaPagina(f)})`)

  if (!confirmar) {
    console.log('\nDry-run: nada gravado. Rode com --confirmar para trocar.')
    return
  }

  const arquivoId = await comRetentativa('troca', () =>
    db.$transaction(
      async (tx) => {
        const arquivo = await tx.template.create({
          data: {
            name: `Assinatura — arquivada em ${hoje}`,
            type: assinatura.type,
            dimensions: assinatura.dimensions,
            designData: {},
            projectId,
            createdBy: projeto.userId,
            tags: ['assinatura-arquivada'],
            category: CATEGORIA_DO_ARQUIVO,
          },
          select: { id: true },
        })
        for (const p of storiesAtuais) {
          await tx.page.update({
            where: { id: p.id },
            data: { templateId: arquivo.id, isTemplate: false, tags: [...p.tags.filter((t) => t !== 'assinatura'), 'assinatura-arquivada'] },
          })
        }
        let ordem = 0
        for (const m of modelos) {
          await tx.page.update({
            where: { id: m.id },
            data: { templateId: assinatura.id, order: ordem++, tags: m.tags.includes('assinatura') ? m.tags : ['assinatura', ...m.tags] },
          })
        }
        for (const f of ficam) await tx.page.update({ where: { id: f.id }, data: { order: ordem++ } })
        return arquivo.id
      },
      { timeout: 30_000, maxWait: 10_000 },
    ),
  )

  // Relê pelo MESMO caminho que a usina usa para escolher a variante
  const { paginasDeAssinatura } = await import('@/lib/compositor/compor')
  const depois = await comRetentativa('releitura', () => paginasDeAssinatura(projectId))
  console.log(`\nTrocado. Arquivo = template ${arquivoId}. A assinatura agora tem:`)
  for (const p of depois.paginas) console.log(`  ${p.formato ?? '?'} · "${p.name}" · papéis ${p.papeis.join(', ')}`)
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
