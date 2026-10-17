/**
 * Matriz OFFLINE da P1 (`--fotos`), contrato `docs/PLANO-2026-10-17-CONTINUIDADE-E-CONTRATO-FOTOS.md` § 3 e § 4.
 * Sem banco, sem rede: o `Buscar` é falso e devolve `Response` montadas aqui; o destino usa diretórios temporários.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { VERSAO_DA_PROVA } from '@/lib/posts/prova-do-render'
import type { LeituraDoBranch, MarcadorDoSnapshot } from '../../../../scripts/fixtures/fotos-do-banco'
import {
  IMUTABILIDADE_DO_BLOB_COMPROVADA,
  INDICIO_DE_TRANSFORMACAO,
  INVENTARIO_DE_SOBRESCRITA,
  ROTULOS_DO_MANIFESTO,
  STORES_DO_STUDIO,
  VERSOES_DA_PROVA_CONHECIDAS,
  assinaturaDaImagem,
  avaliarFundo,
  avaliarPost,
  baixarComGuarda,
  caminhoDoObjeto,
  chaveDoArquivo,
  classeDeOrigem,
  conferirCanvas,
  executarFotos,
  serializar,
  contarCliente,
  exportarCliente,
  lerArgsDasFotos,
  lerDataUtc,
  lerIhdr,
  lerSnapshot,
  recusaDoDestino,
  recusaDoHost,
  recusaDoLocation,
  type Buscar,
  type DependenciasDasFotos,
  type PostLido,
} from '../../../../scripts/fixtures/selecao-de-fotos'

const RAIZ = path.resolve(__dirname, '../../../..')
const STORE = `https://${STORES_DO_STUDIO[0]}`
const MIDIA = (n: number) => `${STORE}/posts/rendered/post-${n}-1760000000000.png`
const FOTO = (n: number) => `${STORE}/uploads/u1/drive-foto-${n}.jpg`
const BASE = Date.parse('2026-10-16T12:00:00Z')
const OPC = {
  desde: new Date('2026-10-12T00:00:00Z'),
  ate: new Date('2026-10-17T00:00:00Z'),
  populacao: 'publicados' as const,
  imutabilidadeComprovada: true,
}

type Camada = Record<string, unknown>
const fundo = (extra: Camada = {}): Camada => ({
  id: 'bg-foto',
  type: 'image',
  fileUrl: FOTO(1),
  position: { x: 0, y: 0 },
  size: { width: 1080, height: 1920 },
  ...extra,
})

/** Post elegível por padrão; `n` menor = publicação mais recente (vem primeiro na ordem). */
function post(n: number, over: Partial<PostLido> = {}, camadas?: unknown): PostLido {
  const midia = MIDIA(n)
  const pub = new Date(BASE - n * 60_000)
  return {
    id: `p${String(n).padStart(3, '0')}`,
    status: 'POSTED',
    postType: 'STORY',
    mediaUrls: [midia],
    pageId: 'pg-1',
    sentAt: null,
    latePublishedAt: pub,
    scheduledDatetime: null,
    createdAt: new Date('2026-10-12T01:00:00Z'),
    provas: [{ mediaUrl: midia, proofVersion: 1, createdAt: new Date(pub.getTime() - 60_000), layersSnapshot: camadas ?? [fundo({ fileUrl: FOTO(n) })] }],
    ...over,
  }
}

type Opc = Partial<Parameters<typeof avaliarPost>[1]>
const avaliar = (p: PostLido, o: Opc = {}) => avaliarPost(p, { ...OPC, ...o } as Parameters<typeof avaliarPost>[1])
const motivo = (a: ReturnType<typeof avaliarPost>) => ('exclusao' in a ? a.exclusao : 'elegivel')
const comCamadas = (camadas: unknown, o: Opc = {}) => {
  const p = post(1)
  p.provas[0].layersSnapshot = camadas // inclusive null/undefined, sem cair no padrão
  return motivo(avaliar(p, o))
}

// ── PNG / bytes montados à mão ─────────────────────────────────────────────────────────────────────────────────────
const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
function cabecalhoPng(
  w: number,
  h: number,
  { comprimento = 13, bitDepth = 8, colorType = 6, compressao = 0, filtro = 0, entrelace = 0, crcErrado = false } = {},
): Buffer {
  const b = Buffer.alloc(64)
  SIG.copy(b, 0)
  b.writeUInt32BE(comprimento, 8)
  b.write('IHDR', 12, 'latin1')
  b.writeUInt32BE(w, 16)
  b.writeUInt32BE(h, 20)
  b[24] = bitDepth
  b[25] = colorType
  b[26] = compressao
  b[27] = filtro
  b[28] = entrelace
  const crc = zlib.crc32(b.subarray(12, 29))
  b.writeUInt32BE(crcErrado ? (crc ^ 1) >>> 0 : crc, 29)
  return b
}
const CAB_STORY = cabecalhoPng(1080, 1920)
let PNG_REAL: Buffer
let JPEG_REAL: Buffer
let WEBP_REAL: Buffer
let PNG_STORY_REAL: Buffer
beforeAll(async () => {
  const base = sharp({ create: { width: 4, height: 3, channels: 3, background: { r: 200, g: 40, b: 10 } } })
  PNG_REAL = await base.clone().png().toBuffer()
  JPEG_REAL = await base.clone().jpeg().toBuffer()
  WEBP_REAL = await base.clone().webp().toBuffer()
  PNG_STORY_REAL = await sharp({ create: { width: 1080, height: 1920, channels: 3, background: '#000' } }).png().toBuffer()
})

const resposta = (corpo: Uint8Array | string | null, status = 200, headers: Record<string, string> = { 'content-type': 'image/png' }) =>
  new Response((typeof corpo === 'string' || corpo === null ? corpo : new Uint8Array(corpo)) as BodyInit, { status, headers })

/** Loja falsa: `posts/rendered/` responde o cabeçalho do canvas; o resto, a foto (ou 403 nas `falhas`). */
function lojaFalsa(o: { falhas?: Set<string>; canvas?: Buffer; foto?: (url: string) => Buffer; tipoFoto?: string; canvasFalha?: Set<string> } = {}) {
  const chamadas: Array<{ url: string; init: Parameters<Buscar>[1] }> = []
  const buscar: Buscar = async (url, init) => {
    chamadas.push({ url, init })
    if (url.includes('/posts/rendered/')) {
      if (o.canvasFalha?.has(url)) return resposta('x', 403)
      return resposta(o.canvas ?? CAB_STORY, 206)
    }
    if (o.falhas?.has(url)) return resposta('proibido', 403, { 'content-type': 'text/plain' })
    return resposta(o.foto ? o.foto(url) : PNG_REAL, 200, { 'content-type': o.tipoFoto ?? 'image/png' })
  }
  return { buscar, chamadas }
}
const gravador = () => {
  const gravados: Array<{ nome: string; bytes: Buffer }> = []
  return { gravados, gravar: (nome: string, bytes: Buffer) => void gravados.push({ nome, bytes }) }
}
const exportar = (posts: PostLido[], o: { candidatos?: number; imutabilidadeComprovada?: boolean } = {}, loja = lojaFalsa()) => {
  const g = gravador()
  return exportarCliente(7, posts, { ...OPC, candidatos: 20, ...o }, { buscar: loja.buscar, gravar: g.gravar }).then((r) => ({ r, g, loja }))
}

// ── T1 argumentos ──────────────────────────────────────────────────────────────────────────────────────────────────
describe('T1 lerArgsDasFotos / lerDataUtc', () => {
  const ARGS = ['--fotos', '--cliente', '7', '--desde', '2026-10-12', '--ate', '2026-10-17', '--candidatos', '20', '/tmp/destino']
  const recusa = (argv: string[]) => {
    const r = lerArgsDasFotos(argv)
    return 'recusa' in r ? r.recusa : null
  }
  const sem = (...flags: string[]) => ARGS.filter((a, i) => !flags.includes(a) && !flags.includes(ARGS[i - 1]))

  it('aceita a exportação completa', () => {
    expect(lerArgsDasFotos(ARGS)).toEqual({
      modo: 'exportar', clientes: [7], desde: new Date('2026-10-12T00:00:00Z'), ate: new Date('2026-10-17T00:00:00Z'),
      populacao: 'publicados', candidatos: 20, pasta: '/tmp/destino',
    })
  })
  it('sem --fotos recusa', () => expect(recusa(ARGS.slice(1))).toBe('falta --fotos'))
  it('sem --cliente recusa', () => expect(recusa(sem('--cliente'))).toBe('--cliente é obrigatório: a ferramenta nunca escolhe cliente'))
  it('cliente inválido recusa', () => {
    for (const v of ['0', 'abc', '-1', '7.5', '07']) expect(recusa(['--fotos', '--cliente', v, ...ARGS.slice(3)])).toMatch(/^(--cliente inválido: |--cliente sem valor)/)
    expect(recusa(['--fotos', '--cliente', 'abc', ...ARGS.slice(3)])).toBe('--cliente inválido: abc')
  })
  it('cliente repetido recusa; dois clientes distintos passam', () => {
    expect(recusa([...ARGS, '--cliente', '7'])).toBe('--cliente repetido')
    const r = lerArgsDasFotos([...ARGS, '--cliente', '8'])
    expect('recusa' in r ? r.recusa : r.clientes).toEqual([7, 8])
  })
  it('datas ausentes recusam', () => {
    const msg = '--desde e --ate são obrigatórios, ISO absolutos em UTC (AAAA-MM-DD ou …Z)'
    expect(recusa(sem('--desde'))).toBe(msg)
    expect(recusa(sem('--ate'))).toBe(msg)
  })
  it('data com hora sem fuso, com fuso não-Z, 2026-02-31 e relativa são nulas', () => {
    for (const t of ['2026-10-12T10:00', '2026-10-12T10:00:00', '2026-10-12T10:00:00+03:00', '2026-02-31', '2026-13-01', 'hoje', '-7d', '2026-10-12T25:00:00Z']) {
      expect(lerDataUtc(t), t).toBeNull()
    }
    expect(lerDataUtc(undefined)).toBeNull()
    expect(lerDataUtc('2026-10-12T10:30:00Z')).toEqual(new Date('2026-10-12T10:30:00Z'))
    expect(lerDataUtc('2024-02-29')).toEqual(new Date('2024-02-29T00:00:00Z'))
    const i = ARGS.indexOf('--desde') + 1
    const a = [...ARGS]
    a[i] = '2026-02-31'
    expect(recusa(a)).toBe('--desde e --ate são obrigatórios, ISO absolutos em UTC (AAAA-MM-DD ou …Z)')
  })
  it('desde ≥ ate recusa', () => {
    const igual = ARGS.map((a) => (a === '2026-10-17' ? '2026-10-12' : a))
    expect(recusa(igual)).toBe('--desde tem de ser anterior a --ate')
    const invertido = ARGS.map((a) => (a === '2026-10-17' ? '2026-10-01' : a))
    expect(recusa(invertido)).toBe('--desde tem de ser anterior a --ate')
  })
  it('--candidatos 0, 21, não numérico e ausente recusam na exportação', () => {
    const msg = '--candidatos é obrigatório na exportação, de 1 a 20'
    for (const v of ['0', '21', '2x', '-3']) {
      const a = [...ARGS]
      a[a.indexOf('--candidatos') + 1] = v
      expect(recusa(a), v).toBe(msg)
    }
    expect(recusa(sem('--candidatos'))).toBe(msg)
  })
  it('--cota (desconhecida) recusa', () => expect(recusa([...ARGS, '--cota', '10'])).toBe('opção desconhecida: --cota'))
  it('--contar recusa --candidatos e pasta; sem eles, conta', () => {
    const msg = '--contar não baixa nada: sem --candidatos e sem pasta'
    expect(recusa([...ARGS, '--contar'])).toBe(msg)
    expect(recusa([...sem('--candidatos'), '--contar'])).toBe(msg)
    expect(recusa([...sem('--candidatos').filter((a) => a !== '/tmp/destino'), '--contar', '--candidatos', '5'])).toBe(msg)
    const r = lerArgsDasFotos([...sem('--candidatos').filter((a) => a !== '/tmp/destino'), '--contar'])
    expect('recusa' in r ? r.recusa : [r.modo, r.candidatos, r.pasta]).toEqual(['contar', null, null])
  })
  it('duas pastas (ou nenhuma) recusam', () => {
    expect(recusa([...ARGS, '/tmp/outra'])).toBe('a exportação exige UMA pasta de destino')
    expect(recusa(ARGS.filter((a) => a !== '/tmp/destino'))).toBe('a exportação exige UMA pasta de destino')
  })
  it('--agendados muda a população', () => {
    const r = lerArgsDasFotos([...ARGS, '--agendados'])
    expect('recusa' in r ? r.recusa : r.populacao).toBe('agendados')
  })
})

