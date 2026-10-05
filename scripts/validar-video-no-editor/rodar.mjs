#!/usr/bin/env node
/**
 * Validação do vídeo no editor, em Chrome de verdade e SEM login, banco ou Next.
 *
 * Monta o componente real do canvas (KonvaLayerFactory → VideoNode) com o
 * contexto do editor trocado por um estado local, e chama a função real de
 * export. Os vídeos são sintéticos, com MARCADOR DE TEMPO desenhado na imagem
 * (uma barra que anda no vídeo de fundo, uma caixa que desce no motion), então
 * dá para medir sincronia lendo os quadros do WebM gravado.
 *
 * O que prova: todo vídeo da página (o de fundo e o motion com alfa) segue o
 * RELÓGIO DA PÁGINA no editor — a página abre parada em 0, tocar/pausar/ir
 * valem para todos, carregando junto ou depois, com corte, volta no fim,
 * vídeo oculto — e sai alinhado no vídeo exportado, que grava pelo mesmo
 * relógio (modo gravação). A sincronia imagem × relógio é medida nos dois.
 *
 * Uso:  node scripts/validar-video-no-editor/rodar.mjs [--com-janela]
 * Exige ffmpeg/ffprobe e o Google Chrome instalado. Não toca em rede, banco,
 * Blob nem crédito.
 */
import { createRequire } from 'node:module'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const RAIZ = path.resolve(AQUI, '../..')
const require = createRequire(path.join(RAIZ, 'package.json'))
const esbuild = require('esbuild')
const { chromium } = require('playwright')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'validar-video-'))
const ffmpeg = (...args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args])

// ── Mídia sintética, 1080x1920 ───────────────────────────────────────────────
// Vídeo de fundo, 6 s: barra branca em x = t·160. Motion, 3 s, fundo
// TRANSPARENTE: caixa verde em y = 600 + t·300.
ffmpeg(
  '-f', 'lavfi', '-i', 'color=c=0x303030:s=1080x1920:r=30:d=6',
  '-f', 'lavfi', '-i', 'color=c=white:s=60x200:r=30:d=6',
  '-filter_complex', "[0][1]overlay=x='t*160':y=200",
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '15', path.join(TMP, 'base.mp4'),
)
ffmpeg(
  '-f', 'lavfi', '-i', 'color=c=black@0.0:s=1080x1920:r=30:d=3,format=rgba',
  '-f', 'lavfi', '-i', 'color=c=lime:s=120x120:r=30:d=3',
  '-filter_complex', "[0][1]overlay=x=100:y='600+t*300':format=auto,format=yuva420p",
  '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '30', '-auto-alt-ref', '0', '-an',
  path.join(TMP, 'motion.webm'),
)
ffmpeg('-f', 'lavfi', '-i', 'color=c=0x1040a0:s=1080x1920:d=1', '-frames:v', '1', path.join(TMP, 'foto.png'))
ffmpeg('-f', 'lavfi', '-i', 'color=c=0xa01010:s=1080x1920:d=1', '-frames:v', '1', path.join(TMP, 'foto2.png'))
// Grade (Fase 2): duas linhas brancas verticais de 8 px, centradas em x = 339,5
// e 739,5 — 400 px entre elas, simétricas em volta do centro da caixa
ffmpeg(
  '-f', 'lavfi', '-i', 'color=c=0x202020:s=1080x1920:d=1',
  '-vf', 'drawbox=x=336:y=0:w=8:h=1920:color=white:t=fill,drawbox=x=736:y=0:w=8:h=1920:color=white:t=fill',
  '-frames:v', '1', path.join(TMP, 'grade.png'),
)
// Degrau (Fase 2, desfoque): metade cinza-escura, metade branca, a divisa em
// x = 540 — o centro da página, que o zoom não tira do lugar
ffmpeg(
  '-f', 'lavfi', '-i', 'color=c=0x202020:s=1080x1920:d=1',
  '-vf', 'drawbox=x=540:y=0:w=540:h=1920:color=white:t=fill',
  '-frames:v', '1', path.join(TMP, 'degrau.png'),
)
// Vídeos com SOM, 6 s, cada um com a sua cor e o seu tom (Fase 3): é o tom que
// diz, no MP4 da fila, de qual clipe é o som em cada instante. E a música da
// foto em movimento, outro tom.
for (const [arquivo, cor, hz] of [['tom440.mp4', '0x1040a0', 440], ['tom880.mp4', '0xa01010', 880], ['tom660.mp4', '0x10a040', 660]]) {
  ffmpeg(
    '-f', 'lavfi', '-i', `color=c=${cor}:s=1080x1920:r=30:d=6`,
    '-f', 'lavfi', '-i', `sine=frequency=${hz}:sample_rate=48000:duration=6`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '15', '-c:a', 'aac', '-b:a', '128k', '-shortest', path.join(TMP, arquivo),
  )
}
ffmpeg('-f', 'lavfi', '-i', 'sine=frequency=330:sample_rate=48000:duration=6', path.join(TMP, 'musica.wav'))

// ── Bundle da página ─────────────────────────────────────────────────────────
/** `@/…` resolve para src/ (o alias do tsconfig). */
const doRepo = (args) => {
  const base = path.join(RAIZ, 'src', args.path.slice(2))
  for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx', '']) {
    if (fs.existsSync(base + ext) && fs.statSync(base + ext).isFile()) return { path: base + ext }
  }
  return { errors: [{ text: 'não achei ' + args.path }] }
}
await esbuild.build({
  entryPoints: [path.join(AQUI, 'entrada.tsx')],
  bundle: true,
  outfile: path.join(TMP, 'pagina.js'),
  format: 'iife',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"development"' },
  logLevel: 'error',
  plugins: [
    {
      name: 'caminhos-do-repo',
      setup(build) {
        // O contexto do editor vira o stub; o resto de @/ resolve para src/
        build.onResolve({ filter: /^@\/contexts\/(template-editor-context|multi-page-context)$/ }, () => ({
          path: path.join(AQUI, 'stub-contexto.tsx'),
        }))
        build.onResolve({ filter: /^@\// }, doRepo)
      },
    },
  ],
})
// SERVIDOR (Node), pelas portas reais: o render (`renderPageAndRegister`) e a
// fila de vídeo (`processNextVideoJob`), com banco, Blob, fontes, créditos e
// Drive trocados por stub-servidor.ts
for (const entrada of ['render-servidor', 'processar-servidor']) {
  await esbuild.build({
    entryPoints: [path.join(AQUI, `${entrada}.ts`)],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
    outfile: path.join(TMP, `${entrada}.cjs`),
    logLevel: 'error',
    plugins: [
      {
        name: 'servidor-da-validacao',
        setup(build) {
          build.onResolve(
            { filter: /^(@vercel\/blob|@\/lib\/db|@\/lib\/posts\/register-project-fonts|@\/server\/google-drive-service|@\/lib\/credits\/deduct)$/ },
            () => ({ path: path.join(AQUI, 'stub-servidor.ts') }),
          )
          build.onResolve({ filter: /^@\// }, doRepo)
        },
      },
    ],
  })
}
fs.writeFileSync(
  path.join(TMP, 'index.html'),
  '<!doctype html><body style="margin:0"><div id="palco"></div><script src="pagina.js"></script></body>',
)

// ── Servidor local (o <video> precisa de Range e de CORS para o canvas) ─────
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.mp4': 'video/mp4', '.webm': 'video/webm', '.png': 'image/png', '.wav': 'audio/wav' }
const servidor = http.createServer((req, res) => {
  const arquivo = path.join(TMP, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, ''))
  if (!arquivo.startsWith(TMP) || !fs.existsSync(arquivo)) {
    res.writeHead(404, { 'Access-Control-Allow-Origin': '*' })
    return res.end()
  }
  const total = fs.statSync(arquivo).size
  const faixa = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? '')
  const cabecalho = {
    'Content-Type': TIPOS[path.extname(arquivo)] ?? 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*',
  }
  if (faixa) {
    const ini = Number(faixa[1])
    const fim = faixa[2] ? Number(faixa[2]) : total - 1
    res.writeHead(206, { ...cabecalho, 'Content-Range': `bytes ${ini}-${fim}/${total}`, 'Content-Length': fim - ini + 1 })
    fs.createReadStream(arquivo, { start: ini, end: fim }).pipe(res)
  } else {
    res.writeHead(200, { ...cabecalho, 'Content-Length': total })
    fs.createReadStream(arquivo).pipe(res)
  }
})
await new Promise((r) => servidor.listen(0, '127.0.0.1', r))
const origem = `http://127.0.0.1:${servidor.address().port}`

// ── Camadas ─────────────────────────────────────────────────────────────────
const camada = (id, type, arquivo, extra = {}) => ({
  id, type, name: id, visible: true, locked: false, order: 0, rotation: 0,
  position: { x: 0, y: 0 }, size: { width: 1080, height: 1920 }, style: { opacity: 1, objectFit: 'cover' },
  fileUrl: `${origem}/${arquivo}`,
  ...extra,
})
const video = (id, arquivo, meta = {}, extra = {}) =>
  camada(id, 'video', arquivo, { videoMetadata: { autoplay: true, loop: true, muted: true, objectFit: 'cover', ...meta }, ...extra })
const base = (meta, extra) => video('base', 'base.mp4', meta, extra)
const motion = (meta, extra) => video('motion', 'motion.webm', { loop: false, overlay: true, ...meta }, extra)
const foto = camada('foto', 'image', 'foto.png')
const foto2 = camada('foto2', 'image', 'foto2.png')

// ── Página ───────────────────────────────────────────────────────────────────
const navegador = await chromium.launch({
  channel: 'chrome',
  headless: !process.argv.includes('--com-janela'),
  args: ['--autoplay-policy=no-user-gesture-required'],
})
const pagina = await navegador.newPage({ viewport: { width: 1200, height: 2000 } })
const errosDaPagina = []
pagina.on('pageerror', (e) => errosDaPagina.push(e.message))
await pagina.goto(`${origem}/index.html`)
await pagina.waitForFunction(() => window.validacao)

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))
const estado = () => pagina.evaluate(() => window.validacao.estado())
const montar = async (camadas) => {
  // trocar de página zera o relógio (é o que o PageSync faz no editor) e a seleção
  await pagina.evaluate(() => {
    window.validacao.zerar()
    window.validacao.selecionar([])
    window.validacao.set([])
  })
  await dormir(150)
  await pagina.evaluate((c) => window.validacao.set(c), camadas)
}
const prontos = async (ids, limite = 8000) => {
  const ate = Date.now() + limite
  while (Date.now() < ate) {
    const e = await estado()
    if (ids.every((id) => e[id] && e[id].pronto >= 2)) return true
    await dormir(100)
  }
  return false
}
const amostrar = async (ms, passo = 100) => {
  const amostras = []
  const ate = Date.now() + ms
  while (Date.now() < ate) {
    amostras.push(await estado())
    await dormir(passo)
  }
  return amostras
}

