/**
 * CP0 — P11: o portão antes do rascunho no perfil draft-only. **CP5c (16/10/2026): os 8 `hojeViola` viraram `it()`.**
 *
 * Pelo serviço público do agendar-leva (`agendarItensDoLote`), no perfil
 * autônomo (`apenasRascunho: true`), por dois caminhos:
 * - SIMULAÇÃO (`simular: true`, leitor em memória): o que o Dot vê antes de gravar;
 * - ESCRITA de verdade (`simular: false`): a transação roda até
 *   `criarPostDoAgendamento`, que aqui é um espião que REGISTRA a criação e
 *   interrompe — prova que o rascunho seria criado, sem depender dos efeitos
 *   depois do commit.
 * A MEDIÇÃO É A DE VERDADE (`contextoDaMedicao` + `medirCamadasDaPeca` sobre a
 * fixture: fontes da marca declaradas presentes, régua em memória sobre a foto
 * reconstruída, logo da fixture), como no `piloto-ciclo.test.ts`: é isso que
 * faz os achados da v1 serem os do serviço, não um mock.
 * A peça é a piloto: a v1 (o compositor; o serviço sem leitura) e a v2 (a
 * página depois do ajuste, com a Generation para trás — a composição gravada
 * não é cache, § 4.3 do CP5c). O controle positivo é uma peça LIMPA de verdade
 * (fundo liso, três textos com contraste, sem foto e sem logo): a mesma medição
 * a aprova.
 *
 * CONTRATO da V1 (decisão do owner, 13/10/2026): peça estruturalmente não apta
 * NÃO cria rascunho — nem marcado. O item volta com REVISAO_HUMANA_NECESSARIA
 * e as referências para a intervenção (generationId, pageId, editUrl e os
 * achados estruturais).
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const estado = vi.hoisted(() => ({
  db: null as Record<string, any> | null,
  criados: [] as unknown[],
  /** Os `UPDATE "Generation"` do registro do gate (CP5b): [patch, generationId, projectId, pageId, …]. */
  gravacoes: [] as unknown[][],
  foto: null as Buffer | null,
  PARADA: 'parada do teste: o post seria criado aqui',
}))
// O `db` do serviço é o banco em memória do cenário (o mesmo leitor da simulação, com transação).
vi.mock('@/lib/db', () => ({ db: new Proxy({}, { get: (_alvo, chave) => estado.db?.[chave as string] }) }))
vi.mock('@/lib/compositor/pastas', () => ({ formatoDaPagina: () => 'story', refilarPaginasDoPost: async () => ({ movidas: 0, falhou: false }) }))
vi.mock('@/lib/creatives/agendar', () => ({
  parseBRT: (valor: string) => new Date(`${valor.replace(' ', 'T')}:00-03:00`),
  resolverAgendamento: async (input: unknown) => ({ input, avisos: [] }),
  criarPostDoAgendamento: async (_tx: unknown, resolucao: unknown) => {
    estado.criados.push(resolucao)
    throw new Error(estado.PARADA)
  },
  efeitosDoAgendamento: () => {
    throw new Error('efeitos não rodam no teste')
  },
  contextoDosEfeitos: () => {
    throw new Error('efeitos não rodam no teste')
  },
}))
vi.mock('@/lib/creatives/persist', () => ({ getPublicAppUrl: () => 'https://studio.test' }))
// A foto da peça vem da fixture (data URL nas camadas; o `fetchBuffer` do assunto devolve os bytes reconstruídos).
vi.mock('@/lib/posts/register-project-fonts', () => ({
  registerProjectFonts: async () => undefined,
  fetchBuffer: async (url: string) => {
    if (url.startsWith('data:image/png;base64,') && estado.foto) return estado.foto
    throw new Error(`sem arquivo para ${url.slice(0, 40)}`)
  },
  familiasNaoCarregadas: async () => new Set<string>(),
}))
vi.mock('@/lib/creatives/server-text-measurer', async () => {
  const { medidor } = await import('./suporte/medidor-do-piloto')
  return { createServerTextBoxMeasurer: async () => medidor, createServerTextMeasurer: async () => (l: any) => medidor(l)?.height ?? null }
})
// As fontes da marca não existem neste ambiente — artefato do teste, não da peça (ver `piloto-ciclo.test.ts`).
vi.mock('@napi-rs/canvas', async (original) => {
  const m = await original<typeof import('@napi-rs/canvas')>()
  const daFixture = ['Branley GC', 'StageGrotesk Thin', 'StageGrotesk Regular'].map((family) => ({ family, styles: [400, 700].map((weight) => ({ weight, width: 'normal', style: 'normal' })) }))
  const GlobalFonts = new Proxy(m.GlobalFonts, {
    get(alvo, prop, receptor) {
      if (prop === 'families') return [...(alvo as any).families, ...daFixture]
      const v = Reflect.get(alvo, prop, receptor)
      return typeof v === 'function' ? v.bind(alvo) : v
    },
  })
  return { ...m, GlobalFonts }
})

