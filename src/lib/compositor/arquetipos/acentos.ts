/**
 * OS ACENTOS DO ARQUÉTIPO (T1b, 24/10/2026): o `fio-fino`, a `moldura-aberta` e o `spark-4` que um arquétipo
 * declara, materializados como camadas `shape` normais, PRESOS ao texto. É o MESMO código no compor (que desenha) e no
 * medir-copy (que declara, na posição de partida, o que o compor faria).
 *
 * - O DESENHO é o do asset V2 do catálogo de elementos (o item de mesmo id no `SHAPES_LIBRARY`): forma, path, espessura, canal de cor.
 *   A peça nova copia esse desenho numa RECEITA, que vai congelada em `composicao.arquetipo.acentos`; a recomposição
 *   desenha pela receita gravada, nunca pelo catálogo de hoje (peça do T1a/CP2B, sem o campo, segue SEM acento) — e
 *   com a COR que a peça resolveu ao nascer (`cor`/`fonteDaCor`): mudar a paleta depois não repinta peça antiga.
 * - A POSIÇÃO sai da definição imutável do arquétipo (a impressão a protege) e da caixa REAL do papel a que o acento se
 *   prende, DEPOIS da posição escolhida pela foto: o acento segue o texto, a busca não muda por ele.
 *   - abaixo do papel (o fio): segue o fim da caixa, com o vão que a referência declara;
 *   - acima (o spark): segue o topo da caixa, com o vão declarado;
 *   - a moldura-aberta (┌): o braço de cima fica parado na referência (resgate vertical para a área segura do projeto,
 *     dito), e o fim do braço vertical fica o vão declarado acima do topo da caixa;
 *   - na horizontal, pelo alinhamento do arquétipo: rente à TINTA (caixa + padding de desenho) ou centrado na caixa.
 * - As CANTONEIRAS (#16) são presas à PEÇA, não a um texto: pousam na caixa declarada (sem seguir texto nenhum) e
 *   OCUPAM só os quatro braços (`ocupacaoDoAcento`, pelo path da receita em uso — na recomposição, o congelado): o miolo
 *   da moldura, onde os textos e a logo moram, não é obstáculo.
 * - A COR é uma intenção: `texto` herda a cor da manchete desenhada; `destaque`, o destaque que o compositor resolve
 *   para o papel (nas cantoneiras, o da manchete). Quem chama decide e passa o hex.
 * - Fora da área segura do projeto, ou encostando num texto ou na logo: o OPCIONAL é omitido (dito, com o motivo); o
 *   obrigatório é recusado (`ARQUETIPO_ELEMENTO_NAO_CABE`) — nunca empurrado.
 *
 * Puro: sem banco, sem render.
 */
import { SHAPES_LIBRARY } from '@/lib/assets/shapes-library'
import { PADDING_DE_DESENHO } from '@/lib/creatives/halo/fundo-de-texto'
import { estiloDoElemento, type DesenhoDoElemento } from '@/lib/editor/camada-do-elemento'
import { lerCor } from '@/lib/vetor/cor'
import { segmentosDoPath } from '@/lib/vetor/tracar'
import { validarPathData } from '@/lib/vetor/validar'
import type { CanalDeCor } from '@/lib/vetor/tipos'
import type { Layer } from '@/types/template'
import type { GeometriaEfetiva, RetanguloPx } from './materializar'
import { chaveDoArquetipo, ELEMENTOS_DO_ARQUETIPO, ELEMENTOS_PRESOS_A_PECA, ELEMENTOS_QUE_ENVOLVEM, PAPEIS_DE_COR, PAPEIS_DO_ARQUETIPO, type ArquetipoDeLayout, type ElementoDoArquetipo, type FormatoDoArquetipo, type PapelDeCor, type PapelDeTexto } from './tipos'

/** O desenho congelado: só o que as formas usam (linha e svg-path, um canal de cor; a pílula do #5, retângulo arredondado). */
export interface DesenhoDoAcento {
  shapeType: 'line' | 'svg-path' | 'rounded-rectangle'
  pathData?: string
  strokeWidth?: number
  /** Só a pílula (`pilula-contorno`): o raio do asset (9999 = meia altura, pelo clamp dos renderers). */
  raio?: number
  tracoPontas?: 'butt' | 'round'
  ajuste: 'travado' | 'livre'
}

/** A RECEITA de um acento: tudo o que a recomposição precisa para desenhá-lo de novo sem reler o catálogo. */
export interface ReceitaDoAcento {
  /** O id do elemento no arquétipo (`fio`, `moldura`, `spark`, `cantoneiras`). */
  elemento: string
  tipo: ElementoDoArquetipo
  /** Ausente só nas `cantoneiras`: presas à peça (#16). */
  presoA?: PapelDeTexto
  corPorPapel: PapelDeCor
  canal: CanalDeCor
  asset: { id: string; versao: number }
  desenho: DesenhoDoAcento
  /**
   * #16@2: de onde veio o desenho quando ele NÃO é o do asset — o path das cantoneiras derivado para o braço igual, na
   * peça nova, e congelado. Ausente = o desenho é o do asset (C1). A recomposição confere, nunca deriva de novo.
   */
  derivacao?: DerivacaoDoDesenho
}

/** A regra que gerou o desenho congelado (#16@2): os quatro Ls com braço de `bracoPx` nos dois eixos. */
export interface DerivacaoDoDesenho {
  regra: 'bracos-iguais'
  bracoPx: number
}

/** O acento GRAVADO numa peça: a receita e a cor que ela resolveu ao nascer (literal e de onde veio). */
export interface AcentoCongelado extends ReceitaDoAcento {
  cor: string
  fonteDaCor: string
}

export interface AcentoPosicionado {
  receita: ReceitaDoAcento
  rect: RetanguloPx
  /** Só no acento `porItem` (#15): o item da lista (1 = o primeiro) a que este fio se prende. */
  item?: number
}

export interface ProblemaDoAcento {
  elemento: string
  tipo: ElementoDoArquetipo
  opcional: boolean
  item?: number
  rect: RetanguloPx | null
  motivo: string
}

