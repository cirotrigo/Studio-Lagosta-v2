import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import { montarAssinatura } from '../assinatura'
import { estiloHerdado, grupoVisualPadrao, idReservado, idsDeCamadaRepetidos, resolverCamadasExtras } from '../camadas-extras'
import { medirCopy } from '../medir-copy'
import { prepararBlocos } from '../preparar-blocos'
import { validarSpec } from '../spec'
import { specDaRecomposicao } from '../spec-da-recomposicao'
import { copyAutoralDaSpec, entradaDePersistencia } from '../persistencia'
import { VERSAO_DO_CONTRATO, blocosParaOCompositor, copyEfetivaDasCamadas, idDeExtra, renomearExtrasDuplicados, validarCopyAutoral, type CopyAutoral } from '@/lib/copy-autoral'
import { revisaoDaPaginaComCamadas } from '@/lib/copy-autoral/revisar-pagina'

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
    const ok = validarSpec({ ...base, blocos: [{ papel: 'servico', linhas: ['A'] }, { papel: 'servico', linhas: ['B'], herdaDe: 'apoio', id: 'servico-local' }] })
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


describe('correções da revisão do Codex sobre 53ce6340 (R01–R07)', () => {
  const base = { projectId: 8, formato: 'story' as const }
  const coluna = 1080 - 2 * assinatura.numeros.geometria.story.margemH
  const comum = { assinatura, colunaUtil: coluna, escalaDoFormato: 1, mancha: '#000000', medir: medirFalso, familias: ['Bevan', 'Barlow'], combinacoesSalvas: [] }
  const camada = (id: string, y: number, content: string, compositor: Record<string, unknown>): Layer =>
    texto(id, { fontFamily: 'Barlow', fontSize: 40 }, content, { position: { x: 92, y }, metadata: { groupId: 'g', compositor } })

  it('R01: dois extras de função servico herdando apoio em bordas opostas — cada id preserva o próprio texto na persistência, sem revisão fictícia', () => {
    const v = validarSpec({ ...base, blocos: [
      { papel: 'headline', linhas: ['Costela'] },
      { papel: 'servico', linhas: ['11h às 15h'], herdaDe: 'apoio', id: 'hora-rodape' },
      { papel: 'servico', linhas: ['A partir das 19h'], herdaDe: 'apoio', id: 'hora-topo', grupoVisual: 'topo' },
    ] })
    expect(v.problemas).toEqual([])
    // As camadas como o compositor as desenha: o extra do TOPO fica acima do do rodapé.
    const layers = [
      camada('headline', 800, 'Costela', { papel: 'headline' }),
      camada('hora-topo', 100, 'A partir das 19h', { papel: 'servico', extra: { id: 'hora-topo', funcao: 'servico', herdaDe: 'apoio', grupoVisual: 'topo' } }),
      camada('hora-rodape', 1700, '11h às 15h', { papel: 'servico', extra: { id: 'hora-rodape', funcao: 'servico', herdaDe: 'apoio', grupoVisual: 'rodape' } }),
    ]
    const e = entradaDePersistencia({ spec: v.spec!, opcoes: {}, projeto: { id: 8, name: 'Lagosta', userId: 'u' }, pasta: { id: 1, name: 'p' }, nome: 'n', ordem: 0, canvas: { width: 1080, height: 1920 }, layers, fundo: '#000', diagnostico: {}, fotoUrl: null })
    const efetiva = e.copyAutoral as CopyAutoral
    const porId = Object.fromEntries(efetiva.blocos.map((b) => [b.id, b.linhas]))
    expect(porId['hora-rodape']).toEqual(['11h às 15h'])
    expect(porId['hora-topo']).toEqual(['A partir das 19h'])
    expect(efetiva.revisoes).toEqual([])
    expect(efetiva.lacunas?.some((l) => /não foi desenhado|texto que a copy não tinha/.test(l))).toBeFalsy()
  })

  it('R02: id avulso em bloco sem herdaDe é recusado; ids que a preparação gera sozinha (headline2, servico-2) são reservados', () => {
    const avulso = validarSpec({ ...base, blocos: [{ papel: 'headline', linhas: ['A'], id: 'titulo' }] })
    expect(avulso.spec).toBeNull()
    expect(avulso.problemas[0]).toMatch(/id só vale com herdaDe: headline \("titulo"\)/)
    const voz2 = validarSpec({ ...base, blocos: [{ papel: 'headline', linhas: ['A'] }], camadasExtras: [{ id: 'headline2', linhas: ['x'], herdaDe: 'apoio' }] })
    expect(voz2.problemas[0]).toMatch(/reservado.*headline2/)
    const segundo = validarSpec({ ...base, blocos: [{ papel: 'headline', linhas: ['A'] }, { papel: 'servico', linhas: ['x'], herdaDe: 'apoio', id: 'servico-2' }] })
    expect(segundo.problemas[0]).toMatch(/reservado.*servico-2/)
    // A última porta, na resolução: o id reservado fica de fora com aviso, nunca colide em silêncio.
    const r = resolverCamadasExtras({ blocos: [{ papel: 'headline', linhas: ['A'] }], camadasExtras: [{ id: 'headline2', linhas: ['x'], herdaDe: 'apoio' }] }, { papeis: assinatura.papeis })
    expect(r.blocos).toHaveLength(1)
    expect(r.avisos[0]).toMatch(/reservado/)
  })

  it('R03: extra cuja origem de estilo a variante não tem é DECLARADO na medição pelo id e derruba cabeTudo — a mesma recusa da composição', () => {
    const args = { assinatura, medir: medirFalso, familias: ['Bevan', 'Barlow'], fonteCarregada: () => true, formato: 'story' as const }
    const livre = medirCopy({ ...args, spec: { ...base, blocos: [{ papel: 'headline' as const, linhas: ['Oi'] }], camadasExtras: [{ id: 'nota', linhas: ['vale hoje'], herdaDe: 'cta' as const }] } })
    expect(livre.cabeTudo).toBe(false)
    const m = livre.blocos.find((b) => b.id === 'nota')!
    expect(m.situacao).toBe('papel-ausente')
    expect(m.extra).toEqual({ funcao: 'livre', herdaDe: 'cta', grupoVisual: 'principal' })
    expect(m.avisos[0]).toMatch(/não tem o papel "cta", de que "nota" herdaria/)
    const repetido = medirCopy({ ...args, spec: { ...base, blocos: [{ papel: 'headline' as const, linhas: ['Oi'] }, { papel: 'apoio' as const, linhas: ['a'] }, { papel: 'apoio' as const, linhas: ['b'], herdaDe: 'cta' as const, id: 'apoio-forte' }] } })
    expect(repetido.cabeTudo).toBe(false)
    expect(repetido.blocos.find((b) => b.id === 'apoio-forte')!.situacao).toBe('papel-ausente')
    expect(repetido.papeisAusentes).toEqual([])
  })

  it('R04: o extra com função leva grupo de leitura e ordem; extras mistos no mesmo grupo visual saem na ordem do autor (livre 1 antes de servico 2)', () => {
    const v = validarSpec({ ...base, copyAutoral: {
      versao: 'copy-autoral-v1', origem: { autor: 'claude', superficie: 'chat', em: '2026-09-12T12:00:00.000Z' }, revisoes: [],
      blocos: [
        { id: 'h', funcao: 'headline', ordem: 0, linhas: ['Costela'] },
        { id: 'nota', funcao: 'livre', ordem: 1, linhas: ['vale hoje'], grupoDeLeitura: 'frase', estilo: { herdaDe: 'apoio', grupoVisual: 'principal' } },
        { id: 'hora', funcao: 'servico', ordem: 2, linhas: ['11h às 15h'], grupoDeLeitura: 'frase', estilo: { herdaDe: 'apoio', grupoVisual: 'principal' } },
      ],
    } })
    expect(v.problemas).toEqual([])
    expect(v.spec!.blocos!.find((b) => b.papel === 'servico')).toMatchObject({ id: 'hora', herdaDe: 'apoio', grupoDeLeitura: 'frase', ordem: 2 })
    const r = resolverCamadasExtras({ blocos: v.spec!.blocos, camadasExtras: v.spec!.camadasExtras }, { papeis: assinatura.papeis })
    expect(r.blocos.map((b) => b.extra?.id ?? b.papel)).toEqual(['headline', 'nota', 'hora'])
    expect(r.blocos[2].extra).toEqual({ id: 'hora', funcao: 'servico', herdaDe: 'apoio', grupoVisual: 'principal', grupoDeLeitura: 'frase', ordem: 2 })
    const p = prepararBlocos({ ...comum, spec: v.spec! })
    const ids = p.montados.map((b) => b.layer.id)
    expect(ids.indexOf('nota')).toBeLessThan(ids.indexOf('hora'))
    expect(p.montados.find((b) => b.layer.id === 'hora')!.layer.metadata?.compositor).toMatchObject({ papel: 'servico', extra: { grupoDeLeitura: 'frase', ordem: 2 } })
  })

  it('R05: o contrato é canônico — blocos ou camadasExtras que divergem dele em QUALQUER campo (herdaDe, grupoVisual, grupoDeLeitura, ordem) ou sem correspondente são recusados', () => {
    const copy = {
      versao: 'copy-autoral-v1', origem: { autor: 'claude', superficie: 'chat', em: '2026-09-12T12:00:00.000Z' }, revisoes: [],
      blocos: [
        { id: 'h', funcao: 'headline', ordem: 0, linhas: ['Costela'] },
        { id: 'hora', funcao: 'servico', ordem: 1, linhas: ['11h às 15h'], estilo: { herdaDe: 'apoio' } },
      ],
    }
    const iguais = validarSpec({ ...base, copyAutoral: copy, blocos: [{ papel: 'headline', linhas: ['Costela'] }, { papel: 'servico', linhas: ['11h às 15h'], id: 'hora', herdaDe: 'apoio', ordem: 1 }] })
    expect(iguais.problemas).toEqual([])
    const semHeranca = validarSpec({ ...base, copyAutoral: copy, blocos: [{ papel: 'headline', linhas: ['Costela'] }, { papel: 'servico', linhas: ['11h às 15h'] }] })
    expect(semHeranca.spec).toBeNull()
    expect(semHeranca.problemas[0]).toMatch(/`blocos` não bate com o contrato/)
    const outroGrupo = validarSpec({ ...base, copyAutoral: copy, blocos: [{ papel: 'headline', linhas: ['Costela'] }, { papel: 'servico', linhas: ['11h às 15h'], id: 'hora', herdaDe: 'apoio', ordem: 1, grupoVisual: 'topo' }] })
    expect(outroGrupo.spec).toBeNull()
    const extraSemContrato = validarSpec({ ...base, copyAutoral: copy, camadasExtras: [{ id: 'nota', linhas: ['x'], herdaDe: 'apoio' }] })
    expect(extraSemContrato.spec).toBeNull()
    expect(extraSemContrato.problemas[0]).toMatch(/`camadasExtras` não bate/)
  })

  it('R06: validarSpec(validarSpec(x).spec) continua válido e preserva o conteúdo — linha vazia (respiro), sete linhas e mais de cinco extras, como o contrato permite', () => {
    const extras = Array.from({ length: 6 }, (_, i) => ({ id: `n${i}`, funcao: 'livre' as const, ordem: i + 1, linhas: i === 0 ? ['A', '', 'B', 'C', 'D', 'E', 'F'] : [`nota ${i}`], estilo: { herdaDe: 'apoio' as const } }))
    const v1 = validarSpec({ ...base, copyAutoral: {
      versao: 'copy-autoral-v1', origem: { autor: 'claude', superficie: 'chat', em: '2026-09-12T12:00:00.000Z' }, revisoes: [],
      blocos: [{ id: 'h', funcao: 'headline', ordem: 0, linhas: ['Costela'] }, ...extras],
    } })
    expect(v1.problemas).toEqual([])
    expect(v1.spec!.camadasExtras).toHaveLength(6)
    expect(v1.spec!.camadasExtras![0].linhas).toEqual(['A', '', 'B', 'C', 'D', 'E', 'F'])
    const v2 = validarSpec(JSON.parse(JSON.stringify(v1.spec)))
    expect(v2.problemas).toEqual([])
    expect(v2.spec).toEqual(v1.spec)
  })

  it('R07: sem copyAutoral, o ORIGINAL persistido nasce da spec inteira — o extra livre e o serviço herdado entram com id, herança, grupo visual e ordem, autoria desconhecida', () => {
    const v = validarSpec({ ...base,
      blocos: [{ papel: 'headline', linhas: ['Costela'] }, { papel: 'servico', linhas: ['11h às 15h'], herdaDe: 'apoio', id: 'hora', grupoVisual: 'rodape' }],
      camadasExtras: [{ id: 'nota', linhas: ['vale hoje'], herdaDe: 'apoio', grupoDeLeitura: 'frase' }, { id: 'nota-2b', linhas: ['só no almoço'], herdaDe: 'apoio', grupoDeLeitura: 'frase' }],
    })
    expect(v.problemas).toEqual([])
    const original = copyAutoralDaSpec(v.spec!)
    expect(validarCopyAutoral(JSON.parse(JSON.stringify(original))).problemas).toEqual([])
    expect(original.origem.autor).toBe('desconhecido')
    expect(original.blocos.map((b) => [b.id, b.funcao, b.ordem])).toEqual([['headline', 'headline', 0], ['hora', 'servico', 1], ['nota', 'livre', 2], ['nota-2b', 'livre', 3]])
    expect(original.blocos[1].estilo).toEqual({ herdaDe: 'apoio', grupoVisual: 'rodape' })
    expect(original.blocos[2]).toMatchObject({ grupoDeLeitura: 'frase', estilo: { herdaDe: 'apoio' } })
    expect(original.lacunas).toContain('ordem de leitura inferida pela posição no array')
  })
})

