/**
 * A DEFASAGEM de uma peça composta: a página foi editada depois de a arte ter
 * sido feita, e a arte que está no post continua sendo a antiga.
 *
 * Para a peça de imagem ÚNICA isso já era resolvido — o PATCH da página chama
 * `invalidateScheduledRenders`, o post volta para `PENDING` e o cron
 * `render-stories` refaz a arte. Para o SLIDE DE CARROSSEL não acontecia nada:
 * post de carrossel nasce `NOT_NEEDED` e sem `pageId` (a arte entra por
 * `mediaUrls`), justamente porque `renderPostArt` grava `mediaUrls: [url]` —
 * uma lista de UM — e um post `RENDERED` de 5 slides perderia 4 no primeiro
 * re-render. A proteção evitava o estrago e, no mesmo movimento, abandonava a
 * edição: em 04/09/2026, sete slides do projeto 8 iriam ao ar com a copy
 * anterior, sem log, aviso ou status.
 *
 * Módulo PURO (sem Prisma, sem sharp), como `troca-de-arte.ts` e
 * `page-layers.ts`: `@/lib/db` lê `DATABASE_URL` no import e LANÇA quando ela
 * falta, o que tornaria estas regras não-testáveis. Quem fala com o banco é
 * `recompor.ts`.
 *
 * Duas decisões moram aqui, e as duas custaram caro em 04/09:
 *
 * 1. **A defasagem se mede por CONTEÚDO, nunca por carimbo de hora.**
 *    `Page.updatedAt` muda em qualquer escrita — naquele dia um `update` de
 *    `order` em 30 páginas apagou o sinal de uma vez só.
 * 2. **Recompor só quando a página é a que o compositor pousou.** Recompor
 *    reconstrói TODAS as camadas a partir da spec: se alguém moveu uma caixa,
 *    escondeu um bloco ou acrescentou uma camada à mão, isso seria jogado
 *    fora em silêncio. Nesse caso a arte é só re-renderizada como está — a
 *    edição chega ao post do mesmo jeito (que é o defeito) e o trabalho
 *    manual sobrevive.
 */

import type { Layer } from '@/types/template'
import { copyDeCamadas } from '@/lib/aprendizado/diff-copy'
import { diffDeGeometria, type DiffDeGeometria } from '@/lib/aprendizado/diff-geometria'
import { lerCamadas } from '@/lib/posts/page-layers'
import { renderDaPaginaCobreAMidia } from '@/lib/posts/render-da-pagina'
import { ehClipe } from '@/lib/video/camadas-de-video'
import { temGradeVisivel, vinculadaAGrade } from '@/lib/grades/presenca'

import type { CropPosition } from '@/lib/image-crop-utils'
import { CreativeError } from '@/lib/creatives/errors'
import type { VarianteDaLogo } from './legibilidade-da-logo'

import { linhasComColchetes } from './destaques'
import { CANTOS, PAPEIS, type Canto, type Papel, type SpecDePeca } from './spec'
import { PAPEIS_DO_ARQUETIPO } from './arquetipos/tipos'
import { lerAcentosGravados, type AcentoCongelado } from './arquetipos/acentos'
import { lerReceitaDaMascara, type CaixaDaMascara, type ReceitaDaMascara } from './arquetipos/mascara'
import { MODO_BUSCA_ESPACIAL, type EscolhaEspacial, type EscolhaParaReproduzir, type MembroDaFaixa, type ResumoDaBuscaOriginal } from './arquetipos/busca-espacial-tipos'

/**
 * Como `copyDosPapeis`, mas a camada RICH TEXT volta com os [colchetes] nos
 * trechos destacados. A recomposição refaz a peça pela spec: sem os colchetes,
 * o destaque sumiria na primeira edição de texto — e a peça voltaria a ser
 * texto simples sem ninguém ter pedido.
 */
export function copyDosPapeisComDestaque(camadas: unknown): Record<string, string> | null {
  const { camadas: lidas, legivel } = lerCamadas(camadas)
  if (!legivel) return null
  const itens: TextoDePapel[] = []
  for (const bruta of lidas as Layer[]) {
    if ((bruta?.type !== 'text' && bruta?.type !== 'rich-text') || bruta.visible === false) continue
    const papel = papelDaCamada(bruta)
    if (!papel) continue
    const marcadas = linhasComColchetes(bruta)
    const conteudo = marcadas ? marcadas.join('\n').trim() : typeof bruta.content === 'string' ? bruta.content.trim() : ''
    if (conteudo) itens.push({ papel, y: bruta.position?.y ?? 0, conteudo })
  }
  return juntarPorPapel(itens)
}

/** O id do bloco que a camada EXTRA declara (`metadata.compositor.extra.id`, PR 9), ou null. */
export function idDoExtraDaCamada(camada: Layer): string | null {
  const id = (camada.metadata as { compositor?: { extra?: { id?: unknown } } } | undefined)?.compositor?.extra?.id
  return typeof id === 'string' && id ? id : null
}

export interface CopyPorIdentidade {
  /** O texto por PAPEL, só das camadas comuns — a camada extra nunca entra no papel da função dela. */
  papeis: Record<string, string>
  /**
   * O texto de cada camada EXTRA, pelo id do bloco que ela declara. Objeto SEM
   * protótipo (R04 da revisão dos patches do PR 10): o id é do autor, e
   * "constructor" ou "toString" são ids permitidos — num `{}` a leitura do
   * extra esvaziado achava a propriedade herdada. Leia por
   * `textoDoExtraNaPagina`, que confere existência e tipo.
   */
  extras: Record<string, string>
}

/** O texto BRUTO do extra `id` na página, ou null — só propriedade PRÓPRIA e string (R04). */
export function textoDoExtraNaPagina(lida: CopyPorIdentidade, id: string): string | null {
  if (!Object.prototype.hasOwnProperty.call(lida.extras, id)) return null
  const texto = lida.extras[id]
  return typeof texto === 'string' ? texto : null
}

/**
 * A camada tem TEXTO — decisão separada da transformação das linhas (R03 da
 * revisão dos patches do PR 10). Só espaço e quebra é ausência; o conteúdo que
 * volta à spec é o BRUTO, com os respiros de borda.
 */
const temTexto = (conteudo: string): boolean => conteudo.trim().length > 0

