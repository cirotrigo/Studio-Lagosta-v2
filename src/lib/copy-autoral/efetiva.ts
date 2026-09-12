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
export function renomearExtrasDuplicados(copy: CopyAutoral, idsDeCamada: ReadonlyMap<string, string>): CopyAutoral {
  const mapa = new Map<string, string>()
  // A forma antiga do id colapsava camadas ("nota!" e "nota?" → `extra-nota-`
  // e `extra-nota--2`, na ordem das camadas): o vínculo legado segue a mesma
  // ordem, para a duplicação não trocar os blocos entre si (REV-03, 3ª rodada).
  const legado = new Map<string, string[]>()
  for (const [antigo, novo] of idsDeCamada) {
    mapa.set(idDeExtra(antigo), idDeExtra(novo))
    const chave = idDeExtraLegado(antigo)
    legado.set(chave, [...(legado.get(chave) ?? []), novo])
  }
  const trocaLegada = (id: string): string | null => {
    for (const [chave, novos] of legado) {
      const i = indiceLegado(id, chave)
      if (i !== null && novos[i] !== undefined) return idDeExtra(novos[i])
    }
    return null
  }
  const troca = (id: string) => mapa.get(id) ?? trocaLegada(id) ?? id
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
  const camadasEmOrdemDeLeitura = [...soltas, ...[...porFuncao.values()].flat(), ...voz2]
  const lacunas: string[] = []
  const usadas = new Set<string>()
  const blocos: BlocoAutoral[] = blocosEmOrdem(original).map((b) => {
    if (b.funcao === 'livre') {
      // Bloco livre casa pelo ID da camada (a camada extra da F3 nasce com o id
      // do bloco) — ou pelo id `extra-…` que uma leitura anterior deu à camada
      // solta: sem isso a segunda leitura esvaziava o bloco e criava outro com o
      // mesmo id (R03 da revisão do Codex, 12/09/2026).
      let camada = camadas.find((c) => ehTextoVisivel(c) && !usadas.has(c.id) && (c.id === b.id || c.name === b.id || idDeExtra(c) === b.id))
      if (!camada) {
        // Contrato gravado pela forma ANTIGA do id (`extra-nota` para a camada
        // "Nota"): reconhece o vínculo em vez de esvaziar o bloco e criar outro
        // com o mesmo texto — isso viraria revisão artificial da equipe na
        // próxima edição geométrica. Os blocos são visitados em ordem e cada um
        // consome uma camada, então `extra-nota` e `extra-nota-2` caem nas
        // camadas na mesma ordem em que a forma antiga as nomeou; havendo mais
        // de uma candidata no momento, a escolha é declarada em `lacunas`
        // (REV-03, 3ª rodada da revisão do Codex, 12/09/2026).
        const candidatas = camadasEmOrdemDeLeitura.filter((c) => !usadas.has(c.id) && indiceLegado(b.id, idDeExtraLegado(c)) !== null)
        camada = candidatas[0]
        if (camada && candidatas.length > 1) lacunas.push(`o bloco "${b.id}" usa a forma antiga do id e ${candidatas.length} camadas casavam com ela; ficou com a primeira na ordem de leitura ("${camada.id}")`)
      }
      if (!camada) {
        lacunas.push(`o bloco "${b.id}" (livre) não foi desenhado`)
        return { ...b, linhas: [] }
      }
      usadas.add(camada.id)
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
