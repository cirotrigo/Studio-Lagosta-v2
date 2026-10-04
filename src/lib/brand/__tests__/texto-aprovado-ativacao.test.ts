// Cenários sintéticos; não representam cliente, pessoa ou aprovação real.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  atestarFonteDeTexto,
  hashDoDnaDeTexto,
  hashDoTextoAprovado,
} from '../texto-aprovado'
import type { VozCompacta } from '../voz'
const s = vi.hoisted(() => ({
  voz: null as unknown,
  dna: null as unknown,
  hook: null as (() => void) | null,
  updates: vi.fn(),
  locks: vi.fn(),
}))
vi.mock('@/lib/db', () => {
  const tx = {
    $queryRaw: vi.fn(async (partes: TemplateStringsArray) => {
      s.locks(partes.join('?'))
      s.hook?.()
      return [{ id: 6 }]
    }),
    brandVoice: { findUnique: vi.fn(async () => s.voz), updateMany: s.updates },
    brandDNA: { findUnique: vi.fn(async () => s.dna) },
  }
  return {
    db: {
      $transaction: vi.fn(async (fn: (x: typeof tx) => unknown) => fn(tx)),
    },
  }
})
import { migrarParaVoz } from '../voz-service'
const voz: VozCompacta = {
  versao: 'voz-v1',
  descricao: 'Próximo e direto.',
  tratamento: 'você',
  termos: [],
  exemplos: ['CTAs (lista fechada): Explore o planeta! · Acenda a estrela!'],
  proibicoes: ['CTAs: lista fechada, cópia literal.'],
  antesDepois: [],
  regras: [],
}
const dna = {
  toneOfVoice: 'CTAs (lista fechada): Explore o planeta!',
  contentRules: '',
  updatedAt: new Date('2026-10-04T00:00:00Z'),
}
async function fonte() {
  const documento = {
    projectId: 6,
    vozSha256: hashDoTextoAprovado(voz),
    dnaSha256: hashDoDnaDeTexto(dna),
    fonte: {
      referencia: 'transcrição conferida',
      trecho: 'Acenda a estrela!',
      aprovadoPor: 'Pessoa de teste',
      aprovadoEm: '2026-10-04T00:00:00Z',
    },
    ctas: [{ literal: 'Acenda a estrela!', condicao: null }],
  }
  return atestarFonteDeTexto({
    documento,
    sha256Esperado: hashDoTextoAprovado(documento),
    conferirOrigem: async () => true,
  })
}
beforeEach(() => {
  s.voz = {
    id: 1,
    projectId: 6,
    voz: structuredClone(voz),
    versao: 1,
    migradaEm: null,
    dnaArquivado: null,
    updatedAt: new Date(),
  }
  s.dna = structuredClone(dna)
  s.hook = null
  s.locks.mockReset()
  s.updates.mockReset().mockResolvedValue({ count: 1 })
})
describe('fonte conferida novamente DENTRO da ativação', () => {
  it('toma lock real da linha DNA e usa CAS relacional no update da voz', async () => {
    await migrarParaVoz({
      projectId: 6,
      versaoEsperada: 1,
      textoAprovado: { projectId: 6, fonte: await fonte() },
    })
    expect(s.locks.mock.calls.map((c) => c[0])).toEqual([
      expect.stringContaining('"Project"'),
      expect.stringContaining('"BrandDNA"'),
    ])
    expect(s.locks.mock.calls[1][0]).toContain('FOR UPDATE')
    expect(s.updates.mock.calls[0][0].where.Project.brandDNA.is).toEqual(dna)
  })
  it.each(['alteracao', 'exclusao'])(
    'drift %s depois do guard e antes do update não ativa',
    async (tipo) => {
      const f = await fonte()
      await expect(
        migrarParaVoz({
          projectId: 6,
          versaoEsperada: 1,
          textoAprovado: { projectId: 6, fonte: f },
          antesDeEscrever: async () => {
            s.dna =
              tipo === 'exclusao'
                ? null
                : { ...dna, contentRules: 'Concorrente' }
          },
        })
      ).rejects.toMatchObject({ code: 'VOZ_DNA_DIVERGENTE' })
      expect(s.updates).not.toHaveBeenCalled()
    }
  )
  it('DNA ausente que surge entre leitura e escrita não é arquivado como ausente', async () => {
    s.dna = null
    await expect(
      migrarParaVoz({
        projectId: 6,
        versaoEsperada: 1,
        antesDeEscrever: async () => {
          s.dna = structuredClone(dna)
        },
      })
    ).rejects.toMatchObject({ code: 'VOZ_DNA_DIVERGENTE' })
    expect(s.updates).not.toHaveBeenCalled()
  })
  it('CAS relacional recusado entre leitura final e update não ativa', async () => {
    s.updates.mockImplementationOnce(async ({ where }) => {
      s.dna = { ...dna, contentRules: 'Mudou no instante do SQL' }
      const comparado = where.Project.brandDNA.is
      return {
        count:
          comparado.contentRules === (s.dna as typeof dna).contentRules ? 1 : 0,
      }
    })
    await expect(
      migrarParaVoz({
        projectId: 6,
        versaoEsperada: 1,
        textoAprovado: { projectId: 6, fonte: await fonte() },
      })
    ).rejects.toMatchObject({ code: 'VOZ_DIVERGENTE' })
  })
  it('CAS relacional exige ausência ainda vigente quando DNA não existe', async () => {
    s.dna = null
    s.updates.mockImplementationOnce(async ({ where }) => {
      expect(where.Project.brandDNA.is).toBeNull()
      s.dna = structuredClone(dna)
      return { count: 0 }
    })
    await expect(
      migrarParaVoz({ projectId: 6, versaoEsperada: 1 })
    ).rejects.toMatchObject({ code: 'VOZ_DIVERGENTE' })
  })

  it('origem válida ativa e arquiva DNA original sem o alterar', async () => {
    const f = await fonte()
    expect(
      await migrarParaVoz({
        projectId: 6,
        versaoEsperada: 1,
        textoAprovado: { projectId: 6, fonte: f },
        dnaEsperado: dna,
      })
    ).toMatchObject({ versao: 1, jaEstava: false })
    expect(s.dna).toEqual(dna)
    const data = s.updates.mock.calls[0][0].data
    expect(data.dnaArquivado.toneOfVoice).toBe(dna.toneOfVoice)
  })
  it.each(['DNA', 'voz'])(
    'mudança %s sob trava recusa antes do update',
    async (campo) => {
      const f = await fonte()
      s.hook = () => {
        if (campo === 'DNA') s.dna = { ...dna, contentRules: 'Alterado' }
        else
          s.voz = {
            ...(s.voz as object),
            voz: { ...voz, descricao: 'Alterado' },
          }
      }
      await expect(
        migrarParaVoz({
          projectId: 6,
          versaoEsperada: 1,
          textoAprovado: { projectId: 6, fonte: f },
        })
      ).rejects.toMatchObject({ code: 'VOZ_TEXTO_APROVADO_DIVERGENTE' })
      expect(s.updates).not.toHaveBeenCalled()
    }
  )
  it('projectId do argumento prevalece sobre contexto fabricado de outro tenant', async () => {
    const f = await fonte()
    await expect(
      migrarParaVoz({
        projectId: 4,
        versaoEsperada: 1,
        textoAprovado: { projectId: 6, fonte: f },
      })
    ).rejects.toMatchObject({ code: 'VOZ_TEXTO_APROVADO_DIVERGENTE' })
    expect(s.updates).not.toHaveBeenCalled()
  })
})