/**
 * A copy da página separada por IDENTIDADE (PR 10): as camadas comuns por
 * papel, como `copyDosPapeisComDestaque`, e as camadas EXTRAS pelo id que cada
 * uma declara — com os [colchetes] de volta nas duas.
 *
 * 🔴 Ler o extra pelo papel da função dele era o defeito: o serviço que herda o
 * estilo do apoio tem `metadata.compositor.papel = 'servico'`, e a recomposição
 * juntava o texto dele ao do serviço comum, tirava o `herdaDe` e o `id`, e a
 * spec voltava ao compositor sem a camada extra — numa variante sem `servico`
 * a peça era recusada (`PAPEIS_INCOMPATIVEIS`) e o slide ficava com a arte
 * antiga; o livre (sem papel) simplesmente não era lido.
 */
export function copyDaPaginaPorIdentidade(camadas: unknown): CopyPorIdentidade | null {
  const { camadas: lidas, legivel } = lerCamadas(camadas)
  if (!legivel) return null
  const itens: TextoDePapel[] = []
  // Sem protótipo: o id do extra é do autor (R04).
  const extras: Record<string, string> = Object.create(null)
  for (const bruta of lidas as Layer[]) {
    if ((bruta?.type !== 'text' && bruta?.type !== 'rich-text') || bruta.visible === false) continue
    const marcadas = linhasComColchetes(bruta)
    // O conteúdo BRUTO (R03): `trim()` aqui apagava o respiro inicial e o final
    // ("\nvale só no almoço\n" voltava como uma linha só) e mudava a copy em
    // silêncio na recomposição sem contrato. O contrato já lê a camada assim
    // (`linhasDaCamada`, em `efetiva.ts`).
    const conteudo = marcadas ? marcadas.join('\n') : typeof bruta.content === 'string' ? bruta.content : ''
    if (!temTexto(conteudo)) continue
    const idDoExtra = idDoExtraDaCamada(bruta)
    if (idDoExtra) {
      extras[idDoExtra] = conteudo
      continue
    }
    const papel = papelDaCamada(bruta)
    if (papel) itens.push({ papel, y: bruta.position?.y ?? 0, conteudo })
  }
  return { papeis: juntarPorPapel(itens), extras }
}

interface TextoDePapel {
  papel: string
  y: number
  conteudo: string
}

/**
 * Os textos de um mesmo papel, de cima para baixo, numa copy só. Desde que a
 * peça nasce de combinações (11/09/2026), um papel pode ter mais de um texto —
 * o serviço com "Local" e "Horário", cada um com o seu ícone — e ler só um
 * deles faria a recomposição perder a outra linha.
 */
function juntarPorPapel(itens: TextoDePapel[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const item of [...itens].sort((a, b) => a.y - b.y)) {
    out[item.papel] = out[item.papel] ? `${out[item.papel]}\n${item.conteudo}` : item.conteudo
  }
  return out
}

/** Os papéis que uma camada de texto do compositor pode carregar. */
const PAPEIS_DA_PECA: readonly string[] = [...PAPEIS, 'headline2']

/**
 * O papel de uma camada. A fonte boa é `metadata.compositor.papel` (gravado
 * por `camadaDoPapel`); `id`/`name` são o mesmo valor e servem de reserva para
 * quem renomear a camada no editor.
 */
export function papelDaCamada(camada: Layer): Papel | 'headline2' | null {
  const meta = camada.metadata as { compositor?: { papel?: string } } | undefined
  // Cada fonte é conferida sozinha: página feita à mão tem id próprio
  // ("dia-no-quintal-headline") e o papel só no nome — com `??`, o id que não
  // é papel escondia o nome que é.
  for (const candidato of [meta?.compositor?.papel, camada.id, camada.name]) {
    if (PAPEIS_DA_PECA.includes(String(candidato))) return candidato as Papel | 'headline2'
  }
  return null
}

/**
 * A copy da peça por PAPEL, lida das camadas. `null` = camadas ilegíveis.
 *
 * Camada oculta fica de fora pelo mesmo motivo de `textosDaPagina`: desde
 * 13/08/2026 o campo que a copy não cobre sai invisível, e contá-lo poria na
 * peça um texto que não está na arte. Rich text entra, pelo mesmo motivo de
 * lá: converter a linha no editor não tira o texto da peça.
 */
export function copyDosPapeis(camadas: unknown): Record<string, string> | null {
  const { camadas: lidas, legivel } = lerCamadas(camadas)
  if (!legivel) return null
  const itens: TextoDePapel[] = []
  for (const bruta of lidas as Layer[]) {
    if ((bruta?.type !== 'text' && bruta?.type !== 'rich-text') || bruta.visible === false) continue
    const papel = papelDaCamada(bruta)
    if (!papel) continue
    const conteudo = typeof bruta.content === 'string' ? bruta.content.trim() : ''
    // O papel repartido em várias camadas (`servico` e `servico-2`) volta junto, de cima para baixo (PR3-R8-02).
    if (conteudo) itens.push({ papel, y: bruta.position?.y ?? 0, conteudo })
  }
  return juntarPorPapel(itens)
}

/**
 * A foto de fundo da PÁGINA — a verdade sobre a imagem da peça.
 *
 * 🔴 Nem toda spec tem foto. Duas peças de 04/09 tinham `spec.foto`
 * indefinida porque a imagem foi posta à mão no editor depois de compor;
 * recompor pela spec devolveu a peça com FUNDO PRETO, sem erro nenhum.
 */
export function fotoDaPagina(camadas: unknown): string | null {
  const { camadas: lidas, legivel } = lerCamadas(camadas)
  if (!legivel) return null
  const imagens = (lidas as Layer[]).filter((c) => c?.type === 'image')
  const fundo = imagens.find((c) => c.id === 'bg-foto') ?? imagens[0]
  if (!fundo) return null
  const daCamada = typeof fundo.fileUrl === 'string' ? fundo.fileUrl : ''
  const doEstilo = (fundo.style as { backgroundImageUrl?: unknown } | undefined)?.backgroundImageUrl
  return daCamada || (typeof doEstilo === 'string' ? doEstilo : '') || null
}

