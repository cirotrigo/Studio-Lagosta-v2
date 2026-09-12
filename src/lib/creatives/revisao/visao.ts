/**
 * A VISÃO do revisor da arte (11/09/2026).
 *
 * Pedido do Ciro, depois de ver o desenho só por código: "tem detalhes que por
 * código não está dando para ver — se desse, o compositor não errava". A visão
 * olha a peça RENDERIZADA, a mesma peça com cada bloco marcado (T1, T2… e L1
 * para a logo) e recortes dos blocos em resolução real, e aponta o que a
 * medida não enxerga: o bloco mal colocado, o gradiente pesando na foto, a
 * entrelinha esparramada.
 *
 * O que as lições da casa impõem aqui:
 *  - **schema de texto livre, campos opcionais, rigor na reconciliação**
 *    (crivo, 11/08; decodificador de guia, 16/08): o modelo omite campo e erra
 *    rótulo, e resposta inteira recusada por um campo é resposta boa perdida;
 *  - **aponta pela MARCA desenhada, nunca por índice** — o índice que o modelo
 *    declara já veio deslocado numa lista inteira;
 *  - **vocabulário FECHADO** de problema e de correção; o NÚMERO do ajuste é
 *    calculado pelo código (`regras.ts`), nunca pela visão;
 *  - **evidência observável obrigatória** e confiança baixa descartada: alarme
 *    falso ensina quem aprova a ignorar o aviso (a revisão visual foi
 *    desligada em 10/08/2026 por isso);
 *  - **avisa, nunca veta**, e visão fora do ar deixa a revisão só com as
 *    medidas — nunca derruba a revisão.
 *
 * A reconciliação é pura; só `pedirOlharDaVisao` fala com o modelo.
 */

import { z } from 'zod'
import type { Layer } from '@/types/template'
import type { TextLayerMetrics } from '@/lib/creatives/text-geometry'
import type { ContrasteMedido } from '@/lib/compositor/regua'
import type { Rect } from '@/lib/creatives/halo/halo'
import { papelDaCamada } from '@/lib/compositor/defasagem'
import { blocosDeTexto, entrelinhaDaCamada, leituraDecisiva, logosDaPeca } from './regras'

export const PROBLEMAS_VISTOS = [
  'acento-ou-cedilha-cortado',
  'texto-cortado',
  'texto-sem-leitura',
  'gradiente-escuro-demais',
  'gradiente-claro-demais',
  'entrelinha-grande',
  'titulo-grande',
  'texto-pequeno',
  'posicao-estranha',
  'desalinhado',
  'respiro-desequilibrado',
  'colisao',
  'logo-sobre-texto',
  'texto-sobre-assunto',
  'palavra-orfa',
] as const
export type ProblemaVisto = (typeof PROBLEMAS_VISTOS)[number]

/** Problemas que podem ser da peça inteira (sem marca). */
export const PROBLEMAS_DA_PECA_INTEIRA: readonly ProblemaVisto[] = [
  'gradiente-escuro-demais',
  'gradiente-claro-demais',
  'respiro-desequilibrado',
  'posicao-estranha',
  'desalinhado',
]

export const CORRECOES_VISTAS = [
  'reduzir-fonte',
  'aumentar-fonte',
  'reduzir-entrelinha',
  'aumentar-entrelinha',
  'subir',
  'descer',
  'mover-esquerda',
  'mover-direita',
  'mais-gradiente',
  'menos-gradiente',
  'mover-logo',
  'aumentar-caixa',
] as const
export type CorrecaoVista = (typeof CORRECOES_VISTAS)[number]

export const INTENSIDADES = ['pouco', 'medio', 'muito'] as const
export type Intensidade = (typeof INTENSIDADES)[number]

export interface MarcaDaPeca {
  marca: string
  tipo: 'texto' | 'logo'
  camadas: string[]
  rect: Rect
  descricao: string
}

export interface AchadoVisto {
  marca: MarcaDaPeca | null
  problema: ProblemaVisto
  evidencia: string
  confianca: 'alta' | 'media'
  correcao: CorrecaoVista | null
  intensidade: Intensidade
}

export const TETO_DE_ACHADOS_VISTOS = 6

