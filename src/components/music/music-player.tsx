'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Pause, Music, MicOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MusicPlayerProps {
  originalUrl: string;
  instrumentalUrl?: string | null;
  musicName: string;
}

type AudioVersion = 'original' | 'instrumental';

export function MusicPlayer({ originalUrl, instrumentalUrl, musicName }: MusicPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentVersion, setCurrentVersion] = useState<AudioVersion>('original');
  const audioRef = useRef<HTMLAudioElement>(null);

  // URL atual baseada na versão selecionada
  const currentUrl = currentVersion === 'instrumental' && instrumentalUrl ? instrumentalUrl : originalUrl;

  // Atualizar source quando trocar de versão
  useEffect(() => {
    if (audioRef.current) {
      const wasPlaying = !audioRef.current.paused;
      const currentTime = audioRef.current.currentTime;

      audioRef.current.src = currentUrl;
      audioRef.current.currentTime = currentTime;

      if (wasPlaying) {
        audioRef.current.play().catch(() => {
          setIsPlaying(false);
        });
      }
    }
  }, [currentUrl]);

  const togglePlay = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(() => {
        setIsPlaying(false);
      });
    }
    setIsPlaying(!isPlaying);
  };

  const switchVersion = (version: AudioVersion) => {
    setCurrentVersion(version);
  };

  return (
    <div className="flex items-center gap-2">
      {/* Audio element (hidden) */}
      <audio
        ref={audioRef}
        src={currentUrl}
        onEnded={() => setIsPlaying(false)}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
      />

      {/* Play/Pause button */}
      <Button
        size="sm"
        variant="ghost"
        onClick={togglePlay}
        className="h-8 w-8 p-0"
        title={isPlaying ? 'Pausar' : 'Reproduzir'}
      >
        {isPlaying ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4" />
        )}
      </Button>

      {/* Version selector buttons */}
      <div className="flex rounded-md border overflow-hidden">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => switchVersion('original')}
          className={cn(
            'h-7 px-2 rounded-none border-r text-xs',
            currentVersion === 'original'
              ? 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground'
              : 'hover:bg-muted'
          )}
          title="Música original"
        >
          <Music className="h-3 w-3 mr-1" />
          Original
        </Button>

        {instrumentalUrl && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => switchVersion('instrumental')}
            className={cn(
              'h-7 px-2 rounded-none text-xs',
              currentVersion === 'instrumental'
                ? 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground'
                : 'hover:bg-muted'
            )}
            title="Instrumental (sem vocais)"
          >
            <MicOff className="h-3 w-3 mr-1" />
            Instrumental
          </Button>
        )}
      </div>
    </div>
  );
}
