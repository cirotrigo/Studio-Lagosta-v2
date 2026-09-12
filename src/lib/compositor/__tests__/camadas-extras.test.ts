import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import { montarAssinatura } from '../assinatura'
import { estiloHerdado, grupoVisualPadrao, resolverCamadasExtras } from '../camadas-extras'
import { medirCopy } from '../medir-copy'
import { prepararBlocos } from '../preparar-blocos'
import { validarSpec } from '../spec'

/**
 * F3 / PR 9 — a camada EXTRA: texto que veste o estilo de um papel SEM ser
 * esse papel. "Uma linha de serviço pode herdar a tipografia do apoio sem
 * virar apoio" (plano, §5). A regra que estes testes travam: função ≠ estilo,
 * id próprio, grupo de leitura ≠ grupo visual, e a herança nunca copia
 * coordenada, id nem grupo do papel de origem.
 */

const medirFalso = (layer: Layer) => {
  const fontSize = Number(layer.style?.fontSize ?? 16)
  const linhas = (layer.content ?? '').split('\n')
  return { width: layer.size.width, height: linhas.length * fontSize * Number(layer.style?.lineHeight ?? 1.1), maxLineWidth: Math.max(...linhas.map((l) => l.length * fontSize * 0.55)), lineCount: linhas.length }
}
const texto = (id: string, style: Record<string, unknown>, content = 'x', extra: Partial<Layer> = {}): Layer => ({
  id, name: id, type: 'text', visible: true, locked: false, order: 0,
  position: { x: 92, y: 200 }, size: { width: 400, height: 80 }, content, style, ...extra,
})
// Variante SEM serviço: headline + apoio, num grupo só.
const assinatura = montarAssinatura({
  pagina: {
    id: 'p-sem-servico', name: 'Story sem serviço', width: 1080, height: 1920,
    layers: [
      texto('headline', { fontFamily: 'Bevan', fontSize: 100, color: '#FFFFFF', lineHeight: 1 }, 'Título', { metadata: { groupId: 'g1' } }),
      texto('apoio', { fontFamily: 'Barlow', fontSize: 40, color: '#FFEEDD', lineHeight: 1.2, letterSpacing: 2 }, 'Apoio', { position: { x: 92, y: 320 }, metadata: { groupId: 'g1' } }),
    ],
  },
  formatoDaPagina: 'story',
  numerosDoProjeto: null,
})
const papeis = { papeis: assinatura.papeis }

describe('resolverCamadasExtras — função separada de estilo', () => {
  it('papel que a variante tem entra como sempre; papel que ela NÃO tem e sem herança FALTA', () => {
    const r = resolverCamadasExtras({ blocos: [{ papel: 'headline', linhas: ['A'] }, { papel: 'servico', linhas: ['11h às 15h'] }] }, papeis)
    expect(r.blocos.map((b) => b.papel)).toEqual(['headline'])
    expect(r.faltam).toEqual(['servico'])
  })
  it('a linha de horário herda a tipografia do apoio SEM virar apoio: papel de estilo = apoio, função = servico, id próprio, grupo visual padrão = rodapé', () => {
    const r = resolverCamadasExtras({ blocos: [{ papel: 'headline', linhas: ['A'] }, { papel: 'servico', linhas: ['11h às 15h'], herdaDe: 'apoio' }] }, papeis)
    expect(r.faltam).toEqual([])
    const extra = r.blocos[1]
    expect(extra.papel).toBe('apoio')
    expect(extra.extra).toEqual({ id: 'servico', funcao: 'servico', herdaDe: 'apoio', grupoVisual: 'rodape' })
  })
  it('herdaDe é honrado mesmo quando a variante TEM o papel (função ≠ estilo é decisão do autor); herdaDe de papel que a variante não tem falta com aviso', () => {
    const comApoio = resolverCamadasExtras({ blocos: [{ papel: 'apoio', linhas: ['x'], herdaDe: 'headline', id: 'apoio-forte' }] }, papeis)
    expect(comApoio.blocos[0]).toMatchObject({ papel: 'headline', extra: { id: 'apoio-forte', funcao: 'apoio', herdaDe: 'headline', grupoVisual: 'principal' } })
    const semCta = resolverCamadasExtras({ blocos: [{ papel: 'pre', linhas: ['x'], herdaDe: 'cta' }] }, papeis)
    expect(semCta.faltam).toEqual(['cta'])
    expect(semCta.avisos[0]).toMatch(/herda de "cta", que a variante não tem/)
  })
  it('camadasExtras (blocos livres do contrato) entram na ordem declarada, com grupo de leitura e ordem próprios; id repetido fica de fora com aviso', () => {
    const r = resolverCamadasExtras({
      blocos: [{ papel: 'headline', linhas: ['A'] }],
      camadasExtras: [
        { id: 'nota-2', linhas: ['segunda'], herdaDe: 'apoio', ordem: 2, grupoDeLeitura: 'frase' },
        { id: 'nota-1', linhas: ['primeira'], herdaDe: 'apoio', ordem: 1, grupoVisual: 'topo', grupoDeLeitura: 'frase' },
        { id: 'headline', linhas: ['colide'], herdaDe: 'apoio' },
      ],
    }, papeis)
    expect(r.blocos.slice(1).map((b) => b.extra!.id)).toEqual(['nota-1', 'nota-2'])
    expect(r.blocos[1].extra).toEqual({ id: 'nota-1', funcao: 'livre', herdaDe: 'apoio', grupoVisual: 'topo', grupoDeLeitura: 'frase', ordem: 1 })
    expect(r.blocos[2].extra!.grupoVisual).toBe('principal')
    expect(r.avisos.some((a) => /"headline": id já usado/.test(a))).toBe(true)
  })
  it('o grupo visual padrão: serviço vai ao rodapé, o resto ao principal; o estilo herdado NÃO leva caixa, grupo nem alinhamento (a posição do papel de origem)', () => {
    expect(grupoVisualPadrao('servico')).toBe('rodape')
    expect(grupoVisualPadrao('livre')).toBe('principal')
    expect(grupoVisualPadrao('cta')).toBe('principal')
    const herdado = estiloHerdado({ fontFamily: 'Barlow', fontSize: 40, lineHeight: 1.2, letterSpacing: 2, color: '#fff', caixa: { x: 1, y: 2, width: 3, height: 4 }, grupo: 'g1', alinhamento: 'esquerda', sombra: null })
    expect(herdado).toEqual({ fontFamily: 'Barlow', fontSize: 40, lineHeight: 1.2, letterSpacing: 2, color: '#fff', sombra: null })
  })
})