describe('correções da revisão do Codex sobre 9a03c12c (R08–R11)', () => {
  const base = { projectId: 8, formato: 'story' as const }
  const camada = (id: string, y: number, content: string, compositor: Record<string, unknown>): Layer =>
    texto(id, { fontFamily: 'Barlow', fontSize: 40 }, content, { position: { x: 92, y }, metadata: { groupId: 'g', compositor } })
  const persistir = (spec: Parameters<typeof entradaDePersistencia>[0]['spec'], layers: Layer[]) =>
    entradaDePersistencia({ spec, opcoes: {}, projeto: { id: 8, name: 'Lagosta', userId: 'u' }, pasta: { id: 1, name: 'p' }, nome: 'n', ordem: 0, canvas: { width: 1080, height: 1920 }, layers, fundo: '#000', diagnostico: {}, fotoUrl: null })
  const origem = { autor: 'claude' as const, superficie: 'chat', em: '2026-09-12T12:00:00.000Z' }

  it('R08: sem contrato, o id explícito do extra viaja EXATO — "Nota" e "nota", com textos diferentes, mantêm id e texto no original e na efetiva, sem revisão fictícia', () => {
    const v = validarSpec({ ...base, blocos: [{ papel: 'headline', linhas: ['Costela'] }], camadasExtras: [
      { id: 'Nota', linhas: ['vale hoje'], herdaDe: 'apoio' },
      { id: 'nota', linhas: ['só no almoço'], herdaDe: 'apoio', grupoVisual: 'rodape' },
    ] })
    expect(v.problemas).toEqual([])
    const original = copyAutoralDaSpec(v.spec!)
    expect(original.blocos.map((b) => [b.id, b.linhas])).toEqual([['headline', ['Costela']], ['Nota', ['vale hoje']], ['nota', ['só no almoço']]])
    const layers = [
      camada('headline', 800, 'Costela', { papel: 'headline' }),
      camada('Nota', 900, 'vale hoje', { papel: 'apoio', extra: { id: 'Nota', funcao: 'livre', herdaDe: 'apoio', grupoVisual: 'principal' } }),
      camada('nota', 1700, 'só no almoço', { papel: 'apoio', extra: { id: 'nota', funcao: 'livre', herdaDe: 'apoio', grupoVisual: 'rodape' } }),
    ]
    const efetiva = persistir(v.spec!, layers).copyAutoral as CopyAutoral
    expect(Object.fromEntries(efetiva.blocos.map((b) => [b.id, b.linhas]))).toEqual({ headline: ['Costela'], Nota: ['vale hoje'], nota: ['só no almoço'] })
    expect(efetiva.revisoes).toEqual([])
    expect(efetiva.blocos.some((b) => b.id.startsWith('extra-'))).toBe(false)
  })

  it('R09: contrato com ids trocados entre funções (id "apoio" na manchete, "headline" no apoio) — o id físico da camada de OUTRA função não é tomado; textos preservados na persistência e na revisão da página, sem revisão', () => {
    const copy = { versao: 'copy-autoral-v1', origem, revisoes: [], blocos: [
      { id: 'apoio', funcao: 'headline', ordem: 0, linhas: ['Costela'] },
      { id: 'headline', funcao: 'apoio', ordem: 1, linhas: ['Hoje'] },
    ] }
    const v = validarSpec({ ...base, copyAutoral: copy })
    expect(v.problemas).toEqual([])
    const layers = [camada('headline', 800, 'Costela', { papel: 'headline' }), camada('apoio', 900, 'Hoje', { papel: 'apoio' })]
    const efetiva = persistir(v.spec!, layers).copyAutoral as CopyAutoral
    expect(Object.fromEntries(efetiva.blocos.map((b) => [b.id, b.linhas]))).toEqual({ apoio: ['Costela'], headline: ['Hoje'] })
    expect(efetiva.revisoes).toEqual([])
    const rev = revisaoDaPaginaComCamadas(copy, layers, { autor: 'equipe', motivo: 'autosave', superficie: 'editor' })
    expect(rev.estado).not.toBe('registrada')
    expect(rev.blocos).toEqual([])
  })

  it('R10: extras com os ids das camadas internas (bg-foto, logo, gradiente-leitura-topo, <texto>-elemento-N) são recusados; o conjunto final de camadas não admite id repetido', () => {
    for (const id of ['bg-foto', 'logo', 'gradiente-leitura-topo', 'headline-elemento-1']) {
      expect(idReservado(id)).toBe(true)
      const v = validarSpec({ ...base, blocos: [{ papel: 'headline', linhas: ['A'] }], camadasExtras: [{ id, linhas: ['x'], herdaDe: 'apoio' }] })
      expect(v.spec).toBeNull()
      expect(v.problemas[0]).toContain(`reservado pela composição: ${id}`)
    }
    expect(idReservado('nota')).toBe(false)
    expect(idReservado('Logo')).toBe(false)
    expect(idsDeCamadaRepetidos([{ id: 'logo' }, { id: 'nota' }, { id: 'logo' }])).toEqual(['logo'])
    expect(idsDeCamadaRepetidos([{ id: 'a' }, { id: 'b' }])).toEqual([])
  })

  it('R11: sem copyAutoral, a copy derivada da spec passa no contrato do leitor — grupo de leitura de um bloco só e 41 blocos somados são recusados; grupo com dois membros e 40 blocos valem e sobrevivem à releitura', () => {
    const umSo = validarSpec({ ...base, blocos: [{ papel: 'headline', linhas: ['Costela'] }], camadasExtras: [{ id: 'nota', linhas: ['vale hoje'], herdaDe: 'apoio', grupoDeLeitura: 'frase' }] })
    expect(umSo.spec).toBeNull()
    expect(umSo.problemas[0]).toMatch(/^copy derivada da spec: grupo de leitura "frase" tem um bloco só/)
    const dois = validarSpec({ ...base, blocos: [{ papel: 'headline', linhas: ['Costela'] }], camadasExtras: [
      { id: 'nota', linhas: ['vale hoje'], herdaDe: 'apoio', grupoDeLeitura: 'frase' },
      { id: 'nota-b', linhas: ['só no almoço'], herdaDe: 'apoio', grupoDeLeitura: 'frase' },
    ] })
    expect(dois.problemas).toEqual([])
    expect(validarCopyAutoral(JSON.parse(JSON.stringify(copyAutoralDaSpec(dois.spec!)))).problemas).toEqual([])
    const comExtras = (n: number) => validarSpec({ ...base, blocos: [{ papel: 'headline', linhas: ['Costela'] }], camadasExtras: Array.from({ length: n }, (_, i) => ({ id: `n${i}`, linhas: [`nota ${i}`], herdaDe: 'apoio' as const })) })
    const quarenta = comExtras(39)
    expect(quarenta.problemas).toEqual([])
    expect(validarCopyAutoral(JSON.parse(JSON.stringify(copyAutoralDaSpec(quarenta.spec!)))).problemas).toEqual([])
    const quarentaEUm = comExtras(40)
    expect(quarentaEUm.spec).toBeNull()
    expect(quarentaEUm.problemas[0]).toMatch(/^copy derivada da spec: blocos/)
  })
})

