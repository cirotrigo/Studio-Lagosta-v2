/**
 * O parse das preferências de foto, sem banco.
 *
 * O que se confere aqui é o tipo de coisa que erra em silêncio: um sinal
 * malformado que derruba a leitura inteira, uma rejeição contada sobre a foto
 * que a pessoa LEVOU, um feedback negativo de copy rebaixando a foto errada,
 * a mesma dupla (foto, arte) contada duas vezes.
 *
 * ⚠️ O import é do CONTRATO, nunca do serviço: `sinal-de-foto.ts` arrasta o
 * Prisma (`captura`, `feedback-de-arte`), e `@/lib/db` lança no import quando
 * falta `DATABASE_URL` — apontar para lá derruba o arquivo inteiro antes do
 * primeiro `it` (a lição registrada de `sinal-de-agendamento-contrato.ts`).
 */

import { describe, expect, it } from 'vitest'
import {
  agregarSinaisDeFoto,
  correcoesPosProducao,
  feedbackDaLinha,
  feedbacksDeFoto,
  mencionaFoto,
  montarPreferencias,
  preferenciasVazias,
  type LinhaDeSinal,
} from '../sinal-de-foto-contrato'

const D1 = new Date('2026-08-20T12:00:00Z')
const D2 = new Date('2026-08-22T15:30:00Z')
const D3 = new Date('2026-08-25T09:00:00Z')

/** Um sinal de busca fechado, no shape que `buscar-no-acervo` grava. */
function sinalDeBusca(sobrescreve: Partial<LinhaDeSinal> = {}): LinhaDeSinal {
  return {
    id: 'sig-1',
    desfecho: 'trocada',
    sugeridoEm: D1,
    decididoEm: D2,
    sugerido: {
      criterios: { theme: 'picanha' },
      total: 40,
      topo: 'foto-a',
      propostas: [
        { posicao: 1, driveFileId: 'foto-a', fileName: 'a.jpg', folder: '01_cortes' },
        { posicao: 2, driveFileId: 'foto-b', fileName: 'b.jpg', folder: '01_cortes' },
        { posicao: 3, driveFileId: 'foto-c', fileName: 'c.jpg', folder: '02_ambiente' },
        { posicao: 4, driveFileId: 'foto-d', fileName: 'd.jpg', folder: '02_ambiente' },
      ],
    },
    escolhido: { driveFileId: 'foto-c', posicao: 3, motivo: 'escura' },
    ...sobrescreve,
  }
}

