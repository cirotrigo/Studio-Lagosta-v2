/**
 * CP5c — inventários por código-fonte (C9, C11, C13 do contrato `docs/PLANO-2026-10-16-CP5C-CONTRATO.md`).
 *
 * O que um teste comportamental não enxerga: o conjunto de LUGARES. (C13) todo `FOR UPDATE` / `FOR SHARE` /
 * `pg_advisory_xact_lock` de `src/lib` e `src/app`, com a tabela e a ordem em que cada arquivo trava — a ordem comum
 * do gate (agenda → fontes → ItemDeLote → ItemDePlano → SocialPost → Page → Generation → FOR SHARE) não pode ser
 * invertida por ninguém, e quem trava VÁRIAS linhas de `SocialPost` pela página trava em `ORDER BY "id"`. (C9) só
 * `agendar-leva` cria DRAFT entre as tools da allowlist do draft-only, e só pelo serviço que mede antes; a lista de
 * quem chama `criarPostDoAgendamento` / `socialPost.create` é FECHADA. (C11) o agendamento não importa o lembrete
 * do WhatsApp nem o publicador. Arquivo novo entra nas listas por PR que diga por quê.
 *
 * Limite dito: inventário por regex não vê SQL montado em variável nem `import()` por string dinâmica — a defesa de
 * fluxo é o contrato e os testes comportamentais (`agendar-itens-gate.test.ts`, P11).
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { TOOLS_DRAFT_ONLY } from '@/lib/mcp/registro/perfil'

const raiz = process.cwd()
function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) return nome === 'node_modules' || nome === '.next' ? [] : arquivos(caminho)
    return /\.(ts|tsx)$/.test(nome) ? [caminho] : []
  })
}
const fontes = () =>
  [...arquivos(join(raiz, 'src/lib')), ...arquivos(join(raiz, 'src/app'))].map((c) => relative(raiz, c)).filter((c) => !/__tests__|\.test\.tsx?$/.test(c))
const ler = (c: string) => readFileSync(join(raiz, c), 'utf8')

// ─── C13 — o inventário das travas ────────────────────────────────────────

/** Os arquivos que travam linhas ou chaves hoje (lista FECHADA: um novo entra aqui com a sua ordem conferida). */
const ARQUIVOS_COM_TRAVAS = [
  'src/app/api/external/posts/[postId]/route.ts',
  'src/app/api/projects/[projectId]/posts/[postId]/route.ts',
  'src/lib/brand/voz-service.ts',
  'src/lib/creatives/arte-rapida.ts',
  'src/lib/creatives/persist.ts',
  'src/lib/lotes/agendar-itens.ts',
  'src/lib/lotes/reserva.ts',
  'src/lib/planos/enfileirar-composicao.ts',
  'src/lib/posts/edicao-semantica-do-post.ts',
  'src/lib/posts/substituir-video-do-post.ts',
  'src/lib/posts/trocar-arte-do-post.ts',
  'src/lib/trava-por-chave.ts',
  'src/lib/video/enfileirar-video.ts',
  'src/lib/video/process-video-job.ts',
].sort()

/** A ORDEM COMUM (CP5c § 4): quem trava duas destas tem de travar na ordem em que aparecem aqui. */
const ORDEM_COMUM = ['advisory', 'ItemDeLote', 'ItemDePlano', 'SocialPost', 'Page', 'Generation', 'Project', 'CustomFont'] as const

type Trava = { linha: number; tabela: string; modo: 'update' | 'share' | 'advisory'; sql: string }
/**
 * Cada `$queryRaw\`…\`` que trava, na ordem do arquivo: a tabela do `FROM`, o modo, a linha. Só o SQL de verdade
 * (template literal do `$queryRaw`), nunca a menção num comentário; o texto entre `${…}` é apagado antes de ler.
 */
