/**
 * O estilo OBSERVADO nas peças aprovadas de uma marca — a "assinatura real",
 * lida por visão a partir das artes que a equipe marcou como referência ou
 * aprovou com "gostei" (05/09/2026, pedido do Ciro: "analise as artes de
 * referência de todos os clientes para personalizar o estilo de cada um").
 *
 * Por que uma estrutura e não prosa: o manual de marca GERADO
 * (`manual-de-marca.ts`) desenha separadores e ícones a partir da lista, e o
 * planejador (`diretor-de-arte.ts`) recebe o texto formatado. Uma coisa só,
 * duas leituras.
 *
 * Módulo PURO (zod só): a aba Marca é client e o catálogo do MCP carrega sem
 * env. Quem lê e escreve o banco é `analise-de-referencias.ts`.
 */

import { z } from 'zod'

export const SEPARADORES = [
  'filete-fino',
  'filete-duplo',
  'pontilhado',
  'tracejado',
  'sublinhado-manuscrito',
  'linha-com-losango',
  'linha-com-ponto',
  'barra-vertical',
  'seta-curva',
  'moldura-fina',
  'pill',
  'tag-de-cor',
] as const
export type Separador = (typeof SEPARADORES)[number]

export const ICONES = [
  'relogio',
  'calendario',
  'pin-de-mapa',
  'telefone',
  'garfo-e-faca',
  'taca',
  'caneca',
  'chama',
  'espeto',
  'pessoas',
  'mao',
  'estrela',
  'coracao',
  'seta',
  'folha',
  'sol',
  'nenhum',
] as const
export type Icone = (typeof ICONES)[number]

/**
 * O que o MODELO devolve: separadores e ícones como texto livre. Validar por
 * enum recusaria a resposta INTEIRA por um item fora do vocabulário (lição do
 * crivo, 11/08/2026 — e aconteceu de novo aqui com a Lagosta Criativa em
 * 05/09). O rigor mora em `normalizarEstilo`, que casa cada item com o
 * vocabulário e manda o que não casa para `ornamentos`.
 */
export const estiloBrutoSchema = z.object({
  tipografia: z.object({
    manchete: z.string(),
    apoio: z.string(),
    servico: z.string(),
    destaque: z.string(),
  }),
  caixaDaManchete: z.string(),
  efeitoDaManchete: z
    .string()
    .optional()
    .describe('O acabamento das letras da manchete, se houver: "nenhum", "sombra-dura" (deslocada, sem desfoque, em outra cor), "sombra-suave" (desfocada), "contorno". Só o que se VÊ nas peças.'),
  coresDeDestaque: z.array(z.object({ hex: z.string(), papel: z.string() })).max(8),
  separadores: z.array(z.string()).max(8).describe(`Só valores desta lista: ${SEPARADORES.join(', ')}.`),
  icones: z.array(z.string()).max(10).describe(`Só valores desta lista: ${ICONES.join(', ')}.`),
  estiloDosIcones: z.string().optional(),
  ornamentos: z.array(z.string()).max(8),
  diagramacao: z.string(),
  tratamentoDaFoto: z.string(),
  logo: z.string(),
  evitar: z.array(z.string()).max(10),
  resumo: z.string(),
})
export type EstiloBruto = z.infer<typeof estiloBrutoSchema>

