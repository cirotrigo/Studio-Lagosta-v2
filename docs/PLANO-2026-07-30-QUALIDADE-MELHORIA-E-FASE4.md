# Plano — qualidade da melhoria com IA, linhagem e limpeza (Fase 4)

Aprovado pelo Ciro em 30/07/2026 para execução em sessão própria. Contexto
completo nos docs `SESSAO-2026-07-29-MELHORIA-IA-CRIATIVOS.md` e no CLAUDE.md
(§ "DNA da Marca" e § "Registro de mudanças recentes").

## Guardrails da sessão (ler antes de qualquer coisa)

- **O `.env` aponta para o banco de PRODUÇÃO.** Schema muda por migration
  escrita à mão (`IF NOT EXISTS`/`DO $$`) + `npx prisma migrate deploy`. NUNCA
  `migrate dev`.
- Teste E2E que crie post: usar projeto Lagosta Criativa (id 8), sempre com
  `publishType: REMINDER` (o executor ignora REMINDER em todas as filas — é o
  que impede envio real ao Zernio), data +7 dias, e APAGAR tudo no fim
  (post + logs + retries + generations + pages de teste).
- Melhoria com IA real custa 25 créditos e chama a OpenAI — 1 ou 2 execuções
  de teste são aceitáveis, não mais.
- `npm run typecheck` e lint antes de cada commit; commits por bloco; push na
  `main` dispara deploy (conferir `npx vercel ls` até Ready).

---

## Bloco A — Confiabilidade da melhoria (prioridade máxima)

### A1. Verificação de texto pós-melhoria

**Por quê:** a melhoria redesenha cada letra. Quando aplicada a um post
APROVADO (`applyToPostId`), a arte vai ao ar **sem re-revisão humana**. Erro de
grafia é o modo de falha nº 1 do gpt-image com preço/horário/nome próprio.

**O quê:**
1. Extrair os textos esperados: da `Generation` original, `fieldValues` →
   valores de texto (slotValues/campos). Quando não houver (arte de upload
   externo), **pular a verificação** — sem texto esperado não há o que comparar.
2. Injetar os textos exatos no prompt como seção `[TEXTO EXATO — VERBATIM]`
   (entre aspas, "reproduza letra por letra, nada a mais"), via
   `buildPromptSections` (nova seção com origin `system`) — a prévia da aba
   Marca acompanha sozinha.
3. Pós-geração, no background da rota improve: extrair o texto da imagem
   gerada com um modelo de visão barato (gpt-4o-mini ou gemini flash — os SDKs
   `ai`/`@ai-sdk/*` já estão no projeto, ver `generate-ai-text`). Comparar
   normalizado (uppercase, sem acento, espaços colapsados).
4. Divergiu → regenerar (até 2 tentativas no total). Persistiu → marcar a
   Generation FAILED com `fieldValues.error` claro ("texto divergente: …") e
   **não aplicar ao post** (o post fica com a arte original — nunca aplicar
   arte com texto errado).
5. Registrar em `fieldValues` o resultado da verificação (`textCheck:
   'passed' | 'skipped' | 'failed'`, tentativas, diffs) para auditoria.

**Cuidado:** o teto de duração da rota é 300s; cada tentativa do gpt-image-2
leva 30–100s. Com 2 gerações + 2 checagens de visão cabe, mas medir e logar o
tempo por fase.

### A2. Resolução nativa no gpt-image-2

**Por quê:** hoje gera em `1024x1792` e faz cover-crop para 1080x1920 — perde
borda e resolução justamente no texto pequeno.

**O quê:** em `src/lib/ai/creative-improvement-format.ts`, `OPENAI_INPUT_SIZE`:
STORY `1088x1936`, FEED_PORTRAIT `1088x1360`, SQUARE `1088x1088` (lados
múltiplos de 16; razão 9:16 quase exata → crop residual de ~1px). Conferir que
`inferFormatFromDimensions` continua classificando as saídas novas e que o
resize final para `FINAL_OUTPUT_SIZE` segue `fit: 'cover'`.

