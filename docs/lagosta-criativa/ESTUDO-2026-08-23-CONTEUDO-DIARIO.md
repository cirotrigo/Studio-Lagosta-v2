# Lagosta Criativa — estudo para gerar conteúdo que vende todos os dias (23/08/2026)

> Objetivo: preparar o projeto **Lagosta Criativa** (id 8) no Studio para produzir
> stories e posts de feed diariamente, mostrando ao dono de restaurante a solução
> completa — foto e vídeo, gestão de redes, atendimento com IA + CRM, sites e
> tráfego — usando o trabalho real feito para os clientes.
>
> Tudo que está marcado **[FEITO]** já foi executado hoje contra a produção; o que
> está marcado **[CIRO]** depende de decisão ou ação sua. O que mudou no código
> foi commitado e enviado à `main` em 23/08 (`a7ca194d`).

---

## 1. Resumo executivo

O projeto existia no Studio com um DNA bom (11/08) e uma única entrada de base
(os pacotes), mas **sem pilares, sem crivo, sem modelos, sem acervo útil e sem
cadência** — era impossível propor uma semana. O site vendia três frentes; a
agência hoje entrega cinco (o atendimento com IA virou um CRM completo e nasceram
os sites), e a Home ainda carregava sobras do template SaaS na metadata.

Hoje:

| Frente | Antes | Depois |
|---|---|---|
| DNA (aba Marca) | portfólio em 3 categorias; crivo VAZIO; sem regra para print/cliente/número | portfólio nas 5 frentes; 3 regras novas (cliente real × dado de cliente final; print é documento; a entrega tem dono); crivo de 14 perguntas **[FEITO]** |
| Pilares | 0 | 6 aprovados (origem humano) — o 7º, "Studio Lagosta", saiu à tarde: ferramenta interna não é produto **[FEITO]** |
| Base de conhecimento | 1 entrada (pacotes) | +7 entradas: ficha, solução completa, agente + CRM, provas e números, sites, tráfego pago + IA, FAQ (a do Studio foi arquivada à tarde) **[FEITO]** |
| Acervo (Drive "Fotos Lagosta") | 44 fotos de making-of de out/2025 | 116 catalogadas: +61 fotos recentes dos clientes (curadoria manual, sem rosto de cliente final) em `Portfólio dos clientes/<Cliente>` + 11 prints de sites; tudo etiquetado com o nome do pilar **[FEITO]** |
| Programação | nenhuma | plano "Semana 1 — 24 a 30/08" com 14 stories + 4 posts de feed, cada item com direção, foto e cliente citado; 2 artes de teste geradas à tarde (co-branding + print) **[FEITO]** |
| Home do site | twitter:description = "Template Next.js… AI Coders Academy"; og-image = SVG do template; typo "entreues" | metadata da Home reescrita (OG/Twitter completos, nova `og-lagosta.png`), SiteSettings do admin corrigido em produção, typo e alts corrigidos — **commitado e enviado (`a7ca194d`)**; avaliação e plano de reestruturação na § 10 **[FEITO / CIRO decide a reestruturação]** |
| Prints do CRM e conversas | — | 7 prints capturados pelo seu Chrome logado (painéis Ilha e Empório, conversa com o agente, funil, base de conhecimento, lista de conversas), **nomes e telefones borrados**, em `Fotos Lagosta/Prints de sites e CRM/CRM e atendimento`, catalogados e etiquetados com o pilar **[FEITO]** |

O que falta para a máquina rodar sozinha: (1) você confirmar/ajustar o plano da
semana na bancada e disparar `executar-plano`; (2) adotar a rotina de
fotografar bastidores pelo celular (a pasta "Fotos do Celular" já cai no
acervo); (3) decidir sobre a reestruturação da Home (§ 10) — as correções já
estão no ar via `main`.

---

## 2. Diagnóstico do projeto 8 (leitura de 23/08, somente leitura)

- **Projeto**: id 8, @lagostacriativa, dono `User cmgh24zg30003swtn395ct5k6`
  (cirotrigo@gmail.com), org "Lagosta Criativa". Token do Instagram ativo
  (expira 25/09/2026, renovação automática). Publicação via Zernio.
- **DNA**: preenchido e específico (toneOfVoice 3.618, contentRules 1.948,
  composition 4.691, visualStyle 1.671, photoDirection 1.084 chars) — mas
  `approvalChecklist` vazio e portfólio desatualizado. Backup do texto anterior
  em `DNA-ANTERIOR-2026-08-23.md` (mesma pasta).
