/**
 * Trilhas: a biblioteca de músicas do Studio como fonte, o YouTube como entrada.
 *
 *   npx tsx --env-file=.env .claude/skills/editar-video/trilhas.ts listar  --projeto 2 [--genero samba,pagode] [--busca zeca]
 *   npx tsx --env-file=.env .claude/skills/editar-video/trilhas.ts cadastrar --url <youtube> --nome "…" --artista "…" \
 *        --genero Rock --humor Energético --projeto 2 [--confirmar]
 *   npx tsx --env-file=.env .claude/skills/editar-video/trilhas.ts baixar --pasta "<projeto>" --ids 48:instrumental,77:original [--esperar 540]
 *   npx tsx .claude/skills/editar-video/trilhas.ts autoteste
 *
 * `listar` só LÊ (transação READ ONLY). `cadastrar` sem --confirmar mostra o que faria,
 * já conferindo autor, projeto e duplicata — nada pago nem gravado antes do --confirmar.
 *
 * `cadastrar` é o MESMO caminho da tela da biblioteca, com as mesmas recusas: pede o link
 * à RapidAPI (youtube-mp36), baixa o MP3 AQUI (o CDN só serve IP residencial; na Vercel
 * responde 404) e só ENTÃO cria o YoutubeDownloadJob e chama `saveClientDownloadedMp3`,
 * que sobe ao Blob, cadastra e enfileira a separação (MVSEP, cron de 2 em 2 min).
 * Criar o job depois do download é de propósito: job `downloading` com link vivo é
 * concluído sozinho pela página da biblioteca quando alguém a abre, e interrompido no
 * meio viraria faixa duplicada (revisão de 24/09/2026).
 *
 * `baixar` espera a separação quando pedem instrumental/voz, grava em 05_AUDIO/Trilhas
 * (nunca sobrescreve; `.part` até terminar, apagado se a grade falhar) e mede a grade
 * (batidas.py) em 04_DAVINCI/batidas.jsonl.
 */
import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

// Os módulos do Studio logam no stdout; o stdout deste script é só o JSON do resultado.
const saida = (x: unknown) => process.stdout.write(JSON.stringify(x, null, 2) + '\n')
console.log = console.error

type Opcoes = Record<string, string | boolean>
const FLAGS: Record<string, { valor: string[]; booleanas: string[] }> = {
  listar: { valor: ['projeto', 'genero', 'busca'], booleanas: [] },
  cadastrar: { valor: ['url', 'nome', 'artista', 'genero', 'humor', 'projeto'], booleanas: ['confirmar'] },
  baixar: { valor: ['pasta', 'ids', 'esperar'], booleanas: [] },
  autoteste: { valor: [], booleanas: [] },
}

export function lerArgs(argv: string[]) {
  const [cmd, ...resto] = argv
  const aceitas = FLAGS[cmd]
  if (!aceitas) throw new Error(`comando desconhecido: ${cmd ?? '(nenhum)'} — use ${Object.keys(FLAGS).join('|')}`)
  const o: Opcoes = {}
  for (let i = 0; i < resto.length; i++) {
    const t = resto[i]
    if (!t.startsWith('--')) throw new Error(`argumento solto: "${t}" (toda opção começa com --)`)
    const k = t.slice(2)
    if (aceitas.booleanas.includes(k)) o[k] = true
    else if (aceitas.valor.includes(k)) {
      const v = resto[i + 1]
      if (v === undefined || v.startsWith('--')) throw new Error(`--${k} precisa de um valor`)
      o[k] = v
      i++
    } else throw new Error(`--${k} não existe em "${cmd}" (aceita: ${[...aceitas.valor, ...aceitas.booleanas].join(', ') || 'nada'})`)
  }
  return { cmd, o }
}

export function idDoYoutube(entrada: string): string | null {
  let u: URL
  try {
    u = new URL(entrada)
  } catch {
    return null
  }
  const host = u.hostname.replace(/^(www|m|music)\./, '')
  const id = host === 'youtu.be' ? u.pathname.slice(1).split('/')[0]
    : host === 'youtube.com' ? (u.searchParams.get('v') ?? u.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1] ?? '')
    : ''
  return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null
}

