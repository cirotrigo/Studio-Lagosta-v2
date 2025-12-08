"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

export function CtaSection() {
    return (
        <section className="py-24 bg-orange-600 text-white relative overflow-hidden">
            {/* Background decorative pattern */}
            <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '40px 40px' }} />

            <div className="container px-4 md:px-6 relative z-10 text-center">
                <h2 className="text-3xl md:text-5xl font-bold mb-6 max-w-3xl mx-auto">
                    Você pode continuar postando por postar... <br />
                    <span className="opacity-80">ou pode colocar a Lagosta para fazer seu restaurante crescer.</span>
                </h2>

                <p className="text-xl md:text-2xl mb-12 max-w-2xl mx-auto opacity-90">
                    Método, precisão e resultado. Sem amadorismo.
                </p>

                <Button size="lg" className="bg-white text-orange-600 hover:bg-orange-50 h-16 px-10 text-xl font-bold rounded-full shadow-2xl transition-all hover:scale-105" asChild>
                    <Link href="https://wa.me/5527997578627?text=Quero%20crescer%20meu%20restaurante%20agora" target="_blank">
                        Quero crescer meu restaurante agora
                        <ArrowRight className="ml-2 h-6 w-6" />
                    </Link>
                </Button>
            </div>
        </section>
    );
}
