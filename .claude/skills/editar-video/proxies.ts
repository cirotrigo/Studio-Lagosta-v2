/**
 * Etapa 3 — proxies H.264 1080p dos brutos, em 02_PROXIES espelhando 01_BRUTO.
 *
 *   npx tsx .claude/skills/editar-video/proxies.ts <pasta do projeto> [--jobs 2]
 *   npx tsx .claude/skills/editar-video/proxies.ts --autoteste
 *
 * Mesmo nome (extensão .mp4), MESMA contagem de quadros do bruto e o fps que o RESOLVE lê
 * nele: é isso que deixa o Resolve trocar um pelo outro (LinkProxyMedia) e a análise
 * do Gemini devolver quadros que valem no original. O menor lado vai a 1080.
 * Proxy que já existe e confere é pulado; o que não confere é refeito.
 *
 * FPS: vem de 04_DAVINCI/fps.json (o "FPS" que o resolve_projeto.py leu de cada clipe) e o
 * proxy sai CFR nele (setpts=N/fps/TB, mesmos quadros). O iPhone grava VFR: avg_frame_rate
 * 176700/5893, r_frame_rate 30000/1001 em uns, e o Resolve lê 30.0 em todos; proxy a 29,97
 * é recusado (Salt, Fire & Drive, 02/10/2026). Sem o arquivo, cai no r_frame_rate, com aviso,
 * e o proxy que já existe só tem os quadros conferidos (para não refazer um bom no fps errado).
 *
 * TIMECODE: o Resolve só liga proxy com o mesmo timecode do bruto (sem timecode, recusa).
 * O texto vem de 04_DAVINCI/timecodes.json, gravado pelo resolve_projeto.py com o Start TC
 * que o PRÓPRIO Resolve leu — por isso o projeto é criado antes dos proxies. A Sony a 120p
 * é lida como 17:28:14;030 e o ffprobe diz 17:28:14:60: gravar o do ffprobe NÃO liga
 * (medido em 24/09/2026). Sem o arquivo, cai no timecode do ffprobe, com aviso.
 *
 * Codificação por hardware (h264_videotoolbox). Bruto com rotação na metadado sai
 * em pé no proxy (o ffmpeg aplica a rotação).
 * ponytail: rotação só conferida em material sem giro; no 1º projeto com Sony girada, confira o proxy no Resolve.
 */
import { spawn, execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, extname, join, relative } from 'node:path'
import assert from 'node:assert/strict'
import { PASTAS, VIDEO } from './estrutura'

type Info = { quadros: number; fps: string; nominal: string; duracao: number; tc: string | null }

function sondar(arquivo: string): Info | null {
  try {
    const j = JSON.parse(
      execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,nb_frames,avg_frame_rate,r_frame_rate,duration:stream_tags=timecode:format_tags=timecode', '-of', 'json', arquivo], { encoding: 'utf8' }),
    )
    const v = j.streams.find((s: any) => s.codec_type === 'video')
    const tc = [...j.streams.map((s: any) => s.tags?.timecode), j.format?.tags?.timecode].find(Boolean) ?? null
    return { quadros: Number(v.nb_frames), fps: v.avg_frame_rate, nominal: v.r_frame_rate, duracao: Number(v.duration), tc }
  } catch {
    return null
  }
}

export function caminhoDoProxy(raiz: string, bruto: string) {
  const rel = relative(join(raiz, PASTAS.bruto), bruto)
  return join(raiz, PASTAS.proxies, rel.replace(/\.[^.]+$/, '.mp4'))
}

const valor = (f: string) => Number(f.split('/')[0]) / Number(f.split('/')[1] ?? 1)

/** FPS do Resolve (30.0, 29.97, 119.88) → fração exata para o ffmpeg; mesma regra do fps_real do montar.py. */
export function fracao(x: number) {
  const k = Math.round(x * 1.001)
  if (Math.abs(x - k / 1.001) < 0.005 && Math.abs(x - k) > 0.005) return `${k * 1000}/1001`
  return Math.abs(x - Math.round(x)) < 0.005 ? `${Math.round(x)}/1` : String(x)
}

/**
 * O proxy vale se tem o mesmo número de quadros (tolerância de 1), o fps nominal (sem ele, só os quadros)
 * e timecode quando o bruto tem. NUNCA o avg_frame_rate do bruto: no VFR do iPhone ele não é o que o Resolve lê.
 */
function confere(b: Info, p: Info | null, tcEsperado: string | null, fps: string | null) {
  return !!p && Math.abs(p.quadros - b.quadros) <= 1 && (!fps || Math.abs(valor(p.fps) / valor(fps) - 1) < 1e-4) && (!tcEsperado || !!p.tc)
}

function doResolve(raiz: string, arquivo: string): Record<string, string | number> | null {
  const p = join(raiz, '04_DAVINCI', arquivo)
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null
}

function brutos(raiz: string) {
  const out: string[] = []
  const visitar = (d: string) => {
    for (const n of readdirSync(d).sort()) {
      if (n.startsWith('.') || n === '_analise') continue
      const p = join(d, n)
      if (statSync(p).isDirectory()) visitar(p)
      else if (VIDEO.has(extname(n).toLowerCase())) out.push(p)
    }
  }
  visitar(join(raiz, PASTAS.bruto))
  return out
}

