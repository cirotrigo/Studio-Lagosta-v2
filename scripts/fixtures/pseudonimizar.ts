/**
 * Pseudonimização das fixtures do piloto sintético — pura, para o teste exercitar.
 *
 * Entra o export LOCAL de um cliente (projeto, páginas de assinatura, logos já baixadas pelo exportador); sai o que pode ser
 * VERSIONADO: só os campos permitidos das páginas, toda string varrida RECURSIVAMENTE (o nome do cliente vira `cliente-NN`,
 * toda URL vira token `fixture:*`, todo identificador de arquivo externo é zerado) e uma CONFERÊNCIA final que recusa a saída
 * se sobrou qualquer URL, o nome original ou um identificador externo em qualquer profundidade.
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
  /** token → PNG em base64 (as logos). */
  arquivos: Record<string, string>
  candidatasDoVeu: string[]
}

const CAMPOS_DA_PAGINA = ['name', 'tags', 'width', 'height', 'background', 'layers', 'order'] as const
const CHAVES_EXTERNAS = /drive|fileid|blob|imageurl|_imageurl|thumbnail|src$/i
const URL = /(https?:\/\/|data:|blob:|gs:\/\/|s3:\/\/)/i
/** Chaves cuja string é conhecida e tratada (texto vira copy sintética; fileUrl vira token; o resto é cor/enum/fonte). */
const CHAVES_CONHECIDAS = new Set(['id', 'name', 'type', 'fileUrl', 'content', 'text', 'fontFamily', 'fontWeight', 'fontStyle', 'textAlign', 'verticalAlign', 'color', 'fill', 'stroke', 'backgroundColor', 'gradientType', 'shapeType', 'papel', 'role', 'align', 'textTransform', 'textDecoration', 'objectFit', 'blendMode', 'tags', 'background', 'label', 'unit', 'mode', 'preset', 'family', 'clienteId'])
/** Forma de string que não identifica ninguém: cor, número, booleano, token da fixture, enum curto sem espaço. */
// Enum curto SEM dígito nem sublinhado: `cli_8f3a9b2c7d1e` não é enum, é identificador.
const FORMA_SEGURA = /^(#[0-9a-f]{3,8}|rgba?\([\d.,\s%]+\)|hsla?\([\d.,\s%]+\)|-?\d+(\.\d+)?(px|%|em|rem|deg)?|true|false|null|fixture:[\w-]+|[A-Za-z][A-Za-z-]{0,23})$/i
const CHAVES_DE_TEXTO = new Set(['content', 'text'])
/** O texto de exemplo da assinatura vira copy SINTÉTICA pelo papel da camada (contrato § 1.1): nada do cliente sobra no texto. */
export function copySintetica(idOuNome: string): string {
  const k = idOuNome.toLowerCase()
  if (/pre|kicker|chapeu|chapéu/.test(k)) return 'Quarta-feira'
  if (/head|titulo|título|manchete/.test(k)) return 'Almoço do dia'
  if (/apoio|sub|descri/.test(k)) return 'Prato feito'
  if (/serv|rodape|rodapé|cta|horario|horário/.test(k)) return 'Seg a sex, 11h30'
  return 'Texto de exemplo'
}
/** Os chunks de PNG que carregam metadado (texto, EXIF, XMP, tempo): a fixture não pode levar nenhum. */
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
 * @param arquivos URL → PNG em base64 (já NORMALIZADO, sem metadado) de TODO arquivo que o exportador baixou: logos e imagens
 * das camadas da assinatura. URL sem arquivo vira token sem arquivo — e o leitor do piloto recusa a fixture se uma camada
 * `fileUrl` apontar para ele.
 */
export function pseudonimizar(exp: ExportDoCliente, clienteId: string, arquivos: Record<string, string>): FixtureDoCliente {
  const nome = exp.projeto.name
  const nomeRe = new RegExp(nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
  const tokenDaLogo = new Map(exp.logos.map((l, k) => [l.fileUrl, `fixture:logo-${k}`] as const))
  const tokenDoArquivo = new Map<string, string>()
  const arquivosDaFixture: Record<string, string> = {}
  let n = 0
  const token = (url: string): string => {
    if (tokenDaLogo.has(url)) return tokenDaLogo.get(url)!
    if (!tokenDoArquivo.has(url)) {
      const t = `fixture:arquivo-${++n}`
      tokenDoArquivo.set(url, t)
      if (arquivos[url]) arquivosDaFixture[t] = arquivos[url]
    }
    return tokenDoArquivo.get(url)!
  }
  const texto = (s: string): string => {
    if (tokenDaLogo.has(s) || URL.test(s)) return token(s)
    return nome ? s.replace(nomeRe, clienteId) : s
  }
  const varrer = (v: unknown, chave = '', camada?: Record<string, unknown>): unknown => {
    if (typeof v === 'string') {
      if (CHAVES_DE_TEXTO.has(chave) && camada) return copySintetica(String(camada.id ?? camada.name ?? ''))
      if (CHAVES_EXTERNAS.test(chave) && !tokenDaLogo.has(v)) return URL.test(v) || /^[A-Za-z0-9_-]{20,}$/.test(v) ? (chave === 'fileUrl' ? token(v) : null) : texto(v)
      return texto(v)
    }
    if (Array.isArray(v)) return v.map((x) => varrer(x, chave, camada))
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>
      const ehCamada = typeof o.type === 'string' && 'position' in o
      return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, varrer(x, k, ehCamada ? o : camada)]))
    }
    return v
  }
  const paginas = exp.paginas.map((p) => {
    const so: Record<string, unknown> = {}
    for (const c of CAMPOS_DA_PAGINA) if (c in p) so[c] = p[c]
    if (typeof so.layers === 'string') so.layers = JSON.parse(so.layers)
    return varrer(so) as Record<string, unknown>
  })
  const saida: FixtureDoCliente = {
    clienteId,
    numerosDoProjeto: varrer(exp.projeto.assinatura),
    paginas,
    logos: exp.logos.map((l, k) => ({ fileUrl: `fixture:logo-${k}`, isProjectLogo: l.isProjectLogo })),
    arquivos: { ...Object.fromEntries(exp.logos.map((l, k) => [`fixture:logo-${k}`, arquivos[l.fileUrl] ?? ''])), ...arquivosDaFixture },
    candidatasDoVeu: candidatasDoVeuDe(exp.projeto.assinatura),
  }
  const sobras = conferirPseudonimo(saida, nome)
  if (sobras.length > 0) throw new Error(`pseudonimização incompleta de ${nome}: ${sobras.join('; ')}`)
  return saida
}

