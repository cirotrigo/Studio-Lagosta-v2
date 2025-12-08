"use client";

import React from 'react';
import { XCircle, AlertTriangle } from 'lucide-react';

export function ProblemSection() {
    return (
        <section className="py-24 bg-muted/30">
            <div className="container px-4 md:px-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">

                    <div className="space-y-6">
                        <h2 className="text-3xl md:text-4xl font-bold text-foreground">
                            A verdade que ninguém te conta: <br />
                            <span className="text-red-500">Por que a maioria fracassa?</span>
                        </h2>
                        <p className="text-lg text-muted-foreground">
                            A maioria dos restaurantes não fracassa por comida ruim. Fracassa porque a operação não conversa com o marketing.
                        </p>

                        <div className="space-y-4">
                            {[
                                "A comunicação é genérica demais.",
                                "A operação não conversa com o marketing.",
                                "A produção de fotos/vídeos é amadora (ou IA fake).",
                                "Não existe constância na presença digital.",
                                "O gestor não tem dados reais para decidir promoções.",
                                "Contratar agência 'que posta 12 artes por mês' só mascara o buraco."
                            ].map((item, idx) => (
                                <div key={idx} className="flex items-start gap-3 p-4 rounded-lg bg-background border border-border/50 shadow-sm">
                                    <XCircle className="h-6 w-6 text-red-500 shrink-0 mt-0.5" />
                                    <span className="text-foreground font-medium">{item}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="relative">
                        <div className="absolute -inset-1 bg-gradient-to-r from-red-500 to-orange-600 rounded-2xl blur opacity-20"></div>
                        <div className="relative bg-background p-8 md:p-12 rounded-2xl border border-border shadow-2xl">
                            <AlertTriangle className="h-12 w-12 text-orange-500 mb-6" />
                            <h3 className="text-2xl font-bold mb-4">O ciclo da falência digital</h3>
                            <p className="text-muted-foreground mb-6">
                                Você contrata um social media. Ele faz posts bonitos. Você ganha likes. Mas na terça-feira à noite, <strong className="text-foreground">suas mesas continuam vazias.</strong>
                            </p>
                            <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-xl">
                                <p className="text-xl md:text-2xl font-bold text-red-600 italic text-center">
                                    "Marketing sem estratégia só deixa o restaurante mais bonito antes de continuar vazio."
                                </p>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </section>
    );
}
