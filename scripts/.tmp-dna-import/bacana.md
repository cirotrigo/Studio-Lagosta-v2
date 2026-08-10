# bacana → projeto 5

## visualStyle  (atual: 1590 chars → proposto: 2919 chars)

### ATUAL
Churrascaria de público refinado. FARTURA NA COMIDA, MINIMALISMO NO DESIGN. A arte tem que parecer anúncio de marca premium — poucos elementos, perfeitamente posicionados, muito espaço vazio — enquanto a foto mostra generosidade real: corte farto, brasa, prato cheio.

SISTEMA MONOCROMÁTICO LARANJA (regra dura): texto BRANCO DOMINANTE sobre fundo dark #1A1410. LARANJA BACANA #EF6400 (Pantone 1564 C) é a ÚNICA COR DE MARCA, usada com EXTREMA PARCIMÔNIA — no máximo um detalhe pontual: o ponto do logo, uma única palavra, um fio minúsculo. Nunca dominante, NUNCA na headline por padrão (as headlines das artes reais são 100% brancas).

PROIBIDO ABSOLUTO: laranja-mostarda #F0A832, vermelho-brasa #FF6B35, amarelo #FFAB35, vermelho puro, verde, azul ou qualquer cor fria. EXISTE UMA ÚNICA TONALIDADE OFICIAL DE LARANJA — todas as outras eram estimativas antigas e estão erradas. Não existe segunda cor de marca.

TEXTURAS DA MARCA: brasa viva, carne marmorizada com veios de gordura, fumaça saindo do corte recém-servido, madeira rústica escura da tábua de servir, tropeiro com bacon e farofa, vinagrete em cumbuca, chopp dourado em copo americano gelado.

PROIBIÇÕES DURAS: pill button ou botão de fundo sólido · bloco escuro chapado cobrindo metade ou um terço do quadro · selo de desconto circular, carimbo, confete de varejo · logo em escala de outdoor · logo duplicado · segunda cor de marca · tipografia serif, script ou brush em qualquer lugar.

EVITAR TAMBÉM: cores frias · vermelho puro #FF0000 · fine dining geométrico ou hipster minimalista · watermark, UI, ícone de app na arte.

### PROPOSTO
Paleta de cores da marca Bacana:

- **Cores primárias:**
  - `laranja-bacana`: `#EF6A00` — Cor única de marca. Usada no ponto do logotipo, uma palavra ou um fio por peça. Representa o calor do fogo e da brasa.
  - `dark-bacana`: `#1A1410` — Fundo dominante de toda peça gráfica. Preto quente com uma gota de marrom, simbolizando a brasa apagando.

- **Neutros:**
  - `background-dark`: `#1A1410` — Fundo padrão de story, post, carrossel e apresentação.
  - `background-light`: `#F4EFE8` — Creme quente. Usado em cardápio impresso, e-mail, documento.
  - `text-on-dark`: `#FFFFFF` — Texto sobre fundo escuro.
  - `text-on-dark-soft`: `#FFFFFF` a 60% — Texto de apoio, linha secundária, legenda.
  - `text-on-light`: `#1A1410` — Texto sobre fundo claro.
  - `border`: `#FFFFFF` a 12% — Fio divisor, contorno sutil.
  - `surface`: `#241C17` — Card ou área elevada sobre o fundo escuro.

- **Cores semânticas (apenas para interface):**
  - `success`: `#16A34A`
  - `warning`: `#EAB308`
  - `error`: `#DC2626`
  - `info`: `#2563EB`

- **Tons derivados do laranja:**
  - `laranja-light`: `#F58A33`
  - `laranja-dark`: `#B84F00`
  - `laranja-05`: Laranja a 5% de opacidade.
  - `laranja-15`: Laranja a 15%.
  - `laranja-30`: Laranja a 30%.

- **Percentual de uso visual:**
  - Foto: 55% a 70%
  - `background-dark`: 25% a 40%
  - `text-on-dark`: 3% a 8%
  - `laranja-bacana`: menos de 1%

Regras de aplicação:

- **`laranja-bacana`:**
  - ✅ No ponto do "n" do logotipo.
  - ✅ Em uma única palavra da copy.
  - ❌ Nunca na headline inteira.
  - ❌ Nunca como fundo de bloco, faixa, botão sólido ou selo.