/** "48:instrumental,77:original" → [{id:48, versao:'instrumental'}, …]. Sem versão = instrumental. */
export function lerIds(s: string) {
  return s.split(',').map((p) => {
    const [id, v = 'instrumental'] = p.trim().split(':')
    if (!/^\d+$/.test(id) || !['instrumental', 'original', 'voz'].includes(v)) throw new Error(`id inválido: ${p}`)
    return { id: Number(id), versao: v as 'instrumental' | 'original' | 'voz' }
  })
}

export function idPositivo(v: string | boolean | undefined, nome: string): number | null {
  if (v === undefined) return null
  const n = Number(v)
  if (!Number.isInteger(n) || n <= 0) throw new Error(`--${nome} precisa ser um id numérico (veio "${v}")`)
  return n
}

/** Trecho de nome de arquivo: sem caracteres proibidos e com teto de bytes (APFS/exFAT: 255). */
export function trechoDeNome(s: string, maxBytes = 90) {
  let t = s.replace(/[\\/:*?"<>|\x00-\x1f]/g, '-').replace(/\s+/g, ' ').trim()
  while (Buffer.byteLength(t, 'utf8') > maxBytes) t = t.slice(0, -1)
  return t.trim()
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** O Blob levanta um desafio anti-bot (403) em rajada: tenta de novo, espaçado. 404 é final. */
async function baixarArquivo(url: string): Promise<Buffer> {
  let ultimo = 0
  for (const espera of [0, 20_000, 45_000, 90_000]) {
    if (espera) {
      console.error(`  (HTTP ${ultimo}; nova tentativa em ${espera / 1000}s)`)
      await dormir(espera)
    }
    const r = await fetch(url)
    if (r.ok) return Buffer.from(await r.arrayBuffer())
    ultimo = r.status
    if (![403, 429, 500, 502, 503, 504].includes(r.status)) break
  }
  throw new Error(`o servidor não entregou o arquivo (HTTP ${ultimo})`)
}

async function db() {
  return (await import('../../../src/lib/db')).db
}

// ---------- listar ----------

async function listar(o: Opcoes) {
  const d = await db()
  const projeto = idPositivo(o.projeto, 'projeto')
  const generos = o.genero ? String(o.genero).toLowerCase().split(',').map((g) => g.trim()) : null
  const busca = o.busca ? String(o.busca).toLowerCase() : null
  const linhas = await d.$transaction(async (tx: any) => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY')
    return tx.musicLibrary.findMany({
      where: { isActive: true, isPublic: true, ...(projeto ? { OR: [{ projectId: projeto }, { projectId: null }] } : {}) },
      select: {
        id: true, name: true, artist: true, genre: true, mood: true, duration: true, projectId: true,
        hasInstrumentalStem: true, hasVocalsStem: true, createdAt: true,
        stemJob: { select: { status: true } },
        youtubeDownloadJob: { select: { youtubeId: true } },
        _count: { select: { usedInVideos: true } },
      },
    })
  })
  saida(linhas
    .filter((m: any) => !generos || generos.includes(String(m.genre ?? '').toLowerCase()))
    .filter((m: any) => !busca || `${m.name} ${m.artist ?? ''}`.toLowerCase().includes(busca))
    .sort((a: any, b: any) =>
      (Number(b.projectId === projeto) - Number(a.projectId === projeto)) ||
      (a._count.usedInVideos - b._count.usedInVideos) ||
      (+b.createdAt - +a.createdAt))
    .map((m: any) => ({
      id: m.id, nome: m.name, artista: m.artist, genero: m.genre, humor: m.mood,
      duracao_s: Math.round(m.duration), origem: m.projectId === projeto ? 'do cliente' : m.projectId ? `projeto ${m.projectId}` : 'global',
      instrumental: m.hasInstrumentalStem ? 'pronto' : m.stemJob?.status ?? 'sem separação',
      voz: m.hasVocalsStem, usos: m._count.usedInVideos,
      link: m.youtubeDownloadJob?.youtubeId ? `https://www.youtube.com/watch?v=${m.youtubeDownloadJob.youtubeId}` : null,
    })))
}

// ---------- cadastrar ----------

async function autor(): Promise<{ clerkId: string; email: string | null }> {
  let v = process.env.STUDIO_AUTOR
  const arq = resolve('.studio-autor')
  if (!v && existsSync(arq)) v = readFileSync(arq, 'utf8').trim()
  if (!v) throw new Error('quem cadastra? defina STUDIO_AUTOR (e-mail do Studio) ou o arquivo .studio-autor na raiz do repo')
  const { resolverAutorLocal } = await import('../../../src/lib/mcp/autor-local')
  const a = await resolverAutorLocal(v)
  if (!a) throw new Error(`"${v}" não é usuário do Studio`)
  return a
}

async function cadastrar(o: Opcoes) {
  const youtubeId = idDoYoutube(String(o.url ?? ''))
  if (!youtubeId) throw new Error('--url precisa ser um link do YouTube (youtube.com/watch?v=…, youtu.be/…, /shorts/…)')
  const d = await db()

  // Tudo que pode barrar vem ANTES de qualquer gasto ou escrita — inclusive na simulação.
  const projectId = idPositivo(o.projeto, 'projeto')
  if (projectId && !(await d.project.findUnique({ where: { id: projectId }, select: { id: true } }))) {
    throw new Error(`o projeto ${projectId} não existe`)
  }
  const quem = await autor()

  // Já na biblioteca (faixa ATIVA, a mais nova)? Reusa. De outro cliente: avisa e para.
  const ja = await d.youtubeDownloadJob.findFirst({
    where: { youtubeId, music: { isActive: true } },
    orderBy: { createdAt: 'desc' },
    select: { musicId: true, music: { select: { name: true, projectId: true, hasInstrumentalStem: true } } },
  })
  if (ja?.musicId) {
    const dele = ja.music!.projectId
    return saida({
      situacao: dele && dele !== projectId ? `já está na biblioteca, mas no projeto ${dele} — nada foi cadastrado` : 'já está na biblioteca — nada foi cadastrado',
      musicId: ja.musicId, nome: ja.music!.name, projeto: dele ?? 'global', instrumental: ja.music!.hasInstrumentalStem,
    })
  }
  // Download do mesmo vídeo em andamento: a tela recusa com 409, o script também.
  const andamento = await d.youtubeDownloadJob.findFirst({
    where: { youtubeId, status: { in: ['pending', 'downloading', 'uploading'] } },
    select: { id: true, status: true, createdAt: true },
  })
  if (andamento) {
    throw new Error(`já existe um download deste vídeo em andamento (job ${andamento.id}, "${andamento.status}", desde ${andamento.createdAt.toISOString()}) — conclua pela página da biblioteca ou espere expirar`)
  }

  const meta = (await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${youtubeId}&format=json`)
    .then((r) => (r.ok ? r.json() : null)).catch(() => null)) as { title?: string; author_name?: string; thumbnail_url?: string } | null
  const pedido = {
    youtubeId, titulo: meta?.title ?? null, canal: meta?.author_name ?? null,
    nome: (o.nome as string) ?? meta?.title ?? null, artista: (o.artista as string) ?? null,
    genero: (o.genero as string) ?? null, humor: (o.humor as string) ?? null,
    projeto: projectId ?? 'global', autor: quem.email ?? quem.clerkId,
  }
  if (!o.confirmar) return saida({ situacao: 'simulação — nada foi gravado nem pago; repita com --confirmar', ...pedido })

  const { getYoutubeDownloadLink, saveClientDownloadedMp3 } = await import('../../../src/lib/youtube/video-download-client')
  // A RapidAPI converte sob demanda: "processing" nas primeiras chamadas é normal.
  let link: Awaited<ReturnType<typeof getYoutubeDownloadLink>> | null = null
  for (let i = 0; i < 12; i++) {
    link = await getYoutubeDownloadLink(youtubeId)
    if (link.success || link.error !== 'processing') break
    await dormir(5000)
  }
  if (!link?.success || !link.link) throw new Error(`a RapidAPI não entregou o link: ${link?.error ?? 'sem resposta'}`)
  const mp3 = await baixarArquivo(link.link) // ANTES do job: interrompido aqui, não sobra nada

  const job = await d.youtubeDownloadJob.create({
    data: {
      youtubeUrl: `https://www.youtube.com/watch?v=${youtubeId}`, youtubeId,
      requestedName: pedido.nome, requestedArtist: pedido.artista, requestedGenre: pedido.genero, requestedMood: pedido.humor,
      projectId, createdBy: quem.clerkId,
      title: link.title ?? pedido.titulo, thumbnail: meta?.thumbnail_url ?? null, duration: link.duration ?? null,
      status: 'downloading', videoApiStatus: 'ready', videoApiJobId: link.link, startedAt: new Date(), progress: 90,
    },
  })
  const faixa: any = await saveClientDownloadedMp3(job.id, mp3, `${youtubeId}.mp3`) // falha: ela mesma marca o job
  const musicId = faixa.musicId ?? faixa.id
  const nome = (await d.musicLibrary.findUnique({ where: { id: musicId }, select: { name: true } }))?.name
  const separacao = await d.musicStemJob.findUnique({ where: { musicId }, select: { status: true } })
  saida({
    situacao: separacao ? 'cadastrada; separação na fila (cron de 2 em 2 min)' : 'cadastrada, mas a separação NÃO entrou na fila — reprocesse na biblioteca',
    musicId, jobId: job.id, nome, projeto: projectId ?? 'global', mb: +(mp3.length / 1e6).toFixed(1),
  })
}

