# SEO Local — lagostacriativa.com.br (05/10/2026)

**Nota: 27/100.** Tipo: service-area (SAB) puro, atende no cliente. Vertical: serviços profissionais / marketing gastronômico (clientes: restaurantes).
Dimensões: GBP 5/25 · Reviews 4/20 · On-page local 8/20 · NAP/citações 4/15 · Schema 0/10 · Links/autoridade 6/10 = 27 (GBP e reviews pontuados pela falta de evidência pública, não por ausência confirmada).

## O que foi verificado
- Home (home.html/home.txt): NAP = "Vitória, ES" + CNPJ 21.339.876/0001-37 + e-mail no rodapé; WhatsApp só em 7 links wa.me/5527997578627 (nenhum `tel:`, nenhum número visível).
- Título/description/keywords citam "Vitória ES" (keywords: "marketing para restaurantes Vitória ES"); texto visível só diz "restaurantes do ES", "na sua região", "Confirmado por gigantes do ES". Nenhuma menção a Vila Velha, Serra, Cariacica, Guarapari, Grande Vitória.
- JSON-LD: nenhum em produção (PR #198 ainda aberto). Sem geo, areaServed, telefone, sameAs.
- Instagram @lagostacriativa (público): 1.724 seguidores, bio/destaques mostram foto/vídeo/estúdio para restaurantes, região de Vitória. Sem endereço, sem telefone confirmados na bio pela leitura pública.
- GBP: **não foi possível confirmar**. Busca pública bloqueada por CAPTCHA (DuckDuckGo) e sem credencial Google. Não afirmo que existe nem que não existe. → **confirmar com o Ciro**.
- Depoimentos: 1 real (Jefinho, Coronel Picanha); "Depoimento 2/3: Em breve" visíveis na página — placeholders públicos.

## CRÍTICO
1. **[OWNER] Confirmar/criar o Perfil da Empresa no Google como SAB.** Se não existe: criar com endereço oculto, área de atuação (Vitória, Vila Velha, Serra, Cariacica, Viana, Guarapari — só o que o Ciro realmente atende), categoria principal "Agência de marketing" (avaliar "Serviço de marketing digital"/"Fotógrafo comercial" como secundárias), site, WhatsApp. Se existe: conferir categoria (fator #1), área, nome exato "Lagosta Criativa" (sem keyword stuffing) e verificação. Endereço residencial NÃO deve ser exibido; qual endereço foi usado na verificação e se o CNPJ bate: **confirmar com o Ciro**.
2. **[CODE] Sem nenhum schema.** Mergear/ajustar o PR #198, mas sem inventar dados: `ProfessionalService` (ou `LocalBusiness` subtipo adequado) com `@id`, `url`, `telefone` só se o Ciro quiser expor, `areaServed` (City: Vitória + cidades confirmadas, AdministrativeArea Espírito Santo), `sameAs` (Instagram, GBP, LinkedIn/Facebook se existirem), `founder`. **Não** incluir `address` com rua nem `geo` nem `openingHoursSpecification` (SAB sem endereço público; horário a confirmar). Omitir `aggregateRating` (autoavaliação não é elegível).
3. **[CODE] Home mal acessível a bots locais**: /robots.txt, /sitemap.xml e /llms.txt dão 307 → /sign-in e o primeiro acesso passa por handshake de Clerk em instância de desenvolvimento. Liberar essas rotas no middleware e criar sitemap (afeta qualquer sinal local). Fora do escopo local estrito, mas bloqueia indexação das páginas locais abaixo.

## ALTO
4. **[CODE] NAP incompleto e telefone só em links.** Mostrar o WhatsApp (formato (27) 99757-8627) como texto no rodapé/contato, igual ao do GBP e das citações, e incluir "Vitória – ES" + "Atendemos em todo o ES, no seu restaurante". Verificar se o 5527997578627 é o mesmo número da bio do Instagram/GBP (**confirmar com o Ciro**; o site irmão cirotrigo.com.br usa +5527996367780 — números distintos, não misturar nos schemas).
5. **[CODE+OWNER] Falta conteúdo local real.** Texto só fala "ES". Adicionar bloco "Onde atendemos" na home (cidades confirmadas, atende no restaurante, deslocamento) e FAQ: "Atende Vila Velha/Serra/Cariacica?", "Atendem restaurantes fora da Grande Vitória?". Lição do site irmão (local.md): uma seção honesta, **sem páginas-doorway por cidade**; só criar páginas por cidade se houver prova única (cases e locais reais, passa o swap test).
6. **[CODE] Páginas de serviço dedicadas ausentes** (fator #1 orgânico local; e #2 em visibilidade em IA). Hoje tudo está numa home única, e o resto do domínio é o app. Criar páginas públicas indexáveis: `/marketing-para-restaurantes-vitoria`, `/fotografia-gastronomica-vitoria`, `/atendimento-ia-para-restaurantes`, `/cardapio-digital-restaurante` e `/trafego-pago-restaurantes` com H1 contendo serviço + Vitória/ES, cases reais, preços/planos e CTA. Sem texto genérico duplicado.
7. **[OWNER] Reviews/prova social.** Só 1 depoimento real; 2 placeholders "Em breve" visíveis (remover até existirem). Nº e nota de avaliações Google: **confirmar com o Ciro / sem dados públicos**. Pedir avaliações no GBP a clientes (Coronel Picanha, Seu Quinto, Tero, Espeto Gaúcho, Ilha do Caranguejo, Empório Fonseca) via link g.page/r; respostas em 48h; cadência mensal constante. Autorização por escrito antes de citar nome de cliente/métrica.
8. **[OWNER] Consistência com Instagram.** Conferir bio (cidade "Vitória, ES", link do site, botão WhatsApp, categoria "Agência de marketing") e usar o mesmo nome, descrição e número em GBP, Instagram, Facebook, LinkedIn, CNPJ. Nome de exibição no IG hoje: "Lagosta Criativa | Marketing Gastronômico" (aceitável no IG; no GBP usar só "Lagosta Criativa").

## MÉDIO
9. **[OWNER] Citações Tier 1 / BR** (não verificadas — sem acesso): Bing Places, Apple Business Connect, Facebook, LinkedIn Company, Waze (só se tiver endereço), Apontador, Guiamais/TeleListas, Solutudo, Cylex, Yelp BR (pouco relevante para SAB). Específicas do setor: Sebrae-ES, ABRASEL-ES (associação de bares e restaurantes — contato + eventual diretório de fornecedores), Findes, CDL Vitória. NAP único e idêntico. Receita/CNPJ: conferir que o endereço cadastrado não vaza como "endereço" em bases que o raspam (Serasa, Infobel, CNPJ.biz) — lição do site irmão.
10. **[CODE] `www` responde 200 sem redirecionar** (canonical no apex mitiga). Fazer 301 www → apex para não dividir sinais.
11. **[CODE] Linkagem a ecossistema**: link da home para cirotrigo.com.br/sobre (founder) e de volta; rodapé com Instagram + (quando existirem) LinkedIn/Facebook/GBP em `sameAs`.
12. **[OWNER] Links locais**: pedir link/menção dos clientes ES nos sites e redes deles ("marketing por Lagosta Criativa"); Cypra, Clericot Café e Empório Fonseca (sites feitos pela agência) devem ter crédito/link no rodapé; ABRASEL-ES, imprensa/blogs gastronômicos do ES.
13. **[CODE] Descrição/keywords**: remover `meta keywords` (sem efeito); no `<title>` incluir "Vitória ES" ("Marketing para restaurantes em Vitória ES | Lagosta Criativa"). Hoje o título não tem a cidade.

## BAIXO
14. Posts semanais no GBP (reaproveitar stories), fotos de entregas, Q&A semeado, produtos/serviços com descrição.
15. Mapa/endereço: **não** adicionar Maps embed nem "Como chegar" (SAB, atende no cliente). Se o Ciro tiver estúdio/escritório de atendimento, decidir exibir ou não: **confirmar com o Ciro**.
16. /favicon.ico 404 (ícone vem do Blob) — corrigir para evitar 404 em crawlers.

## Fator proximidade
~55% da variação do ranking local é proximidade ao buscador — não controlável. Para uma agência SAB, o alvo realista é pack em buscas "marketing para restaurantes Vitória" e orgânico por páginas de serviço, não o pack por proximidade.

## Itens "confirmar com o Ciro"
- Existe GBP? Qual categoria/área/verificação? Nota e nº de avaliações.
- Telefone/WhatsApp oficial público e se pode aparecer no site/schema.
- Endereço de verificação e se há atendimento no estúdio.
- Lista real de cidades atendidas; taxa de deslocamento.
- Horário de atendimento (se o GBP exibir).
- Autorização para citar clientes/métricas; existência de LinkedIn/Facebook/YouTube.

## Limitações
Sem DataForSEO/Google/Moz; busca pública bloqueada por CAPTCHA, então presença em GBP/diretórios não verificada; Instagram lido via fetch público (resumo, não HTML bruto); reviews, posts GBP, citações e consistência cruzada não avaliados com dado ao vivo.