import type { Layer } from '@/types/template'
import { agendarItensDoLote } from '@/lib/lotes/agendar-itens'
import { versaoDaPagina } from '@/lib/creatives/revisao/versao'
import { arquivosDaFixture, comArquivos, fixture, fotoReconstruida } from './suporte/fixture'
import { CODIGOS } from './suporte/propriedades'

/** Endereço falso, nunca buscado: a cobertura só exige que a mídia "pareça" pronta. */
const PNG_DA_V1 = 'https://blob.test/piloto-v1.png'
const LOTE = 'dot-piloto-2026-S42'
const ITEM = '2026-10-14T10:00-story'
const PAGINA = 'pagina-piloto'
const NOME = 'Qua 14/10 · 10:00 · story'

type Versao = 'v1' | 'v2' | 'limpa'
let arquivos: Record<string, string>

/** O contrato da copy da peça piloto, pelos blocos da spec (o que o compositor grava em `Page.copyAutoral`). */
const copyDaFixture = () => ({
  versao: 'copy-autoral-v1',
  origem: { autor: 'claude', superficie: 'chat' },
  revisoes: [],
  blocos: fixture.peca().spec.blocos.map((b, i) => ({ id: b.papel, funcao: b.papel, ordem: b.ordem ?? i, linhas: b.linhas })),
})

/** O controle positivo: fundo liso escuro, três textos claros, sem foto e sem logo — uma peça que a medição REAL aprova. */
const texto = (id: string, papel: string, y: number, fontSize: number, content: string): Layer =>
  ({
    id, name: id, type: 'text', visible: true, locked: false, order: 3, content,
    position: { x: 100, y }, size: { width: 880, height: Math.round(fontSize * 1.5) },
    style: { fontSize, lineHeight: 1.2, textAlign: 'left', color: '#FFFFFF' },
    metadata: { compositor: { papel } },
  }) as Layer
const PECA_LIMPA = {
  layers: [texto('headline', 'headline', 400, 84, 'Texto headline'), texto('apoio', 'apoio', 560, 40, 'Texto apoio'), texto('servico', 'servico', 1500, 32, 'Texto servico')],
  background: '#000000',
  copy: {
    versao: 'copy-autoral-v1',
    origem: { autor: 'claude', superficie: 'chat' },
    revisoes: [],
    blocos: [
      { id: 'headline', funcao: 'headline', ordem: 0, linhas: ['Texto headline'] },
      { id: 'apoio', funcao: 'apoio', ordem: 1, linhas: ['Texto apoio'] },
      { id: 'servico', funcao: 'servico', ordem: 2, linhas: ['Texto servico'] },
    ],
  },
}

