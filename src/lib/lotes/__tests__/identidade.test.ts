/**
 * A identidade do item de lote e o hash do payload — as decisões PURAS da
 * reserva (PR 11). O serviço com banco está em
 * `src/lib/compositor/__tests__/fila-lote.test.ts`.
 */
import { describe, expect, it } from 'vitest'
import { VERSAO_DO_CONTRATO } from '@/lib/copy-autoral/contrato'
import { validarSpec } from '@/lib/compositor/spec'
import {
  VERSAO_DO_HASH,
  decidirReserva,
  diferencasDoPayload,
  estadoDaPeca,
  hashConfere,
  hashDoPayload,
  mesmoPedidoDoLote,
  payloadParaHash,
  recuperacaoDaDecisao,
  situacaoDaPeca,
  validarIdentidadeDeLote,
} from '../identidade'

const spec = {
  projectId: 6,
  formato: 'story',
  nome: 'Sexta',
  quando: '2026-09-11T18:00:00.000Z',
  blocos: [
    { papel: 'headline', linhas: ['Sexta é dia de churrasco'] },
    { papel: 'cta', linhas: ['Vem pra cá'] },
  ],
}

const contrato = (em: string) => ({
  versao: VERSAO_DO_CONTRATO,
  origem: { autor: 'claude', em, superficie: 'chat' },
  blocos: [
    { id: 'pre', funcao: 'pre', grupoDeLeitura: 'frase-1', ordem: 0, linhas: ['Hoje tem'] },
    { id: 'headline', funcao: 'headline', grupoDeLeitura: 'frase-1', ordem: 1, linhas: ['Rodízio completo'] },
    { id: 'cta', funcao: 'cta', ordem: 2, linhas: ['Vem pra cá'] },
  ],
  revisoes: [{ em, autor: 'equipe', motivo: 'trocou o CTA', blocos: ['cta'] }],
})

const CONTROLE = String.fromCharCode(1)

describe('identidade do item de lote', () => {
  it('aceita loteId e itemId legíveis, com espaço e pontuação, e apara as pontas', () => {
    const r = validarIdentidadeDeLote({ loteId: ' semana 2026-09-14 ', itemId: 'seg/19h #1' })
    expect(r.identidade).toEqual({ loteId: 'semana 2026-09-14', itemId: 'seg/19h #1' })
  })

  it('recusa vazio, longo demais, caractere de controle e chave a mais — com TODOS os problemas', () => {
    expect(validarIdentidadeDeLote({ loteId: '', itemId: 'a' }).identidade).toBeNull()
    expect(validarIdentidadeDeLote({ loteId: 'a'.repeat(121), itemId: 'a' }).identidade).toBeNull()
    expect(validarIdentidadeDeLote({ loteId: `a${CONTROLE}b`, itemId: 'a' }).identidade).toBeNull()
    expect(validarIdentidadeDeLote({ loteId: 'a', itemId: 'b', extra: 1 }).identidade).toBeNull()
    const problemas: string[] = validarIdentidadeDeLote({ loteId: '', itemId: '' }).problemas
    expect(problemas.some((p) => p.startsWith('loteId'))).toBe(true)
    expect(problemas.some((p) => p.startsWith('itemId'))).toBe(true)
  })
})

