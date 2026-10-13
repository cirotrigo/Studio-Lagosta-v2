/**
 * B1d — checkpoint a: CARACTERIZAÇÃO e identidade do contrato semântico novo em `SocialPost.slotValues`.
 *
 * Fixa (1) quando um post usa o contrato novo — presença PRÓPRIA da chave `_slots` ou `_papeis`, nunca o
 * valor; (2) quais caminhos gravam `SocialPost.slotValues`; (3) a diferença página MODELO × CONTEÚDO; (4) o
 * que o legado faz hoje e continua fazendo. Nada aqui aplica, valida ou recusa o contrato: isso é dos
 * checkpoints b–g. Os gaps D/E foram fechados no checkpoint d — no render, não nestes primitivos legados.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  comoCopiaDaPagina,
  copyPropriaDoPost,
  slotValuesParaRender,
  slotValuesSeguindo,
  temContratoSemantico,
} from '../copy-segue-a-pagina'
import { aplicarSlotNaCamada, findUnmatchedSlotKeys } from '../page-to-design-data'

const MODELO = true
const CONTEUDO = false
/** O que o banco devolve: `SocialPost.slotValues` é JSONB, gravado a partir de JSON. */
const persistido = (v: unknown) => JSON.parse(JSON.stringify(v)) as unknown

describe('A–C. identidade do contrato: presença PRÓPRIA da chave, não o valor', () => {
  it('A. `_slots: null` é contrato novo', () => {
    expect(temContratoSemantico({ _slots: null })).toBe(true)
    expect(temContratoSemantico(persistido({ _slots: null }))).toBe(true)
  })

  it('B. `_papeis: null` é contrato novo', () => {
    expect(temContratoSemantico({ _papeis: null })).toBe(true)
    expect(temContratoSemantico(persistido({ _papeis: null }))).toBe(true)
  })

  it('valor vazio, falso ou malformado continua sendo contrato novo (forma e validade vêm depois)', () => {
    for (const v of [{}, [], '', 0, false, 'lixo', { s: { hidden: true } }]) {
      expect(temContratoSemantico({ _slots: v })).toBe(true)
      expect(temContratoSemantico({ _papeis: v })).toBe(true)
    }
  })

  it('C. sem `_slots` e sem `_papeis`: não é contrato novo', () => {
    for (const sv of [undefined, null, {}, [], 'x', { headline: 'X' }, { 'text-1': { content: 'X' } }, { _driveImageId: 'd1', _imageUrl: 'u' }, comoCopiaDaPagina({ Título: 'X' })]) {
      expect(temContratoSemantico(sv)).toBe(false)
    }
  })

  it('formato persistido real: `{ _papeis: undefined }` não sobrevive ao JSON — chega ao banco como `{}`', () => {
    const naRequisicao = { _papeis: undefined }
    expect(temContratoSemantico(naRequisicao)).toBe(true) // em memória a chave própria existe…
    expect(persistido(naRequisicao)).toEqual({})
    expect(temContratoSemantico(persistido(naRequisicao))).toBe(false) // …mas não no que o render lê
  })

  it('só chave PRÓPRIA: herdada pelo protótipo não conta', () => {
    expect(temContratoSemantico(Object.create({ _slots: {} }))).toBe(false)
  })
})

describe('D. página MODELO com `_slots`: o mapa chega ao render, mas `_slots` não é aplicado nem avisado', () => {
  const sv = { _slots: { manchete: 'Noite do vinho' } }
  const camada = { id: 't-h', name: 'Título', content: 'modelo', metadata: { slot: { id: 'manchete' } } }

  it('hoje: slotValuesParaRender entrega o mapa inteiro (com `_slots`) ao applySlotValues', () => {
    expect(slotValuesParaRender(sv, MODELO)).toBe(sv)
  })

  it('hoje: `_slots` é tratado como chave de CONTROLE — nenhum aviso de chave sem camada', () => {
    expect(findUnmatchedSlotKeys([camada], sv)).toEqual([])
  })

  it('hoje: a camada endereçada pelo slot não muda (o legado casa só por id/nome)', () => {
    expect(aplicarSlotNaCamada(camada, sv).content).toBe('modelo')
  })

  // Checkpoint d: o gap fechou no RENDER (aplicarValoresDoPost em renderStoryImage — ver
  // story-renderer-contrato-semantico.test.ts, A e B); este primitivo continua sendo só o legado, de propósito.
  it('o primitivo legado continua sem aplicar `_slots` — a aplicação semântica é do helper do render', () => {
    expect(aplicarSlotNaCamada(camada, sv).content).toBe('modelo')
  })
})