/** Lê os quadros do WebM (10 por segundo) e devolve o tempo que cada marcador mostra. */
function quadrosDo(base64, nome) {
  const webm = path.join(TMP, nome)
  fs.writeFileSync(webm, Buffer.from(base64, 'base64'))
  const L = 270, A = 480, QPS = 10
  const bruto = execFileSync(
    'ffmpeg',
    ['-v', 'error', '-i', webm, '-vf', `fps=${QPS},scale=${L}:${A}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
    { maxBuffer: 1 << 30 },
  )
  const porQuadro = L * A * 3
  const quadros = []
  for (let i = 0; (i + 1) * porQuadro <= bruto.length; i++) {
    const q = bruto.subarray(i * porQuadro, (i + 1) * porQuadro)
    const px = (x, y) => [q[(y * L + x) * 3], q[(y * L + x) * 3 + 1], q[(y * L + x) * 3 + 2]]
    let xBarra = null
    for (let x = 0; x < L; x++) {
      const [r, g, b] = px(x, 75)
      if (r > 180 && g > 180 && b > 180) { xBarra = x; break }
    }
    let yCaixa = null
    for (let y = 0; y < A; y++) {
      const [r, g, b] = px(40, y)
      if (g > 150 && r < 110 && b < 110) { yCaixa = y; break }
    }
    const [fr, fg, fb] = px(260, 470)
    quadros.push({
      t: i / QPS,
      base: xBarra === null ? null : xBarra / 40, // 160 px/s em 1080 → 40 px/s aqui
      motion: yCaixa === null ? null : (yCaixa - 150) / 75, // 600 + 300·t em 1920 → 150 + 75·t
      fotoAoFundo: fb > 120 && fr < 60,
      foto2AoFundo: fr > 120 && fb < 60 && fg < 60,
    })
  }
  return quadros
}

/**
 * A linha de pixels `y` (em cinza) de cada quadro, em resolução cheia e com
 * TODOS os quadros (passthrough). Serve ao WebM gravado, ao MP4 da fila e ao
 * PNG do render de servidor. O log é `fatal`: o WebM do MediaRecorder repete
 * timestamps, e o muxer do rawvideo reclama de cada um sem descartar quadro
 * (o rawvideo não tem timestamp) — a contagem confere em `quadrosDaLinha`.
 */
function linhasCinza(arquivo, y) {
  const bruto = execFileSync(
    'ffmpeg',
    ['-v', 'fatal', '-i', arquivo, '-fps_mode', 'passthrough', '-vf', `scale=1080:1920,crop=1080:1:0:${y}`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'],
    { maxBuffer: 1 << 28 },
  )
  const linhas = []
  for (let i = 0; (i + 1) * 1080 <= bruto.length; i++) linhas.push(bruto.subarray(i * 1080, (i + 1) * 1080))
  return linhas
}

/** A mesma linha em RGB, com o tempo de cada quadro (a gravação não tem cadência fixa). */
function quadrosDaLinha(arquivo, y) {
  const tempos = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v', '-show_entries', 'frame=pts_time', '-of', 'csv=p=0', arquivo])
    .toString().trim().split('\n').map((s) => Number(s) || 0)
  const bruto = execFileSync(
    'ffmpeg',
    ['-v', 'fatal', '-i', arquivo, '-fps_mode', 'passthrough', '-vf', `scale=1080:1920,crop=1080:1:0:${y}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
    { maxBuffer: 1 << 28 },
  )
  // Cada linha casa com o tempo do MESMO quadro: quadro perdido desalinharia tudo
  if (bruto.length !== tempos.length * 3240) throw new Error(`${arquivo}: ${tempos.length} quadros, ${bruto.length / 3240} linhas`)
  const quadros = []
  for (let i = 0; i < tempos.length && (i + 1) * 3240 <= bruto.length; i++) quadros.push({ t: tempos[i], px: bruto.subarray(i * 3240, (i + 1) * 3240) })
  return quadros
}
const cor = (px, x) => [px[x * 3], px[x * 3 + 1], px[x * 3 + 2]]
const igual = (c, alvo, tol) => c.every((v, i) => Math.abs(v - alvo[i]) <= tol)

/** Largura (10% → 90%) da borda do degrau na linha: é o desfoque, medido em px da página. */
function larguraDoDegrau(linha) {
  const mediana = (a) => [...a].sort((p, q) => p - q)[a.length >> 1]
  const baixo = mediana(linha.subarray(380, 441))
  const alto = mediana(linha.subarray(640, 701))
  const cruza = (f) => {
    const alvo = baixo + f * (alto - baixo)
    for (let x = 441; x < 640; x++) if (linha[x] >= alvo) return x - 1 + (alvo - linha[x - 1]) / Math.max(1, linha[x] - linha[x - 1])
    return NaN
  }
  return cruza(0.9) - cruza(0.1)
}

// ── O som do MP4 ─────────────────────────────────────────────────────────────
const TAXA = 48000
/** As amostras da faixa de áudio (mono, 48 kHz, float). */
function amostrasDoAudio(arquivo) {
  const bruto = execFileSync('ffmpeg', ['-v', 'error', '-i', arquivo, '-map', '0:a:0', '-ac', '1', '-ar', String(TAXA), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 })
  return new Float32Array(bruto.buffer.slice(bruto.byteOffset, bruto.byteOffset + bruto.byteLength))
}
/** Potência do tom `hz` numa janela de 20 ms centrada em `t` (Goertzel com janela de Hann). */
function potencia(x, t, hz) {
  const n = 960
  const ini = Math.round(t * TAXA - n / 2)
  if (ini < 0 || ini + n > x.length) return 0
  const k = 2 * Math.cos((2 * Math.PI * hz) / TAXA)
  let s1 = 0
  let s2 = 0
  for (let i = 0; i < n; i++) {
    const s = x[ini + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1))) + k * s1 - s2
    s2 = s1
    s1 = s
  }
  return s1 * s1 + s2 * s2 - k * s1 * s2
}
/** O instante (passo de 1 ms, ±0,25 s em volta de `alvo`) em que o tom `para` passa o tom `de`. */
function trocaDeTom(x, de, para, alvo) {
  for (let t = alvo - 0.25; t <= alvo + 0.25; t += 0.001) if (potencia(x, t, para) > potencia(x, t, de)) return t
  return null
}
const faixasDe = (arquivo) =>
  execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', arquivo]).toString().trim().split('\n')
const duracaoDe = (arquivo) =>
  Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', arquivo]).toString().trim())

/**
 * Passa o WebM gravado pela FILA DE VÍDEO de verdade (`processNextVideoJob`,
 * conversão e trilha do ffmpeg da produção) e devolve o MP4 que ela subiria e
 * o que gravou na Generation. Assíncrono de propósito: a fila baixa o WebM, os
 * vídeos e a música deste servidor, que precisa estar livre para responder.
 */
const processar = (webm, duracao, designData, musica = null) =>
  new Promise((resolver, rejeitar) => {
    const mp4 = webm.replace(/\.webm$/, '.mp4')
    const resultado = webm.replace(/\.webm$/, '-fila.json')
    const job = {
      id: 'job-prova', status: 'PENDING', projectId: 1, templateId: 1, clerkUserId: 'validacao',
      videoName: path.basename(webm, '.webm'), webmBlobUrl: `${origem}/${path.basename(webm)}`,
      videoDuration: duracao, videoWidth: 1080, videoHeight: 1920, thumbnailUrl: null, creditsDeducted: true,
      progress: 0, designData, generationId: 'prova', generation: { id: 'prova', fieldValues: {} },
    }
    const env = {
      ...process.env,
      NODE_PATH: path.join(RAIZ, 'node_modules'),
      // O ffmpeg-static da produção, não o do sistema. O conversor o acha pelo
      // `import('ffmpeg-static')`, que não resolve a partir do bundle na pasta
      // temporária (import dinâmico não lê NODE_PATH); o caminho vai pela
      // variável que ele consulta primeiro
      FFMPEG_PATH: require('ffmpeg-static'),
      PROVA_SAIDA: mp4,
      PROVA_RESULTADO: resultado,
      PROVA_JOB: JSON.stringify(job),
      PROVA_MUSICA: JSON.stringify(musica),
    }
    // O log da fila só aparece se ela falhar (o aviso do import acima é ruído)
    let log = ''
    const filho = spawn(process.execPath, [path.join(TMP, 'processar-servidor.cjs')], { cwd: RAIZ, env, stdio: ['ignore', 'ignore', 'pipe'] })
    filho.stderr.on('data', (d) => (log += d))
    filho.on('error', rejeitar)
    filho.on('exit', (codigo) => {
      const lido = fs.existsSync(resultado) ? JSON.parse(fs.readFileSync(resultado, 'utf8')) : null
      if (codigo !== 0) {
        process.stderr.write(log)
        return rejeitar(new Error(`a fila de vídeo saiu com ${codigo}: ${lido?.resultado?.error ?? 'sem resultado'}`))
      }
      resolver({ mp4, fieldValues: lido.fieldValues })
    })
  })

/** A suavização do movimento (src/lib/video/movimento.ts): metade linear, metade smoothstep. */
const suavizar = (p) => 0.5 * p + 0.5 * p * p * (3 - 2 * p)

/**
 * Centros (x) das linhas claras da grade na linha de pixels `y`, um array por
 * quadro.
 */
function centrosNaLinha(arquivo, y) {
  const quadros = []
  for (const linha of linhasCinza(arquivo, y)) {
    const centros = []
    let ini = -1
    for (let x = 0; x <= 1080; x++) {
      const claro = x < 1080 && linha[x] > 128
      if (claro && ini < 0) ini = x
      if (!claro && ini >= 0) {
        if (x - ini >= 3) centros.push((ini + x - 1) / 2) // ruído do codec não é linha
        ini = -1
      }
    }
    quadros.push(centros)
  }
  return quadros
}