// ── executarFotos: a orquestração da casca, com dependências falsas ───────────────────────────────────────────────
const MSG_TABELA = 'tabela PostRenderProof ausente'
const MSG_MIGRACAO = 'migração 20261012120000_post_render_proof não registrada em _prisma_migrations'
const MARCADOR = (provas: number): MarcadorDoSnapshot => ({
  rotulo: 'estimado pelo dado mais recente do branch (a idade real é a de db:dev:status)',
  provas,
  provaMaisAntiga: provas ? '2026-10-12T13:00:00.000Z' : null,
  provaMaisRecente: provas ? '2026-10-16T10:00:00.000Z' : null,
  postMaisRecente: '2026-10-16T11:00:00.000Z',
})
const leituraOk = (posts: PostLido[], provas = 3): LeituraDoBranch => ({ marcador: MARCADOR(provas), postsPorCliente: new Map([[7, posts]]) })
const RAIZ_FALSA = '/repo-falso-p1'
const PASTA = '/tmp/destino-p1'
const ARGV_CONTAR = ['--fotos', '--contar', '--cliente', '7', '--desde', '2026-10-12', '--ate', '2026-10-17']
const ARGV_EXPORTAR = ['--fotos', '--cliente', '7', '--desde', '2026-10-12', '--ate', '2026-10-17', '--candidatos', '6', PASTA]

function depsFalsas(o: { leitura?: LeituraDoBranch; naoVazia?: boolean; imutabilidadeComprovada?: boolean; loja?: ReturnType<typeof lojaFalsa> } = {}) {
  const loja = o.loja ?? lojaFalsa()
  const ch = { lerBranch: 0, buscar: 0, pastaNaoVazia: 0, gravar: [] as Array<{ pasta: string; nome: string; bytes: Buffer }>, criarPasta: [] as string[] }
  const deps: DependenciasDasFotos = {
    raizDoRepo: RAIZ_FALSA,
    realpath: (p) => p, // caminhos sintéticos: nenhum symlink
    pastaNaoVazia: () => (ch.pastaNaoVazia++, o.naoVazia ?? false),
    criarPasta: (p) => void ch.criarPasta.push(p),
    lerBranch: async () => (ch.lerBranch++, o.leitura ?? leituraOk([])),
    buscar: async (u, i) => (ch.buscar++, loja.buscar(u, i)),
    gravar: (pasta, nome, bytes) => void ch.gravar.push({ pasta, nome, bytes }),
    head: () => 'cafe1234cafe1234',
    ...(o.imutabilidadeComprovada === undefined ? {} : { imutabilidadeComprovada: o.imutabilidadeComprovada }),
  }
  return { deps, ch }
}

describe('executarFotos: ordem das recusas (nada lido antes de args e destino)', () => {
  it('args inválidos lançam antes de lerBranch', async () => {
    for (const [argv, msg] of [
      [ARGV_EXPORTAR.slice(1), '--fotos: falta --fotos'],
      [[...ARGV_EXPORTAR, '--cota', '10'], '--fotos: opção desconhecida: --cota'],
      [ARGV_EXPORTAR.map((a) => (a === '6' ? '21' : a)), '--fotos: --candidatos é obrigatório na exportação, de 1 a 20'],
    ] as Array<[string[], string]>) {
      const { deps, ch } = depsFalsas()
      await expect(executarFotos(argv, deps)).rejects.toThrow(msg)
      expect([ch.lerBranch, ch.pastaNaoVazia, ch.buscar, ch.gravar.length, ch.criarPasta.length]).toEqual([0, 0, 0, 0, 0])
    }
  })
  it('destino dentro do repositório lança antes de lerBranch (e antes de olhar a pasta)', async () => {
    const { deps, ch } = depsFalsas()
    const argv = ARGV_EXPORTAR.map((a) => (a === PASTA ? `${RAIZ_FALSA}/src` : a))
    await expect(executarFotos(argv, deps)).rejects.toThrow('destino dentro do repositório (src): use uma pasta fora dele ou em human-output/')
    expect([ch.lerBranch, ch.pastaNaoVazia, ch.buscar, ch.gravar.length, ch.criarPasta.length]).toEqual([0, 0, 0, 0, 0])
  })
  it('pasta não vazia lança antes de lerBranch', async () => {
    const { deps, ch } = depsFalsas({ naoVazia: true })
    await expect(executarFotos(ARGV_EXPORTAR, deps)).rejects.toThrow(`a pasta ${PASTA} não está vazia`)
    expect([ch.lerBranch, ch.pastaNaoVazia, ch.buscar, ch.gravar.length, ch.criarPasta.length]).toEqual([0, 1, 0, 0, 0])
  })
})

describe('T11 via executarFotos: sinais e "nenhuma prova nesta seleção"', () => {
  const casos: Array<[string, string[]]> = [
    ['(a) tabela ausente', [MSG_TABELA]],
    ['(b) migração não registrada', [MSG_MIGRACAO]],
    ['(c) os dois', [MSG_TABELA, MSG_MIGRACAO]],
  ]
  for (const [nome, recusa] of casos) {
    it(`${nome}: lança com os sinais exatos e causa indeterminada; nada baixado, criado nem gravado (contar e exportar)`, async () => {
      for (const argv of [ARGV_CONTAR, ARGV_EXPORTAR]) {
        const { deps, ch } = depsFalsas({ leitura: { recusa, causa: 'indeterminada' }, imutabilidadeComprovada: true })
        const erro = await executarFotos(argv, deps).then(() => null, (e: Error) => e.message)
        expect(erro).toBe(`a contagem não pode rodar (causa indeterminada): ${recusa.join('; ')}`)
        expect([ch.lerBranch, ch.buscar, ch.gravar.length, ch.criarPasta.length]).toEqual([1, 0, 0, 0])
      }
    })
  }
  it('(d) tudo presente, nenhuma prova na seleção: --contar devolve o aviso exato e o marcador; nada baixado, criado nem gravado', async () => {
    const { deps, ch } = depsFalsas({ leitura: leituraOk([post(1, { provas: [] }), post(2, { provas: [] })], 3), imutabilidadeComprovada: true })
    const r = await executarFotos(ARGV_CONTAR, deps)
    const saida = JSON.parse(r.saida)
    expect(r.modo).toBe('contar')
    expect(saida.aviso).toBe('nenhuma prova nesta seleção (o branch tem 3 no total)')
    expect(saida.marcadorDoSnapshot).toEqual(MARCADOR(3))
    expect(saida.head).toBe('cafe1234cafe1234')
    expect(saida.rotulos).toEqual([...ROTULOS_DO_MANIFESTO])
    expect(saida.clientes[0].exclusoes).toEqual({ 'sem-prova': 2 })
    expect(r.saida).toBe(serializar(JSON.parse(r.saida)))
    expect([ch.lerBranch, ch.buscar, ch.gravar.length, ch.criarPasta.length]).toEqual([1, 0, 0, 0])
  })
  it('com prova na seleção, --contar não traz o aviso e também não baixa nada', async () => {
    const { deps, ch } = depsFalsas({ leitura: leituraOk([post(1)]), imutabilidadeComprovada: true })
    const saida = JSON.parse((await executarFotos(ARGV_CONTAR, deps)).saida)
    expect('aviso' in saida).toBe(false)
    expect(saida.clientes[0].elegiveisTeto).toBe(1)
    expect([ch.buscar, ch.gravar.length, ch.criarPasta.length]).toEqual([0, 0, 0])
  })
  it('sem imutabilidadeComprovada nas deps vale a constante (false): a exportação não baixa nada', async () => {
    const { deps, ch } = depsFalsas({ leitura: leituraOk([post(1), post(2)]) })
    const r = await executarFotos(ARGV_EXPORTAR, deps)
    expect(ch.buscar).toBe(0)
    expect(ch.gravar.map((g) => g.nome)).toEqual(['manifesto.json'])
    expect(JSON.parse(r.saida).clientes[0].exclusoes).toEqual({ 'imutabilidade-nao-comprovada': 2 })
  })
})

