/**
 * A COPY EFETIVA — o que foi DESENHADO, lido das camadas da peça, no formato do
 * contrato. É a outra metade da fidelidade: o original é o que o autor
 * escreveu; a efetiva é o que a arte mostra. Quem grava as duas lado a lado
 * (`Generation.fieldValues.copyAutoral`) deixa a comparação inteira, bloco a
 * bloco, sem OCR.
 *
 * Como as camadas viram blocos:
 *  - 🔴 o VÍNCULO DECLARADO vence tudo: a camada que o compositor desenhou
 *    carrega, em `metadata.compositor`, o `bloco` do contrato que a originou e
 *    as `linhas` dele que ela desenha (`vinculoDaCamada`). Ela volta para ESSE
 *    bloco, e as linhas voltam para ESSAS posições — esconder, reexibir e
 *    editar o texto não mudam nada disso, porque a marca é da camada. Quem
 *    grava a marca é quem DESENHA (`montarBloco`), nunca esta leitura: deduzir
 *    depois é o que produziu PR3-R8-02, R9-02, R10-01 e R11-01/02, um por
 *    rodada (mesmo precedente de `spec.carrossel` → `Generation.slideOrder`);
 *  - sem a marca (página anterior a 20/09/2026, camada criada à mão no editor,
 *    arte de outra via) vale a RESERVA de sempre: o papel sai de
 *    `papelDaCamada` (metadata do compositor, id ou nome); com UM bloco da
 *    função no original, ele leva TODAS as camadas dela, juntas de cima para
 *    baixo (o compositor reparte o serviço em `servico` e `servico-2`, e ele
 *    volta a ser um bloco só — PR3-R8-02); com vários, uma camada por bloco na
 *    ORDEM vertical. Quem conta aqui são os blocos COM texto: o bloco
 *    explicitamente vazio não originou camada e não consome nenhuma
 *    (PR3-R10-01);
 *  - `headline2` é a SEGUNDA VOZ da manchete (o compositor tira a última linha
 *    do bloco para ela): as linhas dela voltam ao bloco `headline`, e a
 *    posição vira `estilo.linhasNaVoz2` — declarada, como o contrato pede. Ela
 *    entra pelo MESMO vínculo declarado e é somada ANTES de o bloco ser dado
 *    como não desenhado: com a primeira voz escondida, a manchete continua
 *    sendo a manchete, com uma linha só (PR3-R12-01);
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
 * O VÍNCULO que o compositor gravou na camada: o bloco do contrato que a
 * originou e as posições (0-based) das linhas dele que ela desenha. É a única
 * fonte de verdade sobre "de quem é esta camada" — texto igual, bloco vazio e
 * ordem visual são reserva, e foram justamente elas que erraram em PR3-R9-02
 * (editar as duas partes invertia a ordem), PR3-R10-01 e PR3-R11-01 (esconder e
 * reexibir passava o texto para o bloco vazio).
 *
 * Marca ausente ou com forma errada é DESCARTADA em silêncio (nunca recusa):
 * página anterior a 20/09/2026, camada criada à mão e arte de outra via seguem
 * pela reserva. `linhas` só vale como lista de inteiros não-negativos.
 */
export function vinculoDaCamada(l: Layer): { bloco: string; linhas: number[] | null } | null {
  const meta = (l.metadata as { compositor?: { bloco?: unknown; linhas?: unknown } } | undefined)?.compositor
  const bloco = typeof meta?.bloco === 'string' && meta.bloco.length > 0 ? meta.bloco : null
  if (!bloco) return null
  const linhas = Array.isArray(meta?.linhas) && meta.linhas.every((n) => Number.isInteger(n) && (n as number) >= 0) ? (meta.linhas as number[]) : null
  return { bloco, linhas }
}