let falhas = 0
const conferir = (nome, ok, detalhe = '') => {
  console.log(`  ${ok ? 'OK    ' : 'FALHOU'} ${nome}${detalhe ? ' — ' + detalhe : ''}`)
  if (!ok) falhas++
}
const FIM_DO_MOTION = 2.9 // 3 s menos a margem do último quadro
const DESVIO_MAXIMO = 0.1 // imagem × relógio, na prévia e na gravação
const junto = (e) => Math.abs(e.motion.t - e.base.t)
const tocar = () => pagina.evaluate(() => window.validacao.tocar())
const pausar = () => pagina.evaluate(() => window.validacao.pausar())
const ir = (t) => pagina.evaluate((x) => window.validacao.ir(x), t)
/** Pior |currentTime do vídeo − (início do trecho + relógio)| nas amostras em que o vídeo ainda não chegou ao fim do trecho */
const desvioDoRelogio = (amostras, id, inicio = 0, fim = Infinity) =>
  Math.max(
    0,
    ...amostras
      .filter((e) => e[id] && e[id].t < fim - 0.15 && e.relogio.t > 0.3)
      .map((e) => Math.abs(e[id].t - (inicio + e.relogio.t))),
  )

console.log('\n=== A. vídeo + motion, carregando juntos ===')
await montar([base(), motion()])
conferir('os dois carregaram', await prontos(['base', 'motion']))
{
  const e = await estado()
  conferir('a página abre PARADA em 0', !e.relogio.tocando && e.relogio.t === 0 && e.base.pausado && e.base.t < 0.05 && e.motion.pausado && e.motion.t < 0.05, `relógio ${e.relogio.t} · vídeo ${e.base.t} · motion ${e.motion.t}`)
  await tocar()
  const s = await amostrar(8000)
  const andando = s.filter((e) => e.base.t > 0.4 && e.base.t < 2.6)
  const pior = Math.max(...andando.map(junto))
  conferir('o motion anda junto com o vídeo', andando.length > 5 && pior < 0.35, `${andando.length} amostras, pior desvio ${pior.toFixed(2)} s`)
  const dr = desvioDoRelogio(s.filter((e) => e.base.t < 5.8), 'base', 0, 6)
  conferir(`o vídeo acompanha o relógio da página (≤ ${DESVIO_MAXIMO} s)`, dr <= DESVIO_MAXIMO, `pior desvio ${dr.toFixed(3)} s`)
  const depois = s.filter((e) => e.base.t > 3.4 && e.base.t < 5.6)
  conferir('o motion segura o último quadro quando acaba', depois.length > 5 && depois.every((e) => e.motion.t >= FIM_DO_MOTION && e.motion.pausado), `${depois.length} amostras`)
  const volta = s.findIndex((e, i) => i > 0 && e.relogio.t < s[i - 1].relogio.t - 1)
  conferir('no fim da página o relógio volta a 0 e os dois recomeçam juntos', volta > 0 && s.slice(volta + 3, volta + 12).some((e) => junto(e) < 0.35 && !e.motion.pausado && !e.base.pausado))
}

console.log('\n=== B. motion inserido com o vídeo já tocando ===')
await montar([base()])
await prontos(['base'])
await tocar()
await dormir(900)
await pagina.evaluate((m) => window.validacao.set([...window.validacao.camadas(), m]), motion())
conferir('o motion carregou', await prontos(['base', 'motion']))
await dormir(700)
{
  const e = await estado()
  conferir('entrou no tempo do vídeo', e.base.t < 2.6 ? junto(e) < 0.35 : e.motion.t >= FIM_DO_MOTION, `vídeo ${e.base.t} · motion ${e.motion.t}`)
}

console.log('\n=== C. pausar, tocar e ir (o relógio manda nos dois) ===')
await montar([base(), motion()])
await prontos(['base', 'motion'])
await tocar()
await dormir(800)
await pausar()
await dormir(500)
{
  const e = await estado()
  conferir('pausou junto, no quadro do relógio', e.base.pausado && e.motion.pausado && junto(e) < 0.1 && Math.abs(e.base.t - e.relogio.t) <= DESVIO_MAXIMO, `relógio ${e.relogio.t} · vídeo ${e.base.t} · motion ${e.motion.t}`)
  await tocar()
  await dormir(700)
  const f = await estado()
  conferir('voltou a tocar junto', !f.base.pausado && !f.motion.pausado && junto(f) < 0.35 && f.base.t > e.base.t, `vídeo ${f.base.t} · motion ${f.motion.t}`)
  await pausar()
  await ir(2.5)
  await dormir(500)
  const g = await estado()
  conferir('ir(2,5) parado leva os dois ao quadro 2,5', g.base.pausado && Math.abs(g.base.t - 2.5) <= DESVIO_MAXIMO && Math.abs(g.motion.t - 2.5) <= DESVIO_MAXIMO, `vídeo ${g.base.t} · motion ${g.motion.t}`)
  await pagina.evaluate(() => window.validacao.alternar())
  await dormir(300)
  conferir('alternar (a tecla de espaço) toca', (await estado()).relogio.tocando)
  await pagina.evaluate(() => window.validacao.alternar())
  await dormir(100)
  conferir('alternar de novo pausa', !(await estado()).relogio.tocando)
}

console.log('\n=== D. a página nunca toca sozinha; desfazer/refazer não religa nada ===')
await montar([base({ autoplay: false }), motion()])
await prontos(['base', 'motion'])
await dormir(900)
{
  const e = await estado()
  conferir('nada toca sem alguém apertar play', e.base.pausado && e.motion.pausado && e.base.t < 0.1 && e.motion.t < 0.1, `vídeo ${e.base.t} · motion ${e.motion.t}`)
  // `autoplay` do metadata deixou de ser lido: mudar (desfazer/refazer) não toca
  await pagina.evaluate(() => window.validacao.mudar('base', { autoplay: true }))
  await dormir(900)
  const f = await estado()
  conferir('o metadata de autoplay não toca a página', f.base.pausado && f.base.t < 0.1 && !f.relogio.tocando, `vídeo ${f.base.t}`)
}

console.log('\n=== D2. trocar o arquivo do vídeo e pausar ===')
await montar([base()])
await prontos(['base'])
await tocar()
await pagina.evaluate(() => window.validacao.set(window.validacao.camadas().map((l) => ({ ...l, fileUrl: l.fileUrl + '?v=2' }))))
await dormir(300)
conferir('o vídeo novo carregou', await prontos(['base']))
await dormir(600)
await pausar()
await dormir(400)
{
  const e = await estado()
  conferir('o elemento NOVO segue o relógio e pausa', e.base.pausado && Math.abs(e.base.t - e.relogio.t) <= DESVIO_MAXIMO, `relógio ${e.relogio.t} · vídeo ${e.base.t}`)
}

console.log('\n=== E. corte no vídeo (2 s a 5 s) ===')
await montar([base({ trimStart: 2, trimEnd: 5 }), motion()])
await prontos(['base', 'motion'])
{
  const e = await estado()
  conferir('parado, o vídeo mostra o início do trecho', e.base.pausado && Math.abs(e.base.t - 2) <= DESVIO_MAXIMO, `vídeo ${e.base.t}`)
  await tocar()
  const s = await amostrar(2500)
  const andando = s.filter((e) => e.base.t > 2.4 && e.base.t < 4.6)
  const pior = Math.max(...andando.map((e) => Math.abs(e.motion.t - (e.base.t - 2))))
  conferir('o motion conta a partir do início do trecho', andando.length > 5 && pior < 0.35, `${andando.length} amostras, pior desvio ${pior.toFixed(2)} s`)
  const dr = desvioDoRelogio(s, 'base', 2, 5)
  conferir(`com corte, o vídeo acompanha o relógio (≤ ${DESVIO_MAXIMO} s)`, dr <= DESVIO_MAXIMO, `pior desvio ${dr.toFixed(3)} s`)
  const r = await pagina.evaluate(() => window.validacao.exportar())
  const q = quadrosDo(r.base64, 'corte.webm')
  conferir('o export dura o trecho e começa nele', Math.abs(r.duracao - 3) < 0.05 && q[0].base !== null && Math.abs(q[0].base - 2) < 0.15, `duração ${r.duracao} · 1º quadro em ${q[0].base}`)
}

console.log('\n=== F. foto + motion (o motion é o vídeo principal) ===')
await montar([foto, motion()])
conferir('o motion carregou', await prontos(['motion']))
await tocar()
{
  const s = await amostrar(4200)
  const chegouAoFim = s.findIndex((e) => e.motion.t > 2.5)
  const voltou = chegouAoFim > 0 && s.slice(chegouAoFim).some((e) => e.motion.t < 1)
  conferir('toca até o fim do motion (a duração da página) e dá a volta', s.some((e) => e.motion.t > 0.5 && e.motion.t < 2.5) && chegouAoFim > 0 && voltou, `fim visto em ${chegouAoFim >= 0 ? s[chegouAoFim].motion.t : '-'}`)
  const r = await pagina.evaluate(() => window.validacao.exportar())
  const q = quadrosDo(r.base64, 'foto-motion.webm')
  conferir('o export tem a duração do motion', r.principal === 'motion' && Math.abs(r.duracao - 3) < 0.05, `duração ${r.duracao}`)
  conferir('a foto aparece por baixo (o fundo do motion é transparente)', q.length > 20 && q.every((x) => x.fotoAoFundo))
  const pior = Math.max(...q.filter((x) => x.motion !== null).map((x) => Math.abs(x.motion - x.t)))
  conferir('o motion sai no tempo certo', q.every((x) => x.motion !== null) && pior < 0.25, `pior desvio ${pior.toFixed(2)} s`)
}

