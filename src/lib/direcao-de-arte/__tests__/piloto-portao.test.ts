/**
 * CP0 — P11: o portão antes do rascunho no perfil draft-only.
 *
 * Pelo serviço público do agendar-leva (`agendarItensDoLote`), no perfil
 * autônomo (`apenasRascunho: true`), por dois caminhos:
 * - SIMULAÇÃO (`simular: true`, leitor em memória): o que o Dot vê antes de gravar;
 * - ESCRITA de verdade (`simular: false`): a transação roda até
 *   `criarPostDoAgendamento`, que aqui é um espião que REGISTRA a criação e
 *   interrompe — prova que o rascunho seria criado, sem depender dos efeitos
 *   depois do commit.
 * A peça é a piloto: a v1 com a medida gravada (serviço ok:false) e a v2, que
 * nenhuma medida viu. O controle positivo é a mesma peça com a medida limpa.
 *
 * CONTRATO ALVO da V1 (decisão do owner, 13/10/2026): peça estruturalmente
 * não apta NÃO cria rascunho — nem marcado. O item volta com
 * REVISAO_HUMANA_NECESSARIA e as referências para a intervenção (generationId,
 * pageId, editUrl e os achados estruturais). Rascunho ruim entraria na fila
 * de aprovação, contaria como cobertura e poderia ser aprovado por engano.
 * Harness: `lotes/__tests__/agendar-leva-peca-superada.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const estado = vi.hoisted(() => ({
  db: null as Record<string, any> | null,
  criados: [] as unknown[],
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

import type { Layer } from '@/types/template'
import { agendarItensDoLote } from '@/lib/lotes/agendar-itens'
import { versaoDaPagina } from '@/lib/creatives/revisao/versao'
import { fixture } from './suporte/fixture'
import { hojeViola } from './suporte/hoje-viola'
import { CODIGOS } from './suporte/propriedades'

/** Endereço falso, nunca buscado: a cobertura só exige que a mídia "pareça" pronta. */
const PNG_DA_V1 = 'https://blob.test/piloto-v1.png'
const LOTE = 'dot-piloto-2026-S42'
const ITEM = '2026-10-14T10:00-story'

type Versao = 'v1' | 'v2' | 'limpa'

/** O banco em memória da peça: a v1 (medida gravada), a v2 (página mudou, sem medida) ou a v1 com a medida LIMPA (controle). */
function cenario(versao: Versao) {
  const peca = fixture.peca()
  const projectId = Number(peca.spec.projectId)
  const layers: Layer[] = versao === 'v2' ? peca.v2.layers : peca.v1.layers
  const pagina = { width: 1080, height: 1920, background: null, layers, audio: null }
  const v1 = { width: 1080, height: 1920, background: null, layers: peca.v1.layers, audio: null }
  const contraste = versao === 'limpa' ? peca.composicaoRegistrada.contraste.map((m) => ({ ...m, ok: true, textos: m.textos?.map((t) => ({ ...t, ok: true })) })) : peca.composicaoRegistrada.contraste
  // A Generation do item é a do compositor (v1). Na v2 a página mudou e a arte do item ficou para trás.
  const generation = {
    id: 'gen-v1',
    status: 'COMPLETED',
    resultUrl: PNG_DA_V1,
    slideOrder: null,
    fieldValues: {
      pageId: 'pagina-piloto',
      versaoRenderizada: versaoDaPagina(v1),
      composicao: { contraste },
      spec: { formato: 'story', quando: String(peca.spec.quando), tema: String(peca.spec.tema), blocos: peca.spec.blocos },
    },
  }
  const banco: Record<string, any> = {
    project: { findUnique: async () => ({ id: projectId }) },
    itemDeLote: {
      findUnique: async () => ({ id: 'item-1', generationId: 'gen-v1', postId: null, hashDoAgendamento: null, efeitosDoAgendamentoEm: null }),
      findMany: async () => [],
      updateMany: async () => ({ count: 1 }),
    },
    generation: { findFirst: async () => generation },
    generationJob: { findUnique: async () => null },
    page: {
      findUnique: async () => ({ id: 'pagina-piloto', templateId: 42, isTemplate: false, tags: ['compositor', 'story'], thumbnail: PNG_DA_V1, Template: { projectId }, ...pagina }),
    },
    socialPost: { findMany: async () => [], findUnique: async () => null },
    itemDePlano: { findFirst: async () => null },
    $queryRaw: async () => [],
  }
  banco.$transaction = async (fn: (tx: unknown) => unknown) => fn(banco)
  return { projectId, banco }
}

