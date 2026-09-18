/**
 * A COPY EFETIVA — o que foi DESENHADO, lido das camadas da peça, no formato do
 * contrato. É a outra metade da fidelidade: o original é o que o autor
 * escreveu; a efetiva é o que a arte mostra. Quem grava as duas lado a lado
 * (`Generation.fieldValues.copyAutoral`) deixa a comparação inteira, bloco a
 * bloco, sem OCR.
 *
 * Como as camadas viram blocos:
 *  - o papel de cada camada sai de `papelDaCamada` (metadata do compositor,
 *    id ou nome); com UM bloco da função no original, ele leva TODAS as camadas
 *    dela, juntas de cima para baixo (o compositor reparte o serviço em
 *    `servico` e `servico-2`, e ele volta a ser um bloco só — PR3-R8-02); com
 *    vários, uma camada por bloco na ORDEM vertical;
 *  - `headline2` é a SEGUNDA VOZ da manchete (o compositor tira a última linha
 *    do bloco para ela): as linhas dela voltam ao bloco `headline`, e a
 *    posição vira `estilo.linhasNaVoz2` — declarada, como o contrato pede;
 *  - rich text volta com os [colchetes] nos trechos destacados
 *    (`linhasComColchetes`); texto simples volta como está;
 *  - bloco do original que NÃO foi desenhado volta com `linhas: []` e uma
 *    lacuna nomeando-o — nunca some;
 *  - camada de texto que não casa com bloco nenhum vira bloco `livre` novo
 *    (`extra-<id>`), com lacuna: a arte mostra texto que a copy não tinha.
 *
 * Módulo PURO (tipos, `papelDaCamada`, `linhasComColchetes`).
 */

import type { Layer } from '@/types/template'
import { papelDaCamada } from '@/lib/compositor/defasagem'
import { linhasComColchetes } from '@/lib/compositor/destaques'
import { VERSAO_DO_CONTRATO, copyAutoralSchema, type BlocoAutoral, type CopyAutoral, type FuncaoDoBloco } from './contrato'
import { blocosEmOrdem } from './validar'
import { aplicarRevisao, HistoricoDaCopyCheio, RevisaoDaCopyInvalida, type MudancaDeBloco } from './revisao'
import { orientacaoDosProblemas, orientacaoEmFrase } from './orientacao'

/** Hash curto e determinístico (FNV-1a) — só para desempatar ids saneados. */
function hashCurto(texto: string): string {
  let h = 2166136261
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36).slice(0, 5)
}

/**
 * O id do bloco `extra-…` que uma camada solta gera — REPRODUTÍVEL entre
 * leituras e DISTINTO para camadas distintas: preserva a caixa do id da
 * camada (o alfabeto do bloco aceita) e, quando o saneamento mudou o id
 * ("nota!" e "nota?" colapsariam em "nota-"), acrescenta um hash do id
 * original (R04 da revisão do Codex sobre o PR 3, 12/09/2026).
 */
export function idDeExtra(camadaOuId: Pick<Layer, 'id'> | string): string {
  const cru = String(typeof camadaOuId === 'string' ? camadaOuId : camadaOuId.id)
  const saneado = cru.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[^A-Za-z0-9]+/, '').slice(0, 40)
  const base = saneado || 'camada'
  return saneado === cru ? `extra-${base}` : `extra-${base}-${hashCurto(cru)}`
}

/**
 * O id que a forma ANTERIOR do algoritmo (base do PR 3, 82d9b202) dava à mesma
 * camada: caixa baixa, sem hash, com `-2`, `-3`… para colisões. Existe SÓ para
 * reconhecer contrato gravado por ela — a compatibilização técnica não pode
 * virar alteração autoral da pessoa (REV-03 da 3ª rodada da revisão do Codex
 * sobre o PR 3, 12/09/2026). Não gera id novo.
 */
export function idDeExtraLegado(camadaOuId: Pick<Layer, 'id'> | string): string {
  const cru = String(typeof camadaOuId === 'string' ? camadaOuId : camadaOuId.id)
  return `extra-${cru.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[^a-z0-9]+/, '') || 'camada'}`
}

/** `extra-nota` → 0; `extra-nota-2` → 1 (o sufixo de colisão da forma antiga); outro → null. */
function indiceLegado(id: string, legado: string): number | null {
  if (id === legado) return 0
  if (!id.startsWith(`${legado}-`)) return null
  const resto = id.slice(legado.length + 1)
  return /^\d+$/.test(resto) && Number(resto) >= 2 ? Number(resto) - 1 : null
}

