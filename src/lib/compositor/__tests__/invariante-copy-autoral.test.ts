import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import { montarAssinatura } from '../assinatura'
import { papelDaCamada } from '../defasagem'
import { entradaDePersistencia } from '../persistencia'
import { prepararBlocos } from '../preparar-blocos'
import { validarSpec } from '../spec'
import { specDaRecomposicao } from '../spec-da-recomposicao'
import { VERSAO_DO_CONTRATO, copyEfetivaDasCamadas, duplicarCamadasDaPagina, validarCopyAutoral, type BlocoAutoral, type CopyAutoral } from '@/lib/copy-autoral'

/**
 * INVARIANTE da copy autoral nas camadas (pedido depois da 6ª rodada de revisão
 * do PR 9, 12/09/2026): em vez de escolher cenários à mão, ENUMERA contratos ×
 * arranjos da assinatura × operações técnicas e confere, para todo caso que a
 * spec aceita e a composição monta, que a copy sobrevive à ida e volta:
 *
 *  - a copy efetiva persistida tem os MESMOS blocos do contrato (ids e linhas,
 *    na ordem), sem bloco `extra-*`;
 *  - nenhuma operação (releitura) e duplicar a página não criam revisão;
 *  - ocultar ou excluir UM texto muda só o bloco dono dele, e o dono perde
 *    exatamente as linhas daquele texto;
 *  - ocultar e reexibir devolve o contrato persistido;
 *  - a spec derivada revalida, a da recomposição valida, e a recomposição
 *    montada de novo se lê sem mudança.
 *
 * Determinístico (produto enumerado, ids em rodízio por aritmética), limitado a
 * poucos segundos. Com `INVARIANTE_RELATORIO=<arquivo>` grava a lista de casos
 * que falharam — é o que permite dizer quais caíam ANTES de uma correção.
 */

const medirFalso = (layer: Layer) => {
  const fontSize = Number(layer.style?.fontSize ?? 16)
  const linhas = (layer.content ?? '').split('\n')
  return { width: layer.size.width, height: linhas.length * fontSize * Number(layer.style?.lineHeight ?? 1.1), maxLineWidth: Math.max(...linhas.map((l) => l.length * fontSize * 0.55)), lineCount: linhas.length }
}
const texto = (id: string, style: Record<string, unknown>, content: string, extra: Partial<Layer> = {}): Layer => ({
  id, name: id, type: 'text', visible: true, locked: false, order: 0,
  position: { x: 92, y: 200 }, size: { width: 400, height: 80 }, content, style, ...extra,
})
const img = (id: string, x: number, y: number, grupo: string): Layer =>
  ({ id, name: id, type: 'image', visible: true, locked: false, order: 0, rotation: 0, fileUrl: `https://exemplo.com/${id}.png`, position: { x, y }, size: { width: 26, height: 26 }, metadata: { groupId: grupo } }) as Layer

const MANCHETE = { fontFamily: 'Bevan', fontSize: 100, color: '#FFFFFF', lineHeight: 1 }
const VOZ2 = { fontFamily: 'Bevan', fontSize: 70, color: '#F4301A', lineHeight: 1 }
const APOIO = { fontFamily: 'Barlow', fontSize: 40, color: '#FFEEDD', lineHeight: 1.2 }
const HORARIO = { fontFamily: 'Barlow', fontSize: 30, color: '#FFFFFF', lineHeight: 1.2, textAlign: 'left' }
const ENDERECO = { fontFamily: 'Barlow', fontSize: 24, color: '#DDDDDD', lineHeight: 1.2, textAlign: 'left' }