- **`background-dark`:**
  - ✅ Fundo padrão de qualquer peça de rede social.
  - ❌ Nunca como bloco chapado cobrindo metade ou um terço da foto.

- **Cor do texto:**
  - Sobre fundo escuro, texto de apoio em branco a 60%.
  - Sobre fundo claro, texto de apoio em `#1A1410` a 70%.

Combinações aprovadas e proibidas:

- ✅ Branco sobre `#1A1410`.
- ❌ `#EF6A00` sobre `#1A1410` em texto corrido.

Tipografia:

- **Sistema tipográfico:**
  - `display`: Cannon — Thin, Light, Regular, Extra Bold.
  - `body`: Cannon Regular ou Light.
  - Fallback: Century Gothic Bold, Sofia Pro SemiBold, Poppins SemiBold, Futura Bold.

- **Hierarquia de tamanhos:**
  - `display-xl`: 96 px
  - `display-l`: 72 px
  - `display-m`: 56 px
  - `support-l`: 44 px
  - `support-m`: 34 px
  - `body-m`: 30 px
  - `meta`: 24 px
  - `cta`: 28 px

Estética-âncora:

- Fundo escuro quase vazio, um bloco curto de texto branco com contraste extremo de peso, e uma foto quente de sujeito único com sombra profunda.

Anti-referências visuais:

- ❌ Churrascaria de rodízio com foto de espeto e letra amarela.
- ❌ Steakhouse americana com madeira, couro e serif dourada.
- ❌ Hamburgueria artesanal com traço grosso e ilustração de boi.
- ❌ Encarte de supermercado com selo de desconto.
- ❌ Minimalismo hipster de fine dining, com muito branco e porção pequena.

## photoDirection  (atual: 1060 chars → proposto: 2691 chars)

### ATUAL
Setups LUZ-DE-BRASA e GOLDEN HOUR.

LUZ: quente e generosa de churrascaria — brasa acesa, fumaça saindo do corte recém-servido, highlights nas gorduras. Salão acolhedor de família. Contraste alto. Nunca fria, nunca flat.

COMPOSIÇÃO — FARTURA EM QUADRO: travessas cheias, chapas servidas, tábua de madeira escura com os acompanhamentos ao redor (tropeiro, vinagrete, farofa). Prato como protagonista absoluto; mesa de família em plano aberto quando o assunto for a ocasião. NUNCA cortar as bordas do prato.

COLOR GRADING: terrosos quentes com o laranja #EF6400 como único acento gráfico — o dourado da carne, o marrom-brasa e o amarelo do tropeiro vêm da própria cena, não de filtro. Sem HDR, sem vintage.

AMBIENTE REAL: o dono precisa reconhecer o próprio salão e o próprio prato — não inventar cenário.

ANTI-FOTOGRAFIA: iluminação flat ou fria · filtro vintage exagerado (sépia, HDR pesado) · cara de banco de imagem, comida sem contexto · EMPRATAMENTO MINIMALISTA COM PORÇÃO PEQUENA — é anti-Bacana por definição · mesa simétrica de catálogo sem fartura.

### PROPOSTO
### 3.8 Direção fotográfica e audiovisual

**Estilo predominante:** editorial de sujeito único, com luz de salão quente e sombra profunda. Documental quando há gente em quadro. Este estilo dá elegância a um prato farto e deixa espaço vazio para texto. Referências-âncora: fotos de `referencias/fotos/cortes` e `referencias/fotos/chapas`.

**Iluminação:** lateral e baixa, de 3000 K a 3500 K, com sombra definida. Alta luz protegida no brilho da gordura. Proibido: luz chapada, flash direto, luz fria acima de 5000 K.

**Composição:** prato no terço inferior ou inferior-direito. Ângulo de 45° para prato, altura do olho para chapa e espeto. Fundo desfocado. Proporções: 4:5 para post, 9:16 para story e Reel. Nunca cortar a borda do prato.

**Pessoas:** famílias, grupos de adultos, equipe da casa. Expressão natural, captada em ação. A mão em quadro é bem-vinda. Proibido: sorriso de catálogo, pose de braços cruzados. Cuidado legal: autorização de imagem para crianças.

**Cenários e objetos:** sempre o salão real. Sinais de reconhecimento: parede viva, letreiro luminoso, banco capitonê, cadeira bistrô laranja. Objetos: caneca esmaltada laranja, chapa de ferro fundido, tábua de ardósia. Proibido: bancada de mármore branco, fundo infinito.