export interface Defasagem {
  /** Não deu para ler um dos lados — nunca vira "não mudou nada". */
  ilegivel: boolean
  /** O texto — ou a FOTO — da página não é mais o com que a arte foi feita. */
  defasada: boolean
  /**
   * A foto de fundo da página não é a da arte (PR 10): trocada no editor. Até
   * aqui só o texto contava, e a foto trocada num slide de carrossel nunca
   * chegava ao post — a página parecia "em dia" para `precisaRefazer`.
   * `medirDefasagem` sempre preenche; opcional só no tipo, para quem monta uma
   * defasagem à mão (testes) — `defasada` já a inclui.
   */
  fotoTrocada?: boolean
  /** Os papéis (ou nomes de camada) cujo texto mudou. */
  papeis: string[]
  /**
   * A página continua sendo a que o compositor pousou, só com texto diferente
   * — então dá para recompor sem apagar trabalho de ninguém.
   */
  soTexto: boolean
  /** O que foi mexido à mão, em português — vira aviso de quem editou. */
  mexidoNaMao: string[]
}

/**
 * A altura de uma caixa de TEXTO é derivada, não decisão de ninguém: o modo
 * Auto (`autoExpand`) a re-mede sozinho quando o texto muda — e até quando só
 * a fonte termina de carregar. Contá-la como "mexeu à mão" faria toda edição
 * de texto cair no caminho conservador, e a recomposição nunca aconteceria.
 * Tudo o mais (posição, largura, corpo da fonte, alinhamento, visibilidade,
 * camada acrescentada ou removida, e qualquer delta em camada que não é
 * texto) é decisão de gente e desliga a recomposição.
 *
 * O rótulo é SÓ texto de aviso: toda decisão (`soTexto`, `precisaRefazer`,
 * `paginaMudouDesde`) lê a CONTAGEM destes motivos, nunca o nome.
 * `extraDaCamada` (id da camada → id que ela DECLARA como extra) vem de
 * `medirDefasagem`; sem ele, nenhuma camada é tratada como extra.
 */
export function mexeuNaMao(diff: DiffDeGeometria, extraDaCamada: ReadonlyMap<string, string> = new Map()): string[] {
  const motivos: string[] = []
  for (const id of diff.adicionadas) motivos.push(`camada "${id}" acrescentada à mão`)
  for (const id of diff.removidas) motivos.push(`camada "${id}" removida à mão`)
  for (const d of diff.deltas) {
    // A camada EXTRA tem o papel da FUNÇÃO (o serviço que herda do apoio diz
    // `servico`) e um id que não deriva dele: nomeá-la pelo papel diria
    // "servico foi movida" numa peça que também tem o serviço comum (PR 10).
    // 🔴 Quem diz que a camada é o extra é a identidade DECLARADA
    // (`metadata.compositor.extra.id`), nunca o formato do id: `idReservado` só
    // proíbe `<papel>-N` numérico, então o extra `servico-fds` (id aceito)
    // começava por `servico-` e saía como "servico" — a inferência pelo id que
    // o PR9-F02 tirou da duplicação, num lugar novo (varredura do 2º restack
    // do PR 10, 21/09/2026).
    const extra = extraDaCamada.get(d.id)
    const idDoPapel = !extra && !!d.papel && (d.id === d.papel || d.id.startsWith(`${d.papel}-`))
    const quem = extra ?? (d.papel && idDoPapel ? d.papel : d.id)
    if (d.dx || d.dy) {
      motivos.push(`"${quem}" foi movida (${d.dx >= 0 ? '+' : ''}${d.dx}, ${d.dy >= 0 ? '+' : ''}${d.dy}px)`)
    }
    if (d.dw) motivos.push(`a caixa de "${quem}" mudou de largura (${d.dw >= 0 ? '+' : ''}${d.dw}px)`)
    if (d.tipo !== 'text' && d.dh) motivos.push(`"${quem}" mudou de altura (${d.dh >= 0 ? '+' : ''}${d.dh}px)`)
    if (d.escalaDaFonte !== null) motivos.push(`a fonte de "${quem}" foi mudada (×${d.escalaDaFonte})`)
    if (d.alinhamento) motivos.push(`"${quem}" foi realinhada (${d.alinhamento.antes} → ${d.alinhamento.depois})`)
    if (d.visibilidade) motivos.push(d.visibilidade.depois ? `"${quem}" foi religada` : `"${quem}" foi escondida`)
  }
  return motivos
}

/**
 * Camadas que mudaram de TIPO entre a arte e a página — a conversão para rich
 * text no editor é o caso real. Recompor reconstrói cada camada pelo papel, em
 * texto simples: os trechos estilizados iriam embora em silêncio, e com eles a
 * edição de quem converteu. Por isso mudar o tipo conta como ajuste manual.
 */
function mudancasDeTipo(antes: unknown, depois: unknown): string[] {
  const a = lerCamadas(antes)
  const d = lerCamadas(depois)
  if (!a.legivel || !d.legivel) return []
  const tipoAntes = new Map((a.camadas as Layer[]).map((c) => [c.id, c.type]))
  const motivos: string[] = []
  for (const camada of d.camadas as Layer[]) {
    const anterior = tipoAntes.get(camada.id)
    if (!anterior || anterior === camada.type) continue
    const quem = papelDaCamada(camada) ?? camada.id
    motivos.push(
      camada.type === 'rich-text'
        ? `"${quem}" foi convertida para rich text`
        : `"${quem}" mudou de tipo (${anterior} → ${camada.type})`,
    )
  }
  return motivos
}

/**
 * O ENQUADRAMENTO da foto mudou à mão (PR 10): corte, posição do corte ou modo
 * de encaixe da camada de imagem, que o diff de geometria não enxerga (ele olha
 * caixa, fonte, alinhamento e visibilidade). Recompor escolhe o corte de novo
 * pelo mapa de calma e jogaria fora o que a pessoa acertou — conta como ajuste
 * manual, e a arte é só re-renderizada como está.
 *
 * A MÁSCARA também (#9, A-07, 25/10/2026): acrescentada, removida ou trocada
 * (`shapeId` ou `path`) pela barra de imagem, a recomposição a redesenharia pela
 * receita — ou a apagaria, no legado — em silêncio. Comparada por VALOR das duas
 * chaves (a ordem não importa; ausência = ausência), sem validar nem normalizar
 * o SVG.
 */