describe('agregarSinaisDeFoto', () => {
  it('trocada vira UMA escolha e rejeita só o topo (≤3) que não foi levado', () => {
    const { escolhas, rejeicoes } = agregarSinaisDeFoto([sinalDeBusca()])

    expect(escolhas).toEqual([
      { driveFileId: 'foto-c', tema: 'picanha', quando: D2.toISOString(), sugestaoId: 'sig-1' },
    ])
    // foto-c está no topo mas foi a ESCOLHIDA — rejeitá-la seria contar a
    // preferência contra ela mesma. foto-d (posição 4) ninguém olhou.
    expect(rejeicoes.map((r) => r.driveFileId)).toEqual(['foto-a', 'foto-b'])
    expect(rejeicoes[0]).toMatchObject({ posicao: 1, tema: 'picanha', motivo: 'escura' })
  })

  it('aceita-como-veio também é escolha, com o motivo ausente virando null', () => {
    const { escolhas, rejeicoes } = agregarSinaisDeFoto([
      sinalDeBusca({ desfecho: 'aceita-como-veio', escolhido: { driveFileId: 'foto-a', posicao: 1 } }),
    ])
    expect(escolhas[0].driveFileId).toBe('foto-a')
    expect(rejeicoes.map((r) => r.driveFileId)).toEqual(['foto-b', 'foto-c'])
    expect(rejeicoes.every((r) => r.motivo === null)).toBe(true)
  })

  it('expirada rejeita o topo inteiro, sem motivo — ninguém levou nada', () => {
    const { escolhas, rejeicoes } = agregarSinaisDeFoto([
      sinalDeBusca({ desfecho: 'expirada', escolhido: null }),
    ])
    expect(escolhas).toEqual([])
    expect(rejeicoes.map((r) => r.driveFileId)).toEqual(['foto-a', 'foto-b', 'foto-c'])
    expect(rejeicoes.every((r) => r.motivo === null)).toBe(true)
  })

  it('sem decididoEm, o quando cai no sugeridoEm', () => {
    const { escolhas } = agregarSinaisDeFoto([sinalDeBusca({ decididoEm: null })])
    expect(escolhas[0].quando).toBe(D1.toISOString())
  })

  it('pendente não produz linha, mas conta na última atividade', () => {
    const { escolhas, rejeicoes, ultimaAtividade } = agregarSinaisDeFoto([
      sinalDeBusca({ decididoEm: D2 }),
      sinalDeBusca({ id: 'sig-2', desfecho: null, escolhido: null, sugeridoEm: D3, decididoEm: null }),
    ])
    expect(escolhas).toHaveLength(1)
    expect(rejeicoes).toHaveLength(2)
    // D3 (a busca pendente) é mais recente que D2 (a decisão) — a âncora do
    // decaimento é a atividade, não só o que virou desfecho.
    expect(ultimaAtividade).toBe(D3.toISOString())
  })

  it('linha malformada é pulada sem derrubar as outras', () => {
    const estragadas = [
      null,
      'lixo',
      sinalDeBusca({ escolhido: { driveFileId: 42 } }), // id não-string
      sinalDeBusca({ id: 'sig-3', sugerido: 'não sou objeto', escolhido: { driveFileId: 'foto-x' } }),
      sinalDeBusca({ id: 'sig-4', sugeridoEm: null, decididoEm: null }), // sem data nenhuma
      sinalDeBusca({
        id: 'sig-5',
        sugerido: { criterios: { theme: 7 }, propostas: [{ posicao: 'um', driveFileId: 'foto-y' }, null] },
      }),
    ] as unknown as LinhaDeSinal[]

    const { escolhas, rejeicoes } = agregarSinaisDeFoto(estragadas)
    // sig-3: escolha vale mesmo sem propostas legíveis (tema vira null);
    // sig-5: escolha vale, e a proposta com posicao não-numérica é pulada.
    expect(escolhas.map((e) => e.sugestaoId)).toEqual(['sig-3', 'sig-5'])
    expect(escolhas[0].tema).toBeNull()
    expect(rejeicoes).toEqual([])
  })

  it('entrada que não é lista devolve vazio, nunca lança', () => {
    expect(agregarSinaisDeFoto(undefined as unknown as LinhaDeSinal[])).toEqual({
      escolhas: [],
      rejeicoes: [],
      ultimaAtividade: null,
    })
  })
})

describe('mencionaFoto', () => {
  it('reconhece as palavras de foto, sem caso-sensível', () => {
    expect(mencionaFoto('a foto está muito escura')).toBe(true)
    expect(mencionaFoto('A IMAGEM ficou ótima')).toBe(true)
    expect(mencionaFoto('clarear o fundo')).toBe(true)
    expect(mencionaFoto('ficou desfocada')).toBe(true)
  })

  it('reprovação que fala de copy não vira menção — pode ser do texto, não da foto', () => {
    expect(mencionaFoto('o título está errado')).toBe(false)
    expect(mencionaFoto(null)).toBe(false)
    expect(mencionaFoto(undefined)).toBe(false)
  })
})

describe('feedbacksDeFoto', () => {
  const usos = [
    { driveFileId: 'foto-a', generationId: 'gen-1' },
    { driveFileId: 'foto-b', generationId: 'gen-2' },
    { driveFileId: 'foto-c', generationId: 'gen-sem-feedback' },
    { driveFileId: 'foto-d', generationId: null },
  ]
  const linhas = [
    { generationId: 'gen-1', escolhido: { veredito: 'gostei', comentario: null }, decididoEm: D1, updatedAt: D2 },
    {
      generationId: 'gen-2',
      escolhido: { veredito: 'melhorar', comentario: 'a foto está escura demais' },
      decididoEm: null,
      updatedAt: D3,
    },
  ]

  it('cruza uso e veredito; melhorar com menção à foto sai negativo e marcado', () => {
    const feedbacks = feedbacksDeFoto(usos, linhas)
    expect(feedbacks).toEqual([
      { driveFileId: 'foto-a', positivo: true, mencionaFoto: false, quando: D1.toISOString() },
      { driveFileId: 'foto-b', positivo: false, mencionaFoto: true, quando: D3.toISOString() },
    ])
  })

  it('a mesma dupla (foto, arte) conta UMA vez — PhotoUsage pode tê-la em dobro', () => {
    const duplicados = [...usos, { driveFileId: 'foto-a', generationId: 'gen-1' }]
    expect(feedbacksDeFoto(duplicados, linhas)).toHaveLength(2)
  })

  it('veredito desconhecido ou linha sem data são pulados', () => {
    expect(feedbackDaLinha('foto-x', { generationId: 'g', escolhido: { veredito: 'talvez' } })).toBeNull()
    expect(
      feedbackDaLinha('foto-x', {
        generationId: 'g',
        escolhido: { veredito: 'gostei' },
        decididoEm: null,
        updatedAt: null,
      }),
    ).toBeNull()
  })
})