beforeEach(() => {
  estado.db = {}
  estado.criados = []
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
  if (item.pageId !== 'pagina-piloto') faltas.push(`pageId ${String(item.pageId)}`)
  if (typeof item.editUrl !== 'string' || !item.editUrl.includes('pageId=pagina-piloto')) faltas.push(`editUrl ${String(item.editUrl)}`)
  // Achado estrutural no formato do revisor (`AchadoDaRevisao`): a regra e as camadas envolvidas.
  const achados = (Array.isArray(item.achados) ? item.achados : []) as Array<{ regra?: unknown; camadas?: unknown }>
  const bemFormados = achados.filter((a) => typeof a?.regra === 'string' && Array.isArray(a?.camadas))
  if (bemFormados.length === 0) faltas.push('sem achados estruturais (regra + camadas)')
  else if (versao === 'v1' && !bemFormados.some((a) => (a.camadas as unknown[]).includes('servico'))) faltas.push('nenhum achado sobre a camada do serviço sem leitura')
  return faltas
}

describe('caracterização: o agendar-leva hoje, no perfil draft-only', () => {
  it('simulação: a v1 — com o serviço medido sem leitura (ok:false) — vira rascunho RENDERED', async () => {
    expect(fixture.peca().composicaoRegistrada.contraste.some((m) => !m.ok)).toBe(true)
    expect(await simular('v1')).toMatchObject({ situacao: 'concluido', desfecho: 'criado', renderStatus: 'RENDERED', estadoDoPost: 'rascunho' })
  })

  it('simulação: a v2 — que nenhuma medida viu depois do ajuste — também vira rascunho (o render sai da página)', async () => {
    expect(await simular('v2')).toMatchObject({ situacao: 'concluido', desfecho: 'criado', estadoDoPost: 'rascunho' })
  })

  it('escrita de verdade: a transação chega a criar o post da v1 e da v2', async () => {
    expect((await escrever('v1')).criados).toHaveLength(1)
    estado.criados = []
    expect((await escrever('v2')).criados).toHaveLength(1)
  })
})

describe('controle positivo: a peça com a medida limpa continua apta', () => {
  // Quando o portão existir (CP5), este controle passa a montar o veredito favorável da versão atual.
  it('simulação: vira rascunho sem bandeira de revisão humana', async () => {
    const item = await simular('limpa')
    expect(item).toMatchObject({ situacao: 'concluido', desfecho: 'criado', estadoDoPost: 'rascunho' })
    expect(sinalizada(item)).toBe(false)
  })

  it('escrita de verdade: o post é criado', async () => {
    expect((await escrever('limpa')).criados).toHaveLength(1)
  })
})

// "Não criar" e "devolver as referências" são propriedades separadas: cada uma vira it() no checkpoint que a cumprir.
describe('P11 — portão (contrato alvo: peça não apta não cria rascunho)', () => {
  for (const versao of ['v1', 'v2'] as const) {
    const qual = versao === 'v1' ? 'a v1, com violação estrutural medida,' : 'a v2, sem veredito para a versão atual da página,'

    hojeViola(`simulação: ${qual} não seria criada como rascunho`, async () => {
      const item = await simular(versao)
      expect(naoCriada(item), JSON.stringify(item)).toBe(true)
    })

    hojeViola(`simulação: ${qual} volta com REVISAO_HUMANA_NECESSARIA e as referências da peça`, async () => {
      const faltas = referenciasQueFaltam(await simular(versao), versao)
      expect(faltas, JSON.stringify(faltas)).toEqual([])
    })

    hojeViola(`escrita de verdade: ${qual} não cria post nenhum`, async () => {
      const { criados } = await escrever(versao)
      expect(criados.length, `${criados.length} post(s) criado(s)`).toBe(0)
    })

    hojeViola(`escrita de verdade: ${qual} volta com REVISAO_HUMANA_NECESSARIA e as referências da peça`, async () => {
      const { item } = await escrever(versao)
      const faltas = referenciasQueFaltam(item, versao)
      expect(faltas, JSON.stringify(faltas)).toEqual([])
    })
  }
})