- **Marca**: logo oficial "logo-lagosta-criativa-preto.png" (id 30) na tabela
  Logo; manual da marca enviado (`brand-manual/8-lagosta-criativa.png`);
  fontes Coolvetica (título) e Yanone Kaffeesatz (apoio), 9 arquivos.
  ⚠️ `BrandColor` cadastrado = Vermelho #860125, Laranja #FA5701, Amarelo
  #FFB154 — **diverge da paleta estrita do DNA** (preto + #FF6B00/#FF7A1A).
  Não mexi: é a paleta do seletor de cor do editor; decida se atualiza **[CIRO]**.
- **Base**: 1 entrada "Pacotes Lagosta Criativa" (06/04/2026, 10.462 chars,
  preços do site). Sem horários, contato, diferenciais, FAQ, campanhas.
- **Pilares**: zero (todos os 9 restaurantes têm 5–7 aprovados).
- **Modelos**: zero páginas `isTemplate=true`; 9 templates (Story - Padrão com 8
  páginas e 58 gerações; Story - making-of com 13; Feed - Prompt 1080x1350
  com 7) — nenhuma página promovida a modelo, nenhuma com tag de tema. Toda
  arte vai cair na via de IA até alguém promover modelos **[CIRO]**.
- **Posts**: 105 (99 publicados, 5 falhos, 1 teste antigo agendado). Cadência
  inexistente: nov/2025 = 50 stories (pico), depois 6, 7, 3, 1, 0, 12, 0, 5, 2
  por mês; últimos 180 dias = 20 stories em 7 semanas distintas. Zero posts
  futuros. É cold start: a primeira leva nasce da grade-semente.
- **Gerações**: 64 COMPLETED, 57 de `recovery_script` (mar/2026), 0 da bancada,
  0 feedback, 0 referência de estilo. 0 LearningSignal, 0 planos.
- **Acervo**: `_image-catalog.json` com 44 entradas (Farofa 21, Coronel Picanha
  11, Raiz Brasil 7, Ilha do Caranguejo 5) — bastidores de sessões de
  out/2025. Nada dos últimos 90 dias.
- **Upstash Redis (cache da base) continua morto**: toda escrita de entrada
  hoje logou `[cache] Error invalidating project cache: TypeError: res.map is
  not a function` — o disjuntor de 11/08 protege o caminho quente, mas a causa
  (conta rate-limited/suspensa) não foi resolvida **[CIRO — ops]**.

---

## 3. O que a Lagosta vende hoje (inventário, com evidência)

### 3.1 Produção de foto e vídeo
9 restaurantes com acervo vivo no Studio. Nos últimos 30 dias entraram ~1.000
fotos novas nos catálogos (Real Gelateria 105, O Quintal 66, TERO 157, Seu
Quinto 149, Bacana 28, Espeto Gaúcho 46, By Rock 102, Wine Vix 166, Empório
Fonseca 190). Parte é upload do cliente/IA — por isso a base registra como
ordem de grandeza, não manchete.

### 3.2 Gestão de redes (Studio Lagosta)
Bancada, agenda, IA de arte com DNA, aprovação pelo celular, verificação de
publicação. 9 clientes com agenda.

### 3.3 Atendimento com IA + CRM (`agentes-atendimento`, fork do NossoCRM)
7 instalações (Empório Fonseca/Sofia, Ilha do Caranguejo/Papitito, Coronel
Picanha, Wine Vix, Bacana, Clericot Café, Cypra Brasil), cada uma com deploy e
banco próprios. Fluxo: DM no Instagram (Chatwoot) ou WhatsApp (Evolution/Meta)
→ contato, conversa e card no funil criados sozinhos → agente espera a rajada
terminar → responde em bolhas curtas com a persona → move o card → handoff por
palavra-chave/reclamação/fechamento → **aviso no Telegram com botões** (✅
Confirmar reserva · 🙋 Assumir · 🔗 Abrir no CRM) → equipe assume e a IA pausa.
Base de conhecimento por funil (PDF/URL/texto; 📌 fixada × 🔍 consulta),
memória do atendimento, cliente recorrente, BANT, HITL, áudio e imagem, envio
de foto do prato, múltiplas unidades, horário, briefing diário, relatório à
meia-noite, alerta de parado, anti-injeção, circuit breaker.

