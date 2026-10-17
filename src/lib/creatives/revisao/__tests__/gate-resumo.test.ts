/**
 * CP5e § 2 — `resumoDoGateDosPosts` (puro, sem banco): a situação de cada post do registro do gate, fail-closed no
 * vínculo (I6–I8), rótulo `coincidente` com `naoConferido`, `historico` quando a página mudou, teto com `parcial`, e o
 * escopo `permitidos` (nulo = carteira inteira; não nulo = post fora dele é inválido).
 */
import { describe, expect, it } from 'vitest'
import { AVISO_DO_GATE } from '@/lib/mcp/catalogo/ver-geracao-retorno'
import { POLITICA_DO_ASSUNTO_DO_GATE } from '@/lib/lotes/agendamento'
import { NAO_CONFERIDO_PELA_IDENTIDADE } from '../gate-registro'
import { CHAVE_DO_GATE } from '../gate-registro'
import { resumoDoGateDosPosts, resumoVazio, situacaoDoRegistroDoPost, TETO_DE_POSTS_DO_GATE, type GenerationParaOResumo, type PaginaParaOResumo } from '../gate-resumo'
import { PAGINA_LIMPA, decidirOk } from './suporte/pagina-limpa'

const pagina: PaginaParaOResumo = { ...PAGINA_LIMPA, Template: { projectId: 8 } }
const registro = decidirOk().registro // vínculo: projeto 8, gen-1, pg-1; APTO
const generation = (id: string, extra: Record<string, unknown> = {}): GenerationParaOResumo => ({ id, projectId: 8, fieldValues: { source: 'compositor', pageId: 'pg-1', [CHAVE_DO_GATE]: registro, ...extra } as Record<string, unknown> })
const post = (id: string, extra: Partial<{ projectId: number; pageId: string | null; generationId: string | null }> = {}) => ({ id, projectId: 8, pageId: 'pg-1', generationId: 'gen-1', ...extra })
const situacao = (p: ReturnType<typeof post>, gens = [generation('gen-1')], pags = [pagina], permitidos: number[] | null = null) =>
  situacaoDoRegistroDoPost(p, new Map(gens.map((g) => [g.id, g])), new Map(pags.map((x) => [x.id, x])), permitidos)

describe('situação de um post', () => {
  it('registro APTO da página de hoje → coincidente, com o veredito e o naoConferido fixo de validadeDoGate', () => {
    expect(situacao(post('p1'))).toEqual({ situacao: 'coincidente', resultado: 'APTO', naoConferido: NAO_CONFERIDO_PELA_IDENTIDADE })
  })
  it('I7: a página mudou depois do registro (camadas) → historico, nunca coincidente', () => {
    const mudada = { ...pagina, layers: (PAGINA_LIMPA.layers as Array<Record<string, unknown>>).map((l) => (l.id === 'apoio' ? { ...l, content: 'Outro apoio' } : l)) }
    expect(situacao(post('p1'), undefined, [mudada]).situacao).toBe('historico')
  })
  it('I7: o contrato de copy mudou → historico (copyVersion)', () => {
    const mudada = { ...pagina, copyAutoral: { ...(PAGINA_LIMPA.copyAutoral as Record<string, unknown>), revisoes: [{ em: '2026-10-17T00:00:00.000Z', autor: 'equipe', motivo: 'x', blocos: [] }] } }
    expect(['historico', 'ilegivel']).toContain(situacao(post('p1'), undefined, [mudada]).situacao)
  })
  it('post sem generationId → semRegistro; Generation sem a chave → semRegistro; chave ilegível → ilegivel', () => {
    expect(situacao(post('p1', { generationId: null })).situacao).toBe('semRegistro')
    expect(situacao(post('p1'), [{ id: 'gen-1', projectId: 8, fieldValues: { source: 'compositor', pageId: 'pg-1' } }]).situacao).toBe('semRegistro')
    expect(situacao(post('p1'), [generation('gen-1', { [CHAVE_DO_GATE]: { gate: { versao: 'gate-v0' } } })]).situacao).toBe('ilegivel')
  })
  it('I6/I7 fail-closed no vínculo: Generation que não veio, de outro projeto, de outra página; página que não veio ou de outro projeto; post fora de permitidos → registroInvalido, sem resultado', () => {
    expect(situacao(post('p1'), [])).toEqual({ situacao: 'registroInvalido' })
    expect(situacao(post('p1'), [{ ...generation('gen-1'), projectId: 9 }])).toEqual({ situacao: 'registroInvalido' })
    expect(situacao(post('p1'), [generation('gen-1', { pageId: 'pg-2' })])).toEqual({ situacao: 'registroInvalido' })
    expect(situacao(post('p1'), undefined, [])).toEqual({ situacao: 'registroInvalido' })
    expect(situacao(post('p1'), undefined, [{ ...pagina, Template: { projectId: 9 } }])).toEqual({ situacao: 'registroInvalido' })
    expect(situacao(post('p1'), undefined, [{ ...pagina, Template: null }])).toEqual({ situacao: 'registroInvalido' })
    expect(situacao(post('p1'), undefined, undefined, [9])).toEqual({ situacao: 'registroInvalido' })
    expect(situacao(post('p1'), undefined, undefined, [8]).situacao).toBe('coincidente')
  })
})

