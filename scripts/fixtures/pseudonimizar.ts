/**
 * Pseudonimização das fixtures do piloto sintético — pura, para o teste exercitar.
 *
 * É uma PROJEÇÃO POR ESQUEMA, não uma caça a strings ruins: só sobrevive o que o esquema conhece e trata; toda string sob chave
 * que o esquema não prevê é DESCARTADA e listada (`descartados`), para quem gera a fixture decidir, de olhos abertos, se a chave
 * entra no esquema. O que sobrevive: números, booleanos e cores (não identificam ninguém); enums sob chaves de enum; nomes de
 * fonte; `content`/`text` viram COPY SINTÉTICA pelo papel; `name`/`id` viram o papel ou `camada-N`; `groupId` vira `grupo-N`;
 * `fileUrl` vira token `fixture:*` E exige os bytes (URL sem arquivo baixado é erro, não token solto); `tags` só palavras
 * minúsculas sem o nome do cliente. No fim, `conferirPseudonimo` passa a segunda rede (URL, nome, identificador, texto sob
 * chave não prevista, PNG com metadado) e a função RECUSA a saída se sobrou qualquer coisa.
 */
export interface ExportDoCliente {
  projeto: { id: number; name: string; assinatura: unknown }
  paginas: Array<Record<string, unknown>>
  logos: Array<{ id: number; fileUrl: string; isProjectLogo: boolean; arquivo?: string }>
}
export interface FixtureDoCliente {
  clienteId: string
  numerosDoProjeto: unknown
  paginas: Array<Record<string, unknown>>
  logos: Array<{ fileUrl: string; isProjectLogo: boolean }>
  /** token → PNG em base64, sem metadado. */
  arquivos: Record<string, string>
  candidatasDoVeu: string[]
}