console.log('\n=== G. desligar e religar "Motion" no painel ===')
await montar([base(), motion()])
await prontos(['base', 'motion'])
await tocar()
await dormir(500)
await pagina.evaluate(() => window.validacao.mudar('motion', { overlay: false }))
await dormir(700)
{
  const e = await estado()
  conferir('desligado, continua seguindo o relógio da página', e.base.t < 2.6 ? junto(e) < 0.35 && !e.motion.pausado : e.motion.t >= FIM_DO_MOTION, `vídeo ${e.base.t} · motion ${e.motion.t}`)
  await pagina.evaluate(() => window.validacao.mudar('motion', { overlay: true }))
  await dormir(700)
  const f = await estado()
  conferir('religado, idem', f.base.t < 2.6 ? junto(f) < 0.35 : f.motion.t >= FIM_DO_MOTION, `vídeo ${f.base.t} · motion ${f.motion.t}`)
}

console.log('\n=== H. vídeo oculto + motion ===')
await montar([base({}, { visible: false }), motion()])
await prontos(['base', 'motion'])
await tocar()
{
  const s = await amostrar(4200)
  conferir('vídeo oculto não manda na duração da página (o motion dá a volta em 3 s)', s.some((e) => e.motion.t > 2.5) && s.some((e, i) => i > 0 && e.relogio.t < s[i - 1].relogio.t - 1))
  const r = await pagina.evaluate(() => window.validacao.exportar())
  conferir('nem na duração do export', r.principal === 'motion' && Math.abs(r.duracao - 3) < 0.05, `principal ${r.principal} · duração ${r.duracao}`)
}

console.log('\n=== I. export com o editor vivo (vídeo + motion) ===')
await montar([base(), motion()])
await prontos(['base', 'motion'])
await tocar()
await dormir(1700) // exporta com a página tocando, no meio do caminho
{
  const r = await pagina.evaluate(() => window.validacao.exportar())
  const q = quadrosDo(r.base64, 'video-motion.webm')
  conferir('o vídeo de fundo dita a duração', r.principal === 'base' && Math.abs(r.duracao - 6) < 0.05, `duração ${r.duracao}`)
  conferir('começa do início, sem quadro de outro ponto', q[0].base !== null && q[0].base < 0.15 && q[0].motion !== null && q[0].motion < 0.15, `1º quadro: vídeo ${q[0].base} · motion ${q[0].motion}`)
  const comeco = q.filter((x) => x.t <= 2.6)
  conferir('o motion está em todos os quadros do começo', comeco.every((x) => x.motion !== null))
  const pior = Math.max(...comeco.filter((x) => x.motion !== null && x.base !== null).map((x) => Math.abs(x.motion - x.base)))
  conferir('motion e vídeo saem alinhados', pior < 0.15, `pior desvio ${pior.toFixed(2)} s`)
  const atraso = Math.max(...q.filter((x) => x.base !== null).map((x) => Math.abs(x.t - x.base)))
  conferir(`a imagem gravada acompanha o relógio da gravação (≤ ${DESVIO_MAXIMO} s)`, atraso <= DESVIO_MAXIMO, `pior desvio ${atraso.toFixed(2)} s`)
  const fim = q.filter((x) => x.t >= 3.3 && x.t <= 5.8)
  conferir('o motion segura o último quadro até o fim', fim.length > 5 && fim.every((x) => x.motion !== null && x.motion > 2.8))
  await dormir(300)
  const e = await estado()
  conferir('depois do export a página volta parada em 0', !e.relogio.tocando && e.relogio.t === 0 && e.relogio.modo === 'previa' && e.base.pausado && e.base.t < 0.1, `relógio ${e.relogio.t} ${e.relogio.modo} · vídeo ${e.base.t}`)
}

console.log('\n=== I2. editar a página durante a gravação cancela ===')
await montar([base(), motion()])
await prontos(['base', 'motion'])
{
  // O cancelamento é de quem chama (o botão compara o design): aqui simulado
  const recusa = await pagina.evaluate(async () => {
    const d = { canvas: { width: 1080, height: 1920, backgroundColor: '#000000' }, layers: window.validacao.camadas() }
    let editou = false
    setTimeout(() => { editou = true }, 1000)
    try {
      await window.validacao.exportarCom(d, { cancelado: () => (editou ? 'A página foi editada durante a gravação. Exporte de novo.' : null) })
      return null
    } catch (e) { return String(e.message) }
  })
  conferir('o export aborta com o motivo', !!recusa && recusa.includes('editada'), recusa ?? 'exportou')
  await dormir(300)
  const e = await estado()
  conferir('e a página volta parada em 0', !e.relogio.tocando && e.relogio.t === 0 && e.relogio.modo === 'previa', `relógio ${e.relogio.t} ${e.relogio.modo}`)
}

console.log('\n=== J. motion que não carrega ===')
await montar([base(), video('motion', 'nao-existe.webm', { loop: false, overlay: true })])
await prontos(['base'])
await dormir(600)
{
  const recusa = await pagina.evaluate(() => window.validacao.exportar().then(() => null, (e) => String(e.message)))
  conferir('o export recusa em vez de gravar sem ele', !!recusa && recusa.includes('ainda não carregou'), recusa ?? 'exportou')
}

console.log('\n=== K. foto parada + música (sem vídeo nenhum) ===')
await montar([foto])
await dormir(400)
{
  const FATIA = 2.5
  const r = await pagina.evaluate((f) => window.validacao.exportarSemVideo(f), FATIA)
  conferir('a duração é a fatia da música', Math.abs(r.duracao - FATIA) < 0.01, `duração ${r.duracao}`)
  const webm = path.join(TMP, 'foto-musica.webm')
  fs.writeFileSync(webm, Buffer.from(r.base64, 'base64'))
  // O MediaRecorder precisa RECEBER quadros de um canvas que não muda: conta
  // decodificando, não supondo (nb_frames do WebM não é confiável; -count_frames é)
  const info = JSON.parse(
    execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames,r_frame_rate', '-of', 'json', webm]).toString(),
  ).streams[0]
  const quadros = Number(info.nb_read_frames)
  const esperado = 30 * FATIA
  conferir('o WebM tem ~fps × duração quadros', quadros >= esperado * 0.8 && quadros <= esperado * 1.3, `${quadros} quadros (esperado ~${esperado})`)
  const q = quadrosDo(r.base64, 'foto-musica-2.webm')
  conferir('a foto está em todos os quadros', q.length > 10 && q.every((x) => x.fotoAoFundo), `${q.length} quadros lidos`)
}

console.log('\n=== L. aba oculta durante a gravação ===')
await montar([base(), motion()])
await prontos(['base', 'motion'])
{
  const recusa = await pagina.evaluate(() => {
    const p = window.validacao.exportar().then(() => null, (e) => String(e.message))
    setTimeout(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    }, 1500)
    return p
  })
  await pagina.evaluate(() => { delete document.visibilityState })
  conferir('o export aborta com mensagem', !!recusa && recusa.includes('oculta'), recusa ?? 'exportou')
}

console.log('\n=== M. linha do tempo: foto 2 s + vídeo com trim (2→4 s) + foto 1 s ===')
// Os clipes ficam no FUNDO, na ordem da página; o vídeo não é mais "de base"
// (sequência não tem som original) e o export grava clipe a clipe.
await montar([
  { ...foto, order: 0, clipe: { duracao: 2 } },
  base({ loop: false, trimStart: 2, trimEnd: 4 }, { order: 1, clipe: {} }),
  { ...foto2, order: 2, clipe: { duracao: 1 } },
])
conferir('o vídeo da sequência carregou', await prontos(['base']))
{
  const r = await pagina.evaluate(() => window.validacao.exportarLinha())
  conferir('a duração é a soma dos clipes (2 + 2 + 1)', Math.abs(r.duracao - 5) < 0.05, `duração ${r.duracao}`)
  const q = quadrosDo(r.base64, 'linha-do-tempo.webm')
  const em = (t) => q.find((x) => Math.abs(x.t - t) < 0.001)
  const noClipe = (t0, t1) => q.filter((x) => x.t >= t0 && x.t < t1)
  conferir('0–2 s: a 1ª foto (azul) está na tela', noClipe(0.2, 1.8).length > 5 && noClipe(0.2, 1.8).every((x) => x.fotoAoFundo && !x.foto2AoFundo))
  const trecho = noClipe(2.3, 3.8)
  const forrado = trecho.filter((x) => x.base !== null)
  const pior = forrado.length ? Math.max(...forrado.map((x) => Math.abs(x.base - x.t))) : 99
  conferir('2–4 s: o vídeo aparece, a partir do início do trecho (barra em t do vídeo = t da página)', trecho.length > 5 && forrado.length >= trecho.length - 2 && pior < 0.3, `${forrado.length}/${trecho.length} quadros com a barra, pior desvio ${pior.toFixed(2)} s`)
  conferir('4–5 s: a 2ª foto (vermelha) está na tela', noClipe(4.2, 4.9).length > 2 && noClipe(4.2, 4.9).every((x) => x.foto2AoFundo && !x.fotoAoFundo))
  conferir('nenhum quadro mostra duas fotos', q.every((x) => !(x.fotoAoFundo && x.foto2AoFundo)))
  void em
}

console.log('\n=== N. reordenar pela linha do tempo (normalizarClipes) ===')
{
  // A mesma página; a ordem passa a ser foto2 (1 s) → foto (2 s) → vídeo (2 s)
  const ordem = await pagina.evaluate(() => window.validacao.normalizar(['foto2', 'foto', 'base']))
  conferir('os clipes vão para o fundo, contíguos e renumerados', JSON.stringify(ordem) === JSON.stringify([['foto2', 0], ['foto', 1], ['base', 2]]), JSON.stringify(ordem))
  await dormir(300)
  const r = await pagina.evaluate(() => window.validacao.exportarLinha())
  const q = quadrosDo(r.base64, 'linha-do-tempo-reordenada.webm')
  const noClipe = (t0, t1) => q.filter((x) => x.t >= t0 && x.t < t1)
  conferir('a duração continua 5 s', Math.abs(r.duracao - 5) < 0.05, `duração ${r.duracao}`)
  conferir('0–1 s: a foto vermelha vem primeiro', noClipe(0.2, 0.9).length > 2 && noClipe(0.2, 0.9).every((x) => x.foto2AoFundo))
  conferir('1–3 s: depois a azul', noClipe(1.2, 2.8).length > 5 && noClipe(1.2, 2.8).every((x) => x.fotoAoFundo))
  const trecho = noClipe(3.3, 4.8)
  conferir('3–5 s: o vídeo fecha a sequência', trecho.length > 5 && trecho.filter((x) => x.base !== null).length >= trecho.length - 2)
}

