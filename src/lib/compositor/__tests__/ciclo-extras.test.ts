import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import { montarAssinatura } from '../assinatura'
import { resolverCamadasExtras } from '../camadas-extras'
import { copyDaPaginaPorIdentidade, medirDefasagem, precisaRefazer, specComACopyDaPagina } from '../defasagem'
import { entradaDePersistencia } from '../persistencia'
import { prepararBlocos } from '../preparar-blocos'
import { validarSpec, type SpecDePeca } from '../spec'
import { VERSAO_DO_CONTRATO, copyEfetivaDasCamadas, type CopyAutoral } from '@/lib/copy-autoral'
import { revisaoDaPaginaComCamadas } from '@/lib/copy-autoral/revisar-pagina'

/**
 * PR 10 de "Marca simples, copy melhor" — o CICLO da camada extra: criar,
 * editar, trocar a foto, re-renderizar, editar a copy e recompor preservam o
 * extra (id, função, herança, grupo visual, grupo de leitura, ordem e texto),
 * em imagem única e em slide de carrossel. Critério de pronto do plano: "uma
 * peça que precisa de horário funciona numa variante sem esse campo, e o texto
 * extra continua editável depois de trocar a foto".
 */

const FOTO_1 = 'https://x.public.blob.vercel-storage.com/drive-cache/foto-1-s1920.jpg'
const FOTO_2 = 'https://x.public.blob.vercel-storage.com/drive-cache/foto-2-s1920.jpg'
const ARTE = 'https://x.public.blob.vercel-storage.com/arte-rapida/8/pagina-1.png'

const medirFalso = (layer: Layer) => {
  const fontSize = Number(layer.style?.fontSize ?? 16)
  const linhas = (layer.content ?? '').split('\n')
  return { width: layer.size.width, height: linhas.length * fontSize * Number(layer.style?.lineHeight ?? 1.1), maxLineWidth: Math.max(...linhas.map((l) => l.length * fontSize * 0.55)), lineCount: linhas.length }
}
const texto = (id: string, style: Record<string, unknown>, content = 'x', extra: Partial<Layer> = {}): Layer => ({
  id, name: id, type: 'text', visible: true, locked: false, order: 0,
  position: { x: 92, y: 200 }, size: { width: 400, height: 80 }, content, style, ...extra,
})
const foto = (url: string, style: Record<string, unknown> = { objectFit: 'cover', cropPosition: 'center-middle' }): Layer =>
  ({ id: 'bg-foto', name: 'Foto de fundo', type: 'image', visible: true, locked: false, order: 0, position: { x: 0, y: 0 }, size: { width: 1080, height: 1920 }, fileUrl: url, style }) as Layer

// Variante SEM serviço (headline + apoio) e variante COM serviço.
const semServico = montarAssinatura({
  pagina: {
    id: 'p-sem-servico', name: 'Story sem serviço', width: 1080, height: 1920,
    layers: [
      texto('headline', { fontFamily: 'Bevan', fontSize: 100, color: '#FFFFFF', lineHeight: 1 }, 'Título', { metadata: { groupId: 'g1' } }),
      texto('apoio', { fontFamily: 'Barlow', fontSize: 40, color: '#FFEEDD', lineHeight: 1.2 }, 'Apoio', { position: { x: 92, y: 320 }, metadata: { groupId: 'g1' } }),
    ],
  },
  formatoDaPagina: 'story',
  numerosDoProjeto: null,
})
const comServico = montarAssinatura({
  pagina: {
    id: 'p-com-servico', name: 'Story com serviço', width: 1080, height: 1920,
    layers: [
      texto('headline', { fontFamily: 'Bevan', fontSize: 100, color: '#FFFFFF', lineHeight: 1 }, 'Título', { metadata: { groupId: 'g1' } }),
      texto('apoio', { fontFamily: 'Barlow', fontSize: 40, color: '#FFEEDD', lineHeight: 1.2 }, 'Apoio', { position: { x: 92, y: 320 }, metadata: { groupId: 'g1' } }),
      texto('servico', { fontFamily: 'Barlow', fontSize: 28, color: '#FFFFFF', lineHeight: 1.2 }, 'Serviço', { position: { x: 92, y: 1650 }, metadata: { groupId: 'g2' } }),
    ],
  },
  formatoDaPagina: 'story',
  numerosDoProjeto: null,
})

