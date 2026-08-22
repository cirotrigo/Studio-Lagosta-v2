"use client"

import * as React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ExternalLink, Film, Music, Search, Trash2, Volume2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import { useBuscaMusicas, useMusica } from '@/hooks/use-music-library'
import { useMusicStemStatus } from '@/hooks/use-music-stem'
import { MusicCard } from '@/components/audio/music-card'
import { AudioWaveformTimeline } from '@/components/audio/audio-waveform-timeline'
import { MusicStemProgress } from '@/components/audio/music-stem-progress'
import type { PageAudioConfig } from '@/types/template'

const GENEROS = [
  'Todos',
  'Rock',
  'Pop',
  'Eletrônico',
  'Hip Hop',
  'Jazz',
  'Samba',
  'Bossa',
  'Pagode',
  'Chorinho',
  'Ambiente',
]

const HUMORES = ['Todos', 'Feliz', 'Triste', 'Calmo', 'Motivacional', 'Romântico', 'Energético']

const DEFAULT_VIDEO_DURATION = 15

/**
 * Aba "Músicas" do editor: escolhe e configura a trilha sonora da PÁGINA.
 * A config é persistida em Page.audio (via PageSync, mesmo PATCH dos layers)
 * e é a mesma que o botão "Exportar Vídeo" usa como ponto de partida.
 */