/** A receita de um elemento declarado, pelo asset V2 de mesmo id. `null` quando o elemento não tem como ser preso. */
function receitaDoCatalogo(e: NonNullable<ArquetipoDeLayout['elementos']>[number]): ReceitaDoAcento | null {
  const asset = SHAPES_LIBRARY.find((a) => a.id === e.tipo)
  const slot = asset?.slots?.[0]
  // #5: o retângulo arredondado só na pílula, só de contorno, com raio e espessura (o asset `pilula-contorno`).
  const envolve = ELEMENTOS_QUE_ENVOLVEM.includes(e.tipo)
  const forma = envolve
    ? asset?.shapeType === 'rounded-rectangle' && asset.raio !== undefined && asset.strokeWidth !== undefined && slot?.canal === 'contorno'
    : asset?.shapeType === 'line' || asset?.shapeType === 'svg-path'
  if (!asset || !slot || asset.slots!.length !== 1 || !forma || !asset.ajuste || !asset.versao) return null
  const daPeca = ELEMENTOS_PRESOS_A_PECA.includes(e.tipo)
  if (daPeca ? e.presoA !== undefined : !e.presoA || e.presoA === 'logo') return null
  return {
    elemento: e.id,
    tipo: e.tipo,
    ...(e.presoA ? { presoA: e.presoA as PapelDeTexto } : {}),
    corPorPapel: e.corPorPapel,
    canal: slot.canal,
    asset: { id: asset.id, versao: asset.versao },
    desenho: {
      shapeType: asset.shapeType as DesenhoDoAcento['shapeType'],
      ...(asset.pathData ? { pathData: asset.pathData } : {}),
      ...(asset.strokeWidth !== undefined ? { strokeWidth: asset.strokeWidth } : {}),
      ...(asset.tracoPontas ? { tracoPontas: asset.tracoPontas } : {}),
      ...(envolve ? { raio: asset.raio } : {}),
      ajuste: asset.ajuste,
    },
  }
}

/** A caixa de um elemento preso à peça, em px: `round(fração × lado)` — a MESMA conta na derivação e na posição. */
export function caixaDaPecaEmPx(caixa: { x: number; y: number; w: number; h: number }, canvas: { width: number; height: number }): RetanguloPx {
  return { x: Math.round(caixa.x * canvas.width), y: Math.round(caixa.y * canvas.height), width: Math.round(caixa.w * canvas.width), height: Math.round(caixa.h * canvas.height) }
}

const n4 = (v: number) => String(Number(v.toFixed(4)))

/**
 * Os quatro Ls das cantoneiras no viewBox 0–100 (esticado para a caixa), com `hx` unidades de braço horizontal e `vy`
 * de vertical — na MESMA ordem de subpaths do asset `cantoneiras@1` (25/25 reproduz o path dele byte a byte).
 */
export function pathDasCantoneiras(hx: number, vy: number): string {
  const [h, v, H, V] = [n4(hx), n4(vy), n4(100 - hx), n4(100 - vy)]
  return `M0 ${v} L0 0 L${h} 0 M${H} 0 L100 0 L100 ${v} M100 ${V} L100 100 L${H} 100 M${h} 100 L0 100 L0 ${V}`
}

/**
 * As receitas de uma peça NOVA (do catálogo de hoje) e os elementos que não têm receita. Com `onde` (formato e
 * canvas da peça), o elemento preso à peça com `braco` ganha o path DERIVADO para braços iguais e a `derivacao` — é a
 * receita que congela. Sem `onde` (só inspeção: disponibilidade), o desenho fica o do asset e sem `derivacao`: a guarda
 * de `posicionarAcentos` recusa usá-la num elemento com `braco` (não há desenho de reserva).
 */
export function receitasDoArquetipo(
  a: ArquetipoDeLayout,
  onde?: { formato: FormatoDoArquetipo; canvas: { width: number; height: number } },
): { receitas: ReceitaDoAcento[]; semReceita: string[] } {
  const receitas: ReceitaDoAcento[] = []
  const semReceita: string[] = []
  for (const e of a.elementos ?? []) {
    const r = receitaDoCatalogo(e)
    if (!r) {
      semReceita.push(e.id)
      continue
    }
    const caixa = onde ? a.formatos[onde.formato]?.elementos?.[e.id] : undefined
    if (onde && e.braco !== undefined && ELEMENTOS_PRESOS_A_PECA.includes(e.tipo)) {
      if (!caixa || r.desenho.shapeType !== 'svg-path') {
        semReceita.push(e.id)
        continue
      }
      const rect = caixaDaPecaEmPx(caixa, onde.canvas)
      const bracoPx = Math.round(e.braco * onde.canvas.width)
      r.desenho = { ...r.desenho, pathData: pathDasCantoneiras((bracoPx / rect.width) * 100, (bracoPx / rect.height) * 100) }
      r.derivacao = { regra: 'bracos-iguais', bracoPx }
    }
    receitas.push(r)
  }
  return { receitas, semReceita }
}

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Os acentos GRAVADOS na peça (`composicao.arquetipo.acentos`), para a recomposição: a receita E a cor resolvida.
 * Ausente = peça de antes do T1b: `[]` (ela nasceu sem acento e assim continua). Presente e malformada (inclusive sem
 * cor legível) = `{ problema }` (quem chama recusa).
 */