**Tratamento de cor:** saturação naturalista, temperatura quente, contraste alto. Sem grão, sem virada de cor. Referência de cor: luz âmbar do salão.

**Efeitos e pós-produção:** ajuste de exposição, contraste, sombra e alta luz. Regra sobre IA: melhorar luz, textura e cor é permitido. Alterar o conteúdo da cena é proibido. Proibido: filtro saturado, HDR, vinheta forte.

**Vídeo e motion:** ritmo médio e editorial. Duração: Reel de 15 s a 30 s. Filmagem do gesto: fatia caindo, fumaça subindo. Trilha instrumental quente, som ambiente sempre presente. Transições permitidas: corte seco e casado.

**Anti-fotografia:** ❌ Luz chapada, ❌ filtro vintage, ❌ cara de banco de imagem, ❌ empratamento minimalista, ❌ prato cortado pela borda.

**Texto em vídeo:** posição no terço inferior. Fonte Cannon, cor branca sólida. Animação seca, sem deslizar. Tamanho: cerca de 5% da altura do quadro.

**Motion:** aceleração ease-out, duração de transição 0.4 s. Entrada e saída com corte ou fade curto. Tom editorial e calmo.

**Âncoras para geração de imagem:** produto físico e ambiente. Ambiente Praia da Costa: parede viva, letreiro luminoso, banco capitonê. Ambiente Serra: abóbada de madeira, cadeira bistrô laranja. Prato na tábua: ardósia ou aço escuro, sal grosso. Chapa: ferro fundido, fumaça visível. Espeto: cravado na vertical em chapa de aço. Motor obrigatório para imagem: Higgsfield CLI com Nano Banana 2. Para carrossel, use GPT Image 2.

## composition  (atual: 3097 chars → proposto: 1833 chars)

### ATUAL
Formatos: 1080x1920 (story 9:16), 1080x1080 (feed) e 1080x1350 (portrait).

MINIMALISMO CONCRETO — PRIORIDADE MÁXIMA. O espaço negativo (área limpa, escura, vazia) é tão protagonista quanto a foto: a MAIOR PARTE do quadro fica vazia, sem texto e sem grafismo. Idealmente a arte tem APENAS TRÊS PRESENÇAS: (a) a foto, (b) UM bloco de texto curto e refinado, (c) o logo. NADA MAIS — sem bullets, sem ícones, sem divisores decorativos, sem faixas, sem grafismos extras, sem molduras. Na dúvida sobre adicionar um elemento, NÃO adicione. Regra de ouro: tente REMOVER um elemento e ver se a arte fica melhor — quase sempre fica.

VARIEDADE DENTRO DA CONTENÇÃO: você decide onde ancorar o texto e varia entre peças — texto no rodapé com foto no topo, texto num canto com muito vazio ao redor, headline no topo e foto embaixo. Não repita o mesmo layout em peças seguidas. O que muda é a ancoragem; o que NÃO muda é a contenção e o respiro amplo. Não existe zona rígida.

TEXTO REFINADO, PEQUENO E CONCISO. Renderize EXCLUSIVAMENTE os textos da copy — nunca inventar endereço, horário, telefone, unidade, CTA, selo, preço ou hashtag que não estejam lá. Copy com duas linhas = arte com duas linhas. Corpo pequeno, muito respiro entre linhas, margens amplas. A PALAVRA-CHAVE TEM FORÇA PELO PESO E PELA POSIÇÃO NO VAZIO, NUNCA POR TAMANHO GIGANTE — manchete grande estilo poster ou varejo mata o premium. Pense numa legenda sofisticada de editorial de luxo, não num cartaz.

ASSINATURA TIPOGRÁFICA — CONTRASTE DE PESO (identidade, PRESERVAR): as palavras de apoio ("Hoje é dia daquele", "Conhece nosso") em Cannon LEVE (thin/regular), tracking largo; SÓ a palavra-chave ("PRIME RIBS", "CHURRASCO") em Cannon Extra Bold. O contraste vem do PESO — mas a palavra-chave continua LIMPA, LARGA e AREJADA, nunca gordinha, chunky ou apertada. ERRO A EVITAR: as duas no mesmo peso, ou a palavra-chave grossa e espremida.

