'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { FaixaMusica } from '@/hooks/use-music-library';
import { Music, PlayCircle, PauseCircle, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MusicCardProps {
  musica: FaixaMusica;
  isSelected: boolean;
  videoDuration: number;
  onSelect: () => void;
}

export function MusicCard({ musica, isSelected, videoDuration, onSelect }: MusicCardProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const previewEventName = 'music-preview-play';

  useEffect(() => {
    const pauseIfAnotherIsPlaying = (event: Event) => {
      const detail = (event as CustomEvent<{ id: number }>).detail;
      if (!detail || detail.id === musica.id) return;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    };

    window.addEventListener(previewEventName, pauseIfAnotherIsPlaying as EventListener);

    return () => {
      window.removeEventListener(previewEventName, pauseIfAnotherIsPlaying as EventListener);
    };
  }, [musica.id]);

  const handlePlayPause = (e: React.MouseEvent) => {
    e.stopPropagation();

    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      window.dispatchEvent(new CustomEvent(previewEventName, { detail: { id: musica.id } }));
      audioRef.current
        .play()
        .then(() => {
          setIsPlaying(true);
        })
        .catch(() => {
          setIsPlaying(false);
        });
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isCompatible = musica.duration >= videoDuration * 0.8; // Música deve ter pelo menos 80% da duração do vídeo
  const durationMatch = Math.abs(musica.duration - videoDuration) < 5; // Duração similar (dentro de 5s)

  return (
    <>
      <audio
        ref={audioRef}
        src={musica.blobUrl}
        onEnded={() => setIsPlaying(false)}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
      />

      <div
        onClick={onSelect}
        className={cn(
          'group relative cursor-pointer rounded-lg border-2 p-3 transition-all hover:shadow-md',
          isSelected
            ? 'border-blue-500 bg-blue-50 shadow-md'
            : 'border-gray-200 hover:border-gray-300'
        )}
      >
        {/* Ícone de seleção */}
        {isSelected && (
          <div className="absolute -right-2 -top-2 rounded-full bg-blue-500 p-1 text-white shadow-md">
            <CheckCircle2 className="h-4 w-4" />
          </div>
        )}

        {/* Thumbnail/Artwork */}
        <div className="mb-2 flex aspect-square items-center justify-center rounded-md bg-gradient-to-br from-purple-400 to-pink-400">
          {musica.thumbnailUrl ? (
            <div className="relative h-full w-full">
              <Image
                src={musica.thumbnailUrl}
                alt={musica.name}
                fill
                className="rounded-md object-cover"
              />
            </div>
          ) : (
            <Music className="h-12 w-12 text-white" />
          )}
        </div>

        {/* Info */}
        <div className="space-y-1">
          <h4 className="truncate text-sm font-semibold" title={musica.name}>
            {musica.name}
          </h4>
          {musica.artist && (
            <p className="truncate text-xs text-gray-600" title={musica.artist}>
              {musica.artist}
            </p>
          )}

          {/* Tags */}
          <div className="flex flex-wrap gap-1">
            {musica.genre && (
              <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-700">
                {musica.genre}
              </span>
            )}
            {musica.mood && (
              <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700">
                {musica.mood}
              </span>
            )}
          </div>

          {/* Duração e compatibilidade */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-gray-600">{formatDuration(musica.duration)}</span>
            <div className="flex items-center gap-1">
              {durationMatch ? (
                <span title="Duração compatível">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                </span>
              ) : !isCompatible ? (
                <span title="Duração incompatível">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Play/Pause Button */}
        <button
          onClick={handlePlayPause}
          className={cn(
            'mt-2 flex w-full items-center justify-center gap-2 rounded-md py-1.5 text-sm transition-colors',
            isPlaying
              ? 'bg-blue-500 text-white hover:bg-blue-600'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          )}
        >
          {isPlaying ? (
            <>
              <PauseCircle className="h-4 w-4" />
              Pausar
            </>
          ) : (
            <>
              <PlayCircle className="h-4 w-4" />
              Preview
            </>
          )}
        </button>
      </div>
    </>
  );
}
