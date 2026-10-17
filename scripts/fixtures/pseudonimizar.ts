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
const CHAVES_DE_ENUM = new Set(['type', 'fontWeight', 'fontStyle', 'textAlign', 'verticalAlign', 'objectFit', 'textTransform', 'textDecoration', 'anchor', 'breakMode', 'textMode', 'fit', 'gradientType', 'shapeType', 'blendMode', 'papel', 'role', 'mode', 'unit', 'align', 'position', 'direction', 'repeat', 'lineCap', 'lineJoin'])
const ENUM = /^([a-z][a-z0-9-]{0,31}|\d{3})$/i // `\d{3}`: `fontWeight: '400'`
const CHAVES_DE_TEXTO = new Set(['content', 'text'])
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
  const nomeRe = nome ? new RegExp(nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null
  const descartados: string[] = []
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
  const projetar = (v: unknown, chave: string, caminho: string, camada?: Record<string, unknown>): unknown => {
    if (typeof v === 'number' || typeof v === 'boolean' || v === null || v === undefined) return v
    if (typeof v === 'string') {
      if (COR.test(v)) return v
      if (chave === 'fileUrl') return token(v, caminho)
      if (CHAVES_DE_TEXTO.has(chave)) return camada ? copySintetica(papelDa(camada) ?? '') : (descartados.push(`${caminho}: texto fora de camada`), undefined)
      if (chave === 'fontFamily') return v
      if (chave === 'groupId') return grupos.get(v) ?? (grupos.set(v, `grupo-${grupos.size + 1}`), grupos.get(v)!)
      if (CHAVES_DE_ENUM.has(chave) && ENUM.test(v) && !(nomeRe && nomeRe.test(v))) return v
      descartados.push(`${caminho}: string sob chave fora do esquema`)
      return undefined
    }
    if (Array.isArray(v)) return v.map((x, i) => projetar(x, chave, `${caminho}[${i}]`, camada)).filter((x) => x !== undefined)
    if (typeof v === 'object') {
      const o = v as Record<string, unknown>
      const ehCamada = typeof o.type === 'string' && 'position' in o
      const saida: Record<string, unknown> = {}
      for (const [k, x] of Object.entries(o)) {
        if (ehCamada && (k === 'id' || k === 'name')) continue // tratados abaixo
        const r = projetar(x, k, `${caminho}.${k}`, ehCamada ? o : camada)
        if (r !== undefined) saida[k] = r
      }
      if (ehCamada) {
        const papel = papelDa(o)
        const n = ++nCamada
        saida.id = papel ?? `camada-${n}`
        saida.name = papel ?? `${String(o.type)}-${n}`
      }
      return saida
    }
    descartados.push(`${caminho}: tipo não previsto`)
    return undefined
  }
  const paginas = exp.paginas.map((p, i) => {
    const so: Record<string, unknown> = {}
    for (const c of CAMPOS_DA_PAGINA) if (c in p && c !== 'tags') so[c] = c === 'layers' && typeof p.layers === 'string' ? JSON.parse(p.layers) : p[c]
    // Tags à parte (não passam pela projeção): só palavras minúsculas sem o nome do cliente.
    const tags = Array.isArray(p.tags) ? (p.tags as unknown[]).filter((t): t is string => typeof t === 'string' && /^[a-z-]+$/.test(t) && !(nomeRe && nomeRe.test(t))) : []
    const saida = projetar(so, '', `paginas[${i}]`) as Record<string, unknown>
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
  const sobras = conferirPseudonimo(fixture, nome)
  if (sobras.length > 0) throw new Error(`pseudonimização incompleta de ${nome}: ${sobras.join('; ')}`)
  return { fixture, descartados }
}

/** A segunda rede: o que ainda identifica o cliente ou aponta para fora, em QUALQUER profundidade. */
export function conferirPseudonimo(valor: unknown, nome: string): string[] {
  const sobras: string[] = []
  const nomeRe = nome ? new RegExp(nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null
  const andar = (v: unknown, caminho: string, chave: string) => {
    if (typeof v === 'string') {
      if (/\.arquivos\./.test(caminho)) {
        const meta = v ? chunksDeMetadadoDoPng(Buffer.from(v, 'base64')) : ['vazio']
        if (meta.length) sobras.push(`${caminho}: PNG com ${meta.join('/')}`)
        return
      }
      if (URL.test(v)) sobras.push(`${caminho}: URL`)
      if (nomeRe && nomeRe.test(v)) sobras.push(`${caminho}: nome do cliente`)
      if (CHAVES_EXTERNAS.test(chave) && !v.startsWith('fixture:')) sobras.push(`${caminho}: identificador externo`)
      const conhecida = COR.test(v) || v.startsWith('fixture:') || CHAVES_DE_TEXTO.has(chave) || chave === 'fontFamily' || chave === 'name' || chave === 'id' || chave === 'groupId' || chave === 'clienteId' || chave === 'tags' || (CHAVES_DE_ENUM.has(chave) && ENUM.test(v))
      if (!conhecida) sobras.push(`${caminho}: texto sob chave não prevista`)
      return
    }
    if (Array.isArray(v)) v.forEach((x, i) => andar(x, `${caminho}[${i}]`, chave))
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v as Record<string, unknown>)) andar(x, `${caminho}.${k}`, k)
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
