/**
 * CP0 — P11: o portão antes do rascunho no perfil draft-only.
 *
 * Pelo serviço público do agendar-leva (`agendarItensDoLote`) em SIMULAÇÃO —
 * nada é gravado — com um leitor em memória e o perfil autônomo
 * (`apenasRascunho: true`). A peça é a piloto: a v1 com a medida gravada
 * (`composicao.contraste`, serviço ok:false) e a v2, que nenhuma medida viu.
 * Harness: `lotes/__tests__/agendar-leva-peca-superada.test.ts`.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/compositor/pastas', () => ({ formatoDaPagina: () => 'story', refilarPaginasDoPost: async () => ({ movidas: 0, falhou: false }) }))
const naoCriaPost = vi.hoisted(() => () => {
  throw new Error('a simulação não cria post')
})
vi.mock('@/lib/creatives/agendar', () => ({
  parseBRT: (valor: string) => new Date(`${valor.replace(' ', 'T')}:00-03:00`),
  resolverAgendamento: naoCriaPost,
  criarPostDoAgendamento: naoCriaPost,
  efeitosDoAgendamento: naoCriaPost,
  contextoDosEfeitos: naoCriaPost,
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

function simular(versao: 'v1' | 'v2') {
  const peca = fixture.peca()
  const projectId = Number(peca.spec.projectId)
  const layers: Layer[] = versao === 'v1' ? peca.v1.layers : peca.v2.layers
  const pagina = { width: 1080, height: 1920, background: null, layers, audio: null }
  // A Generation do item é a do compositor (v1). Na v2 a página mudou e a arte do item ficou para trás.
  const v1 = { width: 1080, height: 1920, background: null, layers: peca.v1.layers, audio: null }
  const generation = {
    id: 'gen-v1',
    status: 'COMPLETED',
    resultUrl: PNG_DA_V1,
    slideOrder: null,
    fieldValues: {
      pageId: 'pagina-piloto',
      versaoRenderizada: versaoDaPagina(v1),
      composicao: { contraste: peca.composicaoRegistrada.contraste },
      spec: { formato: 'story', quando: String(peca.spec.quando), tema: String(peca.spec.tema), blocos: peca.spec.blocos },
    },
  }
  const leitor = {
    project: { findUnique: async () => ({ id: projectId }) },
    itemDeLote: {
      findUnique: async () => ({ id: 'item-1', generationId: 'gen-v1', postId: null, hashDoAgendamento: null, efeitosDoAgendamentoEm: null }),
      findMany: async () => [],
    },
    generation: { findFirst: async () => generation },
    generationJob: { findUnique: async () => null },
    page: {
      findUnique: async () => ({ id: 'pagina-piloto', templateId: 42, isTemplate: false, tags: ['compositor', 'story'], thumbnail: PNG_DA_V1, Template: { projectId }, ...pagina }),
    },
    socialPost: { findMany: async () => [], findUnique: async () => null },
    itemDePlano: { findFirst: async () => null },
  } as never
  return agendarItensDoLote({ projectId, loteId: 'dot-piloto-2026-S42', itens: [{ itemId: '2026-10-14T10:00-story' }], simular: true, leitor, apenasRascunho: true })
}

/** "Apta" para o rascunho: o serviço concluiria sem nenhuma bandeira de revisão humana. */
const apta = (item: Record<string, unknown>) => item.situacao === 'concluido' && !JSON.stringify(item).includes(CODIGOS.revisaoHumana)

describe('caracterização: o agendar-leva hoje, no perfil draft-only', () => {
  it('a v1 — com o serviço medido sem leitura (ok:false) — vira rascunho RENDERED', async () => {
    const r = await simular('v1')
    expect(fixture.peca().composicaoRegistrada.contraste.some((m) => !m.ok)).toBe(true)
    expect(r.itens[0]).toMatchObject({ situacao: 'concluido', desfecho: 'criado', renderStatus: 'RENDERED', estadoDoPost: 'rascunho' })
  })

  it('a v2 — que nenhuma medida viu depois do ajuste — também vira rascunho (o render sai da página)', async () => {
    const r = await simular('v2')
    expect(r.itens[0]).toMatchObject({ situacao: 'concluido', desfecho: 'criado', estadoDoPost: 'rascunho' })
  })
})

describe('P11 — portão', () => {
  hojeViola('a v1, com violação estrutural medida, não é considerada apta no draft-only', async () => {
    const item = (await simular('v1')).itens[0] as unknown as Record<string, unknown>
    expect(apta(item), JSON.stringify(item)).toBe(false)
  })

  hojeViola('a v2, sem veredito para a versão atual da página, não é considerada apta no draft-only', async () => {
    const item = (await simular('v2')).itens[0] as unknown as Record<string, unknown>
    expect(apta(item), JSON.stringify(item)).toBe(false)
  })
})