/** O banco em memória da peça: a v1 (a arte é desta versão), a v2 (página mudou, Generation para trás) ou a peça limpa (controle). */
function cenario(versao: Versao) {
  const peca = fixture.peca()
  const assinatura = fixture.assinatura()
  const projectId = Number(peca.spec.projectId)
  const layers: Layer[] = versao === 'limpa' ? PECA_LIMPA.layers : comArquivos(versao === 'v2' ? peca.v2.layers : peca.v1.layers, arquivos)
  const background = versao === 'limpa' ? PECA_LIMPA.background : null
  const pagina = { width: 1080, height: 1920, background, layers, audio: null }
  // A Generation do item: na v1 e na limpa a arte É desta versão da página; na v2 a página mudou e a arte ficou para trás.
  const renderizada = versao === 'v2' ? { ...pagina, layers: comArquivos(peca.v1.layers, arquivos) } : pagina
  const generation = {
    id: 'gen-v1',
    projectId,
    status: 'COMPLETED',
    resultUrl: PNG_DA_V1,
    slideOrder: null,
    sourcePageId: null,
    fieldValues: {
      source: 'compositor',
      pageId: PAGINA,
      versaoRenderizada: versaoDaPagina(renderizada),
      // A assinatura com que a peça foi composta: é dela que sai a referência de corpo do título (`texto-pequeno:modelo`).
      composicao: { contraste: peca.composicaoRegistrada.contraste, assinatura: { pageId: assinatura.pagina.id } },
      spec: { formato: 'story', quando: String(peca.spec.quando), tema: String(peca.spec.tema), blocos: peca.spec.blocos },
    },
  }
  const paginaCompleta = {
    id: PAGINA, templateId: 42, isTemplate: false, name: NOME, tags: ['compositor', 'story'], thumbnail: PNG_DA_V1,
    copyAutoral: versao === 'limpa' ? PECA_LIMPA.copy : copyDaFixture(), updatedAt: new Date('2026-10-14T12:00:00Z'), Template: { projectId }, ...pagina,
  }
  const banco: Record<string, any> = {
    project: { findUnique: async () => ({ id: projectId, assinatura: fixture.assinatura().numerosDoProjeto }) },
    customFont: { findMany: async () => [] },
    itemDeLote: {
      findUnique: async () => ({ id: 'item-1', generationId: 'gen-v1', postId: null, hashDoAgendamento: null, efeitosDoAgendamentoEm: null }),
      findMany: async () => [],
      updateMany: async () => ({ count: 1 }),
    },
    generation: { findFirst: async () => generation },
    generationJob: { findUnique: async () => null },
    page: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === assinatura.pagina.id ? { ...assinatura.pagina, layers: comArquivos(assinatura.pagina.layers, arquivos) } : paginaCompleta,
    },
    socialPost: { findMany: async () => [], findUnique: async () => null },
    itemDePlano: { findFirst: async () => null },
    $queryRaw: async () => [],
    $executeRaw: async (_partes: TemplateStringsArray, ...valores: unknown[]) => {
      estado.gravacoes.push(valores)
      return 1
    },
  }
  banco.$transaction = async (fn: (tx: unknown) => unknown) => fn(banco)
  return { projectId, banco }
}

beforeAll(async () => {
  arquivos = await arquivosDaFixture()
  estado.foto = await fotoReconstruida()
}, 60_000)

beforeEach(() => {
  estado.db = {}
  estado.criados = []
  estado.gravacoes = []
})

async function simular(versao: Versao) {
  const { projectId, banco } = cenario(versao)
  const r = await agendarItensDoLote({ projectId, loteId: LOTE, itens: [{ itemId: ITEM }], simular: true, leitor: banco as never, apenasRascunho: true })
  return r.itens[0] as unknown as Record<string, unknown>
}

/**
 * A escrita de verdade: devolve as criações de post que a transação tentou (o
 * espião interrompe na primeira) e o item da resposta, quando o serviço volta.
 */
async function escrever(versao: Versao): Promise<{ criados: unknown[]; item: Record<string, unknown> | null }> {
  const { projectId, banco } = cenario(versao)
  estado.db = banco
  try {
    const r = await agendarItensDoLote({ projectId, loteId: LOTE, itens: [{ itemId: ITEM }], apenasRascunho: true })
    return { criados: estado.criados, item: r.itens[0] as unknown as Record<string, unknown> }
  } catch (e) {
    if (!(e instanceof Error) || e.message !== estado.PARADA) throw e
    return { criados: estado.criados, item: null }
  }
}

/** Qualquer menção ao código (para o controle positivo: a peça limpa não pode carregá-lo). */
const sinalizada = (resposta: unknown) => JSON.stringify(resposta).includes(CODIGOS.revisaoHumana)

/** Peça não apta: o item não conclui como rascunho criado. */
const naoCriada = (item: Record<string, unknown> | null) => !item || (item.desfecho !== 'criado' && item.situacao !== 'concluido')

/**
 * As referências para a intervenção, conferidas pelo VALOR: o código
 * REVISAO_HUMANA_NECESSARIA, a Generation e a página da peça, o link do editor
 * desta página e os achados estruturais (na v1, os do serviço sem leitura).
 */
