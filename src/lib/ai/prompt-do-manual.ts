/**
 * O PROMPT DO MANUAL — a peça avulsa descrita a partir do design system do
 * cliente, no molde do prompt que o Ciro escreveu à mão para o happy hour da
 * Wine Vix em 08/09/2026 e pediu "algo parecido para cada cliente".
 *
 * O que o molde dele tem de bom e fica: os três insumos declarados (manual,
 * foto, copy); o manual como fonte ÚNICA de fonte, cor, logo e filete; a foto
 * em tela cheia e intocada; a estrutura numerada (fundo → logo → bloco →
 * título → subtítulo → filete → área central → rodapé → paleta → hierarquia);
 * o título com UMA palavra na cor de destaque; a área central livre; os textos
 * exatos no FIM, onde pesam mais.
 *
 * O que muda, e por quê:
 *  - É GENÉRICO para qualquer foto (pedido dele, com um tartare visto de cima
 *    e uma cliente de taça na mão como exemplos): o bloco PREFERE o topo, mas
 *    se o topo tiver rosto ou o assunto, desce para o terço inferior e a
 *    linha de serviço sobe. Nada assume onde o assunto está.
 *  - As proibições caem de 15 para 7. Medido três vezes nesta casa: lista
 *    longa de "não" não segura nada; o que segura é a instrução colada ao que
 *    ela governa e os textos exatos por último.
 *  - Nome de fonte NUNCA aparece — vira texto desenhado (medido em 05/09). A
 *    fonte é citada pelo PAPEL ("tipografia de manchete do manual").
 *  - Cor, filete, caixa, posição da logo e alinhamento vêm do ESTILO lido nas
 *    peças aprovadas de cada marca (`estiloDasReferencias`), não de um texto
 *    fixo: é o que faz o mesmo molde render Vix, By Rock e Seu Quinto.
 *  - Em português, como ele escreveu: quem lê e edita é gente.
 *
 * Módulo PURO (sem Prisma), mesma razão de `art-direction.ts`.
 */

import type { BrandContext } from '@/lib/brand/brand-context'
import { NOME_DO_SEPARADOR, type EstiloDasReferencias } from '@/lib/brand/estilo-das-referencias'
import { blocosDeServico } from './blocos-de-servico'
import { CAIXA_DA_MANCHETE } from './caixa-da-copy'
import type { LogoCorner } from './logo-compositor'

export type FormatoDaPeca = 'story' | 'feed' | 'quadrado'

export interface PromptDoManualArgs {
  brand: BrandContext
  estilo: EstiloDasReferencias | null
  /** Blocos da copy na ordem de leitura; o serviço (horário/endereço) é reconhecido sozinho. */
  copy: string[]
  formato?: FormatoDaPeca
  /** Índice (1-based) da imagem em que a FOTO chega ao modelo. */
  indiceDaFoto?: number
  /** Índice (1-based) da imagem em que o MANUAL chega ao modelo. */
  indiceDoManual?: number
  /**
   * Como a logo chega à peça: desenhada a partir do manual (default) ou
   * COLADA pelo sistema depois da geração num canto reservado
   * (`logoMode: 'compor'` — TERO, Wine Vix, Lagosta). No segundo caso o manual
   * continua indo ao modelo (é a fonte de fonte e cor), e a seção da logo
   * vira a reserva do canto.
   */
  logo?: { modo: 'modelo' } | { modo: 'compor'; canto: LogoCorner }
  /** Alteração pedida na FOTO — a única exceção ao "não altere". */
  instrucaoImagem?: string | null
  /** Observação livre de quem pediu a peça. */
  pedido?: string | null
}

const NOME_DO_CANTO: Record<LogoCorner, string> = {
  'top-right': 'no canto superior direito',
  'top-left': 'no canto superior esquerdo',
  'bottom-right': 'no canto inferior direito',
  'bottom-left': 'no canto inferior esquerdo',
}

function luminancia(hex: string): number {
  const h = hex.replace('#', '')
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function saturacao(hex: string): number {
  const h = hex.replace('#', '')
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16)
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  return max === 0 ? 0 : (max - min) / max
}

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)]
}
function distancia(a: string, b: string): number {
  const [r1, g1, b1] = rgb(a), [r2, g2, b2] = rgb(b)
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2)
}

