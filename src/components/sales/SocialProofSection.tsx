"use client";

import React from 'react';
import { Play, Pause } from 'lucide-react';

function VideoPlayer() {
    const videoRef = React.useRef<HTMLVideoElement>(null);
    const [isPlaying, setIsPlaying] = React.useState(false);

    const togglePlay = (e: React.MouseEvent) => {
        e.preventDefault();
        if (videoRef.current) {
            if (isPlaying) {
                videoRef.current.pause();
            } else {
                videoRef.current.play();
            }
            setIsPlaying(!isPlaying);
        }
    };

    return (
        <div className="relative w-full h-full" onClick={togglePlay}>
            <video
                ref={videoRef}
                className="w-full h-full object-cover"
                playsInline
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                controls={isPlaying} // Show controls only when playing
            >
                <source src="/videos/depoimento-jefinho-coronel.mp4" type="video/mp4" />
                Seu navegador não suporta o elemento de vídeo.
            </video>

            {/* Custom Play Overlay - Visible when not playing */}
            {!isPlaying && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/20 transition-all duration-300 backdrop-blur-[1px]">
                    <div className="h-20 w-20 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center border border-white/30 text-white shadow-2xl group-hover:scale-110 group-hover:bg-orange-500 transition-all duration-300">
                        <Play className="h-8 w-8 fill-current ml-1" />
                    </div>
                </div>
            )}

            {/* Info Overlay - Visible when not playing */}
            {!isPlaying && (
                <div className="absolute bottom-0 left-0 w-full p-6 bg-gradient-to-t from-black/90 via-black/50 to-transparent pt-20 pointer-events-none">
                    <p className="font-bold text-white text-xl mb-1">Jefinho</p>
                    <p className="text-white/80 text-sm font-medium">Coronel Picanha</p>

                    <div className="mt-4 flex items-center text-orange-400 text-xs font-bold uppercase tracking-wider animate-pulse">
                        <Play className="w-3 h-3 mr-2 fill-current" />
                        Clique para assistir
                    </div>
                </div>
            )}
        </div>
    );
}

export function SocialProofSection() {
    return (
        <section className="py-24 bg-background">
            <div className="container px-4 md:px-6">
                <h2 className="text-3xl md:text-4xl font-bold text-center mb-16">
                    O que dizem nossos parceiros
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Real Video */}
                    <div className="aspect-[9/16] bg-black rounded-2xl overflow-hidden border border-border relative group cursor-pointer shadow-lg hover:shadow-orange-500/10 transition-all duration-300">
                        <VideoPlayer />
                    </div>

                    {/* Placeholders */}
                    {[1, 2].map((i) => (
                        <div key={i} className="aspect-[9/16] bg-muted/50 relative rounded-2xl overflow-hidden border border-border flex flex-col justify-center items-center text-center p-6">
                            <div className="h-16 w-16 bg-muted rounded-full flex items-center justify-center mb-4 opacity-50">
                                <Play className="h-8 w-8 text-muted-foreground ml-1" />
                            </div>
                            <p className="font-semibold text-muted-foreground">Depoimento {i + 1}</p>
                            <p className="text-sm text-muted-foreground/60">Em breve</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
