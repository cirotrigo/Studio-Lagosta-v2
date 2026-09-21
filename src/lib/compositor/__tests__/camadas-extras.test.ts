import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import { montarAssinatura } from '../assinatura'
import { estiloHerdado, grupoVisualPadrao, idReservado, idsDeCamadaRepetidos, resolverCamadasExtras } from '../camadas-extras'
import { medirCopy } from '../medir-copy'
import { prepararBlocos } from '../preparar-blocos'
import { validarSpec } from '../spec'
import { specDaRecomposicao } from '../spec-da-recomposicao'
import { copyAutoralDaSpec, entradaDePersistencia } from '../persistencia'
import { VERSAO_DO_CONTRATO, blocosParaOCompositor, copyEfetivaDasCamadas, duplicarCamadasDaPagina, idDeExtra, renomearExtrasDuplicados, validarCopyAutoral, type CopyAutoral } from '@/lib/copy-autoral'
import { revisaoDaPaginaComCamadas } from '@/lib/copy-autoral/revisar-pagina'
import { camadaDuplicadaNoEditor, camadasColadasNoEditor, paginaTemContrato, semIdentidadeAutoral } from '@/lib/copy-autoral/camada-copiada'
import { arranjosDaPagina } from '../combinacoes'
import { readFileSync } from 'node:fs'

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
  // A camada como o compositor a DESENHA. Desde o rebase sobre a main (21/09/2026, decisão (A)), a camada EXTRA sai
  // carimbada com o vínculo declarado do PR 3 — `bloco` = o id do extra e as posições `linhas` —, e é por ele que a
  // leitura a reencontra. ANTES estas fixtures levavam só `extra.id`, que era a marca que a leitura do PR 9 lia; montar
  // o extra sem `bloco` seria modelar um estado que nenhum produtor gera mais. Quem declara `bloco` explicitamente vence.
  const camada = (id: string, y: number, content: string, compositor: Record<string, unknown>): Layer => {
    const extraId = (compositor.extra as { id?: string } | undefined)?.id
    const carimbada = extraId && compositor.bloco === undefined ? { ...compositor, bloco: extraId, linhas: content.split('\n').map((_, i) => i) } : compositor
    return texto(id, { fontFamily: 'Barlow', fontSize: 40 }, content, { position: { x: 92, y }, metadata: { groupId: 'g', compositor: carimbada } })
  }

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
    const original = copyAutoralDaSpec(v.spec!).copy!
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
  // A camada como o compositor a DESENHA. Desde o rebase sobre a main (21/09/2026, decisão (A)), a camada EXTRA sai
  // carimbada com o vínculo declarado do PR 3 — `bloco` = o id do extra e as posições `linhas` —, e é por ele que a
  // leitura a reencontra. ANTES estas fixtures levavam só `extra.id`, que era a marca que a leitura do PR 9 lia; montar
  // o extra sem `bloco` seria modelar um estado que nenhum produtor gera mais. Quem declara `bloco` explicitamente vence.
  const camada = (id: string, y: number, content: string, compositor: Record<string, unknown>): Layer => {
    const extraId = (compositor.extra as { id?: string } | undefined)?.id
    const carimbada = extraId && compositor.bloco === undefined ? { ...compositor, bloco: extraId, linhas: content.split('\n').map((_, i) => i) } : compositor
    return texto(id, { fontFamily: 'Barlow', fontSize: 40 }, content, { position: { x: 92, y }, metadata: { groupId: 'g', compositor: carimbada } })
  }
  const persistir = (spec: Parameters<typeof entradaDePersistencia>[0]['spec'], layers: Layer[]) =>
    entradaDePersistencia({ spec, opcoes: {}, projeto: { id: 8, name: 'Lagosta', userId: 'u' }, pasta: { id: 1, name: 'p' }, nome: 'n', ordem: 0, canvas: { width: 1080, height: 1920 }, layers, fundo: '#000', diagnostico: {}, fotoUrl: null })
  const origem = { autor: 'claude' as const, superficie: 'chat', em: '2026-09-12T12:00:00.000Z' }

  it('R08: sem contrato, o id explícito do extra viaja EXATO — "Nota" e "nota", com textos diferentes, mantêm id e texto no original e na efetiva, sem revisão fictícia', () => {
    const v = validarSpec({ ...base, blocos: [{ papel: 'headline', linhas: ['Costela'] }], camadasExtras: [
      { id: 'Nota', linhas: ['vale hoje'], herdaDe: 'apoio' },
      { id: 'nota', linhas: ['só no almoço'], herdaDe: 'apoio', grupoVisual: 'rodape' },
    ] })
    expect(v.problemas).toEqual([])
    const original = copyAutoralDaSpec(v.spec!).copy!
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
    expect(validarCopyAutoral(JSON.parse(JSON.stringify(copyAutoralDaSpec(dois.spec!).copy!))).problemas).toEqual([])
    const comExtras = (n: number) => validarSpec({ ...base, blocos: [{ papel: 'headline', linhas: ['Costela'] }], camadasExtras: Array.from({ length: n }, (_, i) => ({ id: `n${i}`, linhas: [`nota ${i}`], herdaDe: 'apoio' as const })) })
    const quarenta = comExtras(39)
    expect(quarenta.problemas).toEqual([])
    expect(validarCopyAutoral(JSON.parse(JSON.stringify(copyAutoralDaSpec(quarenta.spec!).copy!))).problemas).toEqual([])
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
    // Como o compositor carimba a camada extra: `extra` (a identidade) E o vínculo declarado da main (`bloco` = o id do
    // extra). Antes (PR 9) só `extra.id` — que era a marca que a leitura do PR 9 lia (rebase sobre a main, 21/09/2026).
    const doExtra = (id: string) => ({ groupId: 'g', compositor: { extra: { id, funcao: 'livre', herdaDe: 'apoio', grupoVisual: 'principal' }, bloco: id, linhas: [0] } })
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

describe('correção da revisão FINAL do Codex sobre 5e6635fa (R18)', () => {
  const base = { projectId: 8, formato: 'story' as const }
  const origem = { autor: 'claude' as const, superficie: 'chat', em: '2026-09-12T12:00:00.000Z' }
  const HORARIO = 'Ter a dom, das 18h às 23h'
  const ENDERECO = 'Av. Beira Mar, 100'
  const img = (id: string, url: string, x: number, y: number, grupo: string): Layer =>
    ({ id, name: id, type: 'image', visible: true, locked: false, order: 0, rotation: 0, fileUrl: url, position: { x, y }, size: { width: 26, height: 26 }, metadata: { groupId: grupo } }) as Layer
  // A mesma página do R13: horário num grupo, endereço noutro.
  const camadasDaPagina: Layer[] = [
    texto('headline', { fontFamily: 'Bevan', fontSize: 100, color: '#FFFFFF', lineHeight: 1 }, 'Título', { position: { x: 92, y: 300 }, metadata: { groupId: 'g-topo' } }),
    texto('servico', { fontFamily: 'Barlow', fontSize: 30, color: '#FFFFFF', lineHeight: 1.2, textAlign: 'left' }, 'Seg a sex, das 11h às 15h', { position: { x: 160, y: 1200 }, size: { width: 700, height: 40 }, metadata: { groupId: 'g-meio' } }),
    img('relogio', 'https://exemplo.com/relogio.png', 120, 1204, 'g-meio'),
    texto('info', { fontFamily: 'Barlow', fontSize: 24, color: '#DDDDDD', lineHeight: 1.2, textAlign: 'left' }, 'Rua das Flores, 12 — Centro', { id: 'servico-endereco', position: { x: 160, y: 1650 }, size: { width: 700, height: 40 }, metadata: { groupId: 'g-rodape' } }),
    img('pin', 'https://exemplo.com/pin.png', 122, 1652, 'g-rodape'),
  ]
  const a = montarAssinatura({ pagina: { id: 'p-dois-grupos', width: 1080, height: 1920, layers: camadasDaPagina }, formatoDaPagina: 'story', numerosDoProjeto: null })
  a.camadasDaPagina = camadasDaPagina
  const comum = { assinatura: a, colunaUtil: 1080 - 2 * a.numeros.geometria.story.margemH, escalaDoFormato: 1, mancha: '#000000', medir: medirFalso, familias: ['Bevan', 'Barlow'], combinacoesSalvas: [] }
  const persistir = (spec: Parameters<typeof entradaDePersistencia>[0]['spec'], layers: Layer[]) =>
    entradaDePersistencia({ spec, opcoes: {}, projeto: { id: 8, name: 'Lagosta', userId: 'u' }, pasta: { id: 1, name: 'p' }, nome: 'n', ordem: 0, canvas: { width: 1080, height: 1920 }, layers, fundo: '#000', diagnostico: {}, fotoUrl: null })
  const copy = (endereco: string): CopyAutoral => ({
    versao: VERSAO_DO_CONTRATO, origem, revisoes: [],
    blocos: [
      { id: 'h', funcao: 'headline', ordem: 0, linhas: ['Costela'] },
      { id: 'svc', funcao: 'servico', ordem: 1, linhas: [HORARIO, endereco] },
    ],
  })
  // R19: a marca é a posição AUTORAL de cada linha no bloco, não a numeração da montagem.
  // A posição AUTORAL de cada linha, como a preparação a declara. Rebase sobre a main (21/09/2026), decisão (A): a marca
  // é o `linhas` do PR 3 (sempre ao lado de `bloco`), não mais o `linhasDoBloco` do PR 9 — a MESMA informação.
  const marcaDe = (l: Layer) => (l.metadata?.compositor as { linhas?: number[] } | undefined)?.linhas

  it('R18: serviço repartido em dois grupos — as partes levam o vínculo; a efetiva reúne as duas no bloco autoral (id e linhas), sem bloco fictício, lacuna nem revisão', () => {
    const v = validarSpec({ ...base, copyAutoral: copy(ENDERECO) })
    expect(v.problemas).toEqual([])
    const p = prepararBlocos({ ...comum, spec: v.spec! })
    const camadas = p.montados.map((b) => b.layer)
    const porId = Object.fromEntries(camadas.map((l) => [l.id, l]))
    expect(Object.keys(porId).sort()).toEqual(['headline', 'servico', 'servico-2'])
    expect([porId.servico.content, porId['servico-2'].content]).toEqual([HORARIO, ENDERECO])
    // ANTES (PR 9): só as partes do bloco repartido levavam a marca; a manchete saía `undefined`. DEPOIS (main, PR 3): toda
    // camada que nasce de um bloco é carimbada com as posições que desenha — a manchete de uma linha declara [0].
    expect([marcaDe(porId.servico), marcaDe(porId['servico-2']), marcaDe(porId.headline)]).toEqual([[0], [1], [0]])

    const entrada = persistir(v.spec!, camadas)
    const efetiva = entrada.copyAutoral as CopyAutoral
    expect(efetiva.blocos.map((b) => [b.id, b.funcao, b.linhas])).toEqual([['h', 'headline', ['Costela']], ['svc', 'servico', [HORARIO, ENDERECO]]])
    expect(efetiva.revisoes).toEqual([])
    expect(efetiva.lacunas ?? []).toEqual([])
    expect(validarCopyAutoral(efetiva).problemas).toEqual([])
  })

  it('R18: editar SÓ o endereço → revisão da equipe só no bloco `svc` (as duas linhas, a nova no lugar) → a spec da recomposição passa em validarSpec com UM serviço de duas linhas', () => {
    const v = validarSpec({ ...base, copyAutoral: copy(ENDERECO) })
    const camadas = prepararBlocos({ ...comum, spec: v.spec! }).montados.map((b) => b.layer)
    const efetiva = persistir(v.spec!, camadas).copyAutoral as CopyAutoral
    const editadas = camadas.map((l) => (l.id === 'servico-2' ? { ...l, content: 'Av. Beira Mar, 200' } : l))

    const rev = revisaoDaPaginaComCamadas(efetiva, editadas, { autor: 'equipe', motivo: 'autosave', superficie: 'editor' })
    expect(rev.estado).toBe('registrada')
    expect(rev.blocos).toEqual(['svc'])
    expect(rev.copy!.blocos.map((b) => [b.id, b.linhas])).toEqual([['h', ['Costela']], ['svc', [HORARIO, 'Av. Beira Mar, 200']]])
    expect(rev.copy!.revisoes.at(-1)).toMatchObject({ autor: 'equipe', blocos: ['svc'] })

    // O que a recomposição monta: a spec persistida com o contrato atual da página.
    const recomposta = validarSpec(specDaRecomposicao(v.spec!, rev.copy!))
    expect(recomposta.problemas).toEqual([])
    expect(recomposta.spec!.blocos!.map((b) => [b.papel, b.linhas])).toEqual([['headline', ['Costela']], ['servico', [HORARIO, 'Av. Beira Mar, 200']]])
    expect(recomposta.spec!.camadasExtras ?? []).toEqual([])
    expect(validarSpec(recomposta.spec).problemas).toEqual([])
    // E a recomposição reparte de novo nas mesmas duas partes, com o endereço novo.
    const denovo = prepararBlocos({ ...comum, spec: recomposta.spec! }).montados.map((b) => b.layer)
    expect(Object.fromEntries(denovo.map((l) => [l.id, l.content]))).toEqual({ headline: 'Costela', servico: HORARIO, 'servico-2': 'Av. Beira Mar, 200' })
  })

  it('R18: a página DUPLICADA (ids novos) reúne as partes pela marca; página composta antes da marca reúne pelo id `<papel>-N`; camada comum sem marca nem id reservado continua fora (legado)', () => {
    const v = validarSpec({ ...base, copyAutoral: copy(ENDERECO) })
    const camadas = prepararBlocos({ ...comum, spec: v.spec! }).montados.map((b) => b.layer)
    const efetiva = persistir(v.spec!, camadas).copyAutoral as CopyAutoral

    const duplicadas = camadas.map((l) => ({ ...l, id: `uuid-${l.id}` })) as Layer[]
    const lidaDuplicada = copyEfetivaDasCamadas(efetiva, duplicadas, { superficie: 'editor' })
    expect(lidaDuplicada.mudancas).toEqual([])
    expect(lidaDuplicada.efetiva.blocos.map((b) => b.id)).toEqual(['h', 'svc'])

    const semMarca = camadas.map((l) => {
      const { bloco: _b, linhas: _l, ...compositor } = (l.metadata?.compositor ?? {}) as Record<string, unknown>
      return { ...l, metadata: { ...l.metadata, compositor } }
    }) as Layer[]
    const lidaSemMarca = copyEfetivaDasCamadas(efetiva, semMarca, { superficie: 'editor' })
    expect(lidaSemMarca.mudancas).toEqual([])
    expect(lidaSemMarca.efetiva.blocos.find((b) => b.id === 'svc')?.linhas).toEqual([HORARIO, ENDERECO])

    // Controle: sem marca E com id qualquer. A PERGUNTA MUDOU no rebase sobre a main (21/09/2026, decisão (A)).
    // ANTES (PR 9): o id decidia se a camada é parte — `servico-2` (reservado) era parte, `uuid-solta` era texto a mais.
    // DEPOIS (main): o id não é fonte de verdade; sem marca decide o PAPEL, e o bloco ÚNICO da função leva todas as
    // camadas dela ("bloco único leva TODAS", PR3-R8-02) — a camada com papel `servico` é parte de `svc`, seja qual for o
    // id. Afirmar o contrário seria inferir pertença pelo id, que é justamente o que a decisão recusa.
    const soltas = semMarca.map((l) => (l.id === 'servico-2' ? { ...l, id: 'uuid-solta' } : l)) as Layer[]
    const lidaSolta = copyEfetivaDasCamadas(efetiva, soltas, { superficie: 'editor' })
    expect(lidaSolta.efetiva.blocos.find((b) => b.id === 'svc')?.linhas).toEqual([HORARIO, ENDERECO])
    expect(lidaSolta.efetiva.blocos.some((b) => b.id === idDeExtra('uuid-solta'))).toBe(false)
  })

  it('R22: a página LEGADA (partes `servico` e `servico-2` sem marca nenhuma) DUPLICADA — a cópia leva o vínculo que os ids antigos davam: um único `svc` com as mesmas linhas, nenhuma revisão e a spec derivada válida', () => {
    const v = validarSpec({ ...base, copyAutoral: copy(ENDERECO) })
    const camadas = prepararBlocos({ ...comum, spec: v.spec! }).montados.map((b) => b.layer)
    const efetiva = persistir(v.spec!, camadas).copyAutoral as CopyAutoral
    const legado = camadas.map((l) => {
      const { bloco: _b, linhas: _l, ...compositor } = (l.metadata?.compositor ?? {}) as Record<string, unknown>
      return { ...l, metadata: { ...l.metadata, compositor } }
    }) as Layer[]
    // A página original reúne as partes pelos ids reservados.
    expect(copyEfetivaDasCamadas(efetiva, legado, { superficie: 'editor' }).efetiva.blocos.find((b) => b.id === 'svc')?.linhas).toEqual([HORARIO, ENDERECO])

    // A MESMA transformação da rota de duplicação, com a mesma renomeação do contrato.
    let n = 0
    const dup = duplicarCamadasDaPagina(legado, () => `uuid-${++n}`, efetiva)
    const duplicadas = dup.camadas as Layer[]
    expect(duplicadas.every((l) => !legado.some((o) => o.id === l.id))).toBe(true)
    const copia = dup.contrato!

    const lida = copyEfetivaDasCamadas(copia, duplicadas, { superficie: 'editor' })
    expect(lida.mudancas).toEqual([])
    expect(lida.efetiva.blocos.map((b) => [b.id, b.funcao, b.linhas])).toEqual([['h', 'headline', ['Costela']], ['svc', 'servico', [HORARIO, ENDERECO]]])
    expect(lida.efetiva.blocos.filter((b) => b.funcao === 'servico')).toHaveLength(1)
    expect(lida.efetiva.blocos.some((b) => b.id.startsWith('extra-'))).toBe(false)
    expect(revisaoDaPaginaComCamadas(copia, duplicadas, { autor: 'equipe', motivo: 'autosave', superficie: 'editor' }).estado).not.toBe('registrada')
    // Nenhum índice autoral é inventado — e, desde o rebase sobre a main (21/09/2026, decisão (A)), nenhuma numeração do
    // id também. ANTES (PR 9): a duplicação materializava `parte` 1 e 2 a partir dos ids `servico`/`servico-2`, porque a
    // leitura do PR 9 ordenava as partes por esse número. DEPOIS (main): com UM bloco da função, a reserva por papel já
    // reúne as partes ("bloco único leva TODAS"), então não há vínculo que só o id carregasse e nada é materializado —
    // é o que o desfecho acima (uma leitura idêntica, sem revisão) prova sem a marca.
    const servicos = duplicadas.filter((l) => l.content === HORARIO || l.content === ENDERECO)
    expect(servicos.map((l) => [l.content, (l.metadata?.compositor as { parte?: number }).parte, marcaDe(l)])).toEqual([[HORARIO, undefined, undefined], [ENDERECO, undefined, undefined]])

    const recomposta = validarSpec(specDaRecomposicao(v.spec!, lida.efetiva))
    expect(recomposta.problemas).toEqual([])
    expect(recomposta.spec!.blocos!.map((b) => [b.papel, b.linhas])).toEqual([['headline', ['Costela']], ['servico', [HORARIO, ENDERECO]]])
  })

  it('R26: o livre VAZIO com id de parte (`servico-2`, e o nome simples `servico`) — a spec recusa antes da composição; num contrato já gravado a leitura não deixa o livre capturar a parte, nem ocultando, nem duplicando', () => {
    const livreVazio = (id: string, estilo?: { herdaDe: 'headline' }) => ({ id, funcao: 'livre' as const, ordem: 2, linhas: [], ...(estilo ? { estilo } : {}) })
    const comLivre = (id: string, estilo?: { herdaDe: 'headline' }): CopyAutoral => ({ ...copy(ENDERECO), blocos: [...copy(ENDERECO).blocos, livreVazio(id, estilo)] })
    // 1. a porta: o id do livre vazio disputa o namespace da página
    for (const [id, estilo, motivo] of [['servico-2', { herdaDe: 'headline' as const }, /reservado.*servico-2/], ['servico-2', undefined, /reservado.*servico-2/], ['servico', { herdaDe: 'headline' as const }, /repetido: servico/]] as const) {
      const r = validarSpec({ ...base, copyAutoral: comLivre(id, estilo) })
      expect(r.spec, id).toBeNull()
      expect(r.problemas.join(' '), id).toMatch(motivo)
    }

    // 2. contrato já gravado (anterior à porta): as camadas são as da peça do R18, e a leitura mantém os vínculos
    const v = validarSpec({ ...base, copyAutoral: copy(ENDERECO) })
    const camadas = prepararBlocos({ ...comum, spec: v.spec! }).montados.map((b) => b.layer)
    expect(camadas.map((l) => l.id).sort()).toEqual(['headline', 'servico', 'servico-2'])
    for (const id of ['servico-2', 'servico']) {
      const gravado = comLivre(id, { herdaDe: 'headline' })
      const esperado = [['h', ['Costela']], ['svc', [HORARIO, ENDERECO]], [id, []]]
      const lida = copyEfetivaDasCamadas(gravado, camadas, { superficie: 'editor' })
      expect(lida.efetiva.blocos.map((b) => [b.id, b.linhas]), id).toEqual(esperado)
      expect(lida.mudancas, id).toEqual([])
      // ocultar o horário: a parte que sobrou continua de `svc`, o livre continua vazio
      const oculto = camadas.map((l) => (l.id === 'servico' ? { ...l, visible: false } : l)) as Layer[]
      expect(copyEfetivaDasCamadas(gravado, oculto, { superficie: 'editor' }).efetiva.blocos.map((b) => [b.id, b.linhas]), `${id} oculto`).toEqual([['h', ['Costela']], ['svc', [ENDERECO]], [id, []]])
      // duplicar: a cópia se lê como a original
      let n = 0
      const dup = duplicarCamadasDaPagina(camadas, () => `uuid-r26-${++n}`, gravado)
      const lidaCopia = copyEfetivaDasCamadas(dup.contrato!, dup.camadas as Layer[], { superficie: 'editor' })
      expect(lidaCopia.mudancas, `${id} duplicado`).toEqual([])
      expect(lidaCopia.efetiva.blocos.map((b) => [b.id, b.linhas]), `${id} duplicado`).toEqual(esperado)
      // o contrato intermediário (livre com o endereço) nunca nasce; a recomposição recusa na porta, com o motivo do id
      const recomposta = validarSpec(specDaRecomposicao(v.spec!, lida.efetiva))
      expect(recomposta.spec, `${id} recomposição`).toBeNull()
      expect(recomposta.problemas.join(' '), `${id} recomposição`).not.toMatch(/livre\(s\) com texto/)
    }
  })

  it('PR9-F02: o extra VAZIO COM FUNÇÃO e herança (`servico-2` e `servico`, serviço herdando o apoio) — a spec recusa na porta; num contrato já gravado a leitura não deixa o extra capturar a parte do serviço comum, nem ocultando, nem duplicando', () => {
    const extraVazio = (id: string) => ({ id, funcao: 'servico' as const, ordem: 2, linhas: [], estilo: { herdaDe: 'apoio' as const } })
    const comExtra = (id: string): CopyAutoral => ({ ...copy(ENDERECO), blocos: [...copy(ENDERECO).blocos, extraVazio(id)] })
    // 1. a porta: o id do extra vazio disputa o namespace da página, como o do livre vazio (R26)
    for (const [id, motivo] of [['servico-2', /reservado.*servico-2/], ['servico', /repetido: servico/]] as const) {
      const r = validarSpec({ ...base, copyAutoral: comExtra(id) })
      expect(r.spec, id).toBeNull()
      expect(r.problemas.join(' '), id).toMatch(motivo)
    }
    // 2. contrato já gravado: a preparação reparte o serviço comum em `servico` e `servico-2`
    const v = validarSpec({ ...base, copyAutoral: copy(ENDERECO) })
    const camadas = prepararBlocos({ ...comum, spec: v.spec! }).montados.map((b) => b.layer)
    expect(camadas.map((l) => l.id).sort()).toEqual(['headline', 'servico', 'servico-2'])
    for (const id of ['servico-2', 'servico']) {
      const gravado = comExtra(id)
      const esperado = [['h', ['Costela']], ['svc', [HORARIO, ENDERECO]], [id, []]]
      const lida = copyEfetivaDasCamadas(gravado, camadas, { superficie: 'editor' })
      expect(lida.efetiva.blocos.map((b) => [b.id, b.linhas]), id).toEqual(esperado)
      expect(lida.mudancas, id).toEqual([])
      const oculto = camadas.map((l) => (l.id === 'servico' ? { ...l, visible: false } : l)) as Layer[]
      expect(copyEfetivaDasCamadas(gravado, oculto, { superficie: 'editor' }).efetiva.blocos.map((b) => [b.id, b.linhas]), `${id} oculto`).toEqual([['h', ['Costela']], ['svc', [ENDERECO]], [id, []]])
      let n = 0
      const dup = duplicarCamadasDaPagina(camadas, () => `uuid-f02-${++n}`, gravado)
      const lidaCopia = copyEfetivaDasCamadas(dup.contrato!, dup.camadas as Layer[], { superficie: 'editor' })
      expect(lidaCopia.mudancas, `${id} duplicado`).toEqual([])
      expect(lidaCopia.efetiva.blocos.map((b) => [b.id, b.linhas]), `${id} duplicado`).toEqual(esperado)
      // o contrato intermediário (extra com o endereço) nunca nasce; a recomposição recusa na porta pelo id
      const recomposta = validarSpec(specDaRecomposicao(v.spec!, lida.efetiva))
      expect(recomposta.spec, `${id} recomposição`).toBeNull()
    }
  })

  it('R18: o extra com identidade explícita (serviço herdando a manchete) continua bloco próprio, mesmo com um serviço comum repartido', () => {
    const contrato: CopyAutoral = {
      versao: VERSAO_DO_CONTRATO, origem, revisoes: [],
      blocos: [
        { id: 'h', funcao: 'headline', ordem: 0, linhas: ['Costela'] },
        { id: 'svc', funcao: 'servico', ordem: 1, linhas: [HORARIO, ENDERECO] },
        { id: 'hora-extra', funcao: 'servico', ordem: 2, linhas: ['Delivery até 22h'], estilo: { herdaDe: 'headline' } },
      ],
    }
    const v = validarSpec({ ...base, copyAutoral: contrato })
    expect(v.problemas).toEqual([])
    const camadas = prepararBlocos({ ...comum, spec: v.spec! }).montados.map((b) => b.layer)
    const extra = camadas.find((l) => l.id === 'hora-extra')
    expect(extra?.metadata?.compositor).toMatchObject({ extra: { id: 'hora-extra', funcao: 'servico' } })
    // ANTES (PR 9): o extra não levava marca de posição (`linhasDoBloco` só nas partes repartidas). DEPOIS: ele carimba o
    // vínculo declarado do PR 3 apontando para o PRÓPRIO bloco — `bloco` = o id que o autor deu, nunca o do papel de que
    // ele só herda o estilo (headline) — com a posição da linha que desenha.
    expect(extra?.metadata?.compositor).toMatchObject({ bloco: 'hora-extra', linhas: [0] })
    const efetiva = persistir(v.spec!, camadas).copyAutoral as CopyAutoral
    expect(efetiva.blocos.map((b) => [b.id, b.linhas])).toEqual([['h', ['Costela']], ['svc', [HORARIO, ENDERECO]], ['hora-extra', ['Delivery até 22h']]])
    expect(efetiva.revisoes).toEqual([])
  })

  it('R18: sem contrato (spec legada com um serviço de duas linhas), o ORIGINAL derivado e a efetiva concordam — sem bloco extra', () => {
    const spec = { ...base, blocos: [{ papel: 'headline' as const, linhas: ['Costela'] }, { papel: 'servico' as const, linhas: [HORARIO, ENDERECO] }] }
    const v = validarSpec(spec)
    expect(v.problemas).toEqual([])
    const camadas = prepararBlocos({ ...comum, spec: v.spec! }).montados.map((b) => b.layer)
    const entrada = persistir(v.spec!, camadas)
    const efetiva = entrada.copyAutoral as CopyAutoral
    expect(efetiva.blocos.filter((b) => b.funcao === 'servico').map((b) => b.linhas)).toEqual([[HORARIO, ENDERECO]])
    expect(efetiva.blocos.some((b) => b.id.startsWith('extra-'))).toBe(false)
    expect(efetiva.revisoes).toEqual([])
  })
})

describe('correção da revisão do commit 10e5d381 (R19)', () => {
  const base = { projectId: 8, formato: 'story' as const }
  const origem = { autor: 'claude' as const, superficie: 'chat', em: '2026-09-12T12:00:00.000Z' }
  const HORARIO = 'Ter a dom, das 18h às 23h'
  const HORARIO_FDS = 'Sáb e dom, das 12h às 16h'
  const ENDERECO = 'Av. Beira Mar, 100'
  const ENDERECO_NOVO = 'Av. Beira Mar, 200'
  const img = (id: string, url: string, x: number, y: number, grupo: string): Layer =>
    ({ id, name: id, type: 'image', visible: true, locked: false, order: 0, rotation: 0, fileUrl: url, position: { x, y }, size: { width: 26, height: 26 }, metadata: { groupId: grupo } }) as Layer
  const estiloHorario = { fontFamily: 'Barlow', fontSize: 30, color: '#FFFFFF', lineHeight: 1.2, textAlign: 'left' }
  const estiloEndereco = { fontFamily: 'Barlow', fontSize: 24, color: '#DDDDDD', lineHeight: 1.2, textAlign: 'left' }
  // A página do R18 (horário e endereço em grupos diferentes, cada um com o seu ícone).
  const paginaR18: Layer[] = [
    texto('headline', { fontFamily: 'Bevan', fontSize: 100, color: '#FFFFFF', lineHeight: 1 }, 'Título', { position: { x: 92, y: 300 }, metadata: { groupId: 'g-topo' } }),
    texto('servico', estiloHorario, 'Seg a sex, das 11h às 15h', { position: { x: 160, y: 1200 }, size: { width: 700, height: 40 }, metadata: { groupId: 'g-meio' } }),
    img('relogio', 'https://exemplo.com/relogio.png', 120, 1204, 'g-meio'),
    texto('info', estiloEndereco, 'Rua das Flores, 12 — Centro', { id: 'servico-endereco', position: { x: 160, y: 1650 }, size: { width: 700, height: 40 }, metadata: { groupId: 'g-rodape' } }),
    img('pin', 'https://exemplo.com/pin.png', 122, 1652, 'g-rodape'),
  ]
  // A variante da revisão: o ENDEREÇO mora no grupo da MANCHETE. O grupo da
  // manchete já existe quando o serviço é distribuído, então o endereço é
  // montado primeiro e recebe o id `servico` — a numeração da montagem fica
  // INVERSA à ordem autoral [horário, endereço].
  const paginaEnderecoNaManchete: Layer[] = [
    texto('headline', { fontFamily: 'Bevan', fontSize: 100, color: '#FFFFFF', lineHeight: 1 }, 'Título', { position: { x: 92, y: 300 }, metadata: { groupId: 'g-topo' } }),
    texto('info', estiloEndereco, 'Rua das Flores, 12 — Centro', { id: 'servico-endereco', position: { x: 160, y: 460 }, size: { width: 700, height: 40 }, metadata: { groupId: 'g-topo' } }),
    img('pin', 'https://exemplo.com/pin.png', 122, 462, 'g-topo'),
    texto('servico', estiloHorario, 'Seg a sex, das 11h às 15h', { position: { x: 160, y: 1600 }, size: { width: 700, height: 40 }, metadata: { groupId: 'g-rodape' } }),
    img('relogio', 'https://exemplo.com/relogio.png', 120, 1604, 'g-rodape'),
  ]
  const comumDe = (camadas: Layer[]) => {
    const a = montarAssinatura({ pagina: { id: 'p-r19', width: 1080, height: 1920, layers: camadas }, formatoDaPagina: 'story', numerosDoProjeto: null })
    a.camadasDaPagina = camadas
    return { assinatura: a, colunaUtil: 1080 - 2 * a.numeros.geometria.story.margemH, escalaDoFormato: 1, mancha: '#000000', medir: medirFalso, familias: ['Bevan', 'Barlow'], combinacoesSalvas: [] }
  }
  const persistir = (spec: Parameters<typeof entradaDePersistencia>[0]['spec'], layers: Layer[]) =>
    entradaDePersistencia({ spec, opcoes: {}, projeto: { id: 8, name: 'Lagosta', userId: 'u' }, pasta: { id: 1, name: 'p' }, nome: 'n', ordem: 0, canvas: { width: 1080, height: 1920 }, layers, fundo: '#000', diagnostico: {}, fotoUrl: null })
  const copy = (linhas: string[]): CopyAutoral => ({
    versao: VERSAO_DO_CONTRATO, origem, revisoes: [],
    blocos: [
      { id: 'h', funcao: 'headline', ordem: 0, linhas: ['Costela'] },
      { id: 'svc', funcao: 'servico', ordem: 1, linhas },
    ],
  })
  // A posição AUTORAL de cada linha, como a preparação a declara. Rebase sobre a main (21/09/2026), decisão (A): a marca
  // é o `linhas` do PR 3 (sempre ao lado de `bloco`), não mais o `linhasDoBloco` do PR 9 — a MESMA informação.
  const marcaDe = (l: Layer) => (l.metadata?.compositor as { linhas?: number[] } | undefined)?.linhas
  const servicoDe = (c: CopyAutoral) => c.blocos.find((b) => b.id === 'svc')?.linhas
  // Página SEM marca = sem o vínculo declarado da main (`bloco` + `linhas`, que andam juntos). Antes (PR 9) tirava
  // `parte`/`linhasDoBloco`, as marcas que a leitura do PR 9 lia (rebase sobre a main, 21/09/2026).
  const semMarcas = (camadas: Layer[]) =>
    camadas.map((l) => {
      const { bloco: _b, linhas: _l, ...compositor } = (l.metadata?.compositor ?? {}) as Record<string, unknown>
      return { ...l, metadata: { ...l.metadata, compositor } }
    }) as Layer[]

  it('R19: endereço no grupo da manchete, montado ANTES do horário — a marca carrega a posição autoral de cada linha e a efetiva mantém [horário, endereço], sem revisão nem lacuna', () => {
    const comum = comumDe(paginaEnderecoNaManchete)
    const v = validarSpec({ ...base, copyAutoral: copy([HORARIO, ENDERECO]) })
    expect(v.problemas).toEqual([])
    const p = prepararBlocos({ ...comum, spec: v.spec! })
    const camadas = p.montados.map((b) => b.layer)
    const porId = Object.fromEntries(camadas.map((l) => [l.id, l]))
    expect(Object.keys(porId).sort()).toEqual(['headline', 'servico', 'servico-2'])
    // O cenário da revisão: a numeração da montagem é a INVERSA da autoral.
    expect([porId.servico.content, porId['servico-2'].content]).toEqual([ENDERECO, HORARIO])
    // ANTES: a manchete saía sem marca (`undefined`); DEPOIS: carimbada com [0] (ver R18).
    expect([marcaDe(porId.servico), marcaDe(porId['servico-2']), marcaDe(porId.headline)]).toEqual([[1], [0], [0]])

    const efetiva = persistir(v.spec!, camadas).copyAutoral as CopyAutoral
    expect(efetiva.blocos.map((b) => [b.id, b.funcao, b.linhas])).toEqual([['h', 'headline', ['Costela']], ['svc', 'servico', [HORARIO, ENDERECO]]])
    expect(efetiva.revisoes).toEqual([])
    expect(efetiva.lacunas ?? []).toEqual([])
    expect(validarCopyAutoral(efetiva).problemas).toEqual([])
    expect(revisaoDaPaginaComCamadas(efetiva, camadas, { autor: 'equipe', motivo: 'autosave', superficie: 'editor' }).estado).not.toBe('registrada')
  })

  it('R19: editar SÓ o endereço → [horário, endereço novo] → a recomposição reparte e MARCA de novo → a efetiva da peça recomposta e a da cópia duplicada não criam revisão', () => {
    const comum = comumDe(paginaEnderecoNaManchete)
    const v = validarSpec({ ...base, copyAutoral: copy([HORARIO, ENDERECO]) })
    const camadas = prepararBlocos({ ...comum, spec: v.spec! }).montados.map((b) => b.layer)
    const efetiva = persistir(v.spec!, camadas).copyAutoral as CopyAutoral
    // O endereço é a camada `servico` nesta variante.
    const editadas = camadas.map((l) => (l.id === 'servico' ? { ...l, content: ENDERECO_NOVO } : l))

    const rev = revisaoDaPaginaComCamadas(efetiva, editadas, { autor: 'equipe', motivo: 'autosave', superficie: 'editor' })
    expect(rev.estado).toBe('registrada')
    expect(rev.blocos).toEqual(['svc'])
    expect(rev.copy!.blocos.map((b) => [b.id, b.linhas])).toEqual([['h', ['Costela']], ['svc', [HORARIO, ENDERECO_NOVO]]])

    const recomposta = validarSpec(specDaRecomposicao(v.spec!, rev.copy!))
    expect(recomposta.problemas).toEqual([])
    expect(recomposta.spec!.blocos!.map((b) => [b.papel, b.linhas])).toEqual([['headline', ['Costela']], ['servico', [HORARIO, ENDERECO_NOVO]]])
    const denovo = prepararBlocos({ ...comum, spec: recomposta.spec! }).montados.map((b) => b.layer)
    expect(Object.fromEntries(denovo.map((l) => [l.id, [l.content, marcaDe(l)]]))).toEqual({ headline: ['Costela', [0]], servico: [ENDERECO_NOVO, [1]], 'servico-2': [HORARIO, [0]] })

    const lidaRecomposta = copyEfetivaDasCamadas(rev.copy!, denovo, { superficie: 'recomposicao' })
    expect(lidaRecomposta.mudancas).toEqual([])
    expect(servicoDe(lidaRecomposta.efetiva)).toEqual([HORARIO, ENDERECO_NOVO])

    const mapa = new Map(denovo.map((l) => [String(l.id), `uuid-${l.id}`]))
    const copia = renomearExtrasDuplicados(lidaRecomposta.efetiva, mapa, denovo)
    const duplicadas = denovo.map((l) => ({ ...l, id: mapa.get(String(l.id))! })) as Layer[]
    const lidaDuplicada = copyEfetivaDasCamadas(copia, duplicadas, { superficie: 'editor' })
    expect(lidaDuplicada.mudancas).toEqual([])
    expect(servicoDe(lidaDuplicada.efetiva)).toEqual([HORARIO, ENDERECO_NOVO])
  })

  it('R19: índices NÃO consecutivos pela distribuição — os dois horários vão para o texto do relógio ([0, 2]) e o endereço para o do pin ([1]); a efetiva intercala na ordem autoral, também depois de editar o endereço', () => {
    const comum = comumDe(paginaR18)
    const v = validarSpec({ ...base, copyAutoral: copy([HORARIO, ENDERECO, HORARIO_FDS]) })
    expect(v.problemas).toEqual([])
    const camadas = prepararBlocos({ ...comum, spec: v.spec! }).montados.map((b) => b.layer)
    const porId = Object.fromEntries(camadas.map((l) => [l.id, l]))
    expect([porId.servico.content, porId['servico-2'].content]).toEqual([`${HORARIO}\n${HORARIO_FDS}`, ENDERECO])
    expect([marcaDe(porId.servico), marcaDe(porId['servico-2'])]).toEqual([[0, 2], [1]])

    const efetiva = persistir(v.spec!, camadas).copyAutoral as CopyAutoral
    expect(servicoDe(efetiva)).toEqual([HORARIO, ENDERECO, HORARIO_FDS])
    expect(efetiva.revisoes).toEqual([])
    const editadas = camadas.map((l) => (l.id === 'servico-2' ? { ...l, content: ENDERECO_NOVO } : l))
    expect(servicoDe(copyEfetivaDasCamadas(efetiva, editadas, { superficie: 'editor' }).efetiva)).toEqual([HORARIO, ENDERECO_NOVO, HORARIO_FDS])
  })

  it('R19: a reunião pela marca, com camadas montadas à mão — intercala por linha independente de y e do id; camada cuja contagem de linhas mudou fica INTEIRA no menor índice marcado, sem quebrar a leitura', () => {
    // A marca é o vínculo declarado da main (`bloco` + `linhas`); antes estas camadas levavam `linhasDoBloco` (PR 9).
    const doServico = (id: string, content: string, y: number, linhas: number[]) =>
      texto(id, { fontFamily: 'Barlow', fontSize: 30 }, content, { position: { x: 92, y }, metadata: { groupId: 'g', compositor: { papel: 'servico', bloco: 'svc', linhas } } })
    const contrato = copy(['L0', 'L1', 'L2'])
    // A camada de cima (y 900) tem a linha do MEIO; a de baixo tem a primeira e a última.
    const camadas = [texto('headline', { fontFamily: 'Bevan', fontSize: 100 }, 'Costela', { metadata: { compositor: { papel: 'headline' } } }), doServico('uuid-b', 'L1', 900, [1]), doServico('uuid-a', 'L0\nL2', 1500, [0, 2])]
    const lida = copyEfetivaDasCamadas(contrato, camadas, { superficie: 'editor' })
    expect(servicoDe(lida.efetiva)).toEqual(['L0', 'L1', 'L2'])
    expect(lida.mudancas).toEqual([])
    expect(lida.lacunas).toEqual([])

    const comLinhaAMais = camadas.map((l) => (l.id === 'uuid-a' ? { ...l, content: 'L0\nL2\nL3' } : l))
    const aMais = copyEfetivaDasCamadas(contrato, comLinhaAMais, { superficie: 'editor' })
    // A camada ganhou uma linha, então a declaração dela ([0, 2]) já não cobre o desenho e vale a reserva por texto.
    // ANTES (PR 9): a camada editada entrava INTEIRA no menor índice marcado → ['L0', 'L2', 'L3', 'L1'] — a linha L1,
    // que ninguém tocou, ia para o fim. DEPOIS (main): cada linha volta à posição da linha IGUAL a ela, e a acrescentada
    // vai depois do fim → ['L0', 'L1', 'L2', 'L3']. O bloco do autor fica intacto e só o acréscimo aparece.
    expect(servicoDe(aMais.efetiva)).toEqual(['L0', 'L1', 'L2', 'L3'])
    expect(aMais.efetiva.blocos.some((b) => b.id.startsWith('extra-'))).toBe(false)

    const comLinhaAMenos = camadas.map((l) => (l.id === 'uuid-a' ? { ...l, content: 'L0' } : l))
    expect(servicoDe(copyEfetivaDasCamadas(contrato, comLinhaAMenos, { superficie: 'editor' }).efetiva)).toEqual(['L0', 'L1'])
  })

  it('R20: sobra UMA parte marcada — ocultar ou excluir o horário não inverte as linhas que ficaram ([2, 0] → [reserva, endereço]); o id do bloco se mantém e a releitura e a duplicação não criam revisão', () => {
    const RESERVA = 'Reserve pelo direct'
    // O arranjo da revisão: horário (relógio) e endereço (pin) no MESMO grupo — dois textos do papel num arranjo só.
    const paginaServicoNoMesmoGrupo: Layer[] = [
      texto('headline', { fontFamily: 'Bevan', fontSize: 100, color: '#FFFFFF', lineHeight: 1 }, 'Título', { position: { x: 92, y: 300 }, metadata: { groupId: 'g-topo' } }),
      texto('servico', estiloHorario, 'Seg a sex, das 11h às 15h', { position: { x: 160, y: 1580 }, size: { width: 700, height: 40 }, metadata: { groupId: 'g-rodape' } }),
      img('relogio', 'https://exemplo.com/relogio.png', 120, 1584, 'g-rodape'),
      texto('info', estiloEndereco, 'Rua das Flores, 12 — Centro', { id: 'servico-endereco', position: { x: 160, y: 1650 }, size: { width: 700, height: 40 }, metadata: { groupId: 'g-rodape' } }),
      img('pin', 'https://exemplo.com/pin.png', 122, 1652, 'g-rodape'),
    ]
    const comum = comumDe(paginaServicoNoMesmoGrupo)
    const v = validarSpec({ ...base, copyAutoral: copy([RESERVA, HORARIO, ENDERECO]) })
    expect(v.problemas).toEqual([])
    const camadas = prepararBlocos({ ...comum, spec: v.spec! }).montados.map((b) => b.layer)
    const porId = Object.fromEntries(camadas.map((l) => [l.id, l]))
    // A distribuição real da revisão: horário no texto do relógio, endereço no do pin e a sobra DEPOIS do endereço.
    expect([porId.servico.content, porId['servico-2'].content]).toEqual([HORARIO, `${ENDERECO}\n${RESERVA}`])
    expect([marcaDe(porId.servico), marcaDe(porId['servico-2'])]).toEqual([[1], [2, 0]])
    const efetiva = persistir(v.spec!, camadas).copyAutoral as CopyAutoral
    expect(servicoDe(efetiva)).toEqual([RESERVA, HORARIO, ENDERECO])
    expect(efetiva.revisoes).toEqual([])

    const oculto = camadas.map((l) => (l.id === 'servico' ? { ...l, visible: false } : l)) as Layer[]
    const excluido = camadas.filter((l) => l.id !== 'servico')
    for (const [nome, restantes] of [['oculto', oculto], ['excluído', excluido]] as const) {
      const rev = revisaoDaPaginaComCamadas(efetiva, restantes, { autor: 'equipe', motivo: 'autosave', superficie: 'editor' })
      expect(rev.estado, nome).toBe('registrada')
      expect(rev.blocos, nome).toEqual(['svc'])
      const svc = rev.copy!.blocos.find((b) => b.funcao === 'servico')!
      expect([svc.id, svc.linhas], nome).toEqual(['svc', [RESERVA, ENDERECO]])
      expect(rev.copy!.blocos.some((b) => b.id.startsWith('extra-')), nome).toBe(false)
      // releitura das MESMAS camadas sobre o contrato revisado: nada muda
      const relida = copyEfetivaDasCamadas(rev.copy!, restantes, { superficie: 'editor' })
      expect(relida.mudancas, nome).toEqual([])
      expect(servicoDe(relida.efetiva), nome).toEqual([RESERVA, ENDERECO])
      // duplicação (ids novos, a marca vai junto): nada muda
      const mapa = new Map(restantes.map((l) => [String(l.id), `uuid-${l.id}`]))
      const copia = renomearExtrasDuplicados(relida.efetiva, mapa, restantes)
      const duplicadas = restantes.map((l) => ({ ...l, id: mapa.get(String(l.id))! })) as Layer[]
      const lidaDuplicada = copyEfetivaDasCamadas(copia, duplicadas, { superficie: 'editor' })
      expect(lidaDuplicada.mudancas, nome).toEqual([])
      expect(servicoDe(lidaDuplicada.efetiva), nome).toEqual([RESERVA, ENDERECO])
    }
    // uma camada só SEM a marca continua no caminho comum (a ordem do texto)
    const semMarca = semMarcas(excluido)
    expect(servicoDe(copyEfetivaDasCamadas(efetiva, semMarca, { superficie: 'editor' }).efetiva)).toEqual([ENDERECO, RESERVA])
  })

  it('R19: página sem a marca nova continua com o comportamento do R18 — pela marca `parte` da página composta entre R18 e R19, e pelo id `<papel>-N` quando não há marca nenhuma', () => {
    const comum = comumDe(paginaR18)
    const v = validarSpec({ ...base, copyAutoral: copy([HORARIO, ENDERECO]) })
    const camadas = prepararBlocos({ ...comum, spec: v.spec! }).montados.map((b) => b.layer)
    const efetiva = persistir(v.spec!, camadas).copyAutoral as CopyAutoral

    const legado = semMarcas(camadas)
    const lidaLegado = copyEfetivaDasCamadas(efetiva, legado, { superficie: 'editor' })
    expect(lidaLegado.mudancas).toEqual([])
    expect(servicoDe(lidaLegado.efetiva)).toEqual([HORARIO, ENDERECO])

    // A forma de 10e5d381: só `parte`, com ids novos (duplicada) — vale a numeração da marca antiga.
    const comParte = legado.map((l, i) => (l.id === 'headline' ? l : { ...l, id: `uuid-${i}`, metadata: { ...l.metadata, compositor: { ...(l.metadata?.compositor as object), parte: l.id === 'servico' ? 1 : 2 } } })) as Layer[]
    const lidaParte = copyEfetivaDasCamadas(efetiva, comParte, { superficie: 'editor' })
    expect(lidaParte.mudancas).toEqual([])
    expect(servicoDe(lidaParte.efetiva)).toEqual([HORARIO, ENDERECO])
  })
})

describe('correção da revisão FINAL do Codex sobre e11abce7 (R21)', () => {
  const base = { projectId: 8, formato: 'story' as const }
  const origem = { autor: 'claude' as const, superficie: 'chat', em: '2026-09-12T12:00:00.000Z' }
  // Variante COM apoio e serviço: o extra herda do apoio, o serviço comum mora no rodapé.
  const camadasDaPagina: Layer[] = [
    texto('headline', { fontFamily: 'Bevan', fontSize: 100, color: '#FFFFFF', lineHeight: 1 }, 'Título', { position: { x: 92, y: 300 }, metadata: { groupId: 'g-topo' } }),
    texto('apoio', { fontFamily: 'Barlow', fontSize: 40, color: '#FFEEDD', lineHeight: 1.2 }, 'Apoio', { position: { x: 92, y: 420 }, metadata: { groupId: 'g-topo' } }),
    texto('servico', { fontFamily: 'Barlow', fontSize: 30, color: '#FFFFFF', lineHeight: 1.2, textAlign: 'left' }, 'Seg a sex, das 11h às 15h', { position: { x: 160, y: 1650 }, size: { width: 700, height: 40 }, metadata: { groupId: 'g-rodape' } }),
  ]
  const a = montarAssinatura({ pagina: { id: 'p-r21', width: 1080, height: 1920, layers: camadasDaPagina }, formatoDaPagina: 'story', numerosDoProjeto: null })
  a.camadasDaPagina = camadasDaPagina
  const comum = { assinatura: a, colunaUtil: 1080 - 2 * a.numeros.geometria.story.margemH, escalaDoFormato: 1, mancha: '#000000', medir: medirFalso, familias: ['Bevan', 'Barlow'], combinacoesSalvas: [] }
  const persistir = (spec: Parameters<typeof entradaDePersistencia>[0]['spec'], layers: Layer[]) =>
    entradaDePersistencia({ spec, opcoes: {}, projeto: { id: 8, name: 'Lagosta', userId: 'u' }, pasta: { id: 1, name: 'p' }, nome: 'n', ordem: 0, canvas: { width: 1080, height: 1920 }, layers, fundo: '#000', diagnostico: {}, fotoUrl: null })
  const preparar = (spec: Parameters<typeof prepararBlocos>[0]['spec']) => prepararBlocos({ ...comum, spec }).montados.map((b) => b.layer)
  // O cenário da revisão, nesta sequência: o extra declarado por ÚLTIMO com a menor ordem.
  const blocosDaRevisao = [
    { papel: 'headline' as const, linhas: ['Costela'] },
    { papel: 'servico' as const, linhas: ['11h às 15h'] },
    { papel: 'servico' as const, linhas: ['Delivery até 22h'], id: 'hora-extra', herdaDe: 'apoio' as const, grupoVisual: 'topo' as const, ordem: 0 },
  ]
  const conteudoPorId = (camadas: Layer[]) => Object.fromEntries(camadas.map((l) => [l.id, l.content]))

  it('R21: sem contrato, o extra declarado depois com ordem 0 — validação → preparação → persistência → edição → recomposição: a spec continua válida e cada texto fica no seu id', () => {
    const v = validarSpec({ ...base, blocos: blocosDaRevisao })
    expect(v.problemas).toEqual([])
    const camadas = preparar(v.spec!)
    expect(conteudoPorId(camadas)).toEqual({ headline: 'Costela', servico: '11h às 15h', 'hora-extra': 'Delivery até 22h' })
    expect(camadas.find((l) => l.id === 'hora-extra')?.metadata?.compositor).toMatchObject({ extra: { id: 'hora-extra', funcao: 'servico', herdaDe: 'apoio', grupoVisual: 'topo' } })

    // A persistência grava o contrato na ORDEM AUTORAL: o extra (ordem 0) antes dos blocos comuns.
    const efetiva = persistir(v.spec!, camadas).copyAutoral as CopyAutoral
    expect(efetiva.blocos.map((b) => [b.id, b.funcao, b.ordem, b.linhas])).toEqual([
      ['hora-extra', 'servico', 0, ['Delivery até 22h']],
      ['headline', 'headline', 1, ['Costela']],
      ['servico', 'servico', 2, ['11h às 15h']],
    ])
    expect(efetiva.revisoes).toEqual([])
    expect(validarCopyAutoral(efetiva).problemas).toEqual([])

    // A edição do serviço comum é revisão da equipe SÓ no bloco dele.
    const editadas = camadas.map((l) => (l.id === 'servico' ? { ...l, content: '11h às 16h' } : l))
    const rev = revisaoDaPaginaComCamadas(efetiva, editadas, { autor: 'equipe', motivo: 'autosave', superficie: 'editor' })
    expect(rev.estado).toBe('registrada')
    expect(rev.blocos).toEqual(['servico'])
    expect(rev.copy!.blocos.map((b) => [b.id, b.linhas])).toEqual([['hora-extra', ['Delivery até 22h']], ['headline', ['Costela']], ['servico', ['11h às 16h']]])

    // A recomposição parte do contrato: agora o serviço COMUM é a segunda ocorrência do papel, e continua válido.
    const recomposta = validarSpec(specDaRecomposicao(v.spec!, rev.copy!))
    expect(recomposta.problemas).toEqual([])
    expect(recomposta.spec!.blocos!.map((b) => [b.papel, b.id ?? null, b.herdaDe ?? null, b.linhas])).toEqual([
      ['servico', 'hora-extra', 'apoio', ['Delivery até 22h']],
      ['headline', null, null, ['Costela']],
      ['servico', null, null, ['11h às 16h']],
    ])
    expect(validarSpec(recomposta.spec).problemas).toEqual([])
    expect(conteudoPorId(preparar(recomposta.spec!))).toEqual({ headline: 'Costela', servico: '11h às 16h', 'hora-extra': 'Delivery até 22h' })
  })

  it('R21: a mesma peça pela entrada DIRETA do contrato (extra na ordem 0) — válida na composição e na recomposição depois da edição', () => {
    const contrato: CopyAutoral = {
      versao: VERSAO_DO_CONTRATO, origem, revisoes: [],
      blocos: [
        { id: 'hora-extra', funcao: 'servico', ordem: 0, linhas: ['Delivery até 22h'], estilo: { herdaDe: 'apoio', grupoVisual: 'topo' } },
        { id: 'h', funcao: 'headline', ordem: 1, linhas: ['Costela'] },
        { id: 'svc', funcao: 'servico', ordem: 2, linhas: ['11h às 15h'] },
      ],
    }
    const v = validarSpec({ ...base, copyAutoral: contrato })
    expect(v.problemas).toEqual([])
    const camadas = preparar(v.spec!)
    expect(conteudoPorId(camadas)).toEqual({ headline: 'Costela', servico: '11h às 15h', 'hora-extra': 'Delivery até 22h' })
    const efetiva = persistir(v.spec!, camadas).copyAutoral as CopyAutoral
    expect(efetiva.blocos.map((b) => [b.id, b.linhas])).toEqual([['hora-extra', ['Delivery até 22h']], ['h', ['Costela']], ['svc', ['11h às 15h']]])
    expect(efetiva.revisoes).toEqual([])
    const editadas = camadas.map((l) => (l.id === 'servico' ? { ...l, content: '11h às 16h' } : l))
    const rev = revisaoDaPaginaComCamadas(efetiva, editadas, { autor: 'equipe', motivo: 'autosave', superficie: 'editor' })
    expect(rev.blocos).toEqual(['svc'])
    const recomposta = validarSpec(specDaRecomposicao(v.spec!, rev.copy!))
    expect(recomposta.problemas).toEqual([])
    expect(conteudoPorId(preparar(recomposta.spec!))).toEqual({ headline: 'Costela', servico: '11h às 16h', 'hora-extra': 'Delivery até 22h' })
  })

  it('R21: a regra é a CONTAGEM de blocos comuns por papel, em qualquer posição — dois serviços comuns continuam recusados, com o extra antes, entre ou depois deles', () => {
    const extra = { papel: 'servico' as const, linhas: ['C'], id: 'hora-extra', herdaDe: 'apoio' as const }
    const A = { papel: 'servico' as const, linhas: ['A'] }
    const B = { papel: 'servico' as const, linhas: ['B'] }
    for (const blocos of [[extra, A, B], [A, extra, B], [A, B, extra]]) {
      const r = validarSpec({ ...base, blocos: [{ papel: 'headline' as const, linhas: ['Costela'] }, ...blocos] })
      expect(r.spec).toBeNull()
      expect(r.problemas[0]).toMatch(/papel repetido: servico/)
    }
    // Herança sem id não faz o bloco virar extra: continua sendo o segundo comum.
    const semId = validarSpec({ ...base, blocos: [{ papel: 'servico', linhas: ['B'], herdaDe: 'apoio' }, { papel: 'servico', linhas: ['A'] }] })
    expect(semId.problemas[0]).toMatch(/papel repetido: servico/)
  })

  it('R21: medirCopy numa variante SEM serviço declara o serviço ausente com as linhas do bloco COMUM, não as do extra declarado antes dele', () => {
    const baseDaMedida = { assinatura, medir: medirFalso, familias: ['Bevan', 'Barlow'], fonteCarregada: () => true, formato: 'story' as const }
    const m = medirCopy({ ...baseDaMedida, spec: { ...base, blocos: [
      { papel: 'servico' as const, linhas: ['Delivery até 22h', 'e aos domingos'], id: 'hora-extra', herdaDe: 'apoio' as const },
      { papel: 'headline' as const, linhas: ['Costela'] },
      { papel: 'servico' as const, linhas: ['11h às 15h'] },
    ] } })
    expect(m.papeisAusentes).toEqual(['servico'])
    expect(m.blocos.find((b) => b.id === 'servico' && b.situacao === 'papel-ausente')?.linhas).toBe(1)
  })
})

describe('correção da revisão FINAL do Codex sobre 838bde61 (R23–R24): identidade vence posição, e duplicar transporta todo vínculo do id físico', () => {
  const base = { projectId: 8, formato: 'story' as const }
  const origem = { autor: 'claude' as const, superficie: 'chat', em: '2026-09-12T12:00:00.000Z' }
  const equipe = { autor: 'equipe' as const, motivo: 'autosave', superficie: 'editor' }
  const camadasDaPagina: Layer[] = [
    texto('headline', { fontFamily: 'Bevan', fontSize: 100, color: '#FFFFFF', lineHeight: 1 }, 'Título', { position: { x: 92, y: 300 }, metadata: { groupId: 'g-topo' } }),
    texto('apoio', { fontFamily: 'Barlow', fontSize: 40, color: '#FFEEDD', lineHeight: 1.2 }, 'Apoio', { position: { x: 92, y: 420 }, metadata: { groupId: 'g-topo' } }),
    texto('servico', { fontFamily: 'Barlow', fontSize: 30, color: '#FFFFFF', lineHeight: 1.2, textAlign: 'left' }, 'Seg a sex, das 11h às 15h', { position: { x: 160, y: 1650 }, size: { width: 700, height: 40 }, metadata: { groupId: 'g-rodape' } }),
  ]
  const a = montarAssinatura({ pagina: { id: 'p-r23', width: 1080, height: 1920, layers: camadasDaPagina }, formatoDaPagina: 'story', numerosDoProjeto: null })
  a.camadasDaPagina = camadasDaPagina
  const comum = { assinatura: a, colunaUtil: 1080 - 2 * a.numeros.geometria.story.margemH, escalaDoFormato: 1, mancha: '#000000', medir: medirFalso, familias: ['Bevan', 'Barlow'], combinacoesSalvas: [] }
  const persistir = (spec: Parameters<typeof entradaDePersistencia>[0]['spec'], layers: Layer[]) =>
    entradaDePersistencia({ spec, opcoes: {}, projeto: { id: 8, name: 'Lagosta', userId: 'u' }, pasta: { id: 1, name: 'p' }, nome: 'n', ordem: 0, canvas: { width: 1080, height: 1920 }, layers, fundo: '#000', diagnostico: {}, fotoUrl: null })
  const linhasPorId = (c: CopyAutoral) => c.blocos.map((b) => [b.id, b.linhas])
  const semExtraInventado = (c: CopyAutoral) => c.blocos.filter((b) => b.id.startsWith('extra-')).map((b) => b.id)
  const duplicar = (camadas: Layer[], contrato: CopyAutoral) => {
    let n = 0
    const d = duplicarCamadasDaPagina(camadas, () => `uuid-dup-${++n}`, contrato)
    expect((d.camadas as Layer[]).every((l) => !camadas.some((o) => o.id === l.id))).toBe(true)
    return { camadas: d.camadas as Layer[], contrato: d.contrato! }
  }
  const ehDoExtra = (id: string) => (l: Layer) => (l.metadata?.compositor as { extra?: { id?: string } } | undefined)?.extra?.id === id
  // A peça do R21 pela entrada DIRETA do contrato: o extra `hora-extra` (servico, ordem 0, herdaDe apoio) e o comum `svc`.
  const montarR21 = () => {
    const contrato: CopyAutoral = {
      versao: VERSAO_DO_CONTRATO, origem, revisoes: [],
      blocos: [
        { id: 'hora-extra', funcao: 'servico', ordem: 0, linhas: ['Delivery até 22h'], estilo: { herdaDe: 'apoio', grupoVisual: 'topo' } },
        { id: 'h', funcao: 'headline', ordem: 1, linhas: ['Costela'] },
        { id: 'svc', funcao: 'servico', ordem: 2, linhas: ['11h às 15h'] },
      ],
    }
    const v = validarSpec({ ...base, copyAutoral: contrato })
    expect(v.problemas).toEqual([])
    const camadas = prepararBlocos({ ...comum, spec: v.spec! }).montados.map((b) => b.layer)
    const efetiva = persistir(v.spec!, camadas).copyAutoral as CopyAutoral
    expect(efetiva.revisoes).toEqual([])
    return { spec: v.spec!, camadas, efetiva }
  }
  const INTACTO = [['hora-extra', ['Delivery até 22h']], ['h', ['Costela']], ['svc', ['11h às 15h']]]
  const SEM_EXTRA = [['hora-extra', []], ['h', ['Costela']], ['svc', ['11h às 15h']]]
  const ocultarOuExcluir = (camadas: Layer[], alvo: (l: Layer) => boolean) =>
    [['oculta', camadas.map((l) => (alvo(l) ? { ...l, visible: false } : l)) as Layer[]], ['excluída', camadas.filter((l) => !alvo(l))]] as const

  it('R23: ocultar ou excluir SÓ o extra `hora-extra` muda só `hora-extra` — o comum `svc` fica com o texto dele, a releitura é estável e a recomposição continua válida', () => {
    const { spec, camadas, efetiva } = montarR21()
    for (const [nome, restantes] of ocultarOuExcluir(camadas, ehDoExtra('hora-extra'))) {
      const rev = revisaoDaPaginaComCamadas(efetiva, restantes, equipe)
      expect(rev.estado, nome).toBe('registrada')
      expect(rev.blocos, nome).toEqual(['hora-extra'])
      expect(linhasPorId(rev.copy!), nome).toEqual(SEM_EXTRA)
      expect(semExtraInventado(rev.copy!), nome).toEqual([])
      expect(copyEfetivaDasCamadas(rev.copy!, restantes, { superficie: 'editor' }).mudancas, nome).toEqual([])
      expect(validarSpec(specDaRecomposicao(spec, rev.copy!)).problemas, nome).toEqual([])
    }
  })

  it('R23: ocultar e REEXIBIR o extra — a segunda revisão devolve o texto só a `hora-extra`, sem tocar `svc`', () => {
    const { camadas, efetiva } = montarR21()
    const oculta = camadas.map((l) => (ehDoExtra('hora-extra')(l) ? { ...l, visible: false } : l)) as Layer[]
    const rev1 = revisaoDaPaginaComCamadas(efetiva, oculta, equipe)
    expect(linhasPorId(rev1.copy!)).toEqual(SEM_EXTRA)
    const rev2 = revisaoDaPaginaComCamadas(rev1.copy!, camadas, equipe)
    expect(rev2.blocos).toEqual(['hora-extra'])
    expect(linhasPorId(rev2.copy!)).toEqual(INTACTO)
  })

  it('R23: na página DUPLICADA (ids físicos regenerados), a cópia se lê sem mudança, e ocultar ou excluir o extra nela muda só `hora-extra`', () => {
    const { camadas, efetiva } = montarR21()
    const dup = duplicar(camadas, efetiva)
    expect(copyEfetivaDasCamadas(dup.contrato, dup.camadas, { superficie: 'editor' }).mudancas).toEqual([])
    for (const [nome, restantes] of ocultarOuExcluir(dup.camadas, ehDoExtra('hora-extra'))) {
      const rev = revisaoDaPaginaComCamadas(dup.contrato, restantes, equipe)
      expect(rev.blocos, nome).toEqual(['hora-extra'])
      expect(linhasPorId(rev.copy!), nome).toEqual(SEM_EXTRA)
    }
  })

  it('R23: o extra EXCLUÍDO não toma o texto que a equipe acrescentou — a camada nova de serviço vira bloco `extra-…` próprio e `svc` fica intacto', () => {
    const { camadas, efetiva } = montarR21()
    const nova = texto('uuid-nova', { fontFamily: 'Barlow', fontSize: 30 }, 'Retirada no balcão', { position: { x: 160, y: 1800 }, metadata: { groupId: 'g-rodape', compositor: { papel: 'servico' } } })
    const restantes = [...camadas.filter((l) => !ehDoExtra('hora-extra')(l)), nova]
    const lida = copyEfetivaDasCamadas(efetiva, restantes, { superficie: 'editor' }).efetiva
    expect(linhasPorId(lida).slice(0, 3)).toEqual(SEM_EXTRA)
    expect(lida.blocos.slice(3).map((b) => [b.id, b.funcao, b.linhas])).toEqual([[idDeExtra('uuid-nova'), 'servico', ['Retirada no balcão']]])
  })

  it('R23 (compatibilidade): a segunda voz legada (`headline2`: função headline herdando headline) continua lida pela voz 2, como antes', () => {
    const legado: CopyAutoral = {
      versao: VERSAO_DO_CONTRATO, origem, revisoes: [],
      blocos: [{ id: 'headline2', funcao: 'headline', ordem: 0, linhas: ['Grelhada'], estilo: { herdaDe: 'headline', linhasNaVoz2: [0] } }],
    }
    expect(validarCopyAutoral(legado).problemas).toEqual([])
    const camadas = [texto('headline2', { fontFamily: 'Bevan', fontSize: 80 }, 'Grelhada', { position: { x: 92, y: 400 }, metadata: { compositor: { papel: 'headline2' } } })]
    const lida = copyEfetivaDasCamadas(legado, camadas, { superficie: 'editor' })
    expect(lida.mudancas).toEqual([])
    expect(linhasPorId(lida.efetiva)).toEqual([['headline2', ['Grelhada']]])
    expect(semExtraInventado(lida.efetiva)).toEqual([])
  })

  // Dois blocos COMUNS da mesma função: `servico` vinculado pelo id físico (camada de BAIXO) e `svc-b` só por posição (camada de CIMA).
  const contratoDoisComuns: CopyAutoral = {
    versao: VERSAO_DO_CONTRATO, origem, revisoes: [],
    blocos: [
      { id: 'h', funcao: 'headline', ordem: 0, linhas: ['Costela'] },
      { id: 'servico', funcao: 'servico', ordem: 1, linhas: ['Seg a sex, 11h às 15h'] },
      { id: 'svc-b', funcao: 'servico', ordem: 2, linhas: ['Av. Beira Mar, 100'] },
    ],
  }
  // Rebase sobre a main (21/09/2026), decisão (A): com DOIS blocos comuns da mesma função, o que diz qual camada é de qual
  // bloco é o vínculo DECLARADO (`bloco`), gravado pelo compositor e, na página sem ele, pela materialização da
  // duplicação ("o comum `servico` numa página com dois serviços"). ANTES estas camadas não tinham marca e a leitura do
  // PR 9 casava pelo id FÍSICO (`servico` ↔ bloco `servico`); sem a marca a main não tem o que arbitrar — é o eixo da
  // página sem marca, declarado fora do escopo do invariante —, e o que estes testes afirmam vale com ela.
  const camadasDoisComuns: Layer[] = [
    texto('headline', { fontFamily: 'Bevan', fontSize: 100 }, 'Costela', { position: { x: 92, y: 300 }, metadata: { compositor: { papel: 'headline', bloco: 'h', linhas: [0] } } }),
    texto('servico', { fontFamily: 'Barlow', fontSize: 30 }, 'Seg a sex, 11h às 15h', { position: { x: 160, y: 1700 }, metadata: { compositor: { papel: 'servico', bloco: 'servico', linhas: [0] } } }),
    texto('uuid-b', { fontFamily: 'Barlow', fontSize: 30 }, 'Av. Beira Mar, 100', { position: { x: 160, y: 1500 }, metadata: { compositor: { papel: 'servico', bloco: 'svc-b', linhas: [0] } } }),
  ]

  it('R23 (variante): o bloco comum cuja camada do id físico está OCULTA não toma por posição a camada do outro bloco da mesma função; reexibir devolve só a ele', () => {
    expect(copyEfetivaDasCamadas(contratoDoisComuns, camadasDoisComuns, { superficie: 'editor' }).mudancas).toEqual([])
    const oculta = camadasDoisComuns.map((l) => (l.id === 'servico' ? { ...l, visible: false } : l)) as Layer[]
    const rev = revisaoDaPaginaComCamadas(contratoDoisComuns, oculta, equipe)
    expect(rev.blocos).toEqual(['servico'])
    expect(linhasPorId(rev.copy!)).toEqual([['h', ['Costela']], ['servico', []], ['svc-b', ['Av. Beira Mar, 100']]])
    const volta = revisaoDaPaginaComCamadas(rev.copy!, camadasDoisComuns, equipe)
    expect(volta.blocos).toEqual(['servico'])
    expect(linhasPorId(volta.copy!)).toEqual(linhasPorId(contratoDoisComuns))
  })

  it('R23 (variante, legado): a parte VISÍVEL do bloco único continua sendo dele quando a camada do id físico está oculta (partes `servico` + `servico-2`)', () => {
    const contrato: CopyAutoral = { ...contratoDoisComuns, blocos: [contratoDoisComuns.blocos[0], { id: 'servico', funcao: 'servico', ordem: 1, linhas: ['Seg a sex, 11h às 15h', 'Av. Beira Mar, 100'] }] }
    // A página LEGADA: as camadas reaproveitadas de `camadasDoisComuns` perdem o vínculo declarado (`bloco` + `linhas`),
    // que é o que a torna legada — aqui não há marca, e as partes se reúnem pela reserva por papel da main.
    const semVinculo = (l: Layer) => {
      const { bloco: _b, linhas: _l, ...compositor } = (l.metadata?.compositor ?? {}) as Record<string, unknown>
      return { ...l, metadata: { ...l.metadata, compositor } } as Layer
    }
    const camadas = [camadasDoisComuns[0], { ...camadasDoisComuns[1], position: { x: 160, y: 1500 } }, { ...camadasDoisComuns[2], id: 'servico-2', position: { x: 160, y: 1700 } }].map(semVinculo) as Layer[]
    expect(copyEfetivaDasCamadas(contrato, camadas, { superficie: 'editor' }).mudancas).toEqual([])
    const oculta = camadas.map((l) => (l.id === 'servico' ? { ...l, visible: false } : l)) as Layer[]
    const lida = copyEfetivaDasCamadas(contrato, oculta, { superficie: 'editor' }).efetiva
    expect(linhasPorId(lida)).toEqual([['h', ['Costela']], ['servico', ['Av. Beira Mar, 100']]])
    expect(semExtraInventado(lida)).toEqual([])
  })

  it('R24 (variante): duplicar a página com o vínculo de bloco COMUM pelo id físico — a cópia não troca os textos entre `servico` e `svc-b`, também depois de ocultar e reexibir', () => {
    const dup = duplicar(camadasDoisComuns, contratoDoisComuns)
    const lida = copyEfetivaDasCamadas(dup.contrato, dup.camadas, { superficie: 'editor' })
    expect(lida.mudancas).toEqual([])
    expect(linhasPorId(lida.efetiva)).toEqual(linhasPorId(contratoDoisComuns))
    // Oculta no ORIGINAL, duplica, reexibe na CÓPIA.
    const oculta = camadasDoisComuns.map((l) => (l.id === 'servico' ? { ...l, visible: false } : l)) as Layer[]
    const rev = revisaoDaPaginaComCamadas(contratoDoisComuns, oculta, equipe)
    const dupOculta = duplicar(oculta, rev.copy!)
    const reexibida = dupOculta.camadas.map((l) => ({ ...l, visible: true })) as Layer[]
    const volta = revisaoDaPaginaComCamadas(dupOculta.contrato, reexibida, equipe)
    expect(volta.blocos).toEqual(['servico'])
    expect(linhasPorId(volta.copy!)).toEqual(linhasPorId(contratoDoisComuns))
  })

  it('R24: o bloco LIVRE autoral `nota` vinculado só pelo id físico (nome "Nota da casa", sem metadata) — a cópia mantém id, texto e histórico, sem bloco novo nem revisão; oculto no original e reexibido na cópia, volta a `nota`', () => {
    const contrato: CopyAutoral = {
      versao: VERSAO_DO_CONTRATO, origem,
      blocos: [
        { id: 'h', funcao: 'headline', ordem: 0, linhas: ['Costela'] },
        { id: 'nota', funcao: 'livre', ordem: 1, linhas: ['vale hoje'] },
      ],
      revisoes: [{ autor: 'equipe', em: '2026-09-12T13:00:00.000Z', superficie: 'editor', motivo: 'autosave', blocos: ['nota'] }],
    }
    expect(validarCopyAutoral(contrato).problemas).toEqual([])
    const camadas: Layer[] = [
      texto('headline', { fontFamily: 'Bevan', fontSize: 100 }, 'Costela', { position: { x: 92, y: 300 }, metadata: { compositor: { papel: 'headline' } } }),
      texto('nota', { fontFamily: 'Barlow', fontSize: 40 }, 'vale hoje', { name: 'Nota da casa', position: { x: 92, y: 600 } }),
    ]
    expect(copyEfetivaDasCamadas(contrato, camadas, { superficie: 'editor' }).mudancas).toEqual([])
    const dup = duplicar(camadas, contrato)
    expect(dup.contrato.blocos.map((b) => b.id)).toEqual(['h', 'nota'])
    expect(dup.contrato.revisoes).toEqual(contrato.revisoes)
    const lida = copyEfetivaDasCamadas(dup.contrato, dup.camadas, { superficie: 'editor' })
    expect(lida.mudancas).toEqual([])
    expect(linhasPorId(lida.efetiva)).toEqual([['h', ['Costela']], ['nota', ['vale hoje']]])
    expect(revisaoDaPaginaComCamadas(dup.contrato, dup.camadas, equipe).estado).toBe('sem-mudanca')

    const oculta = camadas.map((l) => (l.id === 'nota' ? { ...l, visible: false } : l)) as Layer[]
    const rev = revisaoDaPaginaComCamadas(contrato, oculta, equipe)
    expect(rev.blocos).toEqual(['nota'])
    const dupOculta = duplicar(oculta, rev.copy!)
    const reexibida = dupOculta.camadas.map((l) => ({ ...l, visible: true })) as Layer[]
    const volta = revisaoDaPaginaComCamadas(dupOculta.contrato, reexibida, equipe)
    expect(volta.blocos).toEqual(['nota'])
    expect(linhasPorId(volta.copy!)).toEqual([['h', ['Costela']], ['nota', ['vale hoje']]])
    expect(semExtraInventado(volta.copy!)).toEqual([])
  })

  it('R24 (variante): o PAPEL reconhecido só pelo id físico (camada `apoio` com nome "Texto 2", sem metadata) sobrevive à duplicação', () => {
    const contrato: CopyAutoral = {
      versao: VERSAO_DO_CONTRATO, origem, revisoes: [],
      blocos: [{ id: 'h', funcao: 'headline', ordem: 0, linhas: ['Costela'] }, { id: 'ap', funcao: 'apoio', ordem: 1, linhas: ['Só hoje'] }],
    }
    const camadas: Layer[] = [
      texto('headline', { fontFamily: 'Bevan', fontSize: 100 }, 'Costela', { position: { x: 92, y: 300 }, metadata: { compositor: { papel: 'headline' } } }),
      texto('apoio', { fontFamily: 'Barlow', fontSize: 40 }, 'Só hoje', { name: 'Texto 2', position: { x: 92, y: 500 } }),
    ]
    expect(copyEfetivaDasCamadas(contrato, camadas, { superficie: 'editor' }).mudancas).toEqual([])
    const dup = duplicar(camadas, contrato)
    const lida = copyEfetivaDasCamadas(dup.contrato, dup.camadas, { superficie: 'editor' })
    expect(lida.mudancas).toEqual([])
    expect(linhasPorId(lida.efetiva)).toEqual(linhasPorId(contrato))
  })

  it('R23 (variante, ids inferidos da forma antiga): "Nota" e "nota" — ocultar "Nota" esvazia só `extra-nota`; `extra-nota-2` não troca de camada', () => {
    const contrato: CopyAutoral = {
      versao: VERSAO_DO_CONTRATO, origem, revisoes: [],
      blocos: [
        { id: 'h', funcao: 'headline', ordem: 0, linhas: ['Costela'] },
        { id: 'extra-nota', funcao: 'livre', ordem: 1, linhas: ['A'] },
        { id: 'extra-nota-2', funcao: 'livre', ordem: 2, linhas: ['B'] },
      ],
    }
    const camadas: Layer[] = [
      texto('headline', { fontFamily: 'Bevan', fontSize: 100 }, 'Costela', { position: { x: 92, y: 100 }, metadata: { compositor: { papel: 'headline' } } }),
      texto('Nota', { fontFamily: 'Barlow', fontSize: 40 }, 'A', { position: { x: 92, y: 500 }, metadata: {} }),
      texto('nota', { fontFamily: 'Barlow', fontSize: 40 }, 'B', { position: { x: 92, y: 560 }, metadata: {} }),
    ]
    expect(copyEfetivaDasCamadas(contrato, camadas, { superficie: 'editor' }).mudancas).toEqual([])
    const oculta = camadas.map((l) => (l.id === 'Nota' ? { ...l, visible: false } : l)) as Layer[]
    const rev = revisaoDaPaginaComCamadas(contrato, oculta, equipe)
    expect(rev.blocos).toEqual(['extra-nota'])
    expect(linhasPorId(rev.copy!)).toEqual([['h', ['Costela']], ['extra-nota', []], ['extra-nota-2', ['B']]])
  })

  // R25: o id AUTORAL de um extra livre pode ser igual ao id INFERIDO de outra camada (`idDeExtra('servico') === 'extra-servico'`).
  const preparar = (spec: Parameters<typeof prepararBlocos>[0]['spec']) => prepararBlocos({ ...comum, spec }).montados.map((b) => b.layer)
  const conteudoPorId = (camadas: Layer[]) => Object.fromEntries(camadas.map((l) => [l.id, l.content]))
  const comExtraLivre = (idDoExtra: string) => {
    const v = validarSpec({ ...base, blocos: [{ papel: 'headline', linhas: ['Costela'] }, { papel: 'servico', linhas: ['11h às 15h'] }], camadasExtras: [{ id: idDoExtra, linhas: ['Somente no salão'], herdaDe: 'apoio' }] })
    expect(v.problemas).toEqual([])
    const camadas = preparar(v.spec!)
    expect(conteudoPorId(camadas)).toEqual({ headline: 'Costela', servico: '11h às 15h', [idDoExtra]: 'Somente no salão' })
    const efetiva = persistir(v.spec!, camadas).copyAutoral as CopyAutoral
    expect(linhasPorId(efetiva)).toEqual([['headline', ['Costela']], ['servico', ['11h às 15h']], [idDoExtra, ['Somente no salão']]])
    expect(efetiva.revisoes).toEqual([])
    return { spec: v.spec!, camadas, efetiva }
  }

  it('R25: extra livre autoral `extra-servico` — validação → preparação → persistência → exclusão → revisão → duplicação: muda só `extra-servico`, o serviço fica intacto, o id autoral é preservado e a releitura é estável', () => {
    expect(idDeExtra('servico')).toBe('extra-servico')
    const { spec, camadas, efetiva } = comExtraLivre('extra-servico')
    const excluida = camadas.filter((l) => !ehDoExtra('extra-servico')(l))
    const rev = revisaoDaPaginaComCamadas(efetiva, excluida, equipe)
    expect(rev.estado).toBe('registrada')
    expect(rev.blocos).toEqual(['extra-servico'])
    const esperado = [['headline', ['Costela']], ['servico', ['11h às 15h']], ['extra-servico', []]]
    expect(linhasPorId(rev.copy!)).toEqual(esperado)
    expect(copyEfetivaDasCamadas(rev.copy!, excluida, { superficie: 'editor' }).mudancas).toEqual([])
    expect(validarSpec(specDaRecomposicao(spec, rev.copy!)).problemas).toEqual([])

    const dup = duplicar(excluida, rev.copy!)
    expect(dup.contrato.blocos.map((b) => b.id)).toEqual(['headline', 'servico', 'extra-servico'])
    expect(dup.contrato.revisoes.map((r) => r.blocos)).toEqual(rev.copy!.revisoes.map((r) => r.blocos))
    const lida = copyEfetivaDasCamadas(dup.contrato, dup.camadas, { superficie: 'editor' })
    expect(lida.mudancas).toEqual([])
    expect(linhasPorId(lida.efetiva)).toEqual(esperado)
  })

  it('R25 (controle): ocultar e reexibir `extra-servico`, também na página duplicada — muda só ele, o serviço fica intacto', () => {
    const { camadas, efetiva } = comExtraLivre('extra-servico')
    const oculta = camadas.map((l) => (ehDoExtra('extra-servico')(l) ? { ...l, visible: false } : l)) as Layer[]
    const rev = revisaoDaPaginaComCamadas(efetiva, oculta, equipe)
    expect(rev.blocos).toEqual(['extra-servico'])
    expect(linhasPorId(rev.copy!)).toEqual([['headline', ['Costela']], ['servico', ['11h às 15h']], ['extra-servico', []]])
    const volta = revisaoDaPaginaComCamadas(rev.copy!, camadas, equipe)
    expect(volta.blocos).toEqual(['extra-servico'])
    expect(linhasPorId(volta.copy!)).toEqual(linhasPorId(efetiva))

    const dup = duplicar(oculta, rev.copy!)
    expect(dup.contrato.blocos.map((b) => b.id)).toEqual(['headline', 'servico', 'extra-servico'])
    const reexibida = dup.camadas.map((l) => ({ ...l, visible: true })) as Layer[]
    const voltaNaCopia = revisaoDaPaginaComCamadas(dup.contrato, reexibida, equipe)
    expect(voltaNaCopia.blocos).toEqual(['extra-servico'])
    expect(linhasPorId(voltaNaCopia.copy!)).toEqual(linhasPorId(efetiva))
  })

  it('R25 (variante, forma antiga do id inferido): o autoral `extra-servico-2` excluído não toma a camada `servico` pelo sufixo de colisão', () => {
    const { camadas, efetiva } = comExtraLivre('extra-servico-2')
    const excluida = camadas.filter((l) => !ehDoExtra('extra-servico-2')(l))
    const rev = revisaoDaPaginaComCamadas(efetiva, excluida, equipe)
    expect(rev.blocos).toEqual(['extra-servico-2'])
    expect(linhasPorId(rev.copy!)).toEqual([['headline', ['Costela']], ['servico', ['11h às 15h']], ['extra-servico-2', []]])
    const dup = duplicar(excluida, rev.copy!)
    expect(dup.contrato.blocos.map((b) => b.id)).toEqual(['headline', 'servico', 'extra-servico-2'])
    expect(copyEfetivaDasCamadas(dup.contrato, dup.camadas, { superficie: 'editor' }).mudancas).toEqual([])
  })

  it('R25 (variante, o registro inferido continua funcionando): o autoral `extra-nota` excluído e um texto solto novo `nota` — o solto vira `extra-nota-2` (inferido), a releitura é estável, e a duplicação renomeia só o inferido', () => {
    const { camadas, efetiva } = comExtraLivre('extra-nota')
    const solta = texto('nota', { fontFamily: 'Barlow', fontSize: 40 }, 'Pergunte pelo vinho', { position: { x: 92, y: 1000 }, metadata: {} })
    const restantes = [...camadas.filter((l) => !ehDoExtra('extra-nota')(l)), solta]
    const rev = revisaoDaPaginaComCamadas(efetiva, restantes, equipe)
    expect(linhasPorId(rev.copy!)).toEqual([['headline', ['Costela']], ['servico', ['11h às 15h']], ['extra-nota', []], ['extra-nota-2', ['Pergunte pelo vinho']]])
    expect(copyEfetivaDasCamadas(rev.copy!, restantes, { superficie: 'editor' }).mudancas).toEqual([])

    const dup = duplicar(restantes, rev.copy!)
    const copiaDaSolta = dup.camadas.find((l) => l.content === 'Pergunte pelo vinho')!
    expect(dup.contrato.blocos.map((b) => b.id)).toEqual(['headline', 'servico', 'extra-nota', idDeExtra(copiaDaSolta)])
    const lida = copyEfetivaDasCamadas(dup.contrato, dup.camadas, { superficie: 'editor' })
    expect(lida.mudancas).toEqual([])
    expect(lida.efetiva.blocos.map((b) => b.linhas)).toEqual([['Costela'], ['11h às 15h'], [], ['Pergunte pelo vinho']])
  })

  it('R25 (namespace): o id inferido segue valendo para o livre SEM herança que a leitura criou — `extra-solta` casa com a camada `solta` e a duplicação o renomeia', () => {
    const contrato: CopyAutoral = {
      versao: VERSAO_DO_CONTRATO, origem, revisoes: [],
      blocos: [{ id: 'h', funcao: 'headline', ordem: 0, linhas: ['Costela'] }, { id: 'extra-solta', funcao: 'livre', ordem: 1, linhas: ['texto solto'] }],
    }
    const camadas: Layer[] = [
      texto('headline', { fontFamily: 'Bevan', fontSize: 100 }, 'Costela', { position: { x: 92, y: 300 }, metadata: { compositor: { papel: 'headline' } } }),
      texto('solta', { fontFamily: 'Barlow', fontSize: 40 }, 'texto solto', { position: { x: 92, y: 900 } }),
    ]
    expect(copyEfetivaDasCamadas(contrato, camadas, { superficie: 'editor' }).mudancas).toEqual([])
    const dup = duplicar(camadas, contrato)
    const copiaDaSolta = dup.camadas.find((l) => l.content === 'texto solto')!
    expect(dup.contrato.blocos.map((b) => b.id)).toEqual(['h', idDeExtra(copiaDaSolta)])
    expect(copyEfetivaDasCamadas(dup.contrato, dup.camadas, { superficie: 'editor' }).mudancas).toEqual([])
  })

  it('R25 (varredura do namespace): todo id que a composição ou a leitura GERA, como id autoral de extra — os de camada são recusados pela spec; `extra-*` é aceito, porque o namespace inferido é o do livre SEM herança', () => {
    const pedir = (id: string) => validarSpec({ ...base, blocos: [{ papel: 'headline', linhas: ['Costela'] }, { papel: 'servico', linhas: ['11h às 15h'] }], camadasExtras: [{ id, linhas: ['x'], herdaDe: 'apoio' }] })
    // o papel nu que já nomeia uma camada comum, a 2ª voz, a numeração do papel e as camadas internas
    for (const id of ['servico', 'headline', 'headline2', 'servico-2', 'apoio-3', 'bg-foto', 'logo', 'gradiente-leitura-topo', 'servico-elemento-1']) {
      expect(pedir(id).spec, id).toBeNull()
    }
    for (const id of ['extra-servico', 'extra-servico-2', 'extra-headline']) expect(pedir(id).problemas, id).toEqual([])
  })
})

describe('correção da revisão FINAL do Codex sobre 5d5d378e (R27): a segunda voz repartida em dois textos', () => {
  const base = { projectId: 8, formato: 'story' as const }
  const origem = { autor: 'claude' as const, superficie: 'chat', em: '2026-09-12T12:00:00.000Z' }
  const equipe = { autor: 'equipe' as const, motivo: 'autosave', superficie: 'editor' }
  const VOZ2 = { fontFamily: 'Bevan', fontSize: 70, color: '#F4301A', lineHeight: 1 }
  const pagina: Layer[] = [
    texto('headline', { fontFamily: 'Bevan', fontSize: 100, color: '#FFFFFF', lineHeight: 1 }, 'Título', { position: { x: 92, y: 300 }, metadata: { groupId: 'g-topo' } }),
    texto('headline2', VOZ2, 'Voz', { position: { x: 92, y: 410 }, metadata: { groupId: 'g-topo' } }),
    texto('headline2', VOZ2, 'Voz', { id: 'headline2-b', position: { x: 92, y: 500 }, metadata: { groupId: 'g-topo' } }),
    texto('apoio', { fontFamily: 'Barlow', fontSize: 40, color: '#FFEEDD', lineHeight: 1.2 }, 'Apoio', { position: { x: 92, y: 620 }, metadata: { groupId: 'g-topo' } }),
  ]
  const a = montarAssinatura({ pagina: { id: 'p-r27', width: 1080, height: 1920, layers: pagina }, formatoDaPagina: 'story', numerosDoProjeto: null })
  a.camadasDaPagina = pagina
  const comum = { assinatura: a, colunaUtil: 1080 - 2 * a.numeros.geometria.story.margemH, escalaDoFormato: 1, mancha: '#000000', medir: medirFalso, familias: ['Bevan', 'Barlow'], combinacoesSalvas: [] }
  const preparar = (spec: Parameters<typeof prepararBlocos>[0]['spec']) => prepararBlocos({ ...comum, spec }).montados.map((b) => b.layer)
  const persistir = (spec: Parameters<typeof entradaDePersistencia>[0]['spec'], layers: Layer[]) =>
    entradaDePersistencia({ spec, opcoes: {}, projeto: { id: 8, name: 'Lagosta', userId: 'u' }, pasta: { id: 1, name: 'p' }, nome: 'n', ordem: 0, canvas: { width: 1080, height: 1920 }, layers, fundo: '#000', diagnostico: {}, fotoUrl: null })
  const contrato: CopyAutoral = {
    versao: VERSAO_DO_CONTRATO, origem, revisoes: [],
    blocos: [{ id: 'h', funcao: 'headline', ordem: 0, linhas: ['Costela', 'na brasa', 'hoje'], estilo: { linhasNaVoz2: [1, 2] } }],
  }
  const manchete = (c: CopyAutoral) => c.blocos.map((b) => [b.id, b.linhas, b.estilo?.linhasNaVoz2 ?? null])
  const marca = (l: Layer | undefined) => (l?.metadata?.compositor as { linhas?: number[] } | undefined)?.linhas

  it('R27: preparação real → persistência → edição da última parte → recomposição: UM bloco autoral com as três linhas, a voz 2 declarada nas duas últimas', () => {
    const v = validarSpec({ ...base, copyAutoral: contrato })
    expect(v.problemas).toEqual([])
    const camadas = preparar(v.spec!)
    const porId = Object.fromEntries(camadas.map((l) => [l.id, l]))
    expect([porId.headline?.content, porId.headline2?.content, porId['headline2-2']?.content]).toEqual(['Costela', 'na brasa', 'hoje'])
    expect([marca(porId.headline2), marca(porId['headline2-2'])]).toEqual([[1], [2]])

    const efetiva = persistir(v.spec!, camadas).copyAutoral as CopyAutoral
    expect(manchete(efetiva)).toEqual([['h', ['Costela', 'na brasa', 'hoje'], [1, 2]]])
    expect(efetiva.revisoes).toEqual([])
    expect(validarCopyAutoral(efetiva).problemas).toEqual([])

    const editadas = camadas.map((l) => (l.id === 'headline2-2' ? { ...l, content: 'hoje à noite' } : l))
    const rev = revisaoDaPaginaComCamadas(efetiva, editadas, equipe)
    expect(rev.blocos).toEqual(['h'])
    expect(manchete(rev.copy!)).toEqual([['h', ['Costela', 'na brasa', 'hoje à noite'], [1, 2]]])
    expect(rev.copy!.blocos.some((b) => b.id.startsWith('extra-'))).toBe(false)

    const recomposta = validarSpec(specDaRecomposicao(v.spec!, rev.copy!))
    expect(recomposta.problemas).toEqual([])
    const denovo = preparar(recomposta.spec!)
    expect(Object.fromEntries(denovo.map((l) => [l.id, l.content]))).toEqual({ headline: 'Costela', headline2: 'na brasa', 'headline2-2': 'hoje à noite' })
    expect(copyEfetivaDasCamadas(rev.copy!, denovo, { superficie: 'recomposicao' }).mudancas).toEqual([])
  })

  it('R27: duplicar a página e ocultar UMA das partes da voz 2 — a cópia se lê sem mudança; oculta a do meio, a manchete fica [Costela, hoje] com a voz 2 na última linha, e reexibir devolve as três', () => {
    const v = validarSpec({ ...base, copyAutoral: contrato })
    const camadas = preparar(v.spec!)
    const efetiva = persistir(v.spec!, camadas).copyAutoral as CopyAutoral
    let n = 0
    const dup = duplicarCamadasDaPagina(camadas, () => `uuid-r27-${++n}`, efetiva)
    const copia = dup.camadas as Layer[]
    const lidaCopia = copyEfetivaDasCamadas(dup.contrato!, copia, { superficie: 'editor' })
    expect(lidaCopia.mudancas).toEqual([])
    expect(manchete(lidaCopia.efetiva)).toEqual(manchete(efetiva))

    for (const [nome, lista] of [['original', camadas], ['cópia', copia]] as const) {
      const base2 = nome === 'original' ? efetiva : dup.contrato!
      const oculta = lista.map((l) => (l.content === 'na brasa' ? { ...l, visible: false } : l)) as Layer[]
      const rev = revisaoDaPaginaComCamadas(base2, oculta, equipe)
      expect(rev.blocos, nome).toEqual(['h'])
      expect(manchete(rev.copy!), nome).toEqual([['h', ['Costela', 'hoje'], [1]]])
      expect(validarCopyAutoral(rev.copy!).problemas, nome).toEqual([])
      expect(rev.copy!.blocos.some((b) => b.id.startsWith('extra-')), nome).toBe(false)
      const volta = revisaoDaPaginaComCamadas(rev.copy!, lista, equipe)
      expect(manchete(volta.copy!), nome).toEqual([['h', ['Costela', 'na brasa', 'hoje'], [1, 2]]])
    }
  })

  // 🔴 FORA DO ESCOPO desde o rebase sobre a main (21/09/2026), decisão (A) — pulado DE PROPÓSITO, não apagado.
  // A pergunta era "a numeração do id (`headline2` = 1, `headline2-2` = 2) ordena a voz 2 da página LEGADA, e a
  // duplicação a materializa como `parte`". As duas metades tomam o id como fonte de ordem, e a decisão (A) recusa isso:
  // sem marca, a leitura da main não tem vínculo declarado para arbitrar, e a reserva dela documenta "a PRIMEIRA
  // `headline2` livre da peça" — com duas vozes 2 a outra vira bloco solto (`extra-headline2`) e a recomposição seguinte
  // recusa a spec. É limitação da leitura da MAIN, anterior ao PR 9 (o compositor da main já produz duas vozes 2), e está
  // declarada no invariante ("voz 2 repartida em página sem marca"). Na página COM marca o mesmo cenário é o R27, que
  // passa. O corpo abaixo fica como o PR 9 o escreveu, para quem for tratar a limitação da main.
  it.skip('R28: a voz 2 LEGADA (sem `linhasDoBloco` nem `parte`) com a altura CONTRÁRIA à numeração dos ids — a leitura original e a da cópia duplicada são idênticas, sem revisão, e a cópia leva `parte` 1 e 2', () => {
    const v = validarSpec({ ...base, copyAutoral: contrato })
    const alturas: Record<string, number> = { headline: 200, headline2: 500, 'headline2-2': 400 }
    const legado = preparar(v.spec!).map((l) => {
      const { bloco: _b, linhas: _l, ...compositor } = (l.metadata?.compositor ?? {}) as Record<string, unknown>
      return { ...l, position: { ...l.position, y: alturas[String(l.id)] ?? l.position.y }, metadata: { ...l.metadata, compositor } }
    }) as Layer[]
    const porId = Object.fromEntries(legado.map((l) => [l.id, l]))
    expect([porId.headline?.content, porId.headline2?.content, porId['headline2-2']?.content]).toEqual(['Costela', 'na brasa', 'hoje'])
    expect(legado.every((l) => marca(l) === undefined && (l.metadata?.compositor as { parte?: number }).parte === undefined)).toBe(true)

    const efetiva = persistir(v.spec!, legado).copyAutoral as CopyAutoral
    expect(manchete(efetiva)).toEqual([['h', ['Costela', 'na brasa', 'hoje'], [1, 2]]])
    expect(efetiva.revisoes).toEqual([])

    let n = 0
    const dup = duplicarCamadasDaPagina(legado, () => `uuid-r28-${++n}`, efetiva)
    const copia = dup.camadas as Layer[]
    expect(copia.every((l) => !legado.some((o) => o.id === l.id))).toBe(true)
    const lidaCopia = copyEfetivaDasCamadas(dup.contrato!, copia, { superficie: 'editor' })
    expect(lidaCopia.mudancas).toEqual([])
    expect(manchete(lidaCopia.efetiva)).toEqual(manchete(efetiva))
    expect(revisaoDaPaginaComCamadas(dup.contrato!, copia, equipe).estado).toBe('sem-mudanca')
    const parteDe = (conteudo: string) => (copia.find((l) => l.content === conteudo)?.metadata?.compositor as { parte?: number } | undefined)?.parte
    expect([parteDe('na brasa'), parteDe('hoje')]).toEqual([1, 2])
  })

  it('R27 (achado do invariante): a manchete INTEIRA na voz 2 com a camada dela oculta sai vazia SEM `linhasNaVoz2` — o contrato continua válido', () => {
    const inteira: CopyAutoral = { ...contrato, blocos: [{ id: 'h', funcao: 'headline', ordem: 0, linhas: ['Costela'], estilo: { linhasNaVoz2: [0] } }] }
    const v = validarSpec({ ...base, copyAutoral: inteira })
    expect(v.problemas).toEqual([])
    const camadas = preparar(v.spec!)
    expect(camadas.map((l) => l.id)).toEqual(['headline2'])
    const efetiva = persistir(v.spec!, camadas).copyAutoral as CopyAutoral
    const oculta = camadas.map((l) => ({ ...l, visible: false })) as Layer[]
    const rev = revisaoDaPaginaComCamadas(efetiva, oculta, equipe)
    expect(manchete(rev.copy!)).toEqual([['h', [], null]])
    expect(validarCopyAutoral(rev.copy!).problemas).toEqual([])
  })
})

describe('pré-revisão do HEAD 980eea2a (C9-02): a camada DUPLICADA ou COLADA no editor é texto novo, sem a identidade da original', () => {
  const origem = { autor: 'claude' as const, superficie: 'chat', em: '2026-09-12T12:00:00.000Z' }
  const equipe = { autor: 'equipe' as const, motivo: 'autosave', superficie: 'editor' }
  const HORARIO = 'Ter a dom, das 18h às 23h'
  const ENDERECO = 'Av. Beira Mar, 100'
  const contrato = (blocos: CopyAutoral['blocos']): CopyAutoral => ({ versao: VERSAO_DO_CONTRATO, origem, revisoes: [], blocos })
  const linhas = (c: CopyAutoral) => c.blocos.map((b) => [b.id, b.funcao, b.linhas])
  // `duplicateLayer` numa página COM contrato — a MESMA função pura que o callback do editor chama.
  const duplicarNoEditor = (l: Layer, id: string): Layer => camadaDuplicadaNoEditor(l, { novoId: id, paginaTemContrato: true })
  const manchete = texto('headline', { fontFamily: 'Bevan', fontSize: 100 }, 'Costela', { position: { x: 92, y: 300 }, metadata: { compositor: { papel: 'headline' } } })
  const servico = (id: string, content: string, y: number, compositor: Record<string, unknown>) =>
    texto(id, { fontFamily: 'Barlow', fontSize: 30 }, content, { position: { x: 160, y }, metadata: { groupId: 'g', compositor: { papel: 'servico', ...compositor } } })

  // O roteiro da pré-revisão: duplicar → editar a cópia → salvar → mover a cópia para CIMA da original → salvar.
  const roteiro = (nome: string, gravado: CopyAutoral, camadas: Layer[], alvoId: string) => {
    expect(copyEfetivaDasCamadas(gravado, camadas, { superficie: 'editor' }).mudancas, nome).toEqual([])
    const alvo = camadas.find((l) => l.id === alvoId)!
    const copia = { ...duplicarNoEditor(alvo, 'uuid-copia'), content: 'Texto novo da equipe' } as Layer
    const passo1 = [...camadas, copia]
    const rev1 = revisaoDaPaginaComCamadas(gravado, passo1, equipe)
    expect(rev1.estado, `${nome}: editar a cópia`).toBe('registrada')
    expect(rev1.blocos, `${nome}: editar a cópia`).toEqual([idDeExtra('uuid-copia')])
    expect(linhas(rev1.copy!), `${nome}: editar a cópia`).toEqual([...linhas(gravado), [idDeExtra('uuid-copia'), 'livre', ['Texto novo da equipe']]])
    const acima = passo1.map((l) => (l.id === 'uuid-copia' ? { ...l, position: { ...l.position, y: 10 } } : l)) as Layer[]
    const rev2 = revisaoDaPaginaComCamadas(rev1.copy!, acima, equipe)
    expect(rev2.estado, `${nome}: mover a cópia para cima`).toBe('sem-mudanca')
  }

  it('C9-02: o extra livre `nota` (identidade na metadata) duplicado e movido para cima — só nasce o bloco da cópia; `nota` não muda e não há revisão no movimento', () => {
    const gravado = contrato([
      { id: 'h', funcao: 'headline', ordem: 0, linhas: ['Costela'] },
      { id: 'nota', funcao: 'livre', ordem: 1, linhas: ['Somente no salão'], estilo: { herdaDe: 'apoio' } },
    ])
    const nota = texto('nota', { fontFamily: 'Barlow', fontSize: 40 }, 'Somente no salão', { position: { x: 92, y: 700 }, metadata: { groupId: 'g', compositor: { extra: { id: 'nota', funcao: 'livre', herdaDe: 'apoio', grupoVisual: 'principal' } } } })
    roteiro('extra', gravado, [manchete, nota], 'nota')
  })

  it('C9-02: a parte MARCADA do serviço repartido (`linhasDoBloco`) duplicada e movida para cima — `svc` continua com as duas linhas', () => {
    const gravado = contrato([{ id: 'h', funcao: 'headline', ordem: 0, linhas: ['Costela'] }, { id: 'svc', funcao: 'servico', ordem: 1, linhas: [HORARIO, ENDERECO] }])
    roteiro('parte marcada', gravado, [manchete, servico('servico', HORARIO, 1200, { linhasDoBloco: [0] }), servico('servico-2', ENDERECO, 1650, { linhasDoBloco: [1] })], 'servico-2')
  })

  it('C9-02: a manchete de UM texto (só o papel) duplicada e movida para cima — `h` não muda; a cópia é texto solto, não uma segunda manchete', () => {
    roteiro('só papel', contrato([{ id: 'h', funcao: 'headline', ordem: 0, linhas: ['Costela'] }]), [manchete], 'headline')
  })

  it('C9-02: a parte com a marca `parte` (a página foi duplicada antes) duplicada e movida para cima — `svc` continua com as duas linhas', () => {
    const gravado = contrato([{ id: 'h', funcao: 'headline', ordem: 0, linhas: ['Costela'] }, { id: 'svc', funcao: 'servico', ordem: 1, linhas: [HORARIO, ENDERECO] }])
    roteiro('parte legada', gravado, [manchete, servico('uuid-s1', HORARIO, 1200, { parte: 1 }), servico('uuid-s2', ENDERECO, 1650, { parte: 2 })], 'uuid-s2')
  })

  it('C9-02: o livre `nota` ligado pela marca `bloco` (a página foi duplicada antes) duplicado e movido para cima — `nota` não muda', () => {
    const gravado = contrato([{ id: 'h', funcao: 'headline', ordem: 0, linhas: ['Costela'] }, { id: 'nota', funcao: 'livre', ordem: 1, linhas: ['vale hoje'] }])
    const nota = texto('uuid-n', { fontFamily: 'Barlow', fontSize: 40 }, 'vale hoje', { name: 'Nota da casa', position: { x: 92, y: 700 }, metadata: { compositor: { bloco: 'nota' } } })
    roteiro('bloco', gravado, [manchete, nota], 'uuid-n')
  })

  it('C9-02/C9-11: `semIdentidadeAutoral` tira a marca do compositor INTEIRA (regra da main, PR3-R14-01); só o papel volta, e só na página SEM contrato; o resto da metadata fica', () => {
    const cheia = texto('x', {}, 'a', { metadata: { groupId: 'g1', compositor: { papel: 'cta', extra: { id: 'x' }, bloco: 'x', parte: 2, linhasDoBloco: [1], prefixo: '→ ', encaixe: 12 } } })
    // ANTES (PR 9): as marcas saíam chave a chave e `prefixo`/`encaixe` FICAVAM na cópia. DEPOIS (main, alinhado no
    // rebase de 21/09/2026): a marca sai inteira — com `prefixo: '→ '` a cópia do CTA faria `linhasDaCamada` descontar
    // da leitura uma seta que agora é TEXTO DO AUTOR, a transformação fictícia que o PR5-12 fechou.
    expect(semIdentidadeAutoral(cheia, { paginaTemContrato: true }).metadata).toEqual({ groupId: 'g1' })
    expect(semIdentidadeAutoral(cheia, { paginaTemContrato: false }).metadata).toEqual({ groupId: 'g1', compositor: { papel: 'cta' } })
    expect(cheia.metadata?.compositor).toMatchObject({ papel: 'cta', extra: { id: 'x' } })
    const semNada = texto('y', {}, 'b', { metadata: { groupId: 'g2' } })
    expect(semIdentidadeAutoral(semNada, { paginaTemContrato: true })).toBe(semNada)
    const soPapel = texto('z', {}, 'c', { metadata: { compositor: { papel: 'servico', linhasDoBloco: [1] } } })
    expect(semIdentidadeAutoral(soPapel, { paginaTemContrato: false }).metadata).toEqual({ compositor: { papel: 'servico' } })
  })

  it('C9-11: `paginaTemContrato` lê a resposta crua da rota (`copyAutoral`) e a página do contexto (`temCopyAutoral`)', () => {
    expect([paginaTemContrato(null), paginaTemContrato({}), paginaTemContrato({ copyAutoral: null }), paginaTemContrato({ temCopyAutoral: false })]).toEqual([false, false, false, false])
    expect([paginaTemContrato({ copyAutoral: { versao: 'x' } }), paginaTemContrato({ temCopyAutoral: true })]).toEqual([true, true])
  })

  it('C9-11: colar (`camadasColadasNoEditor`) faz a mesma limpeza que duplicar, com clone profundo, id novo por item e a cascata de 24px', () => {
    const origem = [
      texto('a', {}, 'um', { position: { x: 10, y: 20 }, metadata: { groupId: 'g', compositor: { papel: 'servico', extra: { id: 'a' }, linhasDoBloco: [0] } } }),
      texto('b', {}, 'dois', { position: { x: 10, y: 80 }, metadata: { compositor: { papel: 'apoio', parte: 2 } } }),
    ]
    let n = 0
    const comContrato = camadasColadasNoEditor(origem, { novoId: () => `c${++n}`, paginaTemContrato: true })
    expect(comContrato.map((l) => [l.id, l.name, l.position, l.order, l.metadata])).toEqual([
      // ANTES: sobrava `compositor: {}`; DEPOIS: a chave sai inteira, como na `camadaClonada` da main.
      ['c1', 'a Copy', { x: 34, y: 44 }, 0, { groupId: 'g' }],
      ['c2', 'b Copy', { x: 46, y: 116 }, 0, {}],
    ])
    const semContrato = camadasColadasNoEditor(origem, { novoId: () => `d${++n}`, paginaTemContrato: false })
    expect(semContrato.map((l) => l.metadata)).toEqual([{ groupId: 'g', compositor: { papel: 'servico' } }, { compositor: { papel: 'apoio' } }])
    expect(origem[0].metadata?.compositor).toMatchObject({ extra: { id: 'a' } })
    expect(comContrato[0].style).not.toBe(origem[0].style)
  })

  it('C9-11: na página SEM contrato (assinatura), duplicar o texto de serviço MANTÉM o papel — o arranjo do grupo segue com dois textos de serviço (horário e endereço)', () => {
    const imagem = (id: string, y: number): Layer => ({ id, name: id, type: 'image', visible: true, locked: false, order: 0, rotation: 0, fileUrl: `https://exemplo.com/${id}.png`, position: { x: 120, y }, size: { width: 26, height: 26 }, metadata: { groupId: 'g-rodape' } }) as Layer
    const horario = texto('t-servico', { fontFamily: 'Barlow', fontSize: 30, color: '#FFFFFF', lineHeight: 1.2, textAlign: 'left' }, 'Seg a sex, das 11h às 15h', { name: 'Combinação - Serviço', position: { x: 160, y: 1580 }, size: { width: 700, height: 40 }, metadata: { groupId: 'g-rodape', compositor: { papel: 'servico' } } })
    const assinaturaSemContrato = { id: 'p-assinatura', copyAutoral: null }
    const copia = { ...camadaDuplicadaNoEditor(horario, { novoId: 't-endereco', paginaTemContrato: paginaTemContrato(assinaturaSemContrato) }), content: 'Rua das Flores, 12', position: { x: 160, y: 1650 } } as Layer
    expect(copia.name).toBe('Combinação - Serviço Copy')
    const arranjos = [...arranjosDaPagina({ pageId: 'p-assinatura', nome: 'Assinatura', camadas: [horario, imagem('relogio', 1584), copia, imagem('pin', 1652)], medir: medirFalso }).values()]
    const doRodape = arranjos.find((ar) => ar.textos.some((t) => t.papel === 'servico'))!
    expect(doRodape.textos.filter((t) => t.papel === 'servico')).toHaveLength(2)
    // Controle: a mesma duplicação numa página COM contrato tira o papel, e o arranjo perde a cópia.
    const copiaComContrato = { ...camadaDuplicadaNoEditor(horario, { novoId: 't-endereco', paginaTemContrato: true }), content: 'Rua das Flores, 12', position: { x: 160, y: 1650 } } as Layer
    const arranjosComContrato = [...arranjosDaPagina({ pageId: 'p-peca', nome: 'Peça', camadas: [horario, imagem('relogio', 1584), copiaComContrato, imagem('pin', 1652)], medir: medirFalso }).values()]
    expect(arranjosComContrato.find((ar) => ar.textos.some((t) => t.papel === 'servico'))!.textos.filter((t) => t.papel === 'servico')).toHaveLength(1)
  })

  it('C9-11: os DOIS callbacks do editor (`duplicateLayer` e `pasteLayers`) chamam as funções puras com o contrato da página aberta — nenhum copia a camada inteira', () => {
    const fonte = readFileSync(new URL('../../../contexts/template-editor-context.tsx', import.meta.url), 'utf8')
    const corpo = (inicio: string, fim: string) => {
      const i = fonte.indexOf(inicio)
      expect(i, inicio).toBeGreaterThan(-1)
      const j = fonte.indexOf(fim, i + inicio.length)
      expect(j, fim).toBeGreaterThan(i)
      return fonte.slice(i, j)
    }
    const duplicar = corpo('const duplicateLayer = React.useCallback(', 'const removeLayer = React.useCallback(')
    expect(duplicar).toMatch(/camadaDuplicadaNoEditor\(source, \{ novoId: createId\(\), paginaTemContrato: temCopyAutoral \}\)/)
    expect(duplicar).not.toMatch(/\.\.\.source\b/)
    const colar = corpo('const pasteLayers = React.useCallback(', 'const undo = React.useCallback(')
    expect(colar).toMatch(/camadasColadasNoEditor\(clipboard, \{ novoId: createId, paginaTemContrato: temCopyAutoral \}\)/)
    expect(colar).not.toMatch(/\.\.\.cloned\b|structuredClone\(/)
    expect(fonte).toMatch(/const temCopyAutoral = paginaTemContrato\(multiPage\?\.currentPage \?\? null\)/)
    const contexto = readFileSync(new URL('../../../contexts/multi-page-context.tsx', import.meta.url), 'utf8')
    expect(contexto).toMatch(/temCopyAutoral: p\.copyAutoral !== undefined && p\.copyAutoral !== null/)
  })
})
