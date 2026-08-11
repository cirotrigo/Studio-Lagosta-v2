/**
 * O que se testa aqui: que a opinião sobre a arte não se DUPLICA e não se
 * PERDE.
 *
 * As duas falhas são silenciosas e caras. Duplicar transforma um clique
 * ansioso em duas opiniões e o relatório passa a contar gosto que não existe;
 * perder a revisão congela o julgamento errado — a pessoa olhou de novo, mudou
 * de ideia, e o corpus continua ensinando o oposto.
 *
 * O banco é falso, mas o caminho é o real: o serviço chama `captura.ts` de
 * verdade, então o `upsert` com `update: {}` (que ignora a segunda escrita) faz
 * parte do que está sob teste — é justamente por causa dele que a revisão mora
 * no serviço.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

interface LinhaFalsa {
  id: string
  projectId: number
  tipo: string
  escolhido: unknown
  desfecho: string | null
  decididoEm: Date | null
  decididoPor: string | null
  superficie: string | null
  generationId: string | null
  chave: string | null
  updatedAt: Date
}

const banco = {
  sinais: [] as LinhaFalsa[],
  generations: new Map<string, Record<string, unknown>>(),
  usuarios: [] as Array<{ id: string; name: string | null; email: string | null }>,
  relogio: 0,
}

function agora(): Date {
  banco.relogio += 1000
  return new Date(2026, 7, 11, 12, 0, 0, banco.relogio)
}

function novaLinha(data: Record<string, unknown>): LinhaFalsa {
  const linha: LinhaFalsa = {
    id: `sinal-${banco.sinais.length + 1}`,
    projectId: data.projectId as number,
    tipo: data.tipo as string,
    escolhido: data.escolhido ?? null,
    desfecho: (data.desfecho as string) ?? null,
    decididoEm: (data.decididoEm as Date) ?? null,
    decididoPor: (data.decididoPor as string) ?? null,
    superficie: (data.superficie as string) ?? null,
    generationId: (data.generationId as string) ?? null,
    chave: (data.chave as string) ?? null,
    updatedAt: agora(),
  }
  banco.sinais.push(linha)
  return linha
}

function acharPorWhere(where: Record<string, unknown>): LinhaFalsa | undefined {
  if (where.chave) return banco.sinais.find((s) => s.chave === where.chave)
  if (where.id) return banco.sinais.find((s) => s.id === where.id)
  return undefined
}

vi.mock('@/lib/db', () => ({
  db: {
    learningSignal: {
      findUnique: async ({ where }: { where: Record<string, unknown> }) =>
        acharPorWhere(where) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => novaLinha(data),
      upsert: async ({ where, create }: { where: Record<string, unknown>; create: Record<string, unknown> }) => {
        // `update: {}` do núcleo: proposta que já existe NÃO é reescrita.
        const existente = acharPorWhere(where)
        return existente ?? novaLinha(create)
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const alvo = banco.sinais.find(
          (s) =>
            s.id === where.id &&
            (!(where.updatedAt instanceof Date) || s.updatedAt.getTime() === where.updatedAt.getTime()),
        )
        if (!alvo) return { count: 0 }
        Object.assign(alvo, data, { updatedAt: agora() })
        return { count: 1 }
      },
      findMany: async ({ where, take }: { where: Record<string, unknown>; take?: number }) => {
        const filtradas = banco.sinais.filter((s) => {
          if (where.tipo && s.tipo !== where.tipo) return false
          if (where.projectId && s.projectId !== where.projectId) return false
          return true
        })
        return filtradas.slice(0, take ?? filtradas.length)
      },
    },
    generation: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const fv = banco.generations.get(where.id)
        return fv ? { id: where.id, fieldValues: fv } : null
      },
      update: async ({ where, data }: { where: { id: string }; data: { fieldValues: Record<string, unknown> } }) => {
        banco.generations.set(where.id, data.fieldValues)
        return { id: where.id }
      },
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in
          .filter((id) => banco.generations.has(id))
          .map((id) => ({
            id,
            resultUrl: `https://blob/${id}.png`,
            templateName: 'Modelo X',
            projectName: 'Cliente Y',
            fieldValues: banco.generations.get(id),
            createdAt: new Date(2026, 7, 10, 9, 0, 0),
          })),
    },
    user: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        banco.usuarios.filter((u) => where.id.in.includes(u.id)),
    },
  },
}))

import {
  chaveDoFeedbackDeArte,
  lerFeedbackDeArte,
  listarFeedbacks,
  normalizarVeredito,
  registrarFeedbackDeArte,
  TETO_COMENTARIO,
} from '../feedback-de-arte'
import { SUPERFICIES, TIPOS_DE_SINAL, normalizarSuperficie, normalizarTipo } from '../vocabulario'

const ARTE = 'gen-1'
const PROJETO = 8

beforeEach(() => {
  banco.sinais = []
  banco.generations = new Map([[ARTE, { prompt: 'foto do prato', refs: ['a', 'b'], source: 'geracao-ia' }]])
  banco.usuarios = [{ id: 'user-interno', name: 'Ciro', email: 'ciro@exemplo.com' }]
  banco.relogio = 0
})

describe('vocabulário', () => {
  it('"arte" é um tipo de sinal conhecido', () => {
    expect(TIPOS_DE_SINAL).toContain('arte')
    expect(normalizarTipo('Arte')).toBe('arte')
  })

  it('"galeria" é uma superfície conhecida — é de onde vem a maior parte do feedback', () => {
    expect(SUPERFICIES).toContain('galeria')
    expect(normalizarSuperficie('Galeria')).toBe('galeria')
  })

  it('veredito só aceita os dois valores; qualquer outra coisa é desconhecida', () => {
    expect(normalizarVeredito('gostei')).toBe('gostei')
    expect(normalizarVeredito(' MELHORAR ')).toBe('melhorar')
    expect(normalizarVeredito('mais ou menos')).toBeUndefined()
    expect(normalizarVeredito(null)).toBeUndefined()
  })
})

describe('registrarFeedbackDeArte — idempotência', () => {
  it('grava a primeira opinião e devolve o estado', async () => {
    const r = await registrarFeedbackDeArte({
      generationId: ARTE,
      projectId: PROJETO,
      veredito: 'gostei',
      superficie: 'galeria',
    })

    expect(r.resultado).toBe('gravado')
    expect(r.feedback?.veredito).toBe('gostei')
    expect(banco.sinais).toHaveLength(1)
    expect(banco.sinais[0].chave).toBe(chaveDoFeedbackDeArte(ARTE))
    // Decisão SEM sugestão: é o que a mantém fora do denominador do KPI.
    expect(banco.sinais[0].desfecho).toBe('escolha-propria')
    expect(banco.sinais[0].tipo).toBe('arte')
  })

  it('clicar duas vezes no mesmo botão não duplica nem reescreve', async () => {
    await registrarFeedbackDeArte({ generationId: ARTE, projectId: PROJETO, veredito: 'gostei' })
    const segunda = await registrarFeedbackDeArte({
      generationId: ARTE,
      projectId: PROJETO,
      veredito: 'gostei',
    })

    expect(segunda.resultado).toBe('ja-registrado')
    expect(segunda.feedback?.veredito).toBe('gostei')
    expect(banco.sinais).toHaveLength(1)
    expect(banco.sinais[0].escolhido).toMatchObject({ revisoes: 0 })
  })

  it('artes diferentes são linhas diferentes', async () => {
    banco.generations.set('gen-2', { prompt: 'outra' })
    await registrarFeedbackDeArte({ generationId: ARTE, projectId: PROJETO, veredito: 'gostei' })
    await registrarFeedbackDeArte({ generationId: 'gen-2', projectId: PROJETO, veredito: 'melhorar' })
    expect(banco.sinais).toHaveLength(2)
  })
})

describe('registrarFeedbackDeArte — revisão', () => {
  it('a pessoa muda de ideia: UMA linha, revisada, com a última opinião', async () => {
    await registrarFeedbackDeArte({ generationId: ARTE, projectId: PROJETO, veredito: 'gostei' })
    const r = await registrarFeedbackDeArte({
      generationId: ARTE,
      projectId: PROJETO,
      veredito: 'melhorar',
      comentario: 'texto muito grande',
      superficie: 'bancada',
    })

    expect(r.resultado).toBe('revisado')
    expect(banco.sinais).toHaveLength(1)
    expect(banco.sinais[0].escolhido).toMatchObject({
      veredito: 'melhorar',
      comentario: 'texto muito grande',
      revisoes: 1,
    })
    expect(banco.sinais[0].superficie).toBe('bancada')

    const atual = await lerFeedbackDeArte(ARTE)
    expect(atual?.veredito).toBe('melhorar')
    expect(atual?.comentario).toBe('texto muito grande')
    expect(atual?.revisoes).toBe(1)
  })

  it('acrescentar o comentário depois do clique também é revisão — o veredito não se perde', async () => {
    // É o fluxo real: "Preciso melhorar" grava no clique, e o texto (que é
    // opcional) chega depois. Quem fechar a arte sem escrever nada já deixou o
    // sinal mais importante.
    await registrarFeedbackDeArte({ generationId: ARTE, projectId: PROJETO, veredito: 'melhorar' })
    const r = await registrarFeedbackDeArte({
      generationId: ARTE,
      projectId: PROJETO,
      veredito: 'melhorar',
      comentario: 'a foto ficou escura',
    })

    expect(r.resultado).toBe('revisado')
    expect(banco.sinais).toHaveLength(1)
    expect(r.feedback?.comentario).toBe('a foto ficou escura')
  })

  it('comentário vazio é ausência de comentário, e o teto é aplicado', async () => {
    await registrarFeedbackDeArte({
      generationId: ARTE,
      projectId: PROJETO,
      veredito: 'melhorar',
      comentario: '   ',
    })
    expect(banco.sinais[0].escolhido).toMatchObject({ comentario: null })

    await registrarFeedbackDeArte({
      generationId: ARTE,
      projectId: PROJETO,
      veredito: 'melhorar',
      comentario: 'x'.repeat(TETO_COMENTARIO + 500),
    })
    const gravado = banco.sinais[0].escolhido as { comentario: string }
    expect(gravado.comentario).toHaveLength(TETO_COMENTARIO)
  })
})

describe('espelho em Generation.fieldValues', () => {
  it('MERGE: o registro atômico da run continua inteiro', async () => {
    await registrarFeedbackDeArte({
      generationId: ARTE,
      projectId: PROJETO,
      veredito: 'melhorar',
      comentario: 'marca sumida',
    })

    const fv = banco.generations.get(ARTE) as Record<string, unknown>
    expect(fv.prompt).toBe('foto do prato')
    expect(fv.refs).toEqual(['a', 'b'])
    expect(fv.feedback).toMatchObject({ veredito: 'melhorar', comentario: 'marca sumida' })
  })

  it('a revisão atualiza o espelho sem apagar nada', async () => {
    await registrarFeedbackDeArte({ generationId: ARTE, projectId: PROJETO, veredito: 'gostei' })
    await registrarFeedbackDeArte({ generationId: ARTE, projectId: PROJETO, veredito: 'melhorar' })

    const fv = banco.generations.get(ARTE) as Record<string, unknown>
    expect(fv.source).toBe('geracao-ia')
    expect(fv.feedback).toMatchObject({ veredito: 'melhorar', revisoes: 1 })
  })
})

describe('contrato: nada aqui lança', () => {
  it('veredito desconhecido devolve erro neutro e não grava nada', async () => {
    const r = await registrarFeedbackDeArte({
      generationId: ARTE,
      projectId: PROJETO,
      veredito: 'talvez' as never,
    })
    expect(r).toEqual({ ok: false, resultado: 'erro', feedback: null })
    expect(banco.sinais).toHaveLength(0)
  })

  it('sem generationId não há o que julgar', async () => {
    const r = await registrarFeedbackDeArte({ generationId: '', projectId: PROJETO, veredito: 'gostei' })
    expect(r.resultado).toBe('erro')
    expect(banco.sinais).toHaveLength(0)
    expect(await lerFeedbackDeArte('')).toBeNull()
  })
})

describe('listarFeedbacks', () => {
  beforeEach(async () => {
    banco.generations.set('gen-2', { prompt: 'outra', source: 'melhoria' })
    await registrarFeedbackDeArte({
      generationId: ARTE,
      projectId: PROJETO,
      veredito: 'gostei',
      decididoPor: 'user-interno',
    })
    await registrarFeedbackDeArte({
      generationId: 'gen-2',
      projectId: PROJETO,
      veredito: 'melhorar',
      comentario: 'foto escura',
    })
  })

  it('devolve o essencial: veredito, comentário, quem, quando e a arte', async () => {
    const lista = await listarFeedbacks({ projectId: PROJETO })
    expect(lista).toHaveLength(2)

    const gostou = lista.find((f) => f.generationId === ARTE)
    expect(gostou?.veredito).toBe('gostei')
    expect(gostou?.quem).toBe('Ciro')
    expect(gostou?.arte?.resultUrl).toBe(`https://blob/${ARTE}.png`)
    expect(gostou?.arte?.source).toBe('geracao-ia')

    const pediu = lista.find((f) => f.generationId === 'gen-2')
    expect(pediu?.comentario).toBe('foto escura')
    // Sem User resolvido a coluna fica nula — é auditoria, não obrigação.
    expect(pediu?.quem).toBeNull()
  })

  it('filtra por veredito', async () => {
    const so = await listarFeedbacks({ projectId: PROJETO, veredito: 'melhorar' })
    expect(so).toHaveLength(1)
    expect(so[0].generationId).toBe('gen-2')
  })

  it('não devolve sinal de outro cliente', async () => {
    expect(await listarFeedbacks({ projectId: 999 })).toHaveLength(0)
  })
})
