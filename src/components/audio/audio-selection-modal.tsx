'use client';

import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { useBibliotecaMusicas } from '@/hooks/use-music-library';
import { Search, Volume2, X, Music, PlayCircle, CheckCircle2 } from 'lucide-react';
import { AudioWaveformTimeline } from './audio-waveform-timeline';
import { MusicCard } from './music-card';

export interface AudioConfig {
  source: 'original' | 'library' | 'mute';
  musicId?: number;
  startTime: number;
  endTime: number;
  volume: number;
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
  'Electronic',
  'Hip Hop',
  'Jazz',
  'Classical',
  'Ambient',
  'Indie',
  'Folk',
  'R&B',
  'Country',
  'Latin',
];

const HUMORES = [
  'Todos',
  'Feliz',
  'Triste',
  'Energético',
  'Calmo',
  'Motivacional',
  'Romântico',
  'Sombrio',
  'Edificante',
  'Melancólico',
  'Épico',
  'Relaxante',
  'Intenso',
];

export function AudioSelectionModal({
  open,
  onOpenChange,
  videoDuration,
  currentConfig,
  onConfirm,
}: AudioSelectionModalProps) {
  const { data: musicas = [], isLoading } = useBibliotecaMusicas();

  // Estado da fonte de áudio
  const [audioSource, setAudioSource] = useState<AudioConfig['source']>(
    currentConfig?.source || 'library'
  );

  // Estado de busca e filtros
  const [busca, setBusca] = useState('');
  const [generoFiltro, setGeneroFiltro] = useState('Todos');
  const [humorFiltro, setHumorFiltro] = useState('Todos');

  // Estado da música selecionada
  const [musicaSelecionada, setMusicaSelecionada] = useState<number | undefined>(
    currentConfig?.musicId
  );

  // Estado da timeline
  const [startTime, setStartTime] = useState(currentConfig?.startTime || 0);
  const [endTime, setEndTime] = useState(currentConfig?.endTime || videoDuration);

  // Estado dos controles de áudio
  const [volume, setVolume] = useState(currentConfig?.volume || 80);
  const [fadeIn, setFadeIn] = useState(currentConfig?.fadeIn || false);
  const [fadeOut, setFadeOut] = useState(currentConfig?.fadeOut || false);
  const [fadeInDuration, setFadeInDuration] = useState(currentConfig?.fadeInDuration || 0.5);
  const [fadeOutDuration, setFadeOutDuration] = useState(currentConfig?.fadeOutDuration || 0.5);

  // Música atualmente selecionada
  const musicaAtual = useMemo(
    () => musicas.find((m) => m.id === musicaSelecionada),
    [musicas, musicaSelecionada]
  );

  // Músicas filtradas
  const musicasFiltradas = useMemo(() => {
    return musicas.filter((musica) => {
      // Filtro de busca
      const buscaMatch =
        !busca ||
        musica.name.toLowerCase().includes(busca.toLowerCase()) ||
        musica.artist?.toLowerCase().includes(busca.toLowerCase());

      // Filtro de gênero
      const generoMatch = generoFiltro === 'Todos' || musica.genre === generoFiltro;

      // Filtro de humor
      const humorMatch = humorFiltro === 'Todos' || musica.mood === humorFiltro;

      return buscaMatch && generoMatch && humorMatch;
    });
  }, [musicas, busca, generoFiltro, humorFiltro]);

  const handleConfirm = () => {
    const config: AudioConfig = {
      source: audioSource,
      musicId: audioSource === 'library' ? musicaSelecionada : undefined,
      startTime,
      endTime,
      volume,
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
  };

  const isValid = audioSource === 'mute' || audioSource === 'original' || musicaSelecionada;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Music className="h-5 w-5" />
            Adicionar Música ao Vídeo
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* ETAPA 1: Selecionar Fonte de Áudio */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase text-gray-700">
              Etapa 1: Selecionar Fonte de Áudio
            </h3>
            <RadioGroup value={audioSource} onValueChange={(value: any) => setAudioSource(value)}>
              <div className="flex items-center space-x-2 rounded-lg border p-3">
                <RadioGroupItem value="original" id="original" />
                <Label htmlFor="original" className="flex-1 cursor-pointer">
                  Áudio Original do Vídeo
                </Label>
              </div>
              <div className="flex items-center space-x-2 rounded-lg border p-3">
                <RadioGroupItem value="library" id="library" />
                <Label htmlFor="library" className="flex-1 cursor-pointer">
                  Música da Biblioteca
                </Label>
              </div>
              <div className="flex items-center space-x-2 rounded-lg border p-3">
                <RadioGroupItem value="mute" id="mute" />
                <Label htmlFor="mute" className="flex-1 cursor-pointer">
                  Sem Áudio (Mudo)
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* ETAPA 2: Escolher Música (apenas se fonte = biblioteca) */}
          {audioSource === 'library' && (
            <>
              {/* Busca e Filtros */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold uppercase text-gray-700">
                  Etapa 2: Escolher Música
                </h3>
                <div className="space-y-3">
                  {/* Busca */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Input
                      placeholder="Buscar músicas..."
                      value={busca}
                      onChange={(e) => setBusca(e.target.value)}
                      className="pl-10"
                    />
                  </div>

                  {/* Filtros */}
                  <div className="flex flex-wrap gap-2">
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

                    {(busca || generoFiltro !== 'Todos' || humorFiltro !== 'Todos') && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleLimparFiltros}
                        className="gap-1"
                      >
                        <X className="h-3 w-3" />
                        Limpar filtros
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Música Selecionada (se houver) */}
              {musicaAtual && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold uppercase text-gray-700 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    Música Selecionada
                  </h3>
                  <MusicCard
                    musica={musicaAtual}
                    isSelected={true}
                    videoDuration={videoDuration}
                    onSelect={() => {}}
                  />
                </div>
              )}

              {/* Timeline de Ajuste */}
              {musicaAtual && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold uppercase text-gray-700">
                    Ajustar Trecho da Música
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
                </div>
              )}

              {/* Configurações de Áudio */}
              {musicaAtual && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold uppercase text-gray-700">
                    Configurações de Áudio
                  </h3>
                  <div className="space-y-4 rounded-lg border p-4">
                    {/* Volume */}
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

                    {/* Fade In/Out */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id="fadeIn"
                            checked={fadeIn}
                            onChange={(e) => setFadeIn(e.target.checked)}
                            className="rounded"
                          />
                          <Label htmlFor="fadeIn">Fade In ({fadeInDuration}s)</Label>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id="fadeOut"
                            checked={fadeOut}
                            onChange={(e) => setFadeOut(e.target.checked)}
                            className="rounded"
                          />
                          <Label htmlFor="fadeOut">Fade Out ({fadeOutDuration}s)</Label>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Galeria de Músicas */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold uppercase text-gray-700">
                  Galeria de Músicas
                </h3>
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="text-gray-500">Carregando músicas...</div>
                  </div>
                ) : musicasFiltradas.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
                    <Music className="h-12 w-12 text-gray-400" />
                    <p className="mt-2 text-sm text-gray-600">Nenhuma música encontrada</p>
                  </div>
                ) : (
                  <div className="grid max-h-96 grid-cols-2 gap-3 overflow-y-auto rounded-lg border p-4 md:grid-cols-3">
                    {musicasFiltradas.map((musica) => (
                      <MusicCard
                        key={musica.id}
                        musica={musica}
                        isSelected={musica.id === musicaSelecionada}
                        videoDuration={videoDuration}
                        onSelect={() => {
                          setMusicaSelecionada(musica.id);
                          // Reset timeline to music duration or video duration
                          setStartTime(0);
                          setEndTime(Math.min(musica.duration, videoDuration));
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!isValid}>
            Confirmar e Continuar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