export function lerAcentosGravados(valor: unknown): AcentoCongelado[] | { problema: string } {
  if (valor === undefined || valor === null) return []
  if (!Array.isArray(valor)) return { problema: 'os acentos gravados não são uma lista' }
  const saida: AcentoCongelado[] = []
  for (const [i, r] of valor.entries()) {
    const onde = `acentos[${i}]`
    if (!ehObjeto(r) || !ehObjeto(r.asset) || !ehObjeto(r.desenho)) return { problema: `${onde} sem asset ou desenho` }
    const d = r.desenho
    if (typeof r.elemento !== 'string' || !r.elemento) return { problema: `${onde} sem elemento` }
    if (!(ELEMENTOS_DO_ARQUETIPO as readonly unknown[]).includes(r.tipo)) return { problema: `${onde}: tipo ${String(r.tipo)}` }
    // Só as cantoneiras (#16) vêm sem presoA; o fio, a moldura e o spark sem ele são receita ilegível, como sempre.
    const daPeca = ELEMENTOS_PRESOS_A_PECA.includes(r.tipo as ElementoDoArquetipo)
    if (daPeca ? r.presoA !== undefined : !(PAPEIS_DO_ARQUETIPO as readonly unknown[]).includes(r.presoA) || r.presoA === 'logo') return { problema: `${onde}: presoA ${String(r.presoA)}` }
    if (!(PAPEIS_DE_COR as readonly unknown[]).includes(r.corPorPapel)) return { problema: `${onde}: corPorPapel ${String(r.corPorPapel)}` }
    if (r.canal !== 'preenchimento' && r.canal !== 'contorno') return { problema: `${onde}: canal ${String(r.canal)}` }
    if (typeof r.asset.id !== 'string' || !Number.isInteger(r.asset.versao)) return { problema: `${onde}: asset sem id e versão` }
    // #5: a pílula é retângulo arredondado de CONTORNO, com raio inteiro em [1, 9999] (0 o renderer desenharia como 24),
    // espessura e sem path; o retângulo arredondado em qualquer outro tipo é receita ilegível.
    const envolve = ELEMENTOS_QUE_ENVOLVEM.includes(r.tipo as ElementoDoArquetipo)
    if (envolve) {
      if (d.shapeType !== 'rounded-rectangle' || r.canal !== 'contorno' || d.pathData !== undefined || d.strokeWidth === undefined) return { problema: `${onde}: a pílula é retângulo arredondado de contorno, com espessura e sem path` }
      if (!(Number.isInteger(d.raio) && (d.raio as number) >= 1 && (d.raio as number) <= 9999)) return { problema: `${onde}: raio da pílula ${String(d.raio)}` }
    } else if (d.shapeType !== 'line' && d.shapeType !== 'svg-path') return { problema: `${onde}: forma ${String(d.shapeType)}` }
    if (d.shapeType === 'svg-path' && !validarPathData(d.pathData).ok) return { problema: `${onde}: pathData inválido` }
    if (d.strokeWidth !== undefined && !(typeof d.strokeWidth === 'number' && d.strokeWidth > 0 && d.strokeWidth <= 64)) return { problema: `${onde}: espessura ${String(d.strokeWidth)}` }
    if (d.tracoPontas !== undefined && d.tracoPontas !== 'butt' && d.tracoPontas !== 'round') return { problema: `${onde}: pontas ${String(d.tracoPontas)}` }
    if (d.ajuste !== 'travado' && d.ajuste !== 'livre') return { problema: `${onde}: ajuste ${String(d.ajuste)}` }
    const cor = lerCor(r.cor)
    if (!cor || cor === 'transparente') return { problema: `${onde}: cor congelada ${String(r.cor)}` }
    if (typeof r.fonteDaCor !== 'string' || !r.fonteDaCor) return { problema: `${onde}: sem a fonte da cor congelada` }
    // #16@2: ausente = desenho do asset (C1); presente, só a regra conhecida com o braço inteiro em (0, 1080].
    const dv = r.derivacao
    if (envolve && dv !== undefined) return { problema: `${onde}: a pílula não tem derivação do desenho` }
    if (dv !== undefined && !(ehObjeto(dv) && Object.keys(dv).length === 2 && dv.regra === 'bracos-iguais' && Number.isInteger(dv.bracoPx) && (dv.bracoPx as number) > 0 && (dv.bracoPx as number) <= 1080)) {
      return { problema: `${onde}: derivação do desenho ilegível` }
    }
    saida.push({
      elemento: r.elemento,
      tipo: r.tipo as ElementoDoArquetipo,
      ...(daPeca ? {} : { presoA: r.presoA as PapelDeTexto }),
      corPorPapel: r.corPorPapel as PapelDeCor,
      canal: r.canal,
      asset: { id: r.asset.id, versao: r.asset.versao as number },
      desenho: {
        shapeType: d.shapeType,
        ...(d.shapeType === 'svg-path' ? { pathData: d.pathData as string } : {}),
        ...(d.strokeWidth !== undefined ? { strokeWidth: d.strokeWidth as number } : {}),
        ...(d.tracoPontas !== undefined ? { tracoPontas: d.tracoPontas as 'butt' | 'round' } : {}),
        // #5 (rodada 1 do preflight): o raio CONGELADO é transportado — o leitor projeta campo a campo e, sem isto, a
        // pílula recomposta sairia retângulo. Os outros tipos não têm raio: a saída deles é a de sempre.
        ...(envolve ? { raio: d.raio as number } : {}),
        ajuste: d.ajuste,
      },
      ...(dv !== undefined ? { derivacao: { regra: 'bracos-iguais' as const, bracoPx: (dv as { bracoPx: number }).bracoPx } } : {}),
      cor: r.cor as string,
      fonteDaCor: r.fonteDaCor,
    })
  }
  return saida
}

/** Meio pixel: as frações não caem no pixel inteiro (a mesma tolerância da materialização). */
const TOLERANCIA_PX = 0.5

const intersecta = (a: RetanguloPx, b: RetanguloPx) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
const rotulo = (r: RetanguloPx) => `${r.x},${r.y} ${r.width}×${r.height}`

/**
 * O que um acento OCUPA na peça, para colisão: o retângulo inteiro — salvo o acento preso à PEÇA (as cantoneiras, #16),
 * que ocupa só a caixa de cada SUBPATH do desenho (os quatro braços), escalada para `rect` como o render escala o path
 * (viewBox 0–100, esticado) e alargada de meio traço. O desenho é o da RECEITA dada — na recomposição, o congelado na
 * peça, nunca o catálogo de hoje. Path sem pontos legíveis = o retângulo inteiro (conservador).
 * A mesma função no compor, no medir-copy, no CP3 e na reconciliação da logo; em frações, `folga` 0.
 * A pílula (#5) ocupa a BORDA EXTERNA, retângulo cheio (a camada mais meio traço): para os OUTROS (a logo, o CP3, o 8c)
 * é uma AABB conservadora — nunca o interior permitido ao serviço, que é o curvo de `cabeNoInteriorDaPilula`.
 */