describe('T9 determinismo do manifesto completo (executarFotos)', () => {
  afterAll(() => vi.useRealTimers())
  const exportarManifesto = async (posts: PostLido[], agora: string) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(agora))
    try {
      const { deps, ch } = depsFalsas({ leitura: leituraOk(posts), imutabilidadeComprovada: true })
      const r = await executarFotos(ARGV_EXPORTAR, deps)
      return { r, ch }
    } finally {
      vi.useRealTimers()
    }
  }
  it('mesma entrada e entrada embaralhada, em relógios diferentes → manifesto.json byte a byte igual; é a última gravação', async () => {
    const posts = Array.from({ length: 8 }, (_, i) => post(i + 1))
    const a = await exportarManifesto(posts, '2026-10-17T10:00:00Z')
    const b = await exportarManifesto(posts, '2031-01-01T00:00:00Z')
    const c = await exportarManifesto([posts[3], posts[0], ...posts.slice(4).reverse(), posts[2], posts[1]], '2027-06-06T06:06:06Z')
    const hash = (x: Buffer) => createHash('sha256').update(x).digest('hex')
    for (const { ch, r } of [a, b, c]) {
      const ultima = ch.gravar.at(-1)!
      expect(ultima.nome).toBe('manifesto.json')
      expect(ultima.pasta).toBe(PASTA)
      expect(ch.gravar.filter((g) => g.nome === 'manifesto.json')).toHaveLength(1)
      expect(ch.gravar.slice(0, -1).map((g) => g.nome)).toEqual(['1', '2', '3', '4', '5', '6'].map((n) => `cliente-7-${n}.png`))
      expect(ch.criarPasta).toEqual([PASTA])
      expect(ultima.bytes.toString('utf8')).toBe(r.saida)
    }
    const [ma, mb, mc] = [a, b, c].map((x) => x.ch.gravar.at(-1)!.bytes)
    expect(Buffer.compare(mb, ma)).toBe(0)
    expect(Buffer.compare(mc, ma)).toBe(0)
    expect(hash(mb)).toBe(hash(ma))
    expect(hash(mc)).toBe(hash(ma))
    const m = JSON.parse(ma.toString('utf8'))
    expect(Object.keys(m)).toEqual(['args', 'head', 'marcadorDoSnapshot', 'rotulos', 'clientes'])
    expect(m.args).toEqual({ modo: 'exportar', clientes: [7], desde: '2026-10-12T00:00:00.000Z', ate: '2026-10-17T00:00:00.000Z', populacao: 'publicados', candidatos: 6, pasta: PASTA })
    expect(m.head).toBe('cafe1234cafe1234')
    expect(m.marcadorDoSnapshot).toEqual(MARCADOR(3))
    expect(m.rotulos).toEqual([...ROTULOS_DO_MANIFESTO])
    expect(m.clientes[0].exportados.map((e: { postId: string }) => e.postId)).toEqual(['p001', 'p002', 'p003', 'p004', 'p005', 'p006'])
    // nenhum campo de relógio: nenhuma data do "agora" simulado aparece, nem chave com nome de instante
    const texto = ma.toString('utf8')
    for (const ano of ['2027', '2031']) expect(texto).not.toContain(ano)
    expect(texto).not.toMatch(/"(geradoEm|gerado_em|timestamp|agora|now|executadoEm|data)"\s*:/i)
    expect(a.r.resumo).toEqual(['cliente 7: 6 exportado(s); 6 elegível(is) conferido(s) de 8 preliminar(es)'])
  })
})

// ── T2 destino ─────────────────────────────────────────────────────────────────────────────────────────────────────
describe('T2 recusaDoDestino (realpath real em diretórios temporários)', () => {
  let tmp: string, repo: string, fora: string
  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'p1-destino-'))
    repo = path.join(tmp, 'repo')
    fora = path.join(tmp, 'fora')
    for (const d of ['src', 'docs', 'human-output', '../fora', '../repo-irmao']) fs.mkdirSync(path.join(repo, d), { recursive: true })
    fs.symlinkSync(path.join(repo, 'src'), path.join(fora, 'link-para-src'))
    fs.symlinkSync(path.join(repo, 'src'), path.join(repo, 'human-output', 'link-para-src'))
  })
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))
  const r = (p: string) => recusaDoDestino(p, repo, fs.realpathSync)

  it('recusa src/, docs/ e a raiz, com o caminho relativo no motivo', () => {
    expect(r(path.join(repo, 'src'))).toBe('destino dentro do repositório (src): use uma pasta fora dele ou em human-output/')
    expect(r(path.join(repo, 'docs', 'x'))).toBe(`destino dentro do repositório (${path.join('docs', 'x')}): use uma pasta fora dele ou em human-output/`)
    expect(r(repo)).toBe('destino dentro do repositório (.): use uma pasta fora dele ou em human-output/')
  })
  it('recusa ../<repo>/src por caminho relativo e o truque human-output/../src', () => {
    const relativo = path.relative(process.cwd(), path.join(repo, 'src'))
    expect(relativo.startsWith('..')).toBe(true)
    expect(r(relativo)).toMatch(/^destino dentro do repositório \(src\)/)
    expect(r(path.join(repo, 'human-output') + '/../src')).toMatch(/^destino dentro do repositório \(src\)/)
  })
  it('recusa symlink de fora apontando para dentro, inclusive com subpasta inexistente', () => {
    expect(r(path.join(fora, 'link-para-src'))).toMatch(/^destino dentro do repositório \(src\)/)
    expect(r(path.join(fora, 'link-para-src', 'nao', 'existe'))).toMatch(/^destino dentro do repositório \(src.nao.existe\)/)
    expect(r(path.join(repo, 'human-output', 'link-para-src', 'x'))).toMatch(/^destino dentro do repositório \(src.x\)/)
  })
  it('recusa pasta inexistente sob o repo (o ancestral existente resolve)', () => {
    expect(r(path.join(repo, 'nova', 'pasta'))).toMatch(/^destino dentro do repositório \(nova.pasta\)/)
  })
  it('aceita human-output/ (e subpasta inexistente nela) e pastas fora, inclusive o irmão de nome parecido', () => {
    expect(r(path.join(repo, 'human-output', 'x'))).toBeNull()
    expect(r(path.join(repo, 'human-output'))).toBeNull()
    expect(r(fora)).toBeNull()
    expect(r(path.join(fora, 'nao-existe', 'ainda'))).toBeNull()
    expect(r(path.join(tmp, 'repo-irmao', 'x'))).toBeNull()
  })
})

// ── T3 E1–E3 ───────────────────────────────────────────────────────────────────────────────────────────────────────
describe('T3 E1–E3', () => {
  const STATUS = ['POSTED', 'SCHEDULED', 'DRAFT', 'FAILED', 'POSTING', 'CANCELLED']
  it('cada status nas duas populações: só POSTED em publicados, só SCHEDULED em agendados, nunca nas duas', () => {
    for (const status of STATUS) {
      const p = post(1, { status, scheduledDatetime: new Date(BASE - 60_000) })
      const pub = motivo(avaliar(p))
      const ag = motivo(avaliar(p, { populacao: 'agendados' }))
      expect(pub, status).toBe(status === 'POSTED' ? 'elegivel' : `status-fora:${status}`)
      expect(ag, status).toBe(status === 'SCHEDULED' ? 'elegivel' : `status-fora:${status}`)
      expect(pub === 'elegivel' && ag === 'elegivel').toBe(false)
    }
  })
  it('latePublishedAt vence sentAt; só sentAt usa sentAt; ambos nulos → sem-data-de-referencia', () => {
    const late = new Date(BASE - 60_000), sent = new Date(BASE - 30_000)
    const a = avaliar(post(1, { latePublishedAt: late, sentAt: sent }))
    expect('elegivel' in a && [a.elegivel.campoDaData, a.elegivel.dataDeReferencia]).toEqual(['latePublishedAt', late.toISOString()])
    const b = avaliar(post(1, { latePublishedAt: null, sentAt: sent }))
    expect('elegivel' in b && [b.elegivel.campoDaData, b.elegivel.dataDeReferencia]).toEqual(['sentAt', sent.toISOString()])
    expect(motivo(avaliar(post(1, { latePublishedAt: null, sentAt: null })))).toBe('sem-data-de-referencia')
  })
  it('limites: desde entra, ate sai, antes de desde sai', () => {
    const noLimite = (d: Date) => {
      const p = post(1, { latePublishedAt: d })
      p.provas[0].createdAt = new Date(d.getTime() - 1)
      return motivo(avaliar(p))
    }
    expect(noLimite(OPC.desde)).toBe('elegivel')
    expect(noLimite(OPC.ate)).toBe('fora-da-janela')
    expect(noLimite(new Date(OPC.desde.getTime() - 1))).toBe('fora-da-janela')
    expect(noLimite(new Date(OPC.ate.getTime() - 1))).toBe('elegivel')
  })
  it('agendados usam scheduledDatetime; sem ele → sem-data-de-referencia', () => {
    const s = new Date(BASE - 60_000)
    const a = avaliar(post(1, { status: 'SCHEDULED', scheduledDatetime: s }), { populacao: 'agendados' })
    expect('elegivel' in a && a.elegivel.campoDaData).toBe('scheduledDatetime')
    expect(motivo(avaliar(post(1, { status: 'SCHEDULED' }), { populacao: 'agendados' }))).toBe('sem-data-de-referencia')
  })
  it('scheduledDatetime nulo num POSTED elegível', () => expect(motivo(avaliar(post(1, { scheduledDatetime: null })))).toBe('elegivel'))
  it('mediaUrls [] e 2 → midia-multipla-ou-vazia; pageId null → midia-direta-sem-pagina', () => {
    expect(motivo(avaliar(post(1, { mediaUrls: [] })))).toBe('midia-multipla-ou-vazia')
    expect(motivo(avaliar(post(1, { mediaUrls: [MIDIA(1), MIDIA(2)] })))).toBe('midia-multipla-ou-vazia')
    expect(motivo(avaliar(post(1, { pageId: null })))).toBe('midia-direta-sem-pagina')
  })
  it('registra os campos do § 3.3 no elegível', () => {
    const a = avaliar(post(1))
    expect('elegivel' in a && a.elegivel).toMatchObject({
      postId: 'p001', status: 'POSTED', pageId: 'pg-1', mediaUrl: MIDIA(1), proofVersion: 1, fileUrl: FOTO(1),
      cropPosition: 'ausente', classe: 'upload', indicioDeTransformacao: 'nenhuma conhecida', formato: 'story', camadasAcimaDoFundo: 0,
    })
  })
})