FONTE — CANNON, a MESMA do logotipo (regra dura de forma): sans-serif GEOMÉTRICA, LARGA (wide) e LIMPA, letras de bojo amplo com counters ABERTOS e arejados, cantos levemente arredondados, terminações retas — exatamente o caráter do logotipo "bacana". Peso Extra Bold ou Bold LIMPO, nunca Black 900, nunca ultra-pesado, nunca condensado. SE AS LETRAS FICAM GROSSAS, APERTADAS OU TOSCAS, ESTÁ ERRADO — a Cannon é ampla, aberta e clean. NUNCA condensada, estreita ou alta (Bebas, Oswald, Anton, Impact, United). Fallback nesta ordem: Century Gothic Bold, Sofia Pro SemiBold, Poppins SemiBold, Futura Bold. NUNCA serif, script ou brush.

LOGO — UMA VEZ SÓ. Logo branco com O PONTO LARANJA DO "N" PRESERVADO (sem distorcer nem recolorir), uma única vez onde a composição pedir, só sobre fundo escuro, com folga generosa das bordas. Nunca duplicar, nunca protagonista.

SAFE AREA E LEGIBILIDADE: faixas vazias no topo e na base do story, padding generoso nas laterais — nada encosta nas bordas nem nos cantos. Contraste do texto SEM bloco escuro chapado; prefira texto sobre área limpa e escura da foto, nunca sobre o sujeito. Se precisar, gradiente sutil (nunca sólido) só na faixa estrita do texto.

### PROPOSTO
O sistema de composição das peças da Churrascaria Bacana é cuidadosamente estruturado para manter uma identidade visual clara e consistente. O texto deve ser posicionado em relação à foto de forma que o prato esteja no terço inferior ou inferior-direito, deixando espaço vazio acima para o texto. A headline é sempre empilhada, com uma linha de apoio em Cannon Light e a palavra-chave em Cannon Extra Bold, criando contraste de peso, não de tamanho.

A cor de destaque, o laranja Bacana `#EF6A00`, aparece uma única vez por peça, seja no ponto do logotipo, em uma palavra da copy, ou como um fio fino. Nunca deve ser usado como fundo de bloco, em texto corrido, ou em fotos já dominadas por laranja. O gradiente de leitura é construído com texto branco sobre fundo escuro `#1A1410`, garantindo legibilidade e hierarquia visual. O texto de apoio é em branco a sessenta por cento de opacidade para criar hierarquia sem precisar de uma segunda cor.

O repertório de arranjos é rotativo, variando a ancoragem do texto entre o rodapé, o canto superior ou o topo, mas sempre mantendo a margem generosa. A logo é posicionada por canto, com folga mínima igual à altura da cabeça do garçom, e nunca é protagonista. Ela aparece uma vez por peça, nunca duas, e só sobre fundo escuro ou área escura da foto. O tamanho mínimo é de 120 px de largura para garantir legibilidade.

A entrelinha segue uma hierarquia de tamanhos, variando de 0.95 a 1.5 dependendo do uso, e o texto nunca encosta na borda da peça. A margem generosa é essencial para a percepção de capricho da marca. A peça deve ter no máximo três presenças: foto, um bloco de texto e o logotipo.

Essas regras garantem que a comunicação visual da Bacana seja clara, consistente e alinhada com a identidade da marca, destacando a fartura e o tratamento diferenciado que a casa oferece.

## contentRules  (atual: 2461 chars → proposto: 2480 chars)

### ATUAL
1. SEMPRE INDICAR A UNIDADE AO FALAR DE HORÁRIO. São duas casas com horários diferentes em dia útil. O BAIRRO DE FÁTIMA ABRE SÓ ÀS 17H DE SEGUNDA A SEXTA — convidar para almoçar lá em dia útil manda o cliente para uma porta fechada.
- Bairro de Fátima (Av. José Moreira Martins Rato, 329, Serra/ES): seg–sex 17h às 23h, SÓ JANTAR · sáb e feriados 11h às 23h · dom 11h às 22h.
- Praia da Costa (Rua Lúcio Bacelar, 90, Vila Velha/ES): seg–sex 11h30 às 23h · sáb e feriados 11h às 23h · dom 11h às 22h.