describe('correções da revisão do Codex sobre 6ee684c4 (R12–R14)', () => {
  const base = { projectId: 8, formato: 'story' as const }
  const origem = { autor: 'claude' as const, superficie: 'chat', em: '2026-09-12T12:00:00.000Z' }
  const comum = { assinatura, colunaUtil: 1080 - 2 * assinatura.numeros.geometria.story.margemH, escalaDoFormato: 1, mancha: '#000000', medir: medirFalso, familias: ['Bevan', 'Barlow'], combinacoesSalvas: [] }
  const persistir = (spec: Parameters<typeof entradaDePersistencia>[0]['spec'], layers: Layer[]) =>
    entradaDePersistencia({ spec, opcoes: {}, projeto: { id: 8, name: 'Lagosta', userId: 'u' }, pasta: { id: 1, name: 'p' }, nome: 'n', ordem: 0, canvas: { width: 1080, height: 1920 }, layers, fundo: '#000', diagnostico: {}, fotoUrl: null })

  it('R12: o livre VAZIO `extra-hora` não toma a camada `hora` que declara o serviço — a identidade explícita vem antes de todo fallback legado; horário preservado, livre vazio e nenhuma revisão', () => {
    const copy = { versao: VERSAO_DO_CONTRATO, origem, revisoes: [], blocos: [
      { id: 'h', funcao: 'headline', ordem: 0, linhas: ['Costela'] },
      { id: 'hora', funcao: 'servico', ordem: 1, linhas: ['11h às 15h'], estilo: { herdaDe: 'apoio' } },
      { id: 'extra-hora', funcao: 'livre', ordem: 2, linhas: [] },
    ] }
    const v = validarSpec({ ...base, copyAutoral: copy })
    expect(v.problemas).toEqual([])
    const p = prepararBlocos({ ...comum, spec: v.spec! })
    const hora = p.montados.find((b) => b.layer.id === 'hora')!
    expect(hora.layer.metadata?.compositor).toMatchObject({ extra: { id: 'hora', funcao: 'servico' } })
    expect(idDeExtra(hora.layer)).toBe('extra-hora')
    const efetiva = persistir(v.spec!, p.montados.map((b) => b.layer)).copyAutoral as CopyAutoral
    expect(Object.fromEntries(efetiva.blocos.map((b) => [b.id, b.linhas]))).toEqual({ h: ['Costela'], hora: ['11h às 15h'], 'extra-hora': [] })
    expect(efetiva.revisoes).toEqual([])
  })

  it('R13: horário e endereço em grupos DIFERENTES da página — ids únicos na peça (servico, servico-2), cada texto com o SEU ícone, e a medição concorda com a preparação', () => {
    const RELOGIO = 'https://exemplo.com/relogio.png'
    const PIN = 'https://exemplo.com/pin.png'
    const img = (id: string, url: string, x: number, y: number, grupo: string): Layer =>
      ({ id, name: id, type: 'image', visible: true, locked: false, order: 0, rotation: 0, fileUrl: url, position: { x, y }, size: { width: 26, height: 26 }, metadata: { groupId: grupo } }) as Layer
    const camadas: Layer[] = [
      texto('headline', { fontFamily: 'Bevan', fontSize: 100, color: '#FFFFFF', lineHeight: 1 }, 'Título', { position: { x: 92, y: 300 }, metadata: { groupId: 'g-topo' } }),
      texto('servico', { fontFamily: 'Barlow', fontSize: 30, color: '#FFFFFF', lineHeight: 1.2, textAlign: 'left' }, 'Seg a sex, das 11h às 15h', { position: { x: 160, y: 1200 }, size: { width: 700, height: 40 }, metadata: { groupId: 'g-meio' } }),
      img('relogio', RELOGIO, 120, 1204, 'g-meio'),
      texto('info', { fontFamily: 'Barlow', fontSize: 24, color: '#DDDDDD', lineHeight: 1.2, textAlign: 'left' }, 'Rua das Flores, 12 — Centro', { id: 'servico-endereco', position: { x: 160, y: 1650 }, size: { width: 700, height: 40 }, metadata: { groupId: 'g-rodape' } }),
      img('pin', PIN, 122, 1652, 'g-rodape'),
    ]
    const a = montarAssinatura({ pagina: { id: 'p-dois-grupos', width: 1080, height: 1920, layers: camadas }, formatoDaPagina: 'story', numerosDoProjeto: null })
    a.camadasDaPagina = camadas
    const spec = { ...base, blocos: [{ papel: 'headline' as const, linhas: ['Costela'] }, { papel: 'servico' as const, linhas: ['Ter a dom, das 18h às 23h', 'Av. Beira Mar, 100'] }] }
    const p = prepararBlocos({ ...comum, assinatura: a, colunaUtil: 1080 - 2 * a.numeros.geometria.story.margemH, spec })
    const ids = p.montados.map((b) => b.layer.id)
    expect([...ids].sort()).toEqual(['headline', 'servico', 'servico-2'])
    expect(idsDeCamadaRepetidos(p.montados.map((b) => b.layer))).toEqual([])
    const horario = p.montados.find((b) => b.linhasDaCopy[0] === 'Ter a dom, das 18h às 23h')!
    const endereco = p.montados.find((b) => b.linhasDaCopy[0] === 'Av. Beira Mar, 100')!
    expect(horario.layer.id).not.toBe(endereco.layer.id)
    expect(horario.chave).not.toBe(endereco.chave)
    expect(p.elementosPorTexto.get(horario.layer.id)?.elementos.map((e) => e.url)).toEqual([RELOGIO])
    expect(p.elementosPorTexto.get(endereco.layer.id)?.elementos.map((e) => e.url)).toEqual([PIN])
    const m = medirCopy({ assinatura: a, medir: medirFalso, familias: ['Bevan', 'Barlow'], fonteCarregada: () => true, formato: 'story', spec })
    expect([...m.blocos.map((b) => b.id)].sort()).toEqual([...ids].sort())
    expect(m.cabeTudo).toBe(true)
  })

  it('R14: duplicar a página preserva o id AUTORAL dos extras livres (visível e oculto) e as referências no histórico; só o id inferido `extra-<camada>` acompanha a camada nova, e a releitura da cópia não cria revisão', () => {
    const doExtra = (id: string) => ({ groupId: 'g', compositor: { extra: { id, funcao: 'livre', herdaDe: 'apoio', grupoVisual: 'principal' } } })
    const camadas: Layer[] = [
      texto('headline', { fontFamily: 'Bevan', fontSize: 100 }, 'Costela', { position: { x: 92, y: 300 }, metadata: { groupId: 'g', compositor: { papel: 'headline' } } }),
      texto('nota', { fontFamily: 'Barlow', fontSize: 40 }, 'vale hoje', { name: 'Nota da casa', position: { x: 92, y: 500 }, metadata: doExtra('nota') }),
      texto('aviso', { fontFamily: 'Barlow', fontSize: 40 }, '', { name: 'Aviso', visible: false, position: { x: 92, y: 600 }, metadata: doExtra('aviso') }),
      texto('solta', { fontFamily: 'Barlow', fontSize: 40 }, 'texto solto', { position: { x: 92, y: 900 } }),
    ]
    const copy: CopyAutoral = {
      versao: VERSAO_DO_CONTRATO, origem,
      blocos: [
        { id: 'headline', funcao: 'headline', ordem: 0, linhas: ['Costela'] },
        { id: 'nota', funcao: 'livre', ordem: 1, linhas: ['vale hoje'] },
        { id: 'aviso', funcao: 'livre', ordem: 2, linhas: [] },
        { id: 'extra-solta', funcao: 'livre', ordem: 3, linhas: ['texto solto'] },
      ],
      revisoes: [{ autor: 'equipe', em: '2026-09-12T13:00:00.000Z', superficie: 'editor', motivo: 'autosave', blocos: ['nota', 'aviso', 'extra-solta'] }],
    }
    expect(validarCopyAutoral(copy).problemas).toEqual([])
    const mapa = new Map([['headline', 'uuid-h'], ['nota', 'uuid-n'], ['aviso', 'uuid-a'], ['solta', 'uuid-s']])
    const copia = renomearExtrasDuplicados(copy, mapa, camadas)
    expect(copia.blocos.map((b) => b.id)).toEqual(['headline', 'nota', 'aviso', idDeExtra('uuid-s')])
    expect(copia.revisoes[0].blocos).toEqual(['nota', 'aviso', idDeExtra('uuid-s')])
    expect(validarCopyAutoral(copia).problemas).toEqual([])
    const camadasDaCopia = camadas.map((c) => ({ ...c, id: mapa.get(c.id)! })) as Layer[]
    const lida = copyEfetivaDasCamadas(copia, camadasDaCopia, { superficie: 'editor' })
    expect(lida.mudancas).toEqual([])
    expect(lida.efetiva.blocos.find((b) => b.id === 'nota')?.linhas).toEqual(['vale hoje'])
    expect(revisaoDaPaginaComCamadas(copia, camadasDaCopia, { autor: 'equipe', motivo: 'autosave', superficie: 'editor' }).estado).not.toBe('registrada')
  })
})