describe('validarSpec — as camadas extras na spec e no contrato', () => {
  const base = { projectId: 8, formato: 'story' as const }
  it('papel repetido só passa quando a segunda ocorrência tem id próprio E herdaDe; a manchete nunca herda', () => {
    const semId = validarSpec({ ...base, blocos: [{ papel: 'servico', linhas: ['A'] }, { papel: 'servico', linhas: ['B'], herdaDe: 'apoio' }] })
    expect(semId.spec).toBeNull()
    expect(semId.problemas[0]).toMatch(/papel repetido: servico/)
    const ok = validarSpec({ ...base, blocos: [{ papel: 'servico', linhas: ['A'] }, { papel: 'servico', linhas: ['B'], herdaDe: 'apoio', id: 'servico-2' }] })
    expect(ok.problemas).toEqual([])
    const manchete = validarSpec({ ...base, blocos: [{ papel: 'headline', linhas: ['A'], herdaDe: 'apoio' }] })
    expect(manchete.problemas[0]).toMatch(/manchete não herda/)
    const idColide = validarSpec({ ...base, blocos: [{ papel: 'headline', linhas: ['A'] }], camadasExtras: [{ id: 'headline', linhas: ['x'], herdaDe: 'apoio' }] })
    expect(idColide.problemas[0]).toMatch(/id de camada repetido: headline/)
  })
  it('bloco LIVRE com texto no contrato vira camada extra quando declara estilo.herdaDe; sem herança é recusado dizendo o que falta', () => {
    const copy = (estilo?: Record<string, unknown>) => ({
      versao: 'copy-autoral-v1', origem: { autor: 'claude', superficie: 'chat', em: '2026-09-12T12:00:00.000Z' }, revisoes: [],
      blocos: [
        { id: 'h', funcao: 'headline', ordem: 0, linhas: ['Costela'] },
        { id: 'horario', funcao: 'livre', ordem: 1, linhas: ['Seg a sex, 11h às 15h'], ...(estilo ? { estilo } : {}) },
      ],
    })
    const sem = validarSpec({ ...base, copyAutoral: copy() })
    expect(sem.spec).toBeNull()
    expect(sem.problemas[0]).toMatch(/"horario"/)
    expect(sem.problemas[0]).toMatch(/estilo\.herdaDe/)
    const com = validarSpec({ ...base, copyAutoral: copy({ herdaDe: 'apoio', grupoVisual: 'rodape' }) })
    expect(com.problemas).toEqual([])
    expect(com.spec!.blocos!.map((b) => b.papel)).toEqual(['headline'])
    expect(com.spec!.camadasExtras).toEqual([{ id: 'horario', linhas: ['Seg a sex, 11h às 15h'], herdaDe: 'apoio', grupoVisual: 'rodape', ordem: 1 }])
  })
})

