// Gera motions de texto com fundo transparente (WebM VP9 com alfa, 1080x1920)
// para o editor do Studio: o arquivo entra pela aba Vídeos como motion, por cima
// de uma foto ou de um vídeo. Toca uma vez e segura o último quadro — por isso
// só há animação de ENTRADA.
//
// uso:  node scripts/motions/gerar-motion.mjs <spec.json> [--so <id>] [--quadro <segundos>] [--saida <pasta>]
//       --so      gera só a peça com esse id
//       --saida   pasta de destino (padrão: a do spec, relativa a ele)
//       --quadro  em vez do vídeo, grava um PNG daquele instante (conferência)
// O spec traz o kit da marca (fontes, cores, ícones — por URL ou caminho) e as
// peças. Texto entre [colchetes] sai em destaque, como na copy do compositor.
// Molde: scripts/motions/wine-vix.json.
import { createRequire } from 'node:module'
import { spawn, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { createCanvas, GlobalFonts, loadImage } = require('@napi-rs/canvas')

const W = 1080, H = 1920, FPS = 30
const args = process.argv.slice(2)
const opcao = (nome) => (args.includes(nome) ? args[args.indexOf(nome) + 1] : undefined)
const specPath = args[0]
if (!specPath) { console.error('uso: node scripts/motions/gerar-motion.mjs <spec.json> [--so <id>] [--quadro <s>]'); process.exit(1) }
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'))
const kit = spec.kit
const cache = path.join(os.homedir(), '.cache', 'studio-motions', kit.slug)
fs.mkdirSync(cache, { recursive: true })

// Arquivo do kit: caminho local, ou URL baixada uma vez para o cache.
async function arquivo(ref) {
  if (!/^https?:/.test(ref)) return path.resolve(path.dirname(specPath), ref)
  const destino = path.join(cache, decodeURIComponent(ref.split('/').pop()))
  if (!fs.existsSync(destino)) {
    const r = await fetch(ref)
    if (!r.ok) throw new Error(`não baixei ${ref}: HTTP ${r.status}`)
    fs.writeFileSync(destino, Buffer.from(await r.arrayBuffer()))
  }
  return destino
}
for (const [nome, ref] of Object.entries(kit.fontes)) GlobalFonts.registerFromPath(await arquivo(ref), nome)

// Caixa da tinta de uma imagem com alfa: ícone e logo vêm com folga em volta, e
// é pela tinta que se posiciona e dimensiona.
function caixaDaTinta(img) {
  const tmp = createCanvas(img.width, img.height)
  const tctx = tmp.getContext('2d')
  tctx.drawImage(img, 0, 0)
  const px = tctx.getImageData(0, 0, img.width, img.height).data
  let x1 = img.width, y1 = img.height, x2 = 0, y2 = 0
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    if (px[(y * img.width + x) * 4 + 3] > 16) { if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y }
  }
  return { x: x1, y: y1, w: x2 - x1 + 1, h: y2 - y1 + 1 }
}
const icones = {}
for (const [nome, ref] of Object.entries(kit.icones ?? {})) {
  const img = await loadImage(await arquivo(ref))
  icones[nome] = { img, tinta: caixaDaTinta(img) }
}