/** As marcas desenhadas na imagem: um T por bloco de texto (de cima para baixo) e um L por logo solta. */
export function marcasDaPeca(camadas: Layer[], metricas: TextLayerMetrics[]): MarcaDaPeca[] {
  const marcas: MarcaDaPeca[] = blocosDeTexto(camadas, metricas).map((b, i) => ({
    marca: `T${i + 1}`,
    tipo: 'texto',
    camadas: b.textos.map((t) => t.camada.id),
    rect: b.tinta,
    descricao: b.textos
      .map((t) => String(t.camada.content ?? '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join(' / ')
      .slice(0, 90),
  }))
  logosDaPeca(camadas).forEach((l, i) =>
    marcas.push({
      marca: `L${i + 1}`,
      tipo: 'logo',
      camadas: [l.id],
      rect: { x: l.position.x, y: l.position.y, width: l.size.width, height: l.size.height },
      descricao: 'a logo',
    }),
  )
  return marcas
}

/** O que o modelo recebe como schema: tudo opcional e em texto — o rigor é da reconciliação. */
export const respostaDaVisaoSchema = z.object({
  achados: z
    .array(
      z.object({
        marca: z.string().optional(),
        problema: z.string().optional(),
        evidencia: z.string().optional(),
        confianca: z.string().optional(),
        correcao: z.string().optional(),
        intensidade: z.string().optional(),
      }),
    )
    .optional(),
})

function slug(v: unknown): string {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')
}

/** Cada campo é suspeito: o que não casa com o vocabulário ou com uma marca da peça é descartado. */
export function reconciliarVisao(bruto: unknown, marcas: MarcaDaPeca[]): { vistos: AchadoVisto[]; descartados: number } {
  const lido = respostaDaVisaoSchema.safeParse(bruto)
  const itens = lido.success ? (lido.data.achados ?? []) : []
  const porMarca = new Map(marcas.map((m) => [m.marca.toUpperCase(), m]))
  const vistos: AchadoVisto[] = []
  const vistas = new Set<string>()
  let descartados = lido.success ? 0 : 1
  for (const item of itens) {
    const problema = slug(item.problema) as ProblemaVisto
    if (!PROBLEMAS_VISTOS.includes(problema)) {
      descartados++
      continue
    }
    const rotulo = String(item.marca ?? '').trim().toUpperCase().replace(/\s+/g, '')
    const marca = porMarca.get(rotulo) ?? null
    if (!marca && !(PROBLEMAS_DA_PECA_INTEIRA.includes(problema) && (rotulo === '' || rotulo === 'PECA' || rotulo === 'PEÇA'))) {
      descartados++
      continue
    }
    const confianca = slug(item.confianca)
    if (confianca !== 'alta' && confianca !== 'media') {
      descartados++
      continue
    }
    const evidencia = String(item.evidencia ?? '').replace(/\s+/g, ' ').trim()
    if (evidencia.length < 12) {
      descartados++
      continue
    }
    const chave = `${marca?.marca ?? 'PECA'}|${problema}`
    if (vistas.has(chave)) continue
    vistas.add(chave)
    const correcao = slug(item.correcao) as CorrecaoVista
    const intensidade = slug(item.intensidade) as Intensidade
    vistos.push({
      marca,
      problema,
      evidencia: evidencia.slice(0, 400),
      confianca,
      correcao: CORRECOES_VISTAS.includes(correcao) ? correcao : null,
      intensidade: INTENSIDADES.includes(intensidade) ? intensidade : 'pouco',
    })
    if (vistos.length >= TETO_DE_ACHADOS_VISTOS) break
  }
  return { vistos, descartados }
}

export const SYSTEM_DA_VISAO = `Você revisa a diagramação de stories e posts de Instagram de restaurantes, feitos no editor de um estúdio. Recebe a peça JÁ RENDERIZADA, a mesma peça com os blocos de texto marcados (T1, T2… e L1 para a logo) e recortes ampliados dos blocos em resolução real. Aponte só DEFEITOS DE EXECUÇÃO que você consegue VER. Não opine sobre a copy (palavras, gramática, tom), sobre a escolha da foto nem sobre as cores da marca.

Os defeitos possíveis, com estes nomes exatos em "problema":
- acento-ou-cedilha-cortado: parte de uma letra (acento, cedilha, a perna do g, p ou q) cortada por uma borda invisível.
- texto-cortado: linha ou palavra cortada, faltando pedaço.
- texto-sem-leitura: dá esforço para ler o texto sobre a foto.
- gradiente-escuro-demais: a sombra atrás do texto escurece a foto além do que o texto precisa, apaga o assunto ou vira faixa pesada.
- gradiente-claro-demais: falta sombra atrás do texto e ele se perde na foto.
- entrelinha-grande: as linhas de um mesmo bloco afastadas demais, o bloco se esparrama.
- titulo-grande: o título domina a peça e compete com a foto.
- texto-pequeno: texto miúdo demais para ler no celular.
- posicao-estranha: o bloco parece solto ou mal colocado em relação à foto e aos outros blocos.
- desalinhado: blocos que deveriam dividir a mesma margem ou o mesmo eixo não dividem.
- respiro-desequilibrado: um lado da peça apertado e outro vazio sem motivo.
- colisao: textos ou elementos encostando ou sobrepostos.
- logo-sobre-texto: a logo encosta ou cobre um texto.
- texto-sobre-assunto: o texto cobre o prato, a bebida ou o rosto que a foto quer mostrar.
- palavra-orfa: uma palavra sozinha na última linha de um bloco.

Para cada defeito, preencha:
- marca: a marca do bloco afetado (T1, L1…). Use PECA só quando o defeito é da peça inteira.
- evidencia: o que se vê, concreto e localizável — onde, qual letra, que parte da foto. Sem evidência observável, não aponte.
- confianca: alta (evidente), media (provável) ou baixa (dúvida).
- correcao: a correção mais simples desta lista, ou vazio quando o conserto é trocar a foto ou reescrever: reduzir-fonte, aumentar-fonte, reduzir-entrelinha, aumentar-entrelinha, subir, descer, mover-esquerda, mover-direita, mais-gradiente, menos-gradiente, mover-logo, aumentar-caixa.
- intensidade: pouco, medio ou muito.

Regras:
- Peça boa não tem achado: a lista vazia é resposta válida e comum.
- No máximo 6 achados, do mais grave ao menos grave.
- As medidas do código que vêm junto são apoio: não aponte um problema medido se a imagem não o mostra.
- No story, a interface do Instagram cobre uma faixa no topo (foto de perfil) e outra no rodapé (campo de resposta).`

/** O contexto medido que acompanha as imagens. */
export function textoDeContexto(args: {
  formato: string | null
  canvas: { width: number; height: number }
  marcas: MarcaDaPeca[]
  camadas: Layer[]
  metricas: TextLayerMetrics[]
  contraste: ContrasteMedido[] | null
  recortes: string[]
}): string {
  const porId = new Map(args.camadas.map((l) => [l.id, l]))
  const metricaPorId = new Map(args.metricas.map((m) => [m.layerId, m]))
  const linhas = [
    `Peça: ${args.formato ?? 'formato não identificado'}, ${args.canvas.width}x${args.canvas.height}.`,
    'Imagem 1: a peça como sai no render. Imagem 2: a mesma peça com as marcas.',
    ...args.recortes.map((marca, i) => `Imagem ${i + 3}: recorte ampliado de ${marca}, em resolução real.`),
    '',
    'Marcas:',
  ]
  for (const m of args.marcas) {
    if (m.tipo === 'logo') {
      linhas.push(`- ${m.marca}: a logo`)
      continue
    }
    const detalhes = m.camadas
      .map((id) => {
        const camada = porId.get(id)
        const metrica = metricaPorId.get(id)
        if (!camada || !metrica) return null
        const papel = papelDaCamada(camada) ?? 'texto'
        return `${papel} ${Math.round(metrica.fontSize)}px, ${metrica.lineCount} ${metrica.lineCount === 1 ? 'linha' : 'linhas'}, entrelinha ${entrelinhaDaCamada(camada)}`
      })
      .filter(Boolean)
      .join('; ')
    linhas.push(`- ${m.marca}: "${m.descricao}" — ${detalhes}`)
  }
  if (args.contraste?.length) {
    linhas.push('', 'Régua de contraste medida pelo código (fundo sob o texto contra o alvo de leitura):')
    for (const c of args.contraste) {
      const marca = args.marcas.find((m) => m.camadas.some((id) => c.camadas.includes(id)))
      const d = leituraDecisiva(c)
      linhas.push(
        `- ${marca?.marca ?? c.grupo}: ${d.ok ? 'dentro do alvo' : 'fora do alvo'} (${d.sentido === 'escuro' ? 'p2' : 'p98'} ${d.p98}, alvo ${d.alvo}, força do gradiente ${d.tinta})`,
      )
    }
  }
  return linhas.join('\n')
}

export const MODELO_DA_VISAO = process.env.OPENAI_REVISOR_MODEL || process.env.OPENAI_PLANNER_MODEL || 'gpt-5.2'

/** A chamada ao modelo. Lança em falha — quem chama transforma em "a visão não rodou". */
export async function pedirOlharDaVisao(partes: Array<{ texto: string } | { imagem: Buffer }>): Promise<unknown> {
  const [{ generateObject }, { openai }] = await Promise.all([import('ai'), import('@ai-sdk/openai')])
  const { object } = await generateObject({
    model: openai(MODELO_DA_VISAO),
    maxOutputTokens: 8000,
    abortSignal: AbortSignal.timeout(120_000),
    schema: respostaDaVisaoSchema,
    system: SYSTEM_DA_VISAO,
    messages: [
      {
        role: 'user',
        content: partes.map((p) =>
          'imagem' in p ? { type: 'image' as const, image: p.imagem } : { type: 'text' as const, text: p.texto },
        ),
      },
    ],
  })
  return object
}
