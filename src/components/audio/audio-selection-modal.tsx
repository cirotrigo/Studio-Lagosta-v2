'use client';

import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useBuscaMusicas } from '@/hooks/use-music-library';
import { useProjects } from '@/hooks/use-project';
import { useMusicStemStatus } from '@/hooks/use-music-stem';
import { Search, Volume2, X, Music, MicOff } from 'lucide-react';
import { AudioWaveformTimeline } from './audio-waveform-timeline';
import { MusicCard } from './music-card';
import { MusicStemProgress } from './music-stem-progress';

export type AudioVersion = 'original' | 'instrumental';

export interface AudioConfig {
  source: 'original' | 'library' | 'mute' | 'mix';
  musicId?: number;
  audioVersion?: AudioVersion;
  startTime: number;
  endTime: number;
  volume: number;
  volumeOriginal?: number;
  volumeMusic?: number;
  fadeIn: boolean;
  fadeOut: boolean;
  fadeInDuration: number;
  fadeOutDuration: number;
}

interface AudioSelectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videoDuration: number;
  currentConfig?: AudioConfig;
  onConfirm: (config: AudioConfig) => void;
}

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
];

const HUMORES = [
  'Todos',
  'Feliz',
  'Triste',
  'Calmo',
  'Motivacional',
  'Romântico',
  'Energético',
];

const AUDIO_SOURCE_OPTIONS: Array<{
  id: AudioConfig['source'];
  title: string;
  description: string;
}> = [
  {
    id: 'original',
    title: 'Áudio do vídeo',
    description: 'Mantém o som original exatamente como está no arquivo base.',
  },
  {
    id: 'library',
    title: 'Biblioteca de músicas',
    description: 'Selecione uma faixa pronta e sincronize o melhor trecho.',
  },
  {
    id: 'mix',
    title: 'Mix com áudio original',
    description: 'Combine a faixa original com uma música da biblioteca.',
  },
  {
    id: 'mute',
    title: 'Sem áudio',
    description: 'Exporta o vídeo em silêncio — ideal para editar depois.',
  },
];