2. ALMOÇO BACANA É SÓ NA PRAIA DA COSTA, seg–sex 11h30 às 16h, exceto feriados e datas emendadas. Nunca anunciar sem dizer a unidade. Formato monte seu prato: 1 proteína de 200g, 1 guarnição e 1 molho.

3. CARDÁPIO OFICIAL É O DE 30/04/2026. Os preços mudaram — não usar valor de tabela antiga (a Picanha Bacana 300g passou de R$ 108 para R$ 130, a de 1kg de R$ 255 para R$ 306). Se a copy trouxer preço, tem de ser do cardápio atual. Nunca inventar valor.

4. NÃO PROMETER O QUE A CASA NÃO FAZ. A encomenda de churrasco é feita com o garçom ou o gerente — NÃO existe pedido por site nem aplicativo. A casa não trabalha com cortesia. Embalagem para viagem é cobrada à parte. Não aceita cheque.

5. NÃO EXISTE HAPPY HOUR NEM PROMOÇÃO SEMANAL. As únicas duas ofertas fixas da casa são o Almoço Bacana e a encomenda de churrasco. Nunca inventar campanha.

6. FIEL AO CARDÁPIO OFICIAL. Não inventar acompanhamento, peso ou composição de prato. OS PESOS SÃO DA CARNE CRUA, antes do preparo — isso importa quando a copy fala de gramatura.

7. NUNCA "RODÍZIO". O Bacana é no kilo, completas e chapas — nunca rodízio. Confunde o cliente.

8. GRAMÁTICA IMPECÁVEL em todas as peças.

PALAVRAS PROIBIDAS: imperdível · corre · últimas unidades · aproveita agora · top · delícia · sensacional · que tal · demais · incrível · perfeito · maravilhoso · BORA · GALERA (gíria de botequim não é o registro desta casa) · vamos estar · chave de ouro · gourmet · vocabulário de fine dining (dry-aged, mise en place, degustação).

O QUE VALE A PENA DIZER E COSTUMA SER ESQUECIDO: a casa NÃO cobra os 10% de taxa de serviço. É um diferencial real e pouco explorado. Doação espontânea ao garçom é aceita.

DADOS FIXOS: @bacanabar · barbacana.com.br · reservas por WhatsApp (27) 3535-4575 · serviço de rolha R$ 50 por garrafa · sem camisa proibido após as 18h · não vende bebida alcoólica para menores de 18 anos. Nunca inventar horário, endereço, prato, preço ou promoção fora da base.

### PROPOSTO
- Nunca use a palavra "rodízio". A Bacana é no kilo, não rodízio.
- Não use urgência de varejo: "corre", "imperdível", "últimas vagas" são proibidos.
- Evite vocabulário de fine dining: "dry-aged", "degustação", "harmonização" não se aplicam.
- Não prometa o que não fazemos: encomenda só com garçom ou gerente, sem site ou app.
- Não use canais proibidos para pedidos: sem delivery, WhatsApp ou telefone para encomendas.
- O preço deve sempre conferir com o cardápio oficial de 30/04/2026.
- Toda peça com horário deve nomear a unidade, pois a Serra não serve almoço em dia útil.
- Não invente campanha: não há happy hour ou promoção semanal.
- O laranja aparece uma vez por peça, pequeno, e nunca sobre foto já laranja.
- Texto deve ter contraste real; se não, mude a área ou use gradiente suave.
- A headline é sempre branca, com ênfase por peso, não tamanho.
- A peça deve ter no máximo três presenças: foto, texto e logotipo.
- O logotipo nunca é protagonista; confirma a peça, não abre.
- A informação vem antes da criatividade: unidade e horário são obrigatórios.
- Toda interação termina com um próximo passo concreto, geralmente o WhatsApp da unidade.
- A marca não empurra: nenhuma peça cria urgência artificial.
- Nunca centralize tudo; simetria total deixa a peça com cara de convite.
- A foto deve ser do ambiente da unidade certa; não corte borda de prato, chapa ou tábua.
- A peça deve carregar pelo menos um fato que só a Bacana pode dizer.
- Nunca use desculpa institucional; seja direto e humano ao se desculpar.
- Revisão humana sempre para imagem gerada por IA e copy com dados factuais.
- Não use frases como "Você merece" ou "Venha conferir"; são genéricas e não agregam.
- Evite perguntas retóricas de abertura; vá direto ao ponto.
- Não comece frases com emoji ou use sequência de emojis como pontuação.
- Não use caixa alta na frase inteira para dar ênfase; use o peso da fonte.
- Não use "não é só X, é Y"; é uma fórmula batida e previsível.
- Não use "o sabor que você procurava"; é genérico e não específico.
- Não use "aquele momento especial"; é vago e a marca é concreta.
- Não use "saiba mais" ou "clique aqui"; chamadas precisam ser claras e executáveis.
- Não use "BORA" ou "GALERA"; são informais demais e não refletem o tom da marca.
- Não use "top", "delícia", "sensacional"; são superlativos vazios.
- Não use "mise en place"; é vocabulário de fine dining e não se aplica.
- Não use "chave de ouro"; é clichê e não agrega valor à comunicação.