/**
 * As linhas na ordem que as camadas DECLARAM, ou `null` quando a declaração não
 * cobre o desenho de hoje: camada sem marca, contagem que não bate (alguém
 * acrescentou ou apagou uma linha DENTRO da camada) ou posição repetida entre
 * camadas. Nesses casos vale a reserva — declaração incompleta não pode
 * reordenar meio bloco.
 */
function ordemDeclarada(porCamada: string[][], declaradas?: Array<number[] | null>): string[] | null {
  if (!declaradas || declaradas.length !== porCamada.length) return null
  const postas: Array<{ linha: string; pos: number }> = []
  const vistas = new Set<number>()
  for (let k = 0; k < porCamada.length; k++) {
    const pos = declaradas[k]
    if (!pos || pos.length !== porCamada[k].length) return null
    for (let i = 0; i < pos.length; i++) {
      if (vistas.has(pos[i])) return null
      vistas.add(pos[i])
      postas.push({ linha: porCamada[k][i], pos: pos[i] })
    }
  }
  return postas.sort((a, b) => a.pos - b.pos).map((o) => o.linha)
}

/**
 * As linhas de um bloco desenhado em VÁRIAS camadas, na ordem DO AUTOR.
 * Quem reordenou as partes foi o arranjo (o horário vai ao grupo do relógio, o
 * endereço ao do alfinete), não quem escreveu. Numa camada só a ordem é a da
 * camada — ali reordenar é edição.
 *
 * 🔴 O VÍNCULO DECLARADO manda: cada camada diz quais posições do bloco do
 * autor ela desenha, e as linhas voltam para elas — tenham mudado ou não
 * (PR3-R11-02, 20/09/2026). Sem a marca (ou com a camada ganhando/perdendo
 * linha, que a desalinha) vale a reserva: cada linha volta à POSIÇÃO AUTORAL da
 * linha IGUAL a ela, e a que mudou fica com a vaga que sobrou, na ordem visual
 * (PR3-R9-02). Antes a decisão era tudo-ou-nada — mesmo conjunto de linhas:
 * ordem do autor; qualquer diferença: ordem visual —, e então editar SÓ o
 * horário num arranjo que põe o endereço acima também INVERTIA as linhas do
 * contrato, sem ninguém ter movido camada; editar AS DUAS partes invertia
 * mesmo com a reserva, porque não sobrava nenhuma linha igual para ancorar.
 */
