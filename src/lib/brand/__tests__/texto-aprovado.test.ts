// Cenários sintéticos; não representam cliente, pessoa ou aprovação real.
import { describe, expect, it, vi } from 'vitest'
import {
  atestarFonteDeTexto,
  hashDoDnaDeTexto,
  hashDoTextoAprovado,
  type FonteDeTextoAtestada,
  type DocumentoDeTextoAprovado,
} from '../texto-aprovado'
import {
  problemasParaMigrar,
  montarPrevia,
  versaoDaPrevia,
  condicoesOperacionais,
  planoDeAplicacao,
  manifestoEmBranco,
  previaParaMarkdown,
} from '../migracao-da-voz'
import type { VozCompacta } from '../voz'
const dna = {
  toneOfVoice: 'CTAs (lista fechada): Explore o planeta!',
  contentRules: '',
}
const voz: VozCompacta = {
  versao: 'voz-v1',
  descricao: 'Caloroso e direto.',
  tratamento: 'você',
  termos: [],
  exemplos: [
    'CTAs (lista fechada): Explore o planeta! · Acenda a estrela! · Faça sua órbita!',
  ],
  proibicoes: ['CTAs: lista fechada, cópia literal.'],
  antesDepois: [],
  regras: [
    {
      id: 'ciclo-teste',
      texto:
        'Use “Faça sua órbita!” somente nos ciclos de teste autorizados conforme a Base vigente.',
      motivo: 'Pessoa de teste aprovou no cenário sintético.',
      em: '2026-10-04',
      escopo: 'copy',
      ativa: true,
    },
  ],
}
const documento = (v = voz, d = dna): DocumentoDeTextoAprovado => ({
  projectId: 6,
  vozSha256: hashDoTextoAprovado(v),
  dnaSha256: hashDoDnaDeTexto(d),
  fonte: {
    referencia: 'transcricao-revisada',
    trecho:
      'Pessoa de teste aprovou “Acenda a estrela!” e “Faça sua órbita!” somente nos ciclos de teste autorizados.',
    aprovadoPor: 'Pessoa de teste',
    aprovadoEm: '2026-10-04T12:00:00Z',
  },
  ctas: [
    { literal: 'Acenda a estrela!', condicao: null },
    {
      literal: 'Faça sua órbita!',
      condicao: { regraId: 'ciclo-teste', texto: voz.regras[0].texto },
    },
  ],
})
const atestar = async (d = documento()) =>
  atestarFonteDeTexto({
    documento: d,
    sha256Esperado: hashDoTextoAprovado(d),
    conferirOrigem: async () => true,
  })
