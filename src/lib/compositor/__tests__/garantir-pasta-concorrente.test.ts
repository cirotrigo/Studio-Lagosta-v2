/**
 * R12-09, varredura da classe: `garantirPasta` é verificar-e-criar. Duas
 * execuções que não acham a pasta da semana criam DUAS (o schema não tem
 * unicidade em `tags`), e dali em diante o `findFirst` sem ordem manda cada
 * peça nova para uma delas — a semana se parte em duas pastas de mesmo nome.
 * Chega aqui pelas retomadas simultâneas do agendar-leva (a refilagem e a
 * mudança das avulsas) e por quem compõe duas peças da mesma semana nova.
 *
 * O banco falso modela só o que decide o caso: a trava consultiva por chave
 * (`pg_advisory_xact_lock`) serializa quem pede a MESMA chave, e nada mais
 * serializa — duas transações sem ela correm juntas, como no Postgres.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({
  templates: [] as Array<{ id: number; name: string; tags: string[]; projectId: number }>,
  seq: 0,
  /** A cauda da fila de cada chave consultiva. */
  travas: new Map<string, Promise<void>>(),
  /** Transações esperando uma trava que outra segura. */
  presas: 0,
  /** Quem leu a ausência e espera o par (ver `leuAusencia`). */
  esperando: null as null | (() => void),
  barreira: false,
  eventos: [] as string[],
}))

vi.mock('@/lib/db', () => {
  /**
   * A barreira, por RODADAS: a primeira leitura que não acha a pasta espera
   * a segunda (sem trava, as duas vão criar) — ou que alguém fique preso
   * atrás de uma trava: esperar por ele seria um impasse, e estar preso é
   * justamente a condição que a barreira pede.
   */
  const leuAusencia = async () => {
    banco.eventos.push('leitura:ausente')
    if (!banco.barreira || banco.presas > 0) return
    if (banco.esperando) {
      const soltar = banco.esperando
      banco.esperando = null
      return soltar()
    }
    await new Promise<void>((r) => {
      banco.esperando = r
    })
  }
  const soltarQuemEspera = () => {
    const soltar = banco.esperando
    banco.esperando = null
    soltar?.()
  }
  const delegados = {
    template: {
      findFirst: async ({ where }: { where: { projectId: number; tags: { has: string } } }) => {
        const t = banco.templates.find((x) => x.projectId === where.projectId && x.tags.includes(where.tags.has))
        if (!t) await leuAusencia()
        return t ? { id: t.id, name: t.name } : null
      },
      create: async ({ data }: { data: { name: string; tags: string[]; projectId: number } }) => {
        banco.eventos.push('criacao')
        const t = { id: ++banco.seq, name: data.name, tags: data.tags, projectId: data.projectId }
        banco.templates.push(t)
        return { id: t.id, name: t.name }
      },
    },
  }
  const $transaction = async (run: (tx: unknown) => Promise<unknown>) => {
    const liberacoes: Array<() => void> = []
    try {
      return await run({
        ...delegados,
        $queryRaw: async (partes: TemplateStringsArray, ...valores: unknown[]) => {
          if (!partes.join('').includes('pg_advisory_xact_lock')) return []
          const chave = String(valores[0])
          banco.eventos.push(`trava:${chave}`)
          const cauda = banco.travas.get(chave)
          let liberar!: () => void
          const minha = new Promise<void>((r) => {
            liberar = r
          })
          banco.travas.set(chave, (cauda ?? Promise.resolve()).then(() => minha))
          liberacoes.push(liberar)
          if (cauda) {
            banco.presas++
            soltarQuemEspera()
            await cauda
            banco.presas--
          }
          return [{ ok: 1 }]
        },
      })
    } finally {
      // A trava de transação some no commit ou no rollback.
      for (const liberar of liberacoes) liberar()
    }
  }
  return { db: { ...delegados, $transaction } }
})

import { garantirPasta } from '../pastas'

beforeEach(() => {
  banco.templates = []
  banco.seq = 0
  banco.travas = new Map()
  banco.presas = 0
  banco.esperando = null
  banco.barreira = false
  banco.eventos = []
})

describe('R12-09 — garantirPasta com duas execuções ao mesmo tempo', () => {
  it('as duas leem a ausência da pasta; só a que segura a trava cria, e a outra relê DEPOIS dela e devolve a mesma', async () => {
    banco.barreira = true
    const [a, b] = await Promise.all([
      garantirPasta(8, 'dono', '2026-10-07 19:00', 'story'),
      garantirPasta(8, 'dono', '2026-10-07 19:00', 'story'),
    ])
    expect(banco.templates).toHaveLength(1)
    expect(a.id).toBe(b.id)
    const chave = `pasta-da-semana:8:${a.pasta.chave}`
    const ev = banco.eventos
    // A barreira: as duas leram a ausência antes de qualquer criação.
    expect(ev.slice(0, 2)).toEqual(['leitura:ausente', 'leitura:ausente'])
    // As duas pediram a MESMA trava; só uma releitura (a de quem a segurava) ainda achou a ausência,
    // e a outra — relida depois — achou a pasta criada.
    expect(ev.filter((e) => e === `trava:${chave}`)).toHaveLength(2)
    expect(ev.filter((e) => e === 'leitura:ausente')).toHaveLength(3)
    expect(ev.lastIndexOf('leitura:ausente')).toBeGreaterThan(ev.indexOf(`trava:${chave}`))
    expect(ev.filter((e) => e === 'criacao')).toHaveLength(1)
  })

  it('controle: a pasta que já existe é devolvida sem trava e sem criar nada', async () => {
    const primeira = await garantirPasta(8, 'dono', '2026-10-07 19:00', 'story')
    banco.eventos = []
    const segunda = await garantirPasta(8, 'dono', '2026-10-08 10:00', 'story')
    expect(segunda.id).toBe(primeira.id)
    expect(banco.eventos).toEqual([])
    expect(banco.templates).toHaveLength(1)
  })

  it('controle: pastas diferentes (outro formato) não disputam a mesma trava', async () => {
    banco.barreira = true
    const [story, feed] = await Promise.all([
      garantirPasta(8, 'dono', '2026-10-07 19:00', 'story'),
      garantirPasta(8, 'dono', '2026-10-07 19:00', 'feed'),
    ])
    expect(story.id).not.toBe(feed.id)
    expect(banco.templates).toHaveLength(2)
  })
})