describe('E. página de CONTEÚDO com `_slots`: hoje o contrato é ignorado em silêncio', () => {
  const sv = { _slots: { manchete: 'Noite do vinho' } }

  it('hoje: o render não recebe nada (a página manda) e nenhum erro é levantado', () => {
    expect(temContratoSemantico(sv)).toBe(true)
    expect(slotValuesParaRender(sv, CONTEUDO)).toBeUndefined()
  })

  it('hoje: depois do render, `_slots` continua gravado (slotValuesSeguindo preserva `_…`) e o post vira cópia da página', () => {
    const regravado = comoCopiaDaPagina(slotValuesSeguindo(sv, { Título: 'texto da página' }))
    expect(regravado).toEqual({ _slots: sv._slots, Título: 'texto da página', _copiaDaPagina: true })
    expect(temContratoSemantico(regravado)).toBe(true) // a identidade sobrevive…
    expect(copyPropriaDoPost(regravado)).toBeUndefined() // …mas o contrato nunca chega à arte
  })

  // Checkpoints c–d: a recusa é da ADMISSÃO (CONTRATO_EM_PAGINA_DE_CONTEUDO) e do RENDER (ErroRenderSemantico
  // PAGINA_DE_CONTEUDO, ver story-renderer-contrato-semantico.test.ts, M). slotValuesParaRender segue sendo só o
  // legado: o render detecta o contrato ANTES de chamá-lo.
  it('slotValuesParaRender segue sendo do legado (não lança); quem recusa é a admissão e o render', () => {
    expect(() => slotValuesParaRender(sv, CONTEUDO)).not.toThrow()
  })
})

describe('F–G. legado intacto', () => {
  it('F. por layerId (string ou objeto) e por nome, com o id vencendo — como hoje', () => {
    const camada = { id: 't-h', name: 'Título', content: 'modelo' }
    expect(aplicarSlotNaCamada(camada, { 't-h': 'Por id' }).content).toBe('Por id')
    expect(aplicarSlotNaCamada(camada, { 't-h': { content: 'Por id objeto' } }).content).toBe('Por id objeto')
    expect(aplicarSlotNaCamada(camada, { Título: 'Por nome' }).content).toBe('Por nome')
    expect(aplicarSlotNaCamada(camada, { 't-h': 'Id vence', Título: 'Nome perde' }).content).toBe('Id vence')
    expect(aplicarSlotNaCamada(camada, { 't-h': '' }).content).toBe('modelo') // string vazia mantém a camada
    expect(slotValuesParaRender({ 't-h': 'X' }, MODELO)).toEqual({ 't-h': 'X' })
    expect(slotValuesParaRender({ 't-h': 'X' }, CONTEUDO)).toBeUndefined()
  })

  it('G. chave legada desconhecida: só aviso (nunca recusa); chaves `_…` de controle não avisam', () => {
    const camadas = [{ id: 't-h', name: 'Título' }]
    expect(findUnmatchedSlotKeys(camadas, { inexistente: 'X', 't-h': 'Y', _driveImageId: 'd' })).toEqual(['inexistente'])
    expect(aplicarSlotNaCamada({ id: 't-h', name: 'Título', content: 'modelo' }, { inexistente: 'X' }).content).toBe('modelo')
  })
})

