/**
 * Gerador de páginas-modelo a partir de um KIT DE MARCA (16/08/2026).
 *
 * O padrão não foi inventado: é o dos "Story base (3 layouts)" que o TERO e o
 * Wine Vix já usavam e que a equipe aprovou — foto em tela cheia, leitura
 * garantida na cor escura da marca, hierarquia tipográfica fixa e um bloco de
 * serviço no rodapé. Aqui ele virou função para poder ser aplicado a qualquer
 * marca e a qualquer tema, sempre igual.
 *
 * A leitura sobre a foto é por HALO desde 01/09/2026, não mais por véu: uma
 * caixa escura DESFOCADA atrás de cada bloco de texto (`halo()`), em vez do
 * degradê que escurecia a faixa inteira do topo ou do rodapé. Medido no
 * canvas (`design-canvas/_halo.py`): o véu perdia 30% da cor da foto; o halo
 * entrega a foto a 5% do original. A opacidade gravada aqui (0,55) é só o
 * PONTO DE PARTIDA — a calibração real pela luz da foto acontece em
 * `createArteRapida` (`src/lib/creatives/halo/aplicar-halo.ts`), que troca a
 * tinta e o raio pelo que a foto escolhida pede.
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
  /** Sans de apoio (descrição). */
  fonteApoio: string
  /**
   * Peso forte do apoio — pré-título e serviço.
   *
   * 🔴 Peso NÃO se pede com `fontWeight`: faux-bold só existe no navegador, e
   * a arte agendada renderiza com o peso REAL do arquivo. Pedir 600 a um
   * arquivo Regular sai Regular. Quando a família tem um arquivo próprio para
   * o peso (Barlow Condensed SemiBold), é ele que precisa ser nomeado.
   */
  fonteApoioForte?: string
  /**
   * Fonte da SEGUNDA linha da manchete (o acento), quando a marca alterna
   * duas vozes na headline. No Quintal a composition manda a linha inteira em
   * Amithen, maior, "encostando quase na linha de cima".
   */
  fonteTituloAcento?: string
  /** Escala da linha de acento em relação à manchete. */
  escalaTituloAcento?: number
  /**
   * Manuscrita de assinatura, quando a marca tem uma. O Espeto declara um kit
   * de TRÊS fontes obrigatório em story, e o CTA é o "fechamento humano em
   * manuscrito" — sem este campo ele cairia no sans de apoio.
   */
  fonteAcento?: string
  pesoAcento?: number
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
   * Segunda cor de acento — algumas marcas dão papéis diferentes a cores
   * diferentes. No Seu Quinto o amarelo (#FAA61A) é do pré-título e do CTA e
   * aparece em 87 das 224 páginas, enquanto o vermelho é da palavra-chave da
   * manchete. Reduzir a paleta a uma cor descaracteriza a marca.
   */
  corAcento2?: string
  /**
   * Sombra EXTRUDE da manchete — assinatura visual, não enfeite. O Seu Quinto
   * a define como deslocamento de 4–6px para baixo-direita SEM blur, em
   * combinações oficiais (branco sobre foto com sombra amarela, vermelho com
   * sombra amarela…). Vai em `effects.shadow`, que é onde o editor grava e o
   * render lê — `style.shadow` só existe por compatibilidade.
   */
  sombraTitulo?: { offsetX: number; offsetY: number; cor: string }
  /** Métricas por papel, quando o DNA as especifica. */
  tituloLetterSpacing?: number
  tituloLineHeight?: number
  preTituloLetterSpacing?: number
  apoioLetterSpacing?: number
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
   * Foto DESTE tema, quando uma só não serve para todos.
   *
   * 🔴 Placeholder único por marca contradiz a copy: no Empório, uma foto de
   * brunch ficava atrás de "massa fresca e molho roti" e de "parede de vinhos
   * ao fundo". Foto que nega o texto é pior que foto genérica.
   */
  foto?: string
  /** Ornamento nesta peça? Default: usa o do kit, se houver. */
  usarFilete?: boolean
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

/** Raio de partida do blur do halo — o mesmo `raioBase` de `calibrarHalo`. */
export const HALO_RAIO = 110
/** Margem em volta do texto: ~1,4 × raio, para o texto ficar no PLATÔ da gaussiana. */
export const HALO_MARGEM = 150
/** Tinta de partida; a calibração pela foto substitui. */
export const HALO_OPACIDADE = 0.55

type Rect = { x: number; y: number; width: number; height: number }

function retanguloDe(c: Camada): Rect {
  const p = c.position as { x: number; y: number }
  const s = c.size as { width: number; height: number }
  return { x: p.x, y: p.y, width: s.width, height: s.height }
}

function uniao(rects: Rect[]): Rect {
  const x0 = Math.min(...rects.map((r) => r.x))
  const y0 = Math.min(...rects.map((r) => r.y))
  const x1 = Math.max(...rects.map((r) => r.x + r.width))
  const y1 = Math.max(...rects.map((r) => r.y + r.height))
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

/**
 * Halo de leitura: caixa retangular na cor escura da marca, DESFOCADA, atrás
 * de um bloco de texto. A caixa é a união das caixas de texto do bloco
 * crescida de `HALO_MARGEM` em cada lado.
 *
 * Forma da camada: `type: 'shape'` retangular, como o `renderShape` do
 * render-engine e o `ShapeNode` do editor leem — `style.fill` é a cor,
 * `style.fillOpacity` a tinta (canal separado, não `opacity` da camada),
 * `border.radius` o canto. O desfoque vai em `effects.blur`, a mesma forma
 * que a camada de texto já usa (`{ enabled, blurRadius }`).
 *
 * O id começa com `halo-` de propósito: é o prefixo que `aplicar-halo.ts`
 * reconhece ao recalibrar pela foto (e `veu` é o prefixo que ele REMOVE).
 */
function halo(id: 'halo-topo' | 'halo-rodape', order: number, cor: string, blocos: Camada[]): Camada {
  const r = uniao(blocos.map(retanguloDe))
  return {
    id, name: 'Halo', type: 'shape', order, visible: true, locked: false,
    position: { x: Math.round(r.x - HALO_MARGEM), y: Math.round(r.y - HALO_MARGEM) },
    size: { width: Math.round(r.width + 2 * HALO_MARGEM), height: Math.round(r.height + 2 * HALO_MARGEM) },
    rotation: 0,
    style: {
      shapeType: 'rectangle',
      fill: cor,
      fillOpacity: HALO_OPACIDADE,
      strokeWidth: 0,
      border: { width: 0, color: '#000000', radius: 0 },
    },
    effects: { blur: { enabled: true, blurRadius: HALO_RAIO } },
  }
}

/**
 * LEGADO — o véu de leitura que o gerador usava até 01/09/2026. Não é mais
 * chamado por `montarCamadas`; fica exportado como referência do que os
 * modelos antigos (lote-tema-2026-08) carregam, e para quem precisar
 * reconhecer a forma ao migrar. `aplicar-halo.ts` remove camadas cujo id
 * começa com `veu`.
 */
export function veu(id: string, order: number, cor: string, angulo: number, opacidade: number, ate: number): Camada {
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
 * A ordem das camadas é a ordem de desenho: foto, halos, texto, elementos,
 * logo. O `order` é explícito porque o render server-side ordena por ele —
 * e é reatribuído no FIM, porque o halo só pode ser criado depois de medir
 * onde o texto ficou.
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
    fileUrl: copy.foto ?? kit.fotoPlaceholder,
  })

  /**
   * Halos: onde o texto vai, a foto precisa escurecer — e SÓ ali.
   *
   * Os halos são criados no FIM (`halo()`), depois de medir cada bloco,
   * porque a caixa deles é a união das caixas de texto reais. Era a lição
   * do véu do rodapé (alcance fixo acabava antes do bloco e o pré-título
   * ficava ilegível sobre foto clara — Bacana), agora valendo para todos:
   * o halo tem de alcançar o conteúdo medido, não uma altura suposta.
   */

  const estiloTitulo = {
    color: kit.corTexto,
    fontSize: layout === 'topo' ? 82 : 74,
    fontFamily: kit.fonteTitulo,
    fontWeight: kit.pesoTitulo,
    textAlign: 'left',
    lineHeight: kit.tituloLineHeight ?? 1.05,
    letterSpacing: kit.tituloLetterSpacing ?? (kit.caixaTitulo === 'uppercase' ? 2 : -0.5),
    textTransform: kit.caixaTitulo,
    ...(kit.tituloItalico ? { fontStyle: 'italic' } : {}),
  }
  const estiloApoio = {
    color: kit.corTexto, fontSize: 40, fontFamily: kit.fonteApoio, fontWeight: 400, lineHeight: 1.15,
    ...(kit.apoioLetterSpacing ? { letterSpacing: kit.apoioLetterSpacing } : {}),
  }
  const estiloServico = {
    color: kit.corTexto, fontSize: 30, fontFamily: kit.fonteApoioForte ?? kit.fonteApoio, fontWeight: 600,
    letterSpacing: 1.4, textTransform: kit.caixaServico ?? 'uppercase', lineHeight: 1.2,
  }
  const estiloCta = {
    color: kit.corAcento2 ?? kit.corAcento,
    fontSize: kit.fonteAcento ? 42 : 30,
    fontFamily: kit.fonteAcento ?? kit.fonteApoio,
    fontWeight: kit.pesoAcento ?? 400,
    // NUNCA herda a caixa da manchete — ver `caixaCta` em KitDeMarca.
    letterSpacing: kit.fonteAcento ? 0 : 2.6, textTransform: kit.caixaCta ?? 'none',
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
      color: kit.corAcento2 ?? kit.corAcento, fontSize: 28, fontFamily: kit.fonteApoioForte ?? kit.fonteApoio, fontWeight: 600,
      letterSpacing: kit.preTituloLetterSpacing ?? 3.2, textTransform: 'uppercase', lineHeight: 1.2,
    }))
  }

  /**
   * `effects.shadow` e não `style.shadow`: é onde o editor grava e o que o
   * painel de efeitos edita — o caminho por `style` só existe por
   * compatibilidade (ver applyShadow no render-engine).
   */
  const sombra = kit.sombraTitulo
    ? {
        effects: {
          shadow: {
            enabled: true,
            shadowColor: kit.sombraTitulo.cor,
            shadowOffsetX: kit.sombraTitulo.offsetX,
            shadowOffsetY: kit.sombraTitulo.offsetY,
            // Extrude é sombra DURA: blur descaracteriza.
            shadowBlur: 0,
            shadowOpacity: 1,
          },
        },
      }
    : {}

  empilhar(texto('titulo-n1', 'Titulo', 0, copy.titulo, M, 0, L, 100, estiloTitulo, sombra))

  if (copy.tituloAcento) {
    empilhar(texto('titulo-acento', 'Titulo - segunda linha', 0, copy.tituloAcento, M, 0, L, 100, {
      ...estiloTitulo,
      color: kit.corAcento,
      ...(kit.fonteTituloAcento ? { fontFamily: kit.fonteTituloAcento } : {}),
      ...(kit.escalaTituloAcento
        ? { fontSize: Math.round((estiloTitulo.fontSize as number) * kit.escalaTituloAcento) }
        : {}),
    }, sombra))
  }

  // Ornamento pode ser condicional: o Seu Quinto "evita ornamentos, exceto
  // em peça de festa ou evento", e o filete dele nunca foi usado em 224
  // páginas — promovê-lo a fixo inventaria um traço que a marca não tem.
  if (kit.filete && copy.usarFilete !== false) {
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
  /** Camadas de TEXTO do rodapé (serviço e CTA) — o que o halo do rodapé cobre. */
  const textosDoRodape: Camada[] = []

  /**
   * 🔴 O rodapé reserva a largura da LOGO quando ela fica ali.
   *
   * O serviço usava a largura cheia e passava por baixo do logotipo: visto no
   * TERO, cuja linha de horário quebra em duas e a segunda cruzava a marca.
   * Só aparece com serviço longo o bastante para quebrar — o mesmo motivo
   * pelo qual a colisão com o CTA demorou a aparecer.
   */
  const logoNoRodape = !!kit.logoUrl && !kit.logoSempreNoTopo && layout !== 'rodape'
  const larguraRodape = logoNoRodape ? L - 210 : L

  if (copy.servico) {
    const recuo = urlIcone ? 50 : 0
    const cServico = texto('info-1', 'Info - servico', 0, copy.servico, M + recuo, yRodape, larguraRodape - recuo, 44, estiloServico)
    const altoServico = Math.max(medir(cServico), 44)
    ;(cServico.size as { height: number }).height = altoServico
    if (urlIcone) {
      camadas.push(imagem('icone-servico', `Icone - ${icone}`, ordem++, urlIcone, M, yRodape + 4, 34, 34))
    }
    ;(cServico as { order: number }).order = ordem++
    camadas.push(cServico)
    textosDoRodape.push(cServico)
    yRodape += altoServico + 14
  }

  const cCta = texto('cta', 'CTA', ordem++, copy.cta, M, yRodape, 640, 48, estiloCta)
  ;(cCta.size as { height: number }).height = Math.max(medir(cCta), 48)
  camadas.push(cCta)
  textosDoRodape.push(cCta)

  /**
   * Os halos entram AGORA, com as caixas de texto já medidas e posicionadas.
   *
   * `topo` e `dividido`: um halo no bloco principal (`halo-topo`) e outro no
   * serviço + CTA (`halo-rodape`). `rodape`: o bloco termina 80px acima do
   * serviço — menos que a folga de 120px com que `agruparEmBlocos` parte a
   * peça —, então é UM halo só (`halo-rodape`) sobre tudo. Só as camadas de
   * texto votam na caixa: filete e ícone são finos e não entram (a regra do
   * `_halo.py`: ornamento < 8px não vota).
   */
  const textosDoBloco = bloco.filter((c) => c.type === 'text')
  const halos: Camada[] = layout === 'rodape'
    ? [halo('halo-rodape', 0, kit.corFundo, [...textosDoBloco, ...textosDoRodape])]
    : [
        halo('halo-topo', 0, kit.corFundo, textosDoBloco),
        halo('halo-rodape', 0, kit.corFundo, textosDoRodape),
      ]
  // Logo depois da foto, antes de qualquer texto.
  camadas.splice(1, 0, ...halos)

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

  // O `order` final é a posição no array: os halos entraram por `splice`
  // depois de todo mundo já ter número, e o render ordena por este campo.
  camadas.forEach((c, i) => {
    ;(c as { order: number }).order = i
  })

  return camadas
}

export const LAYOUTS: Layout[] = ['dividido', 'topo', 'rodape']

export const NOME_DO_LAYOUT: Record<Layout, string> = {
  dividido: '1 · Dividido — manchete no topo, serviço no rodapé',
  topo: '2 · Topo — manchete e apoio no terço superior',
  rodape: '3 · Rodapé — bloco no terço inferior, foto domina',
}