console.log('\n=== O. som original numa sequência de dois vídeos (Fase 4) ===')
// Dois clipes de VÍDEO, os dois com o mudo do painel DESLIGADO: na prévia só o
// clipe ATIVO fica com som (o outro, fora do intervalo dele, mudo); o export
// continua gravando um WebM sem faixa de áudio (a trilha é do ffmpeg na fila).
await montar([
  base({ loop: false, muted: false, trimStart: 0, trimEnd: 2 }, { order: 0, clipe: {} }),
  video('base2', 'base.mp4', { loop: false, muted: false, trimStart: 2, trimEnd: 4 }, { order: 1, clipe: {} }),
])
conferir('os dois vídeos carregaram', await prontos(['base', 'base2']))
{
  await pagina.evaluate(() => window.validacao.zerar())
  await dormir(200)
  let e = await estado()
  conferir('em 0 s só o 1º clipe tem som (o 2º fica mudo fora do intervalo dele)', e.base.mudo === false && e.base2.mudo === true, JSON.stringify({ base: e.base.mudo, base2: e.base2.mudo }))
  await pagina.evaluate(() => window.validacao.ir(3))
  await dormir(300)
  e = await estado()
  conferir('em 3 s o som passa para o 2º clipe', e.base.mudo === true && e.base2.mudo === false, JSON.stringify({ base: e.base.mudo, base2: e.base2.mudo }))
  const r = await pagina.evaluate(() => window.validacao.exportarLinha())
  conferir('a duração é a soma dos clipes (2 + 2)', Math.abs(r.duracao - 4) < 0.05, `duração ${r.duracao}`)
  const webm = path.join(TMP, 'sequencia-dois-videos.webm')
  fs.writeFileSync(webm, Buffer.from(r.base64, 'base64'))
  const faixas = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', webm]).toString().trim().split('\n')
  conferir('o WebM gravado continua sem faixa de áudio (a trilha é do ffmpeg, na fila)', faixas.length === 1 && faixas[0] === 'video', faixas.join(','))
  e = await estado()
  conferir('depois do export o mudo volta ao que era (o clipe ativo com som)', e.base.mudo === false || e.base2.mudo === false, JSON.stringify({ base: e.base.mudo, base2: e.base2.mudo }))
}

console.log('\n=== P. movimento nas fotos (Fase 2) ===')
// A grade tem duas linhas a 400 px, simétricas em volta do centro da caixa: a
// distância entre elas mede a ESCALA do conteúdo; o ponto médio, o DESLIZE.
const grade = (id, extra = {}) => camada(id, 'image', 'grade.png', extra)
const MUSICA = 2.5
// A trilha da página (foto + música é o que faz a foto andar) e a música da biblioteca que a fila baixa
const TRILHA = { source: 'library', musicId: 1, startTime: 0, endTime: MUSICA }
const MUSICA_DA_BIBLIOTECA = { id: 1, name: 'tom', blobUrl: `${origem}/musica.wav` }
const exportarGrade = async (camadas, nome) => {
  await montar(camadas)
  await dormir(900) // as fotos carregam
  const r = await pagina.evaluate((f) => window.validacao.exportarSemVideo(f), MUSICA)
  const webm = path.join(TMP, nome)
  fs.writeFileSync(webm, Buffer.from(r.base64, 'base64'))
  return webm
}
const camadasDaPagina = () => pagina.evaluate(() => window.validacao.camadas())
const efeito = (id) => pagina.evaluate((i) => window.validacao.efeito(i), id)
const pares = (quadros) => quadros.filter((c) => c.length === 2).map(([a, b]) => ({ d: b - a, meio: (a + b) / 2 }))
const perto = (v, alvo, tol) => Math.abs(v - alvo) <= tol
const ESCALA = 1.15
const TOL = ESCALA * 0.02
/**
 * Render de SERVIDOR pela porta real (persist → page-to-design-data →
 * camadasNoInstante → CanvasRenderer): o PNG é o quadro 0 do editor. A página
 * vem SEM áudio, como chega de quem monta à mão: o persist o lê do banco (o
 * stub devolve PROVA_AUDIO). As fotos são lidas do disco.
 */
