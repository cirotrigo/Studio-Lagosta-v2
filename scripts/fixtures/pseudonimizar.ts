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

export function pseudonimizar(exp: ExportDoCliente, clienteId: string, arquivosDasLogos: Record<string, string>): FixtureDoCliente {
  const nome = exp.projeto.name
  const nomeRe = new RegExp(nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
  const tokenDaLogo = new Map(exp.logos.map((l, k) => [l.fileUrl, `fixture:logo-${k}`] as const))
  let n = 0
  const texto = (s: string): string => {
    if (tokenDaLogo.has(s)) return tokenDaLogo.get(s)!
    if (URL.test(s)) return `fixture:arquivo-${++n}`
    return nome ? s.replace(nomeRe, clienteId) : s
  }
  const varrer = (v: unknown, chave = ''): unknown => {
    if (typeof v === 'string') return CHAVES_EXTERNAS.test(chave) && !tokenDaLogo.has(v) ? (URL.test(v) || /^[A-Za-z0-9_-]{20,}$/.test(v) ? null : texto(v)) : texto(v)
    if (Array.isArray(v)) return v.map((x) => varrer(x, chave))
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, varrer(x, k)]))
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
    arquivos: Object.fromEntries(exp.logos.map((l, k) => [`fixture:logo-${k}`, arquivosDasLogos[l.fileUrl] ?? ''])),
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
      if (caminho.endsWith('.arquivos') || /\.arquivos\./.test(caminho)) return // os PNGs em base64
      if (URL.test(v)) sobras.push(`${caminho}: URL`)
      if (nomeRe && nomeRe.test(v)) sobras.push(`${caminho}: nome do cliente`)
      if (CHAVES_EXTERNAS.test(caminho.split('.').at(-1) ?? '') && !v.startsWith('fixture:')) sobras.push(`${caminho}: identificador externo`)
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
