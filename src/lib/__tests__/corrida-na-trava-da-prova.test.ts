import { describe, expect, it, vi } from 'vitest'
import { BloqueioNaoObservado, corridaNaTrava } from '../../../scripts/lib/corrida-na-trava'

/**
 * A corrida do passo 21 da prova do PR 12 (3ª FINAL do Codex sobre 7b7e90e1):
 * - R12-10: a criação pela conexão auxiliar só é autorizada com o bloqueio CONFIRMADO pelo banco — sem ele a
 *   corrida falha e o dono desiste, sem criar nada;
 * - R12-11: toda espera termina também quando o lado que sinalizaria falha — a transação do dono que rejeita
 *   antes de sinalizar a trava faz a corrida rejeitar (antes ficava esperando para sempre, sem chegar ao cleanup).
 *
 * O banco falso: a transação do dono e as consultas do vigia, com um registro de eventos; a "chamada real" fica
 * bloqueada até a transação do dono terminar (commit ou rollback soltam a trava).
 */
function banco(opcoes: { falharAntesDeTravar?: Error; vigiaVe?: number[]; vigiaFalha?: Error } = {}) {
  const eventos: string[] = []
  let terminouDono!: () => void
  const donoTerminou = new Promise<void>((r) => { terminouDono = r })
  let consultasDoVigia = 0
  let clientes = 0
  const criarCliente = () => {
    const papel = clientes++ === 0 ? 'dono' : 'vigia'
    return {
      async $transaction<R>(fn: (tx: { $queryRaw: <T>() => Promise<T> }) => Promise<R>): Promise<R> {
        const tx = {
          $queryRaw: async <T,>(): Promise<T> => {
            if (opcoes.falharAntesDeTravar) throw opcoes.falharAntesDeTravar
            eventos.push('dono:travou')
            return [{ pid: 42 }] as T
          },
        }
        try {
          const r = await fn(tx)
          eventos.push('dono:commit')
          return r
        } catch (e) {
          eventos.push('dono:rollback')
          throw e
        } finally {
          terminouDono()
        }
      },
      async $queryRaw<T>(): Promise<T> {
        if (opcoes.vigiaFalha) throw opcoes.vigiaFalha
        const lista = opcoes.vigiaVe ?? [1]
        const n = lista[Math.min(consultasDoVigia++, lista.length - 1)]
        eventos.push(`vigia:${n}`)
        return [{ n }] as T
      },
      async $disconnect() {
        eventos.push(`${papel}:desconectou`)
      },
    }
  }
  const segunda = vi.fn(async () => {
    eventos.push('segunda:começou')
    await donoTerminou
    // A chamada real continua trabalhando depois de a trava ser solta (relê, cria, carimba).
    await new Promise((r) => setTimeout(r, 5))
    eventos.push('segunda:terminou')
    return 'resposta'
  })
  const criarComoDono = vi.fn(async () => {
    eventos.push('dono:criou')
    return { id: 'criado-pelo-dono' }
  })
  return { eventos, criarCliente, segunda, criarComoDono }
}

const antes = (eventos: string[], a: string, b: string) => eventos.indexOf(a) >= 0 && eventos.indexOf(a) < eventos.indexOf(b)