describe('hash canônico do payload', () => {
  it('a ordem das chaves não é diferença', () => {
    const embaralhada = { quando: spec.quando, blocos: spec.blocos.map((b) => ({ linhas: b.linhas, papel: b.papel })), nome: spec.nome, formato: spec.formato, projectId: 6 }
    expect(hashDoPayload(payloadParaHash(embaralhada))).toBe(hashDoPayload(payloadParaHash(spec)))
  })

  it('leva a versão no prefixo', () => {
    expect(hashDoPayload(payloadParaHash(spec))).toMatch(new RegExp(`^${VERSAO_DO_HASH}:[0-9a-f]{64}$`))
  })

  it('projectId fica fora (já é parte da chave)', () => {
    expect(payloadParaHash(spec)).not.toHaveProperty('projectId')
    expect(hashDoPayload(payloadParaHash({ ...spec, projectId: 99 }))).toBe(hashDoPayload(payloadParaHash(spec)))
  })

  it('os carimbos de relógio do contrato ficam fora: remontar a chamada em outra hora não é outro pedido', () => {
    const a = payloadParaHash({ ...spec, blocos: undefined, copyAutoral: contrato('2026-09-12T10:00:00.000Z') })
    const b = payloadParaHash({ ...spec, blocos: undefined, copyAutoral: contrato('2026-09-12T10:07:31.000Z') })
    expect(hashDoPayload(a)).toBe(hashDoPayload(b))
    expect((a.copyAutoral as { origem: Record<string, unknown> }).origem).toEqual({ autor: 'claude', superficie: 'chat' })
  })

  it('tudo o que a peça mostra ou persiste entra: linhas, nome, quando, foto, autoria da copy', () => {
    const base = hashDoPayload(payloadParaHash(spec))
    expect(hashDoPayload(payloadParaHash({ ...spec, blocos: [{ papel: 'headline', linhas: ['Sábado é dia de churrasco'] }, spec.blocos[1]] }))).not.toBe(base)
    expect(hashDoPayload(payloadParaHash({ ...spec, nome: 'Sexta 2' }))).not.toBe(base)
    expect(hashDoPayload(payloadParaHash({ ...spec, quando: '2026-09-12T18:00:00.000Z' }))).not.toBe(base)
    expect(hashDoPayload(payloadParaHash({ ...spec, foto: { driveFileId: 'x' } }))).not.toBe(base)
    const comClaude = payloadParaHash({ ...spec, copyAutoral: contrato('t') })
    const comEquipe = payloadParaHash({ ...spec, copyAutoral: { ...contrato('t'), origem: { autor: 'equipe', em: 't' } } })
    expect(hashDoPayload(comClaude)).not.toBe(hashDoPayload(comEquipe))
  })

  it('é idempotente: aplicar a normalização duas vezes dá o mesmo payload', () => {
    const uma = payloadParaHash({ ...spec, copyAutoral: contrato('t') })
    expect(payloadParaHash(uma)).toEqual(uma)
  })

  it('sobre a spec VALIDADA, mandar só o contrato ou o contrato com os blocos derivados é o mesmo pedido', () => {
    const soContrato = validarSpec({ projectId: 6, formato: 'story', copyAutoral: contrato('2026-09-12T10:00:00.000Z') })
    expect(soContrato.spec).not.toBeNull()
    const comBlocos = validarSpec({ projectId: 6, formato: 'story', copyAutoral: contrato('2026-09-12T11:00:00.000Z'), blocos: soContrato.spec!.blocos })
    expect(comBlocos.spec).not.toBeNull()
    expect(hashDoPayload(payloadParaHash(comBlocos.spec))).toBe(hashDoPayload(payloadParaHash(soContrato.spec)))
    // `selecaoExperimental: false` é removido pela validação e não vira diferença.
    const falso = validarSpec({ ...spec, selecaoExperimental: false })
    expect(hashDoPayload(payloadParaHash(falso.spec))).toBe(hashDoPayload(payloadParaHash(validarSpec(spec).spec)))
  })

  it('linha gravada por outra versão da normalização é comparada recalculando o hash do payload guardado', () => {
    const payload = payloadParaHash(spec)
    const atual = hashDoPayload(payload)
    expect(hashConfere({ hashDoPayload: atual, payload }, atual)).toBe(true)
    expect(hashConfere({ hashDoPayload: 'lote-v0:antigo', payload }, atual)).toBe(true)
    expect(hashConfere({ hashDoPayload: 'lote-v0:antigo', payload: { ...payload, nome: 'outro' } }, atual)).toBe(false)
    expect(hashConfere({ hashDoPayload: `${VERSAO_DO_HASH}:outro`, payload }, atual)).toBe(false)
  })
})