// ---------- baixar ----------

function jaMedida(batidas: string, arquivo: string) {
  if (!existsSync(batidas)) return false
  return readFileSync(batidas, 'utf8').split('\n').some((l) => {
    try {
      return JSON.parse(l).arquivo === arquivo
    } catch {
      return false
    }
  })
}

function medir(arquivo: string, batidas: string) {
  const grade = execFileSync('python3', [join(__dirname, 'batidas.py'), arquivo], { encoding: 'utf8' }).trim()
  appendFileSync(batidas, grade + '\n')
  return JSON.parse(grade)
}

async function baixar(o: Opcoes) {
  const pasta = String(o.pasta ?? '')
  if (!pasta || !existsSync(pasta)) throw new Error('--pasta do projeto não existe')
  const pedidos = lerIds(String(o.ids ?? ''))
  const esperar = Number(o.esperar ?? 540)
  if (!Number.isFinite(esperar) || esperar < 0) throw new Error(`--esperar em segundos (veio "${o.esperar}")`)
  const limite = Date.now() + esperar * 1000
  const d = await db()
  const destino = join(pasta, '05_AUDIO', 'Trilhas')
  const batidas = join(pasta, '04_DAVINCI', 'batidas.jsonl')
  mkdirSync(destino, { recursive: true })
  mkdirSync(join(pasta, '04_DAVINCI'), { recursive: true })
  const feitos: any[] = []
  const urlDa = (m: any, v: string) => (v === 'original' ? m.blobUrl : v === 'instrumental' ? m.instrumentalUrl : m.vocalsUrl)

  for (const { id, versao } of pedidos) {
    let m: any
    for (;;) {
      m = await d.musicLibrary.findUnique({ where: { id }, include: { stemJob: { select: { status: true, error: true, startedAt: true } } } })
      if (!m) throw new Error(`faixa ${id} não existe`)
      if (!m.isActive) throw new Error(`faixa ${id} foi removida da biblioteca`)
      if (urlDa(m, versao)) break
      const st = m.stemJob?.status
      if (!st) throw new Error(`faixa ${id}: a separação não foi pedida — reprocesse na biblioteca`)
      if (st === 'failed') throw new Error(`faixa ${id}: a separação falhou (${m.stemJob.error ?? 'sem motivo'}) — reprocesse na biblioteca`)
      if (st === 'completed') throw new Error(`faixa ${id}: a separação terminou sem a versão "${versao}" — use outra versão ou reprocesse`)
      const desde = m.stemJob.startedAt ? (Date.now() - +m.stemJob.startedAt) / 60_000 : 0
      if (st === 'processing' && desde > 30) throw new Error(`faixa ${id}: separação em "processing" há ${Math.round(desde)} min — a fila travou; confira o MusicStemJob da faixa`)
      if (Date.now() > limite) throw new Error(`faixa ${id}: a separação ainda está "${st}" — rode de novo daqui a pouco`)
      console.error(`  faixa ${id}: separação "${st}"; esperando…`)
      await dormir(20_000)
    }
    const esperado = versao === 'original' ? m.blobSize : versao === 'instrumental' ? m.instrumentalSize : m.vocalsSize
    const arquivo = join(destino, `${id} - ${trechoDeNome(m.name)}${m.artist ? ` - ${trechoDeNome(m.artist, 50)}` : ''} (${versao}).mp3`)
    if (existsSync(arquivo) && statSync(arquivo).size > 0 && (!esperado || statSync(arquivo).size === esperado)) {
      const g = jaMedida(batidas, arquivo) ? null : medir(arquivo, batidas)
      feitos.push({ id, versao, arquivo, situacao: g ? 'já estava na pasta; grade medida agora' : 'já estava na pasta', ...(g ? { bpm: g.bpm } : {}) })
      continue
    }
    // .part até o download terminar; se a grade falhar, nada fica na pasta.
    const parte = arquivo + '.part'
    writeFileSync(parte, await baixarArquivo(urlDa(m, versao)))
    renameSync(parte, arquivo)
    try {
      const g = medir(arquivo, batidas)
      feitos.push({ id, versao, arquivo, bpm: g.bpm, duracao_s: g.dur, confianca: g.confianca, situacao: 'baixada' })
    } catch (e) {
      rmSync(arquivo, { force: true })
      throw new Error(`faixa ${id}: baixei, mas a grade falhou (${(e as Error).message}) — nada ficou na pasta`)
    }
  }
  saida({ pasta, trilhas: feitos, aviso: 'a fase da grade é conferida antes de cortar na batida (reference_grade_de_batidas_fase)' })
}