// ── T4 / T4b / T4c ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('T4 E4 / E4b', () => {
  const pr = (mediaUrl: string, extra: Partial<PostLido['provas'][number]> = {}) => ({
    mediaUrl, proofVersion: 1 as unknown, createdAt: new Date(BASE - 10 * 60_000), layersSnapshot: [fundo()], ...extra,
  })
  it('sem prova; prova de outra URL; duas provas com uma que casa; query diferente', () => {
    expect(motivo(avaliar(post(1, { provas: [] })))).toBe('sem-prova')
    expect(motivo(avaliar(post(1, { provas: [pr(MIDIA(2))] })))).toBe('prova-de-outra-midia')
    expect(motivo(avaliar(post(1, { provas: [pr(MIDIA(2)), pr(MIDIA(1))] })))).toBe('elegivel')
    expect(motivo(avaliar(post(1, { provas: [pr(`${MIDIA(1)}?v=2`)] })))).toBe('prova-de-outra-midia')
    expect(motivo(avaliar(post(1, { mediaUrls: [`${MIDIA(1)}?v=2`], provas: [pr(MIDIA(1))] })))).toBe('prova-de-outra-midia')
  })
  it('prova depois da publicação → prova-posterior-a-publicacao; igual à publicação entra; sem createdAt → prova-sem-data', () => {
    const pub = new Date(BASE - 60_000)
    expect(motivo(avaliar(post(1, { latePublishedAt: pub, provas: [pr(MIDIA(1), { createdAt: new Date(pub.getTime() + 1) })] })))).toBe('prova-posterior-a-publicacao')
    expect(motivo(avaliar(post(1, { latePublishedAt: pub, provas: [pr(MIDIA(1), { createdAt: pub })] })))).toBe('elegivel')
    expect(motivo(avaliar(post(1, { latePublishedAt: pub, provas: [pr(MIDIA(1), { createdAt: null })] })))).toBe('prova-sem-data')
  })
  it('T4b: mídia trocada B→A localmente casa a prova de A (limite dito no rótulo do manifesto)', () => {
    const a = avaliar(post(1, { mediaUrls: [MIDIA(1)], provas: [pr(MIDIA(1)), pr(MIDIA(2))] }))
    expect(motivo(a)).toBe('elegivel')
    expect(ROTULOS_DO_MANIFESTO).toContain('mídia registrada no banco, não conferida contra o publicador')
    expect(ROTULOS_DO_MANIFESTO).toContain('fundo referenciado no render, não anulado (oclusão por camada acima NÃO medida)')
  })
  it('agendados: sem condição temporal (prova posterior ao agendamento entra)', () => {
    const s = new Date(BASE - 60 * 60_000)
    const p = post(1, { status: 'SCHEDULED', latePublishedAt: null, scheduledDatetime: s, provas: [pr(MIDIA(1), { createdAt: new Date(BASE) })] })
    expect(motivo(avaliar(p, { populacao: 'agendados' }))).toBe('elegivel')
  })
  it('prova com createdAt nulo → prova-sem-data nas DUAS populações (sem derrubar a avaliação)', () => {
    const ag = post(1, { status: 'SCHEDULED', scheduledDatetime: new Date(BASE - 60_000), provas: [pr(MIDIA(1), { createdAt: null })] })
    expect(motivo(avaliar(ag, { populacao: 'agendados' }))).toBe('prova-sem-data')
    expect(motivo(avaliar(post(1, { provas: [pr(MIDIA(1), { createdAt: null })] })))).toBe('prova-sem-data')
    // a prova sem data vem antes de E4b: versão desconhecida não mascara o motivo
    expect(motivo(avaliar(post(1, { provas: [pr(MIDIA(1), { createdAt: null, proofVersion: 2 })] })))).toBe('prova-sem-data')
  })
  it('T4c: proofVersion 1 entra; 2, 0, ausente e "1" string → versao-da-prova-desconhecida', () => {
    expect(motivo(avaliar(post(1, { provas: [pr(MIDIA(1), { proofVersion: 1 })] })))).toBe('elegivel')
    for (const v of [2, 0, undefined, '1', null, 1.5]) {
      expect(motivo(avaliar(post(1, { provas: [pr(MIDIA(1), { proofVersion: v })] }))), String(v)).toBe('versao-da-prova-desconhecida')
    }
  })
})

// ── T5 E5 ──────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('T5 E5 lerSnapshot', () => {
  const arr = [fundo()]
  it('array e string JSON de array são lidos', () => {
    expect(lerSnapshot(arr)).toEqual(arr)
    expect(lerSnapshot(JSON.stringify(arr))).toEqual(arr)
    expect(comCamadas(JSON.stringify(arr))).toBe('elegivel')
  })
  it('dupla codificação, objeto, JSON inválido, null e array com não-objeto → null / snapshot-ilegivel', () => {
    for (const v of [JSON.stringify(JSON.stringify(arr)), { 0: fundo() }, '{nao json', null, undefined, [fundo(), 1], [[fundo()]], [null], 'null', 42]) {
      expect(lerSnapshot(v), JSON.stringify(v) ?? 'undefined').toBeNull()
      expect(comCamadas(v)).toBe('snapshot-ilegivel')
    }
  })
})

// ── T6 E6 / E6b ────────────────────────────────────────────────────────────────────────────────────────────────────
describe('T6 E6 / E6b avaliarFundo', () => {
  const m = (camadas: Camada[]) => {
    const r = avaliarFundo(camadas)
    return 'motivo' in r ? r.motivo : 'ok'
  }
  const st = (style: Record<string, unknown>) => m([fundo({ style })])
  const img = { id: 'img-1', type: 'image', fileUrl: FOTO(9), position: { x: 0, y: 0 }, size: { width: 100, height: 100 } }

  it('0 e 2 bg-foto; outras imagens sem bg-foto não caem em imagens[0]', () => {
    expect(m([])).toBe('fundo-ausente')
    expect(m([img])).toBe('fundo-ausente')
    expect(m([fundo(), fundo()])).toBe('fundo-duplicado')
  })
  it('type shape; data:; http:', () => {
    expect(m([fundo({ type: 'shape' })])).toBe('fundo-nao-imagem')
    expect(m([fundo({ fileUrl: 'data:image/png;base64,AAAA' })])).toBe('fundo-nao-https')
    expect(m([fundo({ fileUrl: FOTO(1).replace('https:', 'http:') })])).toBe('fundo-nao-https')
  })
  it('oculta', () => expect(m([fundo({ visible: false })])).toBe('fundo-invisivel:oculto'))
  it('opacity 0, −1, NaN, "0" e 0,01', () => {
    expect(st({ opacity: 0 })).toBe('fundo-invisivel:opacidade-0')
    expect(st({ opacity: -1 })).toBe('fundo-invisivel:opacidade-0')
    expect(st({ opacity: NaN })).toBe('fundo-nao-avaliavel:transformacao-desconhecida')
    expect(st({ opacity: '0' })).toBe('fundo-nao-avaliavel:transformacao-desconhecida')
    expect(st({ opacity: 0.01 })).toBe('ok')
  })
  it('size 0×N; caixa inteira fora; parcial dentro', () => {
    expect(m([fundo({ size: { width: 0, height: 500 } })])).toBe('fundo-invisivel:sem-area')
    expect(m([fundo({ size: { width: 500, height: 0 } })])).toBe('fundo-invisivel:sem-area')
    expect(m([fundo({ position: { x: 1080, y: 0 } })])).toBe('fundo-invisivel:fora-do-canvas')
    expect(m([fundo({ position: { x: 0, y: -1920 } })])).toBe('fundo-invisivel:fora-do-canvas')
    expect(m([fundo({ position: { x: 1000, y: 1800 } })])).toBe('ok')
  })
  it('rotation 45 → rotacao; 0 explícito entra', () => {
    expect(m([fundo({ rotation: 45, position: { x: 900, y: 0 }, size: { width: 180, height: 180 } })])).toBe('fundo-nao-avaliavel:rotacao')
    expect(m([fundo({ rotation: 0 })])).toBe('ok')
  })
  it('style.mask, filter opacity(0) com opacity 1, filter none, brightness → style-fora-da-lista; style vazio entra', () => {
    expect(st({ mask: { type: 'circle' } })).toBe('fundo-nao-avaliavel:style-fora-da-lista')
    expect(st({ opacity: 1, filter: 'opacity(0)' })).toBe('fundo-nao-avaliavel:style-fora-da-lista')
    expect(st({ filter: 'none' })).toBe('fundo-nao-avaliavel:style-fora-da-lista')
    expect(st({ brightness: 0.5 })).toBe('fundo-nao-avaliavel:style-fora-da-lista')
    expect(st({})).toBe('ok')
    expect(st({ opacity: 1, objectFit: 'cover', cropPosition: 'center', flipH: false, flipV: true })).toBe('ok')
  })
  it('chave de camada desconhecida → transformacao-desconhecida', () => {
    expect(m([fundo({ crop: { x: 0 } })])).toBe('fundo-nao-avaliavel:transformacao-desconhecida')
    expect(m([fundo({ effects: {} })])).toBe('fundo-nao-avaliavel:transformacao-desconhecida')
  })
  it('camada opaca acima: elegível, com camadasAcimaDoFundo registrado; abaixo, oculta ou fora não contam', () => {
    const cobre = { id: 'tampa', type: 'shape', position: { x: 0, y: 0 }, size: { width: 1080, height: 1920 }, style: { opacity: 1 } }
    const fora = { ...cobre, id: 'fora', position: { x: 2000, y: 0 } }
    const oculta = { ...cobre, id: 'oculta', visible: false }
    const a = avaliar(post(1, {}, [cobre, fundo(), cobre, fora, oculta]))
    expect(motivo(a)).toBe('elegivel')
    expect('elegivel' in a && a.elegivel.camadasAcimaDoFundo).toBe(1)
    const b = avaliar(post(1, {}, [{ ...cobre, order: 5 }, fundo({ order: 1 })]))
    expect('elegivel' in b && b.elegivel.camadasAcimaDoFundo).toBe(1)
  })
  it('cropPosition presente é registrado; ausente vira "ausente" (nunca padrão)', () => {
    const a = avaliar(post(1, {}, [fundo({ style: { cropPosition: 'top' } })]))
    expect('elegivel' in a && a.elegivel.cropPosition).toBe('top')
  })
})