describe('diferenças do payload', () => {
  it('iguais não têm diferença', () => {
    expect(diferencasDoPayload(payloadParaHash(spec), payloadParaHash(spec))).toEqual([])
  })

  it('aponta o campo e o bloco pelo papel ou pelo id, nunca pela posição', () => {
    const antes = payloadParaHash(spec)
    const depois = payloadParaHash({ ...spec, nome: 'Outro', blocos: [spec.blocos[1], { papel: 'headline', linhas: ['Outra manchete'] }] })
    expect(diferencasDoPayload(antes, depois)).toEqual(['blocos[headline].linhas', 'nome'])
    const c1 = payloadParaHash({ ...spec, copyAutoral: contrato('t') })
    const c2 = payloadParaHash({ ...spec, copyAutoral: { ...contrato('t'), blocos: contrato('t').blocos.map((b) => (b.id === 'cta' ? { ...b, linhas: ['Reserve'] } : b)) } })
    expect(diferencasDoPayload(c1, c2)).toEqual(['copyAutoral.blocos[cta].linhas'])
  })

  it('campo acrescentado, ou lista sem chave (linhas, fotos), vira o caminho inteiro', () => {
    expect(diferencasDoPayload({ a: 1 }, { a: 1, foto: { url: 'x' } })).toEqual(['foto'])
    expect(diferencasDoPayload({ fotosCandidatas: ['a'] }, { fotosCandidatas: ['a', 'b'] })).toEqual(['fotosCandidatas'])
    expect(diferencasDoPayload({ fotosCandidatas: ['a', 'b'] }, { fotosCandidatas: ['a', 'c'] })).toEqual(['fotosCandidatas'])
  })

  it('para no teto de caminhos', () => {
    const muitos = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`k${String(i).padStart(2, '0')}`, i]))
    expect(diferencasDoPayload({}, muitos, 5)).toHaveLength(5)
  })
})

describe('decisão da reserva', () => {
  const payload = payloadParaHash(spec)
  const hash = hashDoPayload(payload)
  const registro = (extra: Partial<{ hashDoPayload: string; payload: unknown; generationId: string | null; jobId: string | null }> = {}) => ({ hashDoPayload: hash, payload, generationId: 'g1', jobId: 'j1', ...extra })
  const decidir = (r: ReturnType<typeof registro> | null, geracao: string | null, job: string | null, h = hash, p: unknown = payload) =>
    decidirReserva({ registro: r, hash: h, payload: p, geracao: geracao ? { status: geracao } : null, job: job ? { status: job } : null })

  it('sem linha: criar', () => {
    expect(decidir(null, null, null)).toEqual({ acao: 'criar' })
  })

  it('outro payload é conflito ANTES de qualquer outra coisa, inclusive na reserva órfã e na peça que falhou', () => {
    const outro = payloadParaHash({ ...spec, nome: 'Outro' })
    const h = hashDoPayload(outro)
    expect(decidir(registro(), 'PROCESSING', 'PENDING', h, outro)).toEqual({ acao: 'conflito', diferencas: ['nome'] })
    expect(decidir(registro({ generationId: null, jobId: null }), null, null, h, outro).acao).toBe('conflito')
    expect(decidir(registro(), 'FAILED', 'FAILED', h, outro).acao).toBe('conflito')
  })

  it('reserva sem geração: retomar tudo', () => {
    expect(decidir(registro({ generationId: null, jobId: null }), null, null)).toMatchObject({ acao: 'retomar', falta: 'geracao-e-job' })
  })

  it('peça viva ou pronta: reaproveitar', () => {
    expect(decidir(registro(), 'PROCESSING', 'PENDING').acao).toBe('reaproveitar')
    expect(decidir(registro(), 'PROCESSING', 'RUNNING').acao).toBe('reaproveitar')
    expect(decidir(registro(), 'COMPLETED', 'DONE').acao).toBe('reaproveitar')
    // Pronta vale mesmo sem o job (a peça existe; o job é só como ela foi feita).
    expect(decidir(registro(), 'COMPLETED', null).acao).toBe('reaproveitar')
  })

  it('geração sumida, falha, ou job terminal com a geração aberta: retomar tudo', () => {
    expect(decidir(registro(), null, null)).toMatchObject({ acao: 'retomar', falta: 'geracao-e-job' })
    expect(decidir(registro(), 'FAILED', 'FAILED')).toMatchObject({ acao: 'retomar', falta: 'geracao-e-job' })
    expect(decidir(registro(), 'PROCESSING', 'FAILED')).toMatchObject({ acao: 'retomar', falta: 'geracao-e-job' })
    expect(decidir(registro(), 'PROCESSING', 'DONE')).toMatchObject({ acao: 'retomar', falta: 'geracao-e-job' })
  })

  it('geração aberta sem job: retomar só o job', () => {
    expect(decidir(registro(), 'PROCESSING', null)).toMatchObject({ acao: 'retomar', falta: 'job' })
  })

  it('a recuperação que o criador recebe: só quando a linha já apontava uma peça (R01–R02)', () => {
    expect(recuperacaoDaDecisao(decidir(registro(), 'PROCESSING', 'FAILED'), 'g1')).toEqual({ falta: 'geracao-e-job', generationId: 'g1' })
    expect(recuperacaoDaDecisao(decidir(registro(), 'PROCESSING', null), 'g1')).toEqual({ falta: 'job', generationId: 'g1' })
    expect(recuperacaoDaDecisao(decidir(registro({ generationId: null, jobId: null }), null, null), null)).toBeNull()
    expect(recuperacaoDaDecisao({ acao: 'criar' }, null)).toBeNull()
    expect(recuperacaoDaDecisao({ acao: 'reaproveitar' }, 'g1')).toBeNull()
  })

  it('situação da peça lida da Generation', () => {
    expect(situacaoDaPeca('PROCESSING')).toBe('pendente')
    expect(situacaoDaPeca('COMPLETED')).toBe('pronta')
    expect(situacaoDaPeca('FAILED')).toBe('falhou')
    expect(situacaoDaPeca(null)).toBe('falhou')
  })
})

