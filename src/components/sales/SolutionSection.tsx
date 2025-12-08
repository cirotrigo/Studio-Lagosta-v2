"use client";

import React from 'react';
import { Camera, BrainCircuit, BarChart3, ChefHat } from 'lucide-react';
import { GlowingEffect } from '@/components/ui/glowing-effect';

const features = [
    {
        icon: Camera,
        title: "Produção Audiovisual Gastronômica",
        description: "Execução profissional real e apetitosa. Nada de IA fake ou banco de imagens genérico."
    },
    {
        icon: BrainCircuit,
        title: "Marketing Estratégico",
        description: "Não fazemos apenas posts. Criamos campanhas desenhadas para atrair o público certo."
    },
    {
        icon: BarChart3,
        title: "Integração de Dados & Otimização",
        description: "Automações avançadas (Reservas, WhatsApp) e domínio profundo dos seus números."
    },
    {
        icon: ChefHat,
        title: "Visão Operacional de Dono",
        description: "Entendemos de fluxo, CMV, engenharia de cardápio e vendas no salão."
    }
];

export function SolutionSection() {
    return (
        <section className="py-24 bg-background relative overflow-hidden">
            {/* Decorative bg */}
            <div className="absolute top-0 right-0 w-1/3 h-full bg-orange-500/5 blur-3xl pointer-events-none" />

            <div className="container px-4 md:px-6 relative z-10">
                <div className="text-center max-w-3xl mx-auto mb-16">
                    <h2 className="text-3xl md:text-5xl font-bold mb-6">A Solução Lagosta Criativa</h2>
                    <p className="text-xl text-muted-foreground">
                        A única empresa do Espírito Santo que une produção audiovisual de cinema com inteligência de vendas.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
                    {features.map((feature, idx) => (
                        <div key={idx} className="group relative p-8 rounded-2xl border border-border bg-card hover:border-orange-500/50 hover:shadow-lg hover:shadow-orange-500/10 transition-all duration-300">
                            <GlowingEffect variant="orange" spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} />

                            <div className="relative z-10">
                                <div className="h-12 w-12 bg-orange-500/10 rounded-lg flex items-center justify-center mb-6 text-orange-500 group-hover:bg-orange-500 group-hover:text-white transition-colors">
                                    <feature.icon className="h-6 w-6" />
                                </div>
                                <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                                <p className="text-muted-foreground">{feature.description}</p>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="bg-foreground text-background rounded-3xl p-8 md:p-12 text-center shadow-2xl">
                    <h3 className="text-2xl md:text-3xl font-bold mb-4">
                        NÃO somos uma agência.
                    </h3>
                    <p className="text-lg md:text-xl text-zinc-300 max-w-2xl mx-auto">
                        Somos o <span className="text-orange-400 font-bold">backend completo</span> de crescimento para negócios gastronômicos. Entramos na sua cozinha, entendemos seu negócio e fazemos ele vender.
                    </p>
                </div>
            </div>
        </section>
    );
}
