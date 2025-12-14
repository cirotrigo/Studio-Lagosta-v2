"use client"

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Sparkles, Image as ImageIcon, Code, FileText, Zap } from 'lucide-react'
import { motion } from 'framer-motion'
import { Card } from '@/components/ui/card'

interface ChatEmptyStateProps {
    onSelectPrompt: (prompt: string) => void
    onSelectMode: (mode: 'text' | 'image') => void
}

const STARTER_PROMPTS = [
    {
        icon: <Sparkles className="h-5 w-5 text-amber-500" />,
        title: 'Brainstorm Criativo',
        description: 'Gerar ideias para campanhas ou posts.',
        prompt: 'Atue como um especialista em marketing e me dê 5 ideias criativas para uma campanha de...',
        mode: 'text' as const
    },
    {
        icon: <ImageIcon className="h-5 w-5 text-blue-500" />,
        title: 'Gerar Imagens',
        description: 'Crie visuais para seus projetos.',
        prompt: 'Uma fotografia cinematográfica de...',
        mode: 'image' as const
    },
    {
        icon: <Code className="h-5 w-5 text-green-500" />,
        title: 'Assistente de Código',
        description: 'Ajuda com snippets e refatoração.',
        prompt: 'Analise o seguinte código e sugira melhorias de performance:',
        mode: 'text' as const
    },
    {
        icon: <FileText className="h-5 w-5 text-purple-500" />,
        title: 'Resumir Conteúdo',
        description: 'Sintetize textos longos ou documentos.',
        prompt: 'Faça um resumo executivo do seguinte texto, destacando os pontos principais:',
        mode: 'text' as const
    },
]

export function ChatEmptyState({ onSelectPrompt, onSelectMode }: ChatEmptyStateProps) {
    return (
        <div className="flex flex-col items-center justify-center p-4 md:p-8 space-y-8 h-full min-h-[400px]">
            <div className="text-center space-y-2 max-w-lg">
                <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-primary/10 mb-4">
                    <Zap className="h-8 w-8 text-primary" />
                </div>
                <h2 className="text-2xl font-bold tracking-tight">Como posso ajudar hoje?</h2>
                <p className="text-muted-foreground">
                    Utilize o poder da IA para acelerar seu fluxo de trabalho. Escolha um modelo e comece a criar.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-3xl">
                {STARTER_PROMPTS.map((starter, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                    >
                        <Card
                            className="p-4 cursor-pointer hover:bg-accent/50 transition-colors border-muted/60 hover:border-primary/20 group h-full"
                            onClick={() => {
                                onSelectMode(starter.mode)
                                onSelectPrompt(starter.prompt)
                            }}
                        >
                            <div className="flex items-start gap-4">
                                <div className="p-2 rounded-lg bg-background border shadow-sm group-hover:scale-110 transition-transform duration-200">
                                    {starter.icon}
                                </div>
                                <div className="space-y-1">
                                    <h3 className="font-semibold text-sm group-hover:text-primary transition-colors">
                                        {starter.title}
                                    </h3>
                                    <p className="text-xs text-muted-foreground line-clamp-2">
                                        {starter.description}
                                    </p>
                                </div>
                            </div>
                        </Card>
                    </motion.div>
                ))}
            </div>
        </div>
    )
}
