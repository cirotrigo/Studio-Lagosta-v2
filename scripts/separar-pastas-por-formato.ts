/**
 * Separa as pastas da PROGRAMAÇÃO por formato (04/09/2026) e arruma o que já
 * está lá dentro: ordem de postagem e nome com data e slide.
 *
 *   npx tsx scripts/separar-pastas-por-formato.ts --projeto 8            # dry-run
 *   npx tsx scripts/separar-pastas-por-formato.ts --projeto 8 --confirmar
 *   npx tsx scripts/separar-pastas-por-formato.ts --todos                # dry-run da carteira
 *
 * O que ele faz por pasta de semana (ou de avulsas):
 *   1. separa as páginas por FORMATO — o formato de mais páginas fica na pasta
 *      atual (que é renomeada e ganha o `type`/`dimensions` certos), os outros
 *      vão para a pasta do seu formato, criada se não existir;
 *   2. renumera `Page.order` pela ordem de POSTAGEM (dia, horário e, entre
 *      slides do mesmo carrossel, a posição do slide);
 *   3. renomeia cada página com a DATA, a hora, o tema e o slide.
 *
 * NADA é excluído. A pasta antiga que ficar sem páginas some da aba sozinha
 * (`templateVisivel`), mas continua no banco: `Template` tem FK em CASCATA a
 * partir de `Generation`, então apagá-la levaria junto o registro das artes, e
 * `SocialPost.templateId` é SetNull — os posts perderiam o botão "Editar
 * Template". Post nenhum é agendado, publicado ou cancelado aqui.
 *
 * A peça NÃO muda de semana: se o post foi remarcado para outra semana depois
 * de composto, a data nova entra só na ORDEM. Refilar por semana é outra
 * decisão, e destrutiva o bastante para ser pedida.
 */
import 'dotenv/config'

import { db } from '@/lib/db'
import { formatoDaPagina, garantirPasta } from '@/lib/compositor/pastas'
import { nomeDaPagina, ordemDaPagina, pastaDaPeca, ROTULO_DA_PASTA } from '@/lib/compositor/pasta-da-semana'
import type { Formato } from '@/lib/compositor/spec'

/** Story primeiro no desempate de quem fica com a pasta atual. */
const PRIORIDADE: Formato[] = ['story', 'feed', 'quadrado']

/**
 * A que período a pasta pertence — lido da TAG dela, nunca da data das
 * páginas.
 *
 * Medido em 04/09/2026: a pasta 394 da Lagosta chama-se "Semana 14 a 20/09" e
 * guarda páginas agendadas para 10/09. Tirando o período das páginas, ela
 * reivindicava a chave da semana 7-13 e engolia o feed da pasta 395 — duas
 * pastas com a mesma tag, que é justamente o que a tag existe para impedir.
 *
 * Devolve uma data DENTRO do período (meio-dia BRT da segunda, ou do dia 1º),
 * que é o que `pastaDaPeca` sabe ler.
 */
function periodoDaPasta(tags: string[]): { quando: Date | null; agora: Date } | null {
  for (const tag of tags) {
    const semana = /^semana:(\d{4})-(\d{2})-(\d{2})$/.exec(tag)
    if (semana) return { quando: new Date(`${semana[1]}-${semana[2]}-${semana[3]}T12:00:00-03:00`), agora: new Date() }
    const mes = /^mes:(\d{4})-(\d{2})$/.exec(tag)
    // Sem data, `pastaDaPeca` monta as avulsas a partir de `agora` — é por isso
    // que o mês da pasta entra por ali.
    if (mes) return { quando: null, agora: new Date(`${mes[1]}-${mes[2]}-01T12:00:00-03:00`) }
  }
  return null
}

/**
 * O assunto de uma página já nomeada pelo compositor. Sem isto, uma página sem
 * `tema` na spec teria o nome ANTIGO inteiro reaproveitado como assunto
 * ("Qui 10/09 · 09:00 · Qui 09:00 · story · Empório Fonseca").
 */