## toneOfVoice  (atual: 4170 chars → proposto: 2134 chars)

### ATUAL
Churrascaria Bacana, @bacanabar, cerca de 83 mil seguidores. DUAS UNIDADES: Bairro de Fátima (Serra) e Praia da Costa (Vila Velha). Churrasco no kilo, pratos completos para família, chapas e carta de drinks própria.

TOM: acolhedor, descontraído e autocelebrativo, como uma boa conversa com conhecidos. Fluido, cria conexão sem forçar intimidade. Fala com autoridade e confiança sobre o que serve, sem persuasão exagerada.

A MARCA USA O PRÓPRIO NOME COMO ADJETIVO — é a assinatura verbal da casa: "mais Bacana", "os exageros do Bacana", "churrasco super profissa", "sabores Bacana", "do jeito Bacana". Os pratos com "Bacana" no nome são da casa: Picanha Bacana, Tilápia Bacana, Camarão Bacana, Mega Bacana, Salada Bacana, Cartola Bacana, Bacaninha (kids).

REGRA QUE MANDA EM TUDO: CLAREZA ACIMA DE CRIATIVIDADE. Fartura se comunica com concretude — prato, tamanho, unidade, horário. Nada de copy conceitual que exija dedução. Se a pessoa precisa interpretar, reescreva mais simples.

INFORMAL, MAS NÃO POPULAR DE BOTEQUIM. Nunca promocional agressivo. Nunca hipster minimalista. Nunca fine dining frio. Linguagem bem estruturada e fiel ao cardápio oficial.

RÉGUAS: 7/10 descontraído (cordial e caloroso, sem gíria de botequim) · 8/10 próximo (casa de família que recebe bem) · 9/10 sincero (autocelebrativo com bom humor) · 9/10 direto (fartura se descreve com concretude: gramatura, acompanhamentos, serve quantos) · 8/10 coloquial (vocabulário de churrascaria que todo mundo conhece).

VOCABULÁRIO DA CASA: bacana, mais bacana, super profissa, exageros, brasa, no ponto, no ponto perfeito, mal passado, ao ponto, no kilo, completa, família, tropeiro, vinagrete, farofa, almoço bacana, chapa, monte seu prato, tempero do chef, para encomenda, corte especial, bacaninhas, esperamos você, permita-se, pede aquele, hoje é dia daquele.

BORDÕES COM ROTAÇÃO (máximo um por peça, não repetir em peças consecutivas): "super profissa", "os exageros do Bacana". Já "bacana" como adjetivo é a identidade e fica livre.

ESTRUTURAS DE HEADLINE QUE FUNCIONAM (observadas em artes reais publicadas pelo cliente):
[DIA] PEDE AQUELE [REFEIÇÃO] BACANA
[REFEIÇÃO] COM SABORES BACANA
[REFEIÇÃO] DO JEITO BACANA
[REFEIÇÃO] SEMPRE BACANA
[PRATO] NO PONTO PERFEITO
HOJE É DIA DAQUELE [PRATO]
[OCASIÃO] TEM QUE SER BACANA

CTAs: Reserve sua mesa · Faça sua reserva pelo WhatsApp · Venha conhecer · Te esperamos na brasa · Faça a encomenda para seu churrasco Bacana · Monte seu prato · Peça mal passado ou ao ponto · Esperamos você.

FRASES OFICIAIS DA CASA: "Aqui o tempero é do Chef, mas quem monta o menu é você" (Almoço Bacana) · "Os exageros do Bacana!" (assinatura das Grandes Porções) · "Faça a encomenda para o seu churrasco Bacana e sirva um churrasco super profissa" (encomenda) · "peça mal passado ou ao ponto" (cortes especiais).

