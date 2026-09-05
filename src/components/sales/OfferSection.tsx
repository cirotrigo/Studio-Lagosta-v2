"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowRight, Check, Camera, Video, Film, Share2, Users, Bot, Zap, Globe, Megaphone } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { GlowingEffect } from '@/components/ui/glowing-effect';

// Foto e vídeo são TRABALHO PONTUAL, não mensalidade — por isso a aba
// "Foto e Vídeo" nunca leva "/mês". A promoção de produção vale até 14/09/2026;
// no dia 15 entra o valor normal, e para ativar basta trocar esta constante para
// `false`: os dois cards passam a mostrar só R$ 990 e R$ 1.990, sem preço
// riscado e sem selo. A troca é manual de propósito — a Home é client component
// e uma virada por `new Date()` dependeria do relógio de quem abre a página.
const PROMOCAO_ATIVA = true;
const PROMOCAO_SELO = "Até 14/09";

export function OfferSection() {
    // As cinco frentes da solução completa. Preço só onde já existe tabela
    // (audiovisual e gestão, do site de 22/07; IA, do plano vigente) — sites e
    // tráfego não têm preço público e NÃO se inventa valor aqui: sites saem
    // sob consulta e o tráfego é incluso na Gestão Completa.
    const categories = [
        {
            id: "audiovisual",
            label: "Foto e Vídeo",
            description: "Conteúdo visual de alta qualidade para despertar desejo. Trabalho pontual: você contrata a produção quando precisar, sem mensalidade.",
            plans: [
                {
                    name: "Só Fotos",
                    price: PROMOCAO_ATIVA ? "R$ 890" : "R$ 990",
                    oldPrice: PROMOCAO_ATIVA ? "R$ 990" : "",
                    promoLabel: PROMOCAO_SELO,
                    period: "por sessão",
                    description: "Para quem precisa de constância visual de alta qualidade.",
                    features: [
                        "2 horas de produção (Sessão)",
                        "Média de 100 fotos editadas",
                        "Tratamento profissional de imagem",
                        "Entrega via link digital"
                    ],
                    icon: Camera,
                    highlight: true,
                    popularLabel: "Mais Popular",
                    cta: "Escolher Fotos"
                },
                {
                    name: "Só Vídeos",
                    price: PROMOCAO_ATIVA ? "R$ 1.490" : "R$ 1.990",
                    oldPrice: PROMOCAO_ATIVA ? "R$ 1.990" : "",
                    promoLabel: PROMOCAO_SELO,
                    period: "por sessão",
                    description: "O formato que mais converte nas redes sociais hoje.",
                    features: [
                        "3 horas de produção (Sessão)",
                        "Captação profissional",
                        "2 vídeos editados",
                        "Entrega de todos os vídeos brutos",
                        "Entrega via link digital"
                    ],
                    icon: Video,
                    highlight: false,
                    cta: "Escolher Vídeos"
                },
                {
                    name: "Edição de Vídeo",
                    price: "R$ 500",
                    period: "por 3 vídeos",
                    description: "Você já tem o material bruto. A gente edita e entrega pronto para postar.",
                    features: [
                        "3 vídeos editados — R$ 500",
                        "6 vídeos editados — R$ 890",
                        "Edição do material que você já tem",
                        "Entrega via link digital"
                    ],
                    icon: Film,
                    highlight: false,
                    cta: "Escolher Edição"
                }
            ]
        },
        {
            id: "social-media",
            label: "Gestão de Redes",
            description: "Estratégia completa para transformar seguidores em clientes.",
            plans: [
                {
                    name: "Gestão Participativa",
                    price: "R$ 1.990",
                    period: "/mês",
                    description: "Para quem faz o próprio marketing mas precisa de suporte.",
                    features: [
                        "3 posts semanais no Feed",
                        "Sessão mensal de até 2 horas",
                        "Consultoria para Stories",
                        "Planejamento semanal aprovado por você",
                        "Acesso ao banco de imagem"
                    ],
                    icon: Users,
                    highlight: false,
                    cta: "Escolher Participativa"
                },
                {
                    name: "Gestão Completa",
                    price: "R$ 3.290",
                    period: "/mês",
                    description: "A solução definitiva. Operamos seu marketing 360°.",
                    features: [
                        "Sessão de 5 horas (Foto + Vídeo)",
                        "4 posts semanais no Feed",
                        "2 posts diários nos Stories",
                        "Gestor de Tráfego Incluso",
                        "Consultoria e treinamento de equipe",
                        "Todos os vídeos brutos entregues"
                    ],
                    icon: Share2,
                    highlight: true,
                    popularLabel: "Recomendado",
                    cta: "Escolher Completa"
                }
            ]
        },
        {
            id: "ai-crm",
            label: "Atendimento com IA + CRM",
            description: "O agente responde em segundos, o CRM organiza o funil e a sua equipe assume na hora certa.",
            plans: [
                {
                    name: "AI Assistant",
                    price: "R$ 1.590",
                    period: "/mês",
                    description: "Atendimento 24/7 treinado para o seu restaurante — com CRM e funil de reservas.",
                    features: [
                        "Atendimento no WhatsApp e no Instagram, 24 horas",
                        "500 respostas por mês",
                        "CRM completo com funil de reservas — o pedido vira card sozinho",
                        "Base de conhecimento própria: cardápio, horários e campanhas",
                        "Aviso no Telegram para a equipe assumir a conversa na hora certa",
                        "Relatório diário do movimento e alerta de conversa parada"
                    ],
                    icon: Bot,
                    highlight: true,
                    popularLabel: "7 restaurantes no ar",
                    cta: "Contratar AI"
                }
            ],
            // Prova de produto: painel e conversa REAIS (agosto/2026, dados de
            // clientes finais borrados). É o que nenhum concorrente local mostra.
            proof: [
                {
                    src: "/crm/crm-painel-ilha.webp",
                    alt: "Painel de atendimento da Ilha do Caranguejo em agosto de 2026",
                    caption: "Painel real — Ilha do Caranguejo, agosto/2026: 950+ mensagens, 96,4% das conversas respondidas."
                },
                {
                    src: "/crm/crm-conversa-ilha.webp",
                    alt: "Conversa real de cliente com o agente de IA, com dados borrados",
                    caption: "Conversa real com o agente — a equipe pode assumir a qualquer momento."
                }
            ]
        },
        {
            id: "sites",
            label: "Sites e Cardápio Digital",
            description: "Seu site, seu cardápio e seu canal de pedidos — integrados ao atendimento.",
            plans: [
                {
                    name: "Site + Cardápio Digital",
                    price: "Sob consulta",
                    period: "",
                    description: "Projeto sob medida, como os que já estão no ar para Empório Fonseca, Clericot Café e Cypra Brasil.",
                    features: [
                        "Cardápio digital que você atualiza em um clique",
                        "Pedido fechado direto no WhatsApp",
                        "Reserva que cai no agente de atendimento",
                        "Design próprio da sua marca, não template pronto"
                    ],
                    icon: Globe,
                    highlight: true,
                    popularLabel: "Novidade",
                    cta: "Quero meu site"
                }
            ]
        },
        {
            id: "trafego",
            label: "Tráfego Pago",
            description: "Anúncio sem atendimento é dinheiro parado: a campanha começa treinando o agente que vai converter.",
            plans: [
                {
                    name: "Tráfego Gerenciado",
                    price: "Incluso",
                    period: "na Gestão Completa",
                    description: "Gestor de tráfego dedicado, trabalhando junto com o atendimento por IA.",
                    features: [
                        "Gestor de tráfego incluso, sem custo extra",
                        "O agente de IA é treinado antes de a campanha ir ao ar",
                        "Quem clica cai direto no atendimento, a qualquer hora",
                        "Resultado medido em conversas e reservas no CRM, não só em cliques"
                    ],
                    icon: Megaphone,
                    highlight: false,
                    cta: "Falar sobre tráfego"
                }
            ]
        }
    ];

    return (
        <section id="pricing" className="py-16 md:py-24 bg-zinc-950 text-white relative overflow-hidden">
            {/* Glow effect */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-orange-500/10 blur-[120px] rounded-full pointer-events-none" />

            <div className="container px-4 md:px-6 relative z-10 flex flex-col items-center">

                <div className="text-center mb-12 max-w-2xl">
                    <h2 className="text-3xl md:text-5xl font-bold mb-4">Escolha seu Plano Ideal</h2>
                    <p className="text-zinc-400 text-lg">
                        Soluções completas para cada estágio do seu crescimento.
                    </p>
                </div>

                <Tabs defaultValue="audiovisual" className="w-full max-w-6xl flex flex-col items-center loading-lazy">
                    <TabsList className="mb-12 bg-zinc-900 border border-zinc-800 p-1 rounded-full h-auto flex-wrap justify-center gap-2">
                        {categories.map((cat) => (
                            <TabsTrigger
                                key={cat.id}
                                value={cat.id}
                                className="rounded-full px-6 py-3 text-sm md:text-base data-[state=active]:bg-orange-600 data-[state=active]:text-white text-zinc-400 hover:text-white transition-all"
                            >
                                {cat.label}
                            </TabsTrigger>
                        ))}
                    </TabsList>

                    {categories.map((cat) => (
                        <TabsContent key={cat.id} value={cat.id} className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="text-center mb-12">
                                <p className="text-xl font-medium text-orange-500 mb-2 flex items-center justify-center gap-2">
                                    <Zap className="h-5 w-5" />
                                    {cat.label}
                                </p>
                                <p className="text-zinc-500">{cat.description}</p>
                            </div>

                            <div className={cn(
                                "grid gap-8 w-full max-w-5xl mx-auto",
                                cat.plans.length === 3 ? "grid-cols-1 md:grid-cols-3" :
                                    cat.plans.length === 2 ? "grid-cols-1 md:grid-cols-2 max-w-4xl" : "grid-cols-1 max-w-md"
                            )}>
                                {cat.plans.map((plan, idx) => (
                                    <div
                                        key={idx}
                                        className={cn(
                                            "relative flex flex-col p-8 rounded-3xl border transition-all duration-300",
                                            plan.highlight
                                                ? "bg-zinc-900/80 border-orange-500/50 shadow-2xl shadow-orange-500/10 scale-105 z-10"
                                                : "bg-zinc-900/40 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/60"
                                        )}
                                    >
                                        <GlowingEffect variant="orange" spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} />

                                        {plan.highlight && (
                                            <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-orange-600 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider shadow-lg whitespace-nowrap">
                                                {plan.popularLabel}
                                            </div>
                                        )}

                                        <div className="mb-8">
                                            <div className="flex items-center gap-3 mb-4">
                                                <div className={cn("p-2 rounded-lg", plan.highlight ? "bg-orange-500/20 text-orange-500" : "bg-zinc-800 text-zinc-400")}>
                                                    <plan.icon className="h-6 w-6" />
                                                </div>
                                                <h3 className="text-xl font-bold">{plan.name}</h3>
                                            </div>
                                            <div className="mb-2">
                                                {'oldPrice' in plan && plan.oldPrice ? (
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-base text-zinc-500 line-through">{plan.oldPrice}</span>
                                                        <span className="text-[11px] font-bold uppercase tracking-wider text-orange-500 bg-orange-500/10 border border-orange-500/30 px-2 py-0.5 rounded-full">
                                                            {'promoLabel' in plan ? plan.promoLabel : 'Promoção'}
                                                        </span>
                                                    </div>
                                                ) : null}
                                                <div className="flex items-baseline gap-1">
                                                    <span className="text-4xl font-bold">{plan.price}</span>
                                                    <span className="text-sm text-zinc-500">{plan.period}</span>
                                                </div>
                                            </div>
                                            <p className="text-sm text-zinc-400">{plan.description}</p>
                                        </div>

                                        <ul className="space-y-4 mb-8 flex-1">
                                            {plan.features.map((feature, fIdx) => (
                                                <li key={fIdx} className="flex items-start gap-3 text-sm text-zinc-300">
                                                    <Check className={cn("h-4 w-4 shrink-0 mt-0.5", plan.highlight ? "text-orange-500" : "text-zinc-600")} />
                                                    <span>{feature}</span>
                                                </li>
                                            ))}
                                        </ul>

                                        <Button
                                            size="lg"
                                            variant={plan.highlight ? "default" : "outline"}
                                            className={cn(
                                                "w-full rounded-xl font-bold text-base h-12",
                                                plan.highlight
                                                    ? "bg-orange-600 hover:bg-orange-700 text-white shadow-lg shadow-orange-500/25"
                                                    : "border-zinc-700 bg-transparent hover:bg-zinc-800 text-white"
                                            )}
                                            asChild
                                        >
                                            <Link href={`https://wa.me/5527997578627?text=Quero%20contratar%20o%20plano%20${plan.name}`} target="_blank">
                                                {plan.cta}
                                                <ArrowRight className="ml-2 h-4 w-4" />
                                            </Link >
                                        </Button >
                                    </div >
                                ))}
                            </div >

                            {'proof' in cat && Array.isArray(cat.proof) && (
                                <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-5xl mx-auto">
                                    {cat.proof.map((shot, sIdx) => (
                                        <figure key={sIdx} className="rounded-2xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
                                            <img
                                                src={shot.src}
                                                alt={shot.alt}
                                                loading="lazy"
                                                className="w-full h-auto object-cover"
                                            />
                                            <figcaption className="p-4 text-sm text-zinc-400">{shot.caption}</figcaption>
                                        </figure>
                                    ))}
                                </div>
                            )}
                        </TabsContent >
                    ))}
                </Tabs >

                <p className="mt-16 text-zinc-500 text-sm max-w-xl text-center">
                    * Foto e vídeo são trabalhos pontuais, cobrados por produção — sem mensalidade. Gestão de redes, atendimento com IA e tráfego são contratos mensais. Precisa de algo personalizado? <Link href="https://wa.me/5527997578627?text=Tenho%20duvidas%20sobre%20os%20planos" target="_blank" className="underline hover:text-orange-500">Fale com um consultor.</Link>
                </p>

            </div >
        </section >
    );
}
