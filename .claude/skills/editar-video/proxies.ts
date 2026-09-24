/**
 * Etapa 3 — proxies H.264 1080p dos brutos, em 02_PROXIES espelhando 01_BRUTO.
 *
 *   npx tsx .claude/skills/editar-video/proxies.ts <pasta do projeto> [--jobs 2]
 *
 * Mesmo nome (extensão .mp4), MESMA taxa de quadros e MESMA contagem de quadros do
 * bruto: é isso que deixa o Resolve trocar um pelo outro (LinkProxyMedia) e a análise
 * do Gemini devolver quadros que valem no original. O menor lado vai a 1080.
 * Proxy que já existe e confere é pulado; o que não confere é refeito.
 *
 * Codificação por hardware (h264_videotoolbox). Bruto com rotação na metadado sai
 * em pé no proxy (o ffmpeg aplica a rotação).
 * ponytail: rotação só conferida em material sem giro; no 1º projeto com Sony girada, confira o proxy no Resolve.
 */
import { spawn, execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, renameSync, statSync } from 'node:fs'
import { dirname, extname, join, relative } from 'node:path'
import { PASTAS, VIDEO } from './estrutura'

type Info = { quadros: number; fps: string; duracao: number }

function sondar(arquivo: string): Info | null {
  try {
    const j = JSON.parse(
      execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=nb_frames,avg_frame_rate,duration', '-of', 'json', arquivo], { encoding: 'utf8' }),
    ).streams[0]
    return { quadros: Number(j.nb_frames), fps: j.avg_frame_rate, duracao: Number(j.duration) }
  } catch {
    return null
  }
}

export function caminhoDoProxy(raiz: string, bruto: string) {
  const rel = relative(join(raiz, PASTAS.bruto), bruto)
  return join(raiz, PASTAS.proxies, rel.replace(/\.[^.]+$/, '.mp4'))
}

/** O proxy vale se tem o mesmo fps e o mesmo número de quadros (tolerância de 1). */
function confere(b: Info, p: Info | null) {
  return !!p && p.fps === b.fps && Math.abs(p.quadros - b.quadros) <= 1
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

function gerar(bruto: string, destino: string, info: Info): Promise<void> {
  const fps = Number(info.fps.split('/')[0]) / Number(info.fps.split('/')[1] ?? 1)
  const temp = destino.replace(/\.mp4$/, '.parcial.mp4')
  mkdirSync(dirname(destino), { recursive: true })
  const args = [
    '-v', 'error', '-y', '-i', bruto,
    '-map', '0:v:0', '-map', '0:a:0?',
    '-vf', "scale='if(gt(iw,ih),-2,1080)':'if(gt(iw,ih),1080,-2)'",
    '-fps_mode', 'passthrough',
    '-c:v', 'h264_videotoolbox', '-b:v', fps > 60 ? '20M' : '10M', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k',
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
      if (existsSync(proxy) && confere(b, sondar(proxy))) {
        resultado.push({ bruto: rel, proxy: relative(raiz, proxy), situacao: 'já existia' })
        continue
      }
      const t = Date.now()
      try {
        await gerar(bruto, proxy, b)
        const ok = confere(b, sondar(proxy))
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

main()
