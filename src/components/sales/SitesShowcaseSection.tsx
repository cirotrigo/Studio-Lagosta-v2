"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowRight, Check } from 'lucide-react';
import Link from 'next/link';
import { GlowingEffect } from '@/components/ui/glowing-effect';

// Prints reais capturados em 23/08/2026 (originais no Drive, "Fotos Lagosta /
// Prints de sites e CRM / Sites"). Sem link externo de propósito: o domínio
// do Clericot ainda aponta para o site antigo, e URL de preview da Vercel não
// é vitrine — quando os domínios estiverem no ar, os cards podem virar links.
const sites = [
    {
        image: "/sites/site-clericot.webp",
        name: "Clericot Café",
        blurb: "Site editorial de 7 páginas: cafeteria, menu de praia, experiências e eventos."
    },
    {
        image: "/sites/site-emporio.webp",
        name: "Empório Fonseca",
        blurb: "Cardápio digital que atualiza em um clique e carrinho que fecha o pedido no WhatsApp."
    },
    {
        image: "/sites/site-cypra.webp",
        name: "Cypra Brasil",
        blurb: "Institucional da marca com pedido direto — Flammes, Cháxado, cafés e vinhos."
    }
];

const beneficios = [
    "Cardápio que você atualiza em um clique",
    "Pedido fechado direto no WhatsApp",
    "Reserva que cai no agente de atendimento"
];

export function SitesShowcaseSection() {
    return (
        <section id="sites" className="py-16 md:py-24 bg-background relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1/3 h-full bg-orange-500/5 blur-3xl pointer-events-none" />

            <div className="container px-4 md:px-6 relative z-10">
                <div className="text-center max-w-3xl mx-auto mb-12">
                    <h2 className="text-3xl md:text-5xl font-bold mb-6">Sites que Fecham Pedido</h2>
                    <p className="text-xl text-muted-foreground">
                        O site do seu restaurante não é um cartão de visita: é o balcão que atende quem chegou pelo Instagram.
                    </p>
                </div>

                <div className="flex flex-wrap justify-center gap-x-8 gap-y-3 mb-12">
                    {beneficios.map((item, idx) => (
                        <span key={idx} className="flex items-center gap-2 text-sm md:text-base text-muted-foreground">
                            <Check className="h-4 w-4 text-orange-500 shrink-0" />
                            {item}
                        </span>
                    ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
                    {sites.map((site, idx) => (
                        <div key={idx} className="group relative rounded-2xl border border-border bg-card overflow-hidden hover:border-orange-500/50 hover:shadow-lg hover:shadow-orange-500/10 transition-all duration-300">
                            <GlowingEffect variant="orange" spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} />
                            <div className="relative z-10">
                                <img
                                    src={site.image}
                                    alt={`Site do ${site.name} desenvolvido pela Lagosta Criativa`}
                                    loading="lazy"
                                    className="w-full h-auto object-cover border-b border-border"
                                />
                                <div className="p-6">
                                    <h3 className="text-lg font-bold mb-2">{site.name}</h3>
                                    <p className="text-sm text-muted-foreground">{site.blurb}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="flex justify-center">
                    <Button size="lg" className="bg-orange-600 hover:bg-orange-700 text-white h-12 px-8 rounded-full shadow-lg shadow-orange-500/25" asChild>
                        <Link href="https://wa.me/5527997578627?text=Quero%20um%20site%20com%20card%C3%A1pio%20digital" target="_blank">
                            Quero meu site
                            <ArrowRight className="ml-2 h-5 w-5" />
                        </Link>
                    </Button>
                </div>
            </div>
        </section>
    );
}