function autoteste() {
  const eq = (a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`) }
  const lanca = (f: () => unknown, rotulo: string) => {
    try { f() } catch { return }
    throw new Error(`devia falhar: ${rotulo}`)
  }
  eq(idDoYoutube('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1'), 'dQw4w9WgXcQ')
  eq(idDoYoutube('https://youtu.be/dQw4w9WgXcQ?si=x'), 'dQw4w9WgXcQ')
  eq(idDoYoutube('https://www.youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ')
  eq(idDoYoutube('https://music.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ')
  eq(idDoYoutube('https://example.com/watch?v=dQw4w9WgXcQ'), null)
  eq(idDoYoutube('https://www.youtube.com/watch?v=dQw4w9WgXcQXX'), null)
  eq(idDoYoutube('dQw4w9WgXcQ'), null)
  eq(lerIds('48:instrumental, 77:original,5'), [{ id: 48, versao: 'instrumental' }, { id: 77, versao: 'original' }, { id: 5, versao: 'instrumental' }])
  lanca(() => lerIds('48:karaoke'), 'versão inválida')
  eq(idPositivo('2', 'projeto'), 2)
  eq(idPositivo(undefined, 'projeto'), null)
  lanca(() => idPositivo('quintal', 'projeto'), 'projeto não numérico')
  lanca(() => idPositivo('0', 'projeto'), 'projeto zero')
  eq(lerArgs(['cadastrar', '--url', 'u', '--confirmar']), { cmd: 'cadastrar', o: { url: 'u', confirmar: true } })
  lanca(() => lerArgs(['cadastrar', '--nome', '--projeto', '2']), 'flag sem valor')
  lanca(() => lerArgs(['cadastrar', 'solto']), 'token solto')
  lanca(() => lerArgs(['baixar', '--projeto', '2']), 'flag de outro comando')
  lanca(() => lerArgs(['apagar']), 'comando desconhecido')
  eq(Buffer.byteLength(trechoDeNome('á'.repeat(200)), 'utf8') <= 90, true)
  eq(trechoDeNome('a/b:c'), 'a-b-c')
  console.error('autoteste ok')
}

async function main() {
  const { cmd, o } = lerArgs(process.argv.slice(2))
  if (cmd === 'autoteste') return autoteste()
  if (cmd === 'listar') await listar(o)
  else if (cmd === 'cadastrar') await cadastrar(o)
  else await baixar(o)
  process.exit(0) // o Prisma segura o processo aberto
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