// Os arranjos das assinaturas dos testes existentes — o que reparte partes entre textos e grupos.
const PAGINAS: Record<string, Layer[]> = {
  // R21/R23: um texto por papel.
  simples: [
    texto('headline', MANCHETE, 'Título', { position: { x: 92, y: 300 }, metadata: { groupId: 'g-topo' } }),
    texto('apoio', APOIO, 'Apoio', { position: { x: 92, y: 420 }, metadata: { groupId: 'g-topo' } }),
    texto('servico', HORARIO, 'Seg a sex, das 11h às 15h', { position: { x: 160, y: 1650 }, size: { width: 700, height: 40 }, metadata: { groupId: 'g-rodape' } }),
  ],
  // R18: horário num grupo, endereço noutro.
  'servico-dois-grupos': [
    texto('headline', MANCHETE, 'Título', { position: { x: 92, y: 300 }, metadata: { groupId: 'g-topo' } }),
    texto('apoio', APOIO, 'Apoio', { position: { x: 92, y: 420 }, metadata: { groupId: 'g-topo' } }),
    texto('servico', HORARIO, 'Seg a sex, das 11h às 15h', { position: { x: 160, y: 1200 }, size: { width: 700, height: 40 }, metadata: { groupId: 'g-meio' } }),
    img('relogio', 120, 1204, 'g-meio'),
    texto('info', ENDERECO, 'Rua das Flores, 12 — Centro', { id: 'servico-endereco', position: { x: 160, y: 1650 }, size: { width: 700, height: 40 }, metadata: { groupId: 'g-rodape' } }),
    img('pin', 122, 1652, 'g-rodape'),
  ],
  // R27: a segunda voz em DOIS textos do mesmo grupo.
  'voz2-dois-textos': [
    texto('headline', MANCHETE, 'Título', { position: { x: 92, y: 300 }, metadata: { groupId: 'g-topo' } }),
    texto('headline2', VOZ2, 'Voz', { position: { x: 92, y: 410 }, metadata: { groupId: 'g-topo' } }),
    texto('headline2', VOZ2, 'Voz', { id: 'headline2-b', position: { x: 92, y: 500 }, metadata: { groupId: 'g-topo' } }),
    texto('apoio', APOIO, 'Apoio', { position: { x: 92, y: 620 }, metadata: { groupId: 'g-topo' } }),
    texto('servico', HORARIO, 'Seg a sex, das 11h às 15h', { position: { x: 160, y: 1650 }, size: { width: 700, height: 40 }, metadata: { groupId: 'g-rodape' } }),
  ],
  // R20: horário e endereço no MESMO grupo.
  'servico-mesmo-grupo': [
    texto('headline', MANCHETE, 'Título', { position: { x: 92, y: 300 }, metadata: { groupId: 'g-topo' } }),
    texto('apoio', APOIO, 'Apoio', { position: { x: 92, y: 420 }, metadata: { groupId: 'g-topo' } }),
    texto('servico', HORARIO, 'Seg a sex, das 11h às 15h', { position: { x: 160, y: 1580 }, size: { width: 700, height: 40 }, metadata: { groupId: 'g-rodape' } }),
    img('relogio', 120, 1584, 'g-rodape'),
    texto('info', ENDERECO, 'Rua das Flores, 12 — Centro', { id: 'servico-endereco', position: { x: 160, y: 1650 }, size: { width: 700, height: 40 }, metadata: { groupId: 'g-rodape' } }),
    img('pin', 122, 1652, 'g-rodape'),
  ],
}
const NOMES_DAS_PAGINAS = Object.keys(PAGINAS)
const COMUNS = Object.fromEntries(
  NOMES_DAS_PAGINAS.map((nome) => {
    const a = montarAssinatura({ pagina: { id: `p-${nome}`, width: 1080, height: 1920, layers: PAGINAS[nome] }, formatoDaPagina: 'story', numerosDoProjeto: null })
    a.camadasDaPagina = PAGINAS[nome]
    return [nome, { assinatura: a, colunaUtil: 1080 - 2 * a.numeros.geometria.story.margemH, escalaDoFormato: 1, mancha: '#000000', medir: medirFalso, familias: ['Bevan', 'Barlow'], combinacoesSalvas: [] }]
  }),
)

const LINHAS_DA_MANCHETE = ['Costela', 'na brasa', 'hoje']
const MANCHETES: Array<[number, number[]]> = [[1, []], [1, [0]], [2, []], [2, [1]], [2, [0, 1]], [3, []], [3, [2]], [3, [1, 2]]]
const LINHAS_DE_SERVICO = ['Ter a dom, das 18h às 23h', 'Av. Beira Mar, 100', 'Reserve pelo direct']
// Ids autorais tirados do namespace que colide: papel nu, `<papel>-N`, `extra-<papel>`, `headline2`.
const IDS = ['nota', 'servico', 'servico-2', 'extra-servico', 'headline2', 'apoio', 'extra-headline2', 'headline', 'extra-apoio']
type Extra = { funcao: 'servico' | 'apoio'; herdaDe: 'apoio' | 'servico' | 'headline'; linhas: string[] }
const EXTRAS: Extra[][] = [
  [],
  [{ funcao: 'servico', herdaDe: 'apoio', linhas: ['Delivery até 22h'] }],
  [{ funcao: 'apoio', herdaDe: 'servico', linhas: ['Só hoje'] }, { funcao: 'servico', herdaDe: 'headline', linhas: ['Retirada no balcão'] }],
]
type Livre = { herdaDe?: 'apoio' | 'headline'; linhas: string[] }
const LIVRES: Array<Livre | null> = [null, { herdaDe: 'apoio', linhas: ['Somente no salão'] }, { herdaDe: 'headline', linhas: [] }, { linhas: [] }, { linhas: ['Sem herança'] }]

