import { afterEach, describe, expect, it, vi } from 'vitest'
import { MutationObserver, QueryClient, QueryObserver } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { lerVoz, type ContextoDeVoz, type VozCompacta } from '@/lib/brand/voz'
import {
  ESTADO_INICIAL_DA_VOZ,
  formularioParaVoz,
  formulariosIguais,
  reconciliarComServidor,
  registroParaFormulario,
  type FormularioDaVoz,
} from '@/lib/brand/voz-formulario'
import type { VozDaMarca } from '@/lib/brand/aba-marca'
import { confirmarGravacaoDoDna, consultaDaVozDaMarca, gravacaoDaVozDaMarca } from '../use-aba-marca'

/**
 * A aba Marca não tem teste de tela: aqui roda o que a tela chama — as opções
 * da consulta e da gravação do hook, num QueryClient de verdade, contra um
 * servidor em memória no `fetch` que faz o que as rotas fazem (o PUT valida
 * com `lerVoz` e recusa pela versão lida, como `salvarVozDaMarca`). O efeito
 * `[data]` da tela é a função pura `reconciliarComServidor`, chamada quando a
 * REFERÊNCIA do dado muda — como o React faz.
 */
const PROJETO = 8
const CHAVE_DA_VOZ = ['voz-da-marca', PROJETO]
const CHAVE_DO_DNA = ['brand-dna', PROJETO]

const CONTEXTO: ContextoDeVoz = { fonte: 'legado', texto: null, regrasDaMarca: null, versao: null, migradaEm: null, vozPendente: true, regrasDeArte: null, vocabulario: null }

const VOZ_V1: VozCompacta = {
  versao: 'voz-v1',
  descricao: 'Direta e quente.',
  exemplos: ['Sexta é dia de costela.'],
  antesDepois: [],
  termos: ['costela no bafo'],
  proibicoes: [],
  regras: [],
}

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } })
}

function servidorDaVoz(inicial: VozCompacta) {
  const s = { versao: 1, voz: inicial, falharLeitura: false, leiturasQueFalharam: 0, versoesEsperadas: [] as Array<number | null> }
  const leitura = (): VozDaMarca => ({
    contexto: CONTEXTO,
    registro: { versao: s.versao, voz: s.voz, problemas: [], migradaEm: null, dnaArquivado: null, atualizadaEm: `2026-09-18T12:00:0${s.versao}.000Z` },
    legado: { toneOfVoice: null, contentRules: null },
  })
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url !== `/api/projects/${PROJETO}/voz`) throw new Error(`rota inesperada: ${url}`)
    if (init?.method === 'PUT') {
      const corpo = JSON.parse(String(init.body)) as { voz: unknown; versaoEsperada: number | null }
      s.versoesEsperadas.push(corpo.versaoEsperada)
      if (corpo.versaoEsperada !== s.versao) return json({ error: `A voz mudou enquanto você editava (versão ${s.versao}).`, code: 'VOZ_DIVERGENTE' }, 409)
      const lida = lerVoz(corpo.voz)
      if (!lida.voz) return json({ error: 'VOZ_INVALIDA', code: 'VOZ_INVALIDA' }, 400)
      s.versao += 1
      s.voz = lida.voz
      return json({ ...leitura(), gravada: { versao: s.versao, criada: false } })
    }
    if (s.falharLeitura) {
      s.leiturasQueFalharam += 1
      return json({ error: 'Erro ao carregar a voz da marca' }, 500)
    }
    return json(leitura())
  })
  return { s, fetch }
}