**Números lidos nos painéis em 23/08 (mês de agosto):**

| Cliente | Mensagens | IA / humanos | Novos contatos | 1ª resposta | Taxa de resposta |
|---|---:|---:|---:|---|---:|
| Ilha do Caranguejo (desde 10/08) | 950 | 829 / 121 | 308 | — | 96,4% (297/308) · 599 conversas na semana · 8 reservas solicitadas no funil |
| Empório Fonseca | 558 | 532 / 26 | 66 | < 1 min | 95,5% (64/67) |

Qualidade medida: 4,7 → 2,1 → 1,55 bolhas por turno (15 conversas reais,
21/08). Outbox do Telegram 100% `sent`.

### 3.4 Sites e cardápio digital
- **Empório Fonseca** — `emporiofonseca.vercel.app`: site + cardápio digital lido
  do próprio CRM (`products`, ISR 5 min) + carrinho que envia o pedido pelo
  WhatsApp + "Reservar via WhatsApp" → agente + campanhas da semana.
- **Clericot Café** — `clericot.vercel.app` (o domínio `clericot.cafe` ainda aponta
  para o WordPress antigo, uma página de botões): site editorial de 7 páginas
  (home com assinatura animada, Menu Cafeteria/Praia/Bebidas com 50+ itens,
  Experiências, Petit Comité), gerado por `site/build.py` dentro do repo do CRM.
- **Cypra Brasil** — `cyprabrasil.com.br`: institucional (Flammes, Cháxado, café,
  vinhos) e pedido.

### 3.5 Tráfego pago
Incluso na Gestão Completa (gestor de tráfego). Sem material de prova coletado
hoje — é a frente com menos evidência na base **[CIRO: números/prints de campanhas]**.

---

## 4. Posicionamento e história para o Instagram

- **Tese**: "Não vendemos posts. Vendemos mesas ocupadas." A cadeia que a copy
  repete: *a foto gera desejo → a rede gera constância → o atendimento converte
  a mensagem em reserva → o site fecha o pedido → o tráfego amplia tudo*. O
  Studio e o CRM são a tecnologia própria que sustenta a cadeia.
- **Para quem**: dono/gestor de restaurante do ES (e região) que já tem
  movimento e quer previsibilidade — não o que precisa aprender a fazer post.
- **Tom** (DNA): autoridade sem promessa, premium, curto, sem gíria, sem
  travessão; headline de 4–8 palavras em Title Case no brush laranja do logo.
- **Prova antes de promessa**: só números da entrada "Provas e números reais"
  (cliente + período). Os do site (+40%, +2,5k, +15) ficaram **fora** até você
  confirmar por escrito.
- **A Lagosta não é restaurante**: toda peça de vitrine diz de quem é a comida
  e o que a Lagosta fez ali (regra 12 do DNA) — senão vira conteúdo do cliente.
- **Três correções do Ciro (23/08, tarde)**, já no DNA, nos pilares e na base:
  (1) o **Studio Lagosta é ferramenta interna** — não se vende acesso, não se
  mostra tela, não é argumento; o que se vende é constância, identidade e
  resultado; (2) **tráfego pago anda sempre com o atendimento por IA** — a
  campanha começa treinando o agente para responder e converter os leads; (3)
  **quando a peça fala de um cliente, a logomarca dele entra na arte**
  (co-branding, composta pelo sistema no canto oposto ao da Lagosta).

---

## 5. Pilares aprovados (taxonomia fechada, 6) **[FEITO]**

| slug | Pilar | O que entra |
|---|---|---|
| `bastidores-da-producao` | Bastidores da Produção | making-of das sessões, luz, câmera, set, equipe em ação |
| `vitrine-dos-clientes` | Vitrine dos Clientes | a entrega real (foto/vídeo/arte/feed) dizendo o que a Lagosta fez |
| `atendimento-ia-e-crm` | Atendimento com IA e CRM | prints de conversa, painel, reserva no Telegram, números |
| `sites-e-cardapio-digital` | Sites e Cardápio Digital | Clericot, Empório, Cypra; cardápio em um clique; pedido no WhatsApp |
| `trafego-e-resultados` | Tráfego Pago e Resultados | campanha SEMPRE com o agente treinado para converter; números com fonte |
| `metodo-e-autoridade` | Método e Autoridade | educativo/opinião: por que falha, constância, IA sem medo, Sistema Lagosta — sem expor ferramenta interna |

