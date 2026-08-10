# Desligamento do Claudinho (`insta-automatico`) — passo a passo

> Escrito em 10/08/2026 como **documento**, não como execução. Nada aqui foi
> rodado. O Claudinho está em PRODUÇÃO; a decisão de desligar é do Ciro, e a
> Fase 6 do [plano](PLANO-2026-08-09-GERACAO-IA-E-BANCADA.md) é preparação.
>
> Leia junto: [SESSAO-2026-08-09-GERACAO-IA-BANCADA-CARROSSEL.md](SESSAO-2026-08-09-GERACAO-IA-BANCADA-CARROSSEL.md)
> (o que o Studio passou a fazer) e [SESSAO-2026-08-10-FASES-4-A-6.md](SESSAO-2026-08-10-FASES-4-A-6.md)
> (o inventário do que só existia lá).

O desligamento é seguro quando **três coisas** forem verdade ao mesmo tempo:
nada mais entra, nada está pendente, e nada que só existe lá se perde. As
seções abaixo são nessa ordem.

---

## 0. Antes de tudo: o que o Claudinho ainda é dono

| Coisa | Onde vive | Já está no Studio? |
|---|---|---|
| Bancada `/stories` e `/carrosseis` | app Node em Docker (`Dockerfile`, porta 3001) | ✅ substituída pela `/projects/[id]/bancada` |
| Fila de geração (BullMQ) | Redis (`REDIS_URL`) | ✅ substituída por `after()` + polling |
| Agendamentos | Supabase (`agendamentos`, `agendamentos_tentativas`) | ✅ `SocialPost` |
| Artes geradas | Supabase Storage (`SUPABASE_BUCKET`) | ✅ Blob + `Generation` |
| `brand-manual.png` por cliente | `templates/<slug>/assets/` | ⚠️ **só depois de rodar o importador** (§2) |
| Logo preferida por slug (`LOGO_MAP`) | `src/gpt-image.js:545` | ⚠️ **6 dos 10 divergem** (§2) |
| Referência de escala tipográfica | `clientes/tero/referencias/` | ⚠️ só o TERO tem; sem equivalente |
| Fontes dos clientes (`.ttf`) | `templates/<slug>/assets/fonts/` | ✅ `CustomFont` (conferir por cliente) |
| Cardápio web (`CARDAPIO_*`) | mesmo app | ❌ **fora do escopo do Studio** — decidir à parte |

> ⚠️ A última linha é a armadilha do desligamento: o `insta-automatico` **não é
> só** a bancada. Ele serve o cardápio (`CARDAPIO_USERS`, `CARDAPIO_SECRET`) e
> tem o agente de WhatsApp (`AGENTE_*`). Desligar o container derruba os três.
> Decida o destino de cada um antes de parar o processo.

---

## 1. Nada mais entra

1. **Parar de agendar por lá.** O caminho `provider: studio` já manda tudo para
   `/api/external/posts` do Studio, então quem agenda pelo Claudinho hoje já
   grava no Studio — o que se ganha aqui é fechar a porta, não migrar dado.
   - Desligar `AGENTE_ENABLED` (o agente de WhatsApp é quem mais cria arte).
   - Desligar `CRON_AGENDA_ENABLED=false` **só no passo 3**, não agora: ele é
     quem recupera agendamento travado, e você ainda vai precisar dele.
2. **Avisar quem usa.** O agente responde no WhatsApp; gente acostumada a pedir
   arte por lá vai continuar pedindo. Combine a data e aponte para o chat do
   Studio (conector MCP) e para a bancada.
3. **Congelar o `FOTOS_INGEST_CRON`**: ele sincroniza fotos do Drive para o
   cache local. Parado, nada quebra — o Studio lê o Drive por conta própria.

## 2. Nada que só existe lá se perde

Rode **antes** de desligar, com o repositório ainda no disco:

```bash
npx tsx scripts/importar-brand-manuais.ts --aplicar
```

Sobe os 10 `brand-manual.png` para o Blob e aponta `Project.brandManualUrl`.
A partir daí o gerador do Studio serve o manual do designer no lugar do card
auto-gerado — que é a diferença de qualidade que o insta-automatico tinha.

```bash
npx tsx scripts/importar-crivo-clientes.ts          # confira
npx tsx scripts/importar-crivo-clientes.ts --aplicar
```

Traz o crivo de aprovação dos `DNA.md` de `~/Documents/Clientes` para o
checklist que a bancada mostra antes de agendar. (Este lê a pasta `Clientes`,
não o `insta-automatico` — não depende do desligamento, mas faz parte da
paridade.)

**Ainda a resolver à mão** (nenhum script cobre):

- ~~**Logo preferida**~~ — **RESOLVIDO em 10/08/2026**: os 6 projetos que
  divergiam foram alinhados com o `LOGO_MAP` (`scripts/definir-logo-do-projeto.ts`).
  Os 10 apontam para a assinatura da marca, não para um ícone.