/** A cor do TEXTO (a mais clara da paleta) e a de DESTAQUE (a lida nas peças, encaixada na paleta). */
export function coresDaPeca(brand: BrandContext, estilo: EstiloDasReferencias | null) {
  const cores = brand.colors.map((c) => ({ nome: c.name, hex: c.hexCode.toUpperCase() }))
  const texto = [...cores].sort((a, b) => luminancia(b.hex) - luminancia(a.hex))[0] ?? { nome: 'branco', hex: '#FFFFFF' }
  // A cor de destaque LIDA nas peças (ex.: o dourado #D6B15A da Vix) quase
  // nunca é um hex da paleta — é a mesma cor vista sob a luz da foto. A
  // paleta é a lei: encaixa na cor mais próxima dela, nunca inventa uma
  // quinta cor nem chama de "destaque" sem nome.
  const lida = estilo?.coresDeDestaque?.[0]?.hex?.toUpperCase()
  const candidatas = cores.filter((c) => c.hex !== texto.hex)
  const maisProxima = lida && candidatas.length ? [...candidatas].sort((a, b) => distancia(a.hex, lida) - distancia(b.hex, lida))[0] : undefined
  const destaque = maisProxima ?? [...candidatas].sort((a, b) => saturacao(b.hex) - saturacao(a.hex))[0] ?? texto
  return { texto, destaque, todas: cores }
}

/**
 * O CANTO em que a marca costuma pôr a logo, lido da prosa das peças
 * aprovadas. `null` quando a marca a centraliza (ou quando a leitura não diz):
 * chutar um lado seria inventar — e no modo `compor` o compositor volta a
 * escolher por calma e contraste, que é o certo sem ter de quem herdar.
 */
export function cantoDaLogoDoEstilo(estilo: EstiloDasReferencias | null): LogoCorner | null {
  const t = `${estilo?.logo ?? ''} ${estilo?.diagramacao ?? ''}`.toLowerCase()
  if (/superior direit/.test(t)) return 'top-right'
  if (/superior esquerd/.test(t)) return 'top-left'
  if (/inferior direit/.test(t)) return 'bottom-right'
  if (/inferior esquerd/.test(t)) return 'bottom-left'
  return null
}

/** Onde a marca põe a logo, lido da prosa das peças aprovadas; sem leitura, centralizada no topo. */
function posicaoDaLogo(estilo: EstiloDasReferencias | null): string {
  const canto = cantoDaLogoDoEstilo(estilo)
  if (canto) return NOME_DO_CANTO[canto]
  const t = `${estilo?.logo ?? ''} ${estilo?.diagramacao ?? ''}`.toLowerCase()
  if (/topo|superior|alto/.test(t) && /centr/.test(t)) return 'centralizada no topo'
  return 'centralizada na parte superior'
}

function alinhamento(estilo: EstiloDasReferencias | null): string {
  const t = (estilo?.diagramacao ?? '').toLowerCase()
  if (/esquerda/.test(t)) return 'alinhado à esquerda'
  return 'centralizado'
}

/**
 * O mapa da casa (`CAIXA_DA_MANCHETE`, medido cliente a cliente) vence a
 * leitura das peças: a Vix saiu "alta" na leitura porque uma referência
 * estava em caps, mas o DNA e o Ciro (16/08) pedem Title Case.
 */
function caixa(projectId: number, estilo: EstiloDasReferencias | null): string {
  const daCasa = CAIXA_DA_MANCHETE.get(projectId)
  switch (daCasa ?? estilo?.caixaDaManchete) {
    case 'alta':
      return 'em CAIXA ALTA, como a marca escreve manchete'
    case 'natural':
      return 'em caixa natural (só a inicial maiúscula), como a marca escreve manchete'
    default:
      return 'na caixa que o manual mostra na amostra de manchete'
  }
}

function acabamento(estilo: EstiloDasReferencias | null): string {
  switch (estilo?.efeitoDaManchete) {
    case 'sombra-dura':
      return 'Acabamento da marca: sombra DURA, deslocada e sem desfoque, em outra cor da paleta. Nada além disso.'
    case 'sombra-suave':
      return 'Acabamento da marca: sombra suave atrás das letras. Nada além disso.'
    case 'contorno':
      return 'Acabamento da marca: contorno fino nas letras. Nada além disso.'
    default:
      return 'Sem sombra, contorno, glow, 3D ou qualquer efeito nas letras.'
  }
}

const aspas = (t: string) => `“${t.replace(/\s+/g, ' ').trim()}”`

/**
 * A prosa lida das peças descreve também COMO a foto era tratada ("fundo
 * fotográfico com degradê escuro", "foto escura + tarja preta") — e isso
 * contradiz a regra do FUNDO, que manda o halo sutil e proíbe tarja. O
 * tratamento da foto é regra desta peça, não estética da marca: essas
 * orações saem, o resto fica.
 */