const renderizarNoServidor = (camadas, audio, png) => {
  const paginaJson = path.join(TMP, 'pagina-servidor.json')
  const layers = camadas.map((c) => ({ ...c, fileUrl: path.join(TMP, path.basename(c.fileUrl)) }))
  fs.writeFileSync(paginaJson, JSON.stringify({ id: 'prova', name: 'Prova', width: 1080, height: 1920, background: '#000000', layers }))
  execFileSync(process.execPath, [path.join(TMP, 'render-servidor.cjs'), paginaJson], {
    cwd: RAIZ,
    env: { ...process.env, NODE_PATH: path.join(RAIZ, 'node_modules'), PROVA_SAIDA: png, PROVA_AUDIO: JSON.stringify(audio) },
    stdio: ['ignore', 'ignore', 'inherit'],
  })
  return png
}
let primeiroAfastar = null
{
  const webm = await exportarGrade([grade('g', { movimento: 'aproximar' })], 'mov-aproximar.webm')
  const q = pares(centrosNaLinha(webm, 960))
  const r = q.length > 10 ? q.at(-1).d / q[0].d : 0
  conferir('aproximar: do primeiro ao último quadro o conteúdo cresce 1,15× (±2%)', perto(r, ESCALA, TOL), `${q.length} quadros · ${q[0]?.d} → ${q.at(-1)?.d} px · ×${r.toFixed(3)}`)
  // O que vai ao ar é o MP4 da fila: a conversão real, com a música baixada e mixada
  const { mp4, fieldValues } = await processar(webm, MUSICA, { layers: await camadasDaPagina(), __exportAudioConfig: TRILHA }, MUSICA_DA_BIBLIOTECA)
  const qm = pares(centrosNaLinha(mp4, 960))
  const rm = qm.length > 10 ? qm.at(-1).d / qm[0].d : 0
  conferir('aproximar no MP4 da fila: o conteúdo cresce 1,15× (±2%)', perto(rm, ESCALA, TOL), `${qm.length} quadros · ×${rm.toFixed(3)}`)
  const faixas = faixasDe(mp4)
  const dura = duracaoDe(mp4)
  conferir('o MP4 tem imagem e som e dura a fatia da música (2,5 s ±0,05)', faixas.includes('video') && faixas.includes('audio') && perto(dura, MUSICA, 0.05), `${faixas.join(',')} · ${dura} s`)
  const x = amostrasDoAudio(mp4)
  const tons = [0.5, 1.25, 2].map((t) => ({ p: potencia(x, t, 330), outro: Math.max(potencia(x, t, 440), potencia(x, t, 660)) }))
  conferir(
    'o som do MP4 é a música (330 Hz), sem aviso de áudio',
    tons.every((m) => m.p > 1 && m.p > 100 * m.outro) && !fieldValues?.audioAviso,
    `330 Hz sobre os outros: ${tons.map((m) => '×' + (m.p / Math.max(m.outro, 1e-9)).toExponential(1)).join(' · ')}${fieldValues?.audioAviso ? ' · aviso ' + fieldValues.audioAviso : ''}`,
  )
}
{
  const quadros = centrosNaLinha(await exportarGrade([grade('g', { movimento: 'afastar' })], 'mov-afastar.webm'), 960)
  primeiroAfastar = quadros[0]
  const q = pares(quadros)
  const r = q.length > 10 ? q[0].d / q.at(-1).d : 0
  conferir('afastar: o primeiro quadro é 1,15× o último (±2%)', perto(r, ESCALA, TOL), `${q.length} quadros · ${q[0]?.d} → ${q.at(-1)?.d} px · ×${r.toFixed(3)}`)
}
{
  const q = pares(centrosNaLinha(await exportarGrade([grade('g', { movimento: 'deslizar' })], 'mov-deslizar.webm'), 960))
  const anda = q.length > 10 ? (q.at(-1).meio - q[0].meio) / 1080 : 0
  conferir('deslizar: o conteúdo anda ~13% da largura, da esquerda para a direita', perto(anda, 0.13, 0.01), `${q[0]?.meio} → ${q.at(-1)?.meio} px · ${(anda * 100).toFixed(1)}%`)
  conferir('deslizar: a escala fica em 1,15 o tempo todo', q.length > 10 && q.every((p) => perto(p.d, 400 * ESCALA, 400 * TOL)), `${Math.min(...q.map((p) => p.d))}–${Math.max(...q.map((p) => p.d))} px`)
}
{
  // Três faixas de 1080×640: pura, com filtro (vai para o cache de bitmap) e
  // com máscara (o Group da máscara) — o movimento tem de ser o mesmo
  const faixa = (id, y, ordem, style = {}) =>
    grade(id, { order: ordem, position: { x: 0, y }, size: { width: 1080, height: 640 }, style: { opacity: 1, objectFit: 'cover', ...style }, movimento: 'aproximar' })
  const webm = await exportarGrade(
    [
      faixa('pura', 0, 0),
      faixa('filtro', 640, 1, { grayscale: true }),
      faixa('mascara', 1280, 2, { mask: { shapeId: 'retangulo', path: 'M5 5 L95 5 L95 95 L5 95 Z' } }),
    ],
    'mov-faixas.webm',
  )
  const razoes = [320, 960, 1600].map((y) => {
    const q = pares(centrosNaLinha(webm, y))
    return q.length > 10 ? q.at(-1).d / q[0].d : 0
  })
  const texto = razoes.map((r) => '×' + r.toFixed(3)).join(' · ')
  conferir('foto pura, com filtro e com máscara crescem 1,15× (±2%)', razoes.every((r) => perto(r, ESCALA, TOL)), texto)
  conferir('as três se mexem igual (±1%)', Math.max(...razoes) - Math.min(...razoes) <= ESCALA * 0.01, texto)
}
{
  // Arrastar com a prévia PARADA no meio do movimento: a posição gravada é a
  // do arraste, sem o efeito (que fica suspenso do toque até soltar)
  await montar([grade('a', { order: 0, clipe: { duracao: 2 }, movimento: 'aproximar' }), { ...foto2, order: 1, clipe: { duracao: 2 } }])
  await dormir(900)
  await ir(1)
  await dormir(400)
  const antes = await pagina.evaluate(() => window.validacao.efeito('a'))
  conferir('parado no meio do clipe, a foto está no meio do movimento (×1,075)', !!antes && perto(antes.escala, 1.075, 0.005) && antes.recortado, JSON.stringify(antes))
  await pagina.mouse.move(540, 960)
  await pagina.mouse.down()
  for (let k = 1; k <= 10; k++) {
    await pagina.mouse.move(540 + 10 * k, 960 + 5 * k)
    await dormir(40)
  }
  await pagina.mouse.up()
  await dormir(600)
  const a = (await camadasDaPagina()).find((l) => l.id === 'a')
  conferir('arrastar 100×50 com a prévia parada grava a posição sem o efeito', perto(a.position.x, 100, 1) && perto(a.position.y, 50, 1), JSON.stringify(a.position))
  // O movimento mora DENTRO da caixa: o nó vai para a posição nova e o grupo
  // de movimento segue no centro dela (x = metade da largura)
  const depois = await efeito('a')
  conferir(
    'ao soltar, o movimento volta, na posição nova (a foto continua selecionada)',
    !!depois && perto(depois.escala, 1.075, 0.005) && perto(depois.x, 540, 1) && perto(depois.no.x, 100, 1) && perto(depois.no.y, 50, 1),
    JSON.stringify(depois),
  )
}
{
  // Achado 1: SELECIONAR não suspende o movimento — só o gesto. Seleção de
  // verdade (clique → Transformer), tocar, e a escala acompanha o relógio
  await montar([
    grade('s', { order: 0, position: { x: 140, y: 160 }, size: { width: 800, height: 700 }, clipe: { duracao: 2 }, movimento: 'aproximar' }),
    { ...foto2, order: 1, clipe: { duracao: 2 } },
  ])
  await dormir(900)
  await pagina.mouse.click(540, 510)
  await dormir(300)
  const sel = await pagina.evaluate(() => window.validacao.selecao())
  conferir('clicar na foto a seleciona (o Transformer a segura)', sel.length === 1 && sel[0] === 's', JSON.stringify(sel))
  await tocar()
  const amostras = []
  for (let k = 0; k < 16; k++) {
    amostras.push(await efeito('s'))
    await dormir(100)
  }
  await pausar()
  const tocando = amostras.filter((e) => e && e.t > 0.05 && e.t < 1.95)
  const pior = Math.max(0, ...tocando.map((e) => Math.abs(e.escala - (1 + 0.15 * suavizar(e.t / 2)))))
  conferir(
    'selecionada e tocando, a escala acompanha o relógio (±0,01)',
    tocando.length >= 10 && pior <= 0.01 && tocando.at(-1).escala - tocando[0].escala > 0.06,
    `${tocando.length} amostras · pior desvio ${pior.toFixed(4)} · ×${tocando[0]?.escala} → ×${tocando.at(-1)?.escala}`,
  )
  await ir(1)
  await dormir(400)
  const parada = await efeito('s')
  conferir('selecionada e parada em 1 s, o movimento está no meio (×1,075, no centro da caixa)', !!parada && perto(parada.escala, 1.075, 0.005) && perto(parada.x, 400, 1), JSON.stringify(parada))

  // A alça do Transformer: fica no canto da CAIXA (não da foto ampliada), e
  // puxá-la suspende o movimento até soltar
  const alca = await pagina.evaluate(() => window.validacao.alca('bottom-right'))
  conferir('a alça do canto fica no canto da caixa', !!alca && perto(alca.x, 940, 1) && perto(alca.y, 860, 1), JSON.stringify(alca))
  await pagina.mouse.move(940, 860)
  await pagina.mouse.down()
  const durante = []
  for (let k = 1; k <= 10; k++) {
    await pagina.mouse.move(940 - 8 * k, 860 - 7 * k)
    await dormir(40)
    durante.push(await efeito('s'))
  }
  await pagina.mouse.up()
  await dormir(600)
  conferir('puxando a alça, o movimento fica suspenso (×1 em todo o gesto)', durante.every((e) => e && e.escala === 1), durante.map((e) => e?.escala).join(','))
  const s = (await camadasDaPagina()).find((l) => l.id === 's')
  conferir(
    'a alça redimensiona a caixa (720×630) sem mover o canto oposto',
    perto(s.size.width, 720, 2) && perto(s.size.height, 630, 2) && perto(s.position.x, 140, 1) && perto(s.position.y, 160, 1),
    JSON.stringify({ position: s.position, size: s.size }),
  )
  const solto = await efeito('s')
  conferir(
    'ao soltar, o movimento volta na caixa nova (×1,075, centro em 360)',
    !!solto && perto(solto.escala, 1.075, 0.005) && perto(solto.x, 360, 1) && perto(solto.no.x, 140, 1) && perto(solto.no.y, 160, 1),
    JSON.stringify(solto),
  )
}
{
  // Achado 2: com o movimento quem anda é a FOTO — a máscara, os cantos e a
  // borda ficam presos à caixa, no editor e no render de servidor. E a
  // seleção não vai para o vídeo: o export tira as alças e a devolve no fim
  const verde = (c) => c[1] > 150 && c[0] < 100
  const camadas = [
    { ...foto2, order: 0 },
    grade('borda', {
      order: 1, position: { x: 140, y: 160 }, size: { width: 800, height: 700 }, movimento: 'afastar',
      style: { opacity: 1, objectFit: 'cover', border: { width: 12, color: '#00ff00', radius: 80 } },
    }),
    grade('mascara', {
      order: 2, position: { x: 140, y: 1060 }, size: { width: 800, height: 700 }, movimento: 'afastar',
      style: { opacity: 1, objectFit: 'cover', mask: { shapeId: 'retangulo', path: 'M10 10 L90 10 L90 90 L10 90 Z' } },
    }),
  ]
  await montar(camadas)
  await dormir(900)
  await pagina.evaluate(() => window.validacao.selecionar(['borda']))
  await dormir(300)
  const r = await pagina.evaluate((f) => window.validacao.exportarSemVideo(f), MUSICA)
  const webm = path.join(TMP, 'mov-borda-mascara.webm')
  fs.writeFileSync(webm, Buffer.from(r.base64, 'base64'))
  await dormir(300)
  const selDepois = await pagina.evaluate(() => window.validacao.selecao())
  conferir('depois do export a seleção volta', JSON.stringify(selDepois) === '["borda"]', JSON.stringify(selDepois))
  // A alça do meio de cima (540, 160) cairia sobre a borda verde
  const topo = quadrosDaLinha(webm, 160)
  conferir(
    'as alças da seleção não entram no vídeo',
    topo.length > 10 && topo.every((q) => Array.from({ length: 21 }, (_, k) => cor(q.px, 530 + k)).every(verde)),
    `${topo.length} quadros`,
  )
  /** O trecho da linha que NÃO é o vermelho do fundo, dentro de [100, 980]: o recorte da máscara. */
  const recorte = (px) => {
    let ini = -1
    let fim = -1
    for (let x = 100; x <= 980; x++) {
      const c = cor(px, x)
      if (c[0] < 110 || c[1] > 70) {
        if (ini < 0) ini = x
        fim = x
      }
    }
    return [ini, fim]
  }
  const meio = centrosNaLinha(webm, 510) // a borda dos lados e as duas linhas da grade
  const arco = centrosNaLinha(webm, 170) // a borda nos cantos arredondados
  const mascara = quadrosDaLinha(webm, 1410).map((q) => recorte(q.px))
  const [mp, mu] = [meio[0] ?? [], meio.at(-1) ?? []]
  const [ap, au] = [arco[0] ?? [], arco.at(-1) ?? []]
  conferir(
    'afastar: a borda dos lados fica na caixa (140 e 940 ±2), do 1º ao último quadro (±1)',
    mp.length === 4 && mu.length === 4 && perto(mp[0], 140, 2) && perto(mp[3], 940, 2) && perto(mp[0], mu[0], 1) && perto(mp[3], mu[3], 1),
    `1º ${JSON.stringify(mp)} · último ${JSON.stringify(mu)}`,
  )
  conferir(
    'afastar: os cantos arredondados não se mexem (±1)',
    ap.length >= 2 && au.length === ap.length && perto(ap[0], au[0], 1) && perto(ap.at(-1), au.at(-1), 1),
    `1º ${JSON.stringify(ap)} · último ${JSON.stringify(au)}`,
  )
  const razao = mp.length === 4 && mu.length === 4 ? (mp[2] - mp[1]) / (mu[2] - mu[1]) : 0
  conferir('afastar: dentro da borda a foto encolhe 1,15× (±2%)', perto(razao, ESCALA, TOL), `×${razao.toFixed(3)}`)
  const [rp, ru] = [mascara[0] ?? [-1, -1], mascara.at(-1) ?? [-1, -1]]
  conferir(
    'afastar: a máscara fica na caixa ([220, 859] ±2) do 1º ao último quadro',
    [rp, ru].every((rr) => perto(rr[0], 220, 2) && perto(rr[1], 859, 2)),
    `1º ${JSON.stringify(rp)} · último ${JSON.stringify(ru)}`,
  )
  const png = renderizarNoServidor(camadas, TRILHA, path.join(TMP, 'servidor-borda-mascara.png'))
  const parada = renderizarNoServidor(camadas, null, path.join(TMP, 'servidor-borda-mascara-parada.png'))
  const sMeio = centrosNaLinha(png, 510)[0] ?? []
  const sArco = centrosNaLinha(png, 170)[0] ?? []
  const pArco = centrosNaLinha(parada, 170)[0] ?? []
  const sMascara = recorte(quadrosDaLinha(png, 1410)[0].px)
  const iguais = (a, b, tol) => a.length === b.length && a.every((v, i) => perto(v, b[i], tol))
  conferir(
    'render de servidor: borda dos lados, máscara e foto iguais ao 1º quadro do editor (±2 px)',
    iguais(sMeio, mp, 2) && iguais(sMascara, rp, 2) && iguais(sArco.slice(1, -1), ap.slice(1, -1), 2),
    `servidor ${JSON.stringify({ sMeio, sArco, sMascara })}`,
  )
  // O canto do servidor é curva QUADRÁTICA (render-engine, desde 2025) e o do
  // Konva é ARCO: no raio 80, a 10 px da borda, os dois diferem ~8 px, com a
  // foto parada ou não — paridade antiga, fora destas fases. Por isso o canto
  // do servidor se compara com o próprio servidor parado
  conferir(
    'render de servidor: os cantos arredondados ficam na caixa (= a mesma foto parada no servidor, ±1)',
    sArco.length >= 2 && pArco.length >= 2 && perto(sArco[0], pArco[0], 1) && perto(sArco.at(-1), pArco.at(-1), 1),
    `com movimento ${JSON.stringify(sArco)} · parada ${JSON.stringify(pArco)} · editor ${JSON.stringify(ap)}`,
  )
}
{
  // Achado 3: o desfoque é da FOTO — no movimento ele cresce junto com ela, e
  // a densidade do cache não o encolhe. A largura (10%→90%) da borda do degrau
  // mede o raio: parado, no fim do afastar (×1) e no 1º quadro (×1,15), que tem
  // de bater com o render de servidor
  const degrau = (extra = {}) => camada('d', 'image', 'degrau.png', { style: { opacity: 1, objectFit: 'cover', blur: 20 }, ...extra })
  const mediana = (a) => [...a].sort((p, q) => p - q)[a.length >> 1]
  const parado = linhasCinza(await exportarGrade([degrau()], 'blur-parado.webm'), 960).map(larguraDoDegrau)
  const andando = linhasCinza(await exportarGrade([degrau({ movimento: 'afastar' })], 'blur-afastar.webm'), 960).map(larguraDoDegrau)
  const servidor = larguraDoDegrau(linhasCinza(renderizarNoServidor([degrau({ movimento: 'afastar' })], TRILHA, path.join(TMP, 'blur-servidor.png')), 960)[0])
  const p = mediana(parado)
  const [primeiro, ultimo] = [mediana(andando.slice(0, 3)), mediana(andando.slice(-3))]
  const numeros = `parada ${p.toFixed(1)} px · afastar ${primeiro.toFixed(1)} → ${ultimo.toFixed(1)} px · servidor ${servidor.toFixed(1)} px`
  conferir('desfoque: no fim do afastar (×1) a borda tem a largura da foto parada (±1,5 px)', perto(ultimo, p, 1.5), numeros)
  conferir('desfoque: o 1º quadro (×1,15) bate com o render de servidor (±2 px)', perto(primeiro, servidor, 2), numeros)
  conferir('desfoque: cresce junto com a foto (×1,15 ±0,05)', perto(primeiro / ultimo, ESCALA, 0.05), `×${(primeiro / ultimo).toFixed(3)}`)
}
{
  // O render de servidor do afastar = o 1º quadro do editor, e só em página-vídeo
  const renderizar = (audio, png) => centrosNaLinha(renderizarNoServidor([grade('g', { movimento: 'afastar' })], audio, png), 960)[0] ?? []
  const doServidor = renderizar(TRILHA, path.join(TMP, 'servidor.png'))
  conferir(
    'render de servidor (afastar) = primeiro quadro do editor (±2 px)',
    doServidor.length === 2 && primeiroAfastar?.length === 2 && doServidor.every((c, i) => perto(c, primeiroAfastar[i], 2)),
    `servidor ${JSON.stringify(doServidor)} · editor ${JSON.stringify(primeiroAfastar)}`,
  )
  const semMusica = renderizar(null, path.join(TMP, 'servidor-sem-musica.png'))
  conferir('controle: sem música a página não é vídeo e a foto sai parada', semMusica.length === 2 && perto(semMusica[1] - semMusica[0], 400, 2), JSON.stringify(semMusica))
}

