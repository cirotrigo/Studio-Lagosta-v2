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
 * O que prova: o motion (WebM com alfa) acompanha o relógio do vídeo principal
 * no editor — carregando junto ou depois, com pausa, autoplay desligado, corte,
 * volta do loop, vídeo oculto — e sai alinhado no vídeo exportado.
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

// ── Bundle da página ─────────────────────────────────────────────────────────
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
        build.onResolve({ filter: /^@\/contexts\/template-editor-context$/ }, () => ({
          path: path.join(AQUI, 'stub-contexto.tsx'),
        }))
        build.onResolve({ filter: /^@\// }, (args) => {
          const base = path.join(RAIZ, 'src', args.path.slice(2))
          for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx', '']) {
            if (fs.existsSync(base + ext) && fs.statSync(base + ext).isFile()) return { path: base + ext }
          }
          return { errors: [{ text: 'não achei ' + args.path }] }
        })
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
  await pagina.evaluate(() => window.validacao.set([]))
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
    })
  }
  return quadros
}

let falhas = 0
const conferir = (nome, ok, detalhe = '') => {
  console.log(`  ${ok ? 'OK    ' : 'FALHOU'} ${nome}${detalhe ? ' — ' + detalhe : ''}`)
  if (!ok) falhas++
}
const FIM_DO_MOTION = 2.9 // 3 s menos a margem do último quadro
const junto = (e) => Math.abs(e.motion.t - e.base.t)

console.log('\n=== A. vídeo + motion, carregando juntos ===')
await montar([base(), motion()])
conferir('os dois carregaram', await prontos(['base', 'motion']))
{
  const s = await amostrar(8000)
  const andando = s.filter((e) => e.base.t > 0.4 && e.base.t < 2.6)
  const pior = Math.max(...andando.map(junto))
  conferir('o motion anda junto com o vídeo', andando.length > 5 && pior < 0.35, `${andando.length} amostras, pior desvio ${pior.toFixed(2)} s`)
  const depois = s.filter((e) => e.base.t > 3.4 && e.base.t < 5.6)
  conferir('o motion segura o último quadro quando acaba', depois.length > 5 && depois.every((e) => e.motion.t >= FIM_DO_MOTION && e.motion.pausado), `${depois.length} amostras`)
  const volta = s.findIndex((e, i) => i > 0 && e.base.t < s[i - 1].base.t - 1)
  conferir('o vídeo deu a volta e o motion recomeçou com ele', volta > 0 && s.slice(volta + 3, volta + 12).some((e) => junto(e) < 0.35 && !e.motion.pausado))
}

console.log('\n=== B. motion inserido com o vídeo já tocando ===')
await montar([base()])
await prontos(['base'])
await dormir(900)
await pagina.evaluate((m) => window.validacao.set([...window.validacao.camadas(), m]), motion())
conferir('o motion carregou', await prontos(['base', 'motion']))
await dormir(700)
{
  const e = await estado()
  conferir('entrou no tempo do vídeo', e.base.t < 2.6 ? junto(e) < 0.35 : e.motion.t >= FIM_DO_MOTION, `vídeo ${e.base.t} · motion ${e.motion.t}`)
}

console.log('\n=== C. pausar e tocar o vídeo ===')
await montar([base(), motion()])
await prontos(['base', 'motion'])
await dormir(800)
await pagina.evaluate(() => window.validacao.controle('base', 'pause'))
await dormir(500)
{
  const e = await estado()
  conferir('pausou junto, no mesmo quadro', e.base.pausado && e.motion.pausado && junto(e) < 0.1, `vídeo ${e.base.t} · motion ${e.motion.t}`)
  await pagina.evaluate(() => window.validacao.controle('base', 'play'))
  await dormir(700)
  const f = await estado()
  conferir('voltou a tocar junto', !f.base.pausado && !f.motion.pausado && junto(f) < 0.35 && f.base.t > e.base.t, `vídeo ${f.base.t} · motion ${f.motion.t}`)
}

console.log('\n=== D. vídeo com autoplay desligado ===')
await montar([base({ autoplay: false }), motion()])
await prontos(['base', 'motion'])
await dormir(900)
{
  const e = await estado()
  conferir('o motion não toca sozinho', e.base.pausado && e.motion.pausado && e.motion.t < 0.1, `vídeo ${e.base.t} · motion ${e.motion.t}`)
  // Desfazer no editor devolve o autoplay ao metadata: o vídeo tem de voltar a tocar.
  await pagina.evaluate(() => window.validacao.mudar('base', { autoplay: true }))
  await dormir(900)
  const f = await estado()
  conferir('religado o autoplay, os dois voltam a tocar', !f.base.pausado && f.base.t > 0.3 && junto(f) < 0.35, `vídeo ${f.base.t} · motion ${f.motion.t}`)
}

console.log('\n=== D2. trocar o arquivo do vídeo e pausar ===')
await montar([base()])
await prontos(['base'])
await pagina.evaluate(() => window.validacao.set(window.validacao.camadas().map((l) => ({ ...l, fileUrl: l.fileUrl + '?v=2' }))))
await dormir(300)
conferir('o vídeo novo carregou', await prontos(['base']))
await dormir(600)
await pagina.evaluate(() => window.validacao.controle('base', 'pause'))
await dormir(400)
{
  const e = await estado()
  conferir('o controle pausa o elemento ATUAL, não o antigo', e.base.pausado, `vídeo ${e.base.t}`)
}