export const estiloDasReferenciasSchema = z.object({
  /** Como cada nível de texto é vestido — fonte pelo PAPEL, caixa, cor, peso. */
  tipografia: z.object({
    manchete: z.string().describe('Como a manchete é desenhada: família (pelo papel: serifa/slab/grotesk/manuscrita), caixa, cor, peso, se tem duas vozes (duas cores ou duas fontes).'),
    apoio: z.string().describe('Como o texto de apoio/subtítulo é desenhado.'),
    servico: z.string().describe('Como horário/endereço/CTA são desenhados (tamanho relativo, caixa, cor).'),
    destaque: z.string().describe('Como a marca destaca uma palavra ou linha (cor, fonte manuscrita, fundo, sublinhado).'),
  }),
  /** Caixa da manchete, medida nas peças: 'alta' | 'natural' | 'mista'. */
  caixaDaManchete: z.enum(['alta', 'natural', 'mista']),
  /**
   * O acabamento das letras da manchete. 'sombra-dura' é a sombra DESLOCADA e
   * sem desfoque, em OUTRA cor da paleta — a assinatura do Seu Quinto (Ciro,
   * 06/09/2026: "sempre tem uma sombra nítida na headline, sempre usando duas
   * combinações de cores da paleta"). O manual desenha a amostra com ele.
   */
  efeitoDaManchete: z.enum(['nenhum', 'sombra-dura', 'sombra-suave', 'contorno']).default('nenhum'),
  /** Cores usadas na camada gráfica, em hex quando der para inferir, com o papel de cada uma. */
  coresDeDestaque: z.array(z.object({ hex: z.string(), papel: z.string() })).max(6),
  /** Separadores que aparecem nas peças, do vocabulário fechado. */
  separadores: z.array(z.enum(SEPARADORES)).max(6),
  /** Ícones que aparecem nas peças, do vocabulário fechado. */
  icones: z.array(z.enum(ICONES)).max(8),
  /** Como os ícones são desenhados (traço fino/cheio, cor, tamanho relativo à linha). */
  estiloDosIcones: z.string().optional(),
  /** Ornamentos além de separador e ícone (selo, faixa, botão, moldura), descritos. */
  ornamentos: z.array(z.string()).max(6),
  /** Onde o texto costuma pousar, alinhamento, respiro, quantas zonas. */
  diagramacao: z.string(),
  /** Como a foto aparece: intacta, com halo local, com véu, escurecida, clara. */
  tratamentoDaFoto: z.string(),
  /** Onde a marca fica e em que versão (colorida, branca, selo). */
  logo: z.string(),
  /** O que NUNCA aparece nas peças aprovadas — o que o gerador deve evitar. */
  evitar: z.array(z.string()).max(8),
  /** Três a cinco frases, em português, que um diretor de arte diria a um designer novo sobre esta marca. */
  resumo: z.string(),
})

export type EstiloDasReferencias = z.infer<typeof estiloDasReferenciasSchema>

const semAcento = (v: string) =>
  v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/** Sinônimos que o modelo usa e que casam com um item do vocabulário. */
const SINONIMOS_DE_SEPARADOR: Array<[RegExp, Separador]> = [
  [/losango|diamante/, 'linha-com-losango'],
  [/ponto-central|linha-com-ponto|bolinha/, 'linha-com-ponto'],
  [/pontilhad|dotted/, 'pontilhado'],
  [/tracejad|dashed/, 'tracejado'],
  [/manuscrit|brush|rabisc|sublinhado/, 'sublinhado-manuscrito'],
  [/dupl|double/, 'filete-duplo'],
  [/barra|vertical|pipe/, 'barra-vertical'],
  [/seta/, 'seta-curva'],
  [/moldura|borda|frame/, 'moldura-fina'],
  [/pill|capsula|cápsula/, 'pill'],
  [/tag|etiqueta|botao|button|caixa-de-cor/, 'tag-de-cor'],
  [/filete|linha|rule|hairline|fino/, 'filete-fino'],
]
const SINONIMOS_DE_ICONE: Array<[RegExp, Icone]> = [
  [/relogio|clock|horario/, 'relogio'],
  [/calendario|calendar|data/, 'calendario'],
  [/pin|mapa|local|alfinete|endereco/, 'pin-de-mapa'],
  [/telefone|phone|whatsapp|celular/, 'telefone'],
  [/garfo|faca|talher|cutlery|prato/, 'garfo-e-faca'],
  [/taca|vinho|wine|copo/, 'taca'],
  [/caneca|chope|cerveja|beer|mug/, 'caneca'],
  [/chama|fogo|fire|flame|brasa/, 'chama'],
  [/espeto|skewer|churrasco/, 'espeto'],
  [/pessoa|people|gente|familia|grupo|casal/, 'pessoas'],
  [/mao|hand|hang-loose|joia|like/, 'mao'],
  [/estrela|star/, 'estrela'],
  [/coracao|heart|amor/, 'coracao'],
  [/seta|arrow/, 'seta'],
  [/folha|leaf|planta/, 'folha'],
  [/sol|sun/, 'sol'],
  [/nenhum|none|sem-icone/, 'nenhum'],
]