TOM POR CONTEXTO:
- Story do dia a dia: cordial e direto, com a unidade SEMPRE indicada quando há horário.
- Almoço Bacana: só Praia da Costa, seg–sex 11h30–16h. Monte seu prato, tempero do chef. Prático e acolhedor.
- Grandes porções: "Os exageros do Bacana!" — fartura declarada com orgulho, tamanho e o que acompanha.
- Cortes especiais: T-Bone, Prime Ribs, Chorizo — "peça mal passado ou ao ponto", o convite oficial ao amante de carne.
- Família no fim de semana: completas e pratos-família, Bacaninha pros pequenos. A mesa cheia é a promessa.
- Encomenda de churrasco: churrasco super profissa em casa. Diferencial único — merece pauta própria.
- Diferenciais: sem taxa de serviço de 10%. Concreto, sem alarde.
- Crise: sóbria e cordial — agradece, reconhece o ponto, resolve no WhatsApp da unidade.

PERSONA: Sandra, 42, professora que mora em Vila Velha. Na semana resolve o almoço no Bacana da Praia da Costa; no domingo a família inteira vai de completa, com o Bacaninha pro filho. Quando faz aniversário em casa, encomenda o churrasco em vez de arriscar na churrasqueira. Escolhe pelo conjunto: farto, bem-feito, preço honesto e sem taxa surpresa.

ANTI-PERSONA: quem procura steakhouse conceito, dry-aged de menu enxuto ou fine dining. O Bacana é fartura tradicional: a copy nunca esconde o tamanho do prato nem se traveste de premium.

### PROPOSTO
### COMO A MARCA FALA

A Bacana fala como o dono da casa que te conhece, sabe seu ponto de carne e não precisa te empurrar nada. A voz é acolhedora, descontraída e autocelebrativa, com clareza acima de criatividade. A marca usa o próprio nome como adjetivo: mais Bacana, do jeito Bacana, os exageros do Bacana.

**É / Não é:**
- É acolhedora, autocelebrativa, concreta, descontraída com gramática impecável.
- Não é íntima demais, superlativa, conceitual, popular de botequim.

**Vocabulário próprio:**
- Palavras da casa: bacana, mais bacana, do jeito Bacana, super profissa, os exageros do Bacana, brasa, no ponto, no kilo, completa, família, tropeiro, vinagrete, farofa, chapa, monte seu prato, tempero do chef, corte especial, bacaninhas, pede aquele, hoje é dia daquele, permita-se, esperamos você.

**Palavras proibidas:**
- Imperdível, corre, últimas unidades, aproveita agora, top, delícia, sensacional, demais, incrível, perfeito, maravilhoso, que tal, BORA, GALERA, vamos estar, chave de ouro, gourmet, dry-aged, mise en place, degustação, harmonização, rodízio.

**Construções proibidas:**
- "Não é só X, é Y", "Você merece", "O sabor que você procurava", "Aquele momento especial", "Venha conferir", pergunta retórica de abertura, frase começando com emoji, caixa alta na frase inteira.

**Tons por contexto:**
- Story do dia a dia: Cordial e direto.
- Post de prato: Orgulhoso e concreto.
- Almoço Bacana: Prático e acolhedor.
- Grandes porções: Fartura declarada.
- Cortes especiais: Convite ao entendido.
- Família no fim de semana: Caloroso e coletivo.
- Encomenda: Consultivo.
- Resposta a crítica: Sóbrio e resolutivo.
- Atendimento no direct: Objetivo e humano.

**Listas fechadas de pré-título e CTA aprovados:**
- Pré-títulos: [DIA] PEDE AQUELE [REFEIÇÃO] BACANA, [REFEIÇÃO] COM SABORES BACANA, [REFEIÇÃO] DO JEITO BACANA, [REFEIÇÃO] SEMPRE BACANA, [PRATO] NO PONTO PERFEITO, HOJE É DIA DAQUELE [PRATO], [OCASIÃO] TEM QUE SER BACANA.
- CTAs: Reserve sua mesa, Faça sua reserva pelo WhatsApp, Monte seu prato, Peça mal passado ou ao ponto, Fale com o gerente para encomendar, Te esperamos na brasa, Esperamos você.
