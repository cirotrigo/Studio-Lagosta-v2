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
import { execFileSync } from 'node:child_process'
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
// Render de SERVIDOR (Node): a porta real (`renderPageAndRegister`), com banco,
// Blob, fontes e Drive trocados por stub-servidor.ts
await esbuild.build({
  entryPoints: [path.join(AQUI, 'render-servidor.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  outfile: path.join(TMP, 'render-servidor.cjs'),
  logLevel: 'error',
  plugins: [
    {
      name: 'servidor-da-validacao',
      setup(build) {
        build.onResolve({ filter: /^(@vercel\/blob|@\/lib\/db|@\/lib\/posts\/register-project-fonts|@\/server\/google-drive-service)$/ }, () => ({
          path: path.join(AQUI, 'stub-servidor.ts'),
        }))
        build.onResolve({ filter: /^@\// }, doRepo)
      },
    },
  ],
})
fs.writeFileSync(
  path.join(TMP, 'index.html'),
  '<!doctype html><body style="margin:0"><div id="palco"></div><script src="pagina.js"></script></body>',
)

// ── Servidor local (o <video> precisa de Range e de CORS para o canvas) ─────
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.mp4': 'video/mp4', '.webm': 'video/webm', '.png': 'image/png' }
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
  // trocar de página zera o relógio (é o que o PageSync faz no editor)
  await pagina.evaluate(() => {
    window.validacao.zerar()
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
 * Centros (x) das linhas claras da grade na linha de pixels `y`, um array por
 * quadro, em resolução cheia e com TODOS os quadros (passthrough). Serve ao
 * WebM gravado e ao PNG do render de servidor.
 */
function centrosNaLinha(arquivo, y) {
  const bruto = execFileSync(
    'ffmpeg',
    ['-v', 'error', '-i', arquivo, '-fps_mode', 'passthrough', '-vf', `scale=1080:1920,crop=1080:1:0:${y}`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'],
    { maxBuffer: 1 << 28 },
  )
  const quadros = []
  for (let i = 0; (i + 1) * 1080 <= bruto.length; i++) {
    const linha = bruto.subarray(i * 1080, (i + 1) * 1080)
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
const exportarGrade = async (camadas, nome) => {
  await montar(camadas)
  await dormir(900) // as fotos carregam
  const r = await pagina.evaluate((f) => window.validacao.exportarSemVideo(f), MUSICA)
  const webm = path.join(TMP, nome)
  fs.writeFileSync(webm, Buffer.from(r.base64, 'base64'))
  return webm
}
const pares = (quadros) => quadros.filter((c) => c.length === 2).map(([a, b]) => ({ d: b - a, meio: (a + b) / 2 }))
const perto = (v, alvo, tol) => Math.abs(v - alvo) <= tol
const ESCALA = 1.15
const TOL = ESCALA * 0.02
let primeiroAfastar = null
{
  const q = pares(centrosNaLinha(await exportarGrade([grade('g', { movimento: 'aproximar' })], 'mov-aproximar.webm'), 960))
  const r = q.length > 10 ? q.at(-1).d / q[0].d : 0
  conferir('aproximar: do primeiro ao último quadro o conteúdo cresce 1,15× (±2%)', perto(r, ESCALA, TOL), `${q.length} quadros · ${q[0]?.d} → ${q.at(-1)?.d} px · ×${r.toFixed(3)}`)
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
  const a = (await pagina.evaluate(() => window.validacao.camadas())).find((l) => l.id === 'a')
  conferir('arrastar 100×50 com a prévia parada grava a posição sem o efeito', perto(a.position.x, 100, 1) && perto(a.position.y, 50, 1), JSON.stringify(a.position))
  const depois = await pagina.evaluate(() => window.validacao.efeito('a'))
  conferir('ao soltar, o movimento volta, na posição nova', !!depois && perto(depois.escala, 1.075, 0.005) && perto(depois.x, 640, 1), JSON.stringify(depois))
}
{
  // Render de SERVIDOR pela porta real (persist → page-to-design-data →
  // camadasNoInstante → CanvasRenderer): o PNG é o quadro 0 do editor. A
  // página vem SEM áudio, como chega de quem monta à mão: o persist o lê do
  // banco (o stub devolve PROVA_AUDIO)
  const paginaJson = path.join(TMP, 'pagina-servidor.json')
  const renderizar = (audio, png) => {
    const camadaDoServidor = { ...grade('g', { movimento: 'afastar' }), fileUrl: path.join(TMP, 'grade.png') }
    fs.writeFileSync(paginaJson, JSON.stringify({ id: 'prova', name: 'Prova', width: 1080, height: 1920, background: '#000000', layers: [camadaDoServidor] }))
    execFileSync(process.execPath, [path.join(TMP, 'render-servidor.cjs'), paginaJson], {
      cwd: RAIZ,
      env: { ...process.env, NODE_PATH: path.join(RAIZ, 'node_modules'), PROVA_SAIDA: png, PROVA_AUDIO: JSON.stringify(audio) },
      stdio: ['ignore', 'ignore', 'inherit'],
    })
    return centrosNaLinha(png, 960)[0] ?? []
  }
  const doServidor = renderizar({ source: 'library', musicId: 1, startTime: 0, endTime: MUSICA }, path.join(TMP, 'servidor.png'))
  conferir(
    'render de servidor (afastar) = primeiro quadro do editor (±2 px)',
    doServidor.length === 2 && primeiroAfastar?.length === 2 && doServidor.every((c, i) => perto(c, primeiroAfastar[i], 2)),
    `servidor ${JSON.stringify(doServidor)} · editor ${JSON.stringify(primeiroAfastar)}`,
  )
  const semMusica = renderizar(null, path.join(TMP, 'servidor-sem-musica.png'))
  conferir('controle: sem música a página não é vídeo e a foto sai parada', semMusica.length === 2 && perto(semMusica[1] - semMusica[0], 400, 2), JSON.stringify(semMusica))
}

conferir('nenhum erro de JavaScript na página', errosDaPagina.length === 0, errosDaPagina.slice(0, 3).join(' | '))
console.log(`\n${falhas === 0 ? 'TUDO OK' : falhas + ' FALHA(S)'}  (arquivos em ${TMP})`)
await navegador.close()
servidor.closeAllConnections?.()
servidor.close()
process.exit(falhas === 0 ? 0 : 1)