function casar<T extends string>(valor: string, vocabulario: readonly T[], sinonimos: Array<[RegExp, T]>): T | null {
  const chave = semAcento(valor)
  const exato = vocabulario.find((v) => v === chave)
  if (exato) return exato
  const porSinonimo = sinonimos.find(([re]) => re.test(chave))
  return porSinonimo ? porSinonimo[1] : null
}

/**
 * Reconcilia a resposta do modelo com o vocabulário fechado. Item que não
 * casa com separador/ícone nenhum não é descartado: vira ornamento descrito,
 * que o planejador lê e o manual não desenha.
 */
export function normalizarEstilo(bruto: EstiloBruto): EstiloDasReferencias {
  const ornamentos = [...bruto.ornamentos]
  const separadores: Separador[] = []
  for (const v of bruto.separadores) {
    const s = casar(v, SEPARADORES, SINONIMOS_DE_SEPARADOR)
    if (s && !separadores.includes(s)) separadores.push(s)
    else if (!s) ornamentos.push(`separador: ${v}`)
  }
  const icones: Icone[] = []
  for (const v of bruto.icones) {
    const i = casar(v, ICONES, SINONIMOS_DE_ICONE)
    if (i && !icones.includes(i)) icones.push(i)
    else if (!i) ornamentos.push(`ícone: ${v}`)
  }
  const efeitoLido = semAcento(bruto.efeitoDaManchete ?? '')
  const efeitoDaManchete: EstiloDasReferencias['efeitoDaManchete'] = /dura|extrud|deslocad|hard|drop/.test(efeitoLido)
    ? 'sombra-dura'
    : /suave|soft|desfoc|blur/.test(efeitoLido)
      ? 'sombra-suave'
      : /contorno|outline|stroke/.test(efeitoLido)
        ? 'contorno'
        : 'nenhum'
  const caixa = semAcento(bruto.caixaDaManchete)
  const caixaDaManchete: EstiloDasReferencias['caixaDaManchete'] = /alta|upper|maiuscul|caps/.test(caixa)
    ? 'alta'
    : /mist|mix|ambas|varia/.test(caixa)
      ? 'mista'
      : 'natural'
  return {
    tipografia: bruto.tipografia,
    caixaDaManchete,
    efeitoDaManchete,
    coresDeDestaque: bruto.coresDeDestaque.slice(0, 6),
    separadores: separadores.slice(0, 6),
    icones: icones.length ? icones.slice(0, 8) : ['nenhum'],
    estiloDosIcones: bruto.estiloDosIcones,
    ornamentos: ornamentos.slice(0, 6),
    diagramacao: bruto.diagramacao,
    tratamentoDaFoto: bruto.tratamentoDaFoto,
    logo: bruto.logo,
    evitar: bruto.evitar.slice(0, 8),
    resumo: bruto.resumo,
  }
}

/** Metadados de proveniência guardados junto com o estilo. */
export interface EstiloDasReferenciasGravado extends EstiloDasReferencias {
  /** Quantas artes foram lidas e quais. */
  fontes: { generationIds: string[]; urls: string[]; lidoEm: string; modelo: string }
}

/** Lê o Json do banco com tolerância: forma inválida vira null, nunca erro. */
export function lerEstiloDasReferencias(bruto: unknown): EstiloDasReferenciasGravado | null {
  if (!bruto || typeof bruto !== 'object') return null
  const parsed = estiloDasReferenciasSchema.safeParse(bruto)
  if (!parsed.success) return null
  const fontes = (bruto as { fontes?: EstiloDasReferenciasGravado['fontes'] }).fontes
  return {
    ...parsed.data,
    fontes: fontes ?? { generationIds: [], urls: [], lidoEm: '', modelo: '' },
  }
}