function referenciasQueFaltam(item: Record<string, unknown> | null, versao: Versao): string[] {
  if (!item) return ['o serviço não devolveu o item']
  const faltas: string[] = []
  if (item.codigo !== CODIGOS.revisaoHumana) faltas.push(`codigo ${String(item.codigo)} ≠ ${CODIGOS.revisaoHumana}`)
  if (item.generationId !== 'gen-v1') faltas.push(`generationId ${String(item.generationId)}`)
  if (item.pageId !== PAGINA) faltas.push(`pageId ${String(item.pageId)}`)
  if (typeof item.editUrl !== 'string' || !item.editUrl.includes(`pageId=${PAGINA}`)) faltas.push(`editUrl ${String(item.editUrl)}`)
  // Achado estrutural no formato do revisor (`AchadoDaRevisao`): a regra e as camadas envolvidas.
  const achados = (Array.isArray(item.achados) ? item.achados : []) as Array<{ regra?: unknown; camadas?: unknown }>
  const bemFormados = achados.filter((a) => typeof a?.regra === 'string' && Array.isArray(a?.camadas))
  if (bemFormados.length === 0) faltas.push('sem achados estruturais (regra + camadas)')
  else if (versao === 'v1' && !bemFormados.some((a) => (a.camadas as unknown[]).includes('servico'))) faltas.push('nenhum achado sobre a camada do serviço sem leitura')
  return faltas
}

describe('controle positivo: a peça limpa continua apta (medição real)', () => {
  it('simulação: vira rascunho sem bandeira de revisão humana, com a revisao medida APTO e nada gravado', async () => {
    const item = await simular('limpa')
    expect(item, JSON.stringify(item)).toMatchObject({ situacao: 'concluido', desfecho: 'criado', estadoDoPost: 'rascunho', revisao: { tipo: 'medida', resultado: 'APTO' }, achados: [], motivos: [] })
    expect(sinalizada(item)).toBe(false)
    expect(estado.gravacoes).toEqual([])
  }, 60_000)

  it('escrita de verdade: o registro APTO é gravado na Generation ANTES do post, e o post é criado', async () => {
    expect((await escrever('limpa')).criados).toHaveLength(1)
    expect(estado.gravacoes).toHaveLength(1)
    const [patch, generationId, projectId, pageId] = estado.gravacoes[0]
    expect([generationId, projectId, pageId]).toEqual(['gen-v1', Number(fixture.peca().spec.projectId), PAGINA])
    expect(JSON.parse(patch as string).gateDaArte).toMatchObject({ gate: { resultado: 'APTO' }, origem: 'agendar-leva', identidade: { generationId: 'gen-v1', pageId: PAGINA } })
  }, 60_000)
})

describe('P11 — portão: peça não apta não cria rascunho (CP5c)', () => {
  for (const versao of ['v1', 'v2'] as const) {
    const qual = versao === 'v1' ? 'a v1, com violação estrutural medida,' : 'a v2, com a página mudada e a Generation para trás (medida de novo, sem o cache da composição),'

    it(`simulação: ${qual} não é criada como rascunho`, async () => {
      const item = await simular(versao)
      expect(naoCriada(item), JSON.stringify(item)).toBe(true)
      expect(estado.gravacoes, 'a simulação não grava nem o registro').toEqual([])
    }, 60_000)

    it(`simulação: ${qual} volta com REVISAO_HUMANA_NECESSARIA e as referências da peça`, async () => {
      const item = await simular(versao)
      const faltas = referenciasQueFaltam(item, versao)
      expect(faltas, JSON.stringify({ faltas, item })).toEqual([])
      expect(item.revisao).toMatchObject({ tipo: 'medida', resultado: CODIGOS.revisaoHumana })
    }, 60_000)

    it(`escrita de verdade: ${qual} não cria post nenhum — e o veredito reprovado fica registrado`, async () => {
      const { criados } = await escrever(versao)
      expect(criados.length, `${criados.length} post(s) criado(s)`).toBe(0)
      expect(estado.gravacoes).toHaveLength(1)
      expect(JSON.parse(estado.gravacoes[0][0] as string).gateDaArte.gate.resultado).toBe(CODIGOS.revisaoHumana)
    }, 60_000)

    it(`escrita de verdade: ${qual} volta com REVISAO_HUMANA_NECESSARIA e as referências da peça`, async () => {
      const { item } = await escrever(versao)
      const faltas = referenciasQueFaltam(item, versao)
      expect(faltas, JSON.stringify({ faltas, item })).toEqual([])
    }, 60_000)
  }
})
