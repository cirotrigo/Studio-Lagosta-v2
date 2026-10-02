'use client'

import * as React from 'react'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import { useMultiPageOpcional } from '@/contexts/multi-page-context'
import { useMusica } from '@/hooks/use-music-library'
import { useMusicStemStatus } from '@/hooks/use-music-stem'
import { duracaoDaPagina } from '@/lib/video/camadas-de-video'
import { clipeAtivoEm, linhaDoTempo } from '@/lib/video/linha-do-tempo'
import { publicarClipeAtivo } from '@/lib/video/clipe-ativo'
import { planoDeSom, volumeEm, type PlanoDeSom } from '@/lib/video/plano-de-som'
import { relogioDaPagina } from '@/lib/video/relogio-da-pagina'
import { duracoesDosVideosMontados } from '@/lib/video/videos-montados'

/**
 * O motor da página: o que o relógio NÃO sabe sozinho.
 *
 * - A VOLTA: na prévia, chegado ao fim da página (`duracaoDaPagina`, lida do
 *   design a cada quadro — trim, ocultar e desfazer valem na hora), o relógio
 *   volta a 0 e segue tocando. Na gravação quem decide o fim é o export.
 * - A MÚSICA: um `<audio>` fora do DOM reconciliado com o relógio pela mesma
 *   regra dos vídeos (`planoDeSom`, a função que a fila usa para o MP4): toca
 *   enquanto o relógio toca, posicionado em `inicio + t`, com os fades.
 *
 * Não desenha nada; mora dentro do EditorCanvas porque precisa dos hooks de
 * dados (música) e do design atual.
 */
export function MotorDaPagina() {
  const { design } = useTemplateEditor()
  const chave = useMultiPageOpcional()?.currentPageId
  const relogio = relogioDaPagina(chave)
  const trilha = design.audio
  const musicId = trilha?.source === 'library' || trilha?.source === 'mix' ? (trilha.musicId ?? 0) : 0
  const { data: faixa } = useMusica(musicId)
  const { data: stems } = useMusicStemStatus(musicId || null)

  const designRef = React.useRef(design)
  designRef.current = design

  const plano = React.useMemo<PlanoDeSom | null>(() => {
    const duracao = duracaoDaPagina(design.layers, trilha, duracoesDosVideosMontados())
    return planoDeSom({ duracao }, trilha, {
      original: faixa?.blobUrl ?? null,
      instrumental: stems?.instrumentalUrl ?? null,
      vocals: stems?.vocalsUrl ?? null,
    })
  }, [design.layers, trilha, faixa?.blobUrl, stems?.instrumentalUrl, stems?.vocalsUrl])
  const planoRef = React.useRef(plano)
  planoRef.current = plano

  React.useEffect(() => {
    const audio = document.createElement('audio')
    audio.preload = 'auto'
    audio.crossOrigin = 'anonymous'
    let quadro = 0
    let srcAtual = ''

    const tique = () => {
      quadro = requestAnimationFrame(tique)
      const estado = relogio.estado()
      if (estado.modo === 'gravacao') {
        if (!audio.paused) audio.pause()
        return
      }
      const d = designRef.current
      const t = relogio.agora()

      // A linha do tempo: qual clipe está na tela (publica só quando muda)
      const linha = linhaDoTempo(d.layers, d.audio, duracoesDosVideosMontados())
      publicarClipeAtivo(chave, clipeAtivoEm(linha.clipes, t)?.id ?? null)

      // A volta
      if (estado.tocando) {
        const duracao = linha.duracao
        if (duracao !== null && t >= duracao) {
          relogio.ir(0)
          return
        }
      }

      // A música
      const p = planoRef.current
      if (!p) {
        if (!audio.paused) audio.pause()
        return
      }
      if (srcAtual !== p.src) {
        srcAtual = p.src
        audio.src = p.src
      }
      const alvo = p.inicio + t
      // ponytail: a mesma tolerância dos vídeos (0,25 s); seek só em desvio
      if (Math.abs(audio.currentTime - alvo) > 0.25 && !audio.seeking) {
        try {
          audio.currentTime = alvo
        } catch {
          // metadados ainda não carregados
        }
      }
      audio.volume = volumeEm(p, t)
      const deveTocar = estado.tocando && t < p.duracao
      if (deveTocar && audio.paused) audio.play().catch(() => {})
      else if (!deveTocar && !audio.paused) audio.pause()
    }
    quadro = requestAnimationFrame(tique)

    return () => {
      cancelAnimationFrame(quadro)
      audio.pause()
      audio.src = ''
    }
  }, [relogio, chave])

  return null
}