export function ocupacaoDoAcento(a: { tipo: ElementoDoArquetipo; desenho: DesenhoDoAcento }, rect: RetanguloPx, folga = (a.desenho.strokeWidth ?? 0) / 2): RetanguloPx[] {
  if (ELEMENTOS_QUE_ENVOLVEM.includes(a.tipo)) return [{ x: rect.x - folga, y: rect.y - folga, width: rect.width + 2 * folga, height: rect.height + 2 * folga }]
  if (!ELEMENTOS_PRESOS_A_PECA.includes(a.tipo) || a.desenho.shapeType !== 'svg-path' || !a.desenho.pathData) return [rect]
  const subpaths: number[][] = []
  for (const { command, points } of segmentosDoPath(a.desenho.pathData)) {
    if (command === 'A') return [rect]
    if (command === 'M' || subpaths.length === 0) subpaths.push([])
    if (command !== 'z') subpaths[subpaths.length - 1].push(...points)
  }
  const caixas = subpaths
    .filter((p) => p.length >= 2)
    .map((p) => {
      const xs = p.filter((_, i) => i % 2 === 0).map((v) => rect.x + (v / 100) * rect.width)
      const ys = p.filter((_, i) => i % 2 === 1).map((v) => rect.y + (v / 100) * rect.height)
      const x = Math.min(...xs) - folga
      const y = Math.min(...ys) - folga
      return { x, y, width: Math.max(...xs) + folga - x, height: Math.max(...ys) + folga - y }
    })
  return caixas.length > 0 && caixas.every((c) => [c.x, c.y, c.width, c.height].every(Number.isFinite)) ? caixas : [rect]
}

/**
 * A FOLGA de cada envolvente do arquétipo naquele formato, em px, pelo papel que ele envolve (#5): a borda EXTERNA da
 * pílula fica a `x`, `y` do retângulo do papel (texto + ornamentos do arranjo). Sai da definição versionada — a caixa E
 * do elemento contra a referência R do papel, `round((R − E) × lado)` —, nunca do catálogo de elementos nem da página.
 * Arquétipo sem envolvente: `{}` (a zona, a faixa e os acentos ficam os de sempre).
 */
/**
 * Quanto os acentos PRESOS a cada papel ocupam ACIMA e ABAIXO da caixa dele (29/10/2026): o fio sob a manchete (#1, #9,
 * #10), o spark acima. A pilha da faixa reserva isso entre dois papéis, senão o apoio encosta no fio ou o apaga por
 * colisão. A conta é a de `posicionarAcentos` (vão declarado entre a referência e a caixa do elemento, altura ≥ traço),
 * só que independente de onde o texto pousa. Fora: envolventes (#5, folga do `envoltoriosDoArquetipo`), fio por item
 * (#15), moldura aberta (#2: o braço de cima é fixo na peça) e os presos à peça (#16).
 */
export function extensoesDosAcentosPresos(a: ArquetipoDeLayout, formato: FormatoDoArquetipo, canvas: { width: number; height: number }): Partial<Record<PapelDeTexto, { topo: number; base: number }>> {
  const geo = a.formatos[formato]
  const H = canvas.height
  const saida: Partial<Record<PapelDeTexto, { topo: number; base: number }>> = {}
  for (const r of receitasDoArquetipo(a, { formato, canvas }).receitas) {
    const e = a.elementos?.find((x) => x.id === r.elemento)
    if (!r.presoA || !e || e.porItem || r.tipo === 'moldura-aberta' || ELEMENTOS_QUE_ENVOLVEM.includes(r.tipo)) continue
    const caixa = geo.elementos?.[r.elemento]
    const posRef = geo.papeis[r.presoA]
    if (!caixa || !posRef || !('referencia' in posRef)) continue
    const R = { y: posRef.referencia.y * H, h: posRef.referencia.h * H }
    const E = { y: caixa.y * H, h: caixa.h * H }
    const altura = r.desenho.shapeType === 'line' ? Math.max(E.h, r.desenho.strokeWidth ?? 1) : E.h
    const atual = saida[r.presoA] ?? { topo: 0, base: 0 }
    if (E.y >= R.y + R.h - TOLERANCIA_PX) atual.base = Math.max(atual.base, E.y - (R.y + R.h) + altura)
    else if (E.y + E.h <= R.y + TOLERANCIA_PX) atual.topo = Math.max(atual.topo, R.y - (E.y + E.h) + E.h)
    saida[r.presoA] = atual
  }
  return saida
}

export function envoltoriosDoArquetipo(a: ArquetipoDeLayout, formato: FormatoDoArquetipo, canvas: { width: number; height: number }): Partial<Record<PapelDeTexto, { x: number; y: number }>> {
  const saida: Partial<Record<PapelDeTexto, { x: number; y: number }>> = {}
  const geo = a.formatos[formato]
  for (const e of a.elementos ?? []) {
    if (!ELEMENTOS_QUE_ENVOLVEM.includes(e.tipo) || !e.presoA || e.presoA === 'logo') continue
    const pos = geo?.papeis[e.presoA]
    const E = geo?.elementos?.[e.id]
    if (!E || !pos || !('referencia' in pos)) continue
    saida[e.presoA] = { x: Math.round((pos.referencia.x - E.x) * canvas.width), y: Math.round((pos.referencia.y - E.y) * canvas.height) }
  }
  return saida
}

/**
 * O INTERIOR CURVO da pílula (#5, rodada 1 do preflight): o retângulo `alvo` cabe dentro do contorno arredondado que os
 * renderers DESENHAM, com ≥ 1 px até o traço? O raio é o clamp dos dois renderers, `min(raio, L.w/2, L.h/2)`; o traço é
 * centrado no contorno de L, então a borda interna é L ⊖ s/2 com raio r − s/2, e a região permitida é ela ⊖ 1 px. A
 * região é convexa: os QUATRO cantos do alvo dentro valem pelo retângulo inteiro. `sobra` é a menor distância (px) de um
 * canto até essa região (negativa = invade; `canto`, o pior). Nunca a AABB: o canto encosta no arco antes do retângulo.
 */
export function cabeNoInteriorDaPilula(alvo: RetanguloPx, L: RetanguloPx, traco: number, raio: number): { cabe: boolean; sobra: number; canto: { x: number; y: number } } {
  const r = Math.min(raio, L.width / 2, L.height / 2)
  const recuo = traco / 2 + 1
  const ri = Math.max(0, r - recuo)
  const meiaL = L.width / 2 - recuo
  const meiaA = L.height / 2 - recuo
  const cx = L.x + L.width / 2
  const cy = L.y + L.height / 2
  let pior = { sobra: Infinity, canto: { x: alvo.x, y: alvo.y } }
  for (const [x, y] of [[alvo.x, alvo.y], [alvo.x + alvo.width, alvo.y], [alvo.x + alvo.width, alvo.y + alvo.height], [alvo.x, alvo.y + alvo.height]]) {
    // A distância assinada ao retângulo arredondado (centro cx,cy; meias medidas meiaL × meiaA; raio ri), invertida.
    const dx = Math.abs(x - cx) - (meiaL - ri)
    const dy = Math.abs(y - cy) - (meiaA - ri)
    const sobra = meiaL <= 0 || meiaA <= 0 ? -Infinity : ri - (Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0))
    if (sobra < pior.sobra) pior = { sobra, canto: { x, y } }
  }
  return { cabe: pior.sobra >= 0, sobra: pior.sobra, canto: pior.canto }
}