function semTratamentoDaFoto(resumo: string): string {
  const SUSPEITA = /tarja|v[ée]u|degrad|gradiente|escurec|vinheta|fundo fotogr/i
  const frases = resumo
    .split(/(?<=[.;])\s+/)
    .map((frase) => {
      const fim = /[.;]$/.test(frase) ? frase.slice(-1) : ''
      const limpa = frase.split(/,\s+(?=[a-záéíóúç])/).filter((oracao) => !SUSPEITA.test(oracao)).join(', ')
      return limpa && fim && !/[.;]$/.test(limpa) ? limpa + fim : limpa
    })
    .filter((frase) => frase.replace(/[.;,\s]/g, '').length > 0)
  let texto = frases.join(' ').replace(/,\s*([.;])/g, '$1').replace(/\s+/g, ' ').trim()
  if (texto && !/[.!?]$/.test(texto)) texto += '.'
  return texto ? texto[0].toUpperCase() + texto.slice(1) : ''
}

/**
 * Monta o prompt. Os blocos de serviço (horário, endereço) vão para o rodapé;
 * o primeiro bloco restante é o título, o segundo o subtítulo, e o que sobrar
 * entra como linha de apoio abaixo do subtítulo.
 */
export function montarPromptDoManual({
  brand,
  estilo,
  copy,
  formato = 'story',
  indiceDaFoto = 1,
  indiceDoManual = 2,
  logo = { modo: 'modelo' },
  instrucaoImagem,
  pedido,
}: PromptDoManualArgs): string {
  const ajuste = instrucaoImagem?.trim()
  const nota = pedido?.trim()
  const marca = brand.projectName
  const servico = blocosDeServico(copy)
  const idxServico = new Set(servico.map((s) => s.indice))
  const corpo = copy.map((t, i) => ({ t: t.replace(/\s+/g, ' ').trim(), i })).filter((b) => b.t && !idxServico.has(b.i))
  const [titulo, subtitulo, ...apoio] = corpo.map((b) => b.t)
  const { texto, destaque, todas } = coresDaPeca(brand, estilo)
  const separador = estilo?.separadores?.[0] ? NOME_DO_SEPARADOR[estilo.separadores[0]] : 'filete fino'
  const ehStory = formato === 'story'
  const proporcao = formato === 'story' ? '9:16' : formato === 'feed' ? '4:5' : '1:1'
  const nomeFormato = formato === 'story' ? 'Story' : formato === 'feed' ? 'feed' : 'post quadrado'
  const orientacao = formato === 'quadrado' ? '' : 'vertical '
  const evitar = (estilo?.evitar ?? []).slice(0, 2).map((e) => e.trim().replace(/[.;]+$/, ''))

  const secoes: string[] = []
  const numeradas: string[] = []

  secoes.push(
    `Crie uma arte ${orientacao}para ${nomeFormato} do Instagram, proporção ${proporcao}, seguindo rigorosamente o manual de identidade visual de ${marca} enviado como referência.

Você recebe:
- a fotografia principal (Image ${indiceDaFoto});
- o manual da marca (Image ${indiceDoManual});
- a copy da peça, no fim deste texto.

Use o manual como fonte oficial de cores, tipografia, logotipo e filetes. A fotografia é o fundo da arte e ocupa toda a composição.`,
  )

  const resumo = semTratamentoDaFoto(estilo?.resumo ?? '')
  if (resumo) {
    secoes.push(`DIREÇÃO ESTÉTICA\n${resumo}${evitar.length ? ` Evite: ${evitar.join('; ')}.` : ''}`)
  }

  numeradas.push(
    `FUNDO
Use a fotografia em tela cheia, adaptada ao ${proporcao} apenas por enquadramento. ${ajuste ? `A ÚNICA alteração permitida na fotografia é esta, pedida pelo cliente: ${ajuste}. Fora isso, não` : 'Não'} altere rostos, pessoas, pratos, taças, garrafas ou objetos; não acrescente nem remova nada. Os textos pousam nas áreas mais calmas da fotografia — nunca sobre rosto, comida, taça, garrafa ou o assunto principal. Se precisar de legibilidade, um degradê escuro muito sutil no topo ou no rodapé, sem fim visível; nunca tarja, caixa ou fundo sólido atrás do texto.`,
  )

  numeradas.push(
    logo.modo === 'compor'
      ? `LOGOTIPO
Não desenhe o logotipo: o arquivo oficial é colado pelo sistema depois da geração, ${NOME_DO_CANTO[logo.canto]}. Deixe esse canto livre — nada de texto, filete, selo ou assunto da foto numa área de cerca de 30% da largura por 18% da altura ali; toda linha de texto termina antes dela. Nenhuma marca, símbolo, monograma ou assinatura na arte, nem a que aparece no manual: ela está lá só para você reconhecer a marca.`
      : `LOGOTIPO
Reproduza o logotipo oficial do manual, exatamente como está lá, ${posicaoDaLogo(estilo)}, em tamanho discreto (14% a 18% da largura), com respiro das bordas e do título. Uma logo só.`,
  )

  const alin = alinhamento(estilo)
  numeradas.push(
    `BLOCO PRINCIPAL
Ordem: título → subtítulo${separador ? ' → filete' : ''}, ${alin}. Prefira a região superior da arte (entre 15% e 35% da altura)${logo.modo === 'modelo' ? ', logo abaixo da logo' : ''}. Se ali estiverem um rosto ou o assunto da foto, leve o bloco inteiro para o terço inferior e a linha de serviço para cima dele. O bloco ocupa no máximo um quarto da altura; a foto é a protagonista.`,
  )

  if (titulo) {
    const duasVozes = brand.fonts.subtitle
      ? ` Se o título tiver duas linhas, a segunda vai na tipografia de subtítulo do manual — é assim que a marca faz as duas vozes.`
      : ''
    numeradas.push(
      `TÍTULO
Texto exato: ${aspas(titulo)}
Tipografia de manchete do manual, ${caixa(brand.projectId, estilo)}. É o principal elemento tipográfico da peça; uma linha quando couber. Cor ${texto.nome} (${texto.hex}), com UMA palavra-chave em ${destaque.nome} (${destaque.hex}).${duasVozes} ${acabamento(estilo)}`,
    )
  }

  if (subtitulo) {
    numeradas.push(
      `SUBTÍTULO
Texto exato: ${aspas(subtitulo)}
Imediatamente abaixo do título, na tipografia de apoio do manual, peso regular, cor ${texto.nome}. Uma ou duas linhas; largura menor que a do título.${apoio.length ? `\nLinha de apoio, abaixo, menor: ${apoio.map(aspas).join(' / ')}` : ''}`,
    )
  } else if (apoio.length) {
    numeradas.push(`APOIO\nTexto exato: ${apoio.map(aspas).join(' / ')} — abaixo do título, na tipografia de apoio do manual, cor ${texto.nome}.`)
  }

  numeradas.push(`FILETE
Feche o bloco com um ${separador} do manual, em ${destaque.nome} (${destaque.hex}), discreto, ${alin}.`)
  numeradas.push(`ÁREA CENTRAL
Livre de texto. Valorize a fotografia. Nenhum ícone, selo, preço ou elemento gráfico além dos pedidos aqui.`)

  if (servico.length) {
    const faixa = ehStory ? 'entre 89% e 94% da altura, dentro da área segura do Story' : 'na margem inferior da peça'
    numeradas.push(
      `RODAPÉ
Texto exato: ${servico.map((s) => aspas(s.texto)).join(' / ')}
${alin[0].toUpperCase() + alin.slice(1)}, ${faixa}, na tipografia de serviço do manual, peso regular ou médio, cor ${texto.nome}, corpo miúdo. Um filete curto em ${destaque.nome} de cada lado, alinhado ao texto. Se o bloco principal desceu para o terço inferior, esta linha fica logo acima dele.`,
    )
  }

  numeradas.push(
    `PALETA
Somente as cores do manual: ${todas.map((c) => `${c.nome} ${c.hex}`).join(' · ')}. Nesta peça, ${texto.nome} para os textos e ${destaque.nome} para a palavra-chave e os filetes; as demais só se precisar de integração.`,
  )
  numeradas.push(
    `HIERARQUIA
${[titulo, subtitulo, 'a fotografia', servico.length ? 'a linha de serviço' : null, logo.modo === 'modelo' ? 'o logotipo como assinatura' : null].filter(Boolean).map((x, i) => `${i + 1}. ${x}`).join('\n')}
Muito espaço negativo. Não preencha a imagem.`,
  )
  numeradas.push(
    `NÃO FAÇA
Texto além do fornecido — nem preço, CTA, endereço ou telefone que não estejam na copy. Segunda logo. Moldura, caixa ou tarja atrás do texto. Ícone ou ornamento que não esteja no manual. ${ajuste ? 'Alterar a fotografia além do que foi pedido.' : 'Alterar a fotografia.'} Estética de panfleto ou promoção popular.`,
  )
  secoes.push(...numeradas.map((t, i) => `${i + 1}. ${t}`))

  if (nota) secoes.push(`OBSERVAÇÃO DE QUEM PEDIU A PEÇA — atenda sem sair do manual:\n${nota}`)

  secoes.push(`TEXTOS EXATOS — NÃO MODIFICAR:\n${copy.map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n')}`)

  return secoes.join('\n\n')
}