export function MusicPanel() {
  const { design, setPageAudio } = useTemplateEditor()

  const audio = design.audio ?? null
  const videoLayer = design.layers.find((layer) => layer.type === 'video')
  const videoDuration = videoLayer?.videoMetadata?.duration ?? DEFAULT_VIDEO_DURATION

  const [busca, setBusca] = React.useState('')
  const [generoFiltro, setGeneroFiltro] = React.useState('Todos')
  const [humorFiltro, setHumorFiltro] = React.useState('Todos')

  const { data: musicas = [], isLoading } = useBuscaMusicas({
    busca: busca || undefined,
    genero: generoFiltro !== 'Todos' ? generoFiltro : undefined,
    humor: humorFiltro !== 'Todos' ? humorFiltro : undefined,
  })

  const activeMusicId = audio?.musicId ?? 0
  const { data: musicaAtiva } = useMusica(activeMusicId)
  const { data: stemStatus } = useMusicStemStatus(activeMusicId > 0 ? activeMusicId : undefined)

  const patchAudio = React.useCallback(
    (partial: Partial<PageAudioConfig>) => {
      if (!audio) return
      setPageAudio({ ...audio, ...partial })
    },
    [audio, setPageAudio],
  )

  const handleSelectMusic = React.useCallback(
    (musicId: number) => {
      const musica = musicas.find((m) => m.id === musicId)
      if (!musica) return
      setPageAudio({
        // Mantém a escolha de mixar com o áudio original, se já havia
        source: audio?.source === 'mix' ? 'mix' : 'library',
        musicId: musica.id,
        audioVersion: 'original',
        musicName: musica.name,
        musicThumbnailUrl: musica.thumbnailUrl,
        startTime: 0,
        endTime: Math.min(musica.duration, videoDuration),
        volume: audio?.volume ?? 80,
        volumeOriginal: audio?.volumeOriginal,
        volumeMusic: audio?.volumeMusic,
        fadeIn: audio?.fadeIn ?? false,
        fadeOut: audio?.fadeOut ?? false,
        fadeInDuration: audio?.fadeInDuration ?? 0.5,
        fadeOutDuration: audio?.fadeOutDuration ?? 0.5,
      })
    },
    [audio, musicas, setPageAudio, videoDuration],
  )

  const hasActiveTrack = Boolean(audio?.musicId)

  return (
    <div className="space-y-4">
      {!videoLayer && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
          <Film className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Esta página não tem camada de vídeo — a música é usada apenas no
            export de vídeo.
          </p>
        </div>
      )}

      {/* Trilha ativa da página */}
      {hasActiveTrack && audio ? (
        <section className="space-y-3 rounded-xl border bg-background p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-gradient-to-br from-purple-500 to-pink-500">
              {audio.musicThumbnailUrl ? (
                <Image
                  src={audio.musicThumbnailUrl}
                  alt={audio.musicName ?? 'Trilha'}
                  width={40}
                  height={40}
                  unoptimized
                  className="h-full w-full object-cover"
                />
              ) : (
                <Music className="h-full w-full p-2 text-white" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{audio.musicName ?? 'Música'}</p>
              <p className="text-[11px] text-muted-foreground">
                Trilha desta página
                {audio.audioVersion === 'instrumental' ? ' • Instrumental' : ''}
                {audio.audioVersion === 'vocals' ? ' • Só a voz' : ''}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
              title="Remover trilha da página"
              onClick={() => setPageAudio(null)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          {/* Versão (original/instrumental) */}
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Versão
            </Label>
            <Select
              value={audio.audioVersion ?? 'original'}
              onValueChange={(v: 'original' | 'instrumental' | 'vocals') =>
                patchAudio({ audioVersion: v })
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="original">Completa</SelectItem>
                <SelectItem value="instrumental" disabled={!stemStatus?.hasInstrumentalStem}>
                  Instrumental{!stemStatus?.hasInstrumentalStem ? ' (processando…)' : ''}
                </SelectItem>
                <SelectItem value="vocals" disabled={!stemStatus?.hasVocalsStem}>
                  Só a voz{!stemStatus?.hasVocalsStem ? ' (processando…)' : ''}
                </SelectItem>
              </SelectContent>
            </Select>
            {activeMusicId > 0 && stemStatus && !stemStatus.hasInstrumentalStem && (
              <MusicStemProgress musicId={activeMusicId} />
            )}
          </div>

          {/* Trecho (waveform + trim) */}
          {musicaAtiva && (
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Trecho
              </Label>
              <AudioWaveformTimeline
                audioUrl={musicaAtiva.blobUrl}
                audioDuration={musicaAtiva.duration}
                videoDuration={videoDuration}
                startTime={audio.startTime}
                endTime={audio.endTime}
                onStartTimeChange={(v) => patchAudio({ startTime: v })}
                onEndTimeChange={(v) => patchAudio({ endTime: v })}
              />
            </div>
          )}

          {/* Volume */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                <Volume2 className="h-3.5 w-3.5" />
                Volume da música
              </Label>
              <span className="text-xs text-muted-foreground">
                {audio.source === 'mix' ? (audio.volumeMusic ?? 60) : audio.volume}%
              </span>
            </div>
            <Slider
              value={[audio.source === 'mix' ? (audio.volumeMusic ?? 60) : audio.volume]}
              onValueChange={(value) =>
                audio.source === 'mix'
                  ? patchAudio({ volumeMusic: value[0] })
                  : patchAudio({ volume: value[0] })
              }
              min={0}
              max={100}
              step={1}
            />
          </div>

          {/* Manter áudio original (mix) */}
          <div className="flex items-center justify-between gap-2">
            <div className="space-y-0.5">
              <Label className="text-[11px] uppercase tracking-wide">Manter áudio do vídeo</Label>
              <p className="text-[10px] text-muted-foreground">
                Mixa a música com o som original
              </p>
            </div>
            <Switch
              checked={audio.source === 'mix'}
              onCheckedChange={(checked) =>
                patchAudio(
                  checked
                    ? { source: 'mix', volumeOriginal: audio.volumeOriginal ?? 80, volumeMusic: audio.volumeMusic ?? audio.volume }
                    : { source: 'library' },
                )
              }
            />
          </div>

          {audio.source === 'mix' && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Volume do áudio original
                </Label>
                <span className="text-xs text-muted-foreground">{audio.volumeOriginal ?? 80}%</span>
              </div>
              <Slider
                value={[audio.volumeOriginal ?? 80]}
                onValueChange={(value) => patchAudio({ volumeOriginal: value[0] })}
                min={0}
                max={100}
                step={1}
              />
            </div>
          )}

          {/* Fades */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                className="rounded"
                checked={audio.fadeIn}
                onChange={(e) => patchAudio({ fadeIn: e.target.checked })}
              />
              Fade in
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                className="rounded"
                checked={audio.fadeOut}
                onChange={(e) => patchAudio({ fadeOut: e.target.checked })}
              />
              Fade out
            </label>
          </div>
        </section>
      ) : (
        <p className="rounded-lg border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
          Nenhuma trilha nesta página. Escolha uma música da biblioteca abaixo —
          a escolha fica salva na página e já entra no export de vídeo.
        </p>
      )}

      {/* Busca e filtros */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar músicas..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>
        <div className="flex gap-2">
          <Select value={generoFiltro} onValueChange={setGeneroFiltro}>
            <SelectTrigger className="h-8 flex-1 text-xs">
              <SelectValue placeholder="Gênero" />
            </SelectTrigger>
            <SelectContent>
              {GENEROS.map((genero) => (
                <SelectItem key={genero} value={genero}>
                  {genero}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={humorFiltro} onValueChange={setHumorFiltro}>
            <SelectTrigger className="h-8 flex-1 text-xs">
              <SelectValue placeholder="Humor" />
            </SelectTrigger>
            <SelectContent>
              {HUMORES.map((humor) => (
                <SelectItem key={humor} value={humor}>
                  {humor}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(busca || generoFiltro !== 'Todos' || humorFiltro !== 'Todos') && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              title="Limpar filtros"
              onClick={() => {
                setBusca('')
                setGeneroFiltro('Todos')
                setHumorFiltro('Todos')
              }}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Galeria */}
      {isLoading ? (
        <p className="py-8 text-center text-xs text-muted-foreground">Carregando músicas...</p>
      ) : musicas.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/60 py-8">
          <Music className="mb-2 h-8 w-8 text-muted-foreground/50" />
          <p className="text-xs text-muted-foreground">Nenhuma música encontrada</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {musicas.map((musica) => (
            <MusicCard
              key={musica.id}
              musica={musica}
              isSelected={musica.id === audio?.musicId}
              videoDuration={videoDuration}
              onSelect={() => handleSelectMusic(musica.id)}
            />
          ))}
        </div>
      )}

      <Button asChild variant="outline" size="sm" className="w-full gap-2 text-xs">
        <Link href="/biblioteca-musicas" target="_blank">
          <ExternalLink className="h-3.5 w-3.5" />
          Gerenciar biblioteca
        </Link>
      </Button>
    </div>
  )
}
