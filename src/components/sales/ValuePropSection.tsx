"use client";

import React from 'react';
import { CheckCircle2 } from 'lucide-react';

export function ValuePropSection() {
    const benefits = [
        "Lotar sua casa nos dias fracos.",
        "Aumentar ticket médio com estratégia de cardápio e campanhas.",
        "Criar conteúdo que vende comida de verdade, não mockup artificial.",
        "Automatizar atendimento, reservas e campanhas.",
        "Transformar seu restaurante em marca — e não só em um ponto comercial."
    ];

    return (
        <section className="py-24 bg-zinc-950 text-white">
            <div className="container px-4 md:px-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

                    <div className="order-2 lg:order-1">
                        <h2 className="text-3xl md:text-5xl font-bold mb-8">
                            Por que contratar a <span className="text-orange-500">Lagosta Criativa?</span>
                        </h2>

                        <div className="space-y-6">
                            {benefits.map((benefit, idx) => (
                                <div key={idx} className="flex items-start gap-4">
                                    <CheckCircle2 className="h-6 w-6 text-green-500 shrink-0 mt-1" />
                                    <p className="text-lg md:text-xl font-medium text-zinc-200">{benefit}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Visual element representing Value */}
                    <div className="order-1 lg:order-2 bg-gradient-to-tr from-orange-600 to-amber-500 rounded-3xl p-1">
                        <div className="bg-zinc-900 rounded-[22px] h-full p-8 md:p-12 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/20 blur-[100px]" />

                            <div className="relative z-10 flex flex-col justify-center h-full space-y-8">
                                <div className="text-center">
                                    <span className="block text-6xl font-bold text-white mb-2">ROI</span>
                                    <span className="text-zinc-400">Retorno sobre o Investimento</span>
                                </div>
                                <div className="h-px w-full bg-zinc-700" />
                                <div className="text-center">
                                    <span className="block text-6xl font-bold text-white mb-2">LTV</span>
                                    <span className="text-zinc-400">Valor Vitalício do Cliente</span>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </section>
    );
}