function mudancasDeEnquadramento(antes: unknown, depois: unknown): string[] {
  const a = lerCamadas(antes)
  const d = lerCamadas(depois)
  if (!a.legivel || !d.legivel) return []
  const enquadramento = (c: Layer) => {
    const estilo = (c.style ?? {}) as { crop?: unknown; cropPosition?: unknown; objectFit?: unknown; mask?: unknown }
    const mascara = ehObjeto(estilo.mask) ? [estilo.mask.shapeId ?? null, estilo.mask.path ?? null] : [null, null]
    return JSON.stringify([estilo.crop ?? null, estilo.cropPosition ?? null, estilo.objectFit ?? null, ...mascara])
  }
  const imagensAntes = new Map((a.camadas as Layer[]).filter((c) => c?.type === 'image').map((c) => [c.id, c]))
  const motivos: string[] = []
  for (const camada of d.camadas as Layer[]) {
    if (camada?.type !== 'image') continue
    const anterior = imagensAntes.get(camada.id)
    if (anterior && enquadramento(anterior) !== enquadramento(camada)) motivos.push(`o enquadramento da imagem "${camada.id}" foi ajustado à mão`)
  }
  return motivos
}

/**
 * Página com linha do tempo (qualquer camada `clipe`) é ajuste manual: a
 * recomposição reconstrói todas as camadas e apagaria a sequência; re-render
 * como está é o caminho seguro.
 */
function clipesDaLinhaDoTempo(camadasDaPagina: unknown): string[] {
  const d = lerCamadas(camadasDaPagina)
  if (!d.legivel) return []
  return (d.camadas as Layer[]).some((c) => ehClipe(c)) ? ['a página tem clipes na linha do tempo'] : []
}

/**
 * G4.5 (27/10/2026): foto trocada numa célula de GRADE, qualquer uma — `fotoDaPagina` só olha a primeira imagem, e a
 * troca da segunda foto da grade deixava o slide publicando a anterior. Comparada por id nos dois lados (`''` e
 * ausente são a mesma célula vazia).
 */
function fotosDaGradeTrocadas(antes: unknown, depois: unknown): string[] {
  const a = lerCamadas(antes)
  const d = lerCamadas(depois)
  if (!a.legivel || !d.legivel) return []
  const url = (c: Layer | undefined) => (typeof c?.fileUrl === 'string' ? c.fileUrl : '')
  const daArte = new Map((a.camadas as Layer[]).filter((c) => c && vinculadaAGrade(c)).map((c) => [c.id, c]))
  const motivos: string[] = []
  for (const c of d.camadas as Layer[]) {
    if (!c || !vinculadaAGrade(c)) continue
    const anterior = daArte.get(c.id)
    if (anterior && url(anterior) !== url(c)) motivos.push(`a foto da célula "${c.id}" da grade foi trocada`)
  }
  return motivos
}

/**
 * A página de hoje contra o SNAPSHOT do que foi composto
 * (`Generation.fieldValues.layersSnapshot`).
 */
export function medirDefasagem(camadasDaPagina: unknown, snapshot: unknown): Defasagem {
  const agora = copyDeCamadas(camadasDaPagina)
  const antes = copyDeCamadas(snapshot)
  if (!agora || !antes) {
    return { ilegivel: true, defasada: false, fotoTrocada: false, papeis: [], soTexto: false, mexidoNaMao: [] }
  }

  const papeis = [...new Set([...Object.keys(antes), ...Object.keys(agora)])]
    .filter((k) => (antes[k] ?? '') !== (agora[k] ?? ''))
    .sort()

  const diff = diffDeGeometria(snapshot, camadasDaPagina)
  // A camada que DECLARA ser extra, nos dois lados (a página vence): é por ela, e não pelo formato do id, que o aviso
  // de ajuste manual nomeia o extra.
  const extraDaCamada = new Map<string, string>()
  for (const l of [...lerCamadas(snapshot).camadas, ...lerCamadas(camadasDaPagina).camadas] as Layer[]) {
    const extra = l && typeof l.id === 'string' ? idDoExtraDaCamada(l) : null
    if (extra) extraDaCamada.set(l.id, extra)
  }
  const motivos = diff.ilegivel
    ? ['não deu para comparar a geometria da página com a da arte']
    : [
        ...mexeuNaMao(diff, extraDaCamada),
        ...mudancasDeTipo(snapshot, camadasDaPagina),
        ...mudancasDeEnquadramento(snapshot, camadasDaPagina),
        ...clipesDaLinhaDoTempo(camadasDaPagina),
        ...fotosDaGradeTrocadas(snapshot, camadasDaPagina),
      ]

  // A foto trocada é defasagem como o texto editado (PR 10). Só conta quando a
  // foto existe dos dois lados: camada de imagem acrescentada ou removida já
  // aparece no diff de geometria como ajuste manual.
  const fotoAntes = fotoDaPagina(snapshot)
  const fotoAgora = fotoDaPagina(camadasDaPagina)
  const fotoTrocada = (!!fotoAntes && !!fotoAgora && fotoAntes !== fotoAgora) || fotosDaGradeTrocadas(snapshot, camadasDaPagina).length > 0

  return {
    ilegivel: false,
    defasada: papeis.length > 0 || fotoTrocada,
    fotoTrocada,
    papeis,
    // G4.5: grade de fotos é composição manual — recompor pela spec a desmontaria em UMA foto. A peça com grade (de um
    // lado ou do outro) só é re-renderizada como está; nada entra em `mexidoNaMao`, que não acusa mudança sem mudança.
    soTexto: motivos.length === 0 && !temGradeVisivel(camadasDaPagina) && !temGradeVisivel(snapshot),
    mexidoNaMao: motivos,
  }
}

/**
 * A página mudou desde `referencia` — as camadas que a arte reflete — no que a
 * recomposição CONSOME? É a pergunta do fim do job (R01 da revisão dos patches
 * do PR 10, 12/09/2026).
 *
 * O job de recomposição que está RODANDO não é reaberto pelo enfileiramento:
 * a edição salva depois da gravação da página e antes do fim do job só chega à
 * arte se o próprio job pedir outra tentativa. A conferência antiga comparava
 * só a COPY — a foto trocada nessa janela terminava o job com o slide
 * mostrando B e a página mostrando C. Aqui a pergunta é a MESMA que a próxima
 * execução faz (`medirDefasagem` contra as camadas da arte): texto de toda
 * camada visível (extras inclusive), foto de fundo, enquadramento
 * (`crop`/`cropPosition`/`objectFit`), geometria, tipo e camada acrescentada ou
 * removida. Perguntar outra coisa geraria tentativa que não acha trabalho — ou
 * trabalho que ninguém tenta.
 *
 * Ilegível responde `false`, como a conferência antiga: tentar de novo sobre
 * camadas que não se leem não converge, e a próxima escrita reenfileira.
 */
