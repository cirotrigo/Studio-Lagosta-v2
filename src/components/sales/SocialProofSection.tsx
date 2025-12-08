"use client";

import React from 'react';
import { Play } from 'lucide-react';

export function SocialProofSection() {
    return (
        <section className="py-24 bg-background">
            <div className="container px-4 md:px-6">
                <h2 className="text-3xl md:text-4xl font-bold text-center mb-16">
                    O que dizem nossos parceiros
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Real Video */}
                    <div className="aspect-[9/16] bg-black rounded-2xl overflow-hidden border border-border relative group">
                        <video
                            controls
                            className="w-full h-full object-cover"
                            poster="/clients/client-8.png" // Fallback to logo which might look weird but better than nothing, or let user know. 
                        // Actually, let's just not set poster and let browser pick first frame or black.
                        >
                            <source src="/videos/depoimento-jefinho-coronel.mp4" type="video/mp4" />
                            Seu navegador não suporta o elemento de vídeo.
                        </video>
                        <div className="absolute bottom-0 left-0 w-full p-4 bg-gradient-to-t from-black/90 to-transparent pointer-events-none">
                            <p className="font-bold text-white text-lg">Jefinho</p>
                            <p className="text-white/80 text-sm">Coronel Picanha</p>
                        </div>
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