/**
 * Duplicar página regenera os ids das camadas; os blocos `extra-…` do contrato
 * (nomeados pelo id da camada solta) acompanham a troca — nos blocos e no
 * histórico (`revisoes[].blocos`, `campos`, `removidos`) —, senão a próxima
 * leitura esvaziaria o bloco antigo e criaria outro, com autoria falsa (R03).
 */
export function renomearExtrasDuplicados(copy: CopyAutoral, idsDeCamada: ReadonlyMap<string, string>, camadasOriginais: Layer[]): CopyAutoral {
  // O vínculo bloco → camada é resolvido em CONJUNTO contra as camadas
  // ORIGINAIS, com a mesma seleção e ordem da leitura (`vincularExtras`): o
  // mapa de ids sozinho não diz qual camada cada bloco antigo descrevia —
  // "Nota"/"nota" colidem entre a forma atual e a antiga, e a ordem do array
  // não é a ordem visual que nomeou os sufixos (R4-01 e R4-02, 4ª rodada da
  // revisão do Codex sobre o PR 3, 12/09/2026).
  // Camada OCULTA entra aqui: o bloco dela continua no contrato (com
  // `linhas: []`) e o id da cópia tem de acompanhar — senão reexibir a camada
  // na cópia não reencontra o bloco e nasce outro (R5-02, 5ª rodada).
  const { vinculos } = vincularExtras(blocosEmOrdem(copy).filter((b) => b.funcao === 'livre'), camadasOriginais, { incluirOcultas: true })
  const mapa = new Map<string, string>()
  for (const [blocoId, camada] of vinculos) {
    const novo = idsDeCamada.get(String(camada.id))
    if (novo) mapa.set(blocoId, idDeExtra(novo))
  }
  const troca = (id: string) => mapa.get(id) ?? id
  if (!copy.blocos.some((b) => troca(b.id) !== b.id)) return copy
  return {
    ...copy,
    blocos: copy.blocos.map((b) => ({ ...b, id: troca(b.id) })),
    revisoes: copy.revisoes.map((r) => ({
      ...r,
      blocos: r.blocos.map(troca),
      ...(r.campos ? { campos: Object.fromEntries(Object.entries(r.campos).map(([k, v]) => [troca(k), v])) } : {}),
      ...(r.removidos ? { removidos: r.removidos.map((x) => ({ ...x, id: troca(x.id) })) } : {}),
    })),
  }
}

/**
 * O vínculo de cada bloco `livre` com a camada solta que o desenhou, resolvido
 * em CONJUNTO — nunca bloco a bloco pela preferência do formato atual: o mesmo
 * id pode ser a forma ATUAL de uma camada e a forma ANTIGA de outra ("Nota" e
 * "nota": `extra-nota` é o legado da primeira e o atual da segunda). Regras,
 * nesta ordem (R4-01/R4-02, 4ª rodada da revisão do Codex, 12/09/2026):
 *  1. camada NOMEADA pelo bloco (`id`/`name` iguais ao id do bloco) — a camada
 *     extra da F3 nasce assim;
 *  2. candidatas pelo id — forma atual OU forma antiga (com o sufixo `-N` da
 *     colisão); enquanto houver bloco com UMA candidata livre, ele a toma;
 *  3. entre os pendentes, o bloco cujo TEXTO é igual ao de exatamente UMA
 *     candidata livre a toma — para TODOS os pendentes, antes de qualquer
 *     escolha por ordem, e cada tomada volta ao passo 2 (a unicidade que ela
 *     cria resolve o vizinho). Escolher pela ordem enquanto outro bloco ainda
 *     casava por texto trocava o conteúdo entre ids e atribuía revisão à
 *     equipe nos dois (R5-01, 5ª rodada da revisão do Codex, 12/09/2026);
 *  4. o que sobrar: a primeira na ORDEM DE LEITURA (a mesma que nomeou os
 *     sufixos), com a ambiguidade declarada em `ambiguos`.
 * As camadas entram na ordem de leitura (y, x), soltas primeiro — nunca na
 * ordem do array. A LEITURA da copy só vê camadas visíveis; a DUPLICAÇÃO passa
 * `incluirOcultas` porque o bloco da camada oculta continua no contrato e o
 * id da cópia precisa acompanhá-lo (R5-02).
 */