console.log('\n=== Q. transições entre clipes (Fase 3) ===')
// Duas fotos de cor chapada, 2 s cada: o corte é em 2 s e a janela da
// transição, de 0,5 s, vai de 1,75 a 2,25. A azul sai, a vermelha entra.
const AZUL = [0x10, 0x40, 0xa0]
const VERMELHO = [0xa0, 0x10, 0x10]
const MEIO = AZUL.map((c, i) => (c + VERMELHO[i]) / 2)
const duasFotos = (transicao) => [
  { ...foto, order: 0, clipe: { duracao: 2 } },
  { ...foto2, order: 1, clipe: { duracao: 2, ...(transicao ? { transicao } : {}) } },
]
const toda =(px, alvo, tol) => Array.from({ length: 1080 }, (_, x) => cor(px, x)).every((c) => igual(c, alvo, tol))
const naPrevia = async (t) => {
  await ir(t)
  await dormir(300)
  return pagina.evaluate(() => window.validacao.linha(960))
}
/** Onde começa a vermelha numa linha "azul à esquerda, vermelha à direita", e quantos pixels não são nenhuma das duas. */
const divisa = (px, azul, vermelho, tol) => {
  let b = 1080
  let sobra = 0
  for (let x = 0; x < 1080; x++) {
    const c = cor(px, x)
    const ehVermelho = igual(c, vermelho, tol)
    if (ehVermelho && b === 1080) b = x
    if (!ehVermelho && !igual(c, azul, tol)) sobra++
    else if (x >= b && !ehVermelho) sobra++ // azul depois da divisa: fora de ordem
  }
  return { b, sobra }
}
for (const transicao of ['dissolver', 'deslizar']) {
  await montar(duasFotos(transicao))
  await dormir(900) // as fotos carregam
  conferir(`${transicao}: 0,25 s antes do corte a imagem é só a azul`, toda(await naPrevia(1.75), AZUL, 3))
  conferir(`${transicao}: 0,25 s depois do corte, só a vermelha`, toda(await naPrevia(2.25), VERMELHO, 3))
  const noCorte = await naPrevia(2)
  const efeitos = await pagina.evaluate(() => [window.validacao.efeito('foto'), window.validacao.efeito('foto2')])
  if (transicao === 'dissolver') {
    conferir('dissolver: no corte a imagem é a média das duas (±8)', toda(noCorte, MEIO, 8), `${JSON.stringify(cor(noCorte, 540))} · esperado ${JSON.stringify(MEIO)} · ${JSON.stringify(efeitos)}`)
  } else {
    const { b, sobra } = divisa(noCorte, AZUL, VERMELHO, 3)
    conferir('deslizar: no corte a divisa está no meio da página (±2%)', perto(b, 540, 1080 * 0.02) && sobra === 0, `divisa em ${b} px, ${sobra} px fora · ${JSON.stringify(efeitos)}`)
  }
}
{
  // Arrastar com a prévia PARADA no meio do deslize: a posição gravada é a do
  // arraste, sem o deslocamento da transição (que fica suspenso do toque até soltar)
  await ir(2.1)
  await dormir(400)
  const entra = Math.round((1 - 0.742) * 1080 * 100) / 100 // suavizar(0,7) = 0,742
  const antes = await pagina.evaluate(() => window.validacao.efeito('foto2'))
  conferir('parado em 2,1 s, a vermelha está no meio da entrada', !!antes && perto(antes.deslocamento, entra, 1), JSON.stringify(antes))
  await pagina.mouse.move(700, 960)
  await pagina.mouse.down()
  for (let k = 1; k <= 10; k++) {
    await pagina.mouse.move(700 + 10 * k, 960 + 5 * k)
    await dormir(40)
  }
  await pagina.mouse.up()
  await dormir(600)
  const f2 = (await pagina.evaluate(() => window.validacao.camadas())).find((l) => l.id === 'foto2')
  conferir('arrastar 100×50 no meio do deslize grava a posição sem o deslocamento', perto(f2.position.x, 100, 1) && perto(f2.position.y, 50, 1), JSON.stringify(f2.position))
  const depois = await pagina.evaluate(() => [window.validacao.efeito('foto'), window.validacao.efeito('foto2')])
  conferir('ao soltar, o deslize volta (e a azul, que não foi tocada, segue onde estava)', perto(depois[1]?.deslocamento, entra, 1) && perto(depois[0]?.deslocamento, -(1080 - entra), 1), JSON.stringify(depois))
}
{
  // Export: uma 3ª foto (a grade) fecha com CORTE SECO em 4 s, e é esse corte
  // que diz, no MESMO WebM, onde caem os 2 s da página — a largada da gravação
  // varia uns 0,1 s de um export para outro. A transição tem de durar 0,5 s,
  // centrada ali, com a imagem pura fora da janela; o corte seguinte, seco.
  const TOL = 12
  const tresFotos = (transicao) => [...duasFotos(transicao), camada('fim', 'image', 'grade.png', { order: 2, clipe: { duracao: 2 } })]
  /**
   * Os quadros de um vídeo (o WebM gravado ou o MP4 da fila), com as cores
   * como o codec as gravou (a conversão de cor desloca uns níveis), e onde
   * caem os 2 s da página: o meio entre o último quadro do 2º clipe e o 1º do
   * 3º, menos 2 s.
   */
  const medir = (arquivo) => {
    const quadros = quadrosDaLinha(arquivo, 960)
    const em = (t) => quadros.reduce((a, q) => (Math.abs(q.t - t) < Math.abs(a.t - t) ? q : a)).px
    const azul = cor(em(1), 540)
    const vermelho = cor(em(3), 540)
    const terceiro = cor(em(5), 540)
    const i = quadros.findIndex((q) => q.t > 3.5 && !igual(cor(q.px, 540), vermelho, TOL))
    return {
      quadros,
      azul,
      vermelho,
      corte: i > 0 ? (quadros[i - 1].t + quadros[i].t) / 2 - 2 : null,
      seco: i > 0 && !igual(terceiro, vermelho, TOL) && igual(cor(quadros[i].px, 540), terceiro, TOL),
    }
  }
  /** O dissolver pelo canal vermelho: quando a mistura passa de 10, 50 e 90%, e o quadro mais perto do meio. */
  const dissolve = ({ quadros, azul, vermelho }) => {
    const m = quadros.filter((q) => q.t < 3.5).map((q) => ({ t: q.t, m: (cor(q.px, 540)[0] - azul[0]) / (vermelho[0] - azul[0]), px: q.px }))
    const cruza = (alvo) => {
      const k = m.findIndex((q) => q.m >= alvo)
      if (k <= 0) return null
      return m[k - 1].t + ((alvo - m[k - 1].m) / (m[k].m - m[k - 1].m)) * (m[k].t - m[k - 1].t)
    }
    const t10 = cruza(0.1)
    const t90 = cruza(0.9)
    return {
      t50: cruza(0.5),
      dura: t10 !== null && t90 !== null ? (t90 - t10) / 0.8 : 0,
      meio: m.reduce((a, q) => (Math.abs(q.m - 0.5) < Math.abs(a.m - 0.5) ? q : a)),
    }
  }
  /** O deslize: a divisa de cada quadro da janela, e quando ela passa pelo meio da página. */
  const desliza = ({ quadros, azul, vermelho }) => {
    const d = quadros.filter((q) => q.t < 3.5).map((q) => ({ t: q.t, ...divisa(q.px, azul, vermelho, TOL) }))
    const k = d.findIndex((q) => q.b < 540)
    return {
      janela: d.filter((q) => q.b > 0 && q.b < 1080),
      tMeio: k > 0 ? d[k - 1].t + ((d[k - 1].b - 540) / (d[k - 1].b - d[k].b)) * (d[k].t - d[k - 1].t) : null,
    }
  }
  const exportarFotos = async (transicao, nome) => {
    await montar(tresFotos(transicao))
    await dormir(900)
    const r = await pagina.evaluate(() => window.validacao.exportarLinha())
    const webm = path.join(TMP, nome)
    fs.writeFileSync(webm, Buffer.from(r.base64, 'base64'))
    return { duracao: r.duracao, ...medir(webm) }
  }
  const pura = (quadros, corte, azul, vermelho) => {
    const antes = quadros.filter((q) => q.t >= corte - 0.6 && q.t <= corte - 0.32)
    const depois = quadros.filter((q) => q.t >= corte + 0.32 && q.t <= corte + 0.6)
    return antes.length > 5 && depois.length > 5 && antes.every((q) => toda(q.px, azul, TOL)) && depois.every((q) => toda(q.px, vermelho, TOL))
  }
  {
    const medida = await exportarFotos('dissolver', 'transicao-dissolver.webm')
    const { duracao, quadros, azul, vermelho, corte, seco } = medida
    conferir('dissolver: a duração da página não muda (2 + 2 + 2 s)', Math.abs(duracao - 6) < 0.05, `duração ${duracao}`)
    conferir('dissolver: a junção sem transição continua um corte seco', seco)
    const { t50, dura, meio } = dissolve(medida)
    conferir('dissolver: a mistura dura 0,5 s (±0,05)', perto(dura, 0.5, 0.05), `${dura.toFixed(3)} s`)
    conferir('dissolver: centrada no corte (±0,05 s)', t50 !== null && corte !== null && perto(t50, corte, 0.05), `meio em ${t50?.toFixed(3)} s · corte em ${corte?.toFixed(3)} s`)
    const esperado = azul.map((c, k) => (c + vermelho[k]) / 2)
    conferir('dissolver: no meio a imagem é a média das duas (±8), sem escurecer', toda(meio.px, esperado, 8), `${JSON.stringify(cor(meio.px, 540))} · esperado ${JSON.stringify(esperado.map(Math.round))}`)
    conferir('dissolver: fora da janela a imagem é pura', corte !== null && pura(quadros, corte, azul, vermelho))
  }
  {
    const medida = await exportarFotos('deslizar', 'transicao-deslizar.webm')
    const { duracao, quadros, azul, vermelho, corte, seco } = medida
    conferir('deslizar: a duração da página não muda (2 + 2 + 2 s)', Math.abs(duracao - 6) < 0.05, `duração ${duracao}`)
    conferir('deslizar: a junção sem transição continua um corte seco', seco)
    const { janela, tMeio } = desliza(medida)
    conferir('deslizar: a azul sai pela esquerda e a vermelha empurra, sem buraco nem sobra (±12 px de borda)', janela.length >= 10 && janela.every((q) => q.sobra <= 12), `${janela.length} quadros · pior ${Math.max(0, ...janela.map((q) => q.sobra))} px`)
    conferir('deslizar: a divisa só anda para a esquerda', janela.every((q, k) => k === 0 || q.b <= janela[k - 1].b + 2))
    conferir('deslizar: a divisa passa pelo meio da página no corte (±0,05 s)', tMeio !== null && corte !== null && perto(tMeio, corte, 0.05), `meio em ${tMeio?.toFixed(3)} s · corte em ${corte?.toFixed(3)} s`)
    const passo = janela.length > 1 ? (janela.at(-1).t - janela[0].t) / (janela.length - 1) : 0
    const dura = janela.length ? janela.at(-1).t - janela[0].t + passo : 0
    conferir('deslizar: o deslize dura 0,5 s (±0,1)', perto(dura, 0.5, 0.1), `${dura.toFixed(3)} s`)
    conferir('deslizar: fora da janela a imagem é pura', corte !== null && pura(quadros, corte, azul, vermelho))
  }

  // O que vai ao ar é o MP4 da FILA, com som: três vídeos, cada um com a sua
  // cor e o seu tom (440, 880 e 660 Hz), a 2ª junção com transição e a 3ª
  // seca. O som corta seco no corte da página (a transição é só de imagem), e
  // a imagem chega no MP4 com o mesmo atraso da gravação (≤ DESVIO_MAXIMO)
  const comSom = (id, arquivo, ordem, clipe) => video(id, arquivo, { loop: false, muted: false, trimStart: 0, trimEnd: 2 }, { order: ordem, clipe })
  for (const transicao of ['dissolver', 'deslizar']) {
    await montar([comSom('a', 'tom440.mp4', 0, {}), comSom('b', 'tom880.mp4', 1, { transicao }), comSom('c', 'tom660.mp4', 2, {})])
    conferir(`${transicao} com som: os três vídeos carregaram`, await prontos(['a', 'b', 'c']))
    const r = await pagina.evaluate(() => window.validacao.exportarLinha())
    const webm = path.join(TMP, `fila-${transicao}.webm`)
    fs.writeFileSync(webm, Buffer.from(r.base64, 'base64'))
    const { mp4, fieldValues } = await processar(webm, r.duracao, { layers: await camadasDaPagina(), __exportAudioConfig: { source: 'original' } })
    const faixas = faixasDe(mp4)
    const dura = duracaoDe(mp4)
    conferir(
      `${transicao}, MP4 da fila: imagem e som, 6 s (±0,05), sem aviso de áudio`,
      faixas.includes('video') && faixas.includes('audio') && perto(dura, 6, 0.05) && !fieldValues?.audioAviso,
      `${faixas.join(',')} · ${dura} s${fieldValues?.audioAviso ? ' · aviso ' + fieldValues.audioAviso : ''}`,
    )
    const x = amostrasDoAudio(mp4)
    const [t1, t2] = [trocaDeTom(x, 440, 880, 2), trocaDeTom(x, 880, 660, 4)]
    conferir(
      `${transicao}, MP4: o som troca de clipe no corte da página (2 s e 4 s, ±1 quadro)`,
      t1 !== null && t2 !== null && perto(t1, 2, 1 / 30) && perto(t2, 4, 1 / 30),
      `${t1?.toFixed(3)} s · ${t2?.toFixed(3)} s`,
    )
    const vaza = []
    for (let t = 1.75; t <= 1.9701; t += 0.01) vaza.push(potencia(x, t, 880) / potencia(x, t, 440))
    for (let t = 2.03; t <= 2.2501; t += 0.01) vaza.push(potencia(x, t, 440) / potencia(x, t, 880))
    conferir(`${transicao}, MP4: na janela da transição o som não mistura (o outro tom < 1%)`, Math.max(...vaza) < 0.01, `pior ${(Math.max(...vaza) * 100).toFixed(3)}%`)
    const medida = medir(mp4)
    const centro = transicao === 'dissolver' ? dissolve(medida).t50 : desliza(medida).tMeio
    const atraso = medida.corte === null ? null : medida.corte - 2
    conferir(
      `${transicao}, MP4: a transição centra no corte da imagem (±0,05 s), e a imagem atrasa do som no máximo ${DESVIO_MAXIMO} s`,
      medida.seco && centro !== null && atraso !== null && perto(centro, medida.corte, 0.05) && Math.abs(atraso) <= DESVIO_MAXIMO,
      `centro em ${centro?.toFixed(3)} s · corte seco em ${atraso === null ? '?' : (medida.corte + 2).toFixed(3)} s · imagem × som ${atraso?.toFixed(3)} s`,
    )
  }
}
{
  // Na PRÉVIA o som também corta no corte dos clipes: na janela da transição
  // os dois vídeos estão na tela, mas só o clipe ativo tem som
  await montar([
    video('a', 'tom440.mp4', { loop: false, muted: false, trimStart: 0, trimEnd: 2 }, { order: 0, clipe: {} }),
    video('b', 'tom880.mp4', { loop: false, muted: false, trimStart: 0, trimEnd: 2 }, { order: 1, clipe: { transicao: 'dissolver' } }),
  ])
  conferir('os dois vídeos com som carregaram', await prontos(['a', 'b']))
  await ir(1.9)
  await dormir(400)
  let e = await estado()
  let f = await efeito('b')
  conferir('em 1,9 s os dois estão na tela, mas só o 1º tem som', f?.visivel && f.opacidade > 0 && f.opacidade < 1 && e.a.mudo === false && e.b.mudo === true, JSON.stringify({ f, a: e.a.mudo, b: e.b.mudo }))
  conferir('o que entra espera parado no início do trecho', e.b.pausado && perto(e.b.t, 0, 0.05), JSON.stringify(e.b))
  await ir(2.1)
  await dormir(400)
  e = await estado()
  f = await efeito('a')
  conferir('em 2,1 s o som já passou para o 2º', f?.visivel && e.a.mudo === true && e.b.mudo === false, JSON.stringify({ f, a: e.a.mudo, b: e.b.mudo }))
  // Parado, o seek só acontece com desvio > 0,08 s do último quadro (1,96)
  conferir('o que sai segura o último quadro', e.a.pausado && perto(e.a.t, 1.96, 0.1), JSON.stringify(e.a))
}

conferir('nenhum erro de JavaScript na página', errosDaPagina.length === 0, errosDaPagina.slice(0, 3).join(' | '))
console.log(`\n${falhas === 0 ? 'TUDO OK' : falhas + ' FALHA(S)'}  (arquivos em ${TMP})`)
await navegador.close()
servidor.closeAllConnections?.()
servidor.close()
process.exit(falhas === 0 ? 0 : 1)