// Logo animada (vídeo com alfa): os quadros são extraídos uma vez para o cache;
// depois disso o vídeo original nem precisa estar acessível (o da Wine Vix mora no HD).
let logo = null
if (kit.logo?.imagem) {
  // logo parada (PNG com alfa): entra em fade
  const img = await loadImage(await arquivo(kit.logo.imagem))
  logo = { quadros: [img], fps: 30, tinta: caixaDaTinta(img) }
} else if (kit.logo) {
  // `quadros`: pasta com os PNG já extraídos; `video`: extrai uma vez para o cache
  const dir = kit.logo.quadros ?? path.join(cache, 'logo-animada')
  if (!fs.existsSync(dir) || !fs.readdirSync(dir).length) {
    if (!fs.existsSync(kit.logo.video)) throw new Error(`logo animada não encontrada: ${kit.logo.video} (e não há quadros em ${dir})`)
    fs.mkdirSync(dir, { recursive: true })
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', kit.logo.video, '-vf', 'scale=960:-2:flags=lanczos,format=rgba', path.join(dir, 'q%03d.png')])
  }
  const quadros = await Promise.all(fs.readdirSync(dir).filter((f) => f.endsWith('.png') && !f.startsWith('._')).sort().map((f) => loadImage(path.join(dir, f))))
  // a tinta do ÚLTIMO quadro é a logo pronta
  logo = { quadros, fps: kit.logo.fps ?? 30, tinta: caixaDaTinta(quadros[quadros.length - 1]) }
}

const c = createCanvas(W, H)
const ctx = c.getContext('2d')
const cor = (nome) => kit.cores[nome] ?? nome
const cl = (x) => Math.max(0, Math.min(1, x))
const outCubic = (p) => 1 - (1 - p) ** 3
const outQuart = (p) => 1 - (1 - p) ** 4

// ---------- texto ----------
const E = kit.estilos
const usar = (est) => { ctx.font = `${est.tam}px ${est.fonte}`; ctx.letterSpacing = `${est.ls ?? 0}px` }
const caixa = (txt, est) => (est.caixaAlta ? txt.toUpperCase() : txt)
function medir(txt, est) {
  usar(est)
  const m = ctx.measureText(txt)
  return { w: m.width - (est.ls ?? 0), asc: m.actualBoundingBoxAscent, desc: m.actualBoundingBoxDescent }
}
// "Segunda a sábado - [16h às 19h]" → trechos, o entre colchetes em destaque
function trechos(linha, est) {
  const forte = { ...est, fonte: est.fonteForte ?? est.fonte, cor: est.corForte ?? est.cor }
  let x = 0
  return linha.split(/(\[[^\]]*\])/).filter(Boolean).map((p) => {
    const destaque = p.startsWith('[')
    const e = destaque ? forte : est
    const texto = caixa(destaque ? p.slice(1, -1) : p, e)
    usar(e)
    const w = ctx.measureText(texto).width
    const t = { texto, est: e, dx: x }
    x += w
    return t
  })
}
const larguraDosTrechos = (ts) => { const u = ts[ts.length - 1]; usar(u.est); return u.dx + ctx.measureText(u.texto).width }

function pinta(txt, est, x, yBase, a, dy = 0, blur = 0, corDoTexto) {
  if (a <= 0.001) return
  ctx.save()
  ctx.globalAlpha = a
  usar(est)
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = cor(corDoTexto ?? est.cor)
  // sombra presa ao glifo: é o que segura a leitura sobre foto e vídeo, sem véu
  ctx.shadowColor = kit.sombra ?? 'rgba(20,8,4,0.6)'
  ctx.shadowBlur = 18
  ctx.shadowOffsetY = 2
  if (blur > 0.25) ctx.filter = `blur(${blur.toFixed(2)}px)`
  ctx.fillText(txt, x, yBase + dy)
  // texto pequeno leva a sombra duas vezes: uma passada só não segura sobre foto clara
  if (est.reforco ?? est.tam < 60) ctx.fillText(txt, x, yBase + dy)
  ctx.restore()
}
const entrada = (t, t0, d, sobe, desfoque, ease = outQuart) => {
  const e = ease(cl((t - t0) / d))
  return { a: e, dy: (1 - e) * sobe, blur: (1 - e) * desfoque }
}

