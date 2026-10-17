/**
 * SELEÇÃO das fotos da etapa representativa (P1 do contrato `docs/PLANO-2026-10-17-CONTINUIDADE-E-CONTRATO-FOTOS.md`, § 3).
 *
 * Pura: não importa `@/lib/db`, não lê disco, não abre rede. Quem chama injeta o `fetch` (`Buscar`), o `realpath` e o
 * gravador de arquivos — por isso a matriz do § 4 roda inteira offline. O SQL mora em `fotos-do-banco.ts`; a casca, em
 * `exportar-piloto-sintetico.ts --fotos`.
 *
 * O que a seleção PROVA, e o que não (§ 3.3): a foto é a camada `bg-foto` REFERENCIADA nas camadas que produziram a mídia
 * REGISTRADA HOJE no banco de um story `POSTED`, sem opacidade/área/posição que a anulem. Não prova que é a mídia que o
 * publicador tem, nem que a foto ficou visível (oclusão por camada acima). Os rótulos do manifesto dizem isso.
 */
import { createHash } from 'node:crypto'
import { crc32 } from 'node:zlib'
import path from 'node:path'
import sharp from 'sharp'
import { VERSAO_DA_PROVA } from '../../src/lib/posts/prova-do-render'

// ── Constantes do contrato ─────────────────────────────────────────────────────────────────────────────────────────

/** E4b: versões de `PostRenderProof` cujo snapshot este exportador sabe ler. Versão nova = PR que a estude. */
export const VERSOES_DA_PROVA_CONHECIDAS: readonly number[] = [VERSAO_DA_PROVA]

/** E7: hosts EXATOS de onde se baixa (D7, proposta: só o store atual — `scripts/recover-blob-files.ts:5`). */
export const STORES_DO_STUDIO: readonly string[] = ['2rhsgfleozgl5jbm.public.blob.vercel-storage.com']

/**
 * Nota de imutabilidade (§ 3.4) — condição (ii) de E8b e do canvas de E6b. FALSA de propósito: a evidência levantada no PR
 * de P1 NÃO basta. O `package-lock.json` fixa `@vercel/blob` 2.0.0 desde 30/08/2026 (antes de 12/10, início das provas), e
 * o cliente 2.0.0 só manda `x-allow-overwrite` quando a opção é passada (`dist/index.js:139-140`); o "erro ao reusar o
 * pathname" é comportamento do SERVIDOR do Blob, só DOCUMENTADO (`dist/index.d.ts:235`), não verificável pelo código.
 * Virar `true` é decisão (owner + revisão), nunca conveniência; com `false`, todo fundo sai `imutabilidade-nao-comprovada`.
 */
export const IMUTABILIDADE_DO_BLOB_COMPROVADA = false

/**
 * E8b (i): todo `put` com `allowOverwrite: true` do repositório (`src/` e `scripts/`), pelo PREFIXO que ele grava. Fechado:
 * `selecao-de-fotos.test.ts` varre o repositório e falha quando aparecer um escritor fora desta lista. Só enxerga o código
 * da main — o manifesto diz "imutabilidade inferida do código da main, não provada por hash".
 */
export const INVENTARIO_DE_SOBRESCRITA: ReadonlyArray<{ arquivo: string; prefixo: string }> = [
  { arquivo: 'src/lib/creatives/persist.ts', prefixo: 'drive-cache/' },
  { arquivo: 'scripts/reparar-lh3-legado.ts', prefixo: 'drive-cache/' },
  { arquivo: 'src/lib/creatives/chat-upload.ts', prefixo: 'chat-uploads/' },
  { arquivo: 'src/lib/templates/miniatura.ts', prefixo: 'templates/thumbnails/' },
  { arquivo: 'src/app/api/templates/generate-thumbnail/route.ts', prefixo: 'templates/thumbnails/' },
  { arquivo: 'scripts/miniaturas-para-blob.ts', prefixo: 'templates/thumbnails/' },
  // grava `compor/lagosta-setembro/<arquivo>` e sobrescreve quando o `head` falha; o prefixo inteiro, por precaução
  { arquivo: 'scripts/compor-leva-setembro.ts', prefixo: 'compor/' },
  { arquivo: 'scripts/importar-brand-manuais.ts', prefixo: 'brand-manual/' },
]

export const CANVAS_DO_STORY = { largura: 1080, altura: 1920 } as const
export const TETO_DE_CANDIDATOS = 20
export const MINIMO_DA_LEVA = 6
export const TETO_DE_BYTES = 25 * 1024 * 1024
export const BYTES_DO_CABECALHO = 64
export const PRAZO_DO_DOWNLOAD_MS = 10_000
export const MAXIMO_DE_REDIRECIONAMENTOS = 3

