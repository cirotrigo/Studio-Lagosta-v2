/**
 * As etapas do processador de vídeo sem banco nem ffmpeg: o marcador do MP4
 * gravado LOGO depois do upload (antes da miniatura e do backup), o arquivo
 * apagado só quando é órfão comprovado, e a falha definitiva gravada no job e
 * na Generation num commit só.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))

const { etapaDoMp4, gravarApontandoPara, finalizarFalhaDoVideo } = await import('@/lib/video/etapas-do-video')

const URL_MP4 = 'https://blob.test/video.mp4'

function trilhaDaEtapa(p: {
  gravarMarcador?: () => Promise<unknown>
  marcadorAtual?: () => Promise<string | null>
  auxiliares?: () => Promise<void>
}) {
  const trilha: string[] = []
  const rodar = () =>
    etapaDoMp4({
      subirMp4: async () => {
        trilha.push('upload')
        return URL_MP4
      },
      gravarMarcador: async (url) => {
        trilha.push(`marcador ${url}`)
        if (p.gravarMarcador) await p.gravarMarcador()
      },
      marcadorAtual: p.marcadorAtual ?? (async () => null),
      apagar: async (url) => {
        trilha.push(`apagar ${url}`)
      },
      auxiliares: async () => {
        trilha.push('auxiliares')
        if (p.auxiliares) await p.auxiliares()
      },
    })
  return { trilha, rodar }
}

describe('etapaDoMp4', () => {
  it('grava o marcador logo depois do upload, antes da miniatura e do backup', async () => {
    const { trilha, rodar } = trilhaDaEtapa({})
    await expect(rodar()).resolves.toBe(URL_MP4)
    expect(trilha).toEqual(['upload', `marcador ${URL_MP4}`, 'auxiliares'])
  })

  it('auxiliar que falha não apaga o MP4 que o marcador já aponta', async () => {
    const { trilha, rodar } = trilhaDaEtapa({
      auxiliares: async () => {
        throw new Error('o Drive caiu')
      },
    })
    await expect(rodar()).rejects.toThrow('o Drive caiu')
    expect(trilha).not.toContain(`apagar ${URL_MP4}`)
  })

  it('a escrita aconteceu e só a confirmação se perdeu: nada é apagado e a etapa segue', async () => {
    const { trilha, rodar } = trilhaDaEtapa({
      gravarMarcador: async () => {
        throw new Error('a conexão caiu depois do commit')
      },
      marcadorAtual: async () => URL_MP4,
    })
    await expect(rodar()).resolves.toBe(URL_MP4)
    expect(trilha).toEqual(['upload', `marcador ${URL_MP4}`, 'auxiliares'])
  })

  it('o marcador não aponta para o arquivo: órfão comprovado é apagado e o erro sobe', async () => {
    const { trilha, rodar } = trilhaDaEtapa({
      gravarMarcador: async () => {
        throw new Error('arrendamento perdido')
      },
      marcadorAtual: async () => null,
    })
    await expect(rodar()).rejects.toThrow('arrendamento perdido')
    expect(trilha).toEqual(['upload', `marcador ${URL_MP4}`, `apagar ${URL_MP4}`])
  })

  it('sem conseguir reler, não há prova: nada é apagado e o erro ORIGINAL sobe', async () => {
    const { trilha, rodar } = trilhaDaEtapa({
      gravarMarcador: async () => {
        throw new Error('a escrita falhou')
      },
      marcadorAtual: async () => {
        throw new Error('a releitura também')
      },
    })
    await expect(rodar()).rejects.toThrow('a escrita falhou')
    expect(trilha.some((t) => t.startsWith('apagar'))).toBe(false)
  })
})

describe('gravarApontandoPara', () => {
  it('apaga só o arquivo que o registro relido não aponta', async () => {
    const apagados: string[] = []
    await expect(
      gravarApontandoPara({
        arquivos: ['https://blob.test/a.jpg', 'https://blob.test/b.jpg'],
        gravar: async () => {
          throw new Error('x')
        },
        apontados: async () => ['https://blob.test/a.jpg', null],
        apagar: async (url) => {
          apagados.push(url)
        },
      }),
    ).rejects.toThrow('x')
    expect(apagados).toEqual(['https://blob.test/b.jpg'])
  })

  it('sem arquivo novo, o erro sobe sem releitura', async () => {
    const apontados = vi.fn(async () => [])
    await expect(
      gravarApontandoPara({
        arquivos: [],
        gravar: async () => {
          throw new Error('x')
        },
        apontados,
        apagar: async () => {},
      }),
    ).rejects.toThrow('x')
    expect(apontados).not.toHaveBeenCalled()
  })
})

// ── falha definitiva: o job e a Generation num commit só ──────────────────────

const inicio = new Date('2026-10-03T12:00:00Z')

interface Estado {
  job: { id: string; status: string; startedAt: Date | null; errorMessage: string | null }
  generation: { id: string; status: string; resultUrl: string | null; fieldValues: Record<string, unknown> }
}

function bancoFalso(estadoInicial: Estado, opcoes: { generationFalha?: boolean } = {}) {
  let estado = structuredClone(estadoInicial)
  const tx = {
    videoProcessingJob: {
      updateMany: async ({ where, data }: any) => {
        const j = estado.job
        const casa =
          j.id === where.id && j.status === where.status && j.startedAt?.getTime() === where.startedAt?.getTime()
        if (!casa) return { count: 0 }
        Object.assign(j, data)
        return { count: 1 }
      },
    },
    // O `mesclarFieldValuesDaArte` é um UPDATE com `||` no banco: aqui, o merge raso que ele faz.
    $executeRaw: async (_sql: TemplateStringsArray, json: string) => {
      estado.generation.fieldValues = { ...estado.generation.fieldValues, ...JSON.parse(json) }
      return 1
    },
    generation: {
      update: async ({ data }: any) => {
        if (opcoes.generationFalha) throw new Error('a escrita da Generation caiu')
        Object.assign(estado.generation, data)
        return estado.generation
      },
    },
  }
  const client = {
    $transaction: async (fazer: (tx: any) => Promise<unknown>) => {
      const copia = structuredClone(estado)
      try {
        return await fazer(tx)
      } catch (e) {
        estado = copia // o que a transação escreveu volta, como no banco
        throw e
      }
    },
  }
  return { client: client as any, estado: () => estado }
}

const estadoInicial = (): Estado => ({
  job: { id: 'j1', status: 'PROCESSING', startedAt: inicio, errorMessage: null },
  generation: { id: 'g1', status: 'PROCESSING', resultUrl: null, fieldValues: { progress: 50, videoExport: true } },
})

describe('finalizarFalhaDoVideo', () => {
  it('o job e a Generation viram FAILED juntos', async () => {
    const banco = bancoFalso(estadoInicial())
    await expect(
      finalizarFalhaDoVideo(banco.client, {
        onde: { id: 'j1', status: 'PROCESSING', startedAt: inicio },
        generationId: 'g1',
        errorMessage: 'ffmpeg falhou',
        resultUrl: 'https://blob.test/capa.jpg',
      }),
    ).resolves.toBe(true)
    const e = banco.estado()
    expect(e.job).toMatchObject({ status: 'FAILED', errorMessage: 'ffmpeg falhou' })
    expect(e.generation.status).toBe('FAILED')
    expect(e.generation.resultUrl).toBe('https://blob.test/capa.jpg')
    expect(e.generation.fieldValues).toEqual({ progress: 100, videoExport: true, errorMessage: 'ffmpeg falhou' })
  })

  it('a Generation que não grava desfaz o job: nada fica pela metade, e a recuperação ainda o vê', async () => {
    const banco = bancoFalso(estadoInicial(), { generationFalha: true })
    await expect(
      finalizarFalhaDoVideo(banco.client, {
        onde: { id: 'j1', status: 'PROCESSING', startedAt: inicio },
        generationId: 'g1',
        errorMessage: 'ffmpeg falhou',
      }),
    ).rejects.toThrow('a escrita da Generation caiu')
    const e = banco.estado()
    expect(e.job.status).toBe('PROCESSING')
    expect(e.generation).toEqual(estadoInicial().generation)
  })

  it('job de outra execução: nada é gravado', async () => {
    const banco = bancoFalso(estadoInicial())
    await expect(
      finalizarFalhaDoVideo(banco.client, {
        onde: { id: 'j1', status: 'PROCESSING', startedAt: new Date(inicio.getTime() + 1000) },
        generationId: 'g1',
        errorMessage: 'x',
      }),
    ).resolves.toBe(false)
    expect(banco.estado()).toEqual(estadoInicial())
  })
})
