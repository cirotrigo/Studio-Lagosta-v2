"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { ArrowRight, MessagesSquare, Timer, CalendarCheck } from 'lucide-react';
import Link from 'next/link';
import { motion, useMotionValue, useMotionTemplate } from 'framer-motion';

export function HeroSection() {
    const mouseX = useMotionValue(0);
    const mouseY = useMotionValue(0);

    function handleMouseMove({ currentTarget, clientX, clientY }: React.MouseEvent) {
        const { left, top } = currentTarget.getBoundingClientRect();
        mouseX.set(clientX - left);
        mouseY.set(clientY - top);
    }

    return (
        <section
            onMouseMove={handleMouseMove}
            className="relative min-h-[90dvh] flex items-center justify-center overflow-hidden pt-20 pb-16 lg:pt-32 group"
        >
            {/* Mouse Spotlight Effect */}
            <motion.div
                className="pointer-events-none absolute -inset-px opacity-0 transition duration-300 group-hover:opacity-100 z-10"
                style={{
                    background: useMotionTemplate`
                        radial-gradient(
                            600px circle at ${mouseX}px ${mouseY}px,
                            rgba(249, 115, 22, 0.15),
                            transparent 80%
                        )
                    `,
                }}
            />

            {/* Top Navigation — o "Entrar no Studio" mudou para o rodapé: no
                topo do site de vendas, ele confundia o dono de restaurante. */}
            <div className="absolute top-0 right-0 p-4 md:p-8 z-50 flex items-center gap-4">
                <ThemeToggle />
            </div>

            {/* Background Gradients/Effects */}
            <div className="absolute inset-0 z-0">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-gradient-to-b from-background via-background/90 to-background z-10" />

                {/* Placeholder for a hero background image/video if available later */}
                <div className="w-full h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-orange-500/20 via-background to-background opacity-40"></div>
            </div>

            <div className="container relative z-20 px-4 md:px-6 flex flex-col items-center text-center">
                <div className="inline-flex items-center rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-sm font-medium text-orange-500 mb-8 backdrop-blur-sm">
                    <span className="flex h-2 w-2 rounded-full bg-orange-500 mr-2 animate-pulse"></span>
                    Marketing Gastronômico Especializado
                </div>

                <div className="mb-6 relative w-full flex justify-center">
                    {/* Logo Image */}
                    <div className="relative w-64 h-24 md:w-96 md:h-36">
                        <img
                            src="/lagosta-logo.png"
                            alt="Lagosta Criativa"
                            className="w-full h-full object-contain drop-shadow-2xl"
                        />
                    </div>
                </div>

                <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight text-foreground max-w-5xl mb-6">
                    <span className="text-muted-foreground text-3xl md:text-5xl lg:text-6xl mt-2 block font-semibold">
                        Marketing que Gera <span className="text-orange-500 underline decoration-orange-500/30 underline-offset-8">Fila na Porta</span>
                    </span>
                </h1>

                <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mb-10 leading-relaxed">
                    Não vendemos posts. Vendemos <span className="text-foreground font-semibold">mesas ocupadas</span>, <span className="text-foreground font-semibold">ticket médio maior</span> e <span className="text-foreground font-semibold">marca memorável</span>.
                </p>

                <div className="flex flex-col sm:flex-row gap-4 w-full justify-center mb-16">
                    <Button size="lg" className="bg-orange-600 hover:bg-orange-700 text-white h-14 px-8 text-lg rounded-full shadow-lg shadow-orange-500/25" asChild>
                        <Link href="https://wa.me/5527997578627?text=Quero%20escalar%20meu%20restaurante" target="_blank">
                            Quero escalar meu restaurante
                            <ArrowRight className="ml-2 h-5 w-5" />
                        </Link>
                    </Button>
                    <Button size="lg" variant="outline" className="h-14 px-8 text-lg rounded-full border-orange-500/20 hover:bg-orange-500/5 hover:text-orange-500" asChild>
                        <Link href="#pricing">
                            Ver pacotes
                        </Link>
                    </Button>
                    <Button size="lg" variant="outline" className="h-14 px-8 text-lg rounded-full border-orange-500/20 hover:bg-orange-500/5 hover:text-orange-500" asChild>
                        <Link href="#cases">
                            Ver resultados reais
                        </Link>
                    </Button>
                </div>

                {/* Social Proof Numbers — números REAIS, com dono e data.
                    Fonte: painéis de atendimento lidos em 23/08/2026 (entrada
                    "Provas e números reais" da base do projeto 8). Os antigos
                    +40% / +2,5k / +15 não tinham fonte e saíram. */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-16 border-t border-border/50 pt-12 w-full max-w-4xl">
                    <div className="flex flex-col items-center">
                        <div className="flex items-center text-3xl font-bold text-foreground mb-1">
                            <MessagesSquare className="mr-2 h-6 w-6 text-orange-500" />
                            950+
                        </div>
                        <p className="text-sm text-muted-foreground">mensagens respondidas pela IA em agosto na Ilha do Caranguejo — 96,4% das conversas</p>
                    </div>
                    <div className="flex flex-col items-center">
                        <div className="flex items-center text-3xl font-bold text-foreground mb-1">
                            <Timer className="mr-2 h-6 w-6 text-green-500" />
                            &lt; 1 min
                        </div>
                        <p className="text-sm text-muted-foreground">para a primeira resposta no Empório Fonseca — 95,5% das conversas respondidas</p>
                    </div>
                    <div className="flex flex-col items-center">
                        <div className="flex items-center text-3xl font-bold text-foreground mb-1">
                            <CalendarCheck className="mr-2 h-6 w-6 text-blue-500" />
                            9
                        </div>
                        <p className="text-sm text-muted-foreground">restaurantes do ES com conteúdo profissional toda semana — e 7 com agente de IA no atendimento</p>
                    </div>
                </div>
                <p className="mt-4 text-xs text-muted-foreground/70">Números de agosto/2026, lidos nos painéis de atendimento dos clientes.</p>

                {/* Simple Logo Strip Visual */}
                <div className="mt-12 opacity-50 grayscale hover:grayscale-0 transition-all duration-500">
                    <p className="items-center text-sm font-semibold text-muted-foreground mb-4">CONFIRMADO POR GIGANTES DO ES</p>
                    {/* Mobile: Horizontal scroll | Desktop: Wrap */}
                    <div className="flex flex-nowrap md:flex-wrap justify-start md:justify-center gap-6 md:gap-8 items-center overflow-x-auto md:overflow-visible pb-4 md:pb-0 scrollbar-thin scrollbar-thumb-orange-500/20 scrollbar-track-transparent">
                        {/* Client Logos - 48px height */}
                        <img src="/clients/client-1.png" alt="Bacana" className="h-12 max-h-12 w-auto object-contain hover:scale-110 transition-transform flex-shrink-0" />
                        <img src="/clients/client-2.png" alt="Cliente Lagosta Criativa" className="h-12 max-h-12 w-auto object-contain hover:scale-110 transition-transform flex-shrink-0" />
                        <img src="/clients/client-3.png" alt="Cliente Lagosta Criativa" className="h-12 max-h-12 w-auto object-contain hover:scale-110 transition-transform flex-shrink-0" />
                        <img src="/clients/client-4.png" alt="Cliente Lagosta Criativa" className="h-12 max-h-12 w-auto object-contain hover:scale-110 transition-transform flex-shrink-0" />
                        <img src="/clients/client-5.png" alt="Cliente Lagosta Criativa" className="h-12 max-h-12 w-auto object-contain hover:scale-110 transition-transform flex-shrink-0" />
                        <img src="/clients/client-6.png" alt="Seu Quinto" className="h-12 max-h-12 w-auto object-contain hover:scale-110 transition-transform flex-shrink-0" />
                        <img src="/clients/client-7.png" alt="Tero" className="h-12 max-h-12 w-auto object-contain hover:scale-110 transition-transform flex-shrink-0" />
                        <img src="/clients/client-8.png" alt="Coronel Picanha" className="h-12 max-h-12 w-auto object-contain hover:scale-110 transition-transform flex-shrink-0" />
                    </div>
                </div>
            </div>
        </section>
    );
}