export function vincularExtras(blocosLivres: BlocoAutoral[], camadas: Layer[], opcoes: { incluirOcultas?: boolean } = {}): { vinculos: Map<string, Layer>; ambiguos: string[] } {
  const { porFuncao, voz2, soltas } = camadasPorFuncao(camadas, opcoes)
  const emOrdem = [...soltas, ...[...porFuncao.values()].flat(), ...voz2]
  const vinculos = new Map<string, Layer>()
  const usadas = new Set<string>()
  const ambiguos: string[] = []
  const pendentes = [...blocosLivres]
  const tomar = (b: BlocoAutoral, c: Layer) => {
    vinculos.set(b.id, c)
    usadas.add(c.id)
    pendentes.splice(pendentes.indexOf(b), 1)
  }
  // 1. nomeada pelo bloco
  for (const b of [...pendentes]) {
    const c = emOrdem.find((l) => !usadas.has(l.id) && (l.id === b.id || l.name === b.id))
    if (c) tomar(b, c)
  }
  const candidatasDe = (b: BlocoAutoral) => emOrdem.filter((c) => !usadas.has(c.id) && (idDeExtra(c) === b.id || indiceLegado(b.id, idDeExtraLegado(c)) !== null))
  const mesmoTexto = (b: BlocoAutoral, cs: Layer[]) => cs.filter((c) => JSON.stringify(linhasDaCamada(c)) === JSON.stringify(b.linhas))
  // 2 + 3. até estabilizar: primeiro toda unicidade pelo id; depois UM casamento
  // inequívoco por texto (que cria unicidade nova e volta ao passo 2). Nenhuma
  // escolha por ordem acontece enquanto restar casamento exato em algum bloco.
  for (let mudou = true; mudou; ) {
    mudou = false
    for (const b of [...pendentes]) {
      const cs = candidatasDe(b)
      if (cs.length === 1) {
        tomar(b, cs[0])
        mudou = true
      }
    }
    if (mudou) continue
    for (const b of [...pendentes]) {
      const cs = candidatasDe(b)
      if (cs.length < 2) continue
      const iguais = mesmoTexto(b, cs)
      if (iguais.length === 1) {
        tomar(b, iguais[0])
        mudou = true
        break
      }
    }
  }
  // 4. o resto: a primeira na ordem de leitura, declarado
  for (const b of [...pendentes]) {
    const cs = candidatasDe(b)
    if (cs.length === 0) continue
    const iguais = mesmoTexto(b, cs)
    const escolhida = iguais[0] ?? cs[0]
    ambiguos.push(`o bloco "${b.id}" casava com ${cs.length} camadas pelo id; ficou com "${escolhida.id}" (${iguais.length > 1 ? 'texto igual, primeira na ordem de leitura' : 'primeira na ordem de leitura'})`)
    tomar(b, escolhida)
  }
  return { vinculos, ambiguos }
}

/**
 * O que foi DESENHADO: camada com `visible: false` não entra — inclusive a que o
 * revisor escondeu. Quem decide AUTORIA (`revisaoDaPaginaComCamadas`) passa as
 * camadas por `camadasParaDecisao` antes, e aí a escondida pelo revisor conta
 * como presente: ajuste mecânico não é remoção autoral.
 */
function ehTextoVisivel(l: Layer): boolean {
  return (l.type === 'text' || l.type === 'rich-text') && l.visible !== false
}

function linhasDaCamada(l: Layer): string[] {
  const ricas = linhasComColchetes(l)
  if (ricas) return ricas
  return String(l.content ?? '').split('\n')
}

/**
 * As linhas de um bloco desenhado em VÁRIAS camadas, juntas de cima para baixo.
 * Quando são exatamente as linhas do bloco em outra ordem, vale a ordem do
 * bloco: quem reordenou foi o arranjo (o horário vai ao grupo do relógio, o
 * endereço ao do alfinete), não quem escreveu. Numa camada só a ordem é a da
 * camada — ali reordenar é edição.
 */
function linhasRepartidas(doBloco: string[], porCamada: string[][]): string[] {
  const juntas = porCamada.flat()
  if (porCamada.length < 2) return juntas
  const ordenar = (l: string[]) => JSON.stringify([...l].sort())
  return ordenar(juntas) === ordenar(doBloco) ? [...doBloco] : juntas
}

