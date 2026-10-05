# Conteúdo e On-Page — lagostacriativa.com.br (05/10/2026)

Escopo: só a home (`/`), a única página pública de marketing. Evidência: `home.html` (render de produção), `home.txt`, e o código em `src/app/page.tsx` + `src/components/sales/*.tsx` (somente leitura). Textos propostos abaixo usam só fatos que já estão no site ou no código.

## Resumo

A home tem tom forte, proposta clara e — mérito raro — números com fonte e data (950+ mensagens, < 1 min, 9 restaurantes, agosto/2026). O que segura o ranking local é estrutural: **uma página só para cinco serviços**, **"Vitória" nunca aparece no texto principal**, FAQ e 7 dos 8 planos **não estão no HTML** (ficam atrás de accordion/aba fechada), prova social com **placeholders "Em breve"**, e **zero sinal de autor/empresa** além do rodapé. ~737 palavras visíveis no texto extraído.

---

## CRÍTICO

### C1. Uma página para cinco serviços: nada para ranquear por intenção
- **Evidência:** únicas URLs públicas de marketing: `/`. Links internos: só âncoras (`#cases`, `#sites`, `#pricing`), `/sign-in`, WhatsApp e Instagram. Cada serviço tem ~1 frase (h3 + parágrafo) em `SolutionSection.tsx`.
- **Impacto:** buscas como "fotografia gastronômica Vitória", "cardápio digital para restaurante", "atendimento com IA restaurante WhatsApp", "gestão de redes sociais restaurante ES" caem numa home genérica que não tem o termo nem conteúdo suficiente. Página de serviço é o mínimo (piso de 800 palavras de cobertura).
- **Correção:** criar 5 páginas de serviço (há o roteador de CMS `src/app/(public)/[...slug]` — confirmar se serve, senão `src/app/(public)/servicos/<slug>/page.tsx`), cada uma com: h1 com serviço + Vitória/ES, o que inclui (já está em `OfferSection.tsx` por plano), preço/formato (já está lá), prova do serviço (os prints da Ilha do Caranguejo, os 3 sites de `SitesShowcaseSection.tsx`, os casos de `CaseStudiesSection.tsx`), FAQ do serviço e CTA WhatsApp. Sugestão de slugs e h1:
  - `/fotografia-gastronomica-vitoria` — "Foto e vídeo gastronômico em Vitória–ES"
  - `/gestao-de-redes-para-restaurantes` — "Gestão de redes sociais para restaurantes no ES"
  - `/atendimento-com-ia-para-restaurantes` — "Atendimento com IA no WhatsApp e Instagram para restaurantes"
  - `/site-e-cardapio-digital` — "Site e cardápio digital com pedido no WhatsApp"
  - `/trafego-pago-para-restaurantes` — "Tráfego pago para restaurantes em Vitória–ES"
  Linkar cada card da `SolutionSection` para a página dele (hoje os cards não têm link).

### C2. FAQ e planos fora do HTML
- **Evidência:** as respostas do FAQ (`ObjectionsSection.tsx`, Radix `Accordion` fechado) **não estão** em `home.html` (`grep "Ótimo, mas sua casa"` = 0). Em `OfferSection.tsx` só a aba padrão (`defaultValue="audiovisual"`) renderiza: o HTML tem h3 de Só Fotos/Só Vídeos/Edição de Vídeo; **Gestão Participativa, Gestão Completa, AI Assistant, Site + Cardápio Digital e Tráfego Gerenciado não existem no HTML**, nem seus preços e itens.
- **Impacto:** o crawler e os buscadores por IA não leem as respostas nem a oferta mensal (o produto principal). É o conteúdo mais citável da página.
- **Correção:** `forceMount` no `AccordionContent` e no `TabsContent` com `data-[state=closed]:hidden` (ou `hidden` controlado por CSS), mantendo o comportamento visual. Mudança de 2 linhas, sem lib nova.

### C3. Palavra-chave local ausente do conteúdo e do title/description
- **Evidência:** `grep "Vitória|Espírito Santo" home.txt` = 0. "ES" aparece só em "gigantes do ES", "restaurantes do ES" e na description ("a única empresa do ES"). "Vitória, ES" está só no rodapé (`SalesFooter.tsx:48`). Title: "Lagosta Criativa | Marketing Gastronômico que Gera Vendas" — sem cidade. `keywords` em `page.tsx` cita "Vitória ES", mas a meta keywords não é usada pelo Google.
- **Correção (texto só com fatos do site):**
  - Title (≤ 60): `Marketing para Restaurantes em Vitória–ES | Lagosta Criativa`
  - Description (≤ 155): `Foto e vídeo, gestão de redes, atendimento com IA, site com cardápio digital e tráfego pago para restaurantes em Vitória e no Espírito Santo.`
  - Sob o h1 (o subtítulo atual): `Não vendemos posts. Vendemos mesas ocupadas, ticket médio maior e marca memorável — para restaurantes de Vitória e de todo o Espírito Santo.`
  - h2 da solução: `A Solução Lagosta Criativa para restaurantes do ES`.
  Arquivos: `src/app/page.tsx` (TITLE/DESCRIPTION), `HeroSection.tsx`, `SolutionSection.tsx`.