function gerar(bruto: string, destino: string, fps: string, tc: string | null): Promise<void> {
  const temp = destino.replace(/\.mp4$/, '.parcial.mp4')
  mkdirSync(dirname(destino), { recursive: true })
  const args = [
    '-v', 'error', '-y', '-i', bruto,
    '-map', '0:v:0', '-map', '0:a:0?',
    // quadro N no instante N/fps: CFR no fps do Resolve, sem quadro a mais nem a menos
    '-vf', `setpts=N/(${fps})/TB,scale='if(gt(iw,ih),-2,1080)':'if(gt(iw,ih),1080,-2)'`,
    '-r', fps,
    '-c:v', 'h264_videotoolbox', '-b:v', valor(fps) > 60 ? '20M' : '10M', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k',
    ...(tc ? ['-timecode', tc] : []),
    '-movflags', '+faststart', temp,
  ]
  return new Promise((ok, falha) => {
    const p = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let erro = ''
    p.stderr.on('data', (d) => (erro += d))
    p.on('close', (c) => {
      if (c !== 0) return falha(new Error(erro.trim() || `ffmpeg saiu com ${c}`))
      renameSync(temp, destino) // só vira proxy quando terminou: interrompido não passa por pronto
      ok()
    })
  })
}

async function main() {
  const a = process.argv.slice(2)
  const raiz = a.find((x) => !x.startsWith('--') && a[a.indexOf(x) - 1] !== '--jobs')
  if (!raiz || !existsSync(join(raiz, PASTAS.bruto))) {
    console.error(`uso: proxies.ts <pasta do projeto> [--jobs 2]  (precisa de ${PASTAS.bruto}; rode organizar.ts antes)`)
    process.exit(2)
  }
  const j = a.indexOf('--jobs')
  const jobs = j >= 0 ? Number(a[j + 1]) : 2
  const fila = brutos(raiz)
  const tcs = doResolve(raiz, 'timecodes.json') as Record<string, string> | null
  if (!tcs) console.error('⚠️ sem 04_DAVINCI/timecodes.json (rode o resolve_projeto.py antes): usando o timecode do ffprobe, que o Resolve pode recusar')
  const fpsResolve = doResolve(raiz, 'fps.json')
  if (!fpsResolve) console.error('⚠️ sem 04_DAVINCI/fps.json (rode o resolve_projeto.py antes): proxy novo sai no r_frame_rate do ffprobe, que no iPhone pode não ser o que o Resolve lê')
  const resultado: { bruto: string; proxy: string; situacao: string }[] = []
  let i = 0
  const trabalhador = async () => {
    while (i < fila.length) {
      const bruto = fila[i++]
      const proxy = caminhoDoProxy(raiz, bruto)
      const b = sondar(bruto)
      const rel = relative(raiz, bruto)
      if (!b) {
        resultado.push({ bruto: rel, proxy: '', situacao: 'bruto ilegível' })
        continue
      }
      const tc = tcs?.[rel] ?? b.tc
      const lido = Number(fpsResolve?.[rel])
      const alvo = lido > 0 ? fracao(lido) : null
      if (existsSync(proxy) && confere(b, sondar(proxy), tc, alvo)) {
        resultado.push({ bruto: rel, proxy: relative(raiz, proxy), situacao: 'já existia' })
        continue
      }
      const t = Date.now()
      try {
        await gerar(bruto, proxy, alvo ?? b.nominal, tc)
        const ok = confere(b, sondar(proxy), tc, alvo ?? b.nominal)
        resultado.push({ bruto: rel, proxy: relative(raiz, proxy), situacao: ok ? 'gerado' : 'gerado, mas NÃO confere quadros/fps' })
        console.error(`✓ ${rel} (${((Date.now() - t) / 1000).toFixed(0)} s)${ok ? '' : ' ⚠️ não confere'}`)
      } catch (e) {
        resultado.push({ bruto: rel, proxy: '', situacao: `falhou: ${(e as Error).message}` })
        console.error(`✗ ${rel}: ${(e as Error).message}`)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, jobs) }, trabalhador))
  console.log(JSON.stringify({ raiz, proxies: resultado }, null, 2))
}

/** Clipe VFR como o do iPhone (escala 600, quadros de 20 e 21 tiques): o proxy sai no fps do Resolve com os mesmos quadros. */
async function autoteste() {
  assert.equal(fracao(30), '30/1')
  assert.equal(fracao(29.97), '30000/1001')
  assert.equal(fracao(119.88), '120000/1001')
  assert.equal(fracao(25), '25/1')
  const d = mkdtempSync(join(tmpdir(), 'proxies-autoteste-'))
  try {
    const bruto = join(d, 'IMG_8822.MOV')
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=30:duration=6',
      '-vf', 'settb=1/600,setpts=N*20+floor(N/20)', '-fps_mode', 'passthrough', '-enc_time_base', '1/600',
      '-c:v', 'mpeg4', bruto])
    const b = sondar(bruto)!
    assert.ok(Math.abs(valor(b.fps) - 30) > 0.01, `o bruto de teste tem de ser VFR (avg ${b.fps})`)
    for (const fps of ['30/1', '30000/1001']) {
      const proxy = join(d, `proxy-${fps.replace('/', '_')}.mp4`)
      await gerar(bruto, proxy, fps, null)
      const p = sondar(proxy)!
      assert.equal(p.quadros, b.quadros, `${fps}: mesmos quadros`)
      assert.equal(p.fps, fps, `${fps}: proxy CFR no fps pedido`)
      assert.ok(confere(b, p, null, fps), `${fps}: tem de conferir`)
      assert.ok(!confere(b, p, null, fps === '30/1' ? '30000/1001' : '30/1'), `${fps}: 30 e 29,97 não podem conferir entre si`)
      assert.ok(confere(b, p, null, null), `${fps}: sem fps do Resolve, só os quadros`)
    }
    console.log(`autoteste ok (bruto avg ${b.fps}, r ${b.nominal}, ${b.quadros} quadros)`)
  } finally {
    rmSync(d, { recursive: true, force: true })
  }
}

if (process.argv.includes('--autoteste')) autoteste()
else main()