export function paginaMudouDesde(referencia: unknown, camadasAgora: unknown): boolean {
  const d = medirDefasagem(camadasAgora, referencia)
  return !d.ilegivel && (d.defasada || d.mexidoNaMao.length > 0)
}

/**
 * O que mudou na página, em português da equipe — o motivo que vai para o job
 * e para o histórico do post quando a edição feita durante a recomposição não
 * chega à arte (C10-11 da pré-revisão do commit 3fad6ba2). Diz texto e foto
 * quando a defasagem os distingue; o resto (caixa movida, corte, camada) é
 * "a página foi alterada". Sem jargão de fila nem de levantamento.
 */
export function edicaoDuranteOJob(defasagem: Defasagem): string {
  const texto = defasagem.papeis.length > 0
  const foto = defasagem.fotoTrocada === true
  if (texto && foto) return 'o texto e a foto da página foram alterados enquanto a arte era atualizada'
  if (foto) return 'a foto da página foi trocada enquanto a arte era atualizada'
  if (texto) return 'o texto da página foi alterado enquanto a arte era atualizada'
  return 'a página foi alterada enquanto a arte era atualizada'
}

export interface SpecRecomposta {
  spec: SpecDePeca
  avisos: string[]
}

/**
 * A spec de origem com a COPY e a FOTO que estão na página hoje — o que se
 * manda de volta ao compositor para ele medir cada linha na fonte real e
 * empilhar de novo.
 *
 * Só a copy e a foto mudam. Formato, preferências, variante e os vínculos com
 * o plano ficam como estavam: quem recompõe está refazendo A MESMA peça.
 */
export function specComACopyDaPagina(
  spec: SpecDePeca,
  camadasDaPagina: unknown,
  /**
   * CP2B: a URL da foto que a arte DESENHOU (`fieldValues.imageUrl`). Com arquétipo, a página que mostra essa mesma foto
   * não troca o `driveFileId` pela URL — senão o assunto do catálogo (a região protegida) se perderia na recomposição.
   */
  opcoes: { fotoDesenhada?: string | null } = {},
): SpecRecomposta {
  const avisos: string[] = []
  // Com os [colchetes] de volta: o destaque da página sobrevive à recomposição.
  // Por IDENTIDADE (PR 10): a camada extra é lida pelo id que declara, nunca
  // pelo papel da função dela — ver `copyDaPaginaPorIdentidade`.
  const lida = copyDaPaginaPorIdentidade(camadasDaPagina)
  if (!lida) return { spec, avisos: ['não deu para ler as camadas da página; a spec ficou como estava'] }
  const copy = lida.papeis

  /**
   * A segunda voz da manchete não existe na spec: `comporPeca` a cria quando
   * a assinatura a tem e a manchete vem com 2+ linhas com texto, pondo nela a
   * ÚLTIMA linha COM TEXTO e os respiros que a seguem (`dividirManchete`). Na
   * volta as duas camadas viram de novo UMA manchete — deixar
   * `headline2` na spec faria `validarSpec` recusar a peça inteira.
   */
  const manchete = [
    ...(copy.headline ? copy.headline.split('\n') : []),
    ...(copy.headline2 ? copy.headline2.split('\n') : []),
  ].join('\n')

  /**
   * A camada EXTRA volta com a identidade inteira — id, `herdaDe`, grupo visual,
   * grupo de leitura e ordem — e só o TEXTO vem da página. As linhas dela são
   * as da camada, respiro incluído (linha vazia é conteúdo permitido no
   * contrato, R06); sem a camada na página, o extra sai da spec com aviso,
   * como o papel apagado.
   */
  const textoDoExtra = (id: string, rotulo: string): string[] | null => {
    const texto = textoDoExtraNaPagina(lida, id)
    if (texto === null || !temTexto(texto)) {
      avisos.push(`o texto da camada extra "${id}" (${rotulo}) não está mais na página; a peça foi refeita sem ele`)
      return null
    }
    return texto.split('\n')
  }

  const blocos = (spec.blocos ?? [])
    .map((b) => {
      if (b.herdaDe) {
        // Sem `id` o extra se chama pelo papel (`resolverCamadasExtras`) — é esse o id que a camada declara.
        const linhas = textoDoExtra(b.id ?? b.papel, b.papel)
        return linhas ? { ...b, linhas } : null
      }
      const texto = b.papel === 'headline' ? manchete : copy[b.papel]
      if (!texto || !temTexto(texto)) {
        avisos.push(`o texto de "${b.papel}" não está mais na página; a peça foi refeita sem ele`)
        return null
      }
      // As linhas como estão na camada, respiro incluído (R03): o `filter` de
      // linha vazia mudava o espaçamento do bloco comum na primeira recomposição.
      return { papel: b.papel, linhas: texto.split('\n') }
    })
    // O cast existe porque, com `strict: false`, `z.infer` marca toda chave do
    // bloco como opcional — um type predicate sobre ele não é assinalável.
    .filter((b) => b !== null && b.linhas.length > 0) as SpecDePeca['blocos']

  const camadasExtras = (spec.camadasExtras ?? [])
    .map((e) => {
      const linhas = textoDoExtra(e.id, 'livre')
      return linhas ? { ...e, linhas } : null
    })
    .filter((e) => e !== null) as NonNullable<SpecDePeca['camadasExtras']>

  const url = fotoDaPagina(camadasDaPagina)
  let foto = spec.foto
  // A MESMA foto (a que a arte desenhou), com arquétipo: a foto da spec fica como estava — o `driveFileId`, que o
  // compositor resolve na MESMA URL (o cache do Blob é determinístico por projeto e arquivo) e cujo catálogo protege a
  // região. A URL não vem junto: com arquétipo, foto por duas fontes é recusada (`ARQUETIPO_FOTO_AMBIGUA`). Sem
  // arquétipo, nada muda (o caminho legado é intocado).
  const mesmaFoto = !!spec.arquetipo && !!url && !!spec.foto?.driveFileId && !!opcoes.fotoDesenhada && url === opcoes.fotoDesenhada
  if (mesmaFoto) foto = spec.foto
  else if (url && url !== spec.foto?.url) {
    /**
     * A foto da PÁGINA vence a da spec: ou ela nunca existiu ali, ou alguém
     * trocou a imagem no editor. O `driveFileId` antigo sai junto — apontando
     * para outra foto, ele levaria o assunto errado do catálogo para o mapa
     * de calma.
     */
    avisos.push(
      spec.foto?.url
        ? 'a foto da página não é a da spec; a peça foi refeita com a da página'
        : 'a spec não tinha foto; a peça foi refeita com a que está na página',
    )
    foto = { url }
  }

  const { camadasExtras: _extrasDaSpec, ...semExtras } = spec
  return {
    spec: { ...semExtras, blocos, ...(camadasExtras.length > 0 ? { camadasExtras } : {}), ...(foto ? { foto } : {}) } as SpecDePeca,
    avisos,
  }
}