const CANTOS_DA_CAIXA = ['superior-esquerdo', 'superior-direito', 'inferior-direito', 'inferior-esquerdo'] as const

/**
 * #16@2 — a guarda do DESENHO congelado contra o elemento, no retângulo final. Confere o path, nunca o redesenha nem o
 * troca pelo catálogo vivo. Elemento SEM `braco`: a receita C1 (sem `derivacao`) passa; com `derivacao`, é adulterada.
 * Elemento COM `braco`: a `derivacao` diz `round(braco × W)` e o path tem 4 subpaths M/L de 3 pontos cada, o do meio
 * num canto distinto do retângulo (±0,5 px), com um braço horizontal e um vertical para dentro, cada um de `bracoPx`
 * (±0,5 px). `null` = coerente; senão, o motivo (quem chama recusa — `ARQUETIPO_ELEMENTO_NAO_CABE`).
 */
export function incoerenciaDoDesenho(braco: number | undefined, receita: ReceitaDoAcento, rect: RetanguloPx, larguraDaPeca: number): string | null {
  const dv = receita.derivacao
  if (braco === undefined) return dv ? 'a receita traz derivação do desenho, mas o elemento não declara braço' : null
  const esperado = Math.round(braco * larguraDaPeca)
  if (!dv) return `o elemento pede braço igual de ${esperado} px e a receita não traz a derivação do desenho (não há desenho de reserva)`
  if (dv.regra !== 'bracos-iguais' || dv.bracoPx !== esperado) return `a derivação do desenho (${dv.regra}, ${dv.bracoPx} px) não é a do elemento (bracos-iguais, ${esperado} px)`
  if (receita.desenho.shapeType !== 'svg-path' || !receita.desenho.pathData) return 'o desenho congelado não é um path'
  const subpaths: Array<Array<[number, number]>> = []
  for (const { command, points } of segmentosDoPath(receita.desenho.pathData)) {
    if (command !== 'M' && command !== 'L') return `o path congelado tem o comando ${command} (só M e L formam os Ls)`
    if (command === 'M') subpaths.push([])
    else if (subpaths.length === 0) return 'o path congelado não começa por M'
    subpaths[subpaths.length - 1].push([rect.x + (points[0] / 100) * rect.width, rect.y + (points[1] / 100) * rect.height])
  }
  if (subpaths.length !== 4) return `o path congelado tem ${subpaths.length} subpaths, não os 4 Ls`
  const perto = (a: number, b: number) => Math.abs(a - b) <= TOLERANCIA_PX
  const fmt = (v: number) => String(Math.round(v * 10) / 10).replace('.', ',')
  const vistos = new Set<string>()
  for (const [k, s] of subpaths.entries()) {
    if (s.length !== 3) return `o L ${k + 1} do path congelado tem ${s.length} pontos, não 3`
    const [p, c, q] = s
    const esquerda = perto(c[0], rect.x)
    const direita = perto(c[0], rect.x + rect.width)
    const cima = perto(c[1], rect.y)
    const baixo = perto(c[1], rect.y + rect.height)
    if (!(esquerda || direita) || !(cima || baixo)) return `o L ${k + 1} não dobra num canto da moldura (dobra em ${fmt(c[0])},${fmt(c[1])})`
    const canto = CANTOS_DA_CAIXA[cima ? (esquerda ? 0 : 1) : direita ? 2 : 3]
    if (vistos.has(canto)) return `dois Ls dobram no canto ${canto}`
    vistos.add(canto)
    const horizontal = [p, q].find((o) => perto(o[1], c[1]))
    const vertical = [p, q].find((o) => perto(o[0], c[0]) && o !== horizontal)
    if (!horizontal || !vertical) return `o L do canto ${canto} não tem um braço horizontal e um vertical`
    const dx = (horizontal[0] - c[0]) * (esquerda ? 1 : -1)
    const dy = (vertical[1] - c[1]) * (cima ? 1 : -1)
    if (dx <= 0 || dy <= 0 || !perto(dx, esperado) || !perto(dy, esperado)) return `o L do canto ${canto} tem braço ${fmt(dx)} × ${fmt(dy)} px, não ${esperado} × ${esperado} (para dentro)`
  }
  return null
}

/**
 * Onde cada acento pousa, preso à caixa REAL do papel (`papeis[presoA].posicao`) — e o que fica de fora. `obstaculos`
 * são as caixas que ele não pode tocar: todos os textos da peça e a logo.
 * O acento `porItem` (#15) pousa UMA vez por item da lista (`itens[presoA]`): x e largura pela caixa da lista, y pelo
 * topo de cada item, com o vão que a referência declara para o primeiro. A receita é UMA por elemento — a recomposição
 * lê a lista gravada (um registro por fio desenhado) e repetiria o desenho; aqui a primeira de cada elemento vale.
 */