interface Caso {
  rotulo: string
  pagina: string
  contrato: CopyAutoral
}

function montarContrato(i: number, manchete: [number, number[]], servico: number, extras: Extra[], livre: Livre | null, idDoLivre: string): CopyAutoral {
  const [n, voz2] = manchete
  const blocos: Array<Omit<BlocoAutoral, 'ordem'>> = [
    { id: i % 2 === 0 ? 'h' : 'headline', funcao: 'headline', linhas: LINHAS_DA_MANCHETE.slice(0, n), ...(voz2.length ? { estilo: { linhasNaVoz2: voz2 } } : {}) },
  ]
  if (servico > 0) blocos.push({ id: i % 3 === 0 ? 'servico' : 'svc', funcao: 'servico', linhas: LINHAS_DE_SERVICO.slice(0, servico) })
  extras.forEach((e, k) => blocos.push({ id: IDS[(i + 4 * k + 1) % IDS.length], funcao: e.funcao, linhas: [...e.linhas], estilo: { herdaDe: e.herdaDe } }))
  if (livre) blocos.push({ id: idDoLivre, funcao: 'livre', linhas: [...livre.linhas], ...(livre.herdaDe ? { estilo: { herdaDe: livre.herdaDe } } : {}) })
  // Em rodízio, o último bloco vem PRIMEIRO na ordem autoral (o caso do R21).
  if (i % 5 === 0 && blocos.length > 1) blocos.unshift(blocos.pop()!)
  return { versao: VERSAO_DO_CONTRATO, origem: { autor: 'claude', superficie: 'chat', em: '2026-09-12T12:00:00.000Z' }, revisoes: [], blocos: blocos.map((b, ordem) => ({ ...b, ordem }) as BlocoAutoral) }
}

function enumerarCasos(): Caso[] {
  const casos: Caso[] = []
  let i = 0
  // (A) as FORMAS: manchete × serviço × extras × arranjo, com o livre em rodízio.
  for (const [m, manchete] of MANCHETES.entries())
    for (let servico = 0; servico <= 3; servico++)
      for (const [e, extras] of EXTRAS.entries())
        for (const pagina of NOMES_DAS_PAGINAS) {
          const livre = LIVRES[i % LIVRES.length]
          const idDoLivre = IDS[(i * 7 + 5) % IDS.length]
          casos.push({ rotulo: `A#${i} ${pagina} manchete=${m} servico=${servico} extras=${e} livre=${LIVRES.indexOf(livre)}:${idDoLivre}`, pagina, contrato: montarContrato(i, manchete, servico, extras, livre, idDoLivre) })
          i++
        }
  // (B) o NAMESPACE: arranjo × serviço × livre (com e sem herança, vazio ou não) × id autoral que colide.
  for (const pagina of NOMES_DAS_PAGINAS)
    for (let servico = 1; servico <= 3; servico++)
      for (const livre of LIVRES.slice(1, 4))
        for (const idDoLivre of IDS) {
          const manchete = MANCHETES[i % MANCHETES.length]
          const extras = EXTRAS[i % EXTRAS.length]
          casos.push({ rotulo: `B#${i} ${pagina} servico=${servico} livre=${LIVRES.indexOf(livre)}:${idDoLivre} manchete=${MANCHETES.indexOf(manchete)} extras=${EXTRAS.indexOf(extras)}`, pagina, contrato: montarContrato(i, manchete, servico, extras, livre, idDoLivre) })
          i++
        }
  return casos
}

const ehTexto = (l: Layer) => l.type === 'text' || l.type === 'rich-text'
const meta = (l: Layer) => (l.metadata?.compositor ?? {}) as { extra?: { id?: string }; linhasDoBloco?: number[] }
const forma = (c: CopyAutoral) => c.blocos.map((b) => [b.id, b.linhas])