describe('prepararBlocos / medirCopy — a peça que precisa de horário funciona numa variante sem esse campo', () => {
  const coluna = 1080 - 2 * assinatura.numeros.geometria.story.margemH
  const comum = { assinatura, colunaUtil: coluna, escalaDoFormato: 1, mancha: '#000000', medir: medirFalso, familias: ['Bevan', 'Barlow'], combinacoesSalvas: [] }
  const spec = { projectId: 8, formato: 'story' as const, blocos: [{ papel: 'headline' as const, linhas: ['Costela'] }, { papel: 'servico' as const, linhas: ['Seg a sex, 11h às 15h'], herdaDe: 'apoio' as const }] }

  it('o extra é montado com o estilo do apoio, id e função próprios, num grupo visual próprio (rodapé) — fora do grupo e do arranjo do apoio, sem herdar coordenada', () => {
    const p = prepararBlocos({ ...comum, spec })
    expect(p.faltam).toEqual([])
    const extra = p.montados.find((b) => b.layer.id === 'servico')!
    expect(extra).toBeDefined()
    expect(extra.papel).toBe('apoio')
    expect(extra.funcao).toBe('servico')
    expect(extra.extra).toEqual({ id: 'servico', funcao: 'servico', herdaDe: 'apoio', grupoVisual: 'rodape' })
    expect(extra.estilo.fontFamily).toBe('Barlow')
    expect(extra.estilo.letterSpacing).toBe(2)
    expect(extra.estilo).not.toHaveProperty('caixa')
    expect(extra.estilo).not.toHaveProperty('grupo')
    // A camada que vai para a página: id do autor, nome do autor, função como papel + a identidade do extra; nunca a posição da página.
    expect(extra.layer.id).toBe('servico')
    expect(extra.layer.name).toBe('servico')
    expect(extra.layer.metadata?.compositor).toMatchObject({ papel: 'servico', extra: { id: 'servico', herdaDe: 'apoio', grupoVisual: 'rodape' } })
    expect(extra.layer.position).toEqual({ x: 0, y: 0 })
    // O grupo do extra é o do rodapé (id da camada distinto do grupo da manchete) e `gruposExtras` o declara.
    const manchete = p.montados.find((b) => b.layer.id === 'headline')!
    expect(extra.layer.metadata?.groupId).not.toBe(manchete.layer.metadata?.groupId)
    expect([...p.gruposExtras.values()]).toEqual(['rodape'])
    expect(p.arranjoPorGrupo.get('extra:rodape')).toBeUndefined()
  })
  it('extra com grupo visual `principal` entra no grupo da manchete, depois dos textos do arranjo, e livre no contrato sai como camada SEM papel (só o extra) — o `copyDosPapeis` não a confunde com o papel de origem', () => {
    const p = prepararBlocos({ ...comum, spec: { ...spec, blocos: [spec.blocos[0]], camadasExtras: [{ id: 'nota', linhas: ['vale só hoje'], herdaDe: 'apoio', grupoVisual: 'principal' }] } })
    const manchete = p.montados.find((b) => b.layer.id === 'headline')!
    const nota = p.montados.find((b) => b.layer.id === 'nota')!
    expect(nota.layer.metadata?.groupId).toBe(manchete.layer.metadata?.groupId)
    expect(nota.funcao).toBe('livre')
    expect(nota.layer.metadata?.compositor).not.toHaveProperty('papel')
    expect(nota.layer.metadata?.compositor).toMatchObject({ extra: { id: 'nota', funcao: 'livre', herdaDe: 'apoio', grupoVisual: 'principal' } })
    expect(p.montados.indexOf(nota)).toBeGreaterThan(p.montados.indexOf(manchete))
    expect(p.gruposExtras.size).toBe(0)
  })
  it('medirCopy: o serviço herdado NÃO é papel-ausente (a mesma resolução da composição), a medida sai com o id do autor e declara o extra; sem herança o serviço continua ausente', () => {
    const base = { assinatura, medir: medirFalso, familias: ['Bevan', 'Barlow'], fonteCarregada: () => true, formato: 'story' as const }
    const com = medirCopy({ ...base, spec })
    expect(com.papeisAusentes).toEqual([])
    const m = com.blocos.find((b) => b.id === 'servico')!
    expect(m.situacao).toBe('cabe')
    expect(m.papel).toBe('apoio')
    expect(m.extra).toEqual({ funcao: 'servico', herdaDe: 'apoio', grupoVisual: 'rodape' })
    expect(com.cabeTudo).toBe(true)
    const sem = medirCopy({ ...base, spec: { ...spec, blocos: [spec.blocos[0], { papel: 'servico', linhas: ['11h'] }] } })
    expect(sem.papeisAusentes).toEqual(['servico'])
    expect(sem.cabeTudo).toBe(false)
  })
})