---

## Bloco B — Linhagem e comparação

### B1. `Generation.sourceGenerationId` (coluna relacional)

Migration à mão: `ADD COLUMN IF NOT EXISTS "sourceGenerationId" TEXT` + index.
Gravar na rota improve (hoje a linhagem só existe em
`fieldValues.originalGenerationId`, que não é indexável). Backfill opcional das
melhorias antigas lendo o próprio `fieldValues` (são poucas).

### B2. UI de comparação

- Badge "✨ melhorada" no card de criativo quando `sourceGenerationId` existe.
- Dialog antes/depois (lado a lado com as duas imagens; slider é bônus, não
  requisito).
- Ação "melhorar de novo": reabre o `ImproveCreativeModal` pré-preenchido com
  o `userRequest` gravado em `fieldValues`.

---

## Bloco C — Fase 4: limpeza (criteriosa, não às cegas)

### C1. Código morto do editor (risco zero)
- `src/components/templates/floating-zoom-controls.tsx` — nunca importado.
- `_containerRef` em `konva-editor-stage.tsx`.
- `BrandIdentity` órfã em `improvement-assets-loader.ts`, se tiver sobrado
  após a troca por `BrandContext` (grep antes).
- **Manter** o `handleWheel` no-op: documenta a decisão de não dar zoom por
  scroll.

### C2. Rotas legado sem UI (`brand-style`, `design-system`, `art-templates`)
**Não apagar direto.** O `generate-art` lê dados que elas escrevem e há
referências em docs de deploy. Fazer em dois tempos:
1. Nesta sessão: adicionar `console.warn('[deprecated] …')` + comentário
   `@deprecated` apontando para o DNA/aba Marca.
2. Remoção real só depois de 2+ semanas sem warn nos logs de produção
   (decisão futura do Ciro, não desta sessão).

### C3. `KnowledgeCategory.TOM_DE_VOZ` como legado
Não remover do enum (entradas existem). Apenas: na página `/knowledge`, marcar
a categoria com aviso "identidade agora vive no DNA da marca (aba Marca)" —
espelhando o que a tool `criar-entrada-base` já avisa.

---

## Bloco D — Infra (propor, não executar sem OK explícito do Ciro)

### D1. CI mínimo (pode executar)
`.github/workflows/ci.yml`: `npm ci` + `prisma generate` + `typecheck` + `lint`
em push/PR. Sem testes (não existem), sem deploy (Vercel já cuida).

### D2. Banco de desenvolvimento (SÓ PROPOR — decisão do Ciro)
Apresentar o desenho: branch do Neon para dev, `.env.development.local`,
`dotenv -e` nos scripts. NÃO alterar o `.env` atual nem o fluxo de produção
sem aprovação em chat.

---

## Operacional (Ciro, sem código — lembrar no resumo final)

- [ ] Tokens do Instagram: realgelateria, bacanabar, by.rock, cirotrigo, winevix
- [ ] Refresh token do Google Drive (backup de criativos falha com invalid_grant)
- [ ] **Espeto Gaúcho: limpar o prompt próprio** (aba Marca → Direção de arte →
      "Voltar ao padrão" + Salvar). O DNA dele já está completo (5 seções);
      o prompt de 5.113 chars agora só sombreia o padrão e vai divergir.
- [ ] Preencher o DNA dos outros 10 clientes via chat (consultar-dna/atualizar-dna)

## Ordem de execução e commits

1. A2 (pequeno, destrava qualidade) → commit
2. A1 (o grosso da sessão) → commit + teste E2E com REMINDER + cleanup
3. B1+B2 → commit (migration primeiro, `migrate deploy` antes do push)
4. C1+C2+C3 → commit
5. D1 → commit; D2 → só texto no resumo
6. Atualizar CLAUDE.md (regras novas: TEXTO EXATO/verificação; resolução
   nativa) e criar doc de sessão no padrão dos anteriores.
