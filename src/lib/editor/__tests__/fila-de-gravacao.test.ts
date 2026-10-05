import { describe, expect, it } from 'vitest'
import { criarAutosave, criarFila } from '../fila-de-gravacao'

/**
 * Banco falso com PATCH lento: cada envio fica pendurado até o teste soltar,
 * e o teste conta quantos estão em voo ao mesmo tempo. É o cenário medido em
 * 03/10/2026 (PATCH de ~5 s no dev, 15 gravações em 100 s).
 */
function montar() {
  const estado = { atual: 'v0', ultimoSalvo: 'v0' }
  const enviados: string[] = []
  const pendurados: Array<{ soltar: () => void; falhar: (e: Error) => void }> = []
  let emVoo = 0
  let maxEmVoo = 0
  const fila = criarFila()
  const autosave = criarAutosave<{ conteudo: string }>({
    fila,
    pendente: () => (estado.atual === estado.ultimoSalvo ? null : { conteudo: estado.atual }),
    enviar: (p) =>
      new Promise<void>((resolve, reject) => {
        enviados.push(p.conteudo)
        emVoo++
        maxEmVoo = Math.max(maxEmVoo, emVoo)
        pendurados.push({
          soltar: () => {
            emVoo--
            resolve()
          },
          falhar: (e) => {
            emVoo--
            reject(e)
          },
        })
      }),
    confirmar: (p) => {
      estado.ultimoSalvo = p.conteudo
    },
  })
  const esperar = () => new Promise((r) => setTimeout(r, 0))
  const soltarProximo = async () => {
    await esperar()
    pendurados.shift()!.soltar()
    await esperar()
  }
  return { estado, enviados, pendurados, fila, autosave, esperar, soltarProximo, maxEmVoo: () => maxEmVoo }
}

describe('fila de gravação da página', () => {
  it('re-renders durante o voo não mandam outro PATCH com o mesmo conteúdo', async () => {
    const t = montar()
    t.estado.atual = 'v1'
    const primeiro = t.autosave.salvar()
    await t.esperar()
    expect(t.enviados).toEqual(['v1'])

    // O efeito re-executa várias vezes enquanto o PATCH não volta (deps que
    // mudam de identidade, layers re-normalizadas): cada timer pede o save.
    const pedidos = Array.from({ length: 10 }, () => t.autosave.salvar())
    await t.esperar()
    expect(t.enviados).toEqual(['v1'])

    await t.soltarProximo()
    await expect(primeiro).resolves.toEqual({ conteudo: 'v1' })
    // Os pedidos do voo leram o pendente quando a vez chegou: nada a gravar.
    for (const p of pedidos) await expect(p).resolves.toBeNull()
    expect(t.enviados).toEqual(['v1'])
    expect(t.maxEmVoo()).toBe(1)
  })

  it('a edição feita durante o voo sai no PATCH seguinte, com o estado mais novo', async () => {
    const t = montar()
    t.estado.atual = 'v1'
    void t.autosave.salvar()
    await t.esperar()

    // Durante o voo: três edições, cada uma com o seu timer.
    for (const v of ['v2', 'v3', 'v4']) {
      t.estado.atual = v
      void t.autosave.salvar()
    }
    await t.esperar()
    expect(t.enviados).toEqual(['v1'])

    await t.soltarProximo()
    // Uma gravação só para as três edições, com a mais nova.
    expect(t.enviados).toEqual(['v1', 'v4'])

    // Edição durante o segundo voo também não se perde.
    t.estado.atual = 'v5'
    void t.autosave.salvar()
    await t.soltarProximo()
    await t.soltarProximo()

    expect(t.enviados).toEqual(['v1', 'v4', 'v5'])
    expect(t.estado.ultimoSalvo).toBe('v5')
    expect(t.maxEmVoo()).toBe(1)
  })

  it('PATCH que falha não é confirmado, e o pedido seguinte manda de novo', async () => {
    const t = montar()
    t.estado.atual = 'v1'
    const primeiro = t.autosave.salvar()
    await t.esperar()
    const depois = t.autosave.salvar() // pedido durante o voo
    t.pendurados.shift()!.falhar(new Error('500'))
    await expect(primeiro).rejects.toThrow('500')
    expect(t.estado.ultimoSalvo).toBe('v0')

    // O pedido que esperava a vez começa e reenvia o pendente.
    await t.soltarProximo()
    await expect(depois).resolves.toEqual({ conteudo: 'v1' })
    expect(t.enviados).toEqual(['v1', 'v1'])
    expect(t.estado.ultimoSalvo).toBe('v1')
    expect(t.maxEmVoo()).toBe(1)
  })

  it('pedidos antes de a vez começar se fundem num só', async () => {
    const t = montar()
    t.estado.atual = 'v1'
    const a = t.autosave.salvar()
    const b = t.autosave.salvar()
    expect(b).toBe(a)
    await t.soltarProximo()
    expect(t.enviados).toEqual(['v1'])
  })

  it('descarregar espera o voo e grava o que mudou depois dele', async () => {
    const t = montar()
    t.estado.atual = 'v1'
    void t.autosave.salvar()
    await t.esperar()
    t.estado.atual = 'v2'
    const descarregar = t.autosave.salvar()
    await t.soltarProximo()
    await t.soltarProximo()
    await expect(descarregar).resolves.toEqual({ conteudo: 'v2' })
    expect(t.enviados).toEqual(['v1', 'v2'])
  })

  it('outras escritas da página (miniatura) entram na mesma fila, nunca em paralelo', async () => {
    const t = montar()
    t.estado.atual = 'v1'
    void t.autosave.salvar()
    await t.esperar()
    const ordem: string[] = []
    const miniatura = t.fila.enfileirar(async () => {
      ordem.push(`miniatura com ${t.pendurados.length} em voo`)
    })
    await t.esperar()
    expect(ordem).toEqual([])
    await t.soltarProximo()
    await miniatura
    expect(ordem).toEqual(['miniatura com 0 em voo'])
    expect(t.fila.pendentes()).toBe(0)
  })
})
