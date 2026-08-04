# Manual — Content Scheduler Skills

Sistema de 5 skills para automatizar a criação de conteúdo de redes sociais no Studio Lagosta.

---

## O que são as Skills?

São guias inteligentes que o Claude Code segue para executar tarefas de criação de conteúdo. Cada skill cobre uma etapa do processo — da seleção de imagens ao agendamento final. Podem ser usadas individualmente ou em sequência pelo orquestrador.

---

## Visão Geral

```
/content-planner (orquestra tudo)
├── /analyze-drive-images  →  Curadoria de imagens do Drive
├── /create-copy           →  Redação de textos (copies)
├── /create-template-pages →  Montagem de criativos visuais
└── /schedule-content      →  Agendamento e renderização
```

---

## Como Usar

### Fluxo Completo (recomendado)

Diga algo como:

> "Planeje o conteúdo de happy hour do By Rock pra semana que vem. 3 stories por dia."

O Claude vai guiar você pelas 4 fases, pedindo aprovação entre cada uma:

1. **Seleciona as melhores fotos** do acervo no Google Drive
2. **Escreve os textos** seguindo o tom de voz do projeto
3. **Monta os criativos** nos templates visuais e renderiza pra você ver
4. **Propõe horários** e agenda após sua aprovação

### Uso Individual

Cada skill funciona de forma independente:

| Comando | Quando usar | Exemplo |
|---------|-------------|---------|
| `/analyze-drive-images` | Buscar/analisar fotos do acervo | "Quero ver as fotos de happy hour do By Rock" |
| `/create-copy` | Escrever textos para stories | "Crie as copies de almoço pro Espeto Gaúcho" |
| `/create-template-pages` | Montar criativos visuais | "Monte os criativos com essas copies e imagens" |
| `/schedule-content` | Agendar posts | "Agenda os stories pra semana que vem" |
| `/content-planner` | Fluxo completo | "Planeje o conteúdo da semana pro By Rock" |

### Linguagem Natural

Não precisa usar os comandos exatos. O Claude reconhece pedidos como:

- "Preciso de stories de desejo pro domingo"
- "Analise as imagens do Espeto Gaúcho"
- "Escreve os textos do happy hour"
- "Agenda os criativos pra sexta"
- "Monta a grade da semana"

---

## Detalhes de Cada Skill

### 1. Análise de Imagens (`/analyze-drive-images`)

**O que faz:** Busca e recomenda as melhores fotos do acervo no Google Drive.

**Como funciona:**
- Se o projeto tem catálogo indexado, busca por tema/categoria/tags
- Se não tem, orienta a gerar o catálogo ou faz análise visual direta
- Mostra thumbnails para você escolher
- Prioriza imagens nunca usadas (garante variedade)

**Dicas:**
- Peça por tema: "fotos de happy hour", "imagens de almoço"
- Peça por mês: "fotos de março" (filtra pela data de criação)
- Peça quantidade: "quero 5 opções boas"

---

### 2. Criação de Copy (`/create-copy`)

**O que faz:** Escreve textos para os stories/posts seguindo o tom de voz do projeto.

**Como funciona:**
- Carrega o tom de voz, cardápio e campanhas do projeto
- Escreve a copy como texto livre primeiro (fluido, criativo)
- Depois distribui nos campos do template (Pre-título, Título, Subtítulo, CTA, etc.)
- Adapta a energia ao dia da semana (segunda = motivacional, sexta = celebração)
- Gera captions do Instagram com emojis e hashtags

**Exemplo de resultado:**

```
Pre-título:  AQUELA CROSTINHA
Título:      QUE ESTALA NA PRIMEIRA MORDIDA
Subtítulo:   Carne prensada na chapa, cheddar derretendo
CTA:         Pede o teu!
```

Note como Pre-título + Título + Subtítulo formam uma **leitura contínua**.

**Dicas:**
- Mencione o tema: "happy hour", "almoço", "desejo"
- Mencione as imagens escolhidas — o texto se adapta ao visual
- Peça variações: "quero algo mais provocativo"

---

### 3. Montagem de Criativos (`/create-template-pages`)

