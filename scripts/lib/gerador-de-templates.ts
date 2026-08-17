/**
 * Gerador de páginas-modelo a partir de um KIT DE MARCA (16/08/2026).
 *
 * O padrão não foi inventado: é o dos "Story base (3 layouts)" que o TERO e o
 * Wine Vix já usavam e que a equipe aprovou — foto em tela cheia, véu de
 * leitura na cor escura da marca, hierarquia tipográfica fixa e um bloco de
 * serviço no rodapé. Aqui ele virou função para poder ser aplicado a qualquer
 * marca e a qualquer tema, sempre igual.
 *
 * Três layouts, os mesmos três que o DNA do Wine Vix descreve ("rodapé, topo e
 * dividido"):
 *
 *   dividido — manchete no topo, serviço no rodapé. Foto respira no meio.
 *   topo     — manchete e descrição no terço superior; serviço no rodapé.
 *   rodape   — tudo no terço inferior, logo no topo. Foto domina.
 *
 * NADA aqui é decidido por heurística visual: cor, fonte, peso e ícone vêm do
 * `KitDeMarca`, que é montado a partir do que está cadastrado no projeto
 * (CustomFont, BrandColor, Element, Logo) e do que o DNA declara sobre o papel
 * de cada um. Marca sem ícone simplesmente não ganha a camada do ícone.
 */

/** 1080x1920. O story é o formato de 100% dos modelos existentes. */
export const CANVAS = { width: 1080, height: 1920 }

export interface KitDeMarca {
  projectId: number
  cliente: string
  /** Fundo da página e base do véu de leitura. */
  corFundo: string
  /** Texto claro — o "branco da marca". */
  corTexto: string
  /** Acento: uma palavra da manchete, filete, CTA. */
  corAcento: string
  /** Display da manchete. */
  fonteTitulo: string
  pesoTitulo: number
  /** Sans de apoio (descrição, serviço). */
  fonteApoio: string
  /** Caixa da manchete — o DNA de cada marca manda aqui. */
  caixaTitulo: 'uppercase' | 'none'
  /**
   * Caixa do bloco de serviço e do CTA, SEPARADA da manchete.
   *
   * 🔴 Antes o serviço tinha `uppercase` cravado e o CTA herdava a caixa do
   * título. Na primeira marca com manchete em caixa alta (By Rock) isso pôs 4
   * dos 5 campos em caixa alta — reprovando o item 9 do crivo da própria marca
   * ("A caixa alta está em todos os campos, em vez de só na manchete?") e a
   * construção proibida do tom de voz. Não passou antes porque o Wine Vix, o
   * único precedente, usa manchete em Title Case.
   */
  caixaServico?: 'uppercase' | 'none'
  caixaCta?: 'uppercase' | 'none'
  /**
   * A logo fica sempre no topo? Algumas marcas fixam o canto — a Real
   * Gelateria registra "NÃO VARIA DE CANTO", sempre superior direito.
   */
  logoSempreNoTopo?: boolean
  /**
   * Quanto da base é safezone (nada crítico ali). O DNA da Real Gelateria pede
   * 350px; o padrão de 220 é o que os modelos aprovados praticam.
   */
  safezoneBase?: number
  /** Itálico obrigatório? (Wine Vix: "sempre itálico"). */
  tituloItalico?: boolean
  logoUrl: string | null
  /** Proporção da logo, para não deformar. */
  logoRatio?: number
  iconeRelogio?: string | null
  iconeLocal?: string | null
  filete?: string | null
  /** Foto de fundo placeholder — trocada no preenchimento. */
  fotoPlaceholder: string
}