const CAMPOS_DA_PAGINA = ['tags', 'width', 'height', 'background', 'layers', 'order'] as const
const PAPEIS = new Set(['pre', 'headline', 'apoio', 'servico', 'logo', 'foto', 'fundo', 'veu', 'imagem', 'texto'])
const COR = /^(#[0-9a-f]{3,8}|rgba?\([\d.,\s%]+\)|hsla?\([\d.,\s%]+\)|transparent)$/i
/** Chaves cujo valor é um enum (uma palavra; dígitos permitidos para `fontWeight: '400'`). */
const CHAVES_DE_ENUM = new Set(['type', 'fontWeight', 'fontStyle', 'textAlign', 'verticalAlign', 'objectFit', 'cropPosition', 'textTransform', 'textDecoration', 'anchor', 'breakMode', 'textMode', 'fit', 'gradientType', 'shapeType', 'blendMode', 'papel', 'role', 'mode', 'unit', 'align', 'position', 'direction', 'repeat', 'lineCap', 'lineJoin', 'lineStyle', 'lineEndCap', 'lineStartCap', 'pathFillRule', 'tracoPontas', 'fieldType', 'pattern', 'movimento', 'filter', 'audioVersion'])
const ENUM = /^([a-z][a-z0-9-]{0,31}|\d{3})$/i // `\d{3}`: `fontWeight: '400'`
const CHAVES_DE_TEXTO = new Set(['content', 'text'])
/** Todas as chaves do tipo `Layer` (src/types/template.ts, INCLUSIVE as de tipos inline como `mask?: { shapeId; path }`): descartar uma delas é mudar a assinatura visual em silêncio — a geração RECUSA, salvo as de descarte previsto. */
const CHAVES_DO_TIPO = new Set(['Foto', 'Motion', 'anchor', 'audio', 'audioVersion', 'autoExpand', 'autoResize', 'autoWrap', 'autoplay', 'background', 'backgroundColor', 'baseColor', 'blacks', 'blur', 'blurRadius', 'border', 'borderRadius', 'breakMode', 'brightness', 'canvas', 'clipe', 'color', 'content', 'contrast', 'createdAt', 'crop', 'cropPosition', 'currentPageId', 'currentTime', 'curvature', 'curved', 'defaultValue', 'duracao', 'duration', 'effects', 'elementId', 'elementLabel', 'enabled', 'end', 'endTime', 'exposure', 'fadeIn', 'fadeInDuration', 'fadeOut', 'fadeOutDuration', 'fieldType', 'fileUrl', 'fill', 'fillOpacity', 'filter', 'fit', 'flipH', 'flipV', 'fontFamily', 'fontSize', 'fontStyle', 'fontWeight', 'gradientAngle', 'gradientCenterX', 'gradientCenterY', 'gradientEndX', 'gradientEndY', 'gradientRadiusScale', 'gradientStartX', 'gradientStartY', 'gradientStops', 'gradientType', 'grayscale', 'height', 'highlights', 'iconId', 'id', 'invert', 'isDynamic', 'isTemplate', 'key', 'label', 'layerId', 'layers', 'letterSpacing', 'lineEndCap', 'lineHeight', 'lineStartCap', 'lineStyle', 'locked', 'logoId', 'loop', 'mask', 'max', 'maxFontSize', 'metadata', 'min', 'minFontSize', 'movimento', 'musicId', 'musicName', 'musicThumbnailUrl', 'muted', 'name', 'objectFit', 'offset', 'offsetX', 'offsetY', 'opacity', 'order', 'overlay', 'padding', 'paddingX', 'paddingY', 'pages', 'parentId', 'path', 'pathData', 'pathFillRule', 'tracoPontas', 'pathViewBox', 'pattern', 'placeholder', 'playbackRate', 'position', 'posterUrl', 'presetId', 'presetName', 'radius', 'required', 'richTextStyles', 'rotation', 'saturation', 'sepia', 'shadow', 'shadowBlur', 'shadowColor', 'shadowOffsetX', 'shadowOffsetY', 'shadowOpacity', 'shadows', 'shapeId', 'shapeType', 'size', 'source', 'spacing', 'start', 'startTime', 'stroke', 'strokeColor', 'strokeOpacity', 'strokeWidth', 'style', 'tags', 'temCopyAutoral', 'templateId', 'templateName', 'textAlign', 'textDecoration', 'textMode', 'textTransform', 'textboxConfig', 'thumbnail', 'tone', 'transicao', 'trimEnd', 'trimStart', 'type', 'updatedAt', 'validation', 'videoMetadata', 'vignette', 'visible', 'volume', 'volumeMusic', 'volumeOriginal', 'whites', 'width', 'wordBreak', 'x', 'y'])
/** Chaves do tipo cujo descarte é POR DESENHO (identificam, apontam para fora ou são metadado): nome/arquivo/legenda/ids de linha/datas/metadata livre. */
const DESCARTE_PREVISTO = new Set(['id', 'name', 'fileUrl', 'fontFamily', 'label', 'placeholder', 'defaultValue', 'elementLabel', 'musicName', 'presetName', 'templateName', 'posterUrl', 'musicThumbnailUrl', 'thumbnail', 'createdAt', 'updatedAt', 'elementId', 'logoId', 'musicId', 'templateId', 'iconId', 'presetId', 'currentPageId', 'isTemplate', 'temCopyAutoral', 'validation', 'metadata', 'audio', 'clipe', 'videoMetadata', 'source', 'pages', 'layers'])
/** Referências entre camadas (`groupId`, `layerId`, `parentId`): renumeradas de forma consistente — a relação fica, o id original não. */
const CHAVES_DE_REFERENCIA = new Set(['groupId', 'layerId', 'parentId'])
/** `pathData` e `mask.path` são a gramática de caminho SVG (comandos + números): não carregam nome; qualquer outro caractere derruba. */
const CHAVES_DE_CAMINHO_SVG = new Set(['pathData', 'path'])
/** `mask.shapeId`: id de preset de forma (sistema), sem espaço; com fragmento do nome, cai. */
const ID_DE_PRESET = /^[A-Za-z0-9_-]{1,64}$/
const PATH_SVG = /^[MmLlHhVvCcSsQqTtAaZz0-9\s,.eE+-]+$/
/** Chaves cujo valor numérico/booleano o esquema prevê: TODO campo `number`/`boolean` do tipo `Layer` (src/types/template.ts, inclusive os aninhados como `blurRadius` e `curvature`) e dos números da assinatura (`compositor/assinatura.ts`), menos identificadores de linha (`elementId`, `logoId`…). Número sob OUTRA chave é descartado: `telefone: 5511999999999` não é geometria. */
const CHAVES_NUMERICAS = new Set(['altura', 'autoExpand', 'autoplay', 'blacks', 'blur', 'blurRadius', 'borderRadius', 'brightness', 'contrast', 'currentTime', 'curvature', 'duracao', 'duration', 'enabled', 'end', 'endTime', 'escalaDeFonte', 'exposure', 'fadeIn', 'fadeInDuration', 'fadeOut', 'fadeOutDuration', 'faixaMarca', 'faixaTexto', 'fillOpacity', 'flipH', 'flipV', 'fontSize', 'fontWeight', 'gapEntreBlocos', 'gradientAngle', 'gradientCenterX', 'gradientCenterY', 'gradientEndX', 'gradientEndY', 'gradientRadiusScale', 'gradientStartX', 'gradientStartY', 'grayscale', 'height', 'highlights', 'invert', 'isDynamic', 'isProjectLogo', 'largura', 'larguraMaxima', 'letterSpacing', 'lineHeight', 'locked', 'loop', 'luzDaFoto', 'margemH', 'max', 'maxFontSize', 'min', 'minFontSize', 'muted', 'offsetX', 'offsetY', 'opacity', 'ordem', 'order', 'overlay', 'padding', 'paddingX', 'paddingY', 'padrao', 'pesado', 'playbackRate', 'pontos', 'position', 'radius', 'raioMarca', 'raioTexto', 'razao', 'required', 'rotation', 'safeRodape', 'safeTopo', 'saturation', 'sepia', 'shadowBlur', 'shadowOffsetX', 'shadowOffsetY', 'shadowOpacity', 'shadows', 'spacing', 'start', 'startTime', 'strokeOpacity', 'strokeWidth', 'tone', 'trimEnd', 'trimStart', 'vignette', 'visible', 'volume', 'volumeMusic', 'volumeOriginal', 'whites', 'width', 'wordBreak', 'x', 'y', 'pathViewBox'])
/** Tags estruturais que a fixture pode levar; qualquer outra é descartada (uma tag pode ser o apelido do cliente). */
const TAGS_CONHECIDAS = new Set(['assinatura', 'story', 'feed', 'quadrado', 'clara', 'escura', 'modelo', 'conteudo'])
/** Forma de uma CHAVE de objeto que pode sobreviver: identificador curto; chave com espaço, acento ou longa demais é descartada com o valor. */
const CHAVE = /^[A-Za-z_$][A-Za-z0-9_-]{0,40}$/
const semAcento = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
/** Fragmentos do nome do cliente (palavras com 3+ letras, sem acento): nenhum pode aparecer em string NEM em chave. */
export function fragmentosDoNome(nome: string): string[] {
  const palavras = semAcento(nome).split(/[^a-z0-9]+/).filter(Boolean)
  // O nome INTEIRO normalizado entra sempre (um nome curto como "Zé" não tem palavra com 3 letras); as palavras com 3+ letras também.
  const inteiro = palavras.join('')
  return [...new Set([...(inteiro ? [inteiro] : []), ...palavras.filter((w) => w.length >= 3)])]
}
const temFragmento = (texto: string, fragmentos: string[]) => {
  // Com e SEM separadores: "Jo Li" tem de barrar `fontFamily: 'Jo Li'`, a chave `jo_li` e `joli`. Fragmento CURTO (até 3
  // letras, como "ze") só por palavra inteira — senão "ze" barraria `size`.
  const t = semAcento(texto)
  const colado = t.replace(/[^a-z0-9]/g, '')
  const palavras = t.split(/[^a-z0-9]+/).filter(Boolean)
  return fragmentos.some((f) => (f.length >= 4 ? t.includes(f) || colado.includes(f) : palavras.includes(f) || colado === f))
}
const CHAVES_EXTERNAS = /drive|fileid|blob|imageurl|_imageurl|thumbnail|src$|externalid|url$/i
const URL = /(https?:\/\/|data:|blob:|gs:\/\/|s3:\/\/)/i

/** O texto de exemplo da assinatura vira copy SINTÉTICA pelo papel da camada (contrato § 1.1): nada do cliente sobra no texto. */
export function copySintetica(papel: string): string {
  const k = papel.toLowerCase()
  if (/^pre|kicker|chap/.test(k)) return 'Quarta-feira'
  if (/head|titulo|título|manchete/.test(k)) return 'Almoço do dia'
  if (/apoio|sub|descri/.test(k)) return 'Prato feito'
  if (/serv|rodap|cta|horar/.test(k)) return 'Seg a sex, 11h30'
  return 'Texto de exemplo'
}

/** Os chunks de PNG que carregam metadado (texto, EXIF, tempo, densidade): a fixture não pode levar nenhum. */
const CHUNKS_DE_METADADO = new Set(['tEXt', 'iTXt', 'zTXt', 'eXIf', 'tIME', 'pHYs'])
export function chunksDeMetadadoDoPng(png: Buffer): string[] {
  const ASSINATURA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (png.length < 8 || !png.subarray(0, 8).equals(ASSINATURA)) return ['não é PNG']
  const achados: string[] = []
  let i = 8
  while (i + 8 <= png.length) {
    const tamanho = png.readUInt32BE(i)
    const tipo = png.subarray(i + 4, i + 8).toString('latin1')
    if (CHUNKS_DE_METADADO.has(tipo)) achados.push(tipo)
    i += 12 + tamanho
    if (tipo === 'IEND') break
  }
  return achados
}

/**
 * @param arquivos URL → PNG em base64 (já NORMALIZADO, sem metadado) de TODO arquivo que o exportador baixou (logos e imagens das
 * camadas). `fileUrl` sem bytes é ERRO: a fixture nunca sai incompleta.
 */
export function pseudonimizar(exp: ExportDoCliente, clienteId: string, arquivos: Record<string, string>): { fixture: FixtureDoCliente; descartados: string[] } {
  const nome = exp.projeto.name
  const fragmentos = fragmentosDoNome(nome)
  const identifica = (t: string) => temFragmento(t, fragmentos)
  const descartados: string[] = []
  /** Descartes de chave TIPADA do Layer fora do descarte previsto: a assinatura mudaria em silêncio → a geração recusa. */
  const recusas: string[] = []
  const descartar = (caminho: string, chave: string, motivo: string) => {
    descartados.push(`${caminho}: ${motivo}`)
    // Chave de identificador externo (drive, blob, imageUrl…) é descarte POR DESENHO mesmo quando o tipo a declara.
    if (CHAVES_DO_TIPO.has(chave) && !DESCARTE_PREVISTO.has(chave) && !CHAVES_EXTERNAS.test(chave)) recusas.push(`${caminho}: ${motivo}`)
  }
  const tokens = new Map<string, string>(exp.logos.map((l, k) => [l.fileUrl, `fixture:logo-${k}`] as const))
  const arquivosDaFixture: Record<string, string> = Object.fromEntries(exp.logos.map((l, k) => [`fixture:logo-${k}`, arquivos[l.fileUrl] ?? '']))
  const grupos = new Map<string, string>()
  let nArquivo = 0
  let nCamada = 0
  const token = (url: string, caminho: string): string => {
    if (!tokens.has(url)) {
      if (!arquivos[url]) throw new Error(`${caminho}: a camada aponta para um arquivo que o export não trouxe (${url.slice(0, 60)}…) — exporte-o antes de gerar a fixture`)
      const t = `fixture:arquivo-${++nArquivo}`
      tokens.set(url, t)
      arquivosDaFixture[t] = arquivos[url]
    }
    return tokens.get(url)!
  }
  const papelDa = (camada: Record<string, unknown>): string | null => {
    if (camada.type === 'logo') return 'logo'
    for (const c of [camada.name, camada.id, (camada.metadata as Record<string, unknown> | undefined)?.papel]) {
      if (typeof c === 'string' && PAPEIS.has(c.toLowerCase())) return c.toLowerCase()
    }
    return null
  }
  const projetar = (v: unknown, chave: string, caminho: string, camada?: Record<string, unknown>, ehCamada = false): unknown => {
    if (v === null || v === undefined) return v
    if (typeof v === 'number' || typeof v === 'boolean') {
      if (CHAVES_NUMERICAS.has(chave)) return v
      descartar(caminho, chave, `${typeof v} sob chave fora do esquema`)
      return undefined
    }
    if (typeof v === 'string') {
      if (COR.test(v)) return v
      // `fileUrl` só no TOPO da camada (é dela que o compositor lê a imagem); aninhado em style/metadata é descartado, não vira token.
      if (chave === 'fileUrl') return ehCamada ? token(v, caminho) : (descartar(caminho, chave, 'fileUrl fora do topo da camada'), undefined)
      if (CHAVES_DE_TEXTO.has(chave)) return camada ? copySintetica(papelDa(camada) ?? '') : (descartar(caminho, chave, 'texto fora de camada'), undefined)
      if (chave === 'fontFamily') return identifica(v) ? (descartar(caminho, chave, 'fonte com o nome do cliente'), undefined) : v
      if (CHAVES_DE_REFERENCIA.has(chave)) return grupos.get(v) ?? (grupos.set(v, `ref-${grupos.size + 1}`), grupos.get(v)!)
      if (CHAVES_DE_CAMINHO_SVG.has(chave)) return PATH_SVG.test(v) ? v : (descartar(caminho, chave, `${chave} fora da gramática SVG`), undefined)
      if (chave === 'shapeId') return ID_DE_PRESET.test(v) && !identifica(v) ? v : (descartar(caminho, chave, 'shapeId fora da forma de preset'), undefined)
      if (CHAVES_DE_ENUM.has(chave) && ENUM.test(v) && !identifica(v)) return v
      descartar(caminho, chave, 'string sob chave fora do esquema')
      return undefined
    }
    if (Array.isArray(v)) return v.map((x, i) => projetar(x, chave, `${caminho}[${i}]`, camada)).filter((x) => x !== undefined)
    if (typeof v === 'object') {
      const o = v as Record<string, unknown>
      const saida: Record<string, unknown> = {}
      for (const [k, x] of Object.entries(o)) {
        if (ehCamada && (k === 'id' || k === 'name' || k === 'fileUrl')) continue // tratados em projetarCamada
        // A CHAVE também é dado: `{ "Acme Corp": 12 }` levaria o nome; chave fora da forma ou com fragmento do nome cai com o valor.
        if (!CHAVE.test(k) || identifica(k)) {
          descartar(`${caminho}.${k}`, k, 'chave fora do esquema')
          continue
        }
        // `fileUrl` só vira token no TOPO da camada (chave direta da entrada de layers[]).
        const r = projetar(x, k, `${caminho}.${k}`, camada, false)
        if (r !== undefined) saida[k] = r
      }
      return saida
    }
    descartar(caminho, chave, 'tipo não previsto')
    return undefined
  }
  const projetarCamada = (o: Record<string, unknown>, caminho: string): Record<string, unknown> => {
    const saida = projetar(o, 'layers', caminho, o, true) as Record<string, unknown>
    if (typeof o.fileUrl === 'string') saida.fileUrl = token(o.fileUrl, `${caminho}.fileUrl`) // o único fileUrl que vira token
    const papel = papelDa(o)
    const n = ++nCamada
    saida.id = papel ?? `camada-${n}`
    saida.name = papel ?? `${String(o.type)}-${n}`
    return saida
  }
  const paginas = exp.paginas.map((p, i) => {
    const so: Record<string, unknown> = {}
    for (const c of CAMPOS_DA_PAGINA) if (c in p && c !== 'tags' && c !== 'layers') so[c] = p[c]
    // Só o `layers[]` DA PÁGINA é de camadas (um `metadata.layers` aninhado é objeto comum: nada nele ganha token).
    const layers = (typeof p.layers === 'string' ? JSON.parse(p.layers) : (p.layers ?? [])) as unknown[]
    // Tags à parte (não passam pela projeção): só palavras minúsculas sem o nome do cliente.
    const tags = Array.isArray(p.tags) ? (p.tags as unknown[]).filter((t): t is string => typeof t === 'string' && TAGS_CONHECIDAS.has(t)) : []
    for (const t of Array.isArray(p.tags) ? (p.tags as unknown[]) : []) if (!(typeof t === 'string' && TAGS_CONHECIDAS.has(t))) descartados.push(`paginas[${i}].tags: tag fora das conhecidas`)
    const saida = projetar(so, '', `paginas[${i}]`) as Record<string, unknown>
    saida.layers = layers.map((l, k) => (l && typeof l === 'object' && !Array.isArray(l) ? projetarCamada(l as Record<string, unknown>, `paginas[${i}].layers[${k}]`) : (descartados.push(`paginas[${i}].layers[${k}]: entrada que não é camada`), undefined))).filter((l) => l !== undefined)
    saida.tags = tags
    saida.name = `Assinatura — ${clienteId} — ${tags.find((t) => t === 'feed' || t === 'story' || t === 'quadrado') ?? `${so.width}x${so.height}`}`
    return saida
  })
  const fixture: FixtureDoCliente = {
    clienteId,
    numerosDoProjeto: projetar(exp.projeto.assinatura, '', 'numerosDoProjeto') ?? {},
    paginas,
    logos: exp.logos.map((l, k) => ({ fileUrl: `fixture:logo-${k}`, isProjectLogo: l.isProjectLogo })),
    arquivos: arquivosDaFixture,
    candidatasDoVeu: candidatasDoVeuDe(exp.projeto.assinatura),
  }
  if (recusas.length > 0) throw new Error(`campo visual TIPADO descartado em ${nome} — complete o esquema antes de gerar: ${recusas.join('; ')}`)
  const sobras = conferirPseudonimo(fixture, nome)
  if (sobras.length > 0) throw new Error(`pseudonimização incompleta de ${nome}: ${sobras.join('; ')}`)
  return { fixture, descartados }
}

/** A segunda rede: o que ainda identifica o cliente ou aponta para fora, em QUALQUER profundidade. */
export function conferirPseudonimo(valor: unknown, nome: string): string[] {
  const sobras: string[] = []
  const fragmentos = fragmentosDoNome(nome)
  const andar = (v: unknown, caminho: string, chave: string) => {
    if (typeof v === 'string') {
      if (/\.arquivos\./.test(caminho)) {
        const meta = v ? chunksDeMetadadoDoPng(Buffer.from(v, 'base64')) : ['vazio']
        if (meta.length) sobras.push(`${caminho}: PNG com ${meta.join('/')}`)
        return
      }
      if (URL.test(v)) sobras.push(`${caminho}: URL`)
      if (temFragmento(v, fragmentos)) sobras.push(`${caminho}: nome do cliente`)
      if (CHAVES_EXTERNAS.test(chave) && !v.startsWith('fixture:')) sobras.push(`${caminho}: identificador externo`)
      const conhecida = COR.test(v) || v.startsWith('fixture:') || CHAVES_DE_TEXTO.has(chave) || chave === 'fontFamily' || chave === 'name' || chave === 'id' || CHAVES_DE_REFERENCIA.has(chave) || chave === 'clienteId' || chave === 'tags' || (CHAVES_DE_CAMINHO_SVG.has(chave) && PATH_SVG.test(v)) || (chave === 'shapeId' && ID_DE_PRESET.test(v)) || (CHAVES_DE_ENUM.has(chave) && ENUM.test(v))
      if (!conhecida) sobras.push(`${caminho}: texto sob chave não prevista`)
      return
    }
    if (Array.isArray(v)) v.forEach((x, i) => andar(x, `${caminho}[${i}]`, chave))
    else if (v && typeof v === 'object')
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        // Chave com fragmento do nome ou fora da forma (exceto os tokens em `arquivos`).
        if (!/\.arquivos$/.test(caminho) && (!CHAVE.test(k) || temFragmento(k, fragmentos))) sobras.push(`${caminho}.${k}: chave identifica ou fora da forma`)
        andar(x, `${caminho}.${k}`, k)
      }
  }
  andar(valor, 'fixture', '')
  return sobras
}

function candidatasDoVeuDe(assinatura: unknown): string[] {
  const cores: string[] = []
  const andar = (v: unknown) => {
    if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) cores.push(v.toUpperCase())
    else if (Array.isArray(v)) v.forEach(andar)
    else if (v && typeof v === 'object') Object.values(v as Record<string, unknown>).forEach(andar)
  }
  andar(assinatura)
  return [...new Set(cores)]
}
