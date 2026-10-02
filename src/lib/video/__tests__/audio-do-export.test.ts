import { describe, expect, it } from 'vitest'
import {
  MOTIVO_DO_AVISO_DE_AUDIO,
  avisoDeAudioDe,
  proximaTentativaDeAudio,
} from '../audio-do-export'
import type { AudioMixOptions } from '../ffmpeg-server-converter'

const musica = {
  musicPath: '/tmp/musica.mp3',
  musicStart: 12.5,
  musicVolume: 0.6,
  fadeInDuration: 0.5,
  fadeOutDuration: 1,
}
const original = { originalPath: '/tmp/video.mp4', originalTrimStart: 3, originalVolume: 0.8 }

describe('a próxima tentativa de áudio depois de uma falha', () => {
  it('mix com som do vídeo e música → só a música, com o mesmo início, volume e fades', () => {
    const proxima = proximaTentativaDeAudio({ mode: 'mix', ...original, ...musica })
    expect(proxima).toEqual({ mix: { mode: 'library', ...musica }, aviso: 'so-musica' })
    // O arquivo que falhou não pode voltar a ser aberto pelo ffmpeg
    expect(proxima.mix).not.toHaveProperty('originalPath')
  })

  it('a música sem fades continua sem fades', () => {
    const proxima = proximaTentativaDeAudio({
      mode: 'mix',
      ...original,
      musicPath: '/tmp/m.mp3',
      musicStart: 0,
      musicVolume: 0.8,
    })
    expect(proxima.mix?.fadeInDuration).toBeUndefined()
    expect(proxima.mix?.fadeOutDuration).toBeUndefined()
    expect(proxima.mix?.musicStart).toBe(0)
  })

  it('a escada do mix: só a música falhou → só o som do vídeo → sem áudio, e termina', () => {
    const pedido: AudioMixOptions = { mode: 'mix', ...original, ...musica }
    const degrau1 = proximaTentativaDeAudio(pedido, pedido)
    const degrau2 = proximaTentativaDeAudio(degrau1.mix as AudioMixOptions, pedido)
    // A música inválida não pode levar embora o som do vídeo que estava íntegro
    expect(degrau2).toEqual({ mix: { mode: 'original', ...original }, aviso: 'so-original' })
    expect(degrau2.mix).not.toHaveProperty('musicPath')
    const degrau3 = proximaTentativaDeAudio(degrau2.mix as AudioMixOptions, pedido)
    expect(degrau3).toEqual({ aviso: 'sem-audio' })
  })

  it('só música (biblioteca) → sem áudio', () => {
    expect(proximaTentativaDeAudio({ mode: 'library', ...musica })).toEqual({ aviso: 'sem-audio' })
  })

  it('som original → sem áudio (não há outra fonte)', () => {
    expect(proximaTentativaDeAudio({ mode: 'original', ...original })).toEqual({
      aviso: 'sem-audio',
    })
  })

  it('mix que já estava só com a música (página sem vídeo de base) → sem áudio', () => {
    // Repetir a mesma música como "degrau" falharia igual
    expect(proximaTentativaDeAudio({ mode: 'mix', ...musica })).toEqual({ aviso: 'sem-audio' })
  })

  it('mix sem música escolhida → sem áudio', () => {
    expect(proximaTentativaDeAudio({ mode: 'mix', ...original })).toEqual({ aviso: 'sem-audio' })
  })
})

describe('o aviso que o card do criativo mostra', () => {
  it('sem aviso gravado, não mostra nada', () => {
    expect(avisoDeAudioDe(undefined)).toBeNull()
    expect(avisoDeAudioDe(null)).toBeNull()
    expect(avisoDeAudioDe({ isVideo: true, videoUrl: 'https://x/v.mp4' })).toBeNull()
  })

  it('valor que a fila não grava não vira aviso', () => {
    expect(avisoDeAudioDe({ audioAviso: 'outro' })).toBeNull()
    expect(avisoDeAudioDe({ audioAviso: true })).toBeNull()
  })

  it('saiu sem som', () => {
    expect(avisoDeAudioDe({ audioAviso: 'sem-audio', audioAvisoMotivo: 'porque sim' })).toEqual({
      rotulo: 'Saiu sem som',
      motivo: 'porque sim',
    })
  })

  it('saiu sem a música', () => {
    expect(avisoDeAudioDe({ audioAviso: 'so-original' })).toEqual({
      rotulo: 'Saiu sem a música',
      motivo: MOTIVO_DO_AVISO_DE_AUDIO['so-original'],
    })
  })

  it('saiu só com a música; sem motivo gravado vale o padrão', () => {
    expect(avisoDeAudioDe({ audioAviso: 'so-musica' })).toEqual({
      rotulo: 'Saiu só com a música',
      motivo: MOTIVO_DO_AVISO_DE_AUDIO['so-musica'],
    })
  })
})