export interface CopyDoTema {
  /** Chapéu curto, opcional (ex.: "ALMOÇO EXECUTIVO"). */
  preTitulo?: string
  /** Manchete. Quebre em duas linhas com `\n`. */
  titulo: string
  /**
   * A CONTINUAÇÃO da manchete, na cor de acento — nunca uma palavra que já
   * esteja em `titulo`.
   *
   * 🔴 O acento é uma LINHA A MAIS, não pintura de palavra dentro do texto.
   * Repetir um pedaço do título faz a palavra sair duas vezes na arte: medido
   * no By Rock, "O JOGO PASSA AQUI / COM CHOPP NA MÃO / JOGO" — a terceira
   * linha órfã, em vermelho. O precedente correto é o Wine Vix: título "O
   * rótulo certo / para cada" + acento "prato" formam UMA frase.
   */
  tituloAcento?: string
  descricao: string
  /** Linha de serviço (horário, dias). Só entra com lastro na base. */
  servico?: string
  /**
   * Qual ícone acompanha o serviço. 🔴 O gerador colava RELÓGIO sempre que
   * havia `servico` — e saía relógio ao lado de endereço e de "retirada no
   * balcão". O ícone é do conteúdo, não do kit.
   */
  icone?: 'relogio' | 'local' | null
  cta: string
}

export type Layout = 'dividido' | 'topo' | 'rodape'

type Camada = Record<string, unknown>

function texto(
  id: string,
  nome: string,
  order: number,
  content: string,
  x: number,
  y: number,
  w: number,
  h: number,
  style: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): Camada {
  return {
    id,
    name: nome,
    type: 'text',
    order,
    isDynamic: true,
    visible: true,
    content,
    position: { x, y },
    size: { width: w, height: h },
    style: { textAlign: 'left', lineHeight: 1.1, ...style },
    rotation: 0,
    textboxConfig: { autoWrap: { breakMode: 'word', autoExpand: true, lineHeight: (style.lineHeight as number) ?? 1.1 } },
    ...extra,
  }
}

function imagem(id: string, nome: string, order: number, url: string, x: number, y: number, w: number, h: number, fit = 'contain'): Camada {
  return {
    id, name: nome, type: 'image', order, visible: true, fileUrl: url,
    position: { x, y }, size: { width: w, height: h },
    style: { objectFit: fit }, rotation: 0,
  }
}

/** Véu de leitura: o degradê que garante contraste do texto sobre a foto. */
function veu(id: string, order: number, cor: string, angulo: number, opacidade: number, ate: number): Camada {
  return {
    id, name: `Veu ${id}`, type: 'gradient', order, visible: true,
    position: { x: 0, y: 0 }, size: CANVAS,
    style: {
      gradientType: 'linear',
      gradientAngle: angulo,
      gradientStops: [
        { id: '1', color: cor, opacity: opacidade, position: 0 },
        { id: '2', color: cor, opacity: 0, position: ate },
      ],
    },
  }
}

/** Mede a altura REAL de uma camada de texto, com a fonte já registrada. */
export type MedirAltura = (camada: Camada) => number

/**
 * Monta as camadas de UMA página.
 *
 * A ordem das camadas é a ordem de desenho: foto, véus, texto, elementos,
 * logo. O `order` é explícito porque o render server-side ordena por ele.
 *
 * 🔴 `medir` não é opcional por acaso. A primeira versão estimava a altura do
 * título por `fontSize × linhas do \n` e o resultado colidia: o texto quebra
 * mais do que os `\n` que o autor escreveu, e no layout `rodape` a descrição
 * entrava por cima do bloco de serviço. Altura de texto se MEDE com a fonte
 * carregada — é o mesmo princípio do `text-autofix`, que checa colisão pelos
 * glifos e não pelas caixas gravadas.
 */