**O que faz:** Conecta textos + imagens nos templates visuais e cria os posts.

**Como funciona:**
- Seleciona layouts do template (alternando para variedade visual)
- Aplica os textos nos campos do template (slotValues)
- Vincula a imagem do Drive ao background
- Cria os posts como DRAFT
- Renderiza preview para aprovação visual

**O que você recebe:** URL de cada imagem renderizada para ver como ficou antes de agendar.

**Dicas:**
- Forneça as copies prontas (da etapa anterior)
- Forneça os IDs das imagens do Drive
- Peça pra renderizar antes de aprovar: "me mostra como ficou"

---

### 4. Agendamento (`/schedule-content`)

**O que faz:** Define horários e agenda os posts para publicação.

**Como funciona:**
- Verifica posts já agendados (evita conflitos)
- Propõe horários orgânicos (minutos variados, parece postagem humana)
- Renderiza os criativos se ainda não renderizados
- Mostra preview visual para aprovação
- Agenda (DRAFT → SCHEDULED) só após sua confirmação

**Horários por tema:**
- Almoço: 11:00-13:00
- Happy Hour: 16:00-19:00
- Abertura: 10:00-11:00
- Desejo/Noturno: 19:00-21:00

**Dicas:**
- Pode reagendar: "move os stories de quarta pra quinta"
- Pode cancelar: "volta esse post pra DRAFT"
- Peça horários específicos: "quero os 3 stories entre 17h e 19h"

---

## Projetos Disponíveis

As skills funcionam com qualquer projeto ativo no Studio Lagosta. Exemplos:

- **By Rock** — Steakhouse rock, tom irreverente, HH 16h-20h
- **Espeto Gaúcho** — Rodízio gaúcho, tom informal/regional
- **TERO** — Confeitaria, tom elegante/sofisticado

Cada projeto tem seu próprio tom de voz, cardápio e templates. As skills carregam tudo automaticamente.

---

## Fluxos Comuns

### "Preciso de stories pro happy hour da semana"

1. Diga: "Planeje o conteúdo de happy hour do By Rock pra semana que vem, 3 stories por dia"
2. Aprove as imagens selecionadas
3. Aprove os textos
4. Aprove os criativos renderizados
5. Confirme a grade de horários
6. Pronto — tudo agendado

### "Só preciso dos textos"

1. Diga: "Crie as copies de almoço pro Espeto Gaúcho, 3 stories pra quarta e quinta"
2. Revise a tabela de textos
3. Peça ajustes se necessário
4. Textos prontos para uso

### "Já tenho tudo, só agenda"

1. Diga: "Agenda os stories que estão como DRAFT pro By Rock"
2. Claude lista os DRAFTs, propõe horários
3. Confirme a grade
4. Agendado

### "Quero ver como ficou antes de postar"

1. Diga: "Renderiza o story do Smash Burger e me mostra"
2. Claude cria DRAFT, renderiza, mostra URL da imagem
3. Aprove ou peça ajustes

---

## Boas Práticas

1. **Sempre revise antes de agendar** — as skills criam como DRAFT e mostram preview por padrão
2. **Seja específico no tema** — "happy hour com foco em petiscos" funciona melhor que "faz uns stories"
3. **Mencione o período** — "pra semana que vem" ou "pra quarta e quinta"
4. **Use o fluxo completo** quando possível — o `/content-planner` garante que nenhuma etapa seja pulada
5. **Peça variações** — "quero algo mais provocativo" ou "muda o tom pra mais descontraído"

---

## Solução de Problemas

| Problema | Solução |
|----------|---------|
| "Catálogo não encontrado" | Rodar `npx tsx scripts/analyze-drive-images.ts --project-id <ID>` para gerar |
| Render com imagem faltando | Template pode não ter layer dinâmica (`isDynamic`). Usar outro template ou adicionar layer |
| Horários conflitantes | A skill verifica automaticamente, mas confira a grade antes de confirmar |
| Textos não cabem no template | Pedir para encurtar: "o título ficou longo, encurta" |
| Post agendado por engano | Dizer: "volta o post X pra DRAFT" ou "cancela o agendamento" |