const ehAncora = (v: unknown): v is 'topo' | 'meio' | 'rodape' => v === 'topo' || v === 'meio' || v === 'rodape'
const ehAlinhamento = (v: unknown): v is 'esquerda' | 'centro' | 'direita' => v === 'esquerda' || v === 'centro' || v === 'direita'

/**
 * A POSIÇÃO que a peça tinha, fixada na spec da recomposição. Recompor é
 * refazer A MESMA peça — os arranjos já iam gravados na spec por isso —, mas o
 * lado do bloco era escolhido de novo a cada vez. Em 11/09/2026 a preferência
 * pelo lado da página passou a valer de verdade, e a peça da Real que tinha
 * saído com a manchete à esquerda passaria para a direita na primeira edição
 * de texto (e para baixo da logo). Com âncora e alinhamento da composição
 * original, só a copy muda. Spec que já pede posição fica como está.
 */
export function specComAPosicaoOriginal(spec: SpecDePeca, fieldValues: unknown): SpecDePeca {
  const composicao = (fieldValues as { composicao?: { posicao?: { ancora?: unknown; alinha?: unknown }; assinatura?: { pageId?: unknown } } } | null | undefined)?.composicao
  const posicao = composicao?.posicao
  let pref = spec.preferencias ?? {}
  // A VARIANTE também é fixada — pelo ID da página de assinatura com que a
  // peça foi composta (PR 4, 12/09/2026). Sem isso, uma edição de texto
  // podia cair noutra variante (o rodízio, a tag clara/escura de outra foto) e
  // trocar fonte, cor e arranjo de uma peça que só mudou uma palavra. Spec
  // que já pede variante fica como está. Vai em `varianteOriginal`, não em
  // `variante`: a página pode ter sido arquivada, e aí a recomposição escolhe
  // outra em vez de recusar a peça (varredura do PR4-03, 18/09/2026).
  const pageId = typeof composicao?.assinatura?.pageId === 'string' ? composicao.assinatura.pageId : null
  let mudou = false
  if (pageId && !pref.variante && !pref.varianteOriginal) {
    pref = { ...pref, varianteOriginal: pageId }
    mudou = true
  }
  const comPref = () => (mudou ? { ...spec, preferencias: pref } : spec)
  // T1a: a peça com ARQUÉTIPO já congela a geometria (id + versão + impressão). Âncora e alinhamento da composição
  // original seriam uma SEGUNDA fonte de posição — só a variante (estilo) é fixada.
  if (spec.arquetipo) return comPref()
  if (!posicao || !ehAncora(posicao.ancora) || !ehAlinhamento(posicao.alinha)) return comPref()
  const pedeAncora = pref.ancora && pref.ancora !== 'auto'
  const pedeAlinha = pref.alinha && pref.alinha !== 'auto'
  if (pedeAncora || pedeAlinha) return comPref()
  return { ...spec, preferencias: { ...pref, ancora: posicao.ancora, alinha: posicao.alinha } }
}

/** Os cortes válidos — `Record` para o tipo exigir todos os de `CropPosition`. */
const CORTES: Record<CropPosition, true> = {
  'left-top': true,
  'center-top': true,
  'right-top': true,
  'left-middle': true,
  'center-middle': true,
  'right-middle': true,
  'left-bottom': true,
  'center-bottom': true,
  'right-bottom': true,
}
const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/**
 * A ESCOLHA ESPACIAL que a recomposição reproduz (CP2B): a política de posição original da peça COM arquétipo, o
 * par de `specComAPosicaoOriginal` (que não injeta âncora nem alinhamento nela). A escolha mora no diagnóstico
 * gravado (`fieldValues.composicao.arquetipo` — a procedência), não na spec pública: lá ela viraria uma segunda fonte
 * de posição pelo MCP. Sem arquétipo, `null` (nada muda). Diagnóstico ausente, de outra definição (id, versão ou
 * impressão diferentes da spec) ou com forma ilegível RECUSA (`ARQUETIPO_ESCOLHA_ILEGIVEL`): nunca cai numa busca
 * nova em silêncio — a peça mudaria de lugar numa edição de texto.
 */