export function montarCamadas(kit: KitDeMarca, copy: CopyDoTema, layout: Layout, medir: MedirAltura): Camada[] {
  /**
   * Guarda contra o defeito da palavra duplicada: se o acento já aparece no
   * título, a arte sai com a palavra duas vezes. Falha alto em vez de gerar
   * peça torta — copy é revisada uma vez, arte torta é publicada muitas.
   */
  if (copy.tituloAcento) {
    const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim()
    if (norm(copy.titulo).includes(norm(copy.tituloAcento))) {
      throw new Error(
        `tituloAcento "${copy.tituloAcento}" já aparece em titulo "${copy.titulo.replace(/\n/g, ' / ')}" — ` +
        'o acento é a CONTINUAÇÃO da manchete, não uma palavra dela; do contrário sai duplicada na arte.',
      )
    }
  }

  const M = 84 // margem lateral, igual à dos modelos aprovados
  const L = CANVAS.width - M * 2
  const camadas: Camada[] = []
  let ordem = 0

  camadas.push({
    id: 'bg-foto', name: 'Foto de fundo', type: 'image', order: ordem++,
    visible: true, locked: false, isDynamic: true,
    position: { x: 0, y: 0 }, size: CANVAS,
    style: { objectFit: 'cover', border: { width: 0, color: '#000000', radius: 0 }, blur: 0, brightness: 0, contrast: 0 },
    fileUrl: kit.fotoPlaceholder,
  })

  // Véus: onde o texto vai, a foto precisa escurecer.
  if (layout === 'rodape') {
    camadas.push(veu('rodape', ordem++, kit.corFundo, 0, 0.92, 0.52))
  } else if (layout === 'topo') {
    camadas.push(veu('topo', ordem++, kit.corFundo, 180, 0.92, 0.42))
    camadas.push(veu('rodape', ordem++, kit.corFundo, 0, 0.8, 0.24))
  } else {
    camadas.push(veu('topo', ordem++, kit.corFundo, 180, 0.9, 0.36))
    camadas.push(veu('rodape', ordem++, kit.corFundo, 0, 0.9, 0.3))
  }

  const estiloTitulo = {
    color: kit.corTexto,
    fontSize: layout === 'topo' ? 82 : 74,
    fontFamily: kit.fonteTitulo,
    fontWeight: kit.pesoTitulo,
    textAlign: 'left',
    lineHeight: 1.05,
    letterSpacing: kit.caixaTitulo === 'uppercase' ? 2 : -0.5,
    textTransform: kit.caixaTitulo,
    ...(kit.tituloItalico ? { fontStyle: 'italic' } : {}),
  }
  const estiloApoio = { color: kit.corTexto, fontSize: 40, fontFamily: kit.fonteApoio, fontWeight: 400, lineHeight: 1.15 }
  const estiloServico = {
    color: kit.corTexto, fontSize: 30, fontFamily: kit.fonteApoio, fontWeight: 600,
    letterSpacing: 1.4, textTransform: kit.caixaServico ?? 'uppercase', lineHeight: 1.2,
  }
  const estiloCta = {
    color: kit.corAcento, fontSize: 30, fontFamily: kit.fonteApoio, fontWeight: 400,
    // NUNCA herda a caixa da manchete — ver `caixaCta` em KitDeMarca.
    letterSpacing: 2.6, textTransform: kit.caixaCta ?? 'none',
    lineHeight: 1.2,
    ...(kit.tituloItalico ? { fontStyle: 'italic' } : {}),
  }

  /**
   * O bloco principal é montado em coordenadas relativas e só depois
   * deslocado: no layout `rodape` ele precisa TERMINAR acima do bloco de
   * serviço, e a altura só se conhece depois de medir tudo.
   */
  const bloco: Camada[] = []
  let y = 0
  const GAP = 14

  const empilhar = (c: Camada, larguraTexto = L) => {
    const alto = Math.max(medir(c), (c.size as { height: number }).height)
    ;(c.size as { width: number; height: number }).width = larguraTexto
    ;(c.size as { width: number; height: number }).height = alto
    ;(c.position as { y: number }).y = y
    bloco.push(c)
    y += alto + GAP
  }

  if (copy.preTitulo) {
    empilhar(texto('pre-titulo', 'Pre-titulo', 0, copy.preTitulo, M, 0, L, 40, {
      color: kit.corAcento, fontSize: 28, fontFamily: kit.fonteApoio, fontWeight: 600,
      letterSpacing: 3.2, textTransform: 'uppercase', lineHeight: 1.2,
    }))
  }

  empilhar(texto('titulo-n1', 'Titulo', 0, copy.titulo, M, 0, L, 100, estiloTitulo))

  if (copy.tituloAcento) {
    empilhar(texto('titulo-acento', 'Titulo - palavra em destaque', 0, copy.tituloAcento, M, 0, L, 100, {
      ...estiloTitulo, color: kit.corAcento,
    }))
  }

  if (kit.filete) {
    const f = imagem('filete', 'Filete da marca', 0, kit.filete, M, y, 330, 26)
    bloco.push(f)
    y += 26 + GAP
  }

  // A coluna de texto é estreita de propósito: o DNA do Wine Vix pede 535–705px,
  // e uma descrição na largura cheia briga com a foto.
  empilhar(texto('descricao', 'Descricao', 0, copy.descricao, M, 0, Math.min(L, 705), 120, estiloApoio), Math.min(L, 705))

  const alturaBloco = y - GAP
  /**
   * O rodapé começa acima da safezone da base. Estava cravado em 1660, com o
   * CTA em 1722 e a logo até 1867 — tudo dentro dos 350px que o DNA da Real
   * Gelateria reserva ("nada de informação crítica"). O padrão de 220 é o que
   * os modelos aprovados praticam; marca com regra própria declara a sua.
   */
  const yServico = CANVAS.height - (kit.safezoneBase ?? 220) - 40
  // `rodape` ancora de BAIXO para cima, terminando 80px acima do serviço; os
  // outros ancoram no topo. Sem isso, título de 3 linhas invadia o rodapé.
  const yInicio = layout === 'rodape'
    ? Math.max(200, yServico - 80 - alturaBloco)
    : layout === 'topo' ? 150 : 170

  for (const c of bloco) {
    ;(c.position as { y: number }).y += yInicio
    ;(c as { order: number }).order = ordem++
  }
  camadas.push(...bloco)

  /**
   * 🔴 O rodapé também é MEDIDO. Ele usava altura fixa (44 no serviço, 48 no
   * CTA) e nunca passava pelo medidor: um serviço de 83 caracteres quebra em
   * duas linhas, ocupa 84px reais e invade o CTA em 22px — nos três layouts.
   * Não apareceu antes porque o único precedente (Wine Vix, 32 caracteres)
   * cabe numa linha. Agora o CTA é empurrado pela altura real do serviço.
   */
  const icone = copy.icone === undefined ? 'relogio' : copy.icone
  const urlIcone = icone === 'local' ? kit.iconeLocal : icone === 'relogio' ? kit.iconeRelogio : null
  let yRodape = yServico

  if (copy.servico) {
    const recuo = urlIcone ? 50 : 0
    const cServico = texto('info-1', 'Info - servico', 0, copy.servico, M + recuo, yRodape, L - recuo, 44, estiloServico)
    const altoServico = Math.max(medir(cServico), 44)
    ;(cServico.size as { height: number }).height = altoServico
    if (urlIcone) {
      camadas.push(imagem('icone-servico', `Icone - ${icone}`, ordem++, urlIcone, M, yRodape + 4, 34, 34))
    }
    ;(cServico as { order: number }).order = ordem++
    camadas.push(cServico)
    yRodape += altoServico + 14
  }

  const cCta = texto('cta', 'CTA', ordem++, copy.cta, M, yRodape, 640, 48, estiloCta)
  ;(cCta.size as { height: number }).height = Math.max(medir(cCta), 48)
  camadas.push(cCta)

  if (kit.logoUrl) {
    const larguraLogo = 168
    const alturaLogo = Math.round(larguraLogo * (kit.logoRatio ?? 0.45))
    // Marca que fixa o canto manda; senão, a logo foge do bloco de texto.
    const posLogo = kit.logoSempreNoTopo || layout === 'rodape'
      ? { x: CANVAS.width - M - larguraLogo, y: 120 }
      : { x: CANVAS.width - M - larguraLogo, y: 1700 }
    camadas.push({
      id: 'logo', name: 'Logo', type: 'logo', order: ordem++, visible: true, locked: false,
      position: posLogo, size: { width: larguraLogo, height: alturaLogo },
      style: { objectFit: 'contain', border: { width: 0, color: '#000000', radius: 0 }, blur: 0, brightness: 0, contrast: 0 },
      fileUrl: kit.logoUrl, rotation: 0,
    })
  }

  return camadas
}

export const LAYOUTS: Layout[] = ['dividido', 'topo', 'rodape']

export const NOME_DO_LAYOUT: Record<Layout, string> = {
  dividido: '1 · Dividido — manchete no topo, serviço no rodapé',
  topo: '2 · Topo — manchete e apoio no terço superior',
  rodape: '3 · Rodapé — bloco no terço inferior, foto domina',
}