- **Referência de escala tipográfica do TERO**
  (`clientes/tero/referencias/escala-01-terca-feira.jpg`): pode virar âncora de
  papel `style` do projeto 3 (`definir-ancora`), ou ser descartada. Sem
  decisão, some.
- **Fontes**: conferir se toda `templates/<slug>/assets/fonts/*.ttf` tem
  `CustomFont` equivalente no Studio. Fonte faltando não dá erro — o render cai
  em fallback e a arte sai com a tipografia errada.

## 3. Nada está pendente

Esta é a parte que exige olhar, não comando.

1. **Esvaziar a fila do Redis.** Com o app no ar e nada novo entrando, as filas
   (`queue.js`, `queue-agenda.js`, `queue-enrich.js`) drenam sozinhas. Confira
   que zeraram antes de parar o worker — job em Redis não sobrevive ao
   desligamento e some sem aviso.
2. **Agendamentos pendentes no Supabase.** Liste `agendamentos` com status
   `pending` ou `publishing`. Para cada um, decida:
   - já existe `SocialPost` correspondente no Studio → cancele lá;
   - não existe → recrie no Studio (bancada ou `colocar-na-agenda`) **antes**
     de desligar.
   `verificarVencidos()` roda de hora em hora e re-enfileira o que travou —
   deixe o cron vivo até a lista zerar, e só então `CRON_AGENDA_ENABLED=false`.
3. **Deixe o app no ar por uma semana depois do último agendamento**, com o
   agente desligado. É a rede de segurança: se algo só aparece na hora de
   publicar, você ainda tem o sistema para olhar.

### O que acontece com o que já está congelado no Zernio

**Nada.** E é justamente por isso que essa parte é tranquila:

- Post entregue ao Zernio já saiu do alcance dos dois sistemas. O Studio
  entrega 5 minutos antes do horário (`FREEZE_WINDOW_MS`) e, a partir daí, o
  que vai ao ar é a cópia que está lá — desligar o Claudinho não muda isso.
- O agendamento do Claudinho **já desagua no Studio** (`provider: studio` →
  `/api/external/posts`), então esses posts vivem como `SocialPost` e seguem
  sendo publicados pelo cron do Studio, com ou sem o Claudinho no ar.
- O que morre com o Claudinho é a **cópia da arte no Supabase Storage**. Se
  algum `SocialPost` ainda apontar `mediaUrls` para um domínio do Supabase, a
  publicação quebra. **Confira antes de derrubar o bucket** (§4) — este é o
  único ponto onde o desligamento pode causar falha de publicação.

> Também existe o caminho **Postiz** (`POSTIZ_*`), que está em phase-out.
> Confirme que a fila dele está vazia; ele publica por fora do Studio e não
> aparece na agenda de lá.

## 4. Desligar

Nesta ordem, com intervalo entre os passos:

1. **Parar o container.** O app é stateless — Redis e Supabase são externos.
2. **Redis**: pode ser derrubado assim que a fila zerar (§3.1). Não guarda nada
   que interesse depois; é fila, não banco.
3. **Supabase — NÃO derrube junto.** Antes:
   - exporte `agendamentos`, `agendamentos_tentativas`, `planos_semana`,
     `arte_agendamento_log` e `bancada_meta` (são 5 migrations, todas pequenas);
   - **varra `SocialPost.mediaUrls` procurando o host do Supabase Storage.**
     Enquanto houver um, o bucket é dependência de publicação, não arquivo
     morto;
   - guarde o bucket por pelo menos 90 dias depois disso. É o histórico visual
     de meses de produção e não existe cópia em outro lugar.
4. **Chaves de API**: `OPENAI_API_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`,
   `EVOLUTION_*`, `GOOGLE_DRIVE_*`, `ZERNIO_API_KEY` são compartilhadas com o
   Studio. **Não revogue** — revogue só as exclusivas (`API_KEY` do próprio
   app, `POSTIZ_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CARDAPIO_SECRET`).
5. **Repositório**: arquive, não apague. `src/gpt-image.js` é a memória escrita
   de dezenas de micro-regras aprendidas em produção — a parte que já foi
   portada está registrada no inventário da sessão de 10/08, e a que não foi
   só existe ali.

## 5. Critério de pronto

Só considere desligado quando **todas** forem verdade:

- [ ] Duas semanas de produção feita só na bancada do Studio, sem recorrer ao Claudinho
- [ ] `brandManualUrl` preenchido nos 10 projetos
- [x] ~~Divergência de logo resolvida projeto a projeto~~ — feito em 10/08
- [ ] Crivo importado e aparecendo na bancada
- [ ] Fila do Redis vazia por 24h
- [ ] Zero `agendamentos` em `pending`/`publishing` no Supabase
- [ ] Zero `SocialPost.mediaUrls` apontando para o Supabase Storage
- [ ] Destino decidido para o cardápio web e para o agente de WhatsApp
- [ ] Backup do Supabase e do bucket guardado fora do projeto