/** As camadas de texto agrupadas por função, de cima para baixo. */
function camadasPorFuncao(camadas: Layer[], opcoes: { incluirOcultas?: boolean } = {}): { porFuncao: Map<FuncaoDoBloco, Layer[]>; voz2: Layer[]; soltas: Layer[] } {
  const porFuncao = new Map<FuncaoDoBloco, Layer[]>()
  const voz2: Layer[] = []
  const soltas: Layer[] = []
  const ehTexto = (l: Layer) => (opcoes.incluirOcultas ? l.type === 'text' || l.type === 'rich-text' : ehTextoVisivel(l))
  const ordenadas = camadas.filter(ehTexto).sort((a, b) => (a.position?.y ?? 0) - (b.position?.y ?? 0) || (a.position?.x ?? 0) - (b.position?.x ?? 0))
  for (const c of ordenadas) {
    const papel = papelDaCamada(c)
    if (papel === 'headline2') voz2.push(c)
    else if (papel) porFuncao.set(papel, [...(porFuncao.get(papel) ?? []), c])
    else soltas.push(c)
  }
  return { porFuncao, voz2, soltas }
}

/**
 * A segunda voz da manchete é RECONSTRUÍDA das camadas presentes, nunca herdada
 * do contrato (PR3-F05 da revisão FINAL do Codex sobre abac9b34, 18/09/2026):
 * sem `headline2` na peça o índice antigo apontava para linha que podia não
 * existir (a revisão válida era recusada e o contrato ficava velho) ou
 * sobrevivia às linhas reunidas na primeira voz (a mudança passava sem
 * registro). O resto do estilo (`herdaDe`) fica como o autor declarou.
 */
function comSegundaVoz(b: BlocoAutoral, naVoz2: number[]): BlocoAutoral {
  const { estilo: antigo, ...semEstilo } = b
  const { linhasNaVoz2: _antiga, ...resto } = antigo ?? {}
  const estilo = { ...resto, ...(naVoz2.length > 0 ? { linhasNaVoz2: naVoz2 } : {}) }
  return Object.keys(estilo).length > 0 ? { ...semEstilo, estilo } : semEstilo
}

export interface CopyEfetiva {
  efetiva: CopyAutoral
  mudancas: MudancaDeBloco[]
  lacunas: string[]
}

/**
 * A leitura da efetiva quando o histórico da copy pode estar CHEIO. Desde o
 * PR2-02 (`e3c1f75f`), `aplicarRevisao` RECUSA a 201ª revisão com
 * `HistoricoDaCopyCheio`, e desde `9238098f` também o resultado que o leitor
 * recusaria (`RevisaoDaCopyInvalida`: a camada com linha acima de 300, mais de
 * 12 linhas, mais de 40 blocos) — e `copyEfetivaDasCamadas` propaga as duas. Quem grava
 * camadas não pode deixar essa recusa derrubar a escrita (o autosave do editor,
 * a peça já composta, a recomposição): `ok: false` diz que a mudança NÃO entra
 * no contrato, e o chamador segue sem gravar contrato novo, com o aviso.
 * Nunca se grava um contrato que a releitura rejeita, e nunca se apaga revisão
 * antiga para abrir espaço.
 */
export type LeituraDaEfetiva = { ok: true; leitura: CopyEfetiva } | { ok: false; recusa: HistoricoDaCopyCheio | RevisaoDaCopyInvalida; aviso: string }

/**
 * O aviso em português, com o que aconteceu, o que continua valendo e — quando a copy lida não cabe nos limites do
 * contrato (`RevisaoDaCopyInvalida`: linha acima de 300, mais de 12 linhas, mais de 40 blocos) — o que fazer.
 * `onde` completa "a mudança …".
 */
export function avisoDaRecusaDaCopy(recusa: HistoricoDaCopyCheio | RevisaoDaCopyInvalida, onde: string): string {
  const blocos = recusa.mudancas.map((m) => `"${m.id}"`).join(', ')
  const mudanca = `a mudança ${onde}${blocos ? ` (${blocos})` : ''} não foi registrada no contrato, que ficou como estava. O que foi desenhado segue valendo`
  if (recusa instanceof HistoricoDaCopyCheio) {
    return `O histórico da copy autoral chegou ao limite de ${recusa.copy.revisoes.length} revisões: ${mudanca}; para voltar a acompanhar a copy, mande-a de novo como contrato novo.`
  }
  return `A copy lida das camadas não cabe no contrato da copy autoral (${recusa.problemas.map((p) => p.mensagem).join('; ')}): ${mudanca}.${orientacaoEmFrase(orientacaoDosProblemas(recusa.problemas))}`
}