describe('correcoesPosProducao', () => {
  const trocas: LinhaDeSinal[] = [
    // A troca liga a arte NOVA (gen-9); PhotoUsage diz quais fotos ela usou.
    { id: 'troca-1', generationId: 'gen-9', decididoEm: D3, sugeridoEm: null },
    // Troca cuja arte não tem uso de foto registrado (upload, IA pura).
    { id: 'troca-2', generationId: 'gen-sem-uso', decididoEm: D2, sugeridoEm: null },
    // Linha sem generationId (defensivo — a query já filtra, o parse também).
    { id: 'troca-3', generationId: null, decididoEm: D1, sugeridoEm: null },
  ]
  const usos = [
    { driveFileId: 'foto-a', generationId: 'gen-9' },
    { driveFileId: 'foto-b', generationId: 'gen-9' },
    { driveFileId: 'foto-a', generationId: 'gen-9' }, // duplicata — não dobra
    { driveFileId: 'foto-z', generationId: 'gen-outra' },
  ]

  it('cada foto da arte que VENCEU a troca vira escolha forca correcao, sem tema', () => {
    const { escolhas } = correcoesPosProducao(trocas, usos)
    expect(escolhas).toEqual([
      { driveFileId: 'foto-a', tema: null, quando: D3.toISOString(), sugestaoId: 'troca-1', forca: 'correcao' },
      { driveFileId: 'foto-b', tema: null, quando: D3.toISOString(), sugestaoId: 'troca-1', forca: 'correcao' },
    ])
  })

  it('troca sem uso conta na última atividade mesmo sem produzir escolha', () => {
    const { ultimaAtividade } = correcoesPosProducao(
      [{ id: 'troca-2', generationId: 'gen-sem-uso', decididoEm: D3, sugeridoEm: null }],
      [],
    )
    expect(ultimaAtividade).toBe(D3.toISOString())
  })

  it('entrada malformada devolve vazio, nunca lança', () => {
    expect(correcoesPosProducao(null as unknown as LinhaDeSinal[], usos)).toEqual({
      escolhas: [],
      ultimaAtividade: null,
    })
    expect(correcoesPosProducao([null, 'lixo'] as unknown as LinhaDeSinal[], usos).escolhas).toEqual([])
  })
})

describe('montarPreferencias', () => {
  it('junta busca + correção + feedback, e a última atividade é o máximo das duas famílias', () => {
    const prefs = montarPreferencias({
      sinaisDeFoto: [sinalDeBusca({ decididoEm: D2 })],
      trocasDeArte: [{ id: 'troca-1', generationId: 'gen-9', decididoEm: D3, sugeridoEm: null }],
      usos: [
        { driveFileId: 'foto-e', generationId: 'gen-9' },
        { driveFileId: 'foto-c', generationId: 'gen-1' },
      ],
      feedbacksDeArte: [
        { generationId: 'gen-1', escolhido: { veredito: 'gostei' }, decididoEm: D2, updatedAt: D2 },
      ],
    })

    // A escolha da busca vem sem `forca`; a da correção, marcada.
    expect(prefs.escolhas).toHaveLength(2)
    expect(prefs.escolhas[0]).not.toHaveProperty('forca')
    expect(prefs.escolhas[1]).toMatchObject({ driveFileId: 'foto-e', forca: 'correcao' })
    expect(prefs.rejeicoes).toHaveLength(2)
    expect(prefs.feedbacks).toEqual([
      { driveFileId: 'foto-c', positivo: true, mencionaFoto: false, quando: D2.toISOString() },
    ])
    // A troca (D3) é mais recente que a decisão de busca (D2).
    expect(prefs.ultimaAtividade).toBe(D3.toISOString())
  })

  it('preferenciasVazias é o valor neutro do serviço quando tudo falha', () => {
    expect(preferenciasVazias()).toEqual({
      escolhas: [],
      rejeicoes: [],
      feedbacks: [],
      ultimaAtividade: null,
    })
  })
})
