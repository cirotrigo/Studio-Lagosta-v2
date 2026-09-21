import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import { montarAssinatura } from '../assinatura'
import { papelDaCamada } from '../defasagem'
import { entradaDePersistencia } from '../persistencia'
import { prepararBlocos } from '../preparar-blocos'
import { validarSpec } from '../spec'
import { specDaRecomposicao } from '../spec-da-recomposicao'
import { comVisibilidadeDoRevisor } from '@/lib/creatives/revisao/oculta-pelo-revisor'
import { VERSAO_DO_CONTRATO, copyEfetivaDasCamadas, duplicarCamadasDaPagina, revisaoDaPaginaComCamadas, validarCopyAutoral, type BlocoAutoral, type CopyAutoral } from '@/lib/copy-autoral'

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
 * R28 (revisão do commit 9c96dec9, 12/09/2026): as camadas PREPARADAS carregam
 * `linhasDoBloco`, e por isso o invariante não via página LEGADA. Cada caso
 * roda agora em VARIANTES de página:
 *  - marcas: `preparada` (como a preparação grava), `legada` (sem
 *    `linhasDoBloco`, `parte` e `bloco` — a página composta antes das marcas,
 *    com o id físico e o papel que o compositor sempre gravou) e
 *    `legada-sem-papel` (também sem `metadata.compositor.papel`: forma que o
 *    compositor nunca produziu, porque o papel existe desde 02/09 e o id
 *    numerado só desde 11/09 — aqui só vale a regra DIFERENCIAL abaixo);
 *  - altura: `identidade`, `invertida` (os textos com as alturas trocadas de
 *    ponta a ponta) e `troca-no-grupo` (as duas primeiras partes de cada papel
 *    repartido trocam de altura) — as duas últimas só quando há papel repartido.
 * O contrato AUTORAL é oráculo só da página preparada: a legada foi persistida
 * pela leitura legada (as partes pela numeração dos ids, que numa distribuição
 * `[0, 2]` / `[1]` não é a ordem autoral), e o contrato dela É essa leitura.
 * Regra DIFERENCIAL, em toda variante: releitura estável, a cópia duplicada se
 * lê como a original, ocultar e reexibir devolve a leitura, e ocultar um texto
 * na cópia dá a mesma leitura que ocultá-lo na original.
 *
 * C9-12 e C9-13 (pré-revisão do commit 099818b0, 12/09/2026): um eixo de ORDEM
 * DO ARRAY (textos invertidos e rotacionados no array, com as alturas na
 * numeração — o que a equipe faz ao reordenar camadas no painel), os donos
 * procurados pelo id da camada, os dois passos tautológicos dos roteiros
 * tirados (comparar o salvo com a leitura crua é f(x) com f(x)), o DESFAZER
 * depois de salvar, e a camada escondida pelo REVISOR (a marca do PR 0): salvar
 * é "sem mudança", a leitura da arte diz que o texto não foi desenhado, e
 * desfazer volta sem mudança.
 *
 * C9-01 (pré-revisão do HEAD 980eea2a, 12/09/2026): a variante `legada` ganhou
 * ORÁCULO de correção — a leitura que o leitor LEGADO fazia (`leituraLegada`:
 * as partes pela numeração dos ids, a voz 2 depois da manchete), e o dono de
 * cada texto nessa leitura. Só ids que NÃO estão no contrato autoral são
 * mascarados como inferidos. E dois roteiros ENCADEADOS rodam por texto:
 * excluir → salvar (a revisão que o autosave grava) → reler → duplicar →
 * validar a spec da recomposição; e duplicar → ocultar → salvar → reler →
 * reexibir → salvar.
 *
 * O QUE O INVARIANTE NÃO AFIRMA (rebase sobre a main, 21/09/2026, decisão (A)).
 * A leitura da copy efetiva passou a ser a do PR 3: ela arbitra pelo vínculo
 * DECLARADO (`metadata.compositor.bloco` + `linhas`), e a inferência pelo id do
 * PR 9 saiu. Com a marca, TUDO o que está acima continua afirmado e passa (zero
 * falhas no eixo `preparada`). Sem a marca, a main não tem vínculo para
 * arbitrar, e o invariante deixou de afirmar o que só a inferência pelo id dava.
 * Medido antes de declarar (16.406 → 12.281 → 0 falhas duras), e o resíduo
 * inteiro era página sem marca:
 *  - ESTADOS fora do escopo — a variante é pulada e CONTADA pelo motivo em
 *    `foraDoEscopo` (ver `foraDoEscopoSemMarca`): contrato da F3 em página sem
 *    marca (nenhum produtor gera: a camada extra só nasce do compositor deste
 *    PR, que sempre carimba); livre sem herança no namespace inferido (`extra-*`),
 *    que casa pelo id inferido pela regra da main e, sem marca, não se distingue
 *    de uma parte repartida; e voz 2 repartida, cuja reserva a main documenta
 *    como "a PRIMEIRA `headline2` livre" — a outra vira bloco solto e a
 *    recomposição seguinte recusa a spec. Esta última é limitação da leitura da
 *    MAIN, anterior ao PR 9, registrada para ser tratada à parte.
 *  - Verificações POSICIONAIS na página sem marca produzível (persistência
 *    contra o oráculo legado, dono por posição, ocultar e reexibir, excluir e
 *    desfazer, e o diferencial): rodam e são CONTADAS em `posicaoSemMarca`, sem
 *    falhar. O oráculo legado (`leituraLegada`) ordena as partes pela numeração
 *    do id, que é justamente o que a decisão recusa. Validade (contrato, spec
 *    derivada, spec da recomposição) e estabilidade (releitura, duplicação,
 *    revisor) continuam DURAS em toda variante que roda.
 * Os números entram na mensagem do `expect` e no relatório: o que saiu do escopo
 * fica medido, nunca escondido.
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
// C9-01: os ids autorais `extra-*` (o namespace do R25) também, inclusive na forma com sufixo.
const IDS = ['nota', 'servico', 'servico-2', 'extra-servico', 'headline2', 'apoio', 'extra-headline2', 'headline', 'extra-apoio', 'extra-nota', 'extra-servico-2']
type Extra = { funcao: 'servico' | 'apoio'; herdaDe: 'apoio' | 'servico' | 'headline'; linhas: string[] }
const EXTRAS: Extra[][] = [
  [],
  [{ funcao: 'servico', herdaDe: 'apoio', linhas: ['Delivery até 22h'] }],
  [{ funcao: 'apoio', herdaDe: 'servico', linhas: ['Só hoje'] }, { funcao: 'servico', herdaDe: 'headline', linhas: ['Retirada no balcão'] }],
  // PR9-F02: o extra VAZIO com função e herança — o id dele disputa o namespace como o do livre vazio.
  [{ funcao: 'servico', herdaDe: 'apoio', linhas: [] }],
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

type Marcas = 'preparada' | 'legada' | 'legada-sem-papel'
type OrdemY = 'identidade' | 'invertida' | 'troca-no-grupo'
const MARCAS: Marcas[] = ['preparada', 'legada', 'legada-sem-papel']
const ORDENS: OrdemY[] = ['identidade', 'invertida', 'troca-no-grupo']
// C9-12 (pré-revisão do commit 099818b0): na página preparada a ordem do ARRAY é sempre a da numeração dos ids (a
// montagem numera), então uma leitura que ordenasse pela ordem do array passava. Reordenar camadas no painel muda o array.
type OrdemArray = 'original' | 'invertida' | 'rotacionada'
const ORDENS_DO_ARRAY: OrdemArray[] = ['original', 'invertida', 'rotacionada']
const MARCA_DO_REVISOR = { em: '2026-09-12T12:00:00.000Z', ajuste: 0 }

/** Reordena só os TEXTOS no array (nos lugares que os textos ocupam), mantendo ids, alturas e as outras camadas. */
function reordenarArray(camadas: Layer[], ordem: OrdemArray): Layer[] {
  if (ordem === 'original') return camadas
  const lugares = camadas.map((l, i) => (ehTexto(l) ? i : -1)).filter((i) => i >= 0)
  const textos = lugares.map((i) => camadas[i])
  const novos = ordem === 'invertida' ? [...textos].reverse() : [...textos.slice(1), textos[0]]
  const saida = [...camadas]
  lugares.forEach((i, k) => (saida[i] = novos[k]))
  return saida
}

/** A página LEGADA: sem as marcas de parte e de vínculo (e, na forma artificial, sem o papel); id físico, nome e identidade de extra ficam. */
function tirarMarcas(camadas: Layer[], semPapel: boolean): Layer[] {
  return camadas.map((l) => {
    const c = (l.metadata?.compositor ?? null) as Record<string, unknown> | null
    if (!ehTexto(l) || !c) return l
    // As marcas da main andam JUNTAS (o compositor só grava `linhas` com `bloco`):
    // tirar só o `bloco` deixava um estado que nenhum desenho produz.
    const { bloco: _b, linhas: _l, ...resto } = c
    const { papel: _papel, ...semOPapel } = resto
    return { ...l, metadata: { ...l.metadata, compositor: semPapel && !resto.extra ? semOPapel : resto } } as Layer
  })
}

/**
 * Por que uma variante SEM marca está fora do que o desenho promete — ou `null` quando ela está dentro. Os três estados
 * foram medidos no rebase sobre a main de 21/09/2026 (decisão (A): a leitura é a do PR 3, que arbitra pelo vínculo
 * DECLARADO) e são todos página sem marca; com a marca, nenhum deles falha:
 *  - contrato da F3 (bloco com `estilo.herdaDe`) em página sem marca: estado que nenhum produtor gera — a camada extra
 *    só nasce do compositor deste PR, que sempre carimba `bloco`;
 *  - livre SEM herança com id no namespace inferido (`extra-*`) numa página sem marca: pela regra da main ele casa
 *    pelo id inferido, e sem a marca não há como saber se a camada é dele ou parte de um bloco repartido;
 *  - voz 2 repartida (dois textos `headline2`) numa página sem marca: a reserva da main documenta "a PRIMEIRA
 *    `headline2` livre da peça", e a outra vira bloco solto. Limitação da leitura da MAIN, anterior ao PR 9.
 */
function foraDoEscopoSemMarca(contrato: CopyAutoral, camadas: Layer[]): string | null {
  if (contrato.blocos.some((b) => b.estilo?.herdaDe)) return 'contrato da F3 em página sem marca'
  if (contrato.blocos.some((b) => b.funcao === 'livre' && !b.estilo?.herdaDe && b.id.startsWith('extra-'))) return 'livre no namespace inferido em página sem marca'
  const vozes2 = camadas.filter((l) => ehTexto(l) && (papelDaCamada(l) === 'headline2' || /^headline2-\d+$/.test(String(l.id)))).length
  if (vozes2 >= 2) return 'voz 2 repartida em página sem marca'
  return null
}

/** As famílias de partes: os textos comuns de cada papel (a voz 2 à parte), na ordem do array. */
function familiasRepartidas(camadas: Layer[]): number[][] {
  const porPapel = new Map<string, number[]>()
  camadas.forEach((l, i) => {
    const papel = papelDaCamada(l)
    if (!ehTexto(l) || !papel || meta(l).extra) return
    porPapel.set(papel, [...(porPapel.get(papel) ?? []), i])
  })
  return [...porPapel.values()].filter((is) => is.length >= 2)
}

/**
 * Reordena as ALTURAS dos textos contra a numeração dos ids; a ordem do array (e os ids) não mudam. A preparação
 * devolve todo texto em y 0 (quem posiciona é a composição), e altura empatada não ordena nada: primeiro cada texto
 * ganha uma altura distinta NA ORDEM DO ARRAY (a da numeração), e só então a permutação é aplicada.
 */
function permutarY(camadas: Layer[], ordem: OrdemY): Layer[] {
  const textos = camadas.map((l, i) => (ehTexto(l) ? i : -1)).filter((i) => i >= 0)
  const altura = new Map<number, number>(textos.map((i, k) => [i, 200 + 160 * k]))
  if (ordem === 'invertida') {
    const ys = textos.map((i) => altura.get(i)!)
    textos.forEach((i, k) => altura.set(i, ys[ys.length - 1 - k]))
  } else if (ordem === 'troca-no-grupo') {
    for (const [a, b] of familiasRepartidas(camadas)) {
      const ya = altura.get(a)!
      altura.set(a, altura.get(b)!)
      altura.set(b, ya)
    }
  }
  return camadas.map((l, i) => (altura.has(i) ? { ...l, position: { ...l.position, y: altura.get(i)! } } : l)) as Layer[]
}

const meta = (l: Layer) => (l.metadata?.compositor ?? {}) as { extra?: { id?: string }; bloco?: string; linhas?: number[] }
const forma = (c: CopyAutoral) => c.blocos.map((b) => [b.id, b.linhas])

/** O bloco dono de um texto da peça, e as posições das linhas dele no bloco. */
function donoDoTexto(l: Layer, contrato: CopyAutoral, camadas: Layer[]): { id: string; posicoes: number[] } | null {
  const linhas = String(l.content ?? '').split('\n')
  // Rebase sobre a main (21/09/2026), decisão (A): o dono da camada é o que ela
  // DECLARA — `bloco` e as posições `linhas` que o compositor grava (PR 3). Antes
  // este oráculo lia `linhasDoBloco`, a marca do PR 9 que saiu; sem ela toda
  // camada de uma linha declarava a posição 0, e o bloco repartido era
  // "esperado" numa ordem que nenhum desenho produz.
  const declarado = meta(l).bloco
  if (declarado) return { id: declarado, posicoes: meta(l).linhas ?? linhas.map((_, k) => k) }
  const extraId = meta(l).extra?.id
  if (extraId) return { id: extraId, posicoes: linhas.map((_, k) => k) }
  const papel = papelDaCamada(l)
  const funcao = papel === 'headline2' ? 'headline' : papel
  const comuns = contrato.blocos.filter((b) => b.funcao === funcao && !b.estilo?.herdaDe)
  if (!papel || comuns.length !== 1) return null
  const dono = comuns[0]
  if (papel === 'headline') return { id: dono.id, posicoes: linhas.map((_, k) => k) }
  if (papel === 'headline2') {
    const daVoz1 = camadas.filter((c) => ehTexto(c) && papelDaCamada(c) === 'headline').reduce((s, c) => s + String(c.content ?? '').split('\n').length, 0)
    return { id: dono.id, posicoes: linhas.map((_, k) => daVoz1 + k) }
  }
  return { id: dono.id, posicoes: linhas.map((_, k) => k) }
}

/**
 * A leitura que o leitor LEGADO fazia de uma página sem marcas (C9-01): cada bloco comum ÚNICO da sua função junta
 * os textos daquele papel pela numeração do id (`<papel>` → 1, `<papel>-N` → N) — a manchete com a voz 2 depois
 * (`headline2`, `headline2-N`) —, e o extra com identidade explícita é o próprio texto. Devolve também o dono de cada
 * texto e as posições das linhas dele nessa leitura.
 */
function leituraLegada(contrato: CopyAutoral, preparadas: Layer[]): { esperado: Array<[string, string[]]>; donos: Array<{ id: string; posicoes: number[] } | null> } {
  const numero = (l: Layer, papel: string) => {
    const id = String(l.id)
    if (id === papel) return 1
    const m = /^([a-z0-9]+)-(\d+)$/.exec(id)
    return m && m[1] === papel ? Number(m[2]) : Number.POSITIVE_INFINITY
  }
  const donos: Array<{ id: string; posicoes: number[] } | null> = preparadas.map(() => null)
  const linhasDoBloco = new Map(contrato.blocos.map((b) => [b.id, [...b.linhas]]))
  preparadas.forEach((l, i) => {
    const extraId = meta(l).extra?.id
    if (ehTexto(l) && extraId) donos[i] = { id: extraId, posicoes: String(l.content ?? '').split('\n').map((_, k) => k) }
  })
  for (const b of contrato.blocos) {
    if (b.funcao === 'livre' || b.estilo?.herdaDe) continue
    if (contrato.blocos.filter((x) => x.funcao === b.funcao && !x.estilo?.herdaDe).length !== 1) continue
    const papeis = b.funcao === 'headline' ? ['headline', 'headline2'] : [b.funcao]
    const linhas: string[] = []
    for (const papel of papeis) {
      const partes = preparadas
        .map((l, i) => ({ l, i }))
        .filter(({ l }) => ehTexto(l) && !meta(l).extra && papelDaCamada(l) === papel)
        .sort((x, y) => numero(x.l, papel) - numero(y.l, papel) || x.i - y.i)
      for (const { l, i } of partes) {
        const daCamada = String(l.content ?? '').split('\n')
        donos[i] = { id: b.id, posicoes: daCamada.map((_, k) => linhas.length + k) }
        linhas.push(...daCamada)
      }
    }
    if (linhas.length > 0) linhasDoBloco.set(b.id, linhas)
  }
  return { esperado: contrato.blocos.map((b) => [b.id, linhasDoBloco.get(b.id)!]), donos }
}

describe('INVARIANTE: a copy autoral sobrevive a preparar → persistir → ler, duplicar, ocultar, excluir e recompor', () => {
  it('todo contrato aceito × arranjo × operação mantém ids, linhas e dono', () => {
    const casos = enumerarCasos()
    const falhas: string[] = []
    const contagem = { casos: casos.length, recusadosPelaSpec: 0, recusadosNaPreparacao: 0, aceitos: 0, variantes: 0, operacoes: 0, encadeadas: 0, foraDoEscopo: {} as Record<string, number>, posicaoSemMarca: 0 }
    const equipe = { autor: 'equipe' as const, motivo: 'autosave', superficie: 'editor' }
    const cobertura = { r26: false, r27: false, r28: false, f02: false }

    for (const caso of casos) {
      const falhar = (onde: string, detalhe: unknown) => {
        falhas.push(`${caso.rotulo} — ${onde}: ${JSON.stringify(detalhe)}`)
      }
      const b = caso.contrato.blocos
      // R26 conta como coberto quando é ENUMERADO: o desfecho aceito é "recusado pela spec" ou "vínculos mantidos".
      if (caso.pagina === 'servico-dois-grupos' && b.some((x) => x.funcao === 'servico' && x.linhas.length === 2) && b.some((x) => x.id === 'servico-2' && x.funcao === 'livre' && x.linhas.length === 0)) cobertura.r26 = true
      if (caso.pagina === 'servico-dois-grupos' && b.some((x) => x.funcao === 'servico' && x.linhas.length === 2 && !x.estilo?.herdaDe) && b.some((x) => x.id === 'servico-2' && x.funcao === 'servico' && x.estilo?.herdaDe && x.linhas.length === 0)) cobertura.f02 = true
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
        const preparadas = preparados.montados.map((m) => m.layer)
        // Oráculo e donos são decididos na página PREPARADA e procurados pelo ID da camada: as variantes mexem em marcas,
        // alturas e ordem do array, nunca nos ids. Preparada: o contrato autoral e as marcas. Legada: a leitura legada (C9-01).
        const donosDaPreparada = new Map(preparadas.map((l) => [String(l.id), ehTexto(l) ? donoDoTexto(l, caso.contrato, preparadas) : null]))
        const legado = leituraLegada(caso.contrato, preparadas)
        const donosDaLegada = new Map(preparadas.map((l, i) => [String(l.id), legado.donos[i]]))
        // Só o id que NÃO é do autor é inferido (C9-01): o `extra-*` autoral fica visível em toda comparação. A exceção é
        // a regra do R25: o livre SEM herança com id `extra-*` É o namespace inferido (a leitura casa por ele e a duplicação
        // o renomeia), então ele é mascarado como os que a leitura cria.
        const autorais = new Set(caso.contrato.blocos.filter((x) => !(x.funcao === 'livre' && !x.estilo?.herdaDe && x.id.startsWith('extra-'))).map((x) => x.id))
        const formaSemInferidos = (c: CopyAutoral) => c.blocos.map((x) => [autorais.has(x.id) ? x.id : 'extra', x.linhas])
        const repartida = familiasRepartidas(preparadas).length > 0
        if (caso.pagina === 'voz2-dois-textos' && repartida && b.some((x) => x.funcao === 'headline' && x.linhas.length === 3 && x.estilo?.linhasNaVoz2?.length === 2)) cobertura.r28 = true

        for (const marcas of MARCAS)
          for (const ordem of ORDENS)
            for (const ordemDoArray of ORDENS_DO_ARRAY) {
              if ((ordem !== 'identidade' || ordemDoArray !== 'original') && !repartida) continue
              // O eixo do array roda com as alturas na numeração: é ele sozinho que separa "número" de "ordem do array".
              if (ordemDoArray !== 'original' && ordem !== 'identidade') continue
              contagem.variantes++
              const rotulo = `[${marcas}/${ordem}/${ordemDoArray}]`
              const falharV = (onde: string, detalhe: unknown) => falhar(`${rotulo} ${onde}`, detalhe)
              const alturas = permutarY(preparadas, ordem)
              const camadas = reordenarArray(marcas === 'preparada' ? alturas : tirarMarcas(alturas, marcas === 'legada-sem-papel'), ordemDoArray)
              // ESCOPO na página SEM marca — ver o cabeçalho ("O que o invariante NÃO afirma"). A variante fora do escopo é
              // CONTADA pelo motivo e pulada; nunca vira acerto em silêncio.
              const motivoForaDoEscopo = marcas === 'preparada' ? null : foraDoEscopoSemMarca(caso.contrato, camadas)
              if (motivoForaDoEscopo) {
                contagem.foraDoEscopo[motivoForaDoEscopo] = (contagem.foraDoEscopo[motivoForaDoEscopo] ?? 0) + 1
                continue
              }
              // As verificações POSICIONAIS (qual linha volta para onde) só valem com a marca: sem ela, a leitura da main não
              // tem vínculo declarado para arbitrar, e recuperar a posição seria inferir do id — o que a decisão (A) recusa.
              // Na página sem marca elas rodam e são contadas, sem falhar; validade e estabilidade continuam duras.
              const falharPosicao = (onde: string, detalhe: unknown) => (marcas === 'preparada' ? falharV(onde, detalhe) : contagem.posicaoSemMarca++)
              // Correção vale na preparada (contrato autoral) e na legada (leitura legada); a sem papel só tem a regra diferencial.
              const absoluta = marcas !== 'legada-sem-papel'
              const oraculo = marcas === 'preparada' ? forma(caso.contrato) : legado.esperado
              const donoPorId = marcas === 'preparada' ? donosDaPreparada : donosDaLegada
              const efetiva = entradaDePersistencia({ spec: v.spec, opcoes: {}, projeto: { id: 8, name: 'Lagosta', userId: 'u' }, pasta: { id: 1, name: 'p' }, nome: 'n', ordem: 0, canvas: { width: 1080, height: 1920 }, layers: camadas, fundo: '#000', diagnostico: {}, fotoUrl: null }).copyAutoral as CopyAutoral
              if (absoluta) {
                // 1. a persistência reproduz o oráculo, sem bloco inventado
                if (JSON.stringify(forma(efetiva)) !== JSON.stringify(oraculo)) falharPosicao('persistência', { esperado: oraculo, obtido: forma(efetiva) })
                if (validarCopyAutoral(efetiva).problemas.length > 0) falharV('contrato persistido inválido', validarCopyAutoral(efetiva).problemas)
              }
              // 2. releitura estável
              contagem.operacoes++
              const relida = copyEfetivaDasCamadas(efetiva, camadas, { superficie: 'editor' })
              if (relida.mudancas.length > 0) falharV('releitura', relida.mudancas.map((m) => m.id))
              if (marcas === 'preparada' && ordem === 'identidade' && ordemDoArray === 'original') {
                if (validarSpec(v.spec).problemas.length > 0) falharV('spec derivada', validarSpec(v.spec).problemas)
                const recomposta = validarSpec(specDaRecomposicao(v.spec, efetiva))
                if (!recomposta.spec) falharV('spec da recomposição', recomposta.problemas)
                else {
                  const denovo = prepararBlocos({ ...COMUNS[caso.pagina], spec: recomposta.spec }).montados.map((m) => m.layer)
                  const lidaDenovo = copyEfetivaDasCamadas(efetiva, denovo, { superficie: 'recomposicao' })
                  if (lidaDenovo.mudancas.length > 0) falharV('recomposição relida', lidaDenovo.mudancas.map((m) => m.id))
                }
              }
              // 3. duplicar não muda a leitura
              let n = 0
              const dup = duplicarCamadasDaPagina(camadas, () => `uuid-${++n}`, efetiva)
              const camadasDaCopia = dup.camadas as Layer[]
              contagem.operacoes++
              const lidaCopia = copyEfetivaDasCamadas(dup.contrato!, camadasDaCopia, { superficie: 'editor' })
              if (lidaCopia.mudancas.length > 0 || JSON.stringify(formaSemInferidos(lidaCopia.efetiva)) !== JSON.stringify(formaSemInferidos(efetiva))) falharV('duplicação', { mudancas: lidaCopia.mudancas.map((m) => m.id), esperado: formaSemInferidos(efetiva), obtido: formaSemInferidos(lidaCopia.efetiva) })

              // 4. um texto por vez
              const tocarUm = (lista: Layer[], k: number, modo: 'ocultar' | 'excluir') =>
                (modo === 'ocultar' ? lista.map((l, j) => (j === k ? { ...l, visible: false } : l)) : lista.filter((_, j) => j !== k)) as Layer[]
              const temBlocoParaCompor = (c: CopyAutoral) => c.blocos.some((x) => x.funcao !== 'livre' && x.linhas.length > 0)
              const conferirToque = (onde: string, base: CopyAutoral, lista: Layer[], k: number, modo: 'ocultar' | 'excluir', idOriginal: string) => {
                contagem.operacoes++
                const lida = copyEfetivaDasCamadas(base, tocarUm(lista, k, modo), { superficie: 'editor' }).efetiva
                if (!absoluta) return lida
                if (lida.blocos.some((x) => !autorais.has(x.id) && !base.blocos.some((y) => y.id === x.id))) falharV(`${onde}: bloco inventado`, forma(lida))
                const dono = donoPorId.get(idOriginal)
                if (!dono) return lida
                const esperado = base.blocos.map((x) => [x.id, x.id === dono.id ? x.linhas.filter((_, p) => !dono.posicoes.includes(p)) : x.linhas])
                if (JSON.stringify(forma(lida)) !== JSON.stringify(esperado)) falharPosicao(`${onde} ${idOriginal} (dono ${dono.id})`, { esperado, obtido: forma(lida) })
                if (validarCopyAutoral(lida).problemas.length > 0) falharV(`${onde}: contrato inválido`, validarCopyAutoral(lida).problemas)
                // Sem bloco COM função e com texto não há o que compor ("pelo menos um bloco"): a recusa é legítima.
                if (ordem === 'identidade' && ordemDoArray === 'original' && temBlocoParaCompor(lida)) {
                  const r = validarSpec(specDaRecomposicao(v.spec!, lida))
                  if (!r.spec) falharV(`${onde}: spec da recomposição`, r.problemas)
                }
                return lida
              }
              // O que o autosave grava: a revisão da equipe sobre o contrato atual, ou o mesmo contrato quando nada mudou.
              // É o INSUMO dos roteiros, não uma conferência: comparar o salvo com a leitura crua seria f(x) com f(x) (C9-13).
              const salvar = (onde: string, base: CopyAutoral, lista: Layer[]) => {
                const r = revisaoDaPaginaComCamadas(base, lista, equipe)
                if (r.estado === 'ilegivel' || r.estado === 'sem-contrato') falharV(`${onde}: salvar`, r.estado)
                if (r.copy && validarCopyAutoral(r.copy).problemas.length > 0) falharV(`${onde}: salvo inválido`, validarCopyAutoral(r.copy).problemas)
                return r.copy ?? base
              }
              const iguais = (a: CopyAutoral, c: CopyAutoral) => JSON.stringify(formaSemInferidos(a)) === JSON.stringify(formaSemInferidos(c))
              camadas.forEach((l, k) => {
                if (!ehTexto(l)) return
                const id = String(l.id)
                const oculta = conferirToque('ocultar', efetiva, camadas, k, 'ocultar', id)
                conferirToque('excluir', efetiva, camadas, k, 'excluir', id)
                contagem.operacoes++
                const volta = copyEfetivaDasCamadas(oculta, camadas, { superficie: 'editor' }).efetiva
                if (!iguais(volta, efetiva)) falharPosicao(`ocultar e reexibir ${id}`, { esperado: formaSemInferidos(efetiva), obtido: formaSemInferidos(volta) })
                const ocultaNaCopia = conferirToque('duplicar e ocultar', dup.contrato!, camadasDaCopia, k, 'ocultar', id)
                // DIFERENCIAL: ocultar na cópia dá a mesma leitura que ocultar na original.
                if (!iguais(ocultaNaCopia, oculta)) falharPosicao(`diferencial: ocultar ${id} na cópia`, { original: formaSemInferidos(oculta), copia: formaSemInferidos(ocultaNaCopia) })

                // 5. ENCADEADAS (C9-01, sem os passos tautológicos — C9-13)
                contagem.encadeadas += 3
                // 5a. excluir → salvar → reler → duplicar → spec da recomposição → DESFAZER (o snapshot volta) → salvar
                const semK = tocarUm(camadas, k, 'excluir')
                const salvo = salvar(`excluir ${id}`, efetiva, semK)
                contagem.operacoes++
                const relidaSalva = copyEfetivaDasCamadas(salvo, semK, { superficie: 'editor' })
                if (relidaSalva.mudancas.length > 0) falharV(`excluir ${id} → salvar → reler`, relidaSalva.mudancas.map((m) => m.id))
                let m = 0
                const dupSalva = duplicarCamadasDaPagina(semK, () => `uuid-e${k}-${++m}`, salvo)
                contagem.operacoes++
                const lidaDupSalva = copyEfetivaDasCamadas(dupSalva.contrato!, dupSalva.camadas as Layer[], { superficie: 'editor' })
                if (lidaDupSalva.mudancas.length > 0 || !iguais(lidaDupSalva.efetiva, salvo)) falharV(`excluir ${id} → salvar → duplicar`, { mudancas: lidaDupSalva.mudancas.map((x) => x.id), esperado: formaSemInferidos(salvo), obtido: formaSemInferidos(lidaDupSalva.efetiva) })
                if (absoluta && temBlocoParaCompor(salvo)) {
                  contagem.operacoes++
                  const r = validarSpec(specDaRecomposicao(v.spec!, salvo))
                  if (!r.spec) falharV(`excluir ${id} → salvar → spec da recomposição`, r.problemas)
                }
                contagem.operacoes++
                const desfeito = salvar(`desfazer a exclusão de ${id}`, salvo, camadas)
                if (!iguais(desfeito, efetiva)) falharPosicao(`excluir ${id} → salvar → desfazer → salvar`, { esperado: formaSemInferidos(efetiva), obtido: formaSemInferidos(desfeito) })
                // 5b. duplicar → ocultar → salvar → reler → reexibir → salvar
                const ocultaCopia = tocarUm(camadasDaCopia, k, 'ocultar')
                const salvoCopia = salvar(`duplicar e ocultar ${id}`, dup.contrato!, ocultaCopia)
                contagem.operacoes++
                const relidaCopia = copyEfetivaDasCamadas(salvoCopia, ocultaCopia, { superficie: 'editor' })
                if (relidaCopia.mudancas.length > 0) falharV(`duplicar → ocultar ${id} → salvar → reler`, relidaCopia.mudancas.map((x) => x.id))
                contagem.operacoes++
                const reexibidoSalvo = salvar(`duplicar e reexibir ${id}`, salvoCopia, camadasDaCopia)
                if (!iguais(reexibidoSalvo, efetiva)) falharPosicao(`duplicar → ocultar ${id} → salvar → reexibir → salvar`, { esperado: formaSemInferidos(efetiva), obtido: formaSemInferidos(reexibidoSalvo) })
                // 5c. o REVISOR esconde o texto (marca do PR 0) → salvar é "sem mudança" (não é remoção autoral); a leitura da
                // arte diz que o texto não foi desenhado (igual a ocultar); desfazer → salvar continua sem mudança.
                const peloRevisor = camadas.map((c, j) => (j === k ? comVisibilidadeDoRevisor(c, false, MARCA_DO_REVISOR) : c)) as Layer[]
                contagem.operacoes++
                const revisaoDoRevisor = revisaoDaPaginaComCamadas(efetiva, peloRevisor, equipe)
                if (revisaoDoRevisor.estado !== 'sem-mudanca') falharV(`revisor esconde ${id} → salvar`, { estado: revisaoDoRevisor.estado, blocos: revisaoDoRevisor.blocos })
                contagem.operacoes++
                const lidaDoRevisor = copyEfetivaDasCamadas(efetiva, peloRevisor, { superficie: 'revisor' }).efetiva
                if (!iguais(lidaDoRevisor, oculta)) falharV(`revisor esconde ${id}: a leitura da arte`, { esperado: formaSemInferidos(oculta), obtido: formaSemInferidos(lidaDoRevisor) })
                contagem.operacoes++
                const reexibidaPeloRevisor = revisaoDaPaginaComCamadas(revisaoDoRevisor.copy ?? efetiva, camadas, equipe)
                if (reexibidaPeloRevisor.estado !== 'sem-mudanca') falharV(`revisor esconde ${id} → salvar → desfazer → salvar`, { estado: reexibidaPeloRevisor.estado, blocos: reexibidaPeloRevisor.blocos })
              })
            }
      } catch (erro) {
        falhar('exceção', String(erro))
      }
    }

    const relatorio = process.env.INVARIANTE_RELATORIO
    if (relatorio) writeFileSync(relatorio, `${JSON.stringify(contagem)}\n${JSON.stringify(cobertura)}\n${falhas.join('\n')}\n`)
    expect(cobertura).toEqual({ r26: true, r27: true, r28: true, f02: true })
    expect(contagem.aceitos).toBeGreaterThan(200)
    expect(falhas.slice(0, 15), `${falhas.length} falhas em ${contagem.aceitos} casos aceitos (${JSON.stringify(contagem)})`).toEqual([])
  })
})
