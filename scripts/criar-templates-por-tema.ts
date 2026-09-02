/**
 * Cria os modelos que faltam, um por PILAR aprovado, com 3 layouts cada
 * (16/08/2026).
 *
 * O levantamento de 16/08 mostrou que só 9 dos 30 pilares aprovados tinham
 * algum modelo: pedir "story de harmonização" no Wine Vix não achava nada e
 * caía na geração por IA — que funciona, mas custa crédito e não usa a
 * diagramação aprovada da marca.
 *
 * O padrão visual NÃO foi inventado: é o dos "Story base (3 layouts)" que o
 * TERO e o Wine Vix já usavam, extraído para `lib/gerador-de-templates.ts`.
 * O kit de cada marca (fonte, cor, ícone, logo) vem do que está cadastrado no
 * projeto; a copy vem do DNA e da BASE DE CONHECIMENTO daquele cliente.
 *
 * 🔴 Copy NUNCA inventa preço, horário, endereço ou promoção — os valores
 * abaixo foram lidos da base de cada cliente, e o CTA respeita a lista de
 * aprovados quando a marca tem uma (o Wine Vix tem seis literais).
 *
 *   npx tsx scripts/criar-templates-por-tema.ts 11              # dry-run
 *   npx tsx scripts/criar-templates-por-tema.ts --projeto 11    # o mesmo, por flag
 *   npx tsx scripts/criar-templates-por-tema.ts 11 --confirmar
 *   npx tsx scripts/criar-templates-por-tema.ts 11 --desfazer --confirmar   # apaga o que criou
 *
 * O projeto é OBRIGATÓRIO (posicional ou `--projeto <id>`): o script nunca
 * varre a carteira inteira, e `--desfazer` só alcança templates com a
 * `MARCA_DO_SCRIPT` DAQUELE projeto.
 *
 * Desde 01/09/2026 o gerador desenha HALO (caixa desfocada atrás do texto),
 * não mais véu. Os modelos gravados antes disso carregam o véu antigo; para
 * regenerá-los com halo é `--desfazer --confirmar` e depois `--confirmar` de
 * novo — decisão de quem roda, porque apaga e recria as 3 páginas de cada
 * tema (ids novos; post que aponte para a página antiga perde o vínculo).
 * Temas que já tenham modelo de OUTRA origem continuam sendo pulados.
 */
import { db } from '@/lib/db'
import { createServerTextBoxMeasurer } from '@/lib/creatives/server-text-measurer'
import { registerProjectFonts } from '@/lib/posts/register-project-fonts'
import { createBlankDesign } from '@/lib/studio/defaults'
import type { Prisma } from '@prisma/client'
import {
  CANVAS, LAYOUTS, NOME_DO_LAYOUT, montarCamadas,
  type KitDeMarca, type CopyDoTema,
} from './lib/gerador-de-templates'
import { KITS, COPY_POR_TEMA, TEMAS_EXTRAS } from './lib/kits-de-marca'

/** Marca as páginas criadas por este script, para o --desfazer ser cirúrgico. */
export const MARCA_DO_SCRIPT = 'lote-tema-2026-08'

/** `--projeto <id>` tem prioridade; senão o primeiro argumento numérico. */
function lerProjeto(argv: string[]): number {
  const i = argv.indexOf('--projeto')
  if (i >= 0) return Number(argv[i + 1])
  const posicional = argv.slice(2).find((a) => /^\d+$/.test(a))
  return Number(posicional)
}