export function escolhaEspacialOriginal(fieldValues: unknown, spec: SpecDePeca): EscolhaParaReproduzir | null {
  if (!spec.arquetipo) return null
  const recusar = (problema: string): never => {
    throw new CreativeError(
      'ARQUETIPO_ESCOLHA_ILEGIVEL',
      `A posição gravada desta arte não pôde ser lida (${problema}); a recomposição não refaz a escolha às cegas — peça uma nova composição da peça.`,
      422,
      { arquetipo: spec.arquetipo, problema },
    )
  }
  const composicao = ehObjeto(fieldValues) && ehObjeto(fieldValues.composicao) ? fieldValues.composicao : null
  const gravado = composicao && ehObjeto(composicao.arquetipo) ? composicao.arquetipo : null
  if (!gravado) return recusar('a arte não guardou o diagnóstico do arquétipo')
  if (typeof gravado.id !== 'string' || typeof gravado.versao !== 'number' || typeof gravado.impressao !== 'string') {
    return recusar('o diagnóstico do arquétipo não tem id, versão e impressão')
  }
  const { id, versao, impressao } = spec.arquetipo
  if (gravado.id !== id || gravado.versao !== versao || gravado.impressao !== impressao) {
    return recusar(`o diagnóstico é de ${gravado.id}@${gravado.versao} (${gravado.impressao}), a spec é de ${id}@${versao} (${impressao})`)
  }
  // A peça do T1a: a referência no corte central, com o canto da logo AUTOMÁTICA que ela gravou (a copy nova não o troca).
  if (gravado.modo === 'referencia') {
    const logo = ehObjeto(gravado.logo) ? gravado.logo : null
    const cantoDoT1a = logo && logo.modo === 'automatica' && (CANTOS as readonly unknown[]).includes(logo.canto) ? (logo.canto as Canto) : null
    const variante = varianteGravada(logo?.variante, recusar)
    return { modo: 'referencia', ...(cantoDoT1a ? { cantoDaLogo: cantoDoT1a } : {}), ...(variante ? { logo: variante } : {}) }
  }
  if (gravado.modo !== MODO_BUSCA_ESPACIAL) return recusar(`modo desconhecido: ${String(gravado.modo)}`)

  const escolha = ehObjeto(gravado.buscaEspacial) && ehObjeto(gravado.buscaEspacial.escolha) ? gravado.buscaEspacial.escolha : null
  if (!escolha || escolha.modo !== MODO_BUSCA_ESPACIAL) return recusar('a busca não gravou a escolha')
  if (escolha.foto !== null && typeof escolha.foto !== 'string') return recusar('a foto da escolha não é texto')
  if (typeof escolha.corte !== 'string' || !Object.prototype.hasOwnProperty.call(CORTES, escolha.corte)) return recusar(`corte inválido: ${String(escolha.corte)}`)
  if (!ehObjeto(escolha.deslocamentos)) return recusar('a escolha não tem os deslocamentos')
  const deslocamentos: Partial<Record<MembroDaFaixa, number>> = {}
  for (const [membro, dy] of Object.entries(escolha.deslocamentos)) {
    if (!(PAPEIS_DO_ARQUETIPO as readonly string[]).includes(membro)) return recusar(`membro inválido: ${membro}`)
    if (!Number.isInteger(dy)) return recusar(`deslocamento de ${membro} não é inteiro: ${String(dy)}`)
    deslocamentos[membro as MembroDaFaixa] = dy as number
  }
  const canto = escolha.cantoDaLogo
  if (canto !== undefined && canto !== null && !(CANTOS as readonly unknown[]).includes(canto)) return recusar(`canto da logo inválido: ${String(canto)}`)

  const limpa: EscolhaEspacial & { buscaOriginal?: ResumoDaBuscaOriginal } = { modo: MODO_BUSCA_ESPACIAL, foto: escolha.foto as string | null, corte: escolha.corte as CropPosition, deslocamentos }
  if (canto !== undefined) limpa.cantoDaLogo = canto as Canto | null
  // CP3: a variante da logo desenhada. Ausente nas peças de antes; presente e malformada é escolha ilegível.
  const varianteDaLogo = varianteGravada(escolha.logo, recusar)
  if (varianteDaLogo) limpa.logo = varianteDaLogo
  // O resumo da busca que ESCOLHEU (o da primeira, levado adiante pelas recomposições): só informativo — forma estranha não recusa.
  const original = resumoDaBuscaOriginal(gravado.buscaEspacial)
  if (original) limpa.buscaOriginal = original
  return limpa
}

/**
 * T1b: os ACENTOS que a peça gravou (`composicao.arquetipo.acentos`) — a receita congelada que a recomposição desenha,
 * nunca o catálogo de elementos de hoje. A peça de antes do T1b (sem o campo) nasceu sem acento e continua sem (`[]`);
 * campo malformado recusa como a escolha ilegível, antes de qualquer escrita. Sem arquétipo, `null`.
 */
export function acentosCongelados(fieldValues: unknown, spec: SpecDePeca): AcentoCongelado[] | null {
  if (!spec.arquetipo) return null
  const composicao = ehObjeto(fieldValues) && ehObjeto(fieldValues.composicao) ? fieldValues.composicao : null
  const gravado = composicao && ehObjeto(composicao.arquetipo) ? composicao.arquetipo : null
  const lidos = lerAcentosGravados(gravado?.acentos)
  if (!('problema' in lidos)) return lidos
  throw new CreativeError(
    'ARQUETIPO_ESCOLHA_ILEGIVEL',
    `Os acentos gravados desta arte não puderam ser lidos (${lidos.problema}); a recomposição não os redesenha pelo catálogo de hoje — peça uma nova composição da peça.`,
    422,
    { arquetipo: spec.arquetipo, problema: lidos.problema },
  )
}

/** O que a definição EXATA da peça (id/versão/impressão já resolvidos) espera da máscara: o raio e a caixa em px. */
export interface MascaraEsperada {
  raio: number
  caixa: CaixaDaMascara
}

/**
 * #9: a MÁSCARA que a peça gravou (`composicao.arquetipo.foto.mascara`) — a receita congelada que a recomposição desenha,
 * nunca a derivação do catálogo de hoje. Leitura FECHADA e conferida ANTES de qualquer consulta nova, medição, render ou
 * escrita: 1º a forma e a coerência v1 contra o PRÓPRIO raio/caixa (`lerReceitaDaMascara`, MK-16); 2º raio e caixa iguais
 * aos da definição exata que a recomposição já resolveu (`esperada`, A-09) — nunca a mais recente nem o catálogo vivo de
 * elementos. Passou: o path GRAVADO é o desenho. Arquétipo que declara máscara e peça sem receita = ilegível (não há
 * desenho de reserva); receita numa definição sem máscara também. Sem arquétipo, ou sem máscara dos dois lados, `null`.
 */
export function mascaraCongelada(fieldValues: unknown, spec: SpecDePeca, esperada: MascaraEsperada | null): ReceitaDaMascara | null {
  if (!spec.arquetipo) return null
  const recusar = (problema: string): never => {
    throw new CreativeError(
      'ARQUETIPO_ESCOLHA_ILEGIVEL',
      `A máscara gravada desta arte não pôde ser lida (${problema}); a recomposição não a redesenha pelo catálogo de hoje — peça uma nova composição da peça.`,
      422,
      { arquetipo: spec.arquetipo, problema },
    )
  }
  const composicao = ehObjeto(fieldValues) && ehObjeto(fieldValues.composicao) ? fieldValues.composicao : null
  const gravado = composicao && ehObjeto(composicao.arquetipo) ? composicao.arquetipo : null
  const foto = gravado?.foto
  if (!esperada) return foto === undefined ? null : recusar('a arte guardou uma máscara, mas a definição exata do arquétipo não declara máscara')
  if (foto === undefined || (ehObjeto(foto) && foto.mascara === undefined)) return recusar('a arte não guardou a máscara que o arquétipo declara')
  const lida = lerReceitaDaMascara(ehObjeto(foto) ? foto.mascara : foto)
  if ('problema' in lida) return recusar(lida.problema)
  if (lida.caixa.w !== esperada.caixa.w || lida.caixa.h !== esperada.caixa.h) {
    return recusar(`a caixa da máscara (${lida.caixa.w}×${lida.caixa.h}) não é a da foto da peça (${esperada.caixa.w}×${esperada.caixa.h})`)
  }
  if (lida.raio !== esperada.raio) return recusar(`o raio gravado (${lida.raio}) não é o da definição exata da peça (${esperada.raio})`)
  return lida
}