// ── T7 E7 ──────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('T7 E7 recusaDoHost', () => {
  const h = STORES_DO_STUDIO[0]
  it('o store listado é autorizado, também em maiúsculas', () => {
    expect(recusaDoHost(`https://${h}/uploads/x.jpg`)).toBeNull()
    expect(recusaDoHost(`https://${h.toUpperCase()}/uploads/x.jpg`)).toBeNull()
  })
  it('outros hosts: igualdade exata, nunca sufixo nem includes', () => {
    for (const u of [
      'https://abcdefghijklmnop.public.blob.vercel-storage.com/uploads/x.jpg',
      'https://sqc9qfyearji7bel.public.blob.vercel-storage.com/uploads/x.jpg',
      'https://a.b.public.blob.vercel-storage.com/x.jpg',
      `https://a.${h}/x.jpg`,
      'https://public.blob.vercel-storage.com.evil.com/x.jpg',
      `https://${h}.evil.com/x.jpg`,
      `https://evil.com/?x=.public.blob.vercel-storage.com`,
      `https://evil.com/${h}/x.jpg`,
      'https://lh3.googleusercontent.com/abc',
      'https://x.supabase.co/storage/v1/object/public/x.jpg',
    ]) {
      expect(recusaDoHost(u), u).toBe('host-fora-da-lista')
    }
  })
  it('credencial, porta (inclusive :443 e : vazio), http e URL inválida', () => {
    expect(recusaDoHost(`https://user@${h}/x.jpg`)).toBe('credencial-na-url')
    expect(recusaDoHost(`https://user:senha@${h}/x.jpg`)).toBe('credencial-na-url')
    expect(recusaDoHost(`https://${h}:8443/x.jpg`)).toBe('porta-explicita')
    expect(recusaDoHost(`https://${h}:443/x.jpg`)).toBe('porta-explicita')
    expect(recusaDoHost(`https://${h}:/x.jpg`)).toBe('porta-explicita')
    expect(recusaDoHost(`http://${h}/x.jpg`)).toBe('protocolo-nao-https')
    expect(recusaDoHost('nao-e-url')).toBe('protocolo-nao-https')
  })
  it('fora do ASCII visível (TAB, espaço, quebra de linha, unicode cru) ou com \\ → url-nao-canonica; %20 codificado passa', () => {
    for (const u of [`ht\ttps://${h}:443/a`, ` https://${h}/a`, `https://${h}/a b.png`, `https://${h}/a\n`, `https://${h}/fot\u00f3.png`, `https://${h}\\a`, `https://${h.replace('.', '\t.')}/a`, 'não é url']) {
      expect(recusaDoHost(u), JSON.stringify(u)).toBe('url-nao-canonica')
    }
    expect(recusaDoHost(`https://${h}/a%20b.png`)).toBeNull()
    for (const loc of [`/\t/${h}:443/a`, `\\\\${h}/a`, ` //${h}/a`, '/a b.png', `ht\ttps://${h}:443/a`]) {
      expect(recusaDoLocation(loc), JSON.stringify(loc)).toBe('url-nao-canonica')
    }
    expect(recusaDoLocation('/a%20b.png')).toBeNull()
    expect(recusaDoHost(`//${h}/x.jpg`)).toBe('protocolo-nao-https')
  })
  it('forma não canônica no TEXTO (o parser a normalizaria) → url-nao-canonica', () => {
    expect(recusaDoHost(`https:////${h}/a`)).toBe('url-nao-canonica')
    expect(recusaDoHost(`https:////${h}:443/a`)).toBe('url-nao-canonica')
    expect(recusaDoHost(`https://${h}\\a`)).toBe('url-nao-canonica')
    expect(recusaDoHost(`https://${h}\\..\\a`)).toBe('url-nao-canonica')
    expect(recusaDoHost(`https://${h}`)).toBeNull()
    expect(recusaDoHost(`https://${h}?a=1`)).toBeNull()
  })
  it('via avaliarPost: host alheio → host-nao-autorizado; posts/rendered/ → fundo-e-render', () => {
    expect(comCamadas([fundo({ fileUrl: 'https://lh3.googleusercontent.com/abc' })])).toBe('host-nao-autorizado')
    expect(comCamadas([fundo({ fileUrl: `https://${h}:443/uploads/x.jpg` })])).toBe('host-nao-autorizado')
    const a = avaliar(post(1, {}, [fundo({ fileUrl: `${STORE}/posts/rendered/outro-1.png` })]))
    expect(a).toEqual({ exclusao: 'fundo-e-render', classe: 'render' })
  })
})

// ── T8 classe de origem ────────────────────────────────────────────────────────────────────────────────────────────
describe('T8 classeDeOrigem / caminhoDoObjeto', () => {
  const c = (p: string) => classeDeOrigem(`${STORE}/${p}`)
  it('cada prefixo da tabela 3.4', () => {
    expect(c('uploads/u1/drive-x.jpg')).toBe('upload')
    expect(c('chat-uploads/12/token.jpg')).toBe('chat-reduzida')
    expect(c('drive-cache/12/x-s1920.jpg')).toBe('drive-miniatura')
    expect(c('posts/u1/google-drive/1760000000000-nome.jpg')).toBe('drive-download')
    expect(c('posts/u1/ai-images/x.png')).toBe('ia-download')
    expect(c('posts/rendered/p-1.png')).toBe('render')
    expect(c('posts/u1/normalized/x.jpg')).toBe('normalizada')
  })
  it('prefixo novo, posts/… fora da tabela e pathname curto → desconhecida', () => {
    for (const p of ['compor/lagosta-setembro/x.jpg', 'templates/thumbnails/1.png', 'posts/u1/outro/x.jpg', 'posts/u1/google-drive', 'novo-prefixo/x.jpg', 'x.jpg', '']) {
      expect(c(p), p).toBe('desconhecida')
    }
  })
  it('maiúsculas e query não mudam a classe', () => {
    expect(c('UPLOADS/U1/X.JPG')).toBe('upload')
    expect(c('Posts/Rendered/P.PNG')).toBe('render')
    expect(c('uploads/u1/x.jpg?pathname=posts/rendered/x.png')).toBe('upload')
    expect(caminhoDoObjeto(`${STORE}/UPLOADS/X.JPG?a=1#f`)).toBe('uploads/x.jpg')
  })
  it('.. e %2e%2e: o parser resolve o caminho (não contrabandeia prefixo); ..%2f codificado → null / desconhecida', () => {
    expect(c('uploads/%2e%2e/posts/rendered/x.png')).toBe('render')
    expect(c('uploads/../posts/rendered/x.png')).toBe('render')
    expect(c('posts/rendered/../../uploads/x.jpg')).toBe('upload')
    expect(caminhoDoObjeto(`${STORE}/uploads/..%2fposts/rendered/x.png`)).toBeNull()
    expect(c('uploads/..%2fposts/rendered/x.png')).toBe('desconhecida')
    expect(c('uploads/%2e%2e%2fx.png')).toBe('desconhecida')
    expect(caminhoDoObjeto('não é url')).toBeNull()
  })
  it('os dois fluxos de posts/<x>/google-drive/ e um konva-export com esse prefixo dão a mesma classe', () => {
    const urls = ['posts/u1/google-drive/1760000000000-foto.jpg', 'posts/u2/google-drive/1760000000001-foto-4x5.jpg', 'posts/u1/google-drive/escolhido-pelo-corpo-AbC123.jpg']
    expect(new Set(urls.map(c))).toEqual(new Set(['drive-download']))
  })
  it('INDICIO_DE_TRANSFORMACAO nunca afirma comprovada/preservada/original', () => {
    for (const [k, v] of Object.entries(INDICIO_DE_TRANSFORMACAO)) expect(v, k).not.toMatch(/comprovad|preservad|original/i)
  })
})