/** E6b: as únicas chaves de `style` do caso simples; qualquer outra pode alterar ou anular pixels (`render-engine.ts:1530`). */
export const CHAVES_DE_STYLE_DO_CASO_SIMPLES: ReadonlySet<string> = new Set(['opacity', 'objectFit', 'cropPosition', 'flipH', 'flipV'])
/** E6b: chaves da CAMADA que não mexem nos pixels da imagem. Chave fora desta lista = transformação desconhecida → não avalia. */
export const CHAVES_DA_CAMADA_DO_CASO_SIMPLES: ReadonlySet<string> = new Set([
  'id', 'name', 'type', 'fileUrl', 'position', 'size', 'rotation', 'visible', 'locked', 'order', 'style', 'metadata',
  'isDynamic', 'groupId', 'parentId', 'label', 'fieldType', 'placeholder', 'required', 'defaultValue', 'role', 'papel',
  'elementId', 'createdAt', 'updatedAt',
])

export const ROTULOS_DO_MANIFESTO = [
  'mídia registrada no banco, não conferida contra o publicador',
  'fundo referenciado no render, não anulado (oclusão por camada acima NÃO medida)',
  'imutabilidade inferida do código da main, não provada por hash',
  'classe e transformação de origem são INDÍCIO pelo prefixo, não proveniência',
] as const

// ── Argumentos ─────────────────────────────────────────────────────────────────────────────────────────────────────

export type Populacao = 'publicados' | 'agendados'
export interface ArgsDasFotos {
  modo: 'contar' | 'exportar'
  clientes: number[]
  desde: Date
  ate: Date
  populacao: Populacao
  candidatos: number | null
  pasta: string | null
}

/** Data ISO ABSOLUTA em UTC: `AAAA-MM-DD` (meia-noite UTC) ou com hora terminando em `Z`. Nada relativo, nada sem fuso. */
export function lerDataUtc(texto: string | undefined): Date | null {
  if (!texto) return null
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?Z)?$/.test(texto)) return null
  const d = new Date(texto.length === 10 ? `${texto}T00:00:00Z` : texto)
  if (Number.isNaN(d.getTime())) return null
  // `new Date` aceita 2026-02-31 → março; a volta tem de reproduzir o dia digitado.
  return d.toISOString().slice(0, 10) === texto.slice(0, 10) ? d : null
}

const FLAGS_COM_VALOR = new Set(['--cliente', '--desde', '--ate', '--candidatos'])
const FLAGS_SOLTAS = new Set(['--fotos', '--contar', '--agendados'])

export function lerArgsDasFotos(argv: readonly string[]): ArgsDasFotos | { recusa: string } {
  const clientes: number[] = []
  const posicionais: string[] = []
  const valores: Record<string, string> = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (FLAGS_COM_VALOR.has(a)) {
      const v = argv[++i]
      if (v === undefined || v.startsWith('--')) return { recusa: `${a} sem valor` }
      if (a === '--cliente') {
        if (!/^[1-9]\d*$/.test(v)) return { recusa: `--cliente inválido: ${v}` }
        clientes.push(Number(v))
      } else {
        if (valores[a] !== undefined) return { recusa: `${a} repetido` }
        valores[a] = v
      }
    } else if (FLAGS_SOLTAS.has(a)) continue
    else if (a.startsWith('--')) return { recusa: `opção desconhecida: ${a}` }
    else posicionais.push(a)
  }
  if (!argv.includes('--fotos')) return { recusa: 'falta --fotos' }
  if (clientes.length === 0) return { recusa: '--cliente é obrigatório: a ferramenta nunca escolhe cliente' }
  if (new Set(clientes).size !== clientes.length) return { recusa: '--cliente repetido' }
  const desde = lerDataUtc(valores['--desde'])
  const ate = lerDataUtc(valores['--ate'])
  if (!desde || !ate) return { recusa: '--desde e --ate são obrigatórios, ISO absolutos em UTC (AAAA-MM-DD ou …Z)' }
  if (desde.getTime() >= ate.getTime()) return { recusa: '--desde tem de ser anterior a --ate' }
  const populacao: Populacao = argv.includes('--agendados') ? 'agendados' : 'publicados'
  if (argv.includes('--contar')) {
    if (valores['--candidatos'] !== undefined || posicionais.length > 0) return { recusa: '--contar não baixa nada: sem --candidatos e sem pasta' }
    return { modo: 'contar', clientes, desde, ate, populacao, candidatos: null, pasta: null }
  }
  const n = valores['--candidatos']
  if (n === undefined || !/^[1-9]\d*$/.test(n) || Number(n) > TETO_DE_CANDIDATOS) {
    return { recusa: `--candidatos é obrigatório na exportação, de 1 a ${TETO_DE_CANDIDATOS}` }
  }
  if (posicionais.length !== 1) return { recusa: 'a exportação exige UMA pasta de destino' }
  return { modo: 'exportar', clientes, desde, ate, populacao, candidatos: Number(n), pasta: posicionais[0] }
}