Os slugs também foram semeados em `ProjectTag` (autocomplete das tags de
modelo), e o catálogo do acervo recebeu o **nome do pilar como tag** em cada
foto (Portfólio → "vitrine dos clientes"; Prints/Sites → "sites e cardápio
digital"; Farofa/Coronel/Raiz/Ilha → "bastidores da produção"). É isso que faz
`propor-semana` achar foto por assunto.

---

## 6. Programação semanal

### 6.1 Grade-alvo (a cadência que a própria Gestão Completa promete: 2 stories/dia + 4 feed/semana)

Público B2B: o dono olha o Instagram de manhã antes do serviço, entre turnos e
depois do fechamento. Horários em BRT.

| Dia | Story 1 | Story 2 | Feed |
|---|---|---|---|
| Seg | 09:00 Método (frase/insight da semana) | 14:30 Bastidores ou Vitrine | **19:30 Método** (carrossel educativo) |
| Ter | 09:00 Atendimento IA (print/número) | 15:00 Vitrine | — |
| Qua | 09:00 Studio/bastidores | 21:00 CTA "Quero escalar" | **19:00 Vitrine** (reel/foto de cliente) |
| Qui | 09:00 Sites/cardápio digital | 15:00 Tráfego/resultado | — |
| Sex | 09:00 Bastidores | 18:00 Vitrine (fim de semana do cliente) | **12:00 Atendimento IA/CRM** (prova) |
| Sáb | 11:00 Vitrine (movimento) | 19:00 Método curto | — |
| Dom | 18:00 Agenda/bastidores da semana | — | **11:00 Bastidores** (reel ou "a semana em 30s") |

Regra de mistura: nunca dois dias seguidos do mesmo pilar no feed; cada semana
toca os 6 pilares pelo menos uma vez; a cada 2 semanas um carrossel de pacotes
(o único lugar com preço/badge).

### 6.2 O plano criado hoje **[FEITO]** — `Semana 1 — Lagosta Criativa (24 a 30/08)` (planoId `cmt5znoxq0006sw7h624vuk2j`)

- 14 stories (grade-semente do cold start: 11:30 / 15:00 / 18:30, 24 a 29/08)
  + 4 posts de feed anexados à mão (seg 24 19:30 Método · qua 26 19:00 Vitrine
  TERO · sex 28 12:00 Atendimento IA · dom 30 11:00 Bastidores), com copy,
  legenda e foto do acervo.
- Dois itens de atendimento IA tiveram a copy corrigida (o modelo atribuiu o
  96,4% da Ilha ao Empório — o guard de dados só confere se o número existe na
  base, não a quem pertence). **Releia toda copy com esse olho**.
- 8 stories ficaram com foto "do acervo geral" porque o assunto não tem foto
  (IA/CRM, tráfego, método, Studio): esses são os casos de **arte tipográfica
  sobre preto** ou de **print** — troque no card.
- Nada foi gerado nem cobrado. Para produzir: bancada → revisar → `executar-plano`
  (1ª chamada mostra a conta; 2ª com `confirmar: true` produz). Depois,
  `colocar-na-agenda`/aprovar.
- Nas próximas semanas: `propor-semana` (chat) ou "Propor semana" na bancada.
  Enquanto não houver histórico publicado, continua cold start; com 3–4
  semanas publicadas a cadência v2 passa a ler a rotina real.

### 6.3 Prints do CRM e das conversas **[FEITO, 23/08 à tarde]**

Capturados abrindo uma aba nova no seu Chrome (já logado) por AppleScript e
recortando a janela; a aba é fechada e a sua aba ativa restaurada em seguida.
Onde estão: `Fotos Lagosta / Prints de sites e CRM / CRM e atendimento`
(pasta `1HBzbulwWqtkH2DM6L-YqXm8xm0PEDp6W`), já catalogados e com a tag
"atendimento com ia e crm". Cópia local (com as versões brutas, sem borrar, em
`brutos/`) em `human-output/lagosta-criativa-2026-08-23/prints-crm/`.

| Arquivo no Drive | O que mostra | PII |
|---|---|---|
| `crm-ilha-do-caranguejo-visao-geral-agosto-2026.png` | Visão Geral da Ilha: 962 mensagens (841 IA), 312 novos contatos, 96,5% de resposta, 1.000 conversas na semana | não |
| `crm-emporio-fonseca-visao-geral-agosto-2026.png` | Visão Geral do Empório: 558 mensagens (532 IA), 66 contatos, 1ª resposta < 1 min, 95,5% | não |
| `crm-ilha-do-caranguejo-conversa-com-o-agente-borrado.png` | conversa real ("Tem promoção de caranguejo amanhã?" → resposta do Papitito) com painel "IA Ativa / Desativar IA para este contato" | nomes borrados |
| `crm-ilha-do-caranguejo-conversa-so-o-chat-borrado.png` | só o painel do chat, vertical (bom para story) | nomes borrados |
| `crm-ilha-do-caranguejo-funil-de-reservas-borrado.png` | kanban: Novo Contato 298 · Reserva Solicitada 13 | nomes dos cards borrados |
| `crm-ilha-do-caranguejo-base-de-conhecimento.png` | Base ativa (11 fontes): Ilha das Carpas, Terça do Caranguejo em Dobro, Campanhas ativas 📌 | não |
| `crm-emporio-fonseca-lista-de-conversas-borrado.png` | lista de conversas com "Sua reserva está confirmada…" | nomes e telefone borrados |

Os números dos painéis são ao vivo — já subiram desde a leitura da manhã
(950 → 962 mensagens na Ilha). A entrada "Provas e números reais" da base
mantém os da manhã; atualize quando fechar o mês.

Ainda vale tirar à mão: **um aviso de reserva no Telegram com os botões**
✅ Confirmar reserva · 🙋 Assumir · 🔗 Abrir no CRM (celular; borrar dados) —
é a imagem mais vendedora do atendimento e não está numa tela web.

### 6.4 Prints de sites **[FEITO]**

11 capturas (desktop 1440×900 e celular 390×2400) em
`Fotos Lagosta / Prints de sites e CRM / Sites` — Empório (home, cardápio,
celular), Clericot (home, menu praia, experiências, eventos, celular), Cypra
(home, celular), Lagosta (home). Cópia local em
`human-output/lagosta-criativa-2026-08-23/prints-sites/`.

---

## 7. Fotos recentes dos clientes — curadoria **[FEITO]**

Critério: últimas por `createdTime`, qualidade alta, no máximo 2 por pasta,
sem duplicata (md5/descrição), **sem rosto de cliente final**, sem arte pronta,
sem foto de produto genérico; escolha final à mão sobre contact sheet
(`human-output/lagosta-criativa-2026-08-23/curadoria-fotos-contact-sheet.jpg`).
61 cópias em `Fotos Lagosta / Portfólio dos clientes / <Cliente>` (pasta-pai
`1xTCPLfuzrlJk2cxwbpJ3gvCuDKaTENqR`; manifesto com ids de origem e cópia em
`portfolio-clientes-manifesto-2026-08-23.json` — para desfazer, apague a pasta):

| Cliente | Fotos | Exemplos |
|---|---:|---|
| O Quintal Parrilla | 8 | picanha na tábua, bartender, coxinha de costela, torresmo, kaftas |
| By Rock | 8 | executivos Rita Lee / Charlie Brown Jr. / Roberto Carlos, chapa Rock Family, músico no palco, carpaccio |
| Real Gelateria | 7 | fachada, pudim, cuba, gelato de pipoca na mão, brownie |
| TERO | 7 | mesa de evento, ancho macro, T-bone, atum, polvo |
| Wine Vix | 7 | risoto de camarão, Brasileirinho, salada, duo musical, nhoque, ravióli |
| Empório Fonseca | 7 | espresso e bolo, pudim, risoto, queijo com mel, tábua, sobremesa |
| Seu Quinto | 6 | varanda noturna, toldo, Filé do Edd, brinde, Sol do Sertão |
| Bacana | 6 | salão da Copa, abacaxi no espeto, equipe fatiando, área kids |
| Espeto Gaúcho | 5 | chopp, balcão, salão, fachada noturna, drink |

Observação: a reconciliação troca o nome de outros clientes na descrição por
"o restaurante" (guarda de 12/08). O nome do cliente continua na **pasta** e
na **tag**, então "foto do TERO" e "vitrine dos clientes" acham as fotos.

**Bastidores**: só as 44 de out/2025. Não existe making-of recente em lugar
nenhum — a rotina proposta é a equipe fotografar com o celular durante as
sessões e subir pelo app (Fotos do Celular → acervo → catálogo às 02:00). Sem
isso o pilar Bastidores repete as mesmas 44 fotos em duas semanas **[CIRO/equipe]**.

---

## 8. Base de conhecimento — entradas criadas **[FEITO]**

| Categoria | Título | Para que serve |
|---|---|---|
| ESTABELECIMENTO_INFO | Ficha da Lagosta Criativa | contato, clientes por frente, como contratar |
| DIFERENCIAIS | Solução completa — as cinco frentes | a história/cadeia e os combos |
| DIFERENCIAIS | Atendimento com IA + CRM — o que o agente faz | capacidades em benefício, fluxo do Telegram |
| DIFERENCIAIS | Provas e números reais — 23/08/2026 | os únicos números autorizados + os proibidos |
| DIFERENCIAIS | Sites e cardápio digital | entregas reais e o que NÃO prometer |
| DIFERENCIAIS | Studio Lagosta — a plataforma | como explicar sem vender "IA" |
| FAQ | Objeções e respostas | as 4 do site + 4 do atendimento |

Manutenção: "Provas e números reais" tem data no título — atualize mensalmente
(ou quando fechar um case) via `atualizar-entrada-base`; campanha/oferta com
prazo entra como CAMPANHAS com `expiresAt`. A entrada "Pacotes" segue com os
preços do site — confira se ainda valem **[CIRO]**.

---

## 9. DNA — o que mudou **[FEITO]** (script `scripts/preparar-lagosta-criativa.ts`, dry-run por padrão)

- `toneOfVoice`: portfólio reescrito para as 5 frentes; vocabulário +
  atendimento 24h/reserva confirmada/cardápio digital/mesa ocupada; frases da
  casa +2; tom por frente; "como falar de IA" + "não inventa preço"; bloco
  PROVAS.
- `contentRules`: regras 10 (cliente real sim, dado de cliente final nunca),
  11 (print é documento, não ilustração), 12 (a entrega tem dono); regra 9
  aponta para a entrada de provas e proíbe os números do site; diferenciais
  + CRM e site.
- `photoDirection`: print de tela fiel como herói legítimo; bastidores; pessoas
  (equipe sim, rosto de cliente final não).
- `approvalChecklist`: 14 perguntas, polaridade "marcar = conforme" (+3 à
  tarde: logo do cliente citado, nada de Studio, tráfego com IA).
- `composition` e `visualStyle`: intocados (já estavam certos).
- **Revisão da tarde (23/08)**: Studio vira "ferramenta interna, nunca em
  peça" (toneOfVoice + regra 14); tráfego só com atendimento por IA (regra 15 +
  frente reescrita); cliente citado = logo na peça (regra 13); print vira arte
  pela IA como mockup, mas o conteúdo da tela fica fiel (photoDirection).