const comumDe = (assinatura: typeof semServico) => ({ assinatura, colunaUtil: 1080 - 2 * assinatura.numeros.geometria.story.margemH, escalaDoFormato: 1, mancha: '#000000', medir: medirFalso, familias: ['Bevan', 'Barlow'], combinacoesSalvas: [] })

/** As camadas como a página as guarda: a foto de fundo e os textos montados, empilhados de cima para baixo. */
function paginaComposta(spec: SpecDePeca, assinatura: typeof semServico, url = FOTO_1): Layer[] {
  const p = prepararBlocos({ ...comumDe(assinatura), spec })
  expect(p.faltam).toEqual([])
  return [foto(url), ...p.montados.map((b, i) => ({ ...b.layer, position: { x: 92, y: 300 + i * 160 } }))]
}
const editar = (camadas: Layer[], id: string, parcial: Partial<Layer>) => camadas.map((c) => (c.id === id ? { ...c, ...parcial } : c))
const extraDe = (camada: Layer | undefined) => (camada?.metadata as { compositor?: { extra?: Record<string, unknown>; papel?: string } } | undefined)?.compositor

describe('specComACopyDaPagina — a recomposição SEM contrato reconstrói a spec com os extras pela identidade', () => {
  const base = { projectId: 8, formato: 'story' as const, foto: { url: FOTO_1 } }
  const entrada = {
    ...base,
    blocos: [
      { papel: 'headline', linhas: ['Costela'] },
      { papel: 'apoio', linhas: ['no bafo'] },
      { papel: 'servico', linhas: ['Seg a sex, 11h às 15h'], herdaDe: 'apoio', id: 'hora', grupoVisual: 'rodape', grupoDeLeitura: 'agenda', ordem: 3 },
    ],
    camadasExtras: [{ id: 'nota', linhas: ['vale só', 'no almoço'], herdaDe: 'apoio', grupoVisual: 'principal', grupoDeLeitura: 'agenda', ordem: 2 }],
  }

  it('a peça que precisa de horário numa variante SEM serviço: editar o texto do extra, do livre e da manchete volta à spec com id, herança, grupos e ordem — e a spec continua compondo a mesma camada extra', () => {
    const v = validarSpec(entrada)
    expect(v.problemas).toEqual([])
    const camadas = editar(editar(editar(paginaComposta(v.spec!, semServico), 'hora', { content: 'Ter a dom, 18h às 23h' }), 'nota', { content: 'vale só\nno jantar' }), 'headline', { content: 'Costela assada' })

    const r = specComACopyDaPagina(v.spec!, camadas)
    expect(r.avisos).toEqual([])
    expect(r.spec.blocos!.find((b) => b.papel === 'servico')).toEqual({ papel: 'servico', linhas: ['Ter a dom, 18h às 23h'], herdaDe: 'apoio', id: 'hora', grupoVisual: 'rodape', grupoDeLeitura: 'agenda', ordem: 3 })
    // O apoio comum NÃO absorve o texto do extra que herda dele.
    expect(r.spec.blocos!.find((b) => b.papel === 'apoio')).toEqual({ papel: 'apoio', linhas: ['no bafo'] })
    expect(r.spec.blocos!.find((b) => b.papel === 'headline')!.linhas).toEqual(['Costela assada'])
    expect(r.spec.camadasExtras).toEqual([{ id: 'nota', linhas: ['vale só', 'no jantar'], herdaDe: 'apoio', grupoVisual: 'principal', grupoDeLeitura: 'agenda', ordem: 2 }])

    const v2 = validarSpec(JSON.parse(JSON.stringify(r.spec)))
    expect(v2.problemas).toEqual([])
    const resolvidos = resolverCamadasExtras({ blocos: v2.spec!.blocos, camadasExtras: v2.spec!.camadasExtras }, { papeis: semServico.papeis })
    expect(resolvidos.faltam).toEqual([])
    expect(resolvidos.blocos.filter((b) => b.extra).map((b) => b.extra!.id).sort()).toEqual(['hora', 'nota'])
    // A recomposição monta de novo as MESMAS camadas extras, com a identidade declarada.
    const recomposta = paginaComposta(v2.spec!, semServico)
    expect(extraDe(recomposta.find((c) => c.id === 'hora'))).toMatchObject({ papel: 'servico', extra: { id: 'hora', funcao: 'servico', herdaDe: 'apoio', grupoVisual: 'rodape', grupoDeLeitura: 'agenda', ordem: 3 } })
    expect(extraDe(recomposta.find((c) => c.id === 'nota'))).toMatchObject({ extra: { id: 'nota', funcao: 'livre', herdaDe: 'apoio', grupoVisual: 'principal' } })
    expect(recomposta.find((c) => c.id === 'hora')!.content).toBe('Ter a dom, 18h às 23h')
  })

  it('serviço COMUM e serviço EXTRA na mesma peça (variante com serviço): cada um volta com o próprio texto — o comum não junta o do extra, e a spec não vira "papel repetido"', () => {
    const v = validarSpec({
      ...base,
      blocos: [
        { papel: 'headline', linhas: ['Costela'] },
        { papel: 'servico', linhas: ['Seg a sex, 11h às 15h'] },
        { papel: 'servico', linhas: ['Sáb e dom, 12h às 16h'], herdaDe: 'apoio', id: 'hora-fds', grupoVisual: 'topo' },
      ],
    })
    expect(v.problemas).toEqual([])
    const camadas = editar(paginaComposta(v.spec!, comServico), 'hora-fds', { content: 'Sáb e dom, 12h às 17h' })
    const r = specComACopyDaPagina(v.spec!, camadas)
    const servicos = r.spec.blocos!.filter((b) => b.papel === 'servico')
    expect(servicos).toEqual([
      { papel: 'servico', linhas: ['Seg a sex, 11h às 15h'] },
      { papel: 'servico', linhas: ['Sáb e dom, 12h às 17h'], herdaDe: 'apoio', id: 'hora-fds', grupoVisual: 'topo' },
    ])
    expect(validarSpec(JSON.parse(JSON.stringify(r.spec))).problemas).toEqual([])
  })

  it('extra apagado da página sai da spec COM aviso; respiro (linha vazia) do extra é conteúdo e volta', () => {
    const v = validarSpec({ ...base, blocos: [{ papel: 'headline', linhas: ['Costela'] }, { papel: 'servico', linhas: ['11h às 15h'], herdaDe: 'apoio', id: 'hora' }], camadasExtras: [{ id: 'nota', linhas: ['vale só'], herdaDe: 'apoio' }] })
    expect(v.problemas).toEqual([])
    const camadas = editar(paginaComposta(v.spec!, semServico).filter((c) => c.id !== 'hora'), 'nota', { content: 'vale só\n\nno almoço' })
    const r = specComACopyDaPagina(v.spec!, camadas)
    expect(r.avisos.join(' ')).toMatch(/camada extra "hora"/)
    expect(r.spec.blocos!.some((b) => b.id === 'hora')).toBe(false)
    expect(r.spec.camadasExtras![0].linhas).toEqual(['vale só', '', 'no almoço'])
    expect(validarSpec(JSON.parse(JSON.stringify(r.spec))).problemas).toEqual([])
  })

  it('a leitura por identidade separa as camadas extras do papel da função delas', () => {
    const v = validarSpec(entrada)
    const lida = copyDaPaginaPorIdentidade(paginaComposta(v.spec!, semServico))!
    expect(lida.papeis).toEqual({ headline: 'Costela', apoio: 'no bafo' })
    expect(lida.extras).toEqual({ hora: 'Seg a sex, 11h às 15h', nota: 'vale só\nno almoço' })
    expect(copyDaPaginaPorIdentidade('{ilegível')).toBeNull()
  })
})