/** O que a tela "Como a marca fala" faz, sem React: o efeito de `[data]` e o `gravar`. */
function tela(qc: QueryClient) {
  let estado = ESTADO_INICIAL_DA_VOZ
  let enviado: FormularioDaVoz | null = null
  let visto: VozDaMarca | undefined
  const gravacao = new MutationObserver(qc, gravacaoDaVozDaMarca(qc, PROJETO))
  return {
    get estado() {
      return estado
    },
    efeito() {
      const data = qc.getQueryData<VozDaMarca>(CHAVE_DA_VOZ)
      if (!data || data === visto) return
      visto = data
      estado = reconciliarComServidor(estado, registroParaFormulario(data.registro), { enviado, substituindo: false })
    },
    editar(patch: Partial<FormularioDaVoz>) {
      estado = { ...estado, form: { ...estado.form, ...patch } }
    },
    async salvar() {
      enviado = estado.form
      try {
        return await gravacao.mutate({ voz: formularioParaVoz(estado.form), versaoEsperada: estado.versaoLida })
      } catch (e) {
        enviado = null
        throw e
      }
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('PR14-15 — a gravação confirmada da voz não se perde quando a releitura falha', () => {
  it('lê v1, salva A (v2) com a releitura falhando, edita B e salva: B vai com a versão 2 e grava a v3, sem conflito falso', async () => {
    const servidor = servidorDaVoz(VOZ_V1)
    vi.stubGlobal('fetch', servidor.fetch)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await qc.fetchQuery(consultaDaVozDaMarca(PROJETO))
    // A consulta ATIVA, como com a tela montada: é o que faz a invalidação reler.
    const sair = new QueryObserver(qc, consultaDaVozDaMarca(PROJETO)).subscribe(() => {})
    const t = tela(qc)
    t.efeito()
    expect(t.estado).toMatchObject({ versaoLida: 1, divergente: null })

    t.editar({ descricao: 'A — direta e quente.' })
    servidor.s.falharLeitura = true
    const a = await t.salvar()
    expect(a.gravada.versao).toBe(2)
    // A releitura correu e falhou: a consulta está em erro, com o dado da gravação confirmada.
    expect(servidor.s.leiturasQueFalharam).toBe(1)
    expect(qc.getQueryState(CHAVE_DA_VOZ)?.status).toBe('error')
    t.efeito()
    expect(t.estado).toMatchObject({ versaoLida: 2, divergente: null })
    expect(formulariosIguais(t.estado.base, t.estado.form)).toBe(true)

    t.editar({ descricao: 'B — direta, quente e curta.' })
    const b = await t.salvar()
    expect(servidor.s.versoesEsperadas).toEqual([1, 2])
    expect(b.gravada.versao).toBe(3)
    expect(servidor.s.voz.descricao).toBe('B — direta, quente e curta.')
    t.efeito()
    expect(t.estado).toMatchObject({ versaoLida: 3, divergente: null })
    expect(formulariosIguais(t.estado.base, t.estado.form)).toBe(true)
    sair()
    qc.clear()
  })
})

describe('varredura do PR14-15 — o DNA (BrandDnaSection) não reinicia os campos do cache anterior à gravação', () => {
  const LIDO = {
    projectId: PROJETO,
    projectName: 'Espeto',
    dna: { toneOfVoice: 'tom antigo', contentRules: 'regras', composition: null, visualStyle: 'estilo do legado (brandStyleDescription)', photoDirection: null, approvalChecklist: null },
    colors: [{ name: 'Brasa', hexCode: '#C0392B' }],
  }
  /** A resposta do PATCH: a linha crua do DNA — sem o `visualStyle` que o loader resolve pelo legado. */
  const LINHA_GRAVADA = { toneOfVoice: 'tom novo', contentRules: 'regras', composition: null, visualStyle: null, photoDirection: null, approvalChecklist: null }
  const consulta = { queryKey: CHAVE_DO_DNA, queryFn: () => api.get<typeof LIDO>(`/api/projects/${PROJETO}/brand-dna`), staleTime: 60_000 }

  async function montar(respostas: Array<typeof LIDO | 'falha'>) {
    const fila = [...respostas]
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const r = fila.shift() ?? 'falha'
        return r === 'falha' ? json({ error: 'Erro ao carregar o DNA da marca' }, 500) : json(r)
      }),
    )
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await qc.fetchQuery(consulta)
    const sair = new QueryObserver(qc, consulta).subscribe(() => {})
    return { qc, sair }
  }

  it('releitura que falha: o cache tem o que o PATCH confirmou nas seções do patch; o resto fica como o loader resolveu', async () => {
    const { qc, sair } = await montar([LIDO, 'falha'])
    await confirmarGravacaoDoDna(qc, PROJETO, { toneOfVoice: 'tom novo' }, LINHA_GRAVADA)
    expect(qc.getQueryState(CHAVE_DO_DNA)?.status).toBe('error')
    const dado = qc.getQueryData<typeof LIDO>(CHAVE_DO_DNA)
    expect(dado?.dna.toneOfVoice).toBe('tom novo')
    expect(dado?.dna.visualStyle).toBe('estilo do legado (brandStyleDescription)')
    expect(dado?.colors).toEqual(LIDO.colors)
    sair()
    qc.clear()
  })

  it('releitura que dá certo é AGUARDADA: quando a função volta, o cache já é a leitura do servidor (é dela que os campos reiniciam)', async () => {
    const releitura = { ...LIDO, dna: { ...LIDO.dna, toneOfVoice: 'tom novo, como o servidor devolve' } }
    const { qc, sair } = await montar([LIDO, releitura])
    await confirmarGravacaoDoDna(qc, PROJETO, { toneOfVoice: 'tom novo' }, LINHA_GRAVADA)
    expect(qc.getQueryState(CHAVE_DO_DNA)?.status).toBe('success')
    expect(qc.getQueryData<typeof LIDO>(CHAVE_DO_DNA)?.dna.toneOfVoice).toBe('tom novo, como o servidor devolve')
    sair()
    qc.clear()
  })
})
