/**
 * A COPY EFETIVA — o que foi DESENHADO, lido das camadas da peça, no formato do
 * contrato. É a outra metade da fidelidade: o original é o que o autor
 * escreveu; a efetiva é o que a arte mostra. Quem grava as duas lado a lado
 * (`Generation.fieldValues.copyAutoral`) deixa a comparação inteira, bloco a
 * bloco, sem OCR.
 *
 * Como as camadas viram blocos:
 *  - o papel de cada camada sai de `papelDaCamada` (metadata do compositor,
 *    id ou nome); camadas do mesmo papel se atribuem aos blocos daquela
 *    função na ORDEM vertical (o serviço com duas linhas vira `servico` e
 *    `servico-2` na página, e volta para os dois blocos de serviço em ordem);
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
import { VERSAO_DO_CONTRATO, type BlocoAutoral, type CopyAutoral, type FuncaoDoBloco } from './contrato'
import { blocosEmOrdem } from './validar'
import { aplicarRevisao, type MudancaDeBloco } from './revisao'

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
  const { vinculos } = vincularExtras(blocosEmOrdem(copy).filter((b) => b.funcao === 'livre'), camadasOriginais)
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
 *  3. o que sobrar: entre as candidatas livres, a de TEXTO igual ao do bloco;
 *     senão a primeira na ORDEM DE LEITURA (a mesma que nomeou os sufixos),
 *     com a ambiguidade declarada em `ambiguos`.
 * As camadas entram na ordem de leitura (y, x), soltas primeiro — nunca na
 * ordem do array.
 */
export function vincularExtras(blocosLivres: BlocoAutoral[], camadas: Layer[]): { vinculos: Map<string, Layer>; ambiguos: string[] } {
  const { porFuncao, voz2, soltas } = camadasPorFuncao(camadas)
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
  // 2. propagação: bloco com UMA candidata livre a toma, até estabilizar
  for (let mudou = true; mudou; ) {
    mudou = false
    for (const b of [...pendentes]) {
      const cs = candidatasDe(b)
      if (cs.length === 1) {
        tomar(b, cs[0])
        mudou = true
      }
    }
  }
  // 3. o resto: texto igual, senão a primeira na ordem de leitura (declarado)
  for (const b of [...pendentes]) {
    const cs = candidatasDe(b)
    if (cs.length === 0) continue
    const mesmoTexto = cs.filter((c) => JSON.stringify(linhasDaCamada(c)) === JSON.stringify(b.linhas))
    const escolhida = mesmoTexto.length === 1 ? mesmoTexto[0] : (mesmoTexto[0] ?? cs[0])
    if (mesmoTexto.length !== 1) ambiguos.push(`o bloco "${b.id}" casava com ${cs.length} camadas pelo id; ficou com "${escolhida.id}" (${mesmoTexto.length > 1 ? 'texto igual, primeira na ordem de leitura' : 'primeira na ordem de leitura'})`)
    tomar(b, escolhida)
  }
  return { vinculos, ambiguos }
}

function ehTextoVisivel(l: Layer): boolean {
  return (l.type === 'text' || l.type === 'rich-text') && l.visible !== false
}

function linhasDaCamada(l: Layer): string[] {
  const ricas = linhasComColchetes(l)
  if (ricas) return ricas
  return String(l.content ?? '').split('\n')
}

/** As camadas de texto agrupadas por função, de cima para baixo. */
function camadasPorFuncao(camadas: Layer[]): { porFuncao: Map<FuncaoDoBloco, Layer[]>; voz2: Layer[]; soltas: Layer[] } {
  const porFuncao = new Map<FuncaoDoBloco, Layer[]>()
  const voz2: Layer[] = []
  const soltas: Layer[] = []
  const ordenadas = camadas.filter(ehTextoVisivel).sort((a, b) => (a.position?.y ?? 0) - (b.position?.y ?? 0) || (a.position?.x ?? 0) - (b.position?.x ?? 0))
  for (const c of ordenadas) {
    const papel = papelDaCamada(c)
    if (papel === 'headline2') voz2.push(c)
    else if (papel) porFuncao.set(papel, [...(porFuncao.get(papel) ?? []), c])
    else soltas.push(c)
  }
  return { porFuncao, voz2, soltas }
}

export interface CopyEfetiva {
  efetiva: CopyAutoral
  mudancas: MudancaDeBloco[]
  lacunas: string[]
}

/**
 * Lê a copy efetiva das camadas e a registra como REVISÃO do sistema sobre o
 * original — só quando algo difere. `origemDaLeitura` é a superfície que
 * desenhou (compositor, ajuste-arte, editor…).
 */
export function copyEfetivaDasCamadas(original: CopyAutoral, camadas: Layer[], opcoes: { superficie: string; em?: string }): CopyEfetiva {
  const { porFuncao, voz2, soltas } = camadasPorFuncao(camadas)
  const lacunas: string[] = []
  const usadas = new Set<string>()
  // Os blocos livres são vinculados em CONJUNTO (ver `vincularExtras`), antes
  // de qualquer leitura por papel — e as camadas que eles tomam ficam
  // reservadas para eles.
  const extras = vincularExtras(blocosEmOrdem(original).filter((b) => b.funcao === 'livre'), camadas)
  lacunas.push(...extras.ambiguos)
  for (const c of extras.vinculos.values()) usadas.add(c.id)
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
    const fila = porFuncao.get(b.funcao) ?? []
    const camada = fila.find((c) => !usadas.has(c.id))
    if (!camada) {
      lacunas.push(`o bloco "${b.id}" (${b.funcao}) não foi desenhado`)
      return { ...b, linhas: [] }
    }
    usadas.add(camada.id)
    let linhas = linhasDaCamada(camada)
    let estilo = b.estilo
    if (b.funcao === 'headline' && voz2.length > 0) {
      const segunda = voz2.find((c) => !usadas.has(c.id))
      if (segunda) {
        usadas.add(segunda.id)
        const daVoz2 = linhasDaCamada(segunda)
        const inicio = linhas.length
        linhas = [...linhas, ...daVoz2]
        estilo = { ...(estilo ?? {}), linhasNaVoz2: daVoz2.map((_, i) => inicio + i) }
      }
    }
    return { ...b, linhas, ...(estilo ? { estilo } : {}) }
  })

  const restantes = [...soltas, ...[...porFuncao.values()].flat(), ...voz2].filter((c) => !usadas.has(c.id))
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
  return { efetiva: lacunas.length ? { ...efetiva, lacunas: [...(efetiva.lacunas ?? []), ...lacunas] } : efetiva, mudancas, lacunas }
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