/** `copyEfetivaDasCamadas` sem deixar as recusas do contrato escaparem como exceção (ver `LeituraDaEfetiva`). Qualquer outro erro sobe. */
export function tentarCopyEfetivaDasCamadas(original: CopyAutoral, camadas: Layer[], opcoes: { superficie: string; em?: string }): LeituraDaEfetiva {
  try {
    return { ok: true, leitura: copyEfetivaDasCamadas(original, camadas, opcoes) }
  } catch (erro) {
    if (erro instanceof HistoricoDaCopyCheio || erro instanceof RevisaoDaCopyInvalida) {
      return { ok: false, recusa: erro, aviso: avisoDaRecusaDaCopy(erro, `lida das camadas (${opcoes.superficie})`) }
    }
    throw erro
  }
}

/**
 * Lê a copy efetiva das camadas e a registra como REVISÃO do sistema sobre o
 * original — só quando algo difere. `origemDaLeitura` é a superfície que
 * desenhou (compositor, ajuste-arte, editor…).
 */
export function copyEfetivaDasCamadas(original: CopyAutoral, camadas: Layer[], opcoes: { superficie: string; em?: string }): CopyEfetiva {
  const { porFuncao, voz2, soltas } = camadasPorFuncao(camadas)
  const lacunas: string[] = []
  // Por OBJETO, não por id: o compositor pode gravar duas camadas com o mesmo id (o contador de
  // `${papel}-${n}` recomeça em cada grupo), e por id a segunda sumia da leitura.
  const usadas = new Set<Layer>()
  // Os blocos livres são vinculados em CONJUNTO (ver `vincularExtras`), antes
  // de qualquer leitura por papel — e as camadas que eles tomam ficam
  // reservadas para eles.
  const extras = vincularExtras(blocosEmOrdem(original).filter((b) => b.funcao === 'livre'), camadas)
  lacunas.push(...extras.ambiguos)
  for (const c of extras.vinculos.values()) usadas.add(c)
  const blocosPorFuncao = new Map<FuncaoDoBloco, number>()
  for (const b of original.blocos) blocosPorFuncao.set(b.funcao, (blocosPorFuncao.get(b.funcao) ?? 0) + 1)
  const blocos: BlocoAutoral[] = blocosEmOrdem(original).map((b) => {
    if (b.funcao === 'livre') {
      // Bloco livre casa pelo ID da camada (a camada extra da F3 nasce com o id
      // do bloco) — ou pelo id `extra-…` que uma leitura anterior deu à camada
      // solta: sem isso a segunda leitura esvaziava o bloco e criava outro com o
      // mesmo id (R03 da revisão do Codex, 12/09/2026).
      const camada = extras.vinculos.get(b.id)
      if (!camada) {
        lacunas.push(`o bloco "${b.id}" (livre) não foi desenhado`)
        return { ...b, linhas: [] }
      }
      return { ...b, linhas: linhasDaCamada(camada) }
    }
    const livres = (porFuncao.get(b.funcao) ?? []).filter((c) => !usadas.has(c))
    // Bloco ÚNICO da função leva TODAS as camadas dela (PR3-R8-02): o compositor
    // reparte um bloco em `servico` e `servico-2` (um texto por linha do arranjo),
    // e a 2ª virava outro bloco `servico` — a recomposição morria em "papel repetido".
    const camadas = (blocosPorFuncao.get(b.funcao) ?? 0) === 1 ? livres : livres.slice(0, 1)
    if (camadas.length === 0) {
      lacunas.push(`o bloco "${b.id}" (${b.funcao}) não foi desenhado`)
      return comSegundaVoz({ ...b, linhas: [] }, [])
    }
    for (const c of camadas) usadas.add(c)
    let linhas = linhasRepartidas(b.linhas, camadas.map(linhasDaCamada))
    let naVoz2: number[] = []
    if (b.funcao === 'headline') {
      const segunda = voz2.find((c) => !usadas.has(c))
      if (segunda) {
        usadas.add(segunda)
        const daVoz2 = linhasDaCamada(segunda)
        const inicio = linhas.length
        linhas = [...linhas, ...daVoz2]
        naVoz2 = daVoz2.map((_, i) => inicio + i)
      }
    }
    return comSegundaVoz({ ...b, linhas }, naVoz2)
  })

  const restantes = [...soltas, ...[...porFuncao.values()].flat(), ...voz2].filter((c) => !usadas.has(c))
  let ordem = blocos.reduce((m, b) => Math.max(m, b.ordem), -1) + 1
  for (const c of restantes) {
    const papel = papelDaCamada(c)
    let id = idDeExtra(c)
    // Id único mesmo quando duas camadas soltas dão o mesmo apelido (só se o
    // hash colidir — o desempate reproduzível mora em `idDeExtra`).
    for (let n = 2; blocos.some((x) => x.id === id); n++) id = `${idDeExtra(c)}-${n}`
    blocos.push({
      id,
      funcao: papel && papel !== 'headline2' ? papel : 'livre',
      ordem: ordem++,
      linhas: linhasDaCamada(c),
    })
    lacunas.push(`a arte tem um texto que a copy não tinha: "${id}" (${String(c.content ?? '').slice(0, 40)})`)
  }

  const { copy: efetiva, mudancas } = aplicarRevisao(original, blocos, {
    autor: 'sistema',
    motivo: `o que foi desenhado (${opcoes.superficie})`,
    superficie: opcoes.superficie,
    ...(opcoes.em ? { em: opcoes.em } : {}),
  })
  // As lacunas entram DEPOIS da revisão, e o leitor tem teto para elas: o contrato leva só as que cabem (com uma de
  // resumo), e `lacunas` devolve a lista inteira para o registro da arte (restack sobre 9238098f, 13/09/2026).
  return { efetiva: lacunas.length ? { ...efetiva, lacunas: lacunasQueCabem(efetiva.lacunas ?? [], lacunas) } : efetiva, mudancas, lacunas }
}

