/**
 * Marca a cópia da copy dos posts da via de CONTEÚDO — e devolve à fila de
 * render a arte que já estava publicando o texto velho.
 *
 * Desde 10/09/2026 o render desenha a página como ela está quando o post
 * carrega `_copiaDaPagina` em `slotValues` (src/lib/posts/copy-segue-a-pagina.ts).
 * O agendamento passou a gravar a marca; os posts vivos anteriores não a têm,
 * e sem ela o render continua aplicando a cópia por cima da página.
 *
 * Recebe a marca só o post que comprovadamente carrega uma CÓPIA da página:
 *   - o agendamento deixou o sinal `copy:post:<id>` (`registrarCopyDoPost`), ou
 *   - a troca de arte por página deixou uma Generation `troca-de-arte` com o id, ou
 *   - a página é do compositor (tag `compositor`).
 * Página-MODELO nunca: ali a copy é própria do post (via de template).
 *
 * O que muda em cada post marcado:
 *   - `slotValues` passa a ser a copy da página + a marca (o que não é texto fica);
 *   - quando a cópia DIVERGIA da página e a arte do post é o render dela (uma
 *     mídia ou nenhuma), a arte volta para a fila — ela está com o texto velho.
 *     Post com várias mídias nunca volta (`renderDaPaginaCobreAMidia`).
 *
 * Seguro de rodar ANTES do deploy: o código antigo ignora chaves `_` e aplica a
 * copy sincronizada, que é a da página. Rode de novo DEPOIS do deploy — o post
 * agendado pelo código antigo nasce sem marca.
 *
 * Dry-run por padrão, como todo script que escreve nesta casa.
 *
 *   npx tsx scripts/marcar-copia-da-pagina.ts
 *   npx tsx scripts/marcar-copia-da-pagina.ts --projeto 1
 *   npx tsx scripts/marcar-copia-da-pagina.ts --confirmar
 */

import { db } from '@/lib/db'
import { copyDeCamadas } from '@/lib/aprendizado/diff-copy'
import { chaveDaCopy } from '@/lib/aprendizado/sinal-de-agendamento-contrato'
import {
  COPIA_DA_PAGINA,
  copyIgual,
  ehCopiaDaPagina,
  slotValuesSeguindo,
  textosDoSlot,
} from '@/lib/posts/copy-segue-a-pagina'
import { invalidateScheduledRenders } from '@/lib/posts/invalidate-renders'
import { renderDaPaginaCobreAMidia } from '@/lib/posts/render-da-pagina'
import type { Prisma } from '../prisma/generated/client'

const args = process.argv.slice(2)
const CONFIRMAR = args.includes('--confirmar')
const iProjeto = args.indexOf('--projeto')
const PROJETO = iProjeto >= 0 ? Number(args[iProjeto + 1]) : null

const ALCANCADOS = ['RENDERED', 'PENDING', 'RENDERING']

function brt(d: Date | null): string {
  if (!d) return 'sem data'
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })
}