/** A variante da logo gravada (CP3): `undefined` = peça de antes do CP3; forma estranha = ilegível. */
function varianteGravada(v: unknown, recusar: (problema: string) => never): VarianteDaLogo | null {
  if (v === undefined || v === null) return null
  if (!ehObjeto(v) || typeof v.url !== 'string' || !v.url || (v.origem !== 'pagina' && v.origem !== 'projeto')) return recusar('a variante da logo gravada não tem origem e url')
  if (v.logoId !== undefined && !Number.isInteger(v.logoId)) return recusar('o logoId da variante gravada não é inteiro')
  if (v.camada !== undefined && typeof v.camada !== 'string') return recusar('a camada da variante gravada não é texto')
  return { origem: v.origem, url: v.url, ...(Number.isInteger(v.logoId) ? { logoId: v.logoId as number } : {}), ...(typeof v.camada === 'string' ? { camada: v.camada } : {}) }
}

function resumoDaBuscaOriginal(busca: unknown): ResumoDaBuscaOriginal | null {
  if (!ehObjeto(busca)) return null
  const reproduzida = ehObjeto(busca.reproduzida) && ehObjeto(busca.reproduzida.original) ? busca.reproduzida.original : null
  const fonte = reproduzida ?? busca
  if (typeof fonte.id !== 'string' || typeof fonte.motivo !== 'string' || typeof fonte.combinacoesAvaliadas !== 'number') return null
  const recusas = ehObjeto(fonte.recusas) ? Object.fromEntries(Object.entries(fonte.recusas).filter(([, n]) => Number.isInteger(n))) : {}
  const cortes = Array.isArray(fonte.cortesAvaliados) ? fonte.cortesAvaliados.filter((c): c is CropPosition => typeof c === 'string' && Object.prototype.hasOwnProperty.call(CORTES, c)) : []
  return { id: fonte.id, motivo: fonte.motivo, recusas, combinacoesAvaliadas: fonte.combinacoesAvaliadas, cortesAvaliados: cortes }
}

export interface PostComArte {
  id: string
  pageId?: string | null
  renderStatus?: string | null
  mediaUrls?: string[] | null
}

/** Os estados de render que `invalidateScheduledRenders` alcança. */
const ALCANCADOS_PELA_INVALIDACAO = ['RENDERED', 'PENDING', 'RENDERING']

/**
 * Este post já é atendido pela invalidação — a recomposição não encosta nele.
 *
 * As duas são o mesmo remédio para públicos diferentes: a invalidação devolve
 * à fila de render o post que RENDERIZA da página (imagem única), e a
 * recomposição troca a arte congelada de quem não renderiza (o slide de
 * carrossel, a arte agendada por `generationId`). Sobrepor as duas no mesmo
 * post seria trocar a mídia de alguém que a invalidação acabou de zerar.
 */
export function alcancadoPelaInvalidacao(post: PostComArte, pageId: string): boolean {
  return (
    post.pageId === pageId &&
    ALCANCADOS_PELA_INVALIDACAO.includes(String(post.renderStatus ?? '')) &&
    // Com várias mídias a invalidação não toca o post (o render colapsaria o
    // carrossel), e o slide que é arte da página fica com a recomposição.
    renderDaPaginaCobreAMidia(post.mediaUrls)
  )
}

export interface SlideDefasado {
  postId: string
  /** A posição da arte antiga em `mediaUrls` (0 = a primeira). */
  indice: number
  total: number
  urlAntiga: string
}

/**
 * Onde a arte desta página está pendurada: (post, posição) para cada mídia que
 * é uma das artes conhecidas da página.
 *
 * 🔴 O casamento é por URL EXATA, nunca pelo prefixo do nome do arquivo.
 * `renderPostArt` nomeia por POST (`<postId>-<epoch>.png`) e o compositor
 * nomeia por PÁGINA (`<pageId>-<epoch>.png`); supor uma coisa só produziu 9
 * falsos "página que não existe mais" no diagnóstico de 04/09. A URL do Blob
 * carrega sufixo aleatório, então a igualdade é inequívoca — é o mesmo
 * casamento que `agendarPost` e `resolverGeracoesSoDestePost` já fazem.
 */
/**
 * A arte precisa ser refeita?
 *
 * `false` só quando dá para AFIRMAR que está tudo em dia: a página é igual à
 * que o compositor entregou, ninguém mexeu nela à mão, e todo slide já aponta
 * para a arte atual. Ilegível responde `true` — "não consegui conferir" não é
 * "está em dia", e refazer é barato perto de publicar o texto velho.
 *
 * Sem esta porta, um empurrãozinho de 1px numa caixa (que muda o JSON mas não
 * passa da tolerância do diff geométrico) gastaria um job, um render, um blob
 * novo e uma linha no histórico de cada post.
 */
export function precisaRefazer(defasagem: Defasagem, slides: SlideDefasado[], urlAtual: string): boolean {
  if (slides.length === 0) return false
  if (defasagem.ilegivel || defasagem.defasada || defasagem.mexidoNaMao.length > 0) return true
  return !slides.every((s) => s.urlAntiga === urlAtual)
}

export function slidesDaPagina(posts: PostComArte[], urls: string[], pageId: string): SlideDefasado[] {
  const conhecidas = new Set(urls.filter(Boolean))
  const achados: SlideDefasado[] = []
  for (const post of posts) {
    if (alcancadoPelaInvalidacao(post, pageId)) continue
    const midias = (post.mediaUrls ?? []).map(String)
    midias.forEach((url, indice) => {
      if (conhecidas.has(url)) achados.push({ postId: post.id, indice, total: midias.length, urlAntiga: url })
    })
  }
  return achados
}