async function main() {
  const projectId = lerProjeto(process.argv)
  const confirmar = process.argv.includes('--confirmar')
  const desfazer = process.argv.includes('--desfazer')
  if (!projectId) throw new Error('uso: npx tsx scripts/criar-templates-por-tema.ts <projectId> | --projeto <id> [--confirmar|--desfazer]')

  const projeto = await db.project.findUnique({ where: { id: projectId }, select: { id: true, name: true, userId: true } })
  if (!projeto) throw new Error(`projeto ${projectId} não encontrado`)
  const dono = await db.user.findUnique({ where: { id: projeto.userId }, select: { clerkId: true } })

  console.log(desfazer ? '=== DESFAZER ===' : confirmar ? '=== APLICANDO ===' : '=== DRY-RUN (use --confirmar) ===')
  console.log(`cliente: ${projeto.name} (${projectId})\n`)

  if (desfazer) {
    // SÓ deste projeto e SÓ com a marca: o filtro é duplo de propósito.
    const alvo = await db.template.findMany({
      where: { projectId, tags: { has: MARCA_DO_SCRIPT } },
      select: { id: true, name: true, _count: { select: { Page: true } } },
    })
    for (const t of alvo) console.log(`   apagar "${t.name}" (${t._count.Page} página(s))`)
    if (confirmarFlag() && alvo.length > 0) {
      // Page tem onDelete: Cascade em templateId — apagar o template leva as páginas.
      await db.template.deleteMany({ where: { id: { in: alvo.map((t) => t.id) }, projectId, tags: { has: MARCA_DO_SCRIPT } } })
    }
    console.log(`\n${confirmarFlag() ? `${alvo.length} template(s) apagado(s).` : 'Nada foi apagado (rode com --confirmar junto).'}`)
    return
  }

  // As fontes precisam estar registradas ANTES de medir: medir com fallback
  // dá altura de outra fonte, e o bloco nasce torto.
  await registerProjectFonts(projectId)
  const medir = await createServerTextBoxMeasurer()
  const alturaDe = (c: any) => medir(c as any)?.height ?? (c.size?.height ?? 0)

  const kit = KITS[projectId]
  if (!kit) throw new Error(`sem kit de marca cadastrado para o projeto ${projectId} — ver scripts/lib/kits-de-marca.ts`)

  const pilares = await db.contentPillar.findMany({
    where: { projectId, aprovado: true },
    select: { slug: true, nome: true },
    orderBy: { slug: 'asc' },
  })
  const modelos = await db.page.findMany({
    where: { isTemplate: true, Template: { projectId } },
    select: { tags: true, Template: { select: { tags: true } } },
  })
  const jaCoberto = new Set(
    modelos.flatMap((m) => [...(m.tags ?? []), ...(m.Template.tags ?? [])].map((t) => t.toLowerCase())),
  )

  const copySet = COPY_POR_TEMA[projectId] ?? {}
  let criados = 0

  /**
   * Pilares aprovados + temas EXTRAS declarados no kit (ver `TEMAS_EXTRAS`):
   * assunto que merece modelo sem ser pilar. Um extra com o slug de um pilar
   * é ignorado — o pilar manda.
   */
  const slugsDePilar = new Set(pilares.map((p) => p.slug))
  const temas: Array<{ slug: string; nome: string; tags: string[] }> = [
    ...pilares.map((p) => ({ slug: p.slug, nome: p.nome, tags: [] as string[] })),
    ...(TEMAS_EXTRAS[projectId] ?? [])
      .filter((t) => !slugsDePilar.has(t.slug))
      .map((t) => ({ slug: t.slug, nome: t.nome, tags: t.tags ?? [] })),
  ]

  for (const pilar of temas) {
    if (jaCoberto.has(pilar.slug)) {
      console.log(`·  ${pilar.slug} — já tem modelo; pulando`)
      continue
    }
    const copy: CopyDoTema | undefined = copySet[pilar.slug]
    if (!copy) {
      console.log(`!  ${pilar.slug} — SEM COPY escrita; pulando (copy é julgamento, não se gera por regra)`)
      continue
    }

    const nomeTemplate = `${projeto.name} — ${pilar.nome} (3 layouts)`
    console.log(`\n+  ${nomeTemplate}`)
    console.log(`   pré: "${copy.preTitulo ?? '—'}"  título: "${copy.titulo.replace(/\n/g, ' / ')}"${copy.tituloAcento ? ` + acento "${copy.tituloAcento}"` : ''}`)
    console.log(`   desc: "${copy.descricao}"`)
    console.log(`   serviço: "${copy.servico ?? '—'}"   CTA: "${copy.cta}"`)
    console.log(`   layouts: ${LAYOUTS.join(', ')}   tags: ${[pilar.slug, ...pilar.tags].join(', ')}`)

    if (!confirmar) continue

    const blank = createBlankDesign('STORY')
    await db.$transaction(async (tx) => {
      const template = await tx.template.create({
        data: {
          name: nomeTemplate,
          type: 'STORY',
          dimensions: `${CANVAS.width}x${CANVAS.height}`,
          projectId,
          createdBy: dono?.clerkId ?? projeto.userId,
          designData: blank as unknown as Prisma.JsonValue,
          dynamicFields: [] as unknown as Prisma.JsonValue,
          // A tag do pilar é o que faz prepareCreative achar o modelo por tema.
          tags: [pilar.slug, ...pilar.tags, MARCA_DO_SCRIPT],
        },
      })
      for (const [i, layout] of LAYOUTS.entries()) {
        const camadas = montarCamadas(kit, copy, layout, alturaDe)
        await tx.page.create({
          data: {
            name: NOME_DO_LAYOUT[layout],
            width: CANVAS.width,
            height: CANVAS.height,
            // `Page.layers` é string JSON — ver normalizeLayersString.
            layers: JSON.stringify(camadas),
            background: kit.corFundo,
            order: i,
            templateId: template.id,
            isTemplate: true,
            tags: [pilar.slug, ...pilar.tags],
          },
        })
      }
    })
    criados++
  }

  console.log(`\n${confirmar ? `${criados} template(s) criado(s), ${criados * 3} páginas.` : 'Nada foi gravado (dry-run).'}`)

  function confirmarFlag() {
    return confirmar
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
