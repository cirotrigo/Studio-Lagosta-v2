"use client";

import React from 'react';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion"

const objections = [
    {
        question: "Já tenho alguém que posta para mim.",
        answer: "Ótimo, mas sua casa continua vazia nos dias fracos? Posts bonitos não pagam contas. Nós focamos em estratégia de vendas e tráfego, não apenas em artes estáticas no feed."
    },
    {
        question: "Meu cardápio vende bem.",
        answer: "Mas você vende tudo o que poderia? Seu ticket médio está no teto? Muitas vezes, pequenos ajustes de engenharia de cardápio podem aumentar o lucro em 20-30% sem trazer nenhum cliente novo."
    },
    {
        question: "Eu mesmo faço minhas fotos.",
        answer: "E isso está refletido na sua receita? Fotos amadoras passam a impressão de 'comida caseira simples', não de uma experiência gastronômica que justifica um preço maior. A imagem vende o sabor antes da primeira garfada."
    },
    {
        question: "Tenho medo de IA.",
        answer: "A IA não cria comida. Ela automatiza o processo chato (reservas, respostas, agendamentos) para que você e sua equipe foquem em atender bem o cliente no salão. É tecnologia a serviço da hospitalidade."
    }
];

export function ObjectionsSection() {
    return (
        <section className="py-24 bg-muted/30">
            <div className="container px-4 md:px-6 max-w-3xl">
                <h2 className="text-3xl font-bold text-center mb-12">Perguntas Frequentes (e duras)</h2>
                <Accordion type="single" collapsible className="w-full">
                    {objections.map((item, idx) => (
                        <AccordionItem key={idx} value={`item-${idx}`}>
                            <AccordionTrigger className="text-left text-lg font-medium">
                                {item.question}
                            </AccordionTrigger>
                            <AccordionContent className="text-muted-foreground text-base leading-relaxed">
                                {item.answer}
                            </AccordionContent>
                        </AccordionItem>
                    ))}
                </Accordion>
            </div>
        </section>
    );
}
