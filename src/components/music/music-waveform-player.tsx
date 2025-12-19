'use client';

import { useState, useRef, useEffect, useId } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Pause, Music, MicOff, Download, Edit, Trash2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAudioPlayer } from '@/contexts/audio-player-context';

interface MusicWaveformPlayerProps {
    originalUrl: string;
    instrumentalUrl?: string | null;
    musicName: string;
    artist?: string | null;
    duration?: number;
    bpm?: number | null;
    onDownload?: () => void;
    onEdit?: () => void;
    onDelete?: () => void;
    isDownloading?: boolean;
    stemBadge?: React.ReactNode;
}

type AudioVersion = 'original' | 'instrumental';

export function MusicWaveformPlayer({
    originalUrl,
    instrumentalUrl,
    musicName,
    artist,
    duration,
    bpm,
    onDownload,
    onEdit,
    onDelete,
    isDownloading,
    stemBadge,
}: MusicWaveformPlayerProps) {
    const playerId = useId();
    const { registerAudio, unregisterAudio, pauseOthers } = useAudioPlayer();
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentVersion, setCurrentVersion] = useState<AudioVersion>('original');
    const [currentTime, setCurrentTime] = useState(0);
    const [totalDuration, setTotalDuration] = useState(0);
    const [waveformData, setWaveformData] = useState<number[]>([]);
    const audioRef = useRef<HTMLAudioElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // URL atual baseada na versão selecionada
    const currentUrl = currentVersion === 'instrumental' && instrumentalUrl ? instrumentalUrl : originalUrl;

    // Register/unregister audio element with global context
    useEffect(() => {
        const audio = audioRef.current;
        if (audio) {
            registerAudio(playerId, audio);
        }
        return () => {
            unregisterAudio(playerId);
        };
    }, [playerId, registerAudio, unregisterAudio]);

    // Generate waveform data (simplified visualization)
    useEffect(() => {
        // Generate random waveform data for visualization
        // In a real implementation, you would analyze the audio file
        const bars = 80;
        const data = Array.from({ length: bars }, () => Math.random() * 0.7 + 0.3);
        setWaveformData(data);
    }, []);

    // Draw waveform
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || waveformData.length === 0) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const draw = () => {
            const { width, height } = canvas;
            const barWidth = width / waveformData.length;
            const progress = totalDuration > 0 ? currentTime / totalDuration : 0;

            ctx.clearRect(0, 0, width, height);

            waveformData.forEach((value, index) => {
                const barHeight = value * height * 0.8;
                const x = index * barWidth;
                const y = (height - barHeight) / 2;

                // Determine if this bar is in the played section
                const barProgress = index / waveformData.length;
                const isPlayed = barProgress <= progress;

                // Use CSS variables for theme-aware colors
                const isDark = document.documentElement.classList.contains('dark');

                if (isPlayed) {
                    ctx.fillStyle = isDark ? '#ea580c' : '#ea580c'; // Orange for played
                } else {
                    ctx.fillStyle = isDark ? '#404040' : '#d4d4d8'; // Gray for unplayed
                }

                ctx.fillRect(x, y, barWidth - 1, barHeight);
            });
        };

        draw();
    }, [waveformData, currentTime, totalDuration]);

    // Update current time
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const updateTime = () => {
            setCurrentTime(audio.currentTime);
        };

        const updateDuration = () => {
            setTotalDuration(audio.duration);
        };

        audio.addEventListener('timeupdate', updateTime);
        audio.addEventListener('loadedmetadata', updateDuration);

        return () => {
            audio.removeEventListener('timeupdate', updateTime);
            audio.removeEventListener('loadedmetadata', updateDuration);
        };
    }, []);

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
            // Pause all other players before playing this one
            pauseOthers(playerId);
            audioRef.current.play().catch(() => {
                setIsPlaying(false);
            });
        }
        setIsPlaying(!isPlaying);
    };

    const switchVersion = (version: AudioVersion) => {
        setCurrentVersion(version);
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const handleWaveformClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        const audio = audioRef.current;
        if (!canvas || !audio || totalDuration === 0) return;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const progress = x / rect.width;
        audio.currentTime = progress * totalDuration;
    };

    return (
        <div className="group relative flex items-center gap-4 rounded-lg border border-border bg-card p-4 transition-all hover:shadow-md dark:hover:shadow-lg dark:hover:shadow-orange-500/10">
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
                size="icon"
                variant="ghost"
                onClick={togglePlay}
                className="h-12 w-12 shrink-0 rounded-full bg-primary/10 hover:bg-primary/20 dark:bg-primary/20 dark:hover:bg-primary/30"
                title={isPlaying ? 'Pausar' : 'Reproduzir'}
            >
                {isPlaying ? (
                    <Pause className="h-5 w-5 text-primary" />
                ) : (
                    <Play className="h-5 w-5 text-primary" />
                )}
            </Button>

            {/* Track info and waveform */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-semibold text-foreground truncate">{musicName}</h3>
                    {stemBadge}
                </div>
                <div className="flex items-center gap-3 mb-2 text-sm text-muted-foreground">
                    <span className="truncate">{artist || 'Sem artista'}</span>
                    {duration && <span>•</span>}
                    {duration && <span>{formatTime(duration)}</span>}
                </div>

                {/* Waveform */}
                <div className="relative">
                    <canvas
                        ref={canvasRef}
                        width={800}
                        height={60}
                        className="w-full h-[60px] cursor-pointer rounded"
                        onClick={handleWaveformClick}
                    />
                    <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
                        <span>{formatTime(currentTime)}</span>
                        <span>{formatTime(totalDuration)}</span>
                    </div>
                </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2 shrink-0">
                {/* Version selector buttons */}
                <div className="flex rounded-md border border-border overflow-hidden">
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => switchVersion('original')}
                        className={cn(
                            'h-8 px-3 rounded-none border-r border-border text-xs',
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
                                'h-8 px-3 rounded-none text-xs',
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

                {/* Action buttons */}
                {onDownload && (
                    <Button
                        size="icon"
                        variant="ghost"
                        onClick={onDownload}
                        disabled={isDownloading}
                        className="h-8 w-8"
                        title="Baixar ZIP com versões original e instrumental"
                    >
                        {isDownloading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Download className="h-4 w-4" />
                        )}
                    </Button>
                )}

                {onEdit && (
                    <Button
                        size="icon"
                        variant="ghost"
                        onClick={onEdit}
                        className="h-8 w-8"
                        title="Editar música"
                    >
                        <Edit className="h-4 w-4" />
                    </Button>
                )}

                {onDelete && (
                    <Button
                        size="icon"
                        variant="ghost"
                        onClick={onDelete}
                        className="h-8 w-8 hover:bg-destructive/10"
                        title="Excluir música"
                    >
                        <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                )}
            </div>
        </div>
    );
}