/** O bloco dono de um texto da peça, e as posições das linhas dele no bloco. */
function donoDoTexto(l: Layer, contrato: CopyAutoral, camadas: Layer[]): { id: string; posicoes: number[] } | null {
  const linhas = String(l.content ?? '').split('\n')
  const extraId = meta(l).extra?.id
  if (extraId) return { id: extraId, posicoes: linhas.map((_, k) => k) }
  const papel = papelDaCamada(l)
  const funcao = papel === 'headline2' ? 'headline' : papel
  const comuns = contrato.blocos.filter((b) => b.funcao === funcao && !b.estilo?.herdaDe)
  if (!papel || comuns.length !== 1) return null
  const dono = comuns[0]
  const marca = meta(l).linhasDoBloco
  if (marca) return { id: dono.id, posicoes: marca }
  if (papel === 'headline') return { id: dono.id, posicoes: linhas.map((_, k) => k) }
  if (papel === 'headline2') {
    const daVoz1 = camadas.filter((c) => ehTexto(c) && papelDaCamada(c) === 'headline').reduce((s, c) => s + String(c.content ?? '').split('\n').length, 0)
    return { id: dono.id, posicoes: linhas.map((_, k) => daVoz1 + k) }
  }
  return { id: dono.id, posicoes: linhas.map((_, k) => k) }
}