console.log('\n=== E. corte no vídeo (2 s a 5 s) ===')
await montar([base({ trimStart: 2, trimEnd: 5 }), motion()])
await prontos(['base', 'motion'])
{
  const s = await amostrar(2500)
  const andando = s.filter((e) => e.base.t > 2.4 && e.base.t < 4.6)
  const pior = Math.max(...andando.map((e) => Math.abs(e.motion.t - (e.base.t - 2))))
  conferir('o motion conta a partir do início do trecho', andando.length > 5 && pior < 0.35, `${andando.length} amostras, pior desvio ${pior.toFixed(2)} s`)
  const r = await pagina.evaluate(() => window.validacao.exportar())
  const q = quadrosDo(r.base64, 'corte.webm')
  conferir('o export dura o trecho e começa nele', Math.abs(r.duracao - 3) < 0.05 && q[0].base !== null && Math.abs(q[0].base - 2) < 0.15, `duração ${r.duracao} · 1º quadro em ${q[0].base}`)
}

console.log('\n=== F. foto + motion (o motion é o vídeo principal) ===')
await montar([foto, motion()])
conferir('o motion carregou', await prontos(['motion']))
{
  const s = await amostrar(4200)
  const ultimo = s[s.length - 1].motion
  conferir('toca uma vez e para no fim', s.some((e) => e.motion.t > 0.5 && e.motion.t < 2.5) && ultimo.t > 2.8 && (ultimo.pausado || ultimo.fim), `fim em t=${ultimo.t}`)
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
await dormir(500)
await pagina.evaluate(() => window.validacao.mudar('motion', { overlay: false, loop: true }))
await dormir(3600)
{
  const e = await estado()
  conferir('desligado, vira vídeo comum e repete sozinho', !e.motion.pausado, `vídeo ${e.base.t} · motion ${e.motion.t}`)
  await pagina.evaluate(() => window.validacao.mudar('motion', { overlay: true, loop: false }))
  await dormir(700)
  const f = await estado()
  conferir('religado, volta a seguir o vídeo', f.base.t < 2.6 ? junto(f) < 0.35 : f.motion.t >= FIM_DO_MOTION, `vídeo ${f.base.t} · motion ${f.motion.t}`)
}

console.log('\n=== H. vídeo oculto + motion ===')
await montar([base({}, { visible: false }), motion()])
await prontos(['base', 'motion'])
{
  const s = await amostrar(4200)
  conferir('vídeo oculto não manda no motion', s.some((e) => e.motion.t > 0.5) && s[s.length - 1].motion.t > 2.8)
  const r = await pagina.evaluate(() => window.validacao.exportar())
  conferir('nem na duração do export', r.principal === 'motion' && Math.abs(r.duracao - 3) < 0.05, `principal ${r.principal} · duração ${r.duracao}`)
}

console.log('\n=== I. export com o editor vivo (vídeo + motion) ===')
await montar([base(), motion()])
await prontos(['base', 'motion'])
await dormir(1700) // exporta com os vídeos no meio do caminho, como no editor
{
  const r = await pagina.evaluate(() => window.validacao.exportar())
  const q = quadrosDo(r.base64, 'video-motion.webm')
  conferir('o vídeo de fundo dita a duração', r.principal === 'base' && Math.abs(r.duracao - 6) < 0.05, `duração ${r.duracao}`)
  conferir('começa do início, sem quadro de outro ponto', q[0].base !== null && q[0].base < 0.15 && q[0].motion !== null && q[0].motion < 0.15, `1º quadro: vídeo ${q[0].base} · motion ${q[0].motion}`)
  const comeco = q.filter((x) => x.t <= 2.6)
  conferir('o motion está em todos os quadros do começo', comeco.every((x) => x.motion !== null))
  const pior = Math.max(...comeco.filter((x) => x.motion !== null && x.base !== null).map((x) => Math.abs(x.motion - x.base)))
  conferir('motion e vídeo saem alinhados', pior < 0.15, `pior desvio ${pior.toFixed(2)} s`)
  const atraso = Math.max(...q.filter((x) => x.base !== null).map((x) => x.t - x.base))
  conferir('a imagem não atrasa mais que 0,25 s em relação ao relógio da gravação', atraso < 0.25, `pior atraso ${atraso.toFixed(2)} s`)
  const fim = q.filter((x) => x.t >= 3.3 && x.t <= 5.8)
  conferir('o motion segura o último quadro até o fim', fim.length > 5 && fim.every((x) => x.motion !== null && x.motion > 2.8))
}

console.log('\n=== J. motion que não carrega ===')
await montar([base(), video('motion', 'nao-existe.webm', { loop: false, overlay: true })])
await prontos(['base'])
await dormir(600)
{
  const recusa = await pagina.evaluate(() => window.validacao.exportar().then(() => null, (e) => String(e.message)))
  conferir('o export recusa em vez de gravar sem ele', !!recusa && recusa.includes('ainda não carregou'), recusa ?? 'exportou')
}

conferir('nenhum erro de JavaScript na página', errosDaPagina.length === 0, errosDaPagina.slice(0, 3).join(' | '))
console.log(`\n${falhas === 0 ? 'TUDO OK' : falhas + ' FALHA(S)'}  (arquivos em ${TMP})`)
await navegador.close()
servidor.closeAllConnections?.()
servidor.close()
process.exit(falhas === 0 ? 0 : 1)