// ---------- uma peça ----------
function montar(p) {
  const x0 = p.margem ?? kit.margem ?? 80
  // logo no canto SUPERIOR ao lado do bloco: o texto divide a linha com ela, então a coluna encolhe
  const cantoDaLogo = p.logo === false || !logo ? null : (p.logo ?? kit.logo.canto ?? 'inferior-direito')
  const logoLado = kit.logo?.tamanho ?? 190
  const logoAlturaNaPagina = logo ? logo.tinta.h * (logoLado / logo.tinta.w) : 0
  const logoTopo = kit.logo?.topo ?? p.topo ?? kit.topo ?? 250
  const logoDivideALinha = Boolean(cantoDaLogo && cantoDaLogo.startsWith('superior') && !cantoDaLogo.endsWith('centro') && (p.topo ?? kit.topo ?? 250) < logoTopo + logoAlturaNaPagina)
  const coluna = W - 2 * x0 - (logoDivideALinha ? logoLado + 36 : 0)
  const alin = p.alinhamento ?? kit.alinhamento ?? 'esquerda'
  const xDe = (w) => (alin === 'centro' ? (W - w) / 2 : alin === 'direita' ? W - x0 - w : x0)
  // título: linhas empilhadas, cada uma podendo ter fonte, corpo e caixa próprios
  // (a segunda voz da marca); encolhe tudo junto se alguma linha passar da coluna
  const titulo = p.titulo ?? [] // peça só de serviço (rodapé de funcionamento) não tem título
  let k = 1
  const estDa = (l) => {
    const e = { ...E.titulo, ...(l.fonte && { fonte: l.fonte }), ...(l.ls !== undefined && { ls: l.ls }), ...(l.caixaAlta !== undefined && { caixaAlta: l.caixaAlta }) }
    return { ...e, tam: Math.round((l.tam ?? p.tamTitulo ?? E.titulo.tam) * k) }
  }
  const largura = () => Math.max(0, ...titulo.map((l) => medir(caixa(l.texto, estDa(l)), estDa(l)).w))
  while (largura() > coluna && k > 0.5) k -= 0.02
  const linhas = []
  titulo.forEach((l, i) => {
    const est = estDa(l)
    const texto = caixa(l.texto, est)
    const m = medir(texto, est)
    let base
    if (i === 0) base = m.asc
    else {
      const ant = linhas[i - 1]
      // entrelinha da marca, descendo o mínimo para cauda e acento não se tocarem
      base = Math.max(ant.base + (l.entrelinha ?? E.titulo.entrelinha ?? 1) * est.tam, ant.base + ant.desc + 6 + m.asc)
    }
    linhas.push({ ...l, ...m, texto, est, base })
  })
  const blocos = []
  if (p.pre) blocos.push({ tipo: 'pre', h: medir(caixa(p.pre, E.pre), E.pre).asc, gap: 26 })
  if (linhas.length) {
    const ult = linhas[linhas.length - 1]
    blocos.push({ tipo: 'titulo', h: ult.base + ult.desc, gap: 30 })
    if (p.filete !== false && kit.filete !== false) blocos.push({ tipo: 'filete', h: kit.filete?.altura ?? 2, gap: 32 })
  }
  const apoio = (p.apoio ?? []).map((l) => trechos(l, E.apoio))
  if (apoio.length) blocos.push({ tipo: 'apoio', h: E.apoio.tam * (E.apoio.entrelinha ?? 1.25) * apoio.length, gap: 30 })
  if (p.cta) blocos.push({ tipo: 'cta', h: E.cta.tam * 1.2, gap: 0 })
  let y = p.topo ?? kit.topo ?? 250
  for (const b of blocos) { b.y = y; y += b.h + b.gap }
  const Y = Object.fromEntries(blocos.map((b) => [b.tipo, b]))

  // serviço: linhas com ícone, ancoradas no rodapé seguro
  const servico = (p.servico ?? []).map((s) => ({ ...s, ts: trechos(s.texto, E.servico) }))
  const passo = servico.length ? E.servico.tam * (E.servico.entrelinha ?? 1.7) : 0
  const rodape = p.rodape ?? kit.rodape ?? 1690
  servico.forEach((s, i) => { s.base = rodape - (servico.length - 1 - i) * passo })

  const t0 = p.entra ?? 0.4
  const T = { pre: t0, titulo: t0 + 0.25, filete: t0 + 0.9, apoio: t0 + 1.1, cta: t0 + 1.35, servico: t0 + 1.55, logo: t0 + 1.2 }
  // logo: canto inferior direito por padrão (a base encosta na linha do serviço); "logo": false tira
  const fim = Math.max(T.servico + servico.length * 0.15 + 0.9, cantoDaLogo ? T.logo + Math.max(0.9, logo.quadros.length / logo.fps) + 0.1 : 0)

  // Gradiente da marca atrás do texto (opcional): para a marca cuja foto é clara
  // e cujas artes sempre têm degradê atrás do texto (Real Gelateria). Faixa do topo
  // quando a peça tem bloco em cima; do rodapé quando tem serviço ou logo embaixo.
  const grad = p.gradiente === false ? null : (p.gradiente ?? kit.gradiente)
  // O bloco pode estar em cima ou embaixo (peça com `topo` alto): a faixa que o cobre é a
  // da metade em que ele mora, esticada até passar dele.
  const blocoY = blocos.length ? blocos[0].y : null
  const blocoEmCima = blocoY !== null && blocoY < H * 0.45
  const temTopo = blocoEmCima || Boolean(cantoDaLogo?.startsWith('superior'))
  const temRodape = Boolean(servico.length || cantoDaLogo?.startsWith('inferior') || (blocoY !== null && !blocoEmCima))
  const alcanceTopo = blocoEmCima ? y + 220 : 0
  const alcanceRodape = blocoY !== null && !blocoEmCima ? H - blocoY + 260 : 0
  function faixa(deCima, cfg, a) {
    if (!cfg || a <= 0) return
    const h = Math.max(cfg.altura ?? 700, deCima ? alcanceTopo : alcanceRodape)
    const [r, g, b] = (cor(grad.cor).match(/[0-9a-f]{2}/gi) ?? ['00', '00', '00']).map((x) => parseInt(x, 16))
    const lg = deCima ? ctx.createLinearGradient(0, 0, 0, h) : ctx.createLinearGradient(0, H, 0, H - h)
    // curva suave (cheia na borda, some sem degrau), todas as paradas na MESMA cor
    for (const [pos, forca] of [[0, 1], [0.3, 0.86], [0.55, 0.52], [0.8, 0.16], [1, 0]]) lg.addColorStop(pos, `rgba(${r},${g},${b},${forca})`)
    ctx.save()
    ctx.globalAlpha = (cfg.forca ?? 0.7) * a
    ctx.fillStyle = lg
    ctx.fillRect(0, deCima ? 0 : H - h, W, h)
    ctx.restore()
  }

  function desenhar(t) {
    ctx.clearRect(0, 0, W, H)
    if (grad) {
      const a = outCubic(cl((t - t0 + 0.2) / 0.9))
      if (temTopo) faixa(true, grad.topo, a)
      if (temRodape) faixa(false, grad.rodape, a)
    }
    if (p.pre) {
      const txt = caixa(p.pre, E.pre)
      const yb = Y.pre.y + Y.pre.h
      const xPre = xDe(medir(txt, E.pre).w)
      for (let i = 0; i < txt.length; i++) {
        if (txt[i] === ' ') continue
        usar(E.pre)
        const dx = ctx.measureText(txt.slice(0, i)).width
        const s = entrada(t, T.pre + i * 0.022, 0.6, 12, 5, outCubic)
        pinta(txt[i], { ...E.pre, ls: 0 }, xPre + dx, yb, s.a, s.dy, s.blur)
      }
    }
    linhas.forEach((l, i) => {
      const s = entrada(t, T.titulo + i * 0.18, 0.95, 30, 9)
      // sombra DURA (nítida, deslocada, numa cor da paleta) por baixo da letra, quando a marca pede
      const sd = l.sombraDura ?? E.titulo.sombraDura
      if (sd) pinta(l.texto, l.est, xDe(l.w) + (sd.dx ?? 5), Y.titulo.y + l.base + (sd.dy ?? 5), s.a, s.dy, s.blur, sd.cor)
      pinta(l.texto, l.est, xDe(l.w), Y.titulo.y + l.base, s.a, s.dy, s.blur, l.cor ?? l.est.cor)
    })
    if (Y.filete) {
      // filete que se desenha a partir do alinhamento; `ponto` é o ponto na ponta (Wine Vix)
      const e = outCubic(cl((t - T.filete) / 0.7))
      if (e > 0) {
        const cheio = kit.filete?.largura ?? 150
        const w = cheio * e
        const xf = alin === 'centro' ? (W - w) / 2 : alin === 'direita' ? W - x0 - w : x0
        ctx.save()
        ctx.fillStyle = cor(kit.filete?.cor ?? 'destaque')
        ctx.shadowColor = 'rgba(20,8,4,0.45)'; ctx.shadowBlur = 10
        ctx.fillRect(xf, Y.filete.y, w, Y.filete.h)
        if (kit.filete?.ponto !== false && alin === 'esquerda') {
          ctx.globalAlpha = cl((t - T.filete - 0.45) / 0.3)
          ctx.beginPath(); ctx.arc(x0 + w + 10, Y.filete.y + 1, 4, 0, Math.PI * 2); ctx.fill()
        }
        ctx.restore()
      }
    }
    apoio.forEach((ts, i) => {
      const s = entrada(t, T.apoio + i * 0.12, 0.7, 14, 5, outCubic)
      const yb = Y.apoio.y + E.apoio.tam + i * E.apoio.tam * (E.apoio.entrelinha ?? 1.25)
      const xa = xDe(larguraDosTrechos(ts))
      for (const tr of ts) pinta(tr.texto, tr.est, xa + tr.dx, yb, s.a, s.dy, s.blur)
    })
    if (p.cta) {
      const s = entrada(t, T.cta, 0.7, 14, 5, outCubic)
      const txt = caixa(p.cta, E.cta)
      pinta(txt, E.cta, xDe(medir(txt, E.cta).w), Y.cta.y + E.cta.tam, s.a, s.dy, s.blur)
    }
    servico.forEach((sv, i) => {
      const s = entrada(t, T.servico + i * 0.15, 0.7, 12, 4, outCubic)
      const ic = sv.icone && icones[sv.icone]
      const xs = xDe(larguraDosTrechos(sv.ts) + (ic ? E.servico.tam * 1.2 + 16 : 0))
      let x = xs
      if (ic) {
        // a TINTA do ícone tem a altura de ~1,2 corpo, centrada na altura do x
        const ki = (E.servico.tam * 1.2) / ic.tinta.h
        const vaga = E.servico.tam * 1.2 // ícones de larguras diferentes, textos no mesmo x
        ctx.save()
        ctx.globalAlpha = s.a
        ctx.shadowColor = 'rgba(20,8,4,0.6)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 2
        const xi = xs + (vaga - ic.tinta.w * ki) / 2 - ic.tinta.x * ki
        const yi = sv.base - E.servico.tam * 0.36 - (ic.tinta.h * ki) / 2 - ic.tinta.y * ki + s.dy
        ctx.drawImage(ic.img, xi, yi, ic.img.width * ki, ic.img.height * ki)
        ctx.restore()
        x += vaga + 16
      }
      for (const tr of sv.ts) pinta(tr.texto, tr.est, x + tr.dx, sv.base, s.a, s.dy, s.blur)
    })
    if (cantoDaLogo && t >= T.logo) {
      const img = logo.quadros[Math.min(logo.quadros.length - 1, Math.floor((t - T.logo) * logo.fps))]
      // `tamanho` é a LARGURA da tinta da logo; cantos: superior|inferior + esquerdo|centro|direito
      const lado = logoLado
      const s = lado / logo.tinta.w
      const x = cantoDaLogo.endsWith('esquerdo') ? x0 : cantoDaLogo.endsWith('centro') ? (W - lado) / 2 : W - x0 - lado
      const yTopo = cantoDaLogo.startsWith('superior') ? logoTopo : rodape + 10 - logo.tinta.h * s
      ctx.save()
      // logo parada entra em fade; a animada já traz a própria entrada
      if (logo.quadros.length === 1) ctx.globalAlpha = outCubic(cl((t - T.logo) / 0.8))
      if (kit.logo.sombra !== false) { ctx.shadowColor = 'rgba(20,8,4,0.5)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 2 }
      ctx.drawImage(img, x - logo.tinta.x * s, yTopo - logo.tinta.y * s, img.width * s, img.height * s)
      ctx.restore()
    }
  }
  const passou = [...apoio, ...servico.map((s) => s.ts)].filter((ts) => larguraDosTrechos(ts) > coluna)
  if (passou.length) console.warn(`  ⚠ ${p.id}: ${passou.length} linha(s) passam da coluna de ${coluna}px`)
  return { desenhar, fim, corpo: linhas[0]?.est.tam ?? 0 }
}

async function gravar(p, pasta) {
  const { desenhar, fim, corpo } = montar(p)
  const quadro = opcao('--quadro')
  if (quadro !== undefined) {
    desenhar(Number(quadro))
    const png = path.join(pasta, `${p.id}.png`)
    fs.writeFileSync(png, await c.encode('png'))
    return console.log(`quadro ok: ${png}`)
  }
  const saida = path.join(pasta, `${p.id}.webm`)
  const n = Math.round((p.duracao ?? kit.duracao ?? 8) * FPS)
  const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-',
    // matriz BT.709 explícita: o padrão do swscale é 601 e o dourado mudaria de tom sobre o vídeo
    '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuva420p',
    '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '24', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', '-auto-alt-ref', '0',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-an', saida],
  { stdio: ['pipe', 'inherit', 'pipe'] })
  // "Truncating packet…" é o ffmpeg tentando ler um quadro a mais no fim do pipe: não é erro
  ff.stderr.on('data', (d) => { if (!String(d).includes('Truncating packet')) process.stderr.write(d) })
  let parado = null
  for (let q = 0; q < n; q++) {
    const t = q / FPS
    let buf = t > fim ? parado : null
    if (!buf) {
      desenhar(t)
      buf = Buffer.from(ctx.getImageData(0, 0, W, H).data.buffer)
      if (t > fim) parado = buf
    }
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r))
  }
  ff.stdin.end()
  await new Promise((r, j) => ff.on('close', (code) => (code ? j(new Error(`ffmpeg ${code}`)) : r())))
  // a prova de que a transparência sobreviveu (a mesma de converter-motion.sh)
  const alfa = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream_tags=alpha_mode', '-of', 'csv=p=0', saida]).toString().trim()
  if (alfa !== '1') throw new Error(`${saida} saiu sem transparência`)
  // o editor segura o ÚLTIMO quadro: ele tem de ter tinta
  const fimDoVideo = execFileSync('ffmpeg', ['-v', 'error', '-c:v', 'libvpx-vp9', '-sseof', '-0.2', '-i', saida,
    '-vf', 'alphaextract,scale=108:192', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { stdio: ['ignore', 'pipe', 'ignore'] })
  if (!fimDoVideo.subarray(-108 * 192).some((v) => v > 16)) throw new Error(`${saida}: o último quadro saiu vazio`)
  console.log(`ok  ${saida}  (${(fs.statSync(saida).size / 1024).toFixed(0)} KB, título ${corpo}px)`)
}

const pasta = path.resolve(path.dirname(specPath), opcao('--saida') ?? spec.saida)
fs.mkdirSync(pasta, { recursive: true })
const so = opcao('--so')
const pecas = spec.pecas.filter((p) => !so || p.id === so)
if (!pecas.length) { console.error(`nenhuma peça com id "${so}"`); process.exit(1) }
for (const p of pecas) await gravar(p, pasta)