---

## ALTO

### A1. Description longa demais e "a única empresa do ES" sem prova
- **Evidência:** description com ~210 caracteres (corta em ~155). "a única empresa do ES que une tudo isso" é afirmação absoluta sem fonte — o mesmo cuidado que o site já teve ao remover "+40% / +2,5k" sem fonte (comentário em `HeroSection.tsx`).
- **Correção:** a description de C3. Tirar o superlativo ou trocá-lo por um fato: "9 restaurantes do ES com conteúdo profissional toda semana".

### A2. Prova social com buracos visíveis e depoimentos fracos
- **Evidência:** `SocialProofSection.tsx:81-82` renderiza "Depoimento 2 — Em breve" e "Depoimento 3 — Em breve" em produção. Os cases (`CaseStudiesSection.tsx`) trazem métricas vagas sem número ("+ Reservas Mensais", "Crescimento Real", "+ Percepção de Valor", "Recorde de Pedidos") e depoimentos sem pessoa (só Jefinho tem nome). Já existem no código depoimentos do **Ivan / Tero** (`CaseStudiesSection.tsx:115`) que não são exibidos.
- **Impacto:** placeholder "Em breve" mina confiança (QRG: sinais de site inacabado). Métrica sem número contrasta com os números honestos do hero.
- **Correção:** remover os cards "Em breve" agora (renderizar só depoimentos reais); exibir o do Ivan (Tero) se aprovado por ele; nos cases, trocar o rótulo por número quando houver fonte (os do hero têm: Ilha do Caranguejo 950+ / 96,4%; Empório Fonseca < 1 min / 95,5%) ou deixar só a frase qualitativa, sem o "+".

