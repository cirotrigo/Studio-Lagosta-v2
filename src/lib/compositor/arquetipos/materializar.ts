/**
 * A MATERIALIZAÇÃO do arquétipo (T1a, 14/10/2026): das frações do catálogo aos
 * pixels da peça, na POSIÇÃO DE REFERÊNCIA. Não procura posição dentro da zona
 * (é o CP2B): a referência é a posição; a zona, recortada pela área segura
 * EFETIVA do projeto (`assinatura.pisoDoProjeto[formato]`: `NUMEROS_PADRAO` +
 * `Project.assinatura`, ANTES das margens da página — que são geometria da
 * página e não podem competir com o arquétipo), é só onde a caixa real precisa caber.
 *
 * Sem clamp: caixa real que não cabe na capacidade da referência ou na zona
 * efetiva é RECUSADA com o papel, a referência, a zona e a medida — nunca
 * empurrada 30 px, nunca trocada de lado.
 *
 * Puro: quem chama mede (com o medidor real) e passa as medidas.
 */
import type { Alinhamento } from '../spec'
import type { ArquetipoDeLayout, Caixa, FormatoDoArquetipo, PapelDeTexto, Zona } from './tipos'

/** O alinhamento de um papel: o próprio (T4-A) ou, sem ele, o do arquétipo. */
export const alinhaDoPapel = (arquetipo: ArquetipoDeLayout, papel: PapelDeTexto): Alinhamento =>
  arquetipo.papeis.find((p) => p.papel === papel)?.alinha ?? arquetipo.preferencias.alinha

/** O papel de escala DOMINANTE do arquétipo (MIN-10), ou `null` — o validador só a admite na headline. */
export const papelDominante = (arquetipo: ArquetipoDeLayout): PapelDeTexto | null =>
  (arquetipo.papeis.find((p) => p.escala === 'dominante')?.papel as PapelDeTexto | undefined) ?? null

/**
 * O que é DOMINANTE, em frações da peça: a caixa real ocupa ao menos 80% da largura OU 22% da altura — os pisos da
 * pesquisa para o título gigante (largura 80–100, altura 22–38). Abaixo disso a peça seria um título comum.
 */
export const DOMINANCIA = { largura: 0.8, altura: 0.22 } as const

export interface RetanguloPx {
  x: number
  y: number
  width: number
  height: number
}

/** A área segura efetiva do projeto naquele formato, em px (`pisoDoProjeto`, nunca copiada). */
export interface GeometriaEfetiva {
  margemH: number
  safeTopo: number
  safeRodape: number
}

/** Meio pixel: a referência em frações não cai exatamente no pixel inteiro. */
const TOLERANCIA_PX = 0.5

const emPx = (c: Caixa, canvas: { width: number; height: number }): RetanguloPx => ({
  x: c.x * canvas.width,
  y: c.y * canvas.height,
  width: c.w * canvas.width,
  height: c.h * canvas.height,
})

/**
 * A régua FINAL de altura de uma referência: px brutos (`emPx`, sem floor) + `TOLERANCIA_PX`. É a MESMA conta da
 * recusa da materialização e a parada da escada da unidade (`prepararNoArquetipo`); a capacidade preliminar
 * (`caixasMaximas`, floor) não muda.
 */
export function excedeAlturaDaReferencia(altura: number, referencia: Caixa, canvas: { width: number; height: number }): boolean {
  return altura > emPx(referencia, canvas).height + TOLERANCIA_PX
}

const arredondado = (r: RetanguloPx): RetanguloPx => ({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) })