describe('correção da revisão do Codex sobre 4aa2297a (R15)', () => {
  const origem = { autor: 'claude' as const, superficie: 'chat', em: '2026-09-12T12:00:00.000Z' }
  const copy = (nota: string): CopyAutoral => ({
    versao: VERSAO_DO_CONTRATO, origem, revisoes: [],
    blocos: [
      { id: 'h', funcao: 'headline', ordem: 0, linhas: ['Costela'] },
      { id: 'nota', funcao: 'livre', ordem: 1, linhas: [nota], estilo: { herdaDe: 'apoio' } },
    ],
  })

  it('R15: a spec persistida → edição SÓ do texto do extra → spec da recomposição passa em validarSpec com id, herança e o texto novo (os extras antigos não sobrevivem ao contrato novo)', () => {
    const persistida = validarSpec({ projectId: 8, formato: 'story', copyAutoral: copy('Hoje') })
    expect(persistida.problemas).toEqual([])
    expect(persistida.spec!.camadasExtras?.map((c) => c.linhas)).toEqual([['Hoje']])

    // O que a recomposição montava antes: contrato novo + extras da spec antiga.
    const { copyAutoral: _velho, ...semContrato } = persistida.spec!
    const comoEra = validarSpec({ ...semContrato, copyAutoral: copy('Amanhã'), blocos: blocosParaOCompositor(copy('Amanhã')).blocos })
    expect(comoEra.spec).toBeNull()
    expect(comoEra.problemas.join(' ')).toContain('camadasExtras')

    const recomposta = validarSpec(specDaRecomposicao(persistida.spec!, copy('Amanhã')))
    expect(recomposta.problemas).toEqual([])
    expect(recomposta.spec!.camadasExtras).toEqual([expect.objectContaining({ id: 'nota', linhas: ['Amanhã'], herdaDe: 'apoio', ordem: 1 })])
    expect(recomposta.spec!.copyAutoral).toEqual(copy('Amanhã'))
    // R06: a forma derivada revalida.
    expect(validarSpec(recomposta.spec).problemas).toEqual([])
  })

  it('R15: sem contrato (página legada) a spec da recomposição mantém os extras que tinha e não ganha contrato', () => {
    const legado = validarSpec({ projectId: 8, formato: 'story', blocos: [{ papel: 'headline', linhas: ['Costela'] }], camadasExtras: [{ id: 'nota', linhas: ['Hoje'], herdaDe: 'apoio' }] })
    expect(legado.problemas).toEqual([])
    const r = specDaRecomposicao(legado.spec!, null)
    expect(r.copyAutoral).toBeUndefined()
    expect(r.camadasExtras).toEqual(legado.spec!.camadasExtras)
    expect(r.blocos).toEqual(legado.spec!.blocos)
  })
})