// ── Destino ────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Recusa pasta DENTRO do repositório fora de `human-output/` (que o `.gitignore` cobre). Resolve symlinks pelo ancestral
 * existente mais próximo: `../repo/src` por caminho relativo ou por link cai no mesmo lugar e é recusado.
 */
export function recusaDoDestino(pasta: string, raizDoRepo: string, realpath: (p: string) => string): string | null {
  const real = (p: string): string => {
    const abs = path.resolve(p)
    try {
      return realpath(abs)
    } catch {
      const pai = path.dirname(abs)
      if (pai === abs) return abs
      return path.join(real(pai), path.basename(abs))
    }
  }
  const raiz = real(raizDoRepo)
  const destino = real(pasta)
  const dentro = (base: string) => destino === base || destino.startsWith(base + path.sep)
  if (!dentro(raiz)) return null
  if (dentro(path.join(raiz, 'human-output')) && destino !== raiz) return null
  return `destino dentro do repositório (${path.relative(raiz, destino) || '.'}): use uma pasta fora dele ou em human-output/`
}

// ── Host (E7) ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** Forma CANÔNICA exigida antes de tudo: `https://<host>` seguido de `/`, `?`, `#` ou fim — sem porta, credencial nem barra extra. */
const URL_CANONICA = /^https:\/\/[a-z0-9.-]+(?=[/?#]|$)/i

/** `null` = autorizado. Comparação EXATA do hostname com `STORES_DO_STUDIO` — nunca sufixo, nunca `includes`. */
export function recusaDoHost(url: string): string | null {
  // O parser normaliza `https:////h:443` e `h:443` para porta vazia: a forma é lida no TEXTO, antes de parsear.
  if (!/^https:\/\//i.test(url)) return 'protocolo-nao-https'
  const autoridade = /^https:\/\/([^/?#]*)/i.exec(url)![1]
  if (autoridade.includes('@')) return 'credencial-na-url'
  if (autoridade.includes(':')) return 'porta-explicita'
  if (!URL_CANONICA.test(url)) return 'url-nao-canonica'
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return 'url-invalida'
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return 'url-nao-canonica'
  return STORES_DO_STUDIO.includes(u.hostname.toLowerCase()) ? null : 'host-fora-da-lista'
}

// ── Classe de origem (§ 3.4) ───────────────────────────────────────────────────────────────────────────────────────

export type ClasseDeOrigem = 'upload' | 'chat-reduzida' | 'drive-miniatura' | 'drive-download' | 'ia-download' | 'render' | 'normalizada' | 'desconhecida'

export const INDICIO_DE_TRANSFORMACAO: Record<ClasseDeOrigem, string> = {
  upload: 'nenhuma conhecida',
  'chat-reduzida': 'reduzida',
  'drive-miniatura': 'miniatura',
  'drive-download': 'recorte possível',
  'ia-download': 'nenhuma conhecida',
  render: 'render',
  normalizada: 'normalizada',
  desconhecida: 'desconhecida',
}

/** Caminho do objeto, normalizado (minúsculas, sem query, sem barra inicial); `null` quando sobra `..` codificado. */
export function caminhoDoObjeto(url: string): string | null {
  let bruto: string
  try {
    bruto = new URL(url).pathname
  } catch {
    return null
  }
  let decodificado: string
  try {
    decodificado = decodeURIComponent(bruto)
  } catch {
    return null
  }
  if (decodificado.split('/').some((s) => s === '..' || s === '.')) return null
  return decodificado.replace(/^\/+/, '').toLowerCase()
}

export function classeDeOrigem(url: string): ClasseDeOrigem {
  const c = caminhoDoObjeto(url)
  if (c === null) return 'desconhecida'
  const s = c.split('/')
  if (s[0] === 'uploads' && s.length > 1) return 'upload'
  if (s[0] === 'chat-uploads' && s.length > 1) return 'chat-reduzida'
  if (s[0] === 'drive-cache' && s.length > 1) return 'drive-miniatura'
  if (s[0] === 'posts' && s[1] === 'rendered' && s.length > 2) return 'render'
  if (s[0] === 'posts' && s.length > 3) {
    if (s[2] === 'google-drive') return 'drive-download'
    if (s[2] === 'ai-images') return 'ia-download'
    if (s[2] === 'normalized') return 'normalizada'
  }
  return 'desconhecida'
}

/** E8b (i): o prefixo do inventário que casa este objeto, ou `null`. Caminho ilegível conta como sobrescrevível. */
export function escritorQueSobrescreve(url: string): string | null {
  const c = caminhoDoObjeto(url)
  if (c === null) return 'caminho-ilegivel'
  return INVENTARIO_DE_SOBRESCRITA.find((e) => c.startsWith(e.prefixo))?.prefixo ?? null
}

// ── Linhas lidas do branch ─────────────────────────────────────────────────────────────────────────────────────────

export interface ProvaLida {
  mediaUrl: string
  proofVersion: unknown
  createdAt: Date | null
  layersSnapshot: unknown
}
export interface PostLido {
  id: string
  status: string
  postType: string
  mediaUrls: string[]
  pageId: string | null
  sentAt: Date | null
  latePublishedAt: Date | null
  scheduledDatetime: Date | null
  createdAt: Date | null
  provas: ProvaLida[]
}

/** Data de referência da população (§ 3.2) e o campo de onde veio. */
export function dataDeReferencia(p: PostLido, populacao: Populacao): { data: Date; campo: string } | null {
  if (populacao === 'agendados') return p.scheduledDatetime ? { data: p.scheduledDatetime, campo: 'scheduledDatetime' } : null
  if (p.latePublishedAt) return { data: p.latePublishedAt, campo: 'latePublishedAt' }
  if (p.sentAt) return { data: p.sentAt, campo: 'sentAt' }
  return null
}

/** Ordem do § 3.2: data de referência DESC, `id` ASC; sem data vai ao fim (e será excluído por E1b). */
export function ordenarPosts(posts: readonly PostLido[], populacao: Populacao): PostLido[] {
  const t = (p: PostLido) => dataDeReferencia(p, populacao)?.data.getTime() ?? -Infinity
  return [...posts].sort((a, b) => t(b) - t(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

// ── Elegibilidade (§ 3.3) ──────────────────────────────────────────────────────────────────────────────────────────

type Camada = Record<string, unknown>
const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const numeroFinito = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** E5: array de objetos; uma string JSON é decodificada UMA vez (dupla codificação não passa). */
export function lerSnapshot(v: unknown): Camada[] | null {
  let valor = v
  if (typeof valor === 'string') {
    try {
      valor = JSON.parse(valor)
    } catch {
      return null
    }
  }
  return Array.isArray(valor) && valor.every(ehObjeto) ? (valor as Camada[]) : null
}

interface Caixa { x: number; y: number; w: number; h: number }
const intersecta = (a: Caixa, b: Caixa) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

function caixaDe(c: Camada): Caixa | null {
  const pos = c.position, tam = c.size
  if (!ehObjeto(pos) || !ehObjeto(tam)) return null
  if (![pos.x, pos.y, tam.width, tam.height].every(numeroFinito)) return null
  return { x: pos.x as number, y: pos.y as number, w: tam.width as number, h: tam.height as number }
}

/** E6 + E6b sem o canvas (que exige rede): devolve o fundo e a caixa, ou o motivo. */
export function avaliarFundo(camadas: Camada[]): { fundo: Camada; indice: number; caixa: Caixa } | { motivo: string } {
  const fundos = camadas.map((c, i) => [c, i] as const).filter(([c]) => c.id === 'bg-foto')
  if (fundos.length === 0) return { motivo: 'fundo-ausente' }
  if (fundos.length > 1) return { motivo: 'fundo-duplicado' }
  const [fundo, indice] = fundos[0]
  if (fundo.type !== 'image') return { motivo: 'fundo-nao-imagem' }
  if (typeof fundo.fileUrl !== 'string' || !fundo.fileUrl.startsWith('https://')) return { motivo: 'fundo-nao-https' }
  if (fundo.visible === false) return { motivo: 'fundo-invisivel:oculto' }
  if (Object.keys(fundo).some((k) => !CHAVES_DA_CAMADA_DO_CASO_SIMPLES.has(k))) return { motivo: 'fundo-nao-avaliavel:transformacao-desconhecida' }
  if (fundo.visible !== undefined && typeof fundo.visible !== 'boolean') return { motivo: 'fundo-nao-avaliavel:transformacao-desconhecida' }
  if (fundo.rotation !== undefined) {
    if (!numeroFinito(fundo.rotation)) return { motivo: 'fundo-nao-avaliavel:transformacao-desconhecida' }
    if (fundo.rotation !== 0) return { motivo: 'fundo-nao-avaliavel:rotacao' }
  }
  if (fundo.style !== undefined) {
    if (!ehObjeto(fundo.style)) return { motivo: 'fundo-nao-avaliavel:transformacao-desconhecida' }
    if (Object.keys(fundo.style).some((k) => !CHAVES_DE_STYLE_DO_CASO_SIMPLES.has(k))) return { motivo: 'fundo-nao-avaliavel:style-fora-da-lista' }
    const op = fundo.style.opacity
    if (op !== undefined) {
      if (!numeroFinito(op)) return { motivo: 'fundo-nao-avaliavel:transformacao-desconhecida' }
      if (op <= 0) return { motivo: 'fundo-invisivel:opacidade-0' }
    }
  }
  const caixa = caixaDe(fundo)
  if (!caixa) return { motivo: 'fundo-nao-avaliavel:transformacao-desconhecida' }
  if (caixa.w <= 0 || caixa.h <= 0) return { motivo: 'fundo-invisivel:sem-area' }
  if (!intersecta(caixa, { x: 0, y: 0, w: CANVAS_DO_STORY.largura, h: CANVAS_DO_STORY.altura })) return { motivo: 'fundo-invisivel:fora-do-canvas' }
  return { fundo, indice, caixa }
}

/** Registrado, nunca decidido: camadas visíveis ACIMA do fundo (por `order`, senão pela posição no array) que o intersectam. */
function camadasAcimaDoFundo(camadas: Camada[], indice: number, caixa: Caixa): number {
  const ordem = (c: Camada, i: number) => (numeroFinito(c.order) ? c.order : i)
  const doFundo = ordem(camadas[indice], indice)
  return camadas.filter((c, i) => i !== indice && c.visible !== false && ordem(c, i) > doFundo && (() => {
    const cx = caixaDe(c)
    return cx !== null && intersecta(cx, caixa)
  })()).length
}

export interface FotoElegivel {
  postId: string
  status: string
  dataDeReferencia: string
  campoDaData: string
  pageId: string
  mediaUrl: string
  provaCriadaEm: string
  proofVersion: number
  fileUrl: string
  cropPosition: string
  classe: ClasseDeOrigem
  indicioDeTransformacao: string
  formato: 'story'
  camadasAcimaDoFundo: number
}
export type Avaliacao = { elegivel: FotoElegivel } | { exclusao: string; classe?: ClasseDeOrigem }

export interface OpcoesDaAvaliacao {
  desde: Date
  ate: Date
  populacao: Populacao
  imutabilidadeComprovada: boolean
}

/** Chave de E9: o `fileUrl` sem query nem fragmento. */
export const chaveDoArquivo = (url: string) => url.split(/[?#]/)[0]

/**
 * E1–E8b, em ordem; o primeiro motivo vence. Ficam com quem chama: o canvas de E6b (rede, `conferirCanvas`) e E9
 * (`arquivo-repetido`), que só se decide depois dele — na contagem sobre os elegíveis-teto, na exportação sobre os
 * arquivos EXPORTADOS (a peça cujo fundo falhou não tira a vez da seguinte com o mesmo fundo).
 */
export function avaliarPost(p: PostLido, o: OpcoesDaAvaliacao): Avaliacao {
  const statusDaPopulacao = o.populacao === 'publicados' ? 'POSTED' : 'SCHEDULED'
  if (p.postType !== 'STORY' || p.status !== statusDaPopulacao) return { exclusao: `status-fora:${p.status}` }
  const ref = dataDeReferencia(p, o.populacao)
  if (!ref) return { exclusao: 'sem-data-de-referencia' }
  if (ref.data.getTime() < o.desde.getTime() || ref.data.getTime() >= o.ate.getTime()) return { exclusao: 'fora-da-janela' }
  if (!Array.isArray(p.mediaUrls) || p.mediaUrls.length !== 1) return { exclusao: 'midia-multipla-ou-vazia' }
  if (!p.pageId) return { exclusao: 'midia-direta-sem-pagina' }
  const prova = p.provas.find((pr) => pr.mediaUrl === p.mediaUrls[0])
  if (!prova) return { exclusao: p.provas.length === 0 ? 'sem-prova' : 'prova-de-outra-midia' }
  if (o.populacao === 'publicados' && (!prova.createdAt || prova.createdAt.getTime() > ref.data.getTime())) {
    return { exclusao: 'prova-posterior-a-publicacao' }
  }
  if (typeof prova.proofVersion !== 'number' || !VERSOES_DA_PROVA_CONHECIDAS.includes(prova.proofVersion)) {
    return { exclusao: 'versao-da-prova-desconhecida' }
  }
  const camadas = lerSnapshot(prova.layersSnapshot)
  if (!camadas) return { exclusao: 'snapshot-ilegivel' }
  const f = avaliarFundo(camadas)
  if ('motivo' in f) return { exclusao: f.motivo }
  const fileUrl = f.fundo.fileUrl as string
  if (recusaDoHost(fileUrl)) return { exclusao: 'host-nao-autorizado' }
  const classe = classeDeOrigem(fileUrl)
  if (classe === 'render') return { exclusao: 'fundo-e-render', classe }
  if (escritorQueSobrescreve(fileUrl)) return { exclusao: 'origem-sobrescrevivel', classe }
  if (!o.imutabilidadeComprovada) return { exclusao: 'imutabilidade-nao-comprovada', classe }
  const crop = ehObjeto(f.fundo.style) ? f.fundo.style.cropPosition : undefined
  return {
    elegivel: {
      postId: p.id,
      status: p.status,
      dataDeReferencia: ref.data.toISOString(),
      campoDaData: ref.campo,
      pageId: p.pageId,
      mediaUrl: prova.mediaUrl,
      provaCriadaEm: prova.createdAt!.toISOString(),
      proofVersion: prova.proofVersion,
      fileUrl,
      cropPosition: typeof crop === 'string' ? crop : 'ausente',
      classe,
      indicioDeTransformacao: INDICIO_DE_TRANSFORMACAO[classe],
      formato: 'story',
      camadasAcimaDoFundo: camadasAcimaDoFundo(camadas, f.indice, f.caixa),
    },
  }
}

// ── Contagem (§ 3.5) ───────────────────────────────────────────────────────────────────────────────────────────────

export interface ContagemDoCliente {
  cliente: number
  lidos: number
  elegiveisTeto: number
  rotuloDosElegiveis: 'canvas não comprovado: teto'
  exclusoes: Record<string, number>
  /** Classe das peças que chegaram às regras de origem (E8 em diante) — mesmo que excluídas depois. */
  classesQueChegaramAOrigem: Record<string, number>
  /** Classe só dos elegíveis-teto (depois de E9). */
  elegiveisPorClasse: Record<string, number>
  cropPosition: { ausente: number; presente: number }
  midiaRegistradaEmNormalized: number
}

const somar = (m: Record<string, number>, k: string) => {
  m[k] = (m[k] ?? 0) + 1
}

export function contarCliente(cliente: number, posts: readonly PostLido[], o: OpcoesDaAvaliacao): ContagemDoCliente {
  const r: ContagemDoCliente = {
    cliente,
    lidos: posts.length,
    elegiveisTeto: 0,
    rotuloDosElegiveis: 'canvas não comprovado: teto',
    exclusoes: {},
    classesQueChegaramAOrigem: {},
    elegiveisPorClasse: {},
    cropPosition: { ausente: 0, presente: 0 },
    midiaRegistradaEmNormalized: 0,
  }
  const vistos = new Set<string>()
  for (const p of ordenarPosts(posts, o.populacao)) {
    const a = avaliarPost(p, o)
    if ('exclusao' in a) {
      somar(r.exclusoes, a.exclusao)
      if (a.classe) somar(r.classesQueChegaramAOrigem, a.classe)
      continue
    }
    somar(r.classesQueChegaramAOrigem, a.elegivel.classe)
    const chave = chaveDoArquivo(a.elegivel.fileUrl)
    if (vistos.has(chave)) {
      somar(r.exclusoes, 'arquivo-repetido')
      continue
    }
    vistos.add(chave)
    r.elegiveisTeto++
    somar(r.elegiveisPorClasse, a.elegivel.classe)
    r.cropPosition[a.elegivel.cropPosition === 'ausente' ? 'ausente' : 'presente']++
    if (caminhoDoObjeto(a.elegivel.mediaUrl)?.includes('/normalized/')) r.midiaRegistradaEmNormalized++
  }
  return r
}

// ── Download com guarda (§ 3.6) ────────────────────────────────────────────────────────────────────────────────────

export type Buscar = (url: string, init: { redirect: 'manual'; signal: AbortSignal; headers?: Record<string, string> }) => Promise<Response>
export type Baixado = { ok: true; bytes: Buffer; contentType: string } | { ok: false; falha: string }

const REDIRECIONAMENTOS = new Set([301, 302, 303, 307, 308])

/**
 * Baixa SÓ de host autorizado, revalidando cada redirecionamento (até `MAXIMO_DE_REDIRECIONAMENTOS`), com prazo total, teto
 * lido em fluxo (não confia em `content-length`) e `content-type image/*`. `soCabecalho` para depois de N bytes.
 */
export async function baixarComGuarda(
  url: string,
  buscar: Buscar,
  { teto = TETO_DE_BYTES, prazoMs = PRAZO_DO_DOWNLOAD_MS, soCabecalho }: { teto?: number; prazoMs?: number; soCabecalho?: number } = {},
): Promise<Baixado> {
  if (recusaDoHost(url)) return { ok: false, falha: 'host-nao-autorizado' }
  const controle = new AbortController()
  const relogio = setTimeout(() => controle.abort(), prazoMs)
  try {
    let atual = url
    for (let saltos = 0; ; saltos++) {
      const res = await buscar(atual, {
        redirect: 'manual',
        signal: controle.signal,
        ...(soCabecalho ? { headers: { Range: `bytes=0-${soCabecalho - 1}` } } : {}),
      })
      if (REDIRECIONAMENTOS.has(res.status)) {
        if (saltos >= MAXIMO_DE_REDIRECIONAMENTOS) return { ok: false, falha: 'redirecionamentos-demais' }
        const destino = res.headers.get('location')
        if (!destino) return { ok: false, falha: 'redirecionamento-sem-destino' }
        let proximo: string
        try {
          proximo = new URL(destino, atual).href
        } catch {
          return { ok: false, falha: 'redirecionamento-nao-autorizado' }
        }
        if (recusaDoHost(proximo)) return { ok: false, falha: 'redirecionamento-nao-autorizado' }
        atual = proximo
        continue
      }
      if (res.status !== 200 && !(soCabecalho && res.status === 206)) return { ok: false, falha: `http-${res.status}` }
      const tipo = (res.headers.get('content-type') ?? '').toLowerCase()
      if (!tipo.startsWith('image/')) return { ok: false, falha: 'content-type-nao-imagem' }
      if (!res.body) return { ok: false, falha: 'sem-corpo' }
      const leitor = res.body.getReader()
      const partes: Uint8Array[] = []
      let total = 0
      for (;;) {
        const { done, value } = await leitor.read()
        if (done) break
        partes.push(value)
        total += value.byteLength
        if (soCabecalho && total >= soCabecalho) {
          await leitor.cancel().catch(() => {})
          break
        }
        if (total > teto) {
          await leitor.cancel().catch(() => {})
          return { ok: false, falha: 'acima-do-teto' }
        }
      }
      const bytes = Buffer.concat(partes)
      return { ok: true, bytes: soCabecalho ? bytes.subarray(0, soCabecalho) : bytes, contentType: tipo }
    }
  } catch {
    return { ok: false, falha: controle.signal.aborted ? 'prazo-esgotado' : 'erro-de-rede' }
  } finally {
    clearTimeout(relogio)
  }
}

/** Assinatura nos BYTES (não no nome nem no MIME). */
export function assinaturaDaImagem(b: Uint8Array): 'png' | 'jpg' | 'webp' | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'png'
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg'
  if (b.length >= 12 && String.fromCharCode(...b.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...b.subarray(8, 12)) === 'WEBP') return 'webp'
  return null
}

const PROFUNDIDADES_POR_COR: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] }

/**
 * Largura × altura do IHDR de um PNG, ou `null`. Valida o chunk INTEIRO (a 1ª coisa depois da assinatura): comprimento 13,
 * tipo `IHDR`, dimensões 1..2³¹−1, profundidade × tipo de cor da especificação, compressão/filtro 0, entrelaçamento 0/1 e o
 * CRC32 de tipo+dados — bytes fabricados com "1080 × 1920" e o resto errado não comprovam canvas.
 */
export function lerIhdr(b: Uint8Array): { largura: number; altura: number } | null {
  if (assinaturaDaImagem(b) !== 'png' || b.length < 33) return null
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  if (v.getUint32(8) !== 13 || String.fromCharCode(...b.subarray(12, 16)) !== 'IHDR') return null
  const largura = v.getUint32(16), altura = v.getUint32(20)
  const maximo = 2 ** 31 - 1
  if (largura < 1 || altura < 1 || largura > maximo || altura > maximo) return null
  const [profundidade, cor, compressao, filtro, entrelacamento] = [b[24], b[25], b[26], b[27], b[28]]
  if (!PROFUNDIDADES_POR_COR[cor]?.includes(profundidade) || compressao !== 0 || filtro !== 0 || entrelacamento > 1) return null
  if (crc32(b.subarray(12, 29)) !== v.getUint32(29)) return null
  return { largura, altura }
}

/** Canvas de E6b: o IHDR da MÍDIA da prova (nunca a `Page` atual). `null` = comprovado story; senão o subcódigo. */
export async function conferirCanvas(mediaUrl: string, buscar: Buscar, imutabilidadeComprovada: boolean): Promise<string | null> {
  if (!imutabilidadeComprovada) return 'canvas-nao-comprovado:imutabilidade'
  const r = await baixarComGuarda(mediaUrl, buscar, { soCabecalho: BYTES_DO_CABECALHO })
  if ('falha' in r) return `canvas-nao-comprovado:${r.falha}`
  const ihdr = lerIhdr(r.bytes)
  if (!ihdr) return 'canvas-nao-comprovado:ihdr'
  return ihdr.largura === CANVAS_DO_STORY.largura && ihdr.altura === CANVAS_DO_STORY.altura ? null : 'canvas-diferente-do-story'
}

// ── Exportação (§ 3.6) ─────────────────────────────────────────────────────────────────────────────────────────────

export interface FotoExportada extends FotoElegivel {
  arquivo: string
  sha256: string
  bytes: number
  contentTypeDeclarado: string
  formatoLido: string
  larguraLida: number
  alturaLida: number
  original: 'indisponivel'
}
export interface ResultadoDoCliente {
  cliente: number
  lidos: number
  /** Passaram E1–E8b (antes do canvas e de E9) — preliminar, não é o total de elegíveis. */
  elegiveisPreliminares: number
  /** Preliminares conferidos (canvas + E9), em ordem, até fechar os candidatos. */
  tentados: number
  /** Conferidos que passaram TAMBÉM no canvas e em E9: os elegíveis de fato (inclui os que falharam no download). */
  elegiveis: number
  exportados: FotoExportada[]
  exclusoes: Record<string, number>
  deficitDeCandidatos: number
  foraDaLeva: boolean
}

export async function exportarCliente(
  cliente: number,
  posts: readonly PostLido[],
  o: OpcoesDaAvaliacao & { candidatos: number },
  deps: { buscar: Buscar; gravar: (nome: string, bytes: Buffer) => void },
): Promise<ResultadoDoCliente> {
  const exclusoes: Record<string, number> = {}
  const exportadosPorArquivo = new Set<string>()
  const elegiveis: FotoElegivel[] = []
  for (const p of ordenarPosts(posts, o.populacao)) {
    const a = avaliarPost(p, o)
    if ('exclusao' in a) somar(exclusoes, a.exclusao)
    else elegiveis.push(a.elegivel)
  }
  const exportados: FotoExportada[] = []
  let tentados = 0
  let elegiveisDeFato = 0
  // Reposição determinística: na ordem, até `candidatos` EXPORTADOS; cada falha é contada e o próximo entra.
  for (const e of elegiveis) {
    if (exportados.length >= o.candidatos) break
    tentados++
    const canvas = await conferirCanvas(e.mediaUrl, deps.buscar, o.imutabilidadeComprovada)
    if (canvas) {
      somar(exclusoes, `fundo-nao-avaliavel:${canvas}`)
      continue
    }
    // E9 depois do canvas e só contra o que já foi EXPORTADO.
    if (exportadosPorArquivo.has(chaveDoArquivo(e.fileUrl))) {
      somar(exclusoes, 'arquivo-repetido')
      continue
    }
    elegiveisDeFato++
    const r = await baixarComGuarda(e.fileUrl, deps.buscar)
    if ('falha' in r) {
      somar(exclusoes, `download-falhou:${r.falha}`)
      continue
    }
    const ext = assinaturaDaImagem(r.bytes)
    if (!ext) {
      somar(exclusoes, 'download-falhou:assinatura-nao-e-imagem')
      continue
    }
    const meta = await sharp(r.bytes).metadata().catch(() => null)
    if (!meta || !(Number(meta.width) > 0) || !(Number(meta.height) > 0)) {
      somar(exclusoes, 'download-falhou:metadados-ilegiveis')
      continue
    }
    exportadosPorArquivo.add(chaveDoArquivo(e.fileUrl))
    const arquivo = `cliente-${cliente}-${exportados.length + 1}.${ext}`
    deps.gravar(arquivo, r.bytes)
    exportados.push({
      ...e,
      arquivo,
      sha256: createHash('sha256').update(r.bytes).digest('hex'),
      bytes: r.bytes.length,
      contentTypeDeclarado: r.contentType,
      formatoLido: ext,
      larguraLida: meta.width,
      alturaLida: meta.height,
      original: 'indisponivel',
    })
  }
  return {
    cliente,
    lidos: posts.length,
    elegiveisPreliminares: elegiveis.length,
    tentados,
    elegiveis: elegiveisDeFato,
    exportados,
    exclusoes,
    deficitDeCandidatos: o.candidatos - exportados.length,
    foraDaLeva: exportados.length < MINIMO_DA_LEVA,
  }
}