/** A zona do arquétipo ∩ a área segura efetiva, em px — `null` quando a interseção é vazia. */
export function zonaEfetiva(zona: Zona, canvas: { width: number; height: number }, geometria: GeometriaEfetiva): RetanguloPx | null {
  const x0 = Math.max(zona.xMin * canvas.width, geometria.margemH)
  const x1 = Math.min(zona.xMax * canvas.width, canvas.width - geometria.margemH)
  const y0 = Math.max(zona.yMin * canvas.height, geometria.safeTopo)
  const y1 = Math.min(zona.yMax * canvas.height, canvas.height - geometria.safeRodape)
  if (x1 - x0 <= 0 || y1 - y0 <= 0) return null
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

const dentro = (r: RetanguloPx, z: RetanguloPx) =>
  r.x >= z.x - TOLERANCIA_PX && r.y >= z.y - TOLERANCIA_PX && r.x + r.width <= z.x + z.width + TOLERANCIA_PX && r.y + r.height <= z.y + z.height + TOLERANCIA_PX

/**
 * A caixa MÁXIMA de cada papel de texto: a largura da referência é a coluna do
 * medidor (a mesma no medir-copy e no compor), a altura é a capacidade
 * estrutural. A segunda voz (`headline2`) mede na caixa da manchete.
 */
export function caixasMaximas(arquetipo: ArquetipoDeLayout, formato: FormatoDoArquetipo, canvas: { width: number; height: number }): Partial<Record<PapelDeTexto, { largura: number; altura: number }>> {
  const saida: Partial<Record<PapelDeTexto, { largura: number; altura: number }>> = {}
  for (const [papel, pos] of Object.entries(arquetipo.formatos[formato].papeis)) {
    if (papel === 'logo' || !pos || !('referencia' in pos)) continue
    const r = emPx(pos.referencia, canvas)
    saida[papel as PapelDeTexto] = { largura: Math.floor(r.width), altura: Math.floor(r.height) }
  }
  return saida
}

/** A referência e a zona efetiva de um papel, em px — para a recusa que acontece ANTES da materialização (na escada do bloco). */
export function referenciaDoPapel(
  arquetipo: ArquetipoDeLayout,
  formato: FormatoDoArquetipo,
  canvas: { width: number; height: number },
  geometria: GeometriaEfetiva,
  papel: PapelDeTexto | 'logo',
): { referencia: RetanguloPx; zonaEfetiva: RetanguloPx | null } | null {
  const pos = arquetipo.formatos[formato].papeis[papel]
  if (!pos || !('referencia' in pos)) return null
  const z = zonaEfetiva(pos.zona, canvas, geometria)
  return { referencia: arredondado(emPx(pos.referencia, canvas)), zonaEfetiva: z ? arredondado(z) : null }
}

export interface ProblemaDeMaterializacao {
  codigo: 'ARQUETIPO_TEXTO_NAO_CABE' | 'ARQUETIPO_FORA_DA_ZONA' | 'ARQUETIPO_ZONA_EFETIVA_VAZIA' | 'ARQUETIPO_LOGO_SEM_PROPORCAO' | 'ARQUETIPO_ESCALA_NAO_DOMINANTE'
  papel: PapelDeTexto | 'logo'
  referencia: RetanguloPx
  zonaEfetiva: RetanguloPx | null
  medida: { width: number; height: number }
  motivo: string
  /**
   * Na recusa por capacidade: o orçamento da UNIDADE — a caixa máxima, a escala
   * em que a escada parou (o piso de 80% quando nada coube) e cada bloco medido.
   */
  orcamento?: { capacidade: { largura: number; altura: number }; escala: number; blocos: Array<{ id: string; papel: string; escala: number; width: number; height: number; linhas: number }> }
}

export interface PapelMaterializado {
  /** A referência do arquétipo, em px. */
  referencia: RetanguloPx
  /** A zona do arquétipo ∩ a área segura efetiva, em px. */
  zonaEfetiva: RetanguloPx
  /** Onde a caixa real pousou: na referência (ou na posição candidata da busca), alinhada como o arquétipo manda. */
  posicao: RetanguloPx
}

export type Materializacao =
  | { ok: true; papeis: Partial<Record<PapelDeTexto | 'logo', PapelMaterializado>>; logoAutomatica: boolean }
  | { ok: false; problemas: ProblemaDeMaterializacao[] }

/**
 * Pousa cada papel na referência. `medidas` é a caixa REAL de cada papel de
 * texto (a pilha medida: textos + vão + elementos presos); `logo`, a razão
 * altura/largura do arquivo da logo (ou `null` sem logo). A logo de posição
 * fixa entra em `contain` na referência: a maior caixa com a proporção do
 * arquivo, rente ao lado do canto da marca e centrada na altura.
 *
 * `deslocamentos` (CP2B) é o `dy` de cada papel escolhido pela busca espacial:
 * a posição parte da referência TRANSLADADA na vertical; a capacidade continua
 * sendo a referência (não muda com o dy), e a zona efetiva e os ornamentos são
 * conferidos onde a caixa pousou, com a mesma tolerância. Sem ele (ou com dy 0)
 * a saída é a de sempre, byte a byte.
 */
export function materializarArquetipo(args: {
  arquetipo: ArquetipoDeLayout
  formato: FormatoDoArquetipo
  canvas: { width: number; height: number }
  geometria: GeometriaEfetiva
  medidas: Partial<Record<PapelDeTexto, { width: number; height: number }>>
  /** Quanto os ornamentos presos aos textos passam da caixa de cada papel (não deslocam a âncora; também têm de caber na zona). */
  ornamentos?: Partial<Record<PapelDeTexto, { esquerda: number; direita: number; topo: number; base: number }>>
  /**
   * #5: a folga (px) do ENVOLVENTE de cada papel (`envoltoriosDoArquetipo`) — a pílula abraça o texto com os ornamentos e
   * também tem de caber na zona efetiva. Ausente = nada a mais (a saída de sempre).
   */
  envoltorios?: Partial<Record<PapelDeTexto, { x: number; y: number }>>
  logo: { razao: number } | null
  /** O `dy` (px, só vertical) de cada papel na busca espacial; ausente = 0, a referência. */
  deslocamentos?: Partial<Record<PapelDeTexto | 'logo', number>>
  /**
   * `false` só para MEDIR onde cada caixa pousaria (a busca calcula daí o intervalo em que a faixa cabe): a
   * capacidade, a logo e a zona vazia continuam conferidas; a caixa e os ornamentos fora da zona, não.
   */
  conferirZona?: boolean
}): Materializacao {
  const { arquetipo, formato, canvas, geometria } = args
  const problemas: ProblemaDeMaterializacao[] = []
  const papeis: Partial<Record<PapelDeTexto | 'logo', PapelMaterializado>> = {}
  let logoAutomatica = false
  const dominante = papelDominante(arquetipo)

  for (const [papel, pos] of Object.entries(arquetipo.formatos[formato].papeis) as Array<[PapelDeTexto | 'logo', NonNullable<ArquetipoDeLayout['formatos']['story']['papeis']['headline']>]>) {
    if ('automatica' in pos) {
      logoAutomatica = true
      continue
    }
    const referencia = emPx(pos.referencia, canvas)
    const zona = zonaEfetiva(pos.zona, canvas, geometria)
    const dy = args.deslocamentos?.[papel] ?? 0
    // Onde a caixa pousa: a referência transladada. As medidas (capacidade, contain) seguem as da referência.
    const y0 = referencia.y + dy
    const onde = dy ? `na posição candidata (dy=${dy}px)` : 'na referência'

    let medida: { width: number; height: number } | null
    let posicao: RetanguloPx | null = null
    if (papel === 'logo') {
      if (!args.logo) continue
      if (!(args.logo.razao > 0)) {
        // A logo é papel obrigatório: arquivo sem proporção legível é recusa, nunca omissão silenciosa.
        problemas.push({
          codigo: 'ARQUETIPO_LOGO_SEM_PROPORCAO',
          papel,
          referencia: arredondado(referencia),
          zonaEfetiva: zona ? arredondado(zona) : null,
          medida: { width: 0, height: 0 },
          motivo: `a logo da marca não tem proporção legível (altura/largura) para entrar em contain ${onde}`,
        })
        continue
      }
      // contain: a maior caixa com a proporção do arquivo dentro da referência.
      const width = Math.min(referencia.width, referencia.height / args.logo.razao)
      const height = width * args.logo.razao
      const canto = arquetipo.preferencias.cantoDaMarca
      // Rente ao lado do canto; no `superior-centro` (#16), centrada na referência — nunca cai num canto.
      const x = canto === 'superior-centro' ? referencia.x + (referencia.width - width) / 2 : canto !== 'auto' && canto.endsWith('direito') ? referencia.x + referencia.width - width : referencia.x
      medida = { width, height }
      posicao = { x, y: y0 + (referencia.height - height) / 2, width, height }
    } else {
      medida = args.medidas[papel] ?? null
      if (!medida) continue
      const alinha = alinhaDoPapel(arquetipo, papel)
      const x = alinha === 'esquerda' ? referencia.x : alinha === 'direita' ? referencia.x + referencia.width - medida.width : referencia.x + (referencia.width - medida.width) / 2
      posicao = { x, y: y0, width: medida.width, height: medida.height }
      // A capacidade é a referência inteira: a altura (com a segunda voz e os elementos presos) e a largura
      // (o texto já foi medido na coluna dela; o que passar daqui são os elementos do arranjo).
      const estouros = [
        ...(excedeAlturaDaReferencia(medida.height, pos.referencia, canvas) ? [`${Math.round(medida.height)} px de altura contra ${Math.floor(referencia.height)} px de capacidade`] : []),
        ...(medida.width > referencia.width + TOLERANCIA_PX ? [`${Math.round(medida.width)} px de largura contra ${Math.floor(referencia.width)} px da referência`] : []),
      ]
      if (estouros.length > 0) {
        problemas.push({
          codigo: 'ARQUETIPO_TEXTO_NAO_CABE',
          papel,
          referencia: arredondado(referencia),
          zonaEfetiva: zona ? arredondado(zona) : null,
          medida: { width: Math.round(medida.width), height: Math.round(medida.height) },
          motivo: `a caixa medida tem ${estouros.join(' e ')}`,
        })
        continue
      }
      // A escala dominante é a identidade do modelo: a escada subiu até onde a referência deixou, e a caixa ainda não
      // domina — recusa dita, nunca um título comum calado.
      if (papel === dominante && medida.width < DOMINANCIA.largura * canvas.width - TOLERANCIA_PX && medida.height < DOMINANCIA.altura * canvas.height - TOLERANCIA_PX) {
        problemas.push({
          codigo: 'ARQUETIPO_ESCALA_NAO_DOMINANTE',
          papel,
          referencia: arredondado(referencia),
          zonaEfetiva: zona ? arredondado(zona) : null,
          medida: { width: Math.round(medida.width), height: Math.round(medida.height) },
          motivo: `a ${papel} tem escala dominante e a caixa real (${Math.round(medida.width)}×${Math.round(medida.height)} px) não chega a ${Math.round(DOMINANCIA.largura * 100)}% da largura (${Math.round(DOMINANCIA.largura * canvas.width)} px) nem a ${Math.round(DOMINANCIA.altura * 100)}% da altura (${Math.round(DOMINANCIA.altura * canvas.height)} px) da peça`,
        })
        continue
      }
    }
    if (!zona) {
      problemas.push({
        codigo: 'ARQUETIPO_ZONA_EFETIVA_VAZIA',
        papel,
        referencia: arredondado(referencia),
        zonaEfetiva: null,
        medida: { width: Math.round(medida.width), height: Math.round(medida.height) },
        motivo: 'a zona do arquétipo fica inteira fora da área segura efetiva do projeto',
      })
      continue
    }
    const orn = papel !== 'logo' ? args.ornamentos?.[papel] : undefined
    if (args.conferirZona !== false && orn && (orn.esquerda > 0 || orn.direita > 0 || orn.topo > 0 || orn.base > 0)) {
      const comOrnamentos = { x: posicao.x - orn.esquerda, y: posicao.y - orn.topo, width: posicao.width + orn.esquerda + orn.direita, height: posicao.height + orn.topo + orn.base }
      if (!dentro(comOrnamentos, zona)) {
        problemas.push({
          codigo: 'ARQUETIPO_FORA_DA_ZONA',
          papel,
          referencia: arredondado(referencia),
          zonaEfetiva: arredondado(zona),
          medida: { width: Math.round(comOrnamentos.width), height: Math.round(comOrnamentos.height) },
          motivo: `com o texto ${onde}, os ornamentos do arranjo da assinatura (ícone, filete, selo) ocupam ${Math.round(comOrnamentos.x)},${Math.round(comOrnamentos.y)} ${Math.round(comOrnamentos.width)}×${Math.round(comOrnamentos.height)} e saem da zona efetiva (${Math.round(zona.x)},${Math.round(zona.y)} ${Math.round(zona.width)}×${Math.round(zona.height)}) — o texto não é deslocado por eles`,
        })
        continue
      }
    }
    const env = papel !== 'logo' ? args.envoltorios?.[papel] : undefined
    if (args.conferirZona !== false && env) {
      const o = orn ?? { esquerda: 0, direita: 0, topo: 0, base: 0 }
      const comPilula = { x: posicao.x - o.esquerda - env.x, y: posicao.y - o.topo - env.y, width: posicao.width + o.esquerda + o.direita + 2 * env.x, height: posicao.height + o.topo + o.base + 2 * env.y }
      if (!dentro(comPilula, zona)) {
        problemas.push({
          codigo: 'ARQUETIPO_FORA_DA_ZONA',
          papel,
          referencia: arredondado(referencia),
          zonaEfetiva: arredondado(zona),
          medida: { width: Math.round(comPilula.width), height: Math.round(comPilula.height) },
          motivo: `com o texto ${onde}, a pílula de contorno (folga ${env.x} × ${env.y} px) ocupa ${Math.round(comPilula.x)},${Math.round(comPilula.y)} ${Math.round(comPilula.width)}×${Math.round(comPilula.height)} e sai da zona efetiva (${Math.round(zona.x)},${Math.round(zona.y)} ${Math.round(zona.width)}×${Math.round(zona.height)}) — o texto não é deslocado por ela`,
        })
        continue
      }
    }
    if (args.conferirZona !== false && !dentro(posicao, zona)) {
      problemas.push({
        codigo: 'ARQUETIPO_FORA_DA_ZONA',
        papel,
        referencia: arredondado(referencia),
        zonaEfetiva: arredondado(zona),
        medida: { width: Math.round(medida.width), height: Math.round(medida.height) },
        // Deslocada, quem corta é a zona (do arquétipo ∩ piso): a frase da área segura só vale na referência.
        motivo: `${onde}, a caixa real (${Math.round(posicao.x)},${Math.round(posicao.y)} ${Math.round(posicao.width)}×${Math.round(posicao.height)}) sai da zona efetiva (${Math.round(zona.x)},${Math.round(zona.y)} ${Math.round(zona.width)}×${Math.round(zona.height)})${dy ? '' : ' — a área segura do projeto corta a referência'}`,
      })
      continue
    }
    papeis[papel] = { referencia: arredondado(referencia), zonaEfetiva: arredondado(zona), posicao: arredondado(posicao) }
  }
  return problemas.length > 0 ? { ok: false, problemas } : { ok: true, papeis, logoAutomatica }
}