export function posicionarAcentos(args: {
  arquetipo: ArquetipoDeLayout
  formato: FormatoDoArquetipo
  canvas: { width: number; height: number }
  geometria: GeometriaEfetiva
  receitas: ReceitaDoAcento[]
  papeis: Partial<Record<PapelDeTexto, { posicao: RetanguloPx }>>
  obstaculos: Array<{ id: string; rect: RetanguloPx }>
  /** As caixas dos itens de cada papel de lista (`caixasDosItens`). */
  itens?: Partial<Record<PapelDeTexto, RetanguloPx[]>>
}): { acentos: AcentoPosicionado[]; omitidos: ProblemaDoAcento[]; recusas: ProblemaDoAcento[]; avisos: string[] } {
  const { arquetipo, formato, canvas, geometria } = args
  const W = canvas.width
  const H = canvas.height
  const geo = arquetipo.formatos[formato]
  const alinha = arquetipo.preferencias.alinha
  const acentos: AcentoPosicionado[] = []
  const omitidos: ProblemaDoAcento[] = []
  const recusas: ProblemaDoAcento[] = []
  const avisos: string[] = []
  const area = { x: geometria.margemH, y: geometria.safeTopo, width: W - 2 * geometria.margemH, height: H - geometria.safeTopo - geometria.safeRodape }

  const foraDaArea = (r: RetanguloPx) => r.x < area.x - TOLERANCIA_PX || r.y < area.y - TOLERANCIA_PX || r.x + r.width > area.x + area.width + TOLERANCIA_PX || r.y + r.height > area.y + area.height + TOLERANCIA_PX
  const rotuloDaArea = rotulo({ x: Math.round(area.x), y: Math.round(area.y), width: Math.round(area.width), height: Math.round(area.height) })
  /**
   * #5 — a pílula, NESTA ordem: (0) a receita bate com o elemento DECLARADO (id, tipo, presoA, desenho) e o envoltório do
   * papel existe — antes de ler referência, posição ou obstáculo; (1) o obstáculo do papel é T; (2) a borda externa O é
   * T ⊕ folga; (3) a camada L é O ⊖ ⌈s/2⌉ e o raio, o clamp dos renderers; (4) cápsula horizontal, O na área segura, nenhum
   * OUTRO obstáculo em O e os cantos de T dentro do interior CURVO. Receita incoerente nunca é opcional: recusa.
   */
  const envolver = (receita: ReceitaDoAcento, declarado: NonNullable<ArquetipoDeLayout['elementos']>[number] | undefined) => {
    const coerente = !!declarado && declarado.tipo === receita.tipo && declarado.presoA === receita.presoA
    const opcional = coerente ? declarado!.opcional : false
    const falhar = (motivo: string, rect: RetanguloPx | null) => (opcional ? omitidos : recusas).push({ elemento: receita.elemento, tipo: receita.tipo, opcional, rect, motivo })
    if (!coerente || !receita.presoA) return falhar(`a receita da pílula "${receita.elemento}" (${receita.tipo}, presa a ${String(receita.presoA)}) não é a de um elemento declarado em ${chaveDoArquetipo(arquetipo)}`, null)
    const env = envoltoriosDoArquetipo(arquetipo, formato, canvas)[receita.presoA]
    if (!env || !Number.isInteger(env.x) || !Number.isInteger(env.y) || env.x < 8 || env.y < 8) return falhar(`o ${receita.presoA} não tem a folga da pílula em ${chaveDoArquetipo(arquetipo)} no ${formato}`, null)
    const d = receita.desenho
    const s = d.strokeWidth
    if (d.shapeType !== 'rounded-rectangle' || receita.canal !== 'contorno' || !Number.isInteger(d.raio) || (d.raio as number) < 1 || typeof s !== 'number' || !(s > 0)) return falhar('o desenho da pílula não é retângulo arredondado de contorno com raio e espessura', null)
    const T = args.obstaculos.find((o) => o.id === receita.presoA)?.rect
    if (!T) return falhar(`o papel "${receita.presoA}", que a pílula envolve, não está na peça`, null)
    const O: RetanguloPx = { x: T.x - env.x, y: T.y - env.y, width: T.width + 2 * env.x, height: T.height + 2 * env.y }
    const c = Math.ceil(s / 2)
    const L: RetanguloPx = { x: O.x + c, y: O.y + c, width: O.width - 2 * c, height: O.height - 2 * c }
    if (L.width < L.height) return falhar(`o ${receita.presoA} é curto demais para a cápsula horizontal (${rotulo(L)})`, L)
    if (foraDaArea(O)) return falhar(`a pílula (borda externa ${rotulo(O)}) sai da área segura do projeto (${rotuloDaArea})`, L)
    const doPapel = (id: string) => id === receita.presoA || id.startsWith(`${receita.presoA}#`)
    const tocados = args.obstaculos.filter((o) => !doPapel(o.id) && intersecta(O, o.rect)).map((o) => o.id)
    if (tocados.length > 0) return falhar(`a pílula (borda externa ${rotulo(O)}) encosta em ${tocados.join(', ')}`, L)
    for (const o of args.obstaculos.filter((x) => doPapel(x.id))) {
      const dentro = cabeNoInteriorDaPilula(o.rect, L, s, d.raio as number)
      if (!dentro.cabe) return falhar(`o canto (${Math.round(dentro.canto.x)}, ${Math.round(dentro.canto.y)}) do ${o.id} encostaria no contorno arredondado (sobra ${dentro.sobra.toFixed(1)} px além de 1 px; camada ${rotulo(L)}, traço ${s})`, L)
    }
    acentos.push({ receita, rect: L })
  }

  const unicas = args.receitas.filter((r, i, todas) => todas.findIndex((x) => x.elemento === r.elemento) === i)
  for (const receita of unicas) {
    const declarado = arquetipo.elementos?.find((e) => e.id === receita.elemento)
    const caixa = geo.elementos?.[receita.elemento]
    const opcional = declarado?.opcional ?? true
    let item: number | undefined
    const falhar = (motivo: string, rect: RetanguloPx | null) =>
      (opcional ? omitidos : recusas).push({ elemento: receita.elemento, tipo: receita.tipo, opcional, ...(item ? { item } : {}), rect, motivo })
    // #5: o ENVOLVENTE (a pílula) abraça a caixa real do papel com a folga da definição — antes de qualquer outro ramo.
    if (ELEMENTOS_QUE_ENVOLVEM.includes(receita.tipo)) {
      envolver(receita, declarado)
      continue
    }
    // #16: preso à PEÇA — a caixa declarada, sem seguir texto; colide pelo que o desenho ocupa (os braços).
    if (!receita.presoA) {
      if (!declarado || declarado.tipo !== receita.tipo || declarado.presoA !== undefined || !caixa) {
        falhar(`o elemento "${receita.elemento}" (${receita.tipo}, preso à peça) não existe em ${chaveDoArquetipo(arquetipo)} no ${formato}`, null)
        continue
      }
      const rect = caixaDaPecaEmPx(caixa, canvas)
      // #16@2: o desenho congelado tem de ser o do elemento, neste retângulo — nunca redesenhado aqui.
      const incoerente = incoerenciaDoDesenho(declarado.braco, receita, rect, W)
      if (incoerente) {
        falhar(`o desenho do acento (${rotulo(rect)}) não é o do elemento: ${incoerente}`, rect)
        continue
      }
      const fora = rect.x < area.x - TOLERANCIA_PX || rect.y < area.y - TOLERANCIA_PX || rect.x + rect.width > area.x + area.width + TOLERANCIA_PX || rect.y + rect.height > area.y + area.height + TOLERANCIA_PX
      const ocupa = ocupacaoDoAcento(receita, rect)
      const tocados = args.obstaculos.filter((o) => ocupa.some((r) => intersecta(r, o.rect))).map((o) => o.id)
      if (fora) falhar(`o acento (${rotulo(rect)}) sai da área segura do projeto (${rotulo({ x: Math.round(area.x), y: Math.round(area.y), width: Math.round(area.width), height: Math.round(area.height) })})`, rect)
      else if (tocados.length > 0) falhar(`um braço do acento (${rotulo(rect)}) encosta em ${tocados.join(', ')}`, rect)
      else acentos.push({ receita, rect })
      continue
    }
    const posRef = geo.papeis[receita.presoA]
    const P = args.papeis[receita.presoA]?.posicao
    if (!declarado || declarado.tipo !== receita.tipo || !caixa || !posRef || !('referencia' in posRef)) {
      falhar(`o elemento "${receita.elemento}" (${receita.tipo}) não existe em ${chaveDoArquetipo(arquetipo)} no ${formato}`, null)
      continue
    }
    if (!P) {
      falhar(`o papel "${receita.presoA}", a que o acento se prende, não está na peça`, null)
      continue
    }
    if (declarado.porItem) {
      const itens = args.itens?.[receita.presoA] ?? []
      if (itens.length === 0) {
        falhar(`a lista "${receita.presoA}", a cujos itens o fio se prende, não tem itens na peça`, null)
        continue
      }
      const R = posRef.referencia
      const vaoAcima = (R.y - (caixa.y + caixa.h)) * H
      const largura = caixa.w * W
      const altura = Math.max(caixa.h * H, receita.desenho.strokeWidth ?? 1)
      const x = alinha === 'esquerda' ? P.x + PADDING_DE_DESENHO + (caixa.x - R.x) * W : alinha === 'direita' ? P.x + P.width - PADDING_DE_DESENHO - ((R.x + R.w) - (caixa.x + caixa.w)) * W - largura : P.x + P.width / 2 + (caixa.x + caixa.w / 2 - (R.x + R.w / 2)) * W - largura / 2
      itens.forEach((it, k) => {
        item = k + 1
        const rect: RetanguloPx = { x: Math.round(x), y: Math.round(it.y - vaoAcima - altura), width: Math.round(largura), height: Math.round(altura) }
        const fora = rect.x < area.x - TOLERANCIA_PX || rect.y < area.y - TOLERANCIA_PX || rect.x + rect.width > area.x + area.width + TOLERANCIA_PX || rect.y + rect.height > area.y + area.height + TOLERANCIA_PX
        const tocados = args.obstaculos.filter((o) => intersecta(rect, o.rect)).map((o) => o.id)
        if (fora) falhar(`o fio do item ${item} (${rotulo(rect)}) sai da área segura do projeto`, rect)
        else if (tocados.length > 0) falhar(`o fio do item ${item} (${rotulo(rect)}) encosta em ${tocados.join(', ')}`, rect)
        else acentos.push({ receita, rect, item })
      })
      item = undefined
      continue
    }
    const R = { x: posRef.referencia.x * W, y: posRef.referencia.y * H, w: posRef.referencia.w * W, h: posRef.referencia.h * H }
    const E = { x: caixa.x * W, y: caixa.y * H, w: caixa.w * W, h: caixa.h * H }
    // A espessura da linha não some num fio de 4 px: a caixa tem pelo menos o traço.
    const alturaPropria = receita.desenho.shapeType === 'line' ? Math.max(E.h, receita.desenho.strokeWidth ?? 1) : E.h
    const x =
      alinha === 'esquerda'
        ? P.x + PADDING_DE_DESENHO + (E.x - R.x)
        : alinha === 'direita'
          ? P.x + P.width - PADDING_DE_DESENHO - (R.x + R.w - (E.x + E.w)) - E.w
          : P.x + P.width / 2 + (E.x + E.w / 2 - (R.x + R.w / 2)) - E.w / 2
    let y: number
    let altura = alturaPropria
    if (receita.tipo === 'moldura-aberta') {
      // O braço de cima fica; o fim do braço vertical acompanha o topo real do texto.
      const topo = Math.max(E.y, geometria.safeTopo)
      if (topo > E.y + TOLERANCIA_PX) avisos.push(`${receita.elemento}: a área segura do projeto corta o braço de cima da referência; ele desceu ${Math.round(topo - E.y)} px.`)
      const fim = P.y - (R.y - (E.y + E.h))
      y = topo
      altura = fim - topo
    } else if (E.y >= R.y + R.h - TOLERANCIA_PX) {
      y = P.y + P.height + (E.y - (R.y + R.h))
    } else if (E.y + E.h <= R.y + TOLERANCIA_PX) {
      y = P.y - (R.y - (E.y + E.h)) - E.h
    } else {
      // Sobreposto ao papel na referência: segue a translação do topo (o catálogo de hoje não tem caso assim).
      y = P.y + (E.y - R.y)
    }
    const rect: RetanguloPx = { x: Math.round(x), y: Math.round(y), width: Math.round(E.w), height: Math.round(altura) }
    if (rect.height < 1 || rect.width < 1) {
      falhar(`com o texto onde pousou, o acento não tem tamanho (${rotulo(rect)})`, rect)
      continue
    }
    const fora = rect.x < area.x - TOLERANCIA_PX || rect.y < area.y - TOLERANCIA_PX || rect.x + rect.width > area.x + area.width + TOLERANCIA_PX || rect.y + rect.height > area.y + area.height + TOLERANCIA_PX
    if (fora) {
      falhar(`o acento (${rotulo(rect)}) sai da área segura do projeto (${rotulo({ x: Math.round(area.x), y: Math.round(area.y), width: Math.round(area.width), height: Math.round(area.height) })})`, rect)
      continue
    }
    const tocados = args.obstaculos.filter((o) => intersecta(rect, o.rect)).map((o) => o.id)
    if (tocados.length > 0) {
      falhar(`o acento (${rotulo(rect)}) encosta em ${tocados.join(', ')}`, rect)
      continue
    }
    acentos.push({ receita, rect })
  }
  return { acentos, omitidos, recusas, avisos }
}

