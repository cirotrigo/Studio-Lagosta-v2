"use client";

import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { GlowingEffect } from '@/components/ui/glowing-effect';

const cases = [
    {
        client: "Coronel Picanha",
        category: "Automação Estrutural",
        result: "Redução no tempo de atendimento",
        metric: "+ Reservas Mensais",
        highlight: true,
        logo: "/clients/client-8.png",
        quote: "O atendimento automatizado resolveu nosso maior gargalo operacional com eficiência."
    },
    {
        client: "Seu Quinto",
        category: "Campanhas e Conteúdo",
        result: "Elevação de receita no FDS",
        metric: "Crescimento Real",
        highlight: false,
        logo: "/clients/client-6.png",
        quote: "Campanhas fortes que aumentam feijoada, samba e movimento todo fim de semana."
    },
    {
        client: "Tero",
        category: "Posicionamento",
        result: "Parrilla Premium",
        metric: "+ Percepção de Valor",
        highlight: false,
        logo: "/clients/client-7.png",
        quote: "O audiovisual deles nos permitiu defender preço e reforçar posicionamento premium."
    },
    {
        client: "Espeto Gaúcho",
        category: "Posicionamento & Vendas",
        result: "Alta demanda em retiradas",
        metric: "Recorde de Pedidos",
        highlight: false,
        logo: "/clients/client-3.png",
        quote: "Clareza na comunicação aumentou demais nossos pedidos de retirada nos finais de semana."
    }
]

export function CaseStudiesSection() {
    return (
        <section id="cases" className="py-24 bg-muted/20">
            <div className="container px-4 md:px-6">
                <h2 className="text-3xl md:text-5xl font-bold mb-12 text-center">Resultados Que Falam <br className="md:hidden" />Mais Alto</h2>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
                    {cases.map((item, idx) => (
                        <div key={idx} className="group relative rounded-3xl bg-background border border-border p-6 hover:shadow-2xl transition-all duration-300">
                            <GlowingEffect variant="orange" spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} />

                            <div className="relative z-10 h-full flex flex-col justify-between">
                                <div>
                                    <div className="flex justify-between items-start mb-6">
                                        <div className="h-12 w-24 relative flex items-center justify-start">
                                            <img
                                                src={item.logo}
                                                alt={item.client}
                                                className="h-full w-auto object-contain"
                                            />
                                        </div>
                                        <ArrowUpRight className="h-5 w-5 text-orange-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>

                                    <div className="space-y-2 mb-4">
                                        <span className="text-[10px] font-bold text-orange-500 uppercase tracking-widest">{item.category}</span>
                                        <h3 className="text-xl font-bold text-foreground leading-tight">{item.client}</h3>
                                        <p className="text-sm text-muted-foreground">{item.result}</p>
                                    </div>

                                    {item.quote && (
                                        <p className="text-xs italic text-zinc-500 mt-4 border-l-2 border-orange-500/20 pl-3">
                                            "{item.quote}"
                                        </p>
                                    )}
                                </div>

                                <div className="pt-4 border-t border-border mt-6">
                                    <p className="font-bold text-sm flex items-center gap-2">
                                        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                                        {item.metric}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Testimonial Carousel */}
                <div className="mt-20 max-w-5xl mx-auto">
                    <TestimonialCarousel />
                </div>

            </div>
        </section>
    );
}

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Quote } from 'lucide-react';

const testimonials = [
    {
        quote: "A IA da Lagosta agilizou tudo e aumentou muito nossas reservas diariamente.",
        author: "Jefinho",
        role: "Proprietário, Coronel Picanha"
    },
    {
        quote: "A Lagosta elevou nossa marca e trouxe o público certo para o Tero. O audiovisual nos permitiu defender preço.",
        author: "Ivan",
        role: "Sócio, Tero Restaurante"
    },
    {
        quote: "A Lagosta encontrou a linguagem perfeita do nosso boteco e impulsionou vendas de feijoada e samba.",
        author: "Ivan",
        role: "Sócio, Seu Quinto"
    },
    {
        quote: "Profissionalismo raro. Estratégia, estética e resultado andando juntos. A Lagosta traduziu nossa experiência.",
        author: "Diogo",
        role: "Proprietário, Clericot Café"
    },
    {
        quote: "Crescimento real com planejamento mensal. O Quintal nunca comunicou tão bem quanto agora.",
        author: "Ivan",
        role: "Sócio, Quintal Parrilla"
    }
];

function TestimonialCarousel() {
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentIndex((prev) => (prev + 1) % testimonials.length);
        }, 6000);
        return () => clearInterval(timer);
    }, []);

    const next = () => setCurrentIndex((prev) => (prev + 1) % testimonials.length);
    const prev = () => setCurrentIndex((prev) => (prev - 1 + testimonials.length) % testimonials.length);

    return (
        <div className="relative bg-white dark:bg-zinc-900 rounded-3xl p-8 md:p-12 border border-border shadow-xl overflow-hidden">
            {/* Background decoration */}
            <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
                <Quote size={120} className="text-orange-500" />
            </div>

            <div className="relative z-10 min-h-[200px] flex flex-col justify-center items-center text-center">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={currentIndex}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.5 }}
                        className="max-w-3xl"
                    >
                        <p className="text-2xl md:text-3xl font-light italic text-foreground mb-8 leading-relaxed">
                            "{testimonials[currentIndex].quote}"
                        </p>

                        <div className="flex flex-col items-center">
                            <div className="h-14 w-14 bg-gradient-to-br from-orange-400 to-orange-600 rounded-full mb-3 flex items-center justify-center text-white font-bold text-xl shadow-lg">
                                {testimonials[currentIndex].author[0]}
                            </div>
                            <h4 className="text-lg font-bold text-foreground">{testimonials[currentIndex].author}</h4>
                            <p className="text-sm text-muted-foreground uppercase tracking-widest text-xs font-semibold">{testimonials[currentIndex].role}</p>
                        </div>
                    </motion.div>
                </AnimatePresence>
            </div>

            {/* Controls */}
            <div className="absolute inset-y-0 left-4 flex items-center">
                <button onClick={prev} className="p-2 rounded-full bg-zinc-100 dark:bg-zinc-800 hover:bg-orange-100 dark:hover:bg-zinc-700 text-zinc-600 hover:text-orange-600 transition-colors">
                    <ChevronLeft size={24} />
                </button>
            </div>
            <div className="absolute inset-y-0 right-4 flex items-center">
                <button onClick={next} className="p-2 rounded-full bg-zinc-100 dark:bg-zinc-800 hover:bg-orange-100 dark:hover:bg-zinc-700 text-zinc-600 hover:text-orange-600 transition-colors">
                    <ChevronRight size={24} />
                </button>
            </div>

            {/* Dots */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
                {testimonials.map((_, idx) => (
                    <button
                        key={idx}
                        onClick={() => setCurrentIndex(idx)}
                        className={`transition-all duration-300 rounded-full ${currentIndex === idx ? "w-8 h-2 bg-orange-500" : "w-2 h-2 bg-zinc-300 dark:bg-zinc-700 hover:bg-orange-300"}`}
                    />
                ))}
            </div>
        </div>
    );
}
