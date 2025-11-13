'use client';

import { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions';
import { Play, Pause, RotateCcw, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AudioWaveformTimelineProps {
  audioUrl: string;
  audioDuration: number;
  videoDuration: number;
  startTime: number;
  endTime: number;
  onStartTimeChange: (time: number) => void;
  onEndTimeChange: (time: number) => void;
}

export function AudioWaveformTimeline({
  audioUrl,
  audioDuration,
  videoDuration,
  startTime,
  endTime,
  onStartTimeChange,
  onEndTimeChange,
}: AudioWaveformTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const regionsPluginRef = useRef<RegionsPlugin | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);

  // Formatar tempo em MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Determinar se a música é maior ou menor que o vídeo
  const selectedDuration = endTime - startTime;
  const isMusicLonger = selectedDuration > videoDuration;
  const isMusicShorter = selectedDuration < videoDuration;

  useEffect(() => {
    if (!containerRef.current) return;

    // Criar instância do WaveSurfer
    const wavesurfer = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#94a3b8',
      progressColor: '#3b82f6',
      cursorColor: '#1e40af',
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      height: 80,
      normalize: true,
      backend: 'WebAudio',
    });

    // Plugin de regiões
    const regions = wavesurfer.registerPlugin(RegionsPlugin.create());

    regionsPluginRef.current = regions;

    // Carregar áudio
    wavesurfer.load(audioUrl);

    // Event listeners
    wavesurfer.on('ready', () => {
      setIsLoading(false);

      // Criar região inicial baseada em startTime e endTime
      regions.addRegion({
        start: startTime,
        end: endTime,
        color: 'rgba(59, 130, 246, 0.3)',
        drag: true,
        resize: true,
      });
    });

    wavesurfer.on('play', () => setIsPlaying(true));
    wavesurfer.on('pause', () => setIsPlaying(false));
    wavesurfer.on('timeupdate', (time) => setCurrentTime(time));

    // Listener para atualização de região
    regions.on('region-updated', (region) => {
      onStartTimeChange(region.start);
      onEndTimeChange(region.end);
    });

    wavesurferRef.current = wavesurfer;

    // Cleanup
    return () => {
      wavesurfer.destroy();
    };
  }, [audioUrl]); // Apenas recarregar quando audioUrl mudar

  const handlePlayPause = () => {
    if (!wavesurferRef.current) return;
    wavesurferRef.current.playPause();
  };

  const handleReset = () => {
    if (!wavesurferRef.current || !regionsPluginRef.current) return;

    // Limpar regiões existentes
    regionsPluginRef.current.clearRegions();

    // Criar nova região com duração do vídeo
    const newEndTime = Math.min(videoDuration, audioDuration);
    regionsPluginRef.current.addRegion({
      start: 0,
      end: newEndTime,
      color: 'rgba(59, 130, 246, 0.3)',
      drag: true,
      resize: true,
    });

    onStartTimeChange(0);
    onEndTimeChange(newEndTime);
  };

  return (
    <div className="space-y-4 rounded-lg border p-4">
      {/* Info do vídeo */}
      <div className="flex items-center justify-between text-sm text-gray-600">
        <span>Vídeo: 0:00 - {formatTime(videoDuration)}</span>
        <span className="font-medium">Duração: {formatTime(videoDuration)}</span>
      </div>

      {/* Waveform */}
      <div className="relative">
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          </div>
        )}
        <div ref={containerRef} className="rounded-md bg-gray-50" />
      </div>

      {/* Controles de playback */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={handlePlayPause}
          disabled={isLoading}
          className="gap-2"
        >
          {isPlaying ? (
            <>
              <Pause className="h-4 w-4" />
              Pausar
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              Reproduzir
            </>
          )}
        </Button>

        <Button variant="ghost" size="sm" onClick={handleReset} disabled={isLoading} className="gap-2">
          <RotateCcw className="h-4 w-4" />
          Resetar
        </Button>

        <div className="flex-1 text-sm text-gray-600">
          Tempo: {formatTime(currentTime)} / {formatTime(audioDuration)}
        </div>
      </div>

      {/* Info da seleção */}
      <div className="space-y-2 rounded-lg bg-gray-50 p-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-gray-700">Trecho selecionado:</span>
          <span className="text-gray-600">
            {formatTime(startTime)} → {formatTime(endTime)} ({formatTime(selectedDuration)})
          </span>
        </div>

        {/* Avisos de compatibilidade */}
        {isMusicLonger && (
          <div className="flex items-start gap-2 text-sm text-amber-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Trecho selecionado é maior que o vídeo ({formatTime(selectedDuration)} &gt;{' '}
              {formatTime(videoDuration)}) - será cortado
            </span>
          </div>
        )}

        {isMusicShorter && (
          <div className="flex items-start gap-2 text-sm text-amber-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Trecho selecionado é menor que o vídeo ({formatTime(selectedDuration)} &lt;{' '}
              {formatTime(videoDuration)}) - vídeo terá silêncio no final
            </span>
          </div>
        )}

        {!isMusicLonger && !isMusicShorter && (
          <div className="flex items-center gap-2 text-sm text-green-700">
            <div className="h-2 w-2 rounded-full bg-green-500" />
            <span>Duração perfeita para o vídeo!</span>
          </div>
        )}
      </div>

      {/* Instruções */}
      <div className="text-xs text-gray-500">
        <p>💡 Arraste as bordas da região destacada para ajustar o trecho da música</p>
      </div>
    </div>
  );
}