/**
 * O que um acento não pode tocar, pela MESMA conta no compor e no medir-copy: a caixa de cada unidade de texto onde ela
 * pousou, com os ornamentos do arranjo (ícone, filete, selo) em volta, e a logo quando a posição dela é conhecida.
 */
export function obstaculosDosAcentos(
  unidades: ReadonlyArray<{
    papel: PapelDeTexto
    ornamentos: { esquerda: number; direita: number; topo: number; base: number }
    /** Os ornamentos de cada texto em volta da caixa DELE (`unidadesDoArquetipo`): é o que vale item a item. */
    ornamentosPorBloco?: ReadonlyArray<{ esquerda: number; direita: number; topo: number; base: number }>
  }>,
  papeis: Partial<Record<PapelDeTexto, { posicao: RetanguloPx }>>,
  logo: RetanguloPx | null,
  /** As caixas dos itens de cada lista (#15): na lista o obstáculo é CADA item — o vão entre eles é onde o fio mora. */
  itens: Partial<Record<PapelDeTexto, RetanguloPx[]>> = {},
): Array<{ id: string; rect: RetanguloPx }> {
  const saida: Array<{ id: string; rect: RetanguloPx }> = []
  for (const u of unidades) {
    const p = papeis[u.papel]?.posicao
    if (!p) continue
    const o = u.ornamentos
    const doPapel = itens[u.papel]
    if (doPapel?.length) {
      // Cada item com os ornamentos DELE, dos quatro lados: o filete sob o 1º item que desce para o vão é obstáculo do fio
      // do 2º (rodada 1). Só o que o ornamento ocupa — o resto do vão continua livre para o fio.
      doPapel.forEach((r, k) => {
        const e = u.ornamentosPorBloco?.[k] ?? { esquerda: 0, direita: 0, topo: 0, base: 0 }
        saida.push({ id: `${u.papel}#${k + 1}`, rect: { x: r.x - e.esquerda, y: r.y - e.topo, width: r.width + e.esquerda + e.direita, height: r.height + e.topo + e.base } })
      })
      continue
    }
    saida.push({ id: u.papel, rect: { x: p.x - o.esquerda, y: p.y - o.topo, width: p.width + o.esquerda + o.direita, height: p.height + o.topo + o.base } })
  }
  if (logo) saida.push({ id: 'logo', rect: logo })
  return saida
}

