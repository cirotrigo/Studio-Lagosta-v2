import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { duracaoDaPagina, paginaEVideo, temVideoVisivel } from '../camadas-de-video'
import { recusaComoImagem } from '../pagina-com-video'
import { fonteEfetiva } from '../audio-do-export'

const foto = { id: 'foto', type: 'image' }
const video = { id: 'video', type: 'video', videoMetadata: { trimStart: 1, trimEnd: 5 } }
const motion = { id: 'motion', type: 'video', videoMetadata: { overlay: true, duration: 3 } }
const musica = { source: 'library', musicId: 7, startTime: 2, endTime: 14 }
const semFatia = { source: 'library', musicId: 7 }

describe('a página É um vídeo? (publicação) × tem vídeo visível? (render)', () => {
  it('foto + música é vídeo para publicar, mas renderiza como imagem', () => {
    expect(paginaEVideo([foto], musica)).toBe(true)
    expect(temVideoVisivel([foto])).toBe(false)
  })

  it('sem música nem vídeo, é imagem nas duas perguntas', () => {
    expect(paginaEVideo([foto], null)).toBe(false)
    expect(paginaEVideo([foto], { source: 'original' })).toBe(false)
    // música escolhida sem trecho, ou sem id, não faz fatia
    expect(paginaEVideo([foto], semFatia)).toBe(false)
    expect(paginaEVideo([foto], { ...musica, musicId: null })).toBe(false)
  })

  it('vídeo oculto não conta; motion visível conta', () => {
    expect(paginaEVideo([foto, { ...video, visible: false }], null)).toBe(false)
    expect(paginaEVideo([foto, motion], null)).toBe(true)
  })
})

describe('duração da página como vídeo (a conta do export, com nome)', () => {
  it('sem vídeo: a fatia da música; sem música: nada', () => {
    expect(duracaoDaPagina([foto], musica)).toBe(12)
    expect(duracaoDaPagina([foto], null)).toBeNull()
  })

  it('com vídeo: o trecho, limitado pela música', () => {
    expect(duracaoDaPagina([foto, video], null)).toBe(4)
    expect(duracaoDaPagina([foto, video], { ...musica, endTime: 4.5 })).toBe(2.5)
  })

  it('duração ainda não gravada vem do <video> montado', () => {
    const semDuracao = { id: 'v', type: 'video', videoMetadata: {} }
    expect(duracaoDaPagina([semDuracao], null)).toBeNull()
    expect(duracaoDaPagina([semDuracao], null, new Map([['v', 8]]))).toBe(8)
  })
})

describe('a trava de publicação lê a página como está no banco', () => {
  it('música em string JSON simples e dupla', () => {
    const camadas = JSON.stringify([foto])
    expect(recusaComoImagem(camadas, JSON.stringify(musica))?.codigo).toBe('PAGINA_COM_MUSICA')
    expect(recusaComoImagem(JSON.stringify(camadas), JSON.stringify(JSON.stringify(musica)))?.codigo).toBe(
      'PAGINA_COM_MUSICA',
    )
  })

  it('vídeo vence música no código; sem os dois, passa', () => {
    expect(recusaComoImagem([foto, video], musica)?.codigo).toBe('PAGINA_COM_VIDEO')
    expect(recusaComoImagem([foto], null)).toBeNull()
    expect(recusaComoImagem([foto], 'não é json')).toBeNull()
  })
})

describe('a fonte de áudio efetiva sem vídeo de base', () => {
  it('"som do vídeo" vira mudo, com aviso', () => {
    expect(fonteEfetiva({ source: 'original' }, false)).toEqual({
      config: { source: 'mute' },
      aviso: 'sem-audio',
    })
  })

  it('mix vira só a música; mix sem música vira mudo', () => {
    expect(fonteEfetiva({ source: 'mix', musicId: 7 }, false)).toEqual({
      config: { source: 'library', musicId: 7 },
      aviso: 'so-musica',
    })
    expect(fonteEfetiva({ source: 'mix' }, false)).toEqual({ config: { source: 'mute' }, aviso: 'sem-audio' })
  })

  it('com vídeo de base, ou nas outras fontes, a config volta como veio, sem aviso', () => {
    const original = { source: 'original' as const, volume: 80 }
    expect(fonteEfetiva(original, true)).toEqual({ config: original })
    const biblioteca = { source: 'library' as const, musicId: 7 }
    expect(fonteEfetiva(biblioteca, false)).toEqual({ config: biblioteca })
    expect(fonteEfetiva({ source: 'mute' as const }, false)).toEqual({ config: { source: 'mute' } })
  })
})

/**
 * Teste de FONTE: a trava de PUBLICAÇÃO (`recusaComoImagem`/`paginaEVideo`)
 * mora só nas portas listadas. Porta nova que publique a página como imagem
 * precisa entrar aqui — e porta de RENDER continua em `videoNaPagina`/
 * `temVideoVisivel` (página com música renderiza como imagem).
 */
describe('quem decide se a página vira post como imagem', () => {
  const raiz = join(__dirname, '..', '..', '..')
  const arquivos: string[] = []
  const varrer = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome)
      if (statSync(caminho).isDirectory()) {
        if (nome !== '__tests__') varrer(caminho)
      } else if (/\.tsx?$/.test(nome) && !nome.endsWith('.test.ts')) arquivos.push(caminho)
    }
  }
  varrer(raiz)

  it('só as portas conhecidas chamam recusaComoImagem / paginaEVideo', () => {
    const chamadores = arquivos
      .filter((f) => /\b(recusaComoImagem|paginaEVideo)\(/.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(raiz.length + 1))
      .sort()
    expect(chamadores).toEqual(
      [
        // o botão ▶︎/⏸ e o atalho de espaço só existem em página que é vídeo
        'components/templates/botao-play-pause.tsx',
        'components/templates/editor-canvas.tsx',
        'components/templates/continuous/continuous-workspace.tsx',
        'components/templates/modals/generate-creatives-modal.tsx',
        'components/templates/template-editor-shell.tsx',
        'components/templates/video-export-button.tsx',
        'lib/creatives/agendar.ts',
        'lib/lotes/agendar-itens.ts',
        'lib/posts/later-scheduler.ts',
        'lib/video/camadas-de-video.ts',
        'lib/video/pagina-com-video.ts',
      ].sort(),
    )
  })
})