// ── T9 E9 e ordem ──────────────────────────────────────────────────────────────────────────────────────────────────
describe('T9 E9 e ordem', () => {
  it('avaliarPost não aplica E9: o mesmo fundo em dois posts sai elegível nos dois', () => {
    expect(comCamadas([fundo({ fileUrl: FOTO(1) })])).toBe('elegivel')
    expect(motivo(avaliar(post(2, {}, [fundo({ fileUrl: `${FOTO(1)}?v=2` })])))).toBe('elegivel')
  })
  it('contarCliente: mesma URL com query diferente → arquivo-repetido; o mais recente fica', () => {
    const posts = [post(2, {}, [fundo({ fileUrl: `${FOTO(1)}?v=2` })]), post(1, {}, [fundo({ fileUrl: FOTO(1) })]), post(3)]
    const r = contarCliente(7, posts, OPC)
    expect(r.elegiveisTeto).toBe(2)
    expect(r.exclusoes).toEqual({ 'arquivo-repetido': 1 })
  })
  it('E9 normaliza o host: o mesmo objeto com host em maiúsculas → arquivo-repetido (contagem e exportação)', async () => {
    const maiusculo = FOTO(1).replace(STORES_DO_STUDIO[0], STORES_DO_STUDIO[0].toUpperCase())
    expect(maiusculo).not.toBe(FOTO(1))
    expect(chaveDoArquivo(maiusculo)).toBe(chaveDoArquivo(`${FOTO(1)}?v=3#x`))
    expect(chaveDoArquivo(FOTO(1).replace('drive-foto', 'DRIVE-FOTO'))).not.toBe(chaveDoArquivo(FOTO(1)))
    const posts = [post(1, {}, [fundo({ fileUrl: FOTO(1) })]), post(2, {}, [fundo({ fileUrl: maiusculo })])]
    const c = contarCliente(7, posts, OPC)
    expect([c.elegiveisTeto, c.exclusoes]).toEqual([1, { 'arquivo-repetido': 1 }])
    const { r } = await exportar(posts)
    expect(r.exportados.map((e) => e.postId)).toEqual(['p001'])
    expect([r.elegiveisPreliminares, r.elegiveis, r.exclusoes]).toEqual([2, 1, { 'arquivo-repetido': 1 }])
  })
  it('exportarCliente: o repetido de um EXPORTADO é arquivo-repetido e não é baixado', async () => {
    const posts = [post(1, {}, [fundo({ fileUrl: FOTO(1) })]), post(2, {}, [fundo({ fileUrl: `${FOTO(1)}?v=2` })])]
    const { r, loja } = await exportar(posts)
    expect(r.exportados.map((e) => e.postId)).toEqual(['p001'])
    expect(r.exclusoes['arquivo-repetido']).toBe(1)
    expect([r.elegiveisPreliminares, r.tentados, r.elegiveis]).toEqual([2, 2, 1])
    expect(loja.chamadas.filter((c) => c.url.startsWith(FOTO(1))).length).toBe(1)
  })
  it('exportarCliente: se a 1ª peça com o fundo X falha (canvas ou download), a 2ª com X é tentada', async () => {
    const posts = [post(1, {}, [fundo({ fileUrl: FOTO(1) })]), post(2, {}, [fundo({ fileUrl: FOTO(1) })]), post(3, {}, [fundo({ fileUrl: FOTO(1) })])]
    const { r } = await exportar(posts, {}, lojaFalsa({ canvasFalha: new Set([MIDIA(1)]) }))
    expect(r.exportados.map((e) => e.postId)).toEqual(['p002'])
    expect(r.exclusoes).toEqual({ 'fundo-nao-avaliavel:canvas-nao-comprovado:http-403': 1, 'arquivo-repetido': 1 })
    expect([r.elegiveisPreliminares, r.tentados, r.elegiveis]).toEqual([3, 3, 1])
  })
  it('empate da data de referência é desempatado por id ASC', async () => {
    const d = new Date(BASE - 60_000)
    const mk = (id: string, n: number) => ({ ...post(n, { latePublishedAt: d }), id })
    const posts = [mk('c', 3), mk('a', 1), mk('b', 2)]
    for (const p of posts) p.provas[0].createdAt = new Date(d.getTime() - 1)
    const { r } = await exportar(posts)
    expect(r.exportados.map((e) => e.postId)).toEqual(['a', 'b', 'c'])
  })
  it('mesma entrada → resultado JSON byte a byte igual (também com a entrada embaralhada)', async () => {
    const posts = Array.from({ length: 8 }, (_, i) => post(i + 1))
    const um = JSON.stringify((await exportar(posts, { candidatos: 6 })).r)
    const dois = JSON.stringify((await exportar(posts, { candidatos: 6 })).r)
    const embaralhado = JSON.stringify((await exportar([...posts].reverse(), { candidatos: 6 })).r)
    const hash = (s: string) => createHash('sha256').update(s).digest('hex')
    expect(dois).toBe(um)
    expect(hash(dois)).toBe(hash(um))
    expect(hash(embaralhado)).toBe(hash(um))
  })
})

// ── Contagem (§ 3.5) ───────────────────────────────────────────────────────────────────────────────────────────────
describe('contarCliente', () => {
  it('conta elegíveis-teto com o rótulo, exclusões, classes (inclusive excluídas por E8/E8b) e cropPosition', () => {
    const posts = [
      post(1),
      post(2, {}, [fundo({ fileUrl: `${STORE}/posts/u1/google-drive/1-x.jpg`, style: { cropPosition: 'top' } })]),
      post(3, {}, [fundo({ fileUrl: `${STORE}/drive-cache/12/x-s1920.jpg` })]),
      post(4, {}, [fundo({ fileUrl: `${STORE}/posts/rendered/arte.png` })]),
      post(5, { provas: [] }),
    ]
    const r = contarCliente(7, posts, OPC)
    expect(r.exclusoes).toEqual({ 'origem-sobrescrevivel': 1, 'fundo-e-render': 1, 'sem-prova': 1 })
    expect(r).toMatchObject({
      cliente: 7, lidos: 5, elegiveisTeto: 2, rotuloDosElegiveis: 'canvas não comprovado: teto',
      classesQueChegaramAOrigem: { upload: 1, 'drive-download': 1, 'drive-miniatura': 1, render: 1 },
      elegiveisPorClasse: { upload: 1, 'drive-download': 1 },
      cropPosition: { ausente: 1, presente: 1 },
      midiaRegistradaEmNormalized: 0,
    })
  })
  it('mídia registrada em normalized/ é contada', () => {
    const m = `${STORE}/posts/u1/normalized/x.jpg`
    const p = post(1, { mediaUrls: [m] })
    p.provas[0].mediaUrl = m
    expect(contarCliente(7, [p], OPC).midiaRegistradaEmNormalized).toBe(1)
  })
  it('com a imutabilidade falsa, zero elegíveis', () => {
    const r = contarCliente(7, [post(1), post(2)], { ...OPC, imutabilidadeComprovada: false })
    expect(r.elegiveisTeto).toBe(0)
    expect(r.exclusoes).toEqual({ 'imutabilidade-nao-comprovada': 2 })
  })
})