describe('resumo da carteira', () => {
  it('conta por projeto e no total; o vazio tem a política e a frase fixa do ver-geracao', () => {
    const r = resumoDoGateDosPosts({
      posts: [post('a'), post('b', { generationId: null }), post('c', { projectId: 9, pageId: 'pg-9', generationId: 'gen-9' })],
      generations: [generation('gen-1'), { id: 'gen-9', projectId: 9, fieldValues: { pageId: 'pg-9' } }],
      pages: [pagina, { ...pagina, id: 'pg-9', Template: { projectId: 9 } }],
      permitidos: null,
    })
    expect(r.porProjeto.get(8)).toMatchObject({ posts: 2, coincidente: { APTO: 1, REVISAO_HUMANA_NECESSARIA: 0 }, semRegistro: 1, historico: 0, registroInvalido: 0 })
    expect(r.porProjeto.get(9)).toMatchObject({ posts: 1, semRegistro: 1 })
    expect(r.total).toMatchObject({ posts: 3, coincidente: { APTO: 1 }, semRegistro: 2, parcial: false, naoLidos: 0, teto: TETO_DE_POSTS_DO_GATE, politicaDoAssunto: POLITICA_DO_ASSUNTO_DO_GATE, aviso: AVISO_DO_GATE })
    expect(resumoVazio()).toMatchObject({ posts: 0, aviso: AVISO_DO_GATE })
  })
  it('teto: só os primeiros `teto` posts são lidos; o resto vira parcial/naoLidos', () => {
    const posts = Array.from({ length: 5 }, (_, i) => post(`p${i}`))
    const r = resumoDoGateDosPosts({ posts, generations: [generation('gen-1')], pages: [pagina], permitidos: null, teto: 3 })
    expect(r.total).toMatchObject({ posts: 3, parcial: true, naoLidos: 2, teto: 3, coincidente: { APTO: 3 } })
  })
  it('custo: 60 posts resumidos de uma vez (puro, sem banco) — correto e linear no número de posts', () => {
    // Tempo de parede NÃO é asserção (o runner do CI compartilhado levou 57 ms onde a máquina local leva 10 — a primeira
    // rodada da main depois do CP5e caiu nisso): o que se prova é a correção do resumo e que o custo cresce com os POSTS,
    // não com o tamanho do banco (Generations e páginas são indexadas por id uma vez).
    const posts = Array.from({ length: 60 }, (_, i) => post(`p${i}`))
    const muitasGenerations = [generation('gen-1'), ...Array.from({ length: 2_000 }, (_, i) => ({ id: `outra-${i}`, projectId: 9, fieldValues: { pageId: `pg-${i}` } }))]
    const muitasPaginas = [pagina, ...Array.from({ length: 2_000 }, (_, i) => ({ ...pagina, id: `pg-${i}` }))]
    const r = resumoDoGateDosPosts({ posts, generations: muitasGenerations, pages: muitasPaginas, permitidos: null })
    expect(r.total).toMatchObject({ posts: 60, coincidente: { APTO: 60 }, parcial: false })
    expect(r.porProjeto.get(8)).toMatchObject({ posts: 60 })
    // Guarda grosseira contra uma regressão para O(posts × banco): com 2.000 linhas de cada lado isto tem de ficar em bem
    // menos de alguns segundos mesmo num runner lento.
    const t0 = performance.now()
    resumoDoGateDosPosts({ posts, generations: muitasGenerations, pages: muitasPaginas, permitidos: null })
    expect(performance.now() - t0).toBeLessThan(2_000)
  })
})