describe('corridaNaTrava — a corrida real do passo 21 (R12-10, R12-11)', () => {
  it('R12-11: a transação do dono rejeita ANTES de sinalizar a trava — a corrida rejeita, os dois clientes desconectam, nada é criado, e o cleanup da prova é alcançado', { timeout: 1500 }, async () => {
    const b = banco({ falharAntesDeTravar: new Error('conexão recusada') })
    // O mesmo formato do passo da prova: o erro chega ao catch e o finally (o cleanup) roda.
    let falhas = 0
    let cleanup = false
    try {
      await corridaNaTrava({ chave: 'k', criarCliente: b.criarCliente, segunda: b.segunda, criarComoDono: b.criarComoDono, tentativas: 3, intervaloMs: 1 })
    } catch (erro) {
      falhas++
      expect((erro as Error).message).toBe('conexão recusada')
    } finally {
      cleanup = true
    }
    expect(falhas).toBe(1)
    expect(cleanup).toBe(true)
    expect(b.segunda).not.toHaveBeenCalled()
    expect(b.criarComoDono).not.toHaveBeenCalled()
    expect(b.eventos).toEqual(expect.arrayContaining(['dono:desconectou', 'vigia:desconectou']))
  })

  it('R12-10: o banco NÃO confirma o bloqueio — a corrida FALHA, o dono desiste sem criar, a chamada real termina antes do encerramento, e os dois desconectam', { timeout: 1500 }, async () => {
    const b = banco({ vigiaVe: [0] })
    await expect(
      corridaNaTrava({ chave: 'k', criarCliente: b.criarCliente, segunda: b.segunda, criarComoDono: b.criarComoDono, tentativas: 3, intervaloMs: 1 }),
    ).rejects.toBeInstanceOf(BloqueioNaoObservado)
    expect(b.criarComoDono).not.toHaveBeenCalled()
    expect(b.eventos).toContain('dono:rollback')
    expect(antes(b.eventos, 'segunda:terminou', 'dono:desconectou')).toBe(true)
    expect(b.eventos).toContain('vigia:desconectou')
  })

  it('a consulta do vigia falha: a corrida rejeita com o erro, o dono desiste sem criar (a trava é solta), a chamada real termina e os dois desconectam', { timeout: 1500 }, async () => {
    const b = banco({ vigiaFalha: new Error('vigia caiu') })
    await expect(
      corridaNaTrava({ chave: 'k', criarCliente: b.criarCliente, segunda: b.segunda, criarComoDono: b.criarComoDono, tentativas: 3, intervaloMs: 1 }),
    ).rejects.toThrow('vigia caiu')
    expect(b.criarComoDono).not.toHaveBeenCalled()
    expect(b.eventos).toContain('dono:rollback')
    expect(antes(b.eventos, 'segunda:terminou', 'dono:desconectou')).toBe(true)
  })

  it('o dono falha AO CRIAR: a corrida rejeita com o erro dele, depois de a chamada real terminar; os dois desconectam', { timeout: 1500 }, async () => {
    const b = banco({ vigiaVe: [1] })
    b.criarComoDono.mockRejectedValueOnce(new Error('falhou ao criar'))
    await expect(
      corridaNaTrava({ chave: 'k', criarCliente: b.criarCliente, segunda: b.segunda, criarComoDono: b.criarComoDono, tentativas: 3, intervaloMs: 1 }),
    ).rejects.toThrow('falhou ao criar')
    expect(b.eventos).toContain('dono:rollback')
    expect(antes(b.eventos, 'segunda:terminou', 'dono:desconectou')).toBe(true)
    expect(b.eventos).toContain('vigia:desconectou')
  })

  it('controle: o vigia vê o bloqueio na 3ª consulta — lê durante o bloqueio ANTES de o dono criar; o dono cria uma vez e commita; a chamada real termina depois; devolve o criado e a resposta', { timeout: 1500 }, async () => {
    const b = banco({ vigiaVe: [0, 0, 1] })
    const r = await corridaNaTrava({
      chave: 'k',
      criarCliente: b.criarCliente,
      segunda: b.segunda,
      criarComoDono: b.criarComoDono,
      duranteOBloqueio: async () => {
        b.eventos.push('leu-no-bloqueio')
        return 'lido'
      },
      tentativas: 10,
      intervaloMs: 1,
    })
    expect(r).toMatchObject({ bloqueou: true, criado: { id: 'criado-pelo-dono' }, lidoNoBloqueio: 'lido', valor: 'resposta', erro: null })
    expect(b.criarComoDono).toHaveBeenCalledTimes(1)
    expect(antes(b.eventos, 'vigia:1', 'leu-no-bloqueio')).toBe(true)
    expect(antes(b.eventos, 'leu-no-bloqueio', 'dono:criou')).toBe(true)
    expect(antes(b.eventos, 'dono:commit', 'segunda:terminou')).toBe(true)
    expect(b.eventos).toEqual(expect.arrayContaining(['dono:desconectou', 'vigia:desconectou']))
  })
})