// ── T12 download ───────────────────────────────────────────────────────────────────────────────────────────────────
describe('T12 baixarComGuarda', () => {
  const URL_OK = FOTO(1)
  const um = (r: Response | (() => Response)): Buscar => async () => (typeof r === 'function' ? r() : r)
  it('403 → http-403', async () => expect(await baixarComGuarda(URL_OK, um(resposta('x', 403)))).toEqual({ ok: false, falha: 'http-403' }))
  it('prazo esgotado (Buscar que só termina no abort)', async () => {
    const buscar: Buscar = (_u, init) => new Promise((_r, rej) => init.signal.addEventListener('abort', () => rej(new Error('abortado'))))
    expect(await baixarComGuarda(URL_OK, buscar, { prazoMs: 30 })).toEqual({ ok: false, falha: 'prazo-esgotado' })
  })
  it('erro de rede → erro-de-rede', async () => {
    const buscar: Buscar = async () => {
      throw new Error('ECONNRESET')
    }
    expect(await baixarComGuarda(URL_OK, buscar)).toEqual({ ok: false, falha: 'erro-de-rede' })
  })
  it('text/html 200 → content-type-nao-imagem', async () => {
    expect(await baixarComGuarda(URL_OK, um(resposta('<html>', 200, { 'content-type': 'text/html' })))).toEqual({ ok: false, falha: 'content-type-nao-imagem' })
  })
  it('30 MB em stream sem content-length → acima-do-teto, sem ler tudo', async () => {
    let puxados = 0
    const corpo = new ReadableStream<Uint8Array>({
      pull(c) {
        if (puxados >= 30) return c.close()
        puxados++
        c.enqueue(new Uint8Array(1024 * 1024))
      },
    })
    const res = new Response(corpo, { status: 200, headers: { 'content-type': 'image/png' } })
    expect(res.headers.get('content-length')).toBeNull()
    expect(await baixarComGuarda(URL_OK, um(res))).toEqual({ ok: false, falha: 'acima-do-teto' })
    expect(puxados).toBeLessThan(30)
  })
  it('redirecionamento para host autorizado (absoluto e relativo) segue; 3 saltos ok; 4 → redirecionamentos-demais', async () => {
    const cadeia = (n: number, location: (i: number) => string) => {
      const chamadas: string[] = []
      const buscar: Buscar = async (url) => {
        chamadas.push(url)
        return chamadas.length <= n ? resposta(null, 302, { location: location(chamadas.length) }) : resposta(PNG_REAL)
      }
      return { buscar, chamadas }
    }
    const abs = cadeia(1, () => FOTO(2))
    expect(await baixarComGuarda(URL_OK, abs.buscar)).toMatchObject({ ok: true })
    expect(abs.chamadas).toEqual([URL_OK, FOTO(2)])
    const rel = cadeia(1, () => '/uploads/u1/outra.jpg')
    expect(await baixarComGuarda(URL_OK, rel.buscar)).toMatchObject({ ok: true })
    expect(rel.chamadas[1]).toBe(`${STORE}/uploads/u1/outra.jpg`)
    expect(await baixarComGuarda(URL_OK, cadeia(3, (i) => FOTO(i + 10)).buscar)).toMatchObject({ ok: true })
    const quatro = cadeia(4, (i) => FOTO(i + 10))
    expect(await baixarComGuarda(URL_OK, quatro.buscar)).toEqual({ ok: false, falha: 'redirecionamentos-demais' })
    expect(quatro.chamadas.length).toBe(4)
  })
  it('redirecionamento para host alheio, para http ou sem location', async () => {
    const chamadas: string[] = []
    const alheio: Buscar = async (url) => {
      chamadas.push(url)
      return resposta(null, 307, { location: 'https://evil.com/x.png' })
    }
    expect(await baixarComGuarda(URL_OK, alheio)).toEqual({ ok: false, falha: 'redirecionamento-nao-autorizado' })
    expect(chamadas).toEqual([URL_OK])
    expect(await baixarComGuarda(URL_OK, um(resposta(null, 301, { location: URL_OK.replace('https:', 'http:') })))).toEqual({ ok: false, falha: 'redirecionamento-nao-autorizado' })
    expect(await baixarComGuarda(URL_OK, um(resposta(null, 302, {})))).toEqual({ ok: false, falha: 'redirecionamento-sem-destino' })
  })
  it('Location validado no TEXTO antes de resolver: porta, barras invertidas e // com porta recusados sem 2ª chamada', async () => {
    const h = STORES_DO_STUDIO[0]
    const com = async (location: string) => {
      const chamadas: string[] = []
      const buscar: Buscar = async (url) => {
        chamadas.push(url)
        return chamadas.length === 1 ? resposta(null, 302, { location }) : resposta(PNG_REAL)
      }
      return { r: await baixarComGuarda(URL_OK, buscar), chamadas }
    }
    for (const loc of [`https://${h}:443/a`, `//${h}:443/a`, `\\\\${h}/a`, `/\\${h}/a`, `\\/${h}/a`, `https:////${h}/a`, `https://x@${h}/a`, 'javascript:alert(1)', '/a b.png']) {
      const { r, chamadas } = await com(loc)
      expect(r, loc).toEqual({ ok: false, falha: 'redirecionamento-nao-autorizado' })
      expect(chamadas, loc).toEqual([URL_OK])
    }
    const barras = await com(`//${h}/a`)
    expect(barras.r).toMatchObject({ ok: true })
    expect(barras.chamadas).toEqual([URL_OK, `https://${h}/a`])
    const relativo = await com('/outro.png')
    expect(relativo.r).toMatchObject({ ok: true })
    expect(relativo.chamadas[1]).toBe(`https://${h}/outro.png`)
    expect(recusaDoLocation('/outro.png')).toBeNull()
    expect(recusaDoLocation('outro.png')).toBeNull()
    expect(recusaDoLocation(`//${h}:443/a`)).toBe('porta-explicita')
    expect(recusaDoLocation(`https://${h}:443/a`)).toBe('porta-explicita')
  })
  it('host inicial não autorizado nunca chama o Buscar', async () => {
    let n = 0
    const buscar: Buscar = async () => (n++, resposta(PNG_REAL))
    for (const u of ['https://lh3.googleusercontent.com/x', 'https://evil.com/x', `http://${STORES_DO_STUDIO[0]}/x`]) {
      expect(await baixarComGuarda(u, buscar)).toEqual({ ok: false, falha: 'host-nao-autorizado' })
    }
    expect(n).toBe(0)
  })
  it('manda redirect manual e o signal; 206 sem soCabecalho é falha', async () => {
    let init: Parameters<Buscar>[1] | undefined
    await baixarComGuarda(URL_OK, async (_u, i) => ((init = i), resposta(PNG_REAL)))
    expect(init?.redirect).toBe('manual')
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    expect(init?.headers).toBeUndefined()
    expect(await baixarComGuarda(URL_OK, um(resposta(PNG_REAL, 206)))).toEqual({ ok: false, falha: 'http-206' })
  })
  it('assinaturaDaImagem: PNG/JPEG/WebP mínimos montados à mão; o resto é null', () => {
    expect(assinaturaDaImagem(SIG)).toBe('png')
    expect(assinaturaDaImagem(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpg')
    expect(assinaturaDaImagem(Buffer.from('RIFF\x00\x00\x00\x00WEBPVP8 ', 'latin1'))).toBe('webp')
    expect(assinaturaDaImagem(Buffer.from('RIFF\x00\x00\x00\x00WAVE', 'latin1'))).toBeNull()
    expect(assinaturaDaImagem(Buffer.from('<html>'))).toBeNull()
    expect(assinaturaDaImagem(SIG.subarray(0, 7))).toBeNull()
  })
  it('via exportarCliente: bytes não-imagem com image/png → download-falhou:assinatura-nao-e-imagem; 403 → download-falhou:http-403', async () => {
    const { r, g } = await exportar([post(1)], {}, lojaFalsa({ foto: () => Buffer.from('não sou imagem') }))
    expect(r.exclusoes).toEqual({ 'download-falhou:assinatura-nao-e-imagem': 1 })
    expect(g.gravados).toEqual([])
    const b = await exportar([post(1)], {}, lojaFalsa({ falhas: new Set([FOTO(1)]) }))
    expect(b.r.exclusoes).toEqual({ 'download-falhou:http-403': 1 })
  })
  it('via exportarCliente: OK com SHA-256 certo e extensão pela assinatura (não pelo MIME nem pelo nome)', async () => {
    const fotos: Record<string, Buffer> = { [FOTO(1)]: PNG_REAL, [FOTO(2)]: JPEG_REAL, [FOTO(3)]: WEBP_REAL }
    const { r, g } = await exportar([post(1), post(2), post(3)], {}, lojaFalsa({ foto: (u) => fotos[u], tipoFoto: 'image/jpeg' }))
    expect(r.exportados.map((e) => [e.arquivo, e.formatoLido, e.larguraLida, e.alturaLida, e.contentTypeDeclarado, e.original])).toEqual([
      ['cliente-7-1.png', 'png', 4, 3, 'image/jpeg', 'indisponivel'],
      ['cliente-7-2.jpg', 'jpg', 4, 3, 'image/jpeg', 'indisponivel'],
      ['cliente-7-3.webp', 'webp', 4, 3, 'image/jpeg', 'indisponivel'],
    ])
    for (const e of r.exportados) {
      const bytes = fotos[e.fileUrl]
      expect(e.sha256).toBe(createHash('sha256').update(bytes).digest('hex'))
      expect(e.bytes).toBe(bytes.length)
    }
    expect(g.gravados.map((x) => x.nome)).toEqual(['cliente-7-1.png', 'cliente-7-2.jpg', 'cliente-7-3.webp'])
    expect(Buffer.compare(g.gravados[0].bytes, PNG_REAL)).toBe(0)
  })
  it('via exportarCliente: metadados ilegíveis → download-falhou:metadados-ilegiveis, nada gravado, o próximo entra', async () => {
    const lixoPng = Buffer.concat([SIG, Buffer.from('lixo que não é png de verdade')])
    const { r, g } = await exportar([post(1), post(2)], {}, lojaFalsa({ foto: (u) => (u === FOTO(1) ? lixoPng : PNG_REAL) }))
    expect(r.exclusoes).toEqual({ 'download-falhou:metadados-ilegiveis': 1 })
    expect(r.exportados.map((e) => [e.postId, e.arquivo])).toEqual([['p002', 'cliente-7-1.png']])
    expect(g.gravados.map((x) => x.nome)).toEqual(['cliente-7-1.png'])
  })
})

// ── T13 candidatos / déficit / reposição ───────────────────────────────────────────────────────────────────────────
describe('T13 exportarCliente: candidatos, déficit e reposição', () => {
  const muitos = (n: number) => Array.from({ length: n }, (_, i) => post(i + 1))
  it('3 elegíveis com candidatos 20 → fora da leva, déficit 17', async () => {
    const { r } = await exportar(muitos(3))
    expect([r.elegiveisPreliminares, r.tentados, r.elegiveis, r.exportados.length, r.deficitDeCandidatos, r.foraDaLeva]).toEqual([3, 3, 3, 3, 17, true])
  })
  it('24 elegíveis, 2 falhas → 20 exportados; os 2 reservas seguintes entram na ordem', async () => {
    const falhas = new Set([FOTO(5), FOTO(10)])
    const { r } = await exportar(muitos(24), {}, lojaFalsa({ falhas }))
    const esperados = Array.from({ length: 22 }, (_, i) => i + 1).filter((n) => n !== 5 && n !== 10).map((n) => `p${String(n).padStart(3, '0')}`)
    expect(r.exportados.map((e) => e.postId)).toEqual(esperados)
    expect(r.exportados.map((e) => e.arquivo)).toEqual(esperados.map((_, i) => `cliente-7-${i + 1}.png`))
    expect([r.elegiveisPreliminares, r.tentados, r.elegiveis, r.deficitDeCandidatos, r.foraDaLeva]).toEqual([24, 22, 22, 0, false])
    expect(r.exclusoes).toEqual({ 'download-falhou:http-403': 2 })
  })
  it('7 elegíveis, 2 falhas → 5 exportados, fora da leva, déficit 15', async () => {
    const { r } = await exportar(muitos(7), {}, lojaFalsa({ falhas: new Set([FOTO(1), FOTO(4)]) }))
    expect([r.elegiveisPreliminares, r.tentados, r.elegiveis, r.exportados.length, r.deficitDeCandidatos, r.foraDaLeva]).toEqual([7, 7, 7, 5, 15, true])
    expect(r.exclusoes).toEqual({ 'download-falhou:http-403': 2 })
    expect(r.exportados.map((e) => e.postId)).toEqual(['p002', 'p003', 'p005', 'p006', 'p007'])
  })
  it('imutabilidade falsa → zero exportados e zero chamadas ao Buscar', async () => {
    const loja = lojaFalsa()
    const { r, g } = await exportar(muitos(5), { imutabilidadeComprovada: false }, loja)
    expect([r.elegiveisPreliminares, r.tentados, r.elegiveis, r.exportados.length, r.deficitDeCandidatos, r.foraDaLeva]).toEqual([0, 0, 0, 0, 20, true])
    expect(r.exclusoes).toEqual({ 'imutabilidade-nao-comprovada': 5 })
    expect(loja.chamadas).toEqual([])
    expect(g.gravados).toEqual([])
  })
})

// ── T15 inventário de sobrescrita ──────────────────────────────────────────────────────────────────────────────────
describe('T15 E8b: inventário de allowOverwrite', () => {
  function varrer(dir: string, achados: string[]) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '__tests__') continue
      const p = path.join(dir, e.name)
      if (e.isDirectory()) varrer(p, achados)
      else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(e.name)) {
        // só CÓDIGO: linhas de comentário que citam a opção não são escritores
        const codigo = fs.readFileSync(p, 'utf8').split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
        if (codigo.some((l) => /allowOverwrite\s*:\s*true/.test(l))) achados.push(path.relative(RAIZ, p).split(path.sep).join('/'))
      }
    }
    return achados
  }
  it('todo arquivo de src/ e scripts/ com allowOverwrite: true está no inventário, e vice-versa', () => {
    const achados = [...varrer(path.join(RAIZ, 'src'), []), ...varrer(path.join(RAIZ, 'scripts'), [])].sort()
    const inventario = [...new Set(INVENTARIO_DE_SOBRESCRITA.map((e) => e.arquivo))].sort()
    expect(achados).toEqual(inventario)
  })
  it('o prefixo de cada entrada aparece no fonte do escritor', () => {
    for (const e of INVENTARIO_DE_SOBRESCRITA) expect(fs.readFileSync(path.join(RAIZ, e.arquivo), 'utf8'), e.arquivo).toContain(e.prefixo)
  })
  it('pathname de cada prefixo do inventário → origem-sobrescrevivel (mesmo com a imutabilidade verdadeira)', () => {
    for (const { prefixo } of INVENTARIO_DE_SOBRESCRITA) {
      expect(comCamadas([fundo({ fileUrl: `${STORE}/${prefixo}12/x.jpg` })]), prefixo).toBe('origem-sobrescrevivel')
      expect(comCamadas([fundo({ fileUrl: `${STORE}/${prefixo.toUpperCase()}12/X.JPG` })]), prefixo).toBe('origem-sobrescrevivel')
    }
    expect(comCamadas([fundo({ fileUrl: `${STORE}/compor/lagosta-setembro/x.jpg` })])).toBe('origem-sobrescrevivel')
    // konva-export com fileName = drive-cache/x.jpg (addRandomSuffix acrescenta sufixo ao nome, o prefixo fica)
    expect(comCamadas([fundo({ fileUrl: `${STORE}/drive-cache/x-Ab12Cd34Ef.jpg` })])).toBe('origem-sobrescrevivel')
    expect(comCamadas([fundo({ fileUrl: `${STORE}/uploads/..%2fx.jpg` })])).toBe('origem-sobrescrevivel')
  })
  it('bytes trocados na mesma URL de chat-uploads/ e drive-cache/ → só origem-sobrescrevivel, sem chamar o Buscar (com controle)', async () => {
    const chat = `${STORE}/chat-uploads/12/token-fixo.jpg`
    const cache = `${STORE}/drive-cache/12/foto-s1920.jpg`
    const imutavel = `${STORE}/posts/u1/google-drive/1760000000000-foto.jpg`
    // a "fonte" (o Blob) no momento do render: estes são os bytes que as camadas da prova referenciaram
    const fonte = new Map<string, Buffer>([[chat, PNG_REAL], [cache, PNG_REAL], [imutavel, WEBP_REAL]])
    const lidas: string[] = []
    const buscar: Buscar = async (url) => {
      lidas.push(url)
      if (url.includes('/posts/rendered/')) return resposta(CAB_STORY, 206)
      const b = fonte.get(url)
      return b ? resposta(b, 200, { 'content-type': 'image/png' }) : resposta('nada', 404, { 'content-type': 'text/plain' })
    }
    // depois do render e ANTES do download, os escritores com allowOverwrite trocam os bytes no MESMO pathname
    fonte.set(chat, JPEG_REAL)
    fonte.set(cache, JPEG_REAL)
    expect(Buffer.compare(fonte.get(chat)!, PNG_REAL)).not.toBe(0)

    const posts = [chat, chat, cache, cache].map((u, i) => post(i + 1, {}, [fundo({ fileUrl: u })]))
    const g = gravador()
    const r = await exportarCliente(7, posts, { ...OPC, candidatos: 20 }, { buscar, gravar: g.gravar })
    expect(r.exclusoes).toEqual({ 'origem-sobrescrevivel': 4 })
    expect([lidas.length, r.exportados.length, r.elegiveisPreliminares, r.tentados, r.elegiveis, g.gravados.length]).toEqual([0, 0, 0, 0, 0, 0])
    const c = contarCliente(7, posts, OPC)
    expect([c.exclusoes, c.classesQueChegaramAOrigem, c.elegiveisTeto]).toEqual([{ 'origem-sobrescrevivel': 4 }, { 'chat-reduzida': 2, 'drive-miniatura': 2 }, 0])

    // CONTROLE: a mesma fonte e o mesmo Buscar leem e exportam uma URL de classe imutável — o zero acima não é fonte quebrada
    const controle = gravador()
    const rc = await exportarCliente(7, [post(9, {}, [fundo({ fileUrl: imutavel })])], { ...OPC, candidatos: 20 }, { buscar, gravar: controle.gravar })
    expect(rc.exclusoes).toEqual({})
    expect(rc.exportados.map((e) => [e.classe, e.arquivo, e.sha256])).toEqual([['drive-download', 'cliente-7-1.webp', createHash('sha256').update(WEBP_REAL).digest('hex')]])
    expect(lidas).toEqual([MIDIA(9), imutavel])
    expect(controle.gravados.map((x) => x.nome)).toEqual(['cliente-7-1.webp'])
    // e, lida pelo mesmo Buscar, a URL sobrescrevível devolveria os bytes TROCADOS (o que a exclusão evita exportar)
    const trocado = await baixarComGuarda(chat, buscar)
    expect('bytes' in trocado && createHash('sha256').update(trocado.bytes).digest('hex')).toBe(createHash('sha256').update(JPEG_REAL).digest('hex'))
  })
  it('nota falsa → toda classe fora do inventário e do render é imutabilidade-nao-comprovada; verdadeira → elegível', () => {
    for (const p of ['uploads/u1/x.jpg', 'posts/u1/google-drive/1-x.jpg', 'posts/u1/ai-images/x.png', 'posts/u1/normalized/x.jpg', 'outro/x.jpg']) {
      const camadas = [fundo({ fileUrl: `${STORE}/${p}` })]
      expect(avaliar(post(1, {}, camadas), { imutabilidadeComprovada: false }), p).toEqual({ exclusao: 'imutabilidade-nao-comprovada', classe: classeDeOrigem(`${STORE}/${p}`) })
      expect(comCamadas(camadas), p).toBe('elegivel')
    }
  })
})