export function AudioSelectionModal({
  open,
  onOpenChange,
  videoDuration,
  currentConfig,
  onConfirm,
}: AudioSelectionModalProps) {
  const [audioSource, setAudioSource] = useState<AudioConfig['source']>(
    currentConfig?.source || 'library'
  );
  const [busca, setBusca] = useState('');
  const [generoFiltro, setGeneroFiltro] = useState('Todos');
  const [humorFiltro, setHumorFiltro] = useState('Todos');
  const [projetoFiltro, setProjetoFiltro] = useState<string>('Todos');

  const { data: musicas = [], isLoading } = useBuscaMusicas({
    busca: busca || undefined,
    genero: generoFiltro !== 'Todos' ? generoFiltro : undefined,
    humor: humorFiltro !== 'Todos' ? humorFiltro : undefined,
    projectId: projetoFiltro !== 'Todos' ? parseInt(projetoFiltro) : undefined,
  });
  const { data: projetos = [], isLoading: isLoadingProjetos } = useProjects();

  const [musicaSelecionada, setMusicaSelecionada] = useState<number | undefined>(
    currentConfig?.musicId
  );
  const [audioVersion, setAudioVersion] = useState<AudioVersion>(
    currentConfig?.audioVersion || 'original'
  );
  const { data: stemStatus } = useMusicStemStatus(musicaSelecionada);

  const [startTime, setStartTime] = useState(currentConfig?.startTime || 0);
  const [endTime, setEndTime] = useState(currentConfig?.endTime || videoDuration);

  const [volume, setVolume] = useState(currentConfig?.volume || 80);
  const [volumeOriginal, setVolumeOriginal] = useState(currentConfig?.volumeOriginal || 80);
  const [volumeMusic, setVolumeMusic] = useState(currentConfig?.volumeMusic || 60);
  const [fadeIn, setFadeIn] = useState(currentConfig?.fadeIn || false);
  const [fadeOut, setFadeOut] = useState(currentConfig?.fadeOut || false);
  const [fadeInDuration, setFadeInDuration] = useState(currentConfig?.fadeInDuration || 0.5);
  const [fadeOutDuration, setFadeOutDuration] = useState(currentConfig?.fadeOutDuration || 0.5);

  const musicaAtual = useMemo(
    () => musicas.find((m) => m.id === musicaSelecionada),
    [musicas, musicaSelecionada]
  );

  const handleConfirm = () => {
    const config: AudioConfig = {
      source: audioSource,
      musicId: audioSource === 'library' || audioSource === 'mix' ? musicaSelecionada : undefined,
      audioVersion: audioSource === 'library' || audioSource === 'mix' ? audioVersion : undefined,
      startTime,
      endTime,
      volume: audioSource === 'mix' ? volumeMusic : volume,
      volumeOriginal: audioSource === 'mix' ? volumeOriginal : undefined,
      volumeMusic: audioSource === 'mix' ? volumeMusic : undefined,
      fadeIn,
      fadeOut,
      fadeInDuration,
      fadeOutDuration,
    };

    onConfirm(config);
    onOpenChange(false);
  };

  const handleLimparFiltros = () => {
    setBusca('');
    setGeneroFiltro('Todos');
    setHumorFiltro('Todos');
    setProjetoFiltro('Todos');
  };

  const isValid =
    audioSource === 'mute' ||
    audioSource === 'original' ||
    (audioSource === 'library' && musicaSelecionada) ||
    (audioSource === 'mix' && musicaSelecionada);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Music className="h-5 w-5" />
            Personalizar trilha sonora
          </DialogTitle>
          <DialogDescription>
            Pesquise músicas, ajuste o trecho ideal e controle volumes antes de exportar seu vídeo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 overflow-y-auto pr-1 flex-1">
          <div className="grid gap-6 lg:grid-cols-[1.45fr,1fr]">
            <div className="space-y-6">
              <section className="rounded-2xl border bg-background p-4 shadow-sm">
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Fonte de áudio
                </p>
                <RadioGroup
                  value={audioSource}
                  onValueChange={(value: AudioConfig['source']) => setAudioSource(value)}
                  className="mt-4 grid gap-3 md:grid-cols-2"
                >
                  {AUDIO_SOURCE_OPTIONS.map((option) => (
                    <label
                      key={option.id}
                      htmlFor={`source-${option.id}`}
                      className={`flex cursor-pointer flex-col gap-1 rounded-xl border p-3 text-sm transition ${
                        audioSource === option.id
                          ? 'border-primary bg-primary/5 shadow-sm'
                          : 'border-muted'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value={option.id} id={`source-${option.id}`} />
                        <span className="font-semibold">{option.title}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{option.description}</span>
                    </label>
                  ))}
                </RadioGroup>
              </section>

              {(audioSource === 'library' || audioSource === 'mix') && (
                <section className="space-y-4 rounded-2xl border bg-background p-4 shadow-sm">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Input
                      placeholder="Buscar músicas..."
                      value={busca}
                      onChange={(e) => setBusca(e.target.value)}
                      className="pl-10"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={projetoFiltro} onValueChange={setProjetoFiltro} disabled={isLoadingProjetos}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Projeto" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Todos">Todos os projetos</SelectItem>
                        {projetos.map((projeto) => (
                          <SelectItem key={projeto.id} value={projeto.id.toString()}>
                            {projeto.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select value={generoFiltro} onValueChange={setGeneroFiltro}>
                      <SelectTrigger className="w-[150px]">
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
                      <SelectTrigger className="w-[150px]">
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

                    {(busca || generoFiltro !== 'Todos' || humorFiltro !== 'Todos' || projetoFiltro !== 'Todos') && (
                      <Button variant="outline" size="sm" onClick={handleLimparFiltros} className="gap-1">
                        <X className="h-3 w-3" />
                        Limpar
                      </Button>
                    )}
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Galeria</p>
                    {isLoading ? (
                      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                        Carregando músicas...
                      </div>
                    ) : musicas.length === 0 ? (
                      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-12 text-sm text-muted-foreground">
                        <Music className="mb-2 h-8 w-8 text-gray-400" />
                        Nenhuma música encontrada com os filtros atuais.
                      </div>
                    ) : (
                      <div className="grid max-h-[22rem] grid-cols-2 gap-3 overflow-y-auto rounded-xl border p-3 md:grid-cols-3">
                        {musicas.map((musica) => (
                          <MusicCard
                            key={musica.id}
                            musica={musica}
                            isSelected={musica.id === musicaSelecionada}
                            videoDuration={videoDuration}
                            onSelect={() => {
                              setMusicaSelecionada(musica.id);
                              setStartTime(0);
                              setEndTime(Math.min(musica.duration, videoDuration));
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              )}
            </div>

            <div className="space-y-6">
              {musicaAtual ? (
                <>
                  <section className="space-y-3 rounded-2xl border bg-background p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="h-14 w-14 overflow-hidden rounded-md bg-gradient-to-br from-purple-500 to-pink-500">
                        {musicaAtual.thumbnailUrl ? (
                          <img
                            src={musicaAtual.thumbnailUrl}
                            alt={musicaAtual.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <Music className="h-full w-full p-3 text-white" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold">{musicaAtual.name}</p>
                        <p className="text-xs text-muted-foreground">{musicaAtual.artist || 'Artista desconhecido'}</p>
                        <p className="text-xs text-muted-foreground">
                          Duração: {Math.floor(musicaAtual.duration)}s
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs uppercase text-muted-foreground">
                        Versão da música
                      </Label>
                      <Select value={audioVersion} onValueChange={(v: AudioVersion) => setAudioVersion(v)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Escolha a versão" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="original">
                            <div className="flex items-center justify-between gap-3">
                              <span className="flex items-center gap-2">
                                <Music className="h-4 w-4" />
                                Completa
                              </span>
                              <span className="text-xs text-green-600">Disponível</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="instrumental" disabled={!stemStatus?.hasInstrumentalStem}>
                            <div className="flex items-center justify-between gap-3">
                              <span className="flex items-center gap-2">
                                <MicOff className="h-4 w-4" />
                                Instrumental
                              </span>
                              {stemStatus?.hasInstrumentalStem ? (
                                <span className="text-xs text-green-600">✓ Pronta</span>
                              ) : stemStatus?.job?.status === 'processing' ? (
                                <span className="text-xs text-amber-600">
                                  Processando ({stemStatus.job.progress}%)
                                </span>
                              ) : (
                                <span className="text-xs text-gray-500">Gerando...</span>
                              )}
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      {!stemStatus?.hasInstrumentalStem && (
                        <p className="rounded-lg bg-blue-50 p-2 text-xs text-blue-800">
                          💡 A versão instrumental estará disponível em alguns minutos.
                        </p>
                      )}
                    </div>

                    {stemStatus && (!stemStatus.hasInstrumentalStem || stemStatus.job) && (
                      <MusicStemProgress musicId={musicaAtual.id} />
                    )}
                  </section>

                  <section className="space-y-3 rounded-2xl border bg-background p-4 shadow-sm">
                    <h3 className="text-sm font-semibold uppercase text-gray-700">
                      Ajustar trecho da música
                    </h3>
                    <AudioWaveformTimeline
                      audioUrl={musicaAtual.blobUrl}
                      audioDuration={musicaAtual.duration}
                      videoDuration={videoDuration}
                      startTime={startTime}
                      endTime={endTime}
                      onStartTimeChange={setStartTime}
                      onEndTimeChange={setEndTime}
                    />
                  </section>

                  <section className="space-y-4 rounded-2xl border bg-background p-4 shadow-sm">
                    <h3 className="text-sm font-semibold uppercase text-gray-700">Controles de áudio</h3>
                    {audioSource === 'mix' ? (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="flex items-center gap-2">
                              <Volume2 className="h-4 w-4" />
                              Volume áudio original
                            </Label>
                            <span className="text-sm text-gray-600">{volumeOriginal}%</span>
                          </div>
                          <Slider
                            value={[volumeOriginal]}
                            onValueChange={(value) => setVolumeOriginal(value[0])}
                            min={0}
                            max={100}
                            step={1}
                          />
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="flex items-center gap-2">
                              <Music className="h-4 w-4" />
                              Volume da música
                            </Label>
                            <span className="text-sm text-gray-600">{volumeMusic}%</span>
                          </div>
                          <Slider
                            value={[volumeMusic]}
                            onValueChange={(value) => setVolumeMusic(value[0])}
                            min={0}
                            max={100}
                            step={1}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="flex items-center gap-2">
                            <Volume2 className="h-4 w-4" />
                            Volume
                          </Label>
                          <span className="text-sm text-gray-600">{volume}%</span>
                        </div>
                        <Slider
                          value={[volume]}
                          onValueChange={(value) => setVolume(value[0])}
                          min={0}
                          max={100}
                          step={1}
                        />
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4 text-sm text-gray-700">
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          className="rounded"
                          checked={fadeIn}
                          onChange={(e) => setFadeIn(e.target.checked)}
                        />
                        Fade in ({fadeInDuration}s)
                      </label>
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          className="rounded"
                          checked={fadeOut}
                          onChange={(e) => setFadeOut(e.target.checked)}
                        />
                        Fade out ({fadeOutDuration}s)
                      </label>
                    </div>
                  </section>
                </>
              ) : (
                <section className="flex h-full min-h-[22rem] flex-col items-center justify-center rounded-2xl border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                  <Music className="mb-3 h-6 w-6 text-gray-400" />
                  Escolha uma música na galeria para liberar os ajustes de trecho e volume.
                </section>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!isValid}>
            Confirmar e continuar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