describe('as regras que o criador reaplica sob a própria trava (R03, R04)', () => {
  it('estadoDaPeca é a MESMA regra de decidirReserva depois das checagens da linha', () => {
    const registro = { hashDoPayload: hashDoPayload(payloadParaHash(spec)), payload: payloadParaHash(spec), generationId: 'g1', jobId: 'j1' }
    const hash = registro.hashDoPayload
    const casos: Array<[{ status: string } | null, { status: string } | null]> = [
      [null, null], [null, { status: 'PENDING' }], [{ status: 'COMPLETED' }, null], [{ status: 'COMPLETED' }, { status: 'DONE' }],
      [{ status: 'FAILED' }, { status: 'FAILED' }], [{ status: 'PROCESSING' }, null], [{ status: 'PROCESSING' }, { status: 'FAILED' }],
      [{ status: 'PROCESSING' }, { status: 'DONE' }], [{ status: 'PROCESSING' }, { status: 'PENDING' }], [{ status: 'PROCESSING' }, { status: 'RUNNING' }],
    ]
    for (const [geracao, job] of casos) {
      expect(estadoDaPeca({ geracao, job })).toEqual(decidirReserva({ registro, hash, payload: registro.payload, geracao, job }))
    }
    expect(estadoDaPeca({ geracao: { status: 'PROCESSING' }, job: null })).toMatchObject({ acao: 'retomar', falta: 'job' })
    expect(estadoDaPeca({ geracao: { status: 'PROCESSING' }, job: { status: 'PENDING' } })).toEqual({ acao: 'reaproveitar' })
    expect(estadoDaPeca({ geracao: { status: 'COMPLETED' }, job: { status: 'DONE' } })).toEqual({ acao: 'reaproveitar' })
  })

  it('mesmoPedidoDoLote: carimbos e ordem das chaves não são diferença; conteúdo é; projectId fica fora', () => {
    const a = { ...spec, blocos: undefined, copyAutoral: contrato('2026-09-12T10:00:00.000Z') }
    const b = { ...spec, blocos: undefined, copyAutoral: contrato('2026-09-12T10:07:31.000Z') }
    expect(mesmoPedidoDoLote(a, b)).toBe(true)
    expect(mesmoPedidoDoLote(a, { ...b, nome: 'Outra' })).toBe(false)
    expect(mesmoPedidoDoLote(a, { ...b, copyAutoral: { ...contrato('t'), blocos: contrato('t').blocos.map((x) => (x.id === 'cta' ? { ...x, linhas: ['Reserve'] } : x)) } })).toBe(false)
    expect(mesmoPedidoDoLote(spec, { ...spec, projectId: 99 })).toBe(true)
  })
})
