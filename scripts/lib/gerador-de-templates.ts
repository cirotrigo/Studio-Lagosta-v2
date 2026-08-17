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
  /** Palavra-chave em destaque, quando a marca pede uma palavra no acento. */
  tituloAcento?: string
  descricao: string
  /** Linha de serviço (horário, dias). Só entra com lastro na base. */
  servico?: string
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
    letterSpacing: 1.4, textTransform: 'uppercase' as const, lineHeight: 1.2,
  }
  const estiloCta = {
    color: kit.corAcento, fontSize: 30, fontFamily: kit.fonteApoio, fontWeight: 400,
    letterSpacing: 2.6, textTransform: kit.caixaTitulo === 'uppercase' ? ('uppercase' as const) : ('none' as const),
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
  const yServico = 1660
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

  if (copy.servico) {
    if (kit.iconeRelogio) {
      camadas.push(imagem('icone-relogio', 'Icone - relogio', ordem++, kit.iconeRelogio, M, yServico + 4, 34, 34))
    }
    camadas.push(texto('info-1', 'Info - servico', ordem++, copy.servico, kit.iconeRelogio ? M + 50 : M, yServico, L - (kit.iconeRelogio ? 50 : 0), 44, estiloServico))
  }
  camadas.push(texto('cta', 'CTA', ordem++, copy.cta, M, yServico + 62, 640, 48, estiloCta))

  if (kit.logoUrl) {
    const larguraLogo = 168
    const alturaLogo = Math.round(larguraLogo * (kit.logoRatio ?? 0.45))
    // No layout `rodape` a logo sobe para o topo: o rodapé já está ocupado.
    const posLogo = layout === 'rodape'
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
