---
trigger: always_on
---
# Regras do Projeto Studio Lagosta v2 — Hub de Ferramentas

## Stack
- Next.js 14+ com App Router
- TypeScript strict
- Prisma ORM com PostgreSQL (banco remoto — NUNCA rodar migrations)
- Tailwind CSS + Radix UI
- Clerk para autenticação
- Vercel AI SDK para integrações de IA
- Sharp para processamento local de imagens

## Arquitetura Modular
- Novos módulos ficam em /src/app/(protected)/tools/
- Componentes de ferramentas em /src/components/tools/
- APIs de ferramentas em /src/app/api/tools/
- NUNCA alterar código existente fora de /tools/
- NUNCA alterar schemas Prisma ou rodar migrations

## Design System — Tema Escuro
- Background: #0a0a0a
- Sidebar: #111111
- Cards: #161616
- Inputs: #1a1a1a
- Destaque primário: #F59E0B (amber)
- Texto principal: #FAFAFA
- Texto secundário: #A1A1AA
- Bordas: #27272A
- Font: Inter, 14px base
- Transições: duration-200 ease-in-out
- Ícones: Lucide React

## Convenções de Código
- API routes em /src/app/api/tools/
- Componentes reutilizáveis em /src/components/tools/shared/
- Hooks em /src/hooks/tools/
- Context providers em /src/contexts/
- Inglês para variáveis/funções, português para textos de UI
- React Query para data fetching
- Zustand ou Context para estado global

## Segurança de Projeto
- Sempre identificar visualmente o projeto/cliente ativo
- Confirmar projeto antes de agendar qualquer post
- Bloquear ações se nenhum projeto selecionado

## Processamento de Imagens
- Sharp para redimensionamento local
- Feed Retrato: 1080x1350
- Story/Reels: 1080x1920
- Carrossel: cada imagem 1080x1350
- Crop strategy: "attention" (smart crop)
- JPEG quality: 90