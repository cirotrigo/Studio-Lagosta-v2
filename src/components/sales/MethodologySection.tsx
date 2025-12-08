"use client";

import React from 'react';
import { GlowingEffect } from '@/components/ui/glowing-effect';

const steps = [
    {
        number: "01",
        title: "Posicionamento Visual de Elite",
        description: "Geramos desejo através da verdade. Fotos e vídeos dos seus produtos reais que criam conexão genuína, sem parecer comida de plástico."
    },
    {
        number: "02",
        title: "Constância Estratégica",
        description: "Quem não é visto, não é lembrado. Mantemos suas redes ativas com conteúdo que conecta e vende."
    },
    {
        number: "03",
        title: "Atendimento Inteligente (IA)",
        description: "Não perca vendas na madrugada. Nossa IA atende clientes e tira dúvidas 24h por dia no WhatsApp e Instagram."
    },
    {
        number: "04",
        title: "Tráfego e Performance",
        description: "Para planos completos: levamos sua mensagem para milhares de pessoas certas na sua região com anúncios pagos."
    },
    {
        number: "05",
        title: "Parceria de Crescimento",
        description: "Não somos apenas prestadores de serviço. Somos o braço direito do seu marketing, jogando junto pelo resultado."
    }
];

export function MethodologySection() {
    return (
        <section className="py-24 bg-background">
            <div className="container px-4 md:px-6">
                <div className="text-center mb-16">
                    <span className="text-orange-500 font-semibold tracking-wider text-sm uppercase">O Método</span>
                    <h2 className="text-3xl md:text-5xl font-bold mt-2">O Sistema Lagosta</h2>
                    <p className="text-muted-foreground mt-4 text-lg">Não entregamos serviços soltos. Entregamos um método.</p>
                </div>

                <div className="flex flex-col gap-4 max-w-4xl mx-auto">
                    {steps.map((step, idx) => (
                        <div key={idx} className="relative p-6 md:p-8 rounded-2xl border border-border bg-card hover:border-orange-500/30 transition-all group">
                            <GlowingEffect variant="orange" spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} />

                            <div className="relative z-10 flex gap-6 md:gap-8 items-start">
                                <span className="text-4xl md:text-5xl font-black text-muted-foreground/20 leading-none group-hover:text-orange-500/20 transition-colors">{step.number}</span>
                                <div>
                                    <h3 className="text-xl md:text-2xl font-bold text-foreground mb-2">{step.title}</h3>
                                    <p className="text-muted-foreground text-base md:text-lg">{step.description}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

            </div>
        </section>
    );
}
