import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import { montarAssinatura } from '../assinatura'
import { estiloHerdado, grupoVisualPadrao, resolverCamadasExtras } from '../camadas-extras'
import { medirCopy } from '../medir-copy'
import { prepararBlocos } from '../preparar-blocos'
import { validarSpec } from '../spec'
import { copyAutoralDaSpec, entradaDePersistencia } from '../persistencia'
import type { CopyAutoral } from '@/lib/copy-autoral'

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
      camadasExtras: [{ id: 'nota', linhas: ['vale hoje'], herdaDe: 'apoio', grupoDeLeitura: 'frase' }],
    })
    expect(v.problemas).toEqual([])
    const original = copyAutoralDaSpec(v.spec!)
    expect(original.origem.autor).toBe('desconhecido')
    expect(original.blocos.map((b) => [b.id, b.funcao, b.ordem])).toEqual([['headline', 'headline', 0], ['hora', 'servico', 1], ['nota', 'livre', 2]])
    expect(original.blocos[1].estilo).toEqual({ herdaDe: 'apoio', grupoVisual: 'rodape' })
    expect(original.blocos[2]).toMatchObject({ grupoDeLeitura: 'frase', estilo: { herdaDe: 'apoio' } })
    expect(original.lacunas).toContain('ordem de leitura inferida pela posição no array')
  })
})