describe('H. quem grava `SocialPost.slotValues` (src/ e scripts/)', () => {
  /**
   * Tripwire: todo arquivo (src/ ou scripts/) que escreve em `socialPost` E menciona `slotValues` tem de estar
   * classificado aqui. Um escritor novo derruba o teste até ser classificado — é por ele que o contrato novo
   * pode entrar (ou ser apagado) sem passar pela validação do B1d.
   *
   * Inclui SQL cru (UPDATE/INSERT em SocialPost perto de slotValues, ou UPDATE com tabela dinâmica).
   *
   * Produção: 9 pontos de escrita, 10 operações (trocarArteDoPost tem duas). As portas do pedido CRU — onde
   * `_slots`/`_papeis` podem chegar — são createPost (src) e create-post/update-post do MCP LOCAL, que gravam
   * pelo Prisma direto, sem passar pelo createPost.
   */
  const ESCRITORES_DE_PRODUCAO: Record<string, string> = {
    'src/lib/posts/later-scheduler.ts': 'createPost — insert com o mapa CRU recebido (API de posts / PostScheduler)',
    'src/lib/creatives/agendar.ts': 'criarPostDoAgendamento — insert com a copy derivada da página (marcada) ou da Generation',
    'src/lib/posts/render-post-art.ts': 'renderPostArt — updateMany após render sem slots aplicados: regrava a cópia da página preservando `_…`',
    'src/lib/posts/trocar-arte-do-post.ts': 'trocarArteDoPost — update em DUAS operações: troca por PÁGINA (cópia marcada) e por GENERATION/galeria (copy visual, ou DbNull)',
    'src/lib/posts/substituir-video-do-post.ts': 'substituirVideoDoPost — update com a cópia dos textos da página (marcada)',
    'scripts/mcp-server.ts': 'MCP LOCAL — create-post (insert CRU do JSON recebido), update-post (EDIÇÃO crua de slotValues) e plan-week (insert de textos por nome + _driveImageId)',
    'scripts/plan-week.ts': 'plan-week (CLI) — insert de textos por nome + _driveImageId',
  }
  const ESCRITORES_PONTUAIS: Record<string, string> = {
    'scripts/create-tero-week-posts.ts': 'uso único (TERO, abril/2026): insert de textos por nome',
    'scripts/marcar-copia-da-pagina.ts': 'backfill da marca _copiaDaPagina: updateMany com slotValuesSeguindo (preserva `_…`)',
    'scripts/recover-blob-db-update.ts': 'recuperação (SQL cru, tabela e coluna DINÂMICAS): troca o host do Blob em toda coluna texto/jsonb, inclusive SocialPost.slotValues — só o host das URLs',
  }
  const PROVAS_DE_INTEGRACAO: Record<string, string> = Object.fromEntries(
    ['validar-camadas-extras', 'validar-contexto-da-semana', 'validar-copy-autoral', 'validar-desfecho-no-agendamento', 'validar-guarda-de-envio-da-prova', 'validar-revisor-da-arte', 'validar-video-na-agenda'].map((n) => [`scripts/${n}.ts`, 'prova no banco de dev: fixtures e leituras']),
  )
  const NAO_ESCREVEM: Record<string, string> = {
    'src/app/api/projects/[projectId]/posts/[postId]/route.ts': 'PUT: só LÊ slotValues (FOR UPDATE) para recusar troca de mídia do contrato (checkpoint e); o update não grava slotValues',
    'src/lib/posts/scheduler.ts': 'PostScheduler: tipa e repassa slotValues ao createPost do later-scheduler',
    'src/lib/posts/executor.ts': 'lê post.slotValues e o passa ao renderPostArt',
    'src/lib/posts/ensure-post-generation.ts': 'lê post.slotValues e grava em Generation.fieldValues (outra tabela)',
    'src/lib/posts/artes-do-post.ts': 'só lê',
    'src/lib/compositor/recompor.ts': 'grava a copy visual em Generation.fieldValues (outra tabela)',
    'src/lib/aprendizado/pilares-service.ts': 'só lê',
    'src/lib/aprendizado/campanhas-retroativas.ts': 'só lê',
  }

  function arquivosTs(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
      const p = join(dir, n)
      if (statSync(p).isDirectory()) return n === '__tests__' || n === 'node_modules' ? [] : arquivosTs(p)
      return /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : []
    })
  }

  it('o conjunto de candidatos em src/ e scripts/ é exatamente o classificado', () => {
    const raiz = process.cwd()
    const candidatos = [...arquivosTs(join(raiz, 'src')), ...arquivosTs(join(raiz, 'scripts'))]
      .filter((f) => {
        const t = readFileSync(f, 'utf8')
        const peloPrisma = /socialPost\.(create|createMany|update|updateMany|upsert)\b/.test(t) && /\bslotValues\b/.test(t)
        // SQL cru: UPDATE/INSERT em SocialPost perto de slotValues, ou UPDATE com tabela DINÂMICA (alcança qualquer coluna)
        const peloSqlCru =
          [...t.matchAll(/(UPDATE|INSERT INTO)\s+"?SocialPost"?/gi)].some((m) => /slotValues/.test(t.slice(m.index, (m.index ?? 0) + 700))) ||
          /(UPDATE|INSERT INTO)\s+"\$\{[^}]+\}"/i.test(t)
        return peloPrisma || peloSqlCru
      })
      .map((f) => relative(raiz, f))
      .sort()
    const classificados = [ESCRITORES_DE_PRODUCAO, ESCRITORES_PONTUAIS, PROVAS_DE_INTEGRACAO, NAO_ESCREVEM].flatMap((m) => Object.keys(m))
    expect(candidatos).toEqual(classificados.sort())
  })

  it('MCP local: create-post e update-post gravam o slotValues CRU recebido; plan-week grava textos por nome', () => {
    const mcp = readFileSync(join(process.cwd(), 'scripts/mcp-server.ts'), 'utf8')
    expect(mcp).toMatch(/slotValues: parsedSlotValues \?\? undefined/) // create-post
    expect(mcp).toMatch(/if \(slotValues !== undefined\) data\.slotValues = JSON\.parse\(slotValues\)/) // update-post
    expect(mcp).toMatch(/const slotValues: Record<string, unknown> = \{ \.\.\.story\.texts \}/) // plan-week
  })

  it('MCP local render-story: SEGUNDO caminho de render — lê slotValues e usa slotValuesParaRender (leitor, não escritor)', () => {
    const mcp = readFileSync(join(process.cwd(), 'scripts/mcp-server.ts'), 'utf8')
    const bloco = mcp.slice(mcp.indexOf("'render-story',"), mcp.indexOf("'plan-week',"))
    expect(bloco).toMatch(/slotValuesParaRender\(slotValues, page\.isTemplate\)/)
  })

  it('a edição pelo PUT da API e pelo editar-post do MCP remoto não grava slotValues', () => {
    const put = readFileSync(join(process.cwd(), 'src/app/api/projects/[projectId]/posts/[postId]/route.ts'), 'utf8')
    // O que o PUT GRAVA: os campos que ele lê do body e o updateData. slotValues não está em nenhum (checkpoint e: ele
    // só o LÊ, com FOR UPDATE, para recusar trocar a mídia de um post com o contrato).
    const corpo = put.slice(put.indexOf('const {\n      postType,'), put.indexOf('} = body'))
    const dados = put.slice(put.indexOf('const updateData'), put.indexOf('// If changing to IMMEDIATE'))
    expect(corpo.length).toBeGreaterThan(0)
    expect(dados.length).toBeGreaterThan(0)
    expect(corpo).not.toMatch(/\bslotValues\b/)
    expect(dados).not.toMatch(/\bslotValues\b/)
    expect(put.match(/\bslotValues\b/g)).toEqual(['slotValues', 'slotValues', 'slotValues']) // o SELECT … FOR UPDATE e a sua leitura
    const agenda = readFileSync(join(process.cwd(), 'src/lib/mcp/catalogo/agenda.ts'), 'utf8')
    const ini = agenda.indexOf("nome: 'editar-post'")
    expect(ini).toBeGreaterThan(-1)
    const bloco = agenda.slice(ini, agenda.indexOf('definirTool(', ini))
    expect(bloco).not.toMatch(/\bslotValues\b/)
  })

  it('o escritor de render preserva `_slots` e só troca os textos (a identidade sobrevive ao re-render)', () => {
    const antes = { _slots: { s: 'x' }, _driveImageId: 'd1', Título: 'velho' }
    const depois = comoCopiaDaPagina(slotValuesSeguindo(antes, { Título: 'novo' }))
    expect(depois).toEqual({ _slots: { s: 'x' }, _driveImageId: 'd1', Título: 'novo', _copiaDaPagina: true })
    expect(temContratoSemantico(depois)).toBe(true)
  })
})