async function main() {
  console.log(CONFIRMAR ? '== GRAVANDO ==' : '== dry-run (use --confirmar para gravar) ==')

  const posts = await db.socialPost.findMany({
    where: {
      status: { in: ['DRAFT', 'SCHEDULED'] },
      laterPostId: null,
      pageId: { not: null },
      ...(PROJETO ? { projectId: PROJETO } : {}),
    },
    select: {
      id: true,
      projectId: true,
      status: true,
      postType: true,
      pageId: true,
      slotValues: true,
      mediaUrls: true,
      renderStatus: true,
      scheduledDatetime: true,
    },
    orderBy: { scheduledDatetime: 'asc' },
  })

  const semMarca = posts.filter((p) => textosDoSlot(p.slotValues) && !ehCopiaDaPagina(p.slotValues))
  const jaMarcados = posts.filter((p) => ehCopiaDaPagina(p.slotValues)).length
  console.log(`${posts.length} post(s) vivos com página · ${jaMarcados} já marcados · ${semMarca.length} com copy sem marca`)
  if (semMarca.length === 0) return

  const ids = new Set(semMarca.map((p) => p.id))
  const sinais = await db.learningSignal.findMany({
    where: { chave: { in: semMarca.map((p) => chaveDaCopy(p.id)) } },
    select: { chave: true },
  })
  const doAgendamento = new Set(sinais.map((s) => s.chave))

  const trocas = await db.generation.findMany({
    where: { fieldValues: { path: ['source'], equals: 'troca-de-arte' } },
    select: { fieldValues: true },
  })
  const daTroca = new Set(
    trocas
      .map((g) => (g.fieldValues as { postId?: unknown } | null)?.postId)
      .filter((id): id is string => typeof id === 'string' && ids.has(id)),
  )

  const pages = await db.page.findMany({
    where: { id: { in: [...new Set(semMarca.map((p) => p.pageId!))] } },
    select: { id: true, name: true, isTemplate: true, tags: true, layers: true },
  })
  const paginaPorId = new Map(pages.map((p) => [p.id, p]))

  let marcados = 0
  let refeitos = 0
  let pulados = 0

  for (const post of semMarca) {
    const page = paginaPorId.get(post.pageId!)
    const quem = `${post.id} · projeto ${post.projectId} · ${post.status} ${post.postType} · ${brt(post.scheduledDatetime)}`

    if (!page) {
      console.log(`  pula  ${quem} — a página não existe mais`)
      pulados++
      continue
    }
    if (page.isTemplate) {
      console.log(`  pula  ${quem} — página-modelo "${page.name}": a copy é própria do post`)
      pulados++
      continue
    }

    const procedencia = doAgendamento.has(chaveDaCopy(post.id))
      ? 'agendamento'
      : daTroca.has(post.id)
        ? 'troca de arte'
        : Array.isArray(page.tags) && page.tags.includes('compositor')
          ? 'compositor'
          : null
    if (!procedencia) {
      console.log(`  pula  ${quem} — sem procedência comprovada de cópia da página ("${page.name}")`)
      pulados++
      continue
    }

    const copy = copyDeCamadas(page.layers)
    if (!copy) {
      console.log(`  pula  ${quem} — camadas da página ilegíveis`)
      pulados++
      continue
    }

    const antes = textosDoSlot(post.slotValues)
    const divergia = !copyIgual(antes, copy)
    const refazArte =
      divergia && ALCANCADOS.includes(String(post.renderStatus)) && renderDaPaginaCobreAMidia(post.mediaUrls)

    console.log(
      `  marca ${quem} [${procedencia}] "${page.name}" — ${divergia ? 'cópia DIVERGIA da página' : 'cópia igual à página'}` +
        (refazArte ? ' → arte volta para a fila de render' : divergia ? ' (arte não é o render da página: não refaz)' : ''),
    )
    if (divergia && antes) {
      for (const campo of new Set([...Object.keys(antes), ...Object.keys(copy)])) {
        if ((antes[campo] ?? '') !== (copy[campo] ?? '')) {
          console.log(`        ${campo}: ${JSON.stringify(antes[campo] ?? null)} → ${JSON.stringify(copy[campo] ?? null)}`)
        }
      }
    }

    if (!CONFIRMAR) {
      marcados++
      if (refazArte) refeitos++
      continue
    }

    const novo = { ...slotValuesSeguindo(post.slotValues, copy), [COPIA_DA_PAGINA]: true }
    // Compare-and-set: se alguém mexeu na copy do post no meio do caminho, desiste.
    const gravado = await db.socialPost.updateMany({
      where: { id: post.id, laterPostId: null, slotValues: { equals: post.slotValues as Prisma.InputJsonValue } },
      data: { slotValues: novo as Prisma.InputJsonValue },
    })
    if (gravado.count === 0) {
      console.log(`        ⚠️ o post mudou no meio do caminho — não gravado`)
      pulados++
      continue
    }
    marcados++
    if (refazArte) {
      const r = await invalidateScheduledRenders(db, { postIds: [post.id] })
      if (r.invalidados > 0) refeitos++
      if (r.congelados.length > 0) console.log(`        ⚠️ já entregue ao publicador — a arte não muda mais`)
    }
  }

  console.log(
    `\n${CONFIRMAR ? 'Gravados' : 'Seriam marcados'}: ${marcados} · ` +
      `${CONFIRMAR ? 'artes devolvidas à fila' : 'artes que voltariam à fila'}: ${refeitos} · pulados: ${pulados}`,
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
