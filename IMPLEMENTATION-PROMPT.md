# Prompt de Implementação

Cole este prompt em uma nova conversa do Claude Code para iniciar a implementação.

---

## Prompt

```
Implemente o plano consolidado em ~/.claude/plans/merged-template-scheduling.md

Este plano tem 12 fases. Implemente na ordem descrita na seção "Sequência de Implementação".

## Contexto importante

Este projeto é o Studio Lagosta — uma plataforma de gestão de conteúdo para restaurantes (Instagram Stories, posts, etc). O plano muda a arquitetura de agendamento de Stories: em vez de exigir imagem renderizada antes de agendar, o post referencia um template (Page) e a imagem é renderizada server-side 10 minutos antes da postagem.

## O que já existe e deve ser reutilizado

1. **scripts/generate-creatives.ts** — Pipeline completo de geração de criativos já testado e funcional. Contém toda a lógica de:
   - Download de imagens do Google Drive
   - Registro de fontes customizadas (@napi-rs/canvas)
   - Preparação de layers (swap background dinâmico, ocultar layer 1 full-size, atualizar textos)
   - Renderização 1080x1920 via canvas
   - Upload para Vercel Blob
   Extrair essa lógica para `src/lib/posts/story-renderer.ts`.

2. **scripts/analyze-drive-images.ts** — Análise de fotos via Gemini 2.0 Flash, testado com By Rock (189 fotos, 0 erros). Reutilizar para `scripts/analyze-all-projects.ts`.

3. **src/lib/render-engine.ts** — RenderEngine existente com suporte a text, image, gradient, shape, logo. Usar como base para renderização server-side.

4. **src/lib/rendering/canvas-renderer.ts** — Wrapper do @napi-rs/canvas com `renderDesignToPNG()`.

## Diferença de formato Konva vs RenderEngine

O `Page.layers` no banco usa formato Konva (do desktop app). O `RenderEngine` espera `DesignData`. ANTES de implementar o conversor (Fase 2), faça um SELECT de um Page.layers real do banco para confirmar o formato exato. Use:

```sql
SELECT layers::text FROM "Page" WHERE id = 'cmgwjaokz0005swmlw4oonoff';
```

Compare com o tipo `DesignData` em `src/types/template.ts` para mapear os campos corretamente. O script generate-creatives.ts já lida com o formato real — use como referência.

## Context7 MCP — Documentação atualizada

Use o Context7 MCP para consultar documentação atualizada das bibliotecas ao implementar. Exemplos:

- Antes de usar Prisma migrations: `use context7: Prisma migration create and apply`
- Antes de usar @napi-rs/canvas: `use context7: @napi-rs/canvas createCanvas loadImage registerFont`
- Antes de criar cron no Vercel: `use context7: Vercel cron jobs configuration vercel.json`
- Antes de usar Vercel Blob: `use context7: @vercel/blob put upload`
- Antes de usar Gemini SDK: `use context7: @google/generative-ai generateContent vision image`
- Antes de mexer no Zustand store: `use context7: zustand store create usage`
- Antes de usar React Query mutations: `use context7: @tanstack/react-query useMutation invalidateQueries`

Sempre consulte o Context7 quando for usar uma API que pode ter mudado desde o knowledge cutoff.

## Regras

- Implementar fase por fase, testando cada uma antes de avançar
- Manter compatibilidade com fluxo legado (posts com mediaUrls continuam funcionando)
- Escopo: apenas Stories. Feed, Carousel e Reels mantêm o fluxo atual
- Rodar `npm run typecheck` após cada fase para garantir que não quebrou nada
- NÃO alterar lógica de posts que já funcionam (status POSTED, verificação, etc.)
- Usar Prisma migration (não db push) para as mudanças de schema
- Usar Context7 MCP para consultar docs atualizadas antes de implementar cada fase

## Sequência

1. Schema migration (Fase 1) — enum RenderStatus + campos no SocialPost
2. Conversor Konva→DesignData (Fase 2) — mapear formatos
3. Story Renderer (Fase 3) — extrair lógica do script para lib
4. Cron render-stories (Fase 4) — renderização automática
5. Modificar executor (Fase 5) — guard de renderStatus
6. Modificar API criação (Fase 8) — aceitar pageId
7. Invalidação ao editar (Fase 6) — re-render ao salvar template
8. API scheduled posts (Fase 7) — endpoint de alertas
9. analyze-all-projects.ts (Fase 12) — catálogo multi-projeto
10. plan-week.ts (Fase 11) — planejamento semanal
11. UI Desktop (Fase 9) — QuickScheduleModal + ScheduledPostsBanner
12. UI Web (Fase 10) — adaptar para web

Comece pela Fase 1 (Schema). Após cada fase, teste e commit. No fina me apresente tudo que foi feito e como usar detalhando um fluxo completo.