describe('medirDefasagem — trocar a foto é defasagem; o enquadramento mexido à mão é ajuste manual', () => {
  const v = validarSpec({ projectId: 8, formato: 'story', foto: { url: FOTO_1 }, blocos: [{ papel: 'headline', linhas: ['Costela'] }, { papel: 'servico', linhas: ['11h às 15h'], herdaDe: 'apoio', id: 'hora' }], camadasExtras: [{ id: 'nota', linhas: ['vale só'], herdaDe: 'apoio' }] })
  const snapshot = paginaComposta(v.spec!, semServico)
  const slide = { postId: 'carrossel', indice: 1, total: 2, urlAntiga: ARTE }

  it('a foto trocada no editor (mesmo texto, mesma geometria) torna a arte defasada e libera a recomposição — o slide não fica com a foto antiga', () => {
    const pagina = editar(snapshot, 'bg-foto', { fileUrl: FOTO_2 })
    const d = medirDefasagem(pagina, snapshot)
    expect(d).toMatchObject({ ilegivel: false, defasada: true, fotoTrocada: true, papeis: [], soTexto: true, mexidoNaMao: [] })
    expect(precisaRefazer(d, [slide], ARTE)).toBe(true)
    // A recomposição refaz com a foto da PÁGINA, e o extra continua com a identidade e o texto.
    const r = specComACopyDaPagina(v.spec!, pagina)
    expect(r.spec.foto).toEqual({ url: FOTO_2 })
    expect(r.spec.blocos!.find((b) => b.id === 'hora')).toMatchObject({ herdaDe: 'apoio', linhas: ['11h às 15h'] })
    expect(r.spec.camadasExtras).toEqual([{ id: 'nota', linhas: ['vale só'], herdaDe: 'apoio' }])
  })

  it('o corte da foto ajustado à mão é ajuste manual (re-render como está, nunca recompor por cima)', () => {
    const pagina = editar(snapshot, 'bg-foto', { style: { objectFit: 'cover', cropPosition: 'center-top' } })
    const d = medirDefasagem(pagina, snapshot)
    expect(d.soTexto).toBe(false)
    expect(d.mexidoNaMao.join(' ')).toMatch(/enquadramento da imagem "bg-foto"/)
    expect(precisaRefazer(d, [slide], ARTE)).toBe(true)
  })

  it('página igual — mesma foto, mesmo corte — continua em dia', () => {
    const d = medirDefasagem(snapshot, snapshot)
    expect(d).toMatchObject({ defasada: false, fotoTrocada: false, soTexto: true })
    expect(precisaRefazer(d, [slide], ARTE)).toBe(false)
  })

  it('texto do extra editado é só texto (recompõe); o extra MOVIDO à mão é ajuste manual (re-renderiza)', () => {
    const editado = medirDefasagem(editar(snapshot, 'hora', { content: '18h às 23h' }), snapshot)
    expect(editado).toMatchObject({ defasada: true, fotoTrocada: false, papeis: ['hora'], soTexto: true })
    const movido = medirDefasagem(editar(snapshot, 'hora', { position: { x: 92, y: 40 } }), snapshot)
    expect(movido.soTexto).toBe(false)
    expect(movido.mexidoNaMao.join(' ')).toMatch(/"hora" foi movida/)
  })
})

describe('o ciclo COM contrato — editar, trocar a foto e recompor preservam id e texto do extra, sem revisão fictícia', () => {
  const origem = { autor: 'claude' as const, superficie: 'chat', em: '2026-09-12T12:00:00.000Z' }
  const contrato: CopyAutoral = {
    versao: VERSAO_DO_CONTRATO, origem, revisoes: [],
    blocos: [
      { id: 'h', funcao: 'headline', ordem: 0, linhas: ['Costela'] },
      { id: 'hora', funcao: 'servico', ordem: 1, linhas: ['Seg a sex, 11h às 15h'], estilo: { herdaDe: 'apoio', grupoVisual: 'rodape' } },
      { id: 'nota', funcao: 'livre', ordem: 2, linhas: ['vale só no almoço'], estilo: { herdaDe: 'apoio' } },
    ],
  }
  const persistir = (spec: SpecDePeca, layers: Layer[]) =>
    entradaDePersistencia({ spec, opcoes: {}, projeto: { id: 8, name: 'Lagosta', userId: 'u' }, pasta: { id: 1, name: 'p' }, nome: 'n', ordem: 0, canvas: { width: 1080, height: 1920 }, layers, fundo: '#000', diagnostico: {}, fotoUrl: FOTO_1 })
  const textos = (copy: CopyAutoral) => Object.fromEntries(copy.blocos.map((b) => [b.id, b.linhas]))

  it('criar → editar o extra no editor → trocar a foto → recompor pelo contrato: cada passo mantém o extra na página, editável, com o mesmo id e o texto certo', () => {
    const v = validarSpec({ projectId: 8, formato: 'story', foto: { url: FOTO_1 }, copyAutoral: contrato })
    expect(v.problemas).toEqual([])
    const camadas = paginaComposta(v.spec!, semServico)
    const efetiva = persistir(v.spec!, camadas).copyAutoral as CopyAutoral
    expect(textos(efetiva)).toEqual({ h: ['Costela'], hora: ['Seg a sex, 11h às 15h'], nota: ['vale só no almoço'] })
    expect(efetiva.revisoes).toEqual([])

    // Editar: a revisão é da EQUIPE e só no bloco do extra.
    const editadas = editar(camadas, 'hora', { content: 'Ter a dom, 18h às 23h' })
    const rev = revisaoDaPaginaComCamadas(efetiva, editadas, { autor: 'equipe', motivo: 'edição no editor', superficie: 'editor' })
    expect(rev.estado).toBe('registrada')
    expect(rev.blocos).toEqual(['hora'])
    expect(rev.copy!.revisoes.map((r) => [r.autor, r.blocos])).toEqual([['equipe', ['hora']]])

    // Trocar a foto: nenhuma revisão (a copy não mudou), e a leitura continua casando cada camada pelo id.
    const comFotoNova = editar(editadas, 'bg-foto', { fileUrl: FOTO_2 })
    expect(revisaoDaPaginaComCamadas(rev.copy, comFotoNova, { autor: 'equipe', motivo: 'autosave', superficie: 'editor' }).estado).toBe('sem-mudanca')
    const lidaDepoisDaFoto = copyEfetivaDasCamadas(rev.copy!, comFotoNova, { superficie: 'editor' })
    expect(lidaDepoisDaFoto.mudancas).toEqual([])
    expect(lidaDepoisDaFoto.efetiva.blocos.some((b) => b.id.startsWith('extra-'))).toBe(false)
    const hora = comFotoNova.find((c) => c.id === 'hora')!
    expect(hora.type === 'text' || hora.type === 'rich-text').toBe(true)
    expect(hora.visible).not.toBe(false)
    expect(hora.locked).not.toBe(true)
    expect(extraDe(hora)).toMatchObject({ papel: 'servico', extra: { id: 'hora', funcao: 'servico', herdaDe: 'apoio', grupoVisual: 'rodape' } })

    // Recompor: a spec sai do contrato da página (os extras são derivados dele) com a foto da página; as camadas
    // recompostas mostram exatamente o contrato — nada vira revisão do sistema.
    const specRecomposta = validarSpec({ ...specComACopyDaPagina(v.spec!, comFotoNova).spec, blocos: undefined, camadasExtras: undefined, copyAutoral: rev.copy })
    expect(specRecomposta.problemas).toEqual([])
    expect(specRecomposta.spec!.foto).toEqual({ url: FOTO_2 })
    expect(specRecomposta.spec!.camadasExtras).toEqual([{ id: 'nota', linhas: ['vale só no almoço'], herdaDe: 'apoio', ordem: 2 }])
    const recompostas = paginaComposta(specRecomposta.spec!, semServico, FOTO_2)
    const depois = copyEfetivaDasCamadas(rev.copy!, recompostas, { superficie: 'recomposicao' })
    expect(depois.mudancas).toEqual([])
    expect(textos(depois.efetiva)).toEqual({ h: ['Costela'], hora: ['Ter a dom, 18h às 23h'], nota: ['vale só no almoço'] })
    expect(extraDe(recompostas.find((c) => c.id === 'nota'))).toMatchObject({ extra: { id: 'nota', funcao: 'livre', herdaDe: 'apoio' } })
  })
})