function linhasRepartidas(doBloco: string[], porCamada: string[][], declaradas?: Array<number[] | null>): string[] {
  const juntas = porCamada.flat()
  if (porCamada.length < 2) return juntas
  const porDeclaracao = ordemDeclarada(porCamada, declaradas)
  if (porDeclaracao) return porDeclaracao
  const casadas = new Set<number>()
  const posicoes = juntas.map((linha) => {
    const i = doBloco.findIndex((b, j) => !casadas.has(j) && b === linha)
    if (i >= 0) casadas.add(i)
    return i
  })
  const vagas = doBloco.map((_, j) => j).filter((j) => !casadas.has(j))
  let proxima = 0
  // Posição única para toda linha: casada → a do autor; editada → a vaga que
  // sobrou; acrescentada → depois do fim, na ordem visual.
  return juntas
    .map((linha, k) => ({ linha, pos: posicoes[k] >= 0 ? posicoes[k] : (vagas[proxima++] ?? doBloco.length + k) }))
    .sort((a, b) => a.pos - b.pos)
    .map((o) => o.linha)
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
  // 🔴 A RESERVA PELO VÍNCULO DECLARADO vem ANTES de qualquer outra regra e
  // vale para TODA camada de texto — principal, SEGUNDA VOZ e solta. A camada
  // volta para o bloco que ela declara e fica reservada para ele: nenhum outro
  // bloco a alcança, venha antes ou depois na ordem, e nenhuma outra regra
  // (identidade dos extras, contagem por função, ordem visual) a disputa.
  // A segunda voz entrava aqui por fora (ela vive na lista `voz2`, à parte), e
  // por isso esconder SÓ a primeira voz jogava a `headline2` para um bloco
  // `extra-…` de função `livre` — e a leitura seguinte a prendia lá pelo id,
  // com a recomposição recusada em `blocos sem papel do compositor com texto`
  // (PR3-R12-01 da revisão FINAL do Codex sobre 927d57b5, 20/09/2026).
  // Declaração de bloco fora do contrato, ou de papel incompatível com a função
  // dele, é descartada em silêncio (a camada segue pela reserva de sempre).
  const porId = new Map(original.blocos.map((b) => [b.id, b]))
  const declaradasDoBloco = new Map<string, Layer[]>()
  const vozesDoBloco = new Map<string, Layer[]>()
  for (const c of [...soltas, ...[...porFuncao.values()].flat(), ...voz2]) {
    const v = vinculoDaCamada(c)
    const bloco = v ? porId.get(v.bloco) : undefined
    if (!bloco) continue
    const papel = papelDaCamada(c)
    // `headline2` é a segunda voz da MANCHETE, não uma função própria; camada
    // que perdeu o papel (`null`) vale pelo que declara.
    const daVoz2 = papel === 'headline2' && bloco.funcao === 'headline'
    if (!daVoz2 && papel !== null && papel !== bloco.funcao) continue
    const destino = daVoz2 ? vozesDoBloco : declaradasDoBloco
    destino.set(v!.bloco, [...(destino.get(v!.bloco) ?? []), c])
    usadas.add(c)
  }
  // Os blocos livres são vinculados em CONJUNTO (ver `vincularExtras`) sobre o
  // que SOBROU da reserva declarada, antes de qualquer leitura por papel — e as
  // camadas que eles tomam ficam reservadas para eles.
  const extras = vincularExtras(blocosEmOrdem(original).filter((b) => b.funcao === 'livre'), camadas.filter((c) => !usadas.has(c)))
  lacunas.push(...extras.ambiguos)
  for (const c of extras.vinculos.values()) usadas.add(c)
  // Quem DISPUTA as camadas SEM vínculo de uma função são os blocos COM texto e
  // SEM camada declarada. Bloco explicitamente vazio (`linhas: []`) é "esta
  // camada fica sem texto": a conversão para a spec o OMITE
  // (`blocosParaOCompositor`), então ele nunca originou camada nenhuma e não
  // pode consumir uma — senão o texto do bloco preenchido migrava de id sem
  // ninguém ter editado nada, a página ficava com dois serviços e a recomposição
  // seguinte morria em `papel repetido` (PR3-R10-01, 20/09/2026).
  // Quando NENHUM bloco da função tem texto nem camada declarada, os vazios
  // voltam a disputar: aí a camada com texto é a de um bloco que alguém
  // preencheu no editor, e mandá-la para um `extra-…` trocaria o id do mesmo
  // jeito.
  const porFuncaoOnde = (filtro: (b: BlocoAutoral) => boolean) => {
    const conta = new Map<FuncaoDoBloco, number>()
    for (const b of original.blocos) if (filtro(b)) conta.set(b.funcao, (conta.get(b.funcao) ?? 0) + 1)
    return conta
  }
  const temDeclarada = (b: BlocoAutoral) => (declaradasDoBloco.get(b.id)?.length ?? 0) + (vozesDoBloco.get(b.id)?.length ?? 0) > 0
  // O bloco que o desenho SERVE — por texto no original ou por camada
  // declarada. Enquanto houver um irmão servido, o bloco vazio fica vazio e
  // calado: a arte mostra o que o autor pediu (nada), e a lacuna seria falsa.
  const servidosPorFuncao = porFuncaoOnde((b) => b.linhas.length > 0 || temDeclarada(b))
  const cheiosPorFuncao = porFuncaoOnde((b) => b.linhas.length > 0 && !temDeclarada(b))
  const vaziosPorFuncao = porFuncaoOnde((b) => b.linhas.length === 0 && !temDeclarada(b))
  const blocos: BlocoAutoral[] = blocosEmOrdem(original).map((b) => {
    if (b.funcao === 'livre') {
      // Bloco livre casa pelo ID da camada (a camada extra da F3 nasce com o id
      // do bloco) — ou pelo id `extra-…` que uma leitura anterior deu à camada
      // solta: sem isso a segunda leitura esvaziava o bloco e criava outro com o
      // mesmo id (R03 da revisão do Codex, 12/09/2026).
      // O vínculo declarado vem primeiro aqui também (hoje ninguém DESENHA
      // bloco `livre` — `validarSpec` o recusa com texto —, mas a regra é a
      // mesma para todo bloco: quem declara, leva).
      const declaradasLivres = declaradasDoBloco.get(b.id) ?? []
      const camadasDoLivre = declaradasLivres.length > 0 ? declaradasLivres : [extras.vinculos.get(b.id)].filter(Boolean)
      if (camadasDoLivre.length === 0) {
        lacunas.push(`o bloco "${b.id}" (livre) não foi desenhado`)
        return { ...b, linhas: [] }
      }
      return { ...b, linhas: linhasRepartidas(b.linhas, camadasDoLivre.map(linhasDaCamada), camadasDoLivre.map((c) => vinculoDaCamada(c)?.linhas ?? null)) }
    }
    const declaradas = declaradasDoBloco.get(b.id) ?? []
    const cheios = cheiosPorFuncao.get(b.funcao) ?? 0
    // Bloco vazio de propósito com irmão SERVIDO na mesma função: fica vazio,
    // sem consumir camada — e sem lacuna, porque a arte mostra exatamente o que
    // o autor pediu (nada).
    if (declaradas.length === 0 && b.linhas.length === 0 && (servidosPorFuncao.get(b.funcao) ?? 0) > 0) return comSegundaVoz({ ...b, linhas: [] }, [])
    const livres = (porFuncao.get(b.funcao) ?? []).filter((c) => !usadas.has(c))
    // Bloco ÚNICO da função leva TODAS as camadas dela (PR3-R8-02): o compositor
    // reparte um bloco em `servico` e `servico-2` (um texto por linha do arranjo),
    // e a 2ª virava outro bloco `servico` — a recomposição morria em "papel repetido".
    const concorrentes = cheios > 0 ? cheios : (vaziosPorFuncao.get(b.funcao) ?? 0)
    const camadas = declaradas.length > 0 ? declaradas : concorrentes === 1 ? livres : livres.slice(0, 1)
    for (const c of camadas) usadas.add(c)
    let linhas = camadas.length > 0 ? linhasRepartidas(b.linhas, camadas.map(linhasDaCamada), camadas.map((c) => vinculoDaCamada(c)?.linhas ?? null)) : []
    let naVoz2: number[] = []
    // A SEGUNDA VOZ é parte da MANCHETE, e por isso entra ANTES de concluir que
    // o bloco não foi desenhado: com a primeira voz escondida, o bloco continua
    // sendo a manchete com uma linha só — na voz 2 (PR3-R12-01). Sem vínculo,
    // vale a reserva de sempre: a primeira `headline2` livre da peça.
    const vozes = vozesDoBloco.get(b.id) ?? []
    const segundas = vozes.length > 0 ? vozes : b.funcao === 'headline' ? [voz2.find((c) => !usadas.has(c))].filter(Boolean) : []
    if (segundas.length > 0) {
      const daVoz2: string[] = []
      for (const c of segundas) {
        usadas.add(c)
        daVoz2.push(...linhasDaCamada(c))
      }
      const inicio = linhas.length
      linhas = [...linhas, ...daVoz2]
      naVoz2 = daVoz2.map((_, i) => inicio + i)
    }
    if (linhas.length === 0) {
      lacunas.push(`o bloco "${b.id}" (${b.funcao}) não foi desenhado`)
      return comSegundaVoz({ ...b, linhas: [] }, [])
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