describe('CTA atestado por fonte independente; sem atestado guard continua estrito', () => {
  it.each(['2026-10-04', '2024-02-29', '2026-10-04T13:06:00Z'])(
    'aceita data real ou datetime %s',
    async (aprovadoEm) => {
      const d = documento()
      d.fonte.aprovadoEm = aprovadoEm
      await expect(atestar(d)).resolves.toBeDefined()
    }
  )
  it.each([
    '2026-02-29',
    '2026-02-30',
    '2026-04-31',
    '2026-00-10',
    '2026-13-10',
    '2026-01-00',
    '2026-01-32',
    '04/10/2026',
    '0000-01-01',
    '2026-02-30T13:06:00Z',
    '0000-01-01T13:06:00Z',
  ])('recusa data inválida %s', async (aprovadoEm) => {
    const d = documento()
    d.fonte.aprovadoEm = aprovadoEm
    await expect(atestar(d)).rejects.toThrow()
  })
  it('hash e prévia mudam com data/trecho da evidência', async () => {
    const d = documento()
    const primeiro = await atestar(d)
    const alterado = {
      ...d,
      fonte: {
        ...d.fonte,
        aprovadoEm: '2026-10-04',
        trecho: d.fonte.trecho + ' Contexto adicional.',
      },
    }
    expect(hashDoTextoAprovado(alterado)).not.toBe(hashDoTextoAprovado(d))
    const segundo = await atestar(alterado)
    expect(
      versaoDaPrevia({
        voz,
        dna,
        textoAprovado: { projectId: 6, fonte: primeiro },
      })
    ).not.toBe(
      versaoDaPrevia({
        voz,
        dna,
        textoAprovado: { projectId: 6, fonte: segundo },
      })
    )
  })
  it('condição atestada com não usar fora dela passa; outra regra de veto ainda bloqueia', async () => {
    const regra = {
      id: 'amigos',
      texto:
        'Use “Acenda a estrela!” somente quando a Base permitir; não use em outros casos.',
      motivo: 'Condição aprovada',
      em: '2026-10-04',
      escopo: 'copy' as const,
      ativa: true,
    }
    const v = { ...voz, regras: [...voz.regras, regra] }
    const d = documento(v)
    d.ctas[0].condicao = { regraId: regra.id, texto: regra.texto }
    expect(
      problemasParaMigrar(v, dna, { projectId: 6, fonte: await atestar(d) })
    ).toEqual([])
    const vetada = {
      ...v,
      regras: [
        ...v.regras,
        { ...regra, id: 'revogado', texto: 'Nunca usar Acenda a estrela!' },
      ],
    }
    const e = documento(vetada)
    e.ctas[0].condicao = d.ctas[0].condicao
    expect(
      problemasParaMigrar(vetada, dna, {
        projectId: 6,
        fonte: await atestar(e),
      })
    ).toEqual([expect.stringContaining('veto')])
  })
  it.each(['“ganhe um brinde”', '"ganhe um brinde"', "'ganhe um brinde'"])(
    'não esconde oferta citada %s na exceção editorial',
    (oferta) => {
      const descricao = `A estrela de teste oferece um brinde ${oferta}`
      expect(condicoesOperacionais(descricao)).not.toEqual([])
      expect(problemasParaMigrar({ ...voz, descricao }, dna)).toContainEqual(
        expect.stringContaining('carrega')
      )
    }
  )

  it('preserva o hash da origem no manifesto pendente e relatório revisável', async () => {
    const d = documento()
    const p = montarPrevia({
      projectId: 6,
      nome: 'Estação Aurora',
      voz,
      dna,
      textoAprovado: { projectId: 6, fonte: await atestar(d) },
    })
    const hash = hashDoTextoAprovado(d)
    expect(manifestoEmBranco([p]).clientes[0]).toMatchObject({
      decisao: 'pendente',
      fonteDeTextoSha256: hash,
    })
    expect(previaParaMarkdown(p)).toContain(hash)
  })

  it('libera somente literal aprovado, preservando lista e condição', async () => {
    expect(problemasParaMigrar(voz, dna)).toHaveLength(2)
    expect(
      problemasParaMigrar(voz, dna, { projectId: 6, fonte: await atestar() })
    ).toEqual([])
  })
  it('hash da fonte adulterada bloqueia antes da conferência', async () => {
    const origem = vi.fn(async () => true)
    await expect(
      atestarFonteDeTexto({
        documento: documento(),
        sha256Esperado: '0'.repeat(64),
        conferirOrigem: origem,
      })
    ).rejects.toThrow('pacote')
    expect(origem).not.toHaveBeenCalled()
  })
  it('não aceita aprovação autodeclarada/serializada', () => {
    expect(
      problemasParaMigrar(voz, dna, {
        projectId: 6,
        fonte: {} as FonteDeTextoAtestada,
      })
    ).toEqual([expect.stringContaining('não atestada')])
  })
  it('origem recusada não concede capacidade', async () => {
    const d = documento()
    await expect(
      atestarFonteDeTexto({
        documento: d,
        sha256Esperado: hashDoTextoAprovado(d),
        conferirOrigem: async () => false,
      })
    ).rejects.toThrow('Origem')
  })
  it('outro tenant, voz ou DNA divergem', async () => {
    const fonte = await atestar()
    for (const [v, d, id] of [
      [voz, dna, 4],
      [{ ...voz, descricao: 'Outra' }, dna, 6],
      [voz, { ...dna, contentRules: 'Mudou' }, 6],
    ] as const)
      expect(problemasParaMigrar(v, d, { projectId: id, fonte })).toEqual([
        expect.stringContaining('outro projeto/voz/DNA'),
      ])
  })
  it('condição ausente/inativa/alterada não pode ser reatestada como equivalente', async () => {
    for (const regras of [
      [],
      [{ ...voz.regras[0], ativa: false }],
      [{ ...voz.regras[0], texto: 'Use livremente.' }],
    ]) {
      const v = { ...voz, regras }
      const fonte = await atestar(documento(v))
      expect(problemasParaMigrar(v, dna, { projectId: 6, fonte })).toEqual([
        expect.stringContaining('Condição'),
      ])
    }
  })
  it('aprovação adicional não desfaz veto e nem omissão de CTA do DNA', async () => {
    const v = {
      ...voz,
      proibicoes: [...voz.proibicoes, 'Acenda a estrela!'],
    }
    expect(
      problemasParaMigrar(v, dna, {
        projectId: 6,
        fonte: await atestar(documento(v)),
      })
    ).toEqual([expect.stringContaining('veto')])
    const incomplete = {
      ...voz,
      exemplos: [voz.exemplos[0].replace('Explore o planeta! · ', '')],
    }
    expect(
      problemasParaMigrar(incomplete, dna, {
        projectId: 6,
        fonte: await atestar(documento(incomplete)),
      })
    ).toEqual([expect.stringContaining('ausente')])
  })
  it('fatos e teto permanecem bloqueados mesmo com origem atestada', async () => {
    for (const descricao of ['Preço R$ 50.', 'a'.repeat(4001)]) {
      const v = { ...voz, descricao }
      expect(
        problemasParaMigrar(v, dna, {
          projectId: 6,
          fonte: await atestar(documento(v)),
        }).length
      ).toBeGreaterThan(0)
    }
  })
  it('prévia vincula origem/hash e não permite usar atestado de outro projeto', async () => {
    const fonte = await atestar(),
      textoAprovado = { projectId: 6, fonte }
    const old = versaoDaPrevia({ voz, dna }),
      p = montarPrevia({
        projectId: 6,
        nome: 'Estação Aurora',
        voz,
        dna,
        textoAprovado,
      })
    expect(p.versaoDaPrevia).not.toBe(old)
    expect(p.fonteDeTextoSha256).toBe(hashDoTextoAprovado(documento()))
    expect(() =>
      montarPrevia({ projectId: 4, nome: 'Outro', voz, dna, textoAprovado })
    ).toThrow('outro projeto')
  })
  it('manifesto sem capacidade correspondente não passa', () => {
    const c = {
      projectId: 6,
      nome: 'Estação Aurora',
      versaoDaPrevia: '12345678',
      decisao: 'migrar' as const,
      aprovadoPor: 'Pessoa de teste',
      aprovadoEm: '2026-10-04',
      fatosParaABase: [],
      fonteDeTextoSha256: 'f'.repeat(64),
    }
    const e = {
      versaoDaPreviaAtual: c.versaoDaPrevia,
      trechosDeFato: [],
      registro: null,
      vozValida: true,
    }
    expect(
      planoDeAplicacao(
        { versao: 'manifesto-voz-v1', geradoEm: 'x', clientes: [c] },
        new Map([[6, e]])
      )[0]
    ).toMatchObject({ acao: 'bloqueado' })
  })
  it('não concede origem a literal não citado nem duplicado', async () => {
    const d = documento()
    for (const bad of [
      { ...d, fonte: { ...d.fonte, trecho: 'Aprovado.' } },
      { ...d, ctas: [...d.ctas, d.ctas[0]] },
    ])
      await expect(atestar(bad)).rejects.toThrow()
  })
  it('callback não pode modificar o documento que acabou de atestar', async () => {
    const d = documento(),
      fonte = await atestarFonteDeTexto({
        documento: d,
        sha256Esperado: hashDoTextoAprovado(d),
        conferirOrigem: async (x) => {
          x.ctas[0].literal = 'Alterado'
          return true
        },
      })
    expect(problemasParaMigrar(voz, dna, { projectId: 6, fonte })).toEqual([])
  })
})
describe('termo ambíguo não ganha exceção de cliente', () => {
  it('brinde continua condicionado; não há literal real fixado no código', () => {
    expect(
      condicoesOperacionais(
        'A estrela de teste oferece um brinde'
      )
    ).toContain('serviço ou cortesia afirmados')
    expect(
      condicoesOperacionais(
        'A estrela de teste oferece um brinde e ganhe um brinde'
      )
    ).toContain('serviço ou cortesia afirmados')
    expect(condicoesOperacionais('Ganhe um brinde')).toContain(
      'serviço ou cortesia afirmados'
    )
  })
})
