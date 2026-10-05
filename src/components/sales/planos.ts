// Planos da home — fonte única da tabela de preços (OfferSection) e dos dados
// estruturados da home (src/app/page.tsx). Módulo SEM "use client": a página
// (server component) gera o JSON-LD daqui, então preço muda num lugar só.
import { Camera, Video, Film, Share2, Users, Bot, Globe, Megaphone } from 'lucide-react';

// Foto e vídeo são TRABALHO PONTUAL, não mensalidade — por isso a aba
// "Foto e Vídeo" nunca leva "/mês". A promoção de produção (R$ 890 e R$ 1.490)
// acabou em 14/09/2026 e foi desligada em 24/09: com `false` os dois cards mostram
// só R$ 990 e R$ 1.990, sem preço riscado e sem selo. Para uma promoção nova,
// `true` + preços e selo abaixo. A troca é manual de propósito — a Home é client
// component e uma virada por `new Date()` dependeria do relógio de quem abre a página.
export const PROMOCAO_ATIVA = false;
export const PROMOCAO_SELO = "Até 14/09";

// As cinco frentes da solução completa. Preço só onde já existe tabela
// (audiovisual e gestão, do site de 22/07; IA, do plano vigente) — sites e
// tráfego não têm preço público e NÃO se inventa valor aqui: sites saem
// sob consulta e o tráfego é incluso na Gestão Completa.
export const categories = [
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
