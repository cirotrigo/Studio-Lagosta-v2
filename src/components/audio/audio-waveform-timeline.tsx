'use client';

import { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions';
import { Play, Pause, RotateCcw, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

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
  const waveformWrapperRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const regionsPluginRef = useRef<RegionsPlugin | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startTimeSnapshot: number;
    selectionLength: number;
  } | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [isDraggingWindow, setIsDraggingWindow] = useState(false);
  const [isFixedWindow, setIsFixedWindow] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(pointer: coarse)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(pointer: coarse)');
    const handleChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        setIsFixedWindow(true);
      }
    };
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  // Formatar tempo em MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Determinar se a música é maior ou menor que o vídeo
  const selectedDuration = Math.max(endTime - startTime, 0.1);
  const isMusicLonger = selectedDuration > videoDuration;
  const isMusicShorter = selectedDuration < videoDuration;

  const getActiveRegion = () => {
    const plugin = regionsPluginRef.current as unknown as { regions?: Record<string, any> };
    if (!plugin?.regions) return undefined;
    const regions = Object.values(plugin.regions);
    return regions[0];
  };

  const handleSliderChange = (value: number[]) => {
    const [start, end] = value;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return;
    updateSelection(start, end - start);
  };

  const handleFixedDragStart = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isFixedWindow || !waveformWrapperRef.current) return;
    event.preventDefault();
    const selectionLength = selectedDuration;
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startTimeSnapshot: startTime,
      selectionLength,
    };
    setIsDraggingWindow(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleFixedDragMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current || !waveformWrapperRef.current) return;
    const { startX, startTimeSnapshot, selectionLength, pointerId } = dragStateRef.current;
    if (event.pointerId !== pointerId) return;
    const width = waveformWrapperRef.current.clientWidth || 1;
    const secondsPerPixel = audioDuration / width;
    const deltaX = event.clientX - startX;
    const newStart = startTimeSnapshot - deltaX * secondsPerPixel;
    updateSelection(newStart, selectionLength);
  };

  const handleFixedDragEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current?.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    dragStateRef.current = null;
    setIsDraggingWindow(false);
  };

  const sliderValue: [number, number] = [
    Number(Math.max(0, startTime).toFixed(2)),
    Number(Math.min(audioDuration, endTime).toFixed(2)),
  ];

  const updateSelection = (start: number, length = selectedDuration) => {
    const safeLength = Math.min(length, audioDuration);
    const maxStart = Math.max(0, audioDuration - safeLength);
    const clampedStart = Math.min(Math.max(0, start), maxStart);
    const clampedEnd = Math.min(audioDuration, clampedStart + safeLength);
    onStartTimeChange(Number(clampedStart.toFixed(2)));
    onEndTimeChange(Number(clampedEnd.toFixed(2)));
  };

  useEffect(() => {
    if (!containerRef.current) return;

    const wavesurfer = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#94a3b8',
      progressColor: '#3b82f6',
      cursorColor: '#1e40af',
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      height: 90,
      normalize: true,
      backend: 'WebAudio',
    });

    const regions = wavesurfer.registerPlugin(RegionsPlugin.create());
    regionsPluginRef.current = regions;

    wavesurfer.load(audioUrl);

    wavesurfer.on('ready', () => {
      setIsLoading(false);
      regions.addRegion({
        start: startTime,
        end: endTime,
        color: 'rgba(59, 130, 246, 0.25)',
        drag: true,
        resize: true,
      } as any);
      const region = getActiveRegion();
      if (region) {
        region.setOptions({
          handleStyle: {
            width: '14px',
            backgroundColor: '#2563eb',
            borderRadius: '9999px',
            border: '2px solid #fff',
            opacity: 0.85,
          },
        });
      }
    });

    wavesurfer.on('play', () => setIsPlaying(true));
    wavesurfer.on('pause', () => setIsPlaying(false));
    wavesurfer.on('timeupdate', (time) => setCurrentTime(time));

    regions.on('region-updated', (region) => {
      onStartTimeChange(region.start);
      onEndTimeChange(region.end);
    });

    wavesurferRef.current = wavesurfer;

    return () => {
      wavesurfer.destroy();
    };
  }, [audioUrl]);

  useEffect(() => {
    const region = getActiveRegion();
    if (!region) return;
    region.setOptions({
      start: startTime,
      end: endTime,
    });
    if (typeof region.updateRender === 'function') {
      region.updateRender();
    }
  }, [startTime, endTime]);

  useEffect(() => {
    const region = getActiveRegion();
    if (!region) return;
    region.setOptions({
      drag: !isFixedWindow,
      resize: !isFixedWindow,
    });
  }, [isFixedWindow]);

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

      <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
        <div>
          <p className="text-sm font-semibold text-gray-700">Modo janela fixa</p>
          <p className="text-xs text-gray-500">
            Deixe a seleção centralizada e arraste a onda para escolher o trecho.
          </p>
        </div>
        <Switch checked={isFixedWindow} onCheckedChange={setIsFixedWindow} />
      </div>

      {/* Waveform */}
      <div className="relative" ref={waveformWrapperRef}>
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          </div>
        )}
        <div ref={containerRef} className="rounded-md bg-gray-50" />

        {isFixedWindow && (
          <div
            className={cn(
              'absolute inset-0 z-20 rounded-md border-2 border-dashed border-blue-300/80 bg-blue-500/5',
              isDraggingWindow ? 'cursor-grabbing' : 'cursor-grab'
            )}
            onPointerDown={handleFixedDragStart}
            onPointerMove={handleFixedDragMove}
            onPointerUp={handleFixedDragEnd}
            onPointerLeave={handleFixedDragEnd}
            onPointerCancel={handleFixedDragEnd}
          >
            <div className="pointer-events-none absolute inset-y-2 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-blue-500/60" />
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Slider
          value={sliderValue}
          onValueChange={handleSliderChange}
          min={0}
          max={audioDuration}
          step={0.1}
          className="py-2"
        />
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Início: {formatTime(startTime)}</span>
          <span>Fim: {formatTime(endTime)}</span>
        </div>
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
      <div className="text-xs text-gray-500 space-y-1">
        <p>💡 Use os nós grandes abaixo da forma de onda para ajustar início e fim da música.</p>
        <p>👆 Com a janela fixa ligada, arraste a onda para “deslizar” o trecho mantendo o tamanho.</p>
      </div>
    </div>
  );
}