const NOME_GERADO = /^(?:Dom|Seg|Ter|Qua|Qui|Sex|Sáb) (?:\d{2}\/\d{2} · )?\d{2}:\d{2} · (?:(?:story|feed|quadrado) · )?(.+?)(?: · (?:slide \d+(?:\/\d+)?|peça \d+(?: de \d+)?))?$/

function assuntoDoNome(nome: string): string {
  return NOME_GERADO.exec(nome)?.[1]?.trim() || nome
}

interface Pagina {
  id: string
  name: string
  width: number
  height: number
  tags: string[]
  order: number
  templateId: number
  formato: Formato
  quando: string | null
  tema: string | null
  slide: number | null
  de: number | null
  createdAt: Date
}

/**
 * O pageId escondido no nome do arquivo do render (`<pageId>-<epoch>.png`) —
 * é assim que se recupera a posição de um slide que foi composto antes de o
 * compositor registrar o índice. Peça nova não passa por aqui.
 */
function pageIdDaMidia(url: string, conhecidos: Set<string>): string | null {
  const arquivo = url.split('/').pop()?.split('?')[0] ?? ''
  const semExtensao = arquivo.replace(/\.[a-z0-9]+$/i, '')
  const corte = semExtensao.lastIndexOf('-')
  if (corte <= 0) return null
  const candidato = semExtensao.slice(0, corte)
  return conhecidos.has(candidato) ? candidato : null
}