const LACUNAS_DO_SCHEMA = copyAutoralSchema.shape.lacunas.unwrap()
/** Tetos lidos do PRÓPRIO schema, como no adaptador do legado. */
const MAX_LACUNAS_NA_COPY = LACUNAS_DO_SCHEMA._def.maxLength?.value ?? 20
const MAX_CARACTERES_DA_LACUNA = LACUNAS_DO_SCHEMA.element.maxLength ?? 200

/**
 * As lacunas que CABEM no contrato: as que a copy já tinha, mais as novas enquanto houver vaga — o que passar vira
 * UMA lacuna de resumo; lacuna acima do teto de caracteres é citada até ele, com "…". Lacuna é metadado da leitura,
 * nunca conteúdo: o texto dos blocos não passa por aqui.
 */
export function lacunasQueCabem(existentes: string[], novas: string[]): string[] {
  const citar = (l: string) => (l.length > MAX_CARACTERES_DA_LACUNA ? `${l.slice(0, MAX_CARACTERES_DA_LACUNA - 1)}…` : l)
  const vagas = MAX_LACUNAS_NA_COPY - existentes.length
  if (vagas <= 0) return existentes
  const citadas = novas.map(citar)
  if (citadas.length <= vagas) return [...existentes, ...citadas]
  const individuais = citadas.slice(0, vagas - 1)
  return [...existentes, ...individuais, `mais ${citadas.length - individuais.length} lacuna(s) da leitura das camadas`]
}

/**
 * O ESPELHO do contrato no formato posicional legado (`ItemDePlano.copyProposta`):
 * um item por bloco, na ordem de leitura, linhas unidas por "\n". Bloco vazio
 * vira item vazio, para a posição não deslizar — quem consome o espelho já
 * filtra vazio.
 */
export function espelhoPosicional(copy: CopyAutoral): string[] {
  return blocosEmOrdem(copy).map((b) => b.linhas.join('\n'))
}

/** Um contrato vazio-de-propósito é inválido pelo schema (min 1 bloco); este é o sentinela que o legado usa quando não há copy. */
export function copyVazia(): CopyAutoral {
  return { versao: VERSAO_DO_CONTRATO, origem: { autor: 'desconhecido' }, blocos: [{ id: 'sem-copy', funcao: 'livre', ordem: 0, linhas: [] }], revisoes: [], lacunas: ['sem copy'] }
}