### A3. E-E-A-T: quem está por trás não aparece
- **Evidência:** "Responsável Técnico: Ciro Trigo" só no rodapé, sem link. Nenhuma página Sobre, nenhuma foto da equipe, nenhum endereço além de "Vitória, ES", e-mail e CNPJ. Sem JSON-LD (o PR #198 adiciona ProfessionalService com founder — mergear).
- **Correção:** (1) mergear o PR #198; (2) linkar "Ciro Trigo" no rodapé para `https://cirotrigo.com.br/sobre`; (3) bloco curto "Quem faz" na home (nome, papel de responsável técnico, link para o Sobre) — sem inventar currículo, usar o que já está no Sobre do cirotrigo.com.br; (4) links para Política de Privacidade e Termos no rodapé — as páginas existem (`src/app/(public)/privacy-policy`, `terms-of-service`) mas não estão linkadas (0 ocorrências no HTML). Trust é o fator de maior peso.

### A4. Links internos e saída para o app
- **Evidência:** a home linka `/sign-in` ("Entrar no Studio") no menu do rodapé; nenhuma página de conteúdo para linkar. O Instagram é o único link externo de marca.
- **Correção:** com C1, menu "Serviços" no rodapé e no topo apontando para as 5 páginas; links contextuais nos cards da solução e nos planos ("ver detalhes"). Manter `/sign-in` com `rel="nofollow"` (é rota de login, não conteúdo).

---

## MÉDIO

### M1. Hierarquia de headings
- **Evidência:** h1 único e bom ("Marketing que Gera Fila na Porta"), mas sem palavra-chave de serviço/cidade. Problemas: "NÃO somos uma agência." é h3 dentro da Solução (é frase de efeito, não seção); h2 "A verdade que ninguém te conta: Por que a maioria fracassa?" — duas frases num heading; nomes de clientes como h3 em Resultados (ok) mas h4 "Jefinho" pulando nível; h4 "Empresa"/"Contato" no rodapé fora da árvore. Planos ocultos removem h3 (C2).
- **Correção:** h1 mantém o slogan e ganha complemento visual: `Marketing que Gera Fila na Porta` + subtítulo com "restaurantes em Vitória–ES" (C3) — ou h1 = "Marketing para restaurantes em Vitória–ES" com o slogan como destaque visual acima. "NÃO somos uma agência." → `<p>` estilizado. Rodapé: trocar h4 por `<p>`/`<span>` com estilo.

### M2. Conteúdo raso por serviço
- **Evidência:** cada serviço tem 1 frase (~15 palavras). A mesma ideia aparece três vezes ("Solução", "Por que contratar", "Sistema Lagosta") com redação diferente — repetição sem informação nova.
- **Correção:** fundir "Por que contratar" e "Sistema Lagosta" numa seção só e usar o espaço ganho para 2–3 linhas por serviço com o que já está nos planos (o que inclui, periodicidade: "sessões mensais", "stories diários", "planejamento semanal aprovado por você", "pedido fechado no WhatsApp").

### M3. Afirmações quantitativas sem fonte no FAQ
- **Evidência:** "pequenos ajustes de engenharia de cardápio podem aumentar o lucro em 20-30%" (`ObjectionsSection.tsx:18`) — número sem origem, num site que se orgulha de números com dono.
- **Correção:** citar a fonte ou suavizar para "podem aumentar o lucro sem trazer nenhum cliente novo".

### M4. Alt text
- **Evidência:** 29 `<img>`. Bons: sites ("Site do Clericot Café desenvolvido pela Lagosta Criativa"), prints de prova. Fracos: 4 logos com alt genérico "Cliente Lagosta Criativa" (`HeroSection.tsx`, client-2/3/4/5 — client-3 é o Espeto Gaúcho, usado com nome em CaseStudies); a cópia duplicada da faixa com `alt=""` é correta (decorativa).
- **Correção:** nomear os 4 logos genéricos com o nome do cliente (client-3 = "Espeto Gaúcho"; os demais conferir no arquivo).

### M5. www sem redirecionar
- `https://www.lagostacriativa.com.br/` responde 200 (canonical salva, mas é conteúdo duplicado servido). Redirect 308 www → apex no Vercel. (Detalhe técnico, registrado aqui pelo impacto no on-page.)

---

## BAIXO

- **B1. Legibilidade:** frases curtas, voz ativa, 2ª pessoa — boa (estimativa Flesch PT ~60–65). Pontos de atrito: anglicismo "backend completo de crescimento" (público de dono de restaurante), "ciclo da falência digital" (tom alarmista). Sugestão: "Somos a estrutura completa de crescimento para negócios gastronômicos."
- **B2. Frescor:** "Números de agosto/2026" é bom sinal de data; criar rotina para atualizar mensalmente (o dado fica velho rápido — hoje já é outubro).
- **B3. Palavra-chave:** "restaurante" aparece de forma natural, sem stuffing. Falta variação semântica: "bar", "cafeteria", "delivery", "reservas" aparecem pouco; os sites mostrados (cafeteria, empório) justificam citar "bares, cafés e empórios".
- **B4. Metadata templated:** não aplicável (uma página só). Ao criar as páginas de serviço, cada uma precisa de title/description própria — nada de description repetindo o title + CTA fixo.

---

## Prontidão para citação por IA

- **Bom:** números com escopo e data no hero (citáveis), FAQ em formato pergunta/resposta.
- **Falha:** respostas do FAQ e 5 de 8 planos fora do HTML (C2); sem JSON-LD (PR #198 resolve Organization/ProfessionalService; acrescentar `FAQPage` e `Offer` por plano depois de C2); `/llms.txt` e `/robots.txt` redirecionam para `/sign-in`.
- Nota: **35/100**.

## E-E-A-T

| Fator | Peso (modelo interno) | Nota | Motivo |
|---|---|---|---|
| Experiência | 20% | 65 | Prints reais de painel, sites de clientes, números datados |
| Expertise | 25% | 40 | Responsável só no rodapé, sem link, sem conteúdo aprofundado |
| Autoridade | 25% | 40 | Logos de clientes reais; poucos depoimentos nomeados, sem menções externas |
| Confiança | 30% | 50 | CNPJ, e-mail e números honestos; mas "Em breve", superlativo sem prova, privacidade/termos sem link, Clerk de desenvolvimento no handshake |
| **Ponderado** | | **~49** | |

## Ordem sugerida

1. C2 (forceMount — barato e destrava o conteúdo que já existe).
2. C3 + A1 (title, description, subtítulo).
3. A2 (tirar "Em breve") e A3 (mergear #198, linkar Sobre e políticas).
4. C1 (páginas de serviço), começando por atendimento com IA e foto/vídeo — os dois com prova mais forte no site.

## Notas finais

- **Conteúdo: 52/100** — proposta e números honestos, mas raso por serviço, sem local e com placeholders.
- **On-Page: 45/100** — title/description sem cidade e longa, conteúdo-chave fora do HTML, uma URL para cinco intenções, sem schema, quase sem links internos.