// ── T16 canvas ─────────────────────────────────────────────────────────────────────────────────────────────────────
describe('T16 conferirCanvas / lerIhdr', () => {
  it('imutabilidade falsa → canvas-nao-comprovado:imutabilidade sem chamar o Buscar', async () => {
    const loja = lojaFalsa()
    expect(await conferirCanvas(MIDIA(1), loja.buscar, false)).toBe('canvas-nao-comprovado:imutabilidade')
    expect(loja.chamadas).toEqual([])
  })
  it('verdadeira: IHDR 1080×1920 → null, com Range bytes=0-63; 206 e 200 aceitos', async () => {
    const loja = lojaFalsa()
    expect(await conferirCanvas(MIDIA(1), loja.buscar, true)).toBeNull()
    expect(loja.chamadas[0].init.headers).toEqual({ Range: 'bytes=0-63' })
    expect(await conferirCanvas(MIDIA(1), async () => resposta(PNG_STORY_REAL, 200), true)).toBeNull()
  })
  it('1080×1350 → canvas-diferente-do-story (caixa em y 1500 que passaria com 1920)', async () => {
    expect(await conferirCanvas(MIDIA(1), lojaFalsa({ canvas: cabecalhoPng(1080, 1350) }).buscar, true)).toBe('canvas-diferente-do-story')
    const camadas = [fundo({ position: { x: 0, y: 1500 }, size: { width: 1080, height: 300 } })]
    expect('motivo' in avaliarFundo(camadas)).toBe(false)
    const { r } = await exportar([post(1, {}, camadas)], {}, lojaFalsa({ canvas: cabecalhoPng(1080, 1350) }))
    expect(r.exclusoes).toEqual({ 'fundo-nao-avaliavel:canvas-diferente-do-story': 1 })
    expect(r.exportados).toEqual([])
  })
  it('mídia JPEG e IHDR truncado → canvas-nao-comprovado:ihdr', async () => {
    expect(await conferirCanvas(MIDIA(1), async () => resposta(JPEG_REAL, 206, { 'content-type': 'image/jpeg' }), true)).toBe('canvas-nao-comprovado:ihdr')
    expect(await conferirCanvas(MIDIA(1), async () => resposta(CAB_STORY.subarray(0, 20), 206), true)).toBe('canvas-nao-comprovado:ihdr')
    expect(await conferirCanvas(MIDIA(1), async () => resposta(CAB_STORY.subarray(0, 32), 206), true)).toBe('canvas-nao-comprovado:ihdr')
  })
  it('falha de download do canvas sai com o subcódigo', async () => {
    expect(await conferirCanvas(MIDIA(1), async () => resposta('x', 403), true)).toBe('canvas-nao-comprovado:http-403')
  })
  it('lerIhdr valida o chunk completo (comprimento, tipo, dimensões, campos e CRC)', () => {
    expect(lerIhdr(CAB_STORY)).toEqual({ largura: 1080, altura: 1920 })
    expect(lerIhdr(PNG_STORY_REAL.subarray(0, 64))).toEqual({ largura: 1080, altura: 1920 })
    expect(lerIhdr(cabecalhoPng(1080, 1920, { entrelace: 1 }))).toEqual({ largura: 1080, altura: 1920 })
    expect(lerIhdr(cabecalhoPng(1080, 1920, { bitDepth: 16, colorType: 2 }))).toEqual({ largura: 1080, altura: 1920 })
    const invalidos: Array<[string, Buffer]> = [
      ['crc errado', cabecalhoPng(1080, 1920, { crcErrado: true })],
      ['comprimento 12', cabecalhoPng(1080, 1920, { comprimento: 12 })],
      ['largura 0', cabecalhoPng(0, 1920)],
      ['altura 2^31', cabecalhoPng(1080, 2 ** 31)],
      ['bit depth 7', cabecalhoPng(1080, 1920, { bitDepth: 7 })],
      ['color type 5', cabecalhoPng(1080, 1920, { colorType: 5 })],
      ['palette 16 bits', cabecalhoPng(1080, 1920, { bitDepth: 16, colorType: 3 })],
      ['compressão 1', cabecalhoPng(1080, 1920, { compressao: 1 })],
      ['filtro 1', cabecalhoPng(1080, 1920, { filtro: 1 })],
      ['entrelace 2', cabecalhoPng(1080, 1920, { entrelace: 2 })],
      ['truncado', CAB_STORY.subarray(0, 30)],
    ]
    for (const [nome, b] of invalidos) expect(lerIhdr(b), nome).toBeNull()
    const tipo = Buffer.from(CAB_STORY)
    tipo.write('IHDX', 12, 'latin1')
    tipo.writeUInt32BE(zlib.crc32(tipo.subarray(12, 29)), 29)
    expect(lerIhdr(tipo)).toBeNull()
  })
})

// ── T14 pureza e constantes ────────────────────────────────────────────────────────────────────────────────────────
describe('T14 pureza / constantes', () => {
  const PROIBIDOS = ['@/lib/db', 'node:fs', 'fs', 'fs/promises', 'node:fs/promises', 'node:http', 'node:https', 'http', 'https', 'node:net', 'net', 'undici', '@prisma/client']
  const importados = (arquivo: string) =>
    [...fs.readFileSync(path.join(RAIZ, arquivo), 'utf8').matchAll(/(?:\bfrom\s+|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)['"]([^'"]+)['"]/gm)].map((m) => m[1])
  it('selecao-de-fotos.ts e o que ele importa do src não importam banco, disco nem rede', () => {
    const mods = importados('scripts/fixtures/selecao-de-fotos.ts')
    expect(mods.length).toBeGreaterThan(0)
    for (const m of mods) expect(PROIBIDOS, m).not.toContain(m)
    expect(importados('src/lib/posts/prova-do-render.ts').filter((m) => PROIBIDOS.includes(m))).toEqual([])
  })
  it('IMUTABILIDADE_DO_BLOB_COMPROVADA é false e VERSOES_DA_PROVA_CONHECIDAS = [VERSAO_DA_PROVA]', () => {
    expect(IMUTABILIDADE_DO_BLOB_COMPROVADA).toBe(false)
    expect(VERSOES_DA_PROVA_CONHECIDAS).toEqual([VERSAO_DA_PROVA])
    expect(VERSAO_DA_PROVA).toBe(1)
    expect(STORES_DO_STUDIO).toEqual(['2rhsgfleozgl5jbm.public.blob.vercel-storage.com'])
  })
})