---

## 10. Home do site (lagostacriativa.com.br) — avaliação

A Home é `src/components/sales/*` deste repo (Next), servida no mesmo deploy do
Studio. Estrutura atual: Hero (+40% / +2,5k / +15, logos) → Problema → Solução
(4 cards) → Por quê → Método (5 passos) → Cases (4 cards + depoimento Jefinho)
→ Planos (3 abas: Audiovisual / Gestão / IA) → Depoimentos (1 vídeo + 2 "em
breve") → FAQ → CTA → rodapé.

### 10.1 Corrigido hoje (código no working tree + 1 ajuste em produção)
- **`twitter:description` vazava o texto do template** ("Template Next.js pronto
  para produção pela AI Coders Academy…") — vinha do `SiteSettings` do admin
  (row ativa tinha `metaDesc`, `keywords` e `twitter` do template) e a Home só
  sobrescrevia title/description/og. **Em produção**: `SiteSettings` corrigido
  (metaDesc, keywords, twitter null, ogImage no Blob) — já verificado no HTML ao
  vivo. **No código**: `src/app/page.tsx` com OG/Twitter completos, canonical,
  keywords e imagem `public/og-lagosta.png` (1200×630, logo + tagline + 5
  frentes; a anterior `og-image.png` era um SVG "Template SaaS Completo");
  defaults de `brand-config.ts`, `site-settings.ts`, `layout.tsx` e o rodapé
  público ("Feito por AI Coders Academy" → "Desenvolvido por Lagosta Criativa").
- Typo "Todos os vídeos brutos entreues"; alts "Cliente 2/3/4/5".
- `typecheck` e `lint` limpos nos arquivos tocados (os erros restantes do
  typecheck são dos scripts untracked `*mesa-amigos*`, anteriores).

### 10.2 O que a Home precisa para vender a solução completa **[CIRO — decisão]**
1. **Cinco frentes, não três.** Seção "Solução" e abas de planos ignoram CRM e
   sites. Proposta: abas **Conteúdo (foto e vídeo) · Gestão de Redes ·
   Atendimento com IA + CRM · Sites e Cardápio Digital · Tráfego** — e a aba
   de IA mostrar o que o AI Assistant realmente entrega (CRM, funil, base de
   conhecimento, Telegram, relatório), com um print do painel.
2. **Prova real no lugar de número não confirmado.** Trocar "+40% / +2,5k / +15"
   por: "950 mensagens respondidas em agosto na Ilha do Caranguejo, 96,4% das
   conversas" · "Primeira resposta em menos de 1 minuto no Empório Fonseca" ·
   "7 restaurantes com agente de atendimento, 9 com conteúdo no Studio" —
   números que existem hoje, com data. Os cards de case (Seu Quinto, TERO,
   Espeto) precisam de número ou viram depoimento.
3. **Seção de sites**: 3 prints (Clericot, Empório, Cypra) com "cardápio que
   atualiza em um clique, pedido no WhatsApp, reserva que cai no agente".
4. **Prints do produto** na seção de IA: conversa real borrada + aviso do
   Telegram com botões. É o que nenhum concorrente local mostra.
5. **Depoimentos "em breve"** (2 de 3) passam insegurança — ou grava (Jefinho
   já existe em vídeo; Ilha e Empório são candidatos naturais) ou some com os
   placeholders.
6. **CTA único e rastreável**: os três botões do hero competem; manter "Quero
   escalar meu restaurante" (WhatsApp) + "Ver resultados reais", e passar UTM.
   Hoje não há GA/GTM/Pixel configurado (`gtmId`/`gaId`/`facebookPixelId`
   nulos) — sem isso não dá para medir o que o Instagram traz **[CIRO]**.
7. **"Entrar no Studio"** no canto do site de vendas confunde o dono de
   restaurante; mover para o rodapé.
8. Preços: se os pacotes mudaram desde 22/07 (data dos componentes), a aba
   Planos e a entrada "Pacotes" da base precisam andar juntas.

Os itens 1–4 são meio dia de trabalho em `src/components/sales/` reaproveitando
os prints já no Drive; sugiro fazer depois de você confirmar os números.

---

## 11. Como operar a partir de amanhã

1. **Segunda de manhã (15 min)** — abrir a bancada da Lagosta Criativa (plano
   ativo hidratado), ler copy de cada card com o crivo, trocar foto nos cards de
   IA/tráfego/método por print ou deixar tipográfico, disparar "Gerar" (ou
   `executar-plano` no chat). Marcar **Gostei / Preciso melhorar** em cada arte:
   é a única medida de qualidade que alimenta o aprendizado.
2. **Durante a semana** — cada sessão de foto rende 5–10 fotos de bastidores
   pelo celular, subidas pelo app; cada conversa boa do agente rende um print
   borrado na pasta de prints.
3. **Sexta (10 min)** — `propor-semana` para a semana seguinte; com 3–4 semanas
   publicadas, a cadência passa a vir do histórico real e os horários da
   grade-alvo da § 6.1 podem ser ensinados publicando neles.
4. **Mensal** — atualizar "Provas e números reais" (painéis dos CRMs, Drive),
   promover 3–4 artes aprovadas a referência de estilo (`marcar-referencia-de-
   estilo`) e promover 2–3 páginas boas a modelo com tag de pilar, para a via de
   template (mais barata) passar a existir na Lagosta.

---

### 11.1 Briefing por item e ajuste das artes (23/08, tarde)

- **Direção adicional e ajuste da foto agora viajam com o item** (colunas
  `direcao` e `ajusteDaFoto` do ItemDePlano; migration aplicada em dev e
  produção). O que a equipe escreve no card "Editar a peça" vai ao servidor e
  volta na hidratação; o chat propõe/edita pelos mesmos nomes em `criar-plano`
  e `editar-item-do-plano`; o `executar-plano` manda `direcao || tema` como
  pedido e `ajusteDaFoto` como `instrucaoImagem`. Antes o modelo recebia só o
  NOME DO TEMA.
- **Co-branding**: `clienteCitadoId` no item (ou em `gerar-imagem`) faz o
  runner compor a logo oficial do cliente no canto inferior esquerdo (a da
  Lagosta fica no inferior direito; a Lagosta passou a `compor` em
  `LOGO_MODE_POR_PROJETO`). Só funciona para cliente que é PROJETO no Studio
  (tem logo na aba Marca): Ilha do Caranguejo, Coronel Picanha, Clericot Café e
  Cypra Brasil **não têm projeto** — peça sobre eles sai só com a marca da
  Lagosta até alguém cadastrar a logo deles (criar o projeto ou mandar o
  arquivo) **[CIRO]**.
- **Como pedir ajuste numa arte gerada**: (a) `conferir-arte` lê a peça e
  diagnostica; (b) `melhorar-arte` com `pedido` (até 1.200 caracteres) refaz a
  composição seguindo a instrução, mantendo os textos exatos e conferindo por
  visão — é o ajuste fino; (c) `regenerar-item` + editar direção/foto/copy +
  `executar-plano` de novo — é o "outra rodada" (25 créditos); (d) "Gerar de
  novo" no card (mesmos insumos, outra diagramação). Nada é automático: o
  verificador avisa, quem decide é o olho.

## 12. Pendências e decisões **[CIRO]**

- [ ] Confirmar por escrito os números do site (+40% / +2,5k / +15 e os 4
      cards de case) ou deixá-los fora (hoje estão proibidos na base).
- [x] Prints do CRM — feitos (§ 6.3). Falta só o print do aviso no Telegram (celular).
- [ ] Revisar e disparar o plano da Semana 1 na bancada.
- [ ] Rotina de bastidores pelo celular com a equipe.
- [x] Correções da Home commitadas e enviadas em 23/08 (`a7ca194d`, junto com o
      commit local `a03ea665` das músicas que ainda não tinha subido) — a Vercel
      deploya a `main`. Falta decidir a reestruturação (§ 10.2).
- [ ] `BrandColor` do projeto 8 (vermelho/amarelo) × paleta do DNA.
- [ ] Conferir preços da entrada "Pacotes" e da aba Planos.
- [ ] Upstash Redis do cache da base (conta) — ops.
- [ ] **Logos dos clientes que só têm CRM** (Ilha do Caranguejo, Coronel Picanha,
      Clericot Café, Cypra Brasil): sem projeto no Studio não há logo para o
      co-branding — criar o projeto com a logo ou me mandar os arquivos.
- [ ] **A aba Planos do site lista "Acesso ao Studio Lagosta" na Gestão
      Participativa** (e a entrada "Pacotes" da base repete) — contradiz "não
      vendo acesso à ferramenta". Tirar o bullet ou trocar por "planejamento
      semanal aprovado por você" — decisão de oferta, não mexi.
- [ ] Tráfego pago: trazer 1–2 resultados com fonte para a base.
- [ ] `clericot.cafe` ainda aponta para o WordPress antigo — o site novo está
      em `clericot.vercel.app`; vale apontar o domínio antes de anunciar.

### Arquivos tocados no repo (commit `a7ca194d`, 23/08)
`scripts/preparar-lagosta-criativa.ts` (novo) · `src/app/page.tsx` ·
`src/app/layout.tsx` · `src/lib/brand-config.ts` · `src/lib/site-settings.ts` ·
`src/components/app/public-footer.tsx` · `src/components/sales/HeroSection.tsx` ·
`src/components/sales/OfferSection.tsx` · `public/og-lagosta.png` (novo) ·
`docs/lagosta-criativa/*` (este estudo, DNA anterior, manifesto do Drive).

### Escritas feitas à tarde
Drive: 7 prints do CRM em `Prints de sites e CRM/CRM e atendimento` (+7 no catálogo, tag do pilar).

### Escritas em produção feitas hoje (todas reversíveis)
BrandDNA do projeto 8 (4 seções; backup em `DNA-ANTERIOR-2026-08-23.md`) ·
7 `ContentPillar` + 7 `ProjectTag` · 7 `KnowledgeBaseEntry` · Drive: pasta
`Portfólio dos clientes` (61 cópias) + `Prints de sites e CRM` (11 prints) +
`_image-catalog.json` (+72 entradas, tags de pilar) · `PlanoDeConteudo`
`cmt5znoxq0006sw7h624vuk2j` (18 itens; um plano anterior de teste arquivado) ·
`SiteSettings` (metadata) · Blob `site/og-lagosta.png`.