const NOME_DO_SEPARADOR: Record<Separador, string> = {
  'filete-fino': 'filete fino',
  'filete-duplo': 'filete duplo',
  pontilhado: 'linha pontilhada',
  tracejado: 'linha tracejada',
  'sublinhado-manuscrito': 'sublinhado manuscrito',
  'linha-com-losango': 'filete com losango central',
  'linha-com-ponto': 'filete com ponto central',
  'barra-vertical': 'barra vertical entre colunas',
  'seta-curva': 'seta curva desenhada à mão',
  'moldura-fina': 'moldura fina',
  pill: 'pill (cápsula de cor atrás de uma palavra)',
  'tag-de-cor': 'tag/etiqueta de cor atrás do CTA',
}

const NOME_DO_ICONE: Record<Icone, string> = {
  relogio: 'relógio',
  calendario: 'calendário',
  'pin-de-mapa': 'pin de mapa',
  telefone: 'telefone',
  'garfo-e-faca': 'garfo e faca',
  taca: 'taça',
  caneca: 'caneca',
  chama: 'chama',
  espeto: 'espeto',
  pessoas: 'pessoas',
  mao: 'mão',
  estrela: 'estrela',
  coracao: 'coração',
  seta: 'seta',
  folha: 'folha',
  sol: 'sol',
  nenhum: 'nenhum',
}

export function nomeDoSeparador(s: Separador): string {
  return NOME_DO_SEPARADOR[s]
}
export function nomeDoIcone(i: Icone): string {
  return NOME_DO_ICONE[i]
}

/**
 * O texto que o planejador recebe. Curto e concreto: é a assinatura REAL da
 * marca, lida das peças aprovadas — pesa mais que a prosa do DNA quando as
 * duas divergirem, e o planejador é avisado disso.
 */
export function formatarEstiloParaPrompt(estilo: EstiloDasReferencias): string {
  const linhas: string[] = []
  const EFEITO: Record<EstiloDasReferencias['efeitoDaManchete'], string> = {
    nenhum: '',
    'sombra-dura': ' Acabamento: sombra DURA (deslocada, sem desfoque) em outra cor da paleta — sempre.',
    'sombra-suave': ' Acabamento: sombra suave (desfocada) atrás das letras.',
    contorno: ' Acabamento: contorno nas letras.',
  }
  linhas.push(`Manchete: ${estilo.tipografia.manchete} (caixa ${estilo.caixaDaManchete}).${EFEITO[estilo.efeitoDaManchete]}`)
  linhas.push(`Apoio: ${estilo.tipografia.apoio}`)
  linhas.push(`Serviço/CTA: ${estilo.tipografia.servico}`)
  linhas.push(`Destaque: ${estilo.tipografia.destaque}`)
  if (estilo.coresDeDestaque.length) {
    linhas.push(`Cores da camada gráfica: ${estilo.coresDeDestaque.map((c) => `${c.hex.toUpperCase()} (${c.papel})`).join('; ')}.`)
  }
  linhas.push(
    estilo.separadores.length
      ? `Separadores que a marca usa: ${estilo.separadores.map(nomeDoSeparador).join(', ')}.`
      : 'A marca não usa separadores.',
  )
  const icones = estilo.icones.filter((i) => i !== 'nenhum')
  linhas.push(
    icones.length
      ? `Ícones que a marca usa: ${icones.map(nomeDoIcone).join(', ')}${estilo.estiloDosIcones ? ` — ${estilo.estiloDosIcones}` : ''}.`
      : 'A marca não usa ícones.',
  )
  if (estilo.ornamentos.length) linhas.push(`Ornamentos: ${estilo.ornamentos.join('; ')}.`)
  linhas.push(`Diagramação habitual: ${estilo.diagramacao}`)
  linhas.push(`Foto: ${estilo.tratamentoDaFoto}`)
  linhas.push(`Logo: ${estilo.logo}`)
  if (estilo.evitar.length) linhas.push(`Nunca aparece nas peças aprovadas: ${estilo.evitar.join('; ')}.`)
  linhas.push(`Em resumo: ${estilo.resumo}`)
  return linhas.join('\n')
}
