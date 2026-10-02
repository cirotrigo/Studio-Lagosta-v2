import { describe, expect, it } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildAudioMixArgs,
  convertWebMToMP4ServerSide,
  temFaixaDeAudio,
  type AudioMixOptions,
} from '../ffmpeg-server-converter'

const musica = { musicPath: '/tmp/m.mp3', musicStart: 2, musicVolume: 0.6, fadeInDuration: 0.5, fadeOutDuration: 1 }

describe('buildAudioMixArgs (Fase 4)', () => {
  it('um clipe só em 0 gera EXATAMENTE o comando de hoje (paridade com o legado)', () => {
    const legado = buildAudioMixArgs({ mode: 'mix', originalPath: '/tmp/v.mp4', originalTrimStart: 1.5, originalVolume: 0.8, ...musica }, 10)
    const fase4 = buildAudioMixArgs(
      { mode: 'mix', originais: [{ path: '/tmp/v.mp4', trimStart: 1.5, inicio: 0, duracao: 10 }], originalVolume: 0.8, ...musica },
      10,
    )
    expect(fase4).toEqual(legado)
    // A string de hoje, para ninguém mudar o legado sem perceber
    expect(legado.filterArgs[1]).toBe(
      '[1:a]atrim=start=1.500:duration=10.000,asetpts=PTS-STARTPTS,volume=0.800[aorig];' +
        '[2:a]atrim=start=2.000:duration=10.000,asetpts=PTS-STARTPTS,volume=0.600,afade=t=in:st=0:d=0.500,afade=t=out:st=9.000:d=1.000,apad[amus];' +
        '[aorig][amus]amix=inputs=2:duration=longest:normalize=0,apad[aout]',
    )
    expect(legado.inputArgs).toEqual(['-i', '/tmp/v.mp4', '-i', '/tmp/m.mp3'])
    expect(legado.mapArgs).toEqual(['-map', '0:v:0', '-map', '[aout]'])
  })

  it('sequência: cada clipe cortado, em estéreo, atrasado para a posição dele, e somados', () => {
    const mix: AudioMixOptions = {
      mode: 'original',
      originais: [
        { path: '/tmp/a.mp4', trimStart: 0.5, inicio: 2, duracao: 3 },
        { path: '/tmp/b.mp4', trimStart: 0, inicio: 6, duracao: 2.25 },
      ],
    }
    const r = buildAudioMixArgs(mix, 9)
    expect(r.inputArgs).toEqual(['-i', '/tmp/a.mp4', '-i', '/tmp/b.mp4'])
    expect(r.filterArgs[1]).toBe(
      '[1:a]atrim=start=0.500:duration=3.000,asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo,adelay=2000|2000,volume=1.000[ao1];' +
        '[2:a]atrim=start=0.000:duration=2.250,asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo,adelay=6000|6000,volume=1.000[ao2];' +
        '[ao1][ao2]amix=inputs=2:duration=longest:normalize=0[aorig];' +
        '[aorig]apad[aout]',
    )
  })

  it('o 1º clipe em 0 só vira o comando legado quando é o ÚNICO', () => {
    const r = buildAudioMixArgs(
      { mode: 'original', originais: [{ path: '/tmp/a.mp4', trimStart: 0, inicio: 0, duracao: 2 }, { path: '/tmp/b.mp4', trimStart: 0, inicio: 2, duracao: 2 }] },
      4,
    )
    expect(r.filterArgs[1]).toContain('adelay=0|0')
    expect(r.filterArgs[1]).toContain('amix=inputs=2:duration=longest:normalize=0[aorig]')
  })
})

// ── Integração: ffmpeg de verdade sobre fixtures sintéticas ──────────────────
const temFfmpeg = (() => {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
    execFileSync('ffprobe', ['-version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()

const ffmpeg = (args: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: ['ignore', 'ignore', 'inherit'] })
const duracaoDe = (path: string) =>
  Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path]).toString().trim())
/** Volume médio (dB) de um trecho do MP4 depois de um passa-banda estreito na frequência */
const volumeNaBanda = (path: string, inicio: number, fim: number, hz: number) => {
  const saida = spawnSync(
    'ffmpeg',
    ['-v', 'info', '-i', path, '-vn', '-af', `atrim=${inicio}:${fim},asetpts=PTS-STARTPTS,bandpass=f=${hz}:width_type=h:w=40,volumedetect`, '-f', 'null', '-'],
    { encoding: 'utf8' },
  ).stderr
  const m = saida.match(/mean_volume:\s*(-?[\d.]+) dB/)
  return m ? Number(m[1]) : -91
}

describe.skipIf(!temFfmpeg)('convertWebMToMP4ServerSide com `originais` (ffmpeg real)', () => {
  it('o som de cada clipe sai no trecho dele; clipe sem faixa de áudio é pulado', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fase4-'))
    try {
      const a = join(dir, 'a440.mp4')
      const mudo = join(dir, 'mudo.mp4')
      const b = join(dir, 'b880.mp4')
      const webm = join(dir, 'mudo.webm')
      ffmpeg(['-f', 'lavfi', '-i', 'color=c=blue:s=64x64:r=10:d=2', '-f', 'lavfi', '-i', 'sine=f=440:r=48000:d=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', a])
      ffmpeg(['-f', 'lavfi', '-i', 'color=c=red:s=64x64:r=10:d=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', mudo])
      ffmpeg(['-f', 'lavfi', '-i', 'color=c=green:s=64x64:r=10:d=2', '-f', 'lavfi', '-i', 'sine=f=880:r=48000:d=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', b])
      // O WebM que o editor grava: só vídeo, sem faixa de áudio
      ffmpeg(['-f', 'lavfi', '-i', 'color=c=black:s=64x64:r=10:d=5', '-c:v', 'libvpx-vp9', '-an', webm])

      expect(await temFaixaDeAudio(a)).toBe(true)
      expect(await temFaixaDeAudio(mudo)).toBe(false)

      // A fila teria pulado `mudo` pela sondagem; aqui a sequência é a→(mudo)→b
      const { mp4Buffer } = await convertWebMToMP4ServerSide(readFileSync(webm), undefined, {
        durationSeconds: 5,
        generateThumbnail: false,
        preset: 'ultrafast',
        audioMix: {
          mode: 'original',
          originais: [
            { path: a, trimStart: 0, inicio: 0, duracao: 2 },
            { path: b, trimStart: 0, inicio: 3, duracao: 2 },
          ],
        },
      })
      const mp4 = join(dir, 'saida.mp4')
      writeFileSync(mp4, mp4Buffer)
      expect(existsSync(mp4)).toBe(true)
      expect(Math.abs(duracaoDe(mp4) - 5)).toBeLessThan(0.15)

      // 0–2 s: 440 Hz forte, 880 fraco; 3–5 s: o inverso; 2–3 s (o clipe mudo): silêncio
      const a440 = volumeNaBanda(mp4, 0.3, 1.7, 440)
      const a880 = volumeNaBanda(mp4, 0.3, 1.7, 880)
      const b440 = volumeNaBanda(mp4, 3.3, 4.7, 440)
      const b880 = volumeNaBanda(mp4, 3.3, 4.7, 880)
      const meio = volumeNaBanda(mp4, 2.2, 2.8, 440)
      expect(a440, `0–2 s: 440=${a440} 880=${a880}`).toBeGreaterThan(a880 + 15)
      expect(b880, `3–5 s: 440=${b440} 880=${b880}`).toBeGreaterThan(b440 + 15)
      expect(meio, `2–3 s deveria ser silêncio: ${meio}`).toBeLessThan(a440 - 25)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)
})