/**
 * #5 — a GUARDA DO REPLAY para os envolventes (D7 + D11 do preflight), antes de medir e de escrever: a definição declara
 * um envolvente OBRIGATÓRIO e nenhum acento congelado é dele; ou um congelado envolvente aponta para um elemento que não
 * existe, de outro tipo ou preso a outro papel. `null` = coerente; senão o motivo (quem chama recusa
 * `ARQUETIPO_ESCOLHA_ILEGIVEL`). Vale quando o tipo CONGELADO ou o tipo DECLARADO (pelo id) é envolvente — uma receita de
 * tipo antigo gravada no id da pílula também recusa aqui (rodada 1). Antigo → antigo: a lacuna é herdada e não é tocada.
 */
export function incoerenciaDosEnvolventesCongelados(a: ArquetipoDeLayout, congelados: ReadonlyArray<ReceitaDoAcento>): string | null {
  for (const c of congelados) {
    const e = a.elementos?.find((x) => x.id === c.elemento)
    if (!ELEMENTOS_QUE_ENVOLVEM.includes(c.tipo) && !(e && ELEMENTOS_QUE_ENVOLVEM.includes(e.tipo))) continue
    if (!e || e.tipo !== c.tipo || e.presoA !== c.presoA) return `o acento congelado "${c.elemento}" (${c.tipo}, preso a ${String(c.presoA)}) não é o elemento declarado em ${chaveDoArquetipo(a)}${e ? ` (${e.tipo}, preso a ${String(e.presoA)})` : ''}`
  }
  for (const e of a.elementos ?? []) {
    if (ELEMENTOS_QUE_ENVOLVEM.includes(e.tipo) && !e.opcional && !congelados.some((c) => c.elemento === e.id)) return `a peça de ${chaveDoArquetipo(a)} não gravou o acento obrigatório "${e.id}" (${e.tipo}): sem ele, ela sairia sem a identidade do modelo`
  }
  return null
}

/** O nome legível de cada tipo (o painel de camadas mostra). */
const NOMES: Record<ElementoDoArquetipo, string> = { 'fio-fino': 'Fio fino', 'moldura-aberta': 'Moldura aberta', 'spark-4': 'Brilho de 4 pontas', cantoneiras: 'Cantoneiras', 'pilula-contorno': 'Pílula de contorno' }

/** O id da camada do acento na peça (o fio de cada item da lista leva o número do item). */
export const idDoAcento = (elemento: string, item?: number) => (item ? `acento-${elemento}-item${item}` : `acento-${elemento}`)

/**
 * A camada `shape` do acento, com a cor já decidida. `style.vetor` leva só o asset (SEM `papeis`): o "Reaplicar cores
 * da marca" resolveria `texto` para o escuro da marca e o acento deixaria de seguir a manchete. Quem é e de onde veio a
 * cor fica em `metadata.compositor.acento` — identificável pelo revisor.
 */
export function camadaDoAcento(a: AcentoPosicionado, cor: { hex: string; fonte: string }, arquetipo: string): Layer {
  const { receita, rect } = a
  const desenho: DesenhoDoElemento = { ...receita.desenho }
  return {
    id: idDoAcento(receita.elemento, a.item),
    name: `Acento · ${NOMES[receita.tipo]}`,
    type: 'shape',
    visible: true,
    locked: false,
    order: 0,
    position: { x: rect.x, y: rect.y },
    size: { width: rect.width, height: rect.height },
    rotation: 0,
    style: estiloDoElemento(desenho, undefined, { [receita.canal]: cor.hex }, { asset: { ...receita.asset } }),
    metadata: {
      compositor: {
        acento: { elemento: receita.elemento, tipo: receita.tipo, ...(receita.presoA ? { presoA: receita.presoA } : { ancoradoA: 'peca' }), corPorPapel: receita.corPorPapel, fonteDaCor: cor.fonte, arquetipo, ...(a.item ? { item: a.item } : {}), ...(receita.derivacao ? { derivacao: { ...receita.derivacao } } : {}) },
      },
    },
  } as Layer
}
