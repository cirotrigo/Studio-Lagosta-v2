// Cenários sintéticos; não representam cliente, pessoa ou aprovação real.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  atestarFonteDeTexto,
  hashDoTextoAprovado,
  hashDoDnaDeTexto,
} from '../texto-aprovado'
import type { VozCompacta } from '../voz'
const service = vi.hoisted(() => ({ gravar: vi.fn(), migrar: vi.fn() }))
vi.mock('../voz-service', () => ({
  gravarVoz: service.gravar,
  migrarParaVoz: service.migrar,
}))
import {
  aplicarManifesto,
  lerEstadoDoCliente,
} from '../../../../scripts/migrar-voz-da-marca'
const voz: VozCompacta = {
  versao: 'voz-v1',
  descricao: 'Popular e acolhedor.',
  tratamento: 'você',
  termos: [],
  exemplos: ['CTAs (lista fechada): Explore o planeta! · Acenda a estrela!'],
  antesDepois: [],
  proibicoes: ['CTAs: lista fechada, cópia literal.'],
  regras: [],
}
const originalDna = {
  toneOfVoice: 'CTAs (lista fechada): Explore o planeta!',
  contentRules: '',
  updatedAt: new Date('2026-10-04T00:00:00Z'),
}
const documento = {
  projectId: 6,
  vozSha256: hashDoTextoAprovado(voz),
  dnaSha256: hashDoDnaDeTexto(originalDna),
  fonte: {
    referencia: 'chamada conferida',
    trecho: 'Acenda a estrela!',
    aprovadoPor: 'Pessoa de teste',
    aprovadoEm: '2026-10-04T00:00:00Z',
  },
  ctas: [{ literal: 'Acenda a estrela!', condicao: null }],
}
beforeEach(() => {
  service.gravar.mockReset().mockResolvedValue({ versao: 1, voz, criada: true })
  service.migrar
    .mockReset()
    .mockResolvedValue({
      versao: 1,
      migradaEm: new Date('2026-10-04T12:00:00Z'),
      jaEstava: false,
    })
})
describe('manifesto só recebe hash; capacidade de fonte vem da execução autorizada', () => {
  async function preparar() {
    let dna = structuredClone(originalDna)
    const db = {
      project: {
        findUnique: vi.fn(async () => ({
          id: 6,
          name: 'Estação Aurora',
          userId: 'dono',
        })),
      },
      brandDNA: { findUnique: vi.fn(async () => dna) },
      brandVoice: { findUnique: vi.fn(async () => null) },
      knowledgeBaseEntry: {},
      $queryRaw: vi.fn(async () => [{ existe: 'BrandVoice' }]),
    }
    const fonte = await atestarFonteDeTexto({
      documento,
      sha256Esperado: hashDoTextoAprovado(documento),
      conferirOrigem: async () => true,
    })
    const contexto = { projectId: 6, fonte }
    const state = await lerEstadoDoCliente(db as never, 6, {
      voz,
      textoAprovado: contexto,
    })
    const manifesto = {
      versao: 'manifesto-voz-v1' as const,
      geradoEm: '2026-10-04',
      clientes: [
        {
          projectId: 6,
          nome: 'Estação Aurora',
          versaoDaPrevia: state!.estado.versaoDaPreviaAtual,
          fonteDeTextoSha256: hashDoTextoAprovado(documento),
          decisao: 'migrar' as const,
          aprovadoPor: 'Pessoa de teste',
          aprovadoEm: '2026-10-04',
          fatosParaABase: [],
        },
      ],
    }
    return {
      db,
      fonte,
      manifesto,
      mudarDna: () => {
        dna = { ...dna, contentRules: 'Alteração concorrente' }
      },
    }
  }
  it('mantém a prévia e passa capacidade apenas para cliente aprovado', async () => {
    const { db, fonte, manifesto } = await preparar()
    const result = await aplicarManifesto(db as never, manifesto, {
      fontesDeTexto: new Map([[6, fonte]]),
      vozesPropostas: new Map([[6, voz]]),
      criarFato: vi.fn(),
      comTrava: async (_id, corpo) =>
        corpo({
          conferir: async () => {},
          vigiar: (fn) => fn(new AbortController().signal),
          pid: 1,
        }),
    })
    expect(result[0]).toMatchObject({ acao: 'migrar', vozVersao: 1 })
    expect(service.migrar).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 6,
        textoAprovado: { projectId: 6, fonte },
        dnaEsperado: { toneOfVoice: originalDna.toneOfVoice, contentRules: '' },
      })
    )
    expect(originalDna.toneOfVoice).not.toContain('Acenda a estrela!')
  })
  it('manifesto sozinho não permite aprovação externa', async () => {
    const { db, manifesto } = await preparar()
    const result = await aplicarManifesto(db as never, manifesto, {
      vozesPropostas: new Map([[6, voz]]),
      criarFato: vi.fn(),
    })
    expect(result[0]).toMatchObject({ acao: 'bloqueado' })
    expect(service.gravar).not.toHaveBeenCalled()
  })
  it('DNA alterado sob trava para antes da voz e dos fatos', async () => {
    const { db, fonte, manifesto, mudarDna } = await preparar()
    const criar = vi.fn()
    const result = await aplicarManifesto(db as never, manifesto, {
      fontesDeTexto: new Map([[6, fonte]]),
      vozesPropostas: new Map([[6, voz]]),
      criarFato: criar,
      comTrava: async (_id, corpo) => {
        mudarDna()
        return corpo({
          conferir: async () => {},
          vigiar: (fn) => fn(new AbortController().signal),
          pid: 1,
        })
      },
    })
    expect(result[0].erro).toContain('outro projeto/voz/DNA')
    expect(service.gravar).not.toHaveBeenCalled()
    expect(criar).not.toHaveBeenCalled()
  })
})