/** O que ainda identifica o cliente ou aponta para fora: URLs, o nome original, identificadores externos — em QUALQUER profundidade. */
export function conferirPseudonimo(valor: unknown, nome: string): string[] {
  const sobras: string[] = []
  const nomeRe = nome ? new RegExp(nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null
  const andar = (v: unknown, caminho: string) => {
    if (typeof v === 'string') {
      const chave = caminho.split('.').at(-1)?.replace(/\[\d+\]$/, '') ?? ''
      if (/\.arquivos\./.test(caminho)) {
        // Os PNGs: têm de ser PNG e não podem carregar metadado (texto, EXIF, XMP, tempo, pHYs).
        const meta = v ? chunksDeMetadadoDoPng(Buffer.from(v, 'base64')) : ['vazio']
        if (meta.length) sobras.push(`${caminho}: PNG com ${meta.join('/')}`)
        return
      }
      if (URL.test(v)) sobras.push(`${caminho}: URL`)
      if (nomeRe && nomeRe.test(v)) sobras.push(`${caminho}: nome do cliente`)
      if (CHAVES_EXTERNAS.test(chave) && !v.startsWith('fixture:')) sobras.push(`${caminho}: identificador externo`)
      // Texto sob chave que ninguém previu e que não tem forma segura (cor, número, enum curto, token): fail-closed — quem
      // gerar a fixture decide se a chave entra na lista das conhecidas.
      if (!CHAVES_CONHECIDAS.has(chave) && !/\.tags\[/.test(caminho) && !FORMA_SEGURA.test(v)) sobras.push(`${caminho}: texto sob chave não prevista`)
      return
    }
    if (Array.isArray(v)) v.forEach((x, i) => andar(x, `${caminho}[${i}]`))
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v as Record<string, unknown>)) andar(x, `${caminho}.${k}`)
  }
  andar(valor, 'fixture')
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
