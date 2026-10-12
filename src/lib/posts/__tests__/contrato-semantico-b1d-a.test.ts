/**
 * B1d — checkpoint a: CARACTERIZAÇÃO e identidade do contrato semântico novo em `SocialPost.slotValues`.
 *
 * Fixa (1) quando um post usa o contrato novo — presença PRÓPRIA da chave `_slots` ou `_papeis`, nunca o
 * valor; (2) quais caminhos gravam `SocialPost.slotValues`; (3) a diferença página MODELO × CONTEÚDO; (4) o
 * que o legado faz hoje e continua fazendo. Nada aqui aplica, valida ou recusa o contrato: isso é dos
 * checkpoints b–g. Os `it.fails` marcam o comportamento que o B1d vai mudar — passam enquanto o gap existe.
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

  it.fails('B1d (c–d): a camada do slot `manchete` recebe o texto pedido', () => {
    expect(aplicarSlotNaCamada(camada, sv).content).toBe('Noite do vinho')
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

  it.fails('B1d (c): contrato novo em página de conteúdo é RECUSADO, não ignorado', () => {
    // Hoje não há recusa: slotValuesParaRender devolve undefined e nada lança.
    expect(() => slotValuesParaRender(sv, CONTEUDO)).toThrow()
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

describe('H. quem grava `SocialPost.slotValues`: 5 pontos de escrita, 6 operações', () => {
  /**
   * Tripwire: todo arquivo de produção que escreve em `socialPost` E menciona `slotValues` tem de estar
   * classificado aqui. Um escritor novo derruba o teste até ser classificado — é por ele que o contrato
   * novo pode entrar (ou ser apagado) sem passar pela validação do B1d.
   */
  const ESCREVEM_SLOTVALUES: Record<string, string> = {
    'src/lib/posts/later-scheduler.ts': 'createPost — insert com o mapa CRU recebido (API de posts / PostScheduler): a ÚNICA porta do pedido semântico',
    'src/lib/creatives/agendar.ts': 'criarPostDoAgendamento — insert com a copy derivada da página (marcada) ou da Generation; nunca `_slots`',
    'src/lib/posts/render-post-art.ts': 'renderPostArt — updateMany após render sem slots aplicados: regrava a cópia da página preservando `_…`',
    'src/lib/posts/trocar-arte-do-post.ts': 'trocarArteDoPost — update em DUAS operações: troca por PÁGINA (cópia marcada) e por GENERATION/galeria (copy visual, ou DbNull)',
    'src/lib/posts/substituir-video-do-post.ts': 'substituirVideoDoPost — update com a cópia dos textos da página (marcada), dentro de transação',
  }
  const NAO_ESCREVEM: Record<string, string> = {
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

  it('o conjunto de candidatos é exatamente o classificado (5 escritores + leitores conhecidos)', () => {
    const raiz = process.cwd()
    const candidatos = arquivosTs(join(raiz, 'src'))
      .filter((f) => {
        const t = readFileSync(f, 'utf8')
        return /socialPost\.(create|createMany|update|updateMany|upsert)\b/.test(t) && /\bslotValues\b/.test(t)
      })
      .map((f) => relative(raiz, f))
      .sort()
    expect(candidatos).toEqual([...Object.keys(ESCREVEM_SLOTVALUES), ...Object.keys(NAO_ESCREVEM)].sort())
    expect(Object.keys(ESCREVEM_SLOTVALUES)).toHaveLength(5)
  })

  it('a edição de post (PUT da API e editar-post do MCP) não grava slotValues', () => {
    const put = readFileSync(join(process.cwd(), 'src/app/api/projects/[projectId]/posts/[postId]/route.ts'), 'utf8')
    expect(put).not.toMatch(/\bslotValues\b/)
    const agenda = readFileSync(join(process.cwd(), 'src/lib/mcp/catalogo/agenda.ts'), 'utf8')
    const ini = agenda.indexOf("nome: 'editar-post'")
    expect(ini).toBeGreaterThan(-1)
    const bloco = agenda.slice(ini, agenda.indexOf("definirTool(", ini))
    expect(bloco).not.toMatch(/\bslotValues\b/)
  })

  it('o escritor de render preserva `_slots` e só troca os textos (a identidade sobrevive ao re-render)', () => {
    const antes = { _slots: { s: 'x' }, _driveImageId: 'd1', Título: 'velho' }
    const depois = comoCopiaDaPagina(slotValuesSeguindo(antes, { Título: 'novo' }))
    expect(depois).toEqual({ _slots: { s: 'x' }, _driveImageId: 'd1', Título: 'novo', _copiaDaPagina: true })
    expect(temContratoSemantico(depois)).toBe(true)
  })
})