describe('INVARIANTE: a copy autoral sobrevive a preparar → persistir → ler, duplicar, ocultar, excluir e recompor', () => {
  it('todo contrato aceito × arranjo × operação mantém ids, linhas e dono', () => {
    const casos = enumerarCasos()
    const falhas: string[] = []
    const contagem = { casos: casos.length, recusadosPelaSpec: 0, recusadosNaPreparacao: 0, aceitos: 0, operacoes: 0 }
    const cobertura = { r26: false, r27: false }
    const equipe = { autor: 'equipe' as const, motivo: 'autosave', superficie: 'editor' }

    for (const caso of casos) {
      const falhar = (onde: string, detalhe: unknown) => {
        falhas.push(`${caso.rotulo} — ${onde}: ${JSON.stringify(detalhe)}`)
      }
      const b = caso.contrato.blocos
      // R26 conta como coberto quando é ENUMERADO: o desfecho aceito é "recusado pela spec" ou "vínculos mantidos".
      if (caso.pagina === 'servico-dois-grupos' && b.some((x) => x.funcao === 'servico' && x.linhas.length === 2) && b.some((x) => x.id === 'servico-2' && x.funcao === 'livre' && x.linhas.length === 0)) cobertura.r26 = true
      const v = validarSpec({ projectId: 8, formato: 'story', copyAutoral: caso.contrato })
      if (!v.spec) {
        contagem.recusadosPelaSpec++
        continue
      }
      const preparados = prepararBlocos({ ...COMUNS[caso.pagina], spec: v.spec })
      if (preparados.faltam.length > 0 || preparados.falhas.length > 0 || preparados.recusas.length > 0) {
        contagem.recusadosNaPreparacao++
        continue
      }
      contagem.aceitos++
      if (caso.pagina === 'voz2-dois-textos' && b.some((x) => x.funcao === 'headline' && x.linhas.length === 3 && x.estilo?.linhasNaVoz2?.length === 2)) cobertura.r27 = true

      try {
        const camadas = preparados.montados.map((m) => m.layer)
        const efetiva = entradaDePersistencia({ spec: v.spec, opcoes: {}, projeto: { id: 8, name: 'Lagosta', userId: 'u' }, pasta: { id: 1, name: 'p' }, nome: 'n', ordem: 0, canvas: { width: 1080, height: 1920 }, layers: camadas, fundo: '#000', diagnostico: {}, fotoUrl: null }).copyAutoral as CopyAutoral
        // 1. a persistência preserva ids e linhas, sem bloco inventado
        if (JSON.stringify(forma(efetiva)) !== JSON.stringify(forma(caso.contrato))) falhar('persistência', { esperado: forma(caso.contrato), obtido: forma(efetiva) })
        if (validarCopyAutoral(efetiva).problemas.length > 0) falhar('contrato persistido inválido', validarCopyAutoral(efetiva).problemas)
        // 2. releitura e spec derivada / da recomposição
        contagem.operacoes++
        const relida = copyEfetivaDasCamadas(efetiva, camadas, { superficie: 'editor' })
        if (relida.mudancas.length > 0) falhar('releitura', relida.mudancas.map((m) => m.id))
        if (validarSpec(v.spec).problemas.length > 0) falhar('spec derivada', validarSpec(v.spec).problemas)
        const recomposta = validarSpec(specDaRecomposicao(v.spec, efetiva))
        if (!recomposta.spec) falhar('spec da recomposição', recomposta.problemas)
        else {
          const denovo = prepararBlocos({ ...COMUNS[caso.pagina], spec: recomposta.spec }).montados.map((m) => m.layer)
          const lidaDenovo = copyEfetivaDasCamadas(efetiva, denovo, { superficie: 'recomposicao' })
          if (lidaDenovo.mudancas.length > 0) falhar('recomposição relida', lidaDenovo.mudancas.map((m) => m.id))
        }
        // 3. duplicar não muda nada
        let n = 0
        const dup = duplicarCamadasDaPagina(camadas, () => `uuid-${++n}`, efetiva)
        const camadasDaCopia = dup.camadas as Layer[]
        contagem.operacoes++
        const lidaCopia = copyEfetivaDasCamadas(dup.contrato!, camadasDaCopia, { superficie: 'editor' })
        if (lidaCopia.mudancas.length > 0 || JSON.stringify(forma(lidaCopia.efetiva)) !== JSON.stringify(forma(efetiva))) falhar('duplicação', { mudancas: lidaCopia.mudancas.map((m) => m.id), obtido: forma(lidaCopia.efetiva) })

        // 4. ocultar / excluir / ocultar e reexibir / duplicar e ocultar — UM texto por vez
        const tocarUm = (base: CopyAutoral, lista: Layer[], k: number, modo: 'ocultar' | 'excluir') =>
          modo === 'ocultar' ? lista.map((l, j) => (j === k ? { ...l, visible: false } : l)) : lista.filter((_, j) => j !== k)
        const conferirToque = (onde: string, base: CopyAutoral, lista: Layer[], k: number, modo: 'ocultar' | 'excluir') => {
          const alvo = lista[k]
          const dono = donoDoTexto(alvo, base, lista)
          const tocadas = tocarUm(base, lista, k, modo) as Layer[]
          contagem.operacoes++
          const lida = copyEfetivaDasCamadas(base, tocadas, { superficie: 'editor' }).efetiva
          if (lida.blocos.some((x) => x.id.startsWith('extra-') && !base.blocos.some((y) => y.id === x.id))) falhar(`${onde}: bloco inventado`, forma(lida))
          if (!dono) return lida
          const esperado = base.blocos.map((x) => [x.id, x.id === dono.id ? x.linhas.filter((_, p) => !dono.posicoes.includes(p)) : x.linhas])
          if (JSON.stringify(forma(lida)) !== JSON.stringify(esperado)) falhar(`${onde} ${String(alvo.id)} (dono ${dono.id})`, { esperado, obtido: forma(lida) })
          if (validarCopyAutoral(lida).problemas.length > 0) falhar(`${onde}: contrato inválido`, validarCopyAutoral(lida).problemas)
          // Sem bloco COM função e com texto não há o que compor ("pelo menos um bloco"): a recusa é legítima.
          if (lida.blocos.some((x) => x.funcao !== 'livre' && x.linhas.length > 0)) {
            const r = validarSpec(specDaRecomposicao(v.spec!, lida))
            if (!r.spec) falhar(`${onde}: spec da recomposição`, r.problemas)
          }
          return lida
        }
        camadas.forEach((l, k) => {
          if (!ehTexto(l)) return
          const oculta = conferirToque('ocultar', efetiva, camadas, k, 'ocultar')
          conferirToque('excluir', efetiva, camadas, k, 'excluir')
          contagem.operacoes++
          const volta = copyEfetivaDasCamadas(oculta, camadas, { superficie: 'editor' }).efetiva
          if (JSON.stringify(forma(volta)) !== JSON.stringify(forma(efetiva))) falhar(`ocultar e reexibir ${String(l.id)}`, { esperado: forma(efetiva), obtido: forma(volta) })
          conferirToque('duplicar e ocultar', dup.contrato!, camadasDaCopia, k, 'ocultar')
        })
        void equipe
      } catch (erro) {
        falhar('exceção', String(erro))
      }
    }

    const relatorio = process.env.INVARIANTE_RELATORIO
    if (relatorio) writeFileSync(relatorio, `${JSON.stringify(contagem)}\n${JSON.stringify(cobertura)}\n${falhas.join('\n')}\n`)
    expect(cobertura).toEqual({ r26: true, r27: true })
    expect(contagem.aceitos).toBeGreaterThan(200)
    expect(falhas.slice(0, 15), `${falhas.length} falhas em ${contagem.aceitos} casos aceitos (${JSON.stringify(contagem)})`).toEqual([])
  })
})