async function migrarProjeto(projectId: number, confirmar: boolean) {
  const projeto = await db.project.findUnique({ where: { id: projectId }, select: { userId: true, name: true } })
  if (!projeto) throw new Error(`projeto ${projectId} não encontrado`)

  const pastas = await db.template.findMany({
    where: { projectId, category: { in: ['programacao', 'avulsas'] } },
    select: { id: true, name: true, category: true, tags: true, type: true, dimensions: true },
    orderBy: { id: 'asc' },
  })
  if (pastas.length === 0) {
    console.log(`\n${projeto.name} (${projectId}): nenhuma pasta de programação.`)
    return
  }

  const idsDasPastas = pastas.map((p) => p.id)
  const paginas = await db.page.findMany({
    where: { templateId: { in: idsDasPastas } },
    select: { id: true, name: true, width: true, height: true, tags: true, order: true, templateId: true, createdAt: true },
    // A ordem de leitura é o critério FINAL de desempate — sem `orderBy` ela
    // seria a ordem arbitrária do Postgres, que é o defeito que este script
    // veio corrigir.
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
  })
  const conhecidos = new Set(paginas.map((p) => p.id))

  // `quando` e `tema` da spec do compositor; as Generations seguem a página.
  const gens = await db.generation.findMany({
    where: { projectId, templateId: { in: idsDasPastas } },
    select: { id: true, templateId: true, fieldValues: true, slideOrder: true },
  })
  const gensPorPagina = new Map<string, Array<{ id: string; slideOrder: number | null }>>()
  const specPorPagina = new Map<string, { quando: string | null; tema: string | null }>()
  for (const g of gens) {
    const fv = (g.fieldValues ?? {}) as Record<string, unknown>
    const pageId = typeof fv.pageId === 'string' ? fv.pageId : null
    if (!pageId) continue
    const lista = gensPorPagina.get(pageId) ?? []
    lista.push({ id: g.id, slideOrder: g.slideOrder })
    gensPorPagina.set(pageId, lista)
    const spec = (fv.spec ?? {}) as Record<string, unknown>
    if (!specPorPagina.has(pageId)) {
      specPorPagina.set(pageId, {
        quando: typeof spec.quando === 'string' ? spec.quando : null,
        tema: typeof spec.tema === 'string' ? spec.tema : null,
      })
    }
  }

  // A agenda é a fonte mais recente do horário, e a única do slide.
  const posts = await db.socialPost.findMany({
    where: { projectId },
    select: { id: true, pageId: true, templateId: true, scheduledDatetime: true, mediaUrls: true },
  })
  const horarioPorPagina = new Map<string, Date>()
  const slidePorPagina = new Map<string, { slide: number; de: number }>()
  for (const post of posts) {
    if (post.pageId && post.scheduledDatetime) horarioPorPagina.set(post.pageId, post.scheduledDatetime)
    const midias = (post.mediaUrls as string[] | null) ?? []
    if (midias.length < 2) continue
    midias.forEach((url, i) => {
      const pageId = pageIdDaMidia(url, conhecidos)
      if (!pageId) return
      slidePorPagina.set(pageId, { slide: i + 1, de: midias.length })
      if (post.scheduledDatetime) horarioPorPagina.set(pageId, post.scheduledDatetime)
    })
  }

  const enriquecidas: Pagina[] = paginas.map((p) => {
    const spec = specPorPagina.get(p.id)
    const daAgenda = horarioPorPagina.get(p.id)
    const carrossel = slidePorPagina.get(p.id)
    return {
      ...p,
      formato: formatoDaPagina(p),
      quando: daAgenda ? daAgenda.toISOString() : spec?.quando ?? null,
      tema: spec?.tema ?? null,
      slide: carrossel?.slide ?? gensPorPagina.get(p.id)?.find((g) => g.slideOrder != null)?.slideOrder ?? null,
      de: carrossel?.de ?? null,
    }
  })

  console.log(`\n══ ${projeto.name} (${projectId}) — ${pastas.length} pasta(s), ${enriquecidas.length} página(s)`)

  // Quem já tem a chave com formato manda: nunca duas pastas com a mesma tag.
  // Quem já tem a chave com formato manda: nunca duas pastas com a mesma tag.
  const donoDaChave = new Map<string, number>()
  for (const pasta of pastas) {
    for (const tag of pasta.tags) if (/:(story|feed|quadrado)$/.test(tag)) donoDaChave.set(tag, pasta.id)
  }

  let paginasMexidas = 0
  let paginasMovidas = 0
  let postsReapontados = 0

  /**
   * 🔴 As ordens já usadas são por DESTINO e vivem o PROJETO inteiro, não a
   * pasta de origem. Duas pastas de origem podem despejar no MESMO destino —
   * e despejaram: em 04/09/2026 os slides da Ilha (vindos da 395) colidiram em
   * 549002/549003 com as quatro peças do Empório que já estavam na 408.
   */
  const usadasPorPasta = new Map<number, Set<number>>()
  const usadas = (id: number) => {
    const s = usadasPorPasta.get(id) ?? new Set<number>()
    usadasPorPasta.set(id, s)
    return s
  }

  /**
   * PASSO 1 — a IDENTIDADE das pastas que já existem.
   *
   * Cada pasta assume o formato que mais tem, renomeada em pé. Isso não decide
   * para onde as páginas vão (é o passo 2 que decide); serve para as pastas
   * existentes serem REUSADAS em vez de ficarem órfãs ao lado de novas.
   */
  for (const pasta of pastas) {
    const minhas = enriquecidas.filter((p) => p.templateId === pasta.id)
    if (minhas.length === 0) {
      console.log(`  · "${pasta.name}" (${pasta.id}): vazia — deixo como está (some da aba sozinha).`)
      continue
    }
    const porFormato = new Map<Formato, Pagina[]>()
    for (const p of minhas) porFormato.set(p.formato, [...(porFormato.get(p.formato) ?? []), p])
    const formatos = [...porFormato.keys()].sort((a, b) => (porFormato.get(b)!.length - porFormato.get(a)!.length) || (PRIORIDADE.indexOf(a) - PRIORIDADE.indexOf(b)))
    console.log(`  · "${pasta.name}" (${pasta.id}) — ${minhas.length} página(s) [${formatos.map((f) => `${f}:${porFormato.get(f)!.length}`).join(' ')}]`)

    const periodo = periodoDaPasta(pasta.tags)
    if (!periodo) {
      console.log(`      ⚠ sem tag de semana/mês — não sei a que período ela pertence; pulo.`)
      continue
    }
    const dono = formatos[0]
    const modelo = pastaDaPeca(periodo.quando, dono, periodo.agora)
    const jaExiste = donoDaChave.get(modelo.chave)
    if (jaExiste !== undefined && jaExiste !== pasta.id) {
      console.log(`      "${modelo.nome}" já é a pasta ${jaExiste}; esta se esvazia.`)
      continue
    }
    donoDaChave.set(modelo.chave, pasta.id)
    console.log(`      vira "${modelo.nome}" (${modelo.tipo} ${modelo.dimensoes})`)
    if (confirmar) {
      await db.template.update({
        where: { id: pasta.id },
        data: { name: modelo.nome, type: modelo.tipo, dimensions: modelo.dimensoes, category: modelo.categoria, tags: modelo.tags },
      })
    }
  }

  /**
   * PASSO 2 — cada página vai para a pasta da SUA data.
   *
   * 🔴 Agrupar pela pasta de ORIGEM era o defeito: o NOME já saía da data do
   * post, então uma peça remarcada ficava com "Qui 10/09" dentro da pasta da
   * semana 14-20/09 — nome e pasta dizendo coisas diferentes sobre a mesma
   * peça, que é exatamente a confusão que a separação veio resolver. Medido em
   * 04/09/2026: 14 páginas assim na Lagosta, de uma troca de dia entre o
   * Empório e a Ilha. A pasta e o nome saem AGORA da mesma data.
   *
   * Sem data (avulsas), a peça fica no período da pasta de origem — é o único
   * caso em que a origem ainda manda, porque não há data para consultar.
   */
  const periodoDaOrigem = new Map<number, ReturnType<typeof periodoDaPasta>>()
  for (const pasta of pastas) periodoDaOrigem.set(pasta.id, periodoDaPasta(pasta.tags))

  const porDestino = new Map<string, { chave: string; quando: string | Date | null; agora: Date; formato: Formato; paginas: Pagina[] }>()
  for (const p of enriquecidas) {
    const origem = periodoDaOrigem.get(p.templateId)
    if (!origem) continue
    const quando = p.quando ?? origem.quando
    const modelo = pastaDaPeca(quando, p.formato, origem.agora)
    const atual = porDestino.get(modelo.chave) ?? { chave: modelo.chave, quando, agora: origem.agora, formato: p.formato, paginas: [] }
    atual.paginas.push(p)
    porDestino.set(modelo.chave, atual)
  }

  for (const grupo of porDestino.values()) {
    const modelo = pastaDaPeca(grupo.quando, grupo.formato, grupo.agora)
    let destinoId = donoDaChave.get(modelo.chave) ?? -1
    let destinoNome = modelo.nome
    if (confirmar) {
      const destino = await garantirPasta(projectId, projeto.userId, grupo.quando, grupo.formato, grupo.agora)
      destinoId = destino.id
      destinoNome = destino.name
      donoDaChave.set(modelo.chave, destino.id)
    }
    const vindoDeFora = grupo.paginas.filter((p) => p.templateId !== destinoId).length
    console.log(`      → "${modelo.nome}" (${destinoId > 0 ? destinoId : 'pasta nova'}): ${grupo.paginas.length} página(s)${vindoDeFora ? `, ${vindoDeFora} mudando de pasta` : ''}`)

    // Ordenar antes de gravar deixa o dry-run mostrar a ordem final, e dá o
    // desempate por chegada às peças sem data (avulsas).
    const ordenadas = [...grupo.paginas].sort((a, b) => {
      const oa = ordemDaPagina(a.quando, a.slide)
      const ob = ordemDaPagina(b.quando, b.slide)
      if (oa !== null && ob !== null && oa !== ob) return oa - ob
      if (oa !== null && ob === null) return -1
      if (ob !== null && oa === null) return 1
      // Empate real (irmãos do mesmo minuto sem slide declarado): a ordem
      // atual e depois a de criação — num carrossel, é a ordem dos slides.
      return a.order - b.order || a.createdAt.getTime() - b.createdAt.getTime()
    })

    // Peça sem slide recuperável (composta sem declarar o carrossel) precisa
    // de nome próprio: irmãos do mesmo minuto sairiam IDÊNTICOS. "peça" e não
    // "slide" porque é a ordem de composição, não a do Instagram.
    const semSlideNoMinuto = new Map<number, Pagina[]>()
    for (const p of ordenadas) {
      if (p.slide) continue
      const base = ordemDaPagina(p.quando, null)
      if (base === null) continue
      semSlideNoMinuto.set(base, [...(semSlideNoMinuto.get(base) ?? []), p])
    }

    const jaUsadas = usadas(destinoId)
    let semData = 0
    for (const p of ordenadas) {
      let ordem = ordemDaPagina(p.quando, p.slide) ?? semData++
      while (jaUsadas.has(ordem)) ordem++
      jaUsadas.add(ordem)
      const base = p.slide ? null : ordemDaPagina(p.quando, null)
      const irmas = base === null ? [] : semSlideNoMinuto.get(base) ?? []
      const nome = nomeDaPagina({
        quando: p.quando,
        tema: p.tema,
        nome: p.tema ? null : assuntoDoNome(p.name),
        carrossel: p.slide ? { slide: p.slide, de: p.de } : null,
        // Todos os irmãos são numerados, o primeiro inclusive: "peça 2" ao
        // lado de um nome sem sufixo lê como se o primeiro fosse outra coisa.
        ...(irmas.length > 1 ? { peca: irmas.indexOf(p) + 1 } : {}),
      })
      const mudou = p.templateId !== destinoId || p.name !== nome || p.order !== ordem
      if (mudou) paginasMexidas++
      if (p.templateId !== destinoId) paginasMovidas++
      if (!confirmar) {
        if (mudou) console.log(`          ${String(ordem).padStart(6)}  ${nome}${p.templateId !== destinoId ? '   (muda de pasta)' : ''}`)
        continue
      }
      await db.page.update({ where: { id: p.id }, data: { templateId: destinoId, name: nome, order: ordem, tags: ['compositor', p.formato] } })
      const gensDaPagina = gensPorPagina.get(p.id) ?? []
      if (gensDaPagina.length > 0) {
        await db.generation.updateMany({
          where: { id: { in: gensDaPagina.map((g) => g.id) } },
          data: { templateId: destinoId, templateName: destinoNome, ...(p.slide ? { slideOrder: p.slide } : {}) },
        })
      }
      if (p.templateId !== destinoId) {
        // Sem isso o "Editar Template" da agenda abriria a pasta antiga.
        const r = await db.socialPost.updateMany({ where: { pageId: p.id, templateId: p.templateId }, data: { templateId: destinoId } })
        postsReapontados += r.count
      }
    }
  }

  console.log(`  → ${paginasMexidas} página(s) a arrumar, ${paginasMovidas} mudando de pasta, ${postsReapontados} post(s) reapontado(s)${confirmar ? '' : ' (dry-run)'}`)
}

async function main() {
  const args = process.argv.slice(2)
  const confirmar = args.includes('--confirmar')
  const todos = args.includes('--todos')
  const i = args.indexOf('--projeto')
  const projectId = i >= 0 ? Number(args[i + 1]) : NaN

  if (!todos && !Number.isFinite(projectId)) throw new Error('use --projeto <id> ou --todos')

  const projetos = todos
    ? (await db.template.findMany({ where: { category: { in: ['programacao', 'avulsas'] } }, select: { projectId: true }, distinct: ['projectId'], orderBy: { projectId: 'asc' } })).map((t) => t.projectId)
    : [projectId]

  for (const id of projetos) await migrarProjeto(id, confirmar)
  if (!confirmar) console.log('\nDry-run. Use --confirmar para gravar.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