function travasDe(texto: string): Trava[] {
  const travas: Trava[] = []
  for (const m of texto.matchAll(/\$queryRaw(?:<[^`]*?>)?\s*`([^`]*)`/g)) {
    const sql = m[1].replace(/\$\{[^}]*\}/g, (x) => x).replace(/\s+/g, ' ')
    if (!/pg_advisory_xact_lock|FOR UPDATE|FOR SHARE/.test(sql)) continue
    const linha = texto.slice(0, m.index).split('\n').length
    if (/pg_advisory_xact_lock/.test(sql)) travas.push({ linha, tabela: 'advisory', modo: 'advisory', sql })
    else travas.push({ linha, tabela: /FROM "(\w+)"/.exec(sql)?.[1] ?? '?', modo: /FOR SHARE/.test(sql) ? 'share' : 'update', sql })
  }
  return travas
}

describe('C13 — inventário dos FOR UPDATE / FOR SHARE / pg_advisory_xact_lock de src/lib e src/app', () => {
  const porArquivo = new Map(fontes().map((c) => [c, travasDe(ler(c))] as const).filter(([, t]) => t.length > 0))

  it('a lista de arquivos que travam é a conhecida (um novo entra aqui com a ordem conferida)', () => {
    expect([...porArquivo.keys()].sort()).toEqual(ARQUIVOS_COM_TRAVAS)
  })

  it('toda trava nomeia a tabela (FROM "Tabela") — nenhum SQL montado em variável', () => {
    for (const [c, travas] of porArquivo) for (const t of travas) expect(t.tabela, `${c}:${t.linha}: ${t.sql}`).not.toBe('?')
  })

  it('nenhum arquivo inverte a ordem comum entre duas tabelas da sequência do gate', () => {
    const posicao = (tabela: string) => (ORDEM_COMUM as readonly string[]).indexOf(tabela)
    for (const [c, travas] of porArquivo) {
      const relevantes = travas.filter((t) => posicao(t.tabela) >= 0)
      for (let i = 1; i < relevantes.length; i++) {
        const antes = relevantes[i - 1]
        const depois = relevantes[i]
        // Mesma tabela repetida (vários itens) e FOR SHARE depois de FOR UPDATE da mesma tabela são permitidos.
        if (posicao(depois.tabela) < posicao(antes.tabela)) {
          // A transação do gate (CP5c em agendar-itens.ts, CP5d em arte-rapida.ts) trava Page FOR SHARE (assinatura/modelo) DEPOIS de Generation — é a ordem do contrato.
          const excecaoDoGate = (c === 'src/lib/lotes/agendar-itens.ts' || c === 'src/lib/creatives/arte-rapida.ts') && depois.tabela === 'Page' && depois.modo === 'share'
          expect(excecaoDoGate, `${c}: "${antes.tabela}" (linha ${antes.linha}) antes de "${depois.tabela}" (linha ${depois.linha}) inverte a ordem comum`).toBe(true)
        }
      }
    }
  })

  it('o gate trava na ordem do contrato: agenda, fontes, ItemDeLote, ItemDePlano, SocialPost (ORDER BY "id"), Page, Generation, depois FOR SHARE em Project, Page e CustomFont', () => {
    const travas = porArquivo.get('src/lib/lotes/agendar-itens.ts')!
    expect(travas.map((t) => `${t.tabela}:${t.modo}`)).toEqual([
      'advisory:advisory',
      'advisory:advisory',
      'ItemDeLote:update',
      'ItemDePlano:update',
      'SocialPost:update',
      'Page:update',
      'Generation:update',
      'Project:share',
      'Page:share',
      'CustomFont:share',
    ])
    expect(travas[0].sql).toContain('chaveDaAgenda')
    expect(travas[1].sql).toContain('chaveDasFontes')
  })

  it('CP5d: ajustar-arte trava na ordem do contrato — agenda, fontes, posts da página (ORDER BY "id"), Page, Generations (origem e alvo, em ordem de id), depois FOR SHARE em Project, Page e CustomFont', () => {
    const travas = porArquivo.get('src/lib/creatives/arte-rapida.ts')!
    expect(travas.map((t) => `${t.tabela}:${t.modo}`)).toEqual([
      'advisory:advisory',
      'advisory:advisory',
      'SocialPost:update',
      'Page:update',
      'Generation:update',
      'Project:share',
      'Page:share',
      'CustomFont:share',
    ])
    expect(travas[0].sql).toContain('chaveDaAgenda')
    expect(travas[1].sql).toContain('chaveDasFontes')
    expect(travas[4].sql).toMatch(/IN \(.*\) ORDER BY "id" FOR UPDATE/)
  })

  it('toda consulta que trava VÁRIAS linhas de SocialPost pela página (gate e ajustar-arte) tem ORDER BY "id"', () => {
    const pelaPagina = [...porArquivo].flatMap(([c, travas]) => travas.filter((t) => t.tabela === 'SocialPost' && /"pageId" = /.test(t.sql)).map((t) => ({ c, ...t })))
    expect(pelaPagina.map((t) => t.c).sort()).toEqual(['src/lib/creatives/arte-rapida.ts', 'src/lib/lotes/agendar-itens.ts'])
    for (const t of pelaPagina) expect(t.sql, `${t.c}:${t.linha}`).toMatch(/ORDER BY "id" FOR UPDATE/)
  })

  it('a chave das fontes é tomada por quem cria/apaga CustomFont (as rotas) e pelo gate — e só por eles', () => {
    const quem = fontes().filter((c) => /chaveDasFontes\(/.test(ler(c))).sort()
    // CP5d: o gate do ajustar-arte também a toma (mesma ordem: agenda → fontes).
    expect(quem).toEqual(['src/app/api/projects/[projectId]/fonts/[fontId]/route.ts', 'src/app/api/projects/[projectId]/fonts/route.ts', 'src/lib/creatives/arte-rapida.ts', 'src/lib/lotes/agendar-itens.ts', 'src/lib/trava-por-chave.ts'])
    for (const rota of quem.filter((c) => c.startsWith('src/app'))) {
      const texto = ler(rota)
      // Toda escrita em CustomFont da rota está dentro de `comTravaPorChave(chaveDasFontes(…), (tx) => tx.customFont.…)`.
      expect(texto.match(/customFont\.(create|delete|update)\(/g)?.length ?? 0, rota).toBeGreaterThan(0)
      expect(texto.match(/db\.customFont\.(create|delete|update)\(/g), `${rota}: escrita em CustomFont fora da trava`).toBeNull()
    }
  })
})

// ─── C9 — só agendar-leva cria DRAFT no draft-only, e só depois do gate ──────

/** Quem pode criar um post (lista FECHADA). O draft-only só alcança o primeiro, pelo serviço que mede antes. */
const CRIADORES_DE_POST = [
  'src/lib/lotes/agendar-itens.ts', // agendar-leva: `criarPostDoAgendamento` DEPOIS do gate (C1 prova a ordem; aqui, o texto)
  'src/lib/creatives/agendar.ts', // agendarPost (fluxo humano: colocar-na-agenda, postar-agora — fora da allowlist)
  'src/lib/posts/later-scheduler.ts', // publicador (fora da allowlist)
  'src/lib/video/process-video-job.ts', // job de vídeo (fora da allowlist)
  'src/app/api/cron/sync-zernio/route.ts', // sync do Zernio (não é tool)
  'src/app/api/projects/[projectId]/posts/sync-zernio/route.ts',
].sort()

describe('C9 — inventário: quem cria DRAFT, e o que as tools da allowlist alcançam', () => {
  it('criarPostDoAgendamento / socialPost.create só nos criadores conhecidos', () => {
    const quem = fontes().filter((c) => /criarPostDoAgendamento\(|socialPost\.create\(/.test(ler(c))).sort()
    expect(quem).toEqual(CRIADORES_DE_POST)
  })

  it('no agendar-itens.ts, dentro da transação, a gravação do registro vem ANTES de criarPostDoAgendamento, e o veredito não APTO devolve antes dele', () => {
    const texto = ler('src/lib/lotes/agendar-itens.ts')
    const tx = texto.indexOf('db.$transaction(')
    const gate = texto.indexOf("gate.gate.resultado !== 'APTO'", tx)
    const registro = texto.indexOf('await gravarOuLancar(tx, gate.registro)', gate)
    const criar = texto.indexOf('await criarPostDoAgendamento(tx, resolucao)', tx)
    expect(tx).toBeGreaterThan(0)
    expect(gate).toBeGreaterThan(tx)
    expect(registro).toBeGreaterThan(gate)
    expect(criar).toBeGreaterThan(registro)
    // O registro gravado nunca é consultado: nem a leitura, nem a validade, nem a chave entram neste arquivo.
    expect(texto).not.toMatch(/lerGateDaArte|validadeDoGate|gateDaArte\b/)
  })

  it('as tools MUTANTES da allowlist: só agendar-leva chega a um criador de post, e só pelo serviço (agendarItensDoLote)', () => {
    const catalogo = fontes().filter((c) => /^src\/lib\/mcp\/catalogo\/[^/]+\.ts$/.test(c)).map((c) => [c, ler(c)] as const)
    const handlerDe = (tool: string) => {
      for (const [c, texto] of catalogo) {
        const inicio = texto.indexOf(`nome: '${tool}'`)
        if (inicio < 0) continue
        const proximo = texto.indexOf("\n    nome: '", inicio + 1)
        return { arquivo: c, texto: texto.slice(inicio, proximo < 0 ? undefined : proximo) }
      }
      return null
    }
    const mutantes = [...TOOLS_DRAFT_ONLY].filter((tool) => {
      const h = handlerDe(tool)
      return h && /readOnlyHint: false/.test(h.texto)
    })
    // buscar-fotos é mutante só porque registra o sinal de aprendizado da busca — não cria post.
    expect(mutantes.sort()).toEqual(['agendar-leva', 'ajustar-arte', 'buscar-fotos', 'compor-leva'])
    for (const tool of [...TOOLS_DRAFT_ONLY]) {
      const h = handlerDe(tool)
      expect(h, `${tool}: tool da allowlist sem handler no catálogo conhecido`).not.toBeNull()
      expect(h!.texto, `${tool} alcança um criador de post diretamente`).not.toMatch(/criarPostDoAgendamento|socialPost\.create|agendarPost\(|postarAgora\(|sendToLater|enviarParaOZernio/)
      if (tool === 'agendar-leva') expect(h!.texto).toMatch(/agendarItensDoLote/)
      else expect(h!.texto, `${tool} não deveria agendar`).not.toMatch(/agendarItensDoLote/)
    }
    // E `agendarItensDoLote` só é chamado pela tool agendar-leva (fora de testes e scripts).
    const chamadores = fontes().filter((c) => c !== 'src/lib/lotes/agendar-itens.ts' && /agendarItensDoLote\(/.test(ler(c)))
    expect(chamadores).toEqual(['src/lib/mcp/catalogo/compositor.ts'])
  })

  it('agendar-itens.ts está nas listas do CP5b: a regra do lint (consumidor nomeado) e o inventário H12', () => {
    expect(ler('eslint.config.mjs')).toMatch(/"src\/lib\/lotes\/agendar-itens\.ts", "src\/lib\/creatives\/arte-rapida\.ts"\]/)
    expect(ler('src/lib/creatives/revisao/__tests__/inventario-gate-da-arte.test.ts')).toMatch(/PERMITIDOS_GATE_DA_ARTE = new Set\(\[[^\]]*'src\/lib\/lotes\/agendar-itens\.ts'/)
  })
})

// ─── C11 — reforços do Dot: lembrete e publicador fora do agendamento ─────────

describe('C11 — o agendamento não importa o lembrete do WhatsApp nem o publicador', () => {
  it('agendar-itens.ts e agendamento.ts não importam reminder-notifier, later-scheduler, waha nem zernio', () => {
    for (const c of ['src/lib/lotes/agendar-itens.ts', 'src/lib/lotes/agendamento.ts']) {
      expect(ler(c), c).not.toMatch(/reminder-notifier|later-scheduler|sendPublishReminder|sendToLater|\/waha|zernio/i)
    }
  })
})
