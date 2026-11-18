# Melhorar a foto com IA — plano (17/11/2026)

> Pedido do Ciro, 17/11/2026: a melhoria com IA serve para corrigir texto e
> recompor uma arte que não ficou bonita, equilibrada ou fiel à identidade do
> cliente. Já que ela gasta crédito, deve também **melhorar a fotografia**:
> composição que encaixe o texto, balanço de branco, aparência de câmera e lente
> melhores, fundo desfocado, prato nítido. E **humanizar**: a mão puxando o
> queijo, o garfo na batata, o vinho sendo servido, o chope na mão, o brinde;
> com gente na foto, postura e sorriso melhores. Tem de funcionar **no site** e
> **pelo chat (MCP)**. No chat o Claude analisa a arte e escreve o prompt; no
> site a pessoa não sabe escrever esse prompt, então precisa de outro caminho.

**Status:** proposta para aprovação do Ciro. Nada implementado. As decisões que
são dele estão na seção 11. As referências de código são do `origin/main`
(e6a44a2c2) e do PR #319 (`claude/melhoria-nano-banana-por-zona`); o `main` do
checkout compartilhado está atrás e não tem parte desses arquivos.

---

## Resumo em uma página

**A ideia central.** Hoje a melhoria manda a arte pronta (foto + texto + logo
num único PNG) para a IA redesenhar tudo. Por isso o texto e a logo saem
estragados, a foto escurece e a peça se solta da página do editor. A proposta é
separar as duas coisas: **a IA melhora só a foto, limpa, sem texto; o Studio
recoloca o texto, a logo e os elementos por cima, com as fontes reais.** O texto
nunca passa pela IA, a arte continua editável e o post continua ligado à página.

**Quem faz o quê.** Nano Banana 2.1 para a foto (humanizar, tratar, abrir espaço
para o texto). O gerador da OpenAI continua nos modos de diagramação que já
existem (rediagramar, redesenhar, refinar). A escolha deixa de ser uma chave
global e passa a ser por tipo de pedido.

**O prompt detalhado.** Nasce de um "diretor de foto": um modelo com visão que
olha a foto e a arte, conhece as receitas da casa e o DNA do cliente, e escreve
o prompt longo em inglês, com câmera, lente, luz e a lista do que não pode
mudar. Pelo chat, quem faz esse papel é o Claude, que manda o prompt pronto.

**Para quem não sabe escrever prompt.** A tela ganha **sugestões prontas para
aquela arte** (o Studio olha a peça e propõe três ou quatro melhorias, em
português simples) e **receitas de um clique**: Humanizar, Foto profissional,
Abrir espaço para o texto. A pessoa escolhe, vê em uma frase o que a IA vai
fazer, e confirma.

**Uma opção por padrão, duas se a pessoa quiser.** O pedido gera uma versão da
foto; um seletor permite pedir duas de uma vez, e depois do resultado há o
botão "Gerar outra opção". A pessoa vê antes e depois e decide. Custo real por
opção: de US$ 0,06 a US$ 0,10 (a tabela do Google, lida em 17/11, dá US$ 0,05
por imagem em 2K no Nano Banana 2.1; o resto é o raciocínio do modelo e o
diretor). Duas opções custam o dobro. A melhoria de hoje com ajuste de foto
custa US$ 0,165 por imagem.

**Sem preço em créditos.** O Studio deixou de ser SaaS (Ciro, 17/11/2026): a
melhoria de foto não cobra crédito. O uso continua registrado, com o custo real
em dólar, para acompanhar o gasto.

**Ordem.** Primeiro o chat (o Ciro já usa todo dia e é o caminho mais curto para
medir), depois a tela do site, depois a foto avulsa do acervo e o editor.

---

## 1. Como funciona hoje e por que não atende

- **Um gerador só, na arte chapada.** `improveCreative` chama
  `images.edit` do gpt-image com a arte inteira
  (`openai-image-client.ts:675-768`). O PR #319 acrescenta o Nano Banana atrás
  de `MELHORIA_GERADOR`, ainda sobre a arte chapada.
- **A foto é intocável por regra.** A regra 7 (`regras-da-melhoria.ts:396-402`)
  e o diretor (`diretor-de-arte.ts:214-230`) proíbem exatamente o que o Ciro
  pede agora: "aparência profissional, profundidade de campo, fundo desfocado,
  iluminação quente", e "acrescentar objeto". A única porta é o campo "Precisa
  mexer na foto?" do modal (`instrucaoImagem`), escondido, com 500 caracteres,
  e que **não existe no MCP**.
- **O diretor escreve prompt curto e de design.** Teto de 2.600 caracteres
  (`diretor-de-arte.ts:69`), estrutura voltada à diagramação. Não fala de
  câmera, lente nem luz, e não recebe a foto limpa nem a caixa do assunto.
- **A tela não ajuda.** O modal (`improve-creative-modal.tsx`) tem três modos,
  um campo livre e placeholders. Não há sugestão nem receita.
- **O MCP é mais pobre que a tela.** `melhorar-arte`
  (`catalogo/arte-ia.ts:482-640`) só aceita `pedido` (1.200) e `modo`. Não
  aceita prompt pronto nem ajuste de foto. `ver-geracao` não devolve a leitura
  nem o prompt do diretor, embora estejam gravados.
- **O resultado se solta da página.** A Generation de melhoria não guarda
  `pageId`; o post fica com `renderStatus: NOT_NEEDED` e deixa de acompanhar o
  editor.
- **Já existe edição de foto com Nano Banana, solta.** O "Editar com IA" do
  Drive (`drive/_components/ai-edit-modal.tsx`) e o painel de IA do editor
  (`sidebar/ai-images-panel.tsx`) chamam `/api/ai/generate-image` em modo
  `edit`. É prompt livre, sem receita, sem proteção do prato e sem volta para a
  arte.
- **O humanizar de setembro nunca foi usado.** O branch `feat/humanizar-foto`
  (local, sem push, base de 05/09) usa gpt-image com máscara e nunca rodou pela
  fila. As falhas medidas (objeto movido, rótulo redesenhado, toalha virando
  papel liso) são do gerador com máscara.

## 2. O que muda de regra

A regra "a fotografia é intocável" **continua sendo o padrão** dos modos de
diagramação. O que entra é uma lista fechada de exceções com nome, as
**receitas de foto**, sempre escolhidas por gente. Nenhum revisor automático
dispara receita de foto.

O que continua proibido em qualquer receita:

- **A comida é a do cliente.** Não acrescentar, tirar nem trocar ingrediente,
  porção, louça ou bebida. Tratar a foto não é mudar o prato.
- **O lugar é o do cliente.** Mesa, parede, móveis e fundo continuam os mesmos;
  desfocar é permitido, trocar não.
- **Nenhum contraste para segurar texto** (véu, gradiente, tarja,
  escurecimento). Essa regra de 05/09 fica como está.
- **Gente entra pelas bordas do quadro**, nunca casa cheia, nunca rosto em foco
  sem autorização, homem nunca de terno ou blazer (regra de 22/10).
- **Rosto de pessoa real não é refeito.** "Melhorar postura e sorriso" fica
  para depois e com regra própria (seção 11, decisão 3).

A seção nova vai para `docs/regras/melhoria.md`, com data, e a contradição de
`mcp/instrucoes.ts:46` (manda pedir "luz e tratamento da foto" num campo que o
diretor ignora) é corrigida junto.

## 3. Abordagens consideradas

**A. Trocar o gerador e alongar o prompt, na arte chapada.** O Nano Banana
recebe a arte pronta e um prompt longo pedindo foto melhor e texto preservado.
É o mais barato de fazer (o PR #319 já entrega o gerador). Problemas: todos os
modelos testados em 17/11 estragam a letra pequena da logo; tratar a foto
inteira impede colar os pixels originais do texto de volta; a peça continua
solta da página.

**B. Foto por baixo, texto por cima (recomendada).** A IA edita só a foto
limpa. O Studio troca a foto da página e renderiza de novo com as camadas de
texto, logo e elementos. Texto e logo ficam exatos por construção, a arte segue
editável, o post segue ligado à página. Exige que a arte tenha página (é o caso
de quase tudo que sai do compositor, de modelo e do ajuste).

**C. Dois passes de IA: Nano Banana na foto, depois gpt-image na
diagramação.** Daria o "jeito ChatGPT" de posicionar texto, recortar objeto e
passar texto por trás. Custa o dobro e traz de volta o defeito medido do
gpt-image: ele redesenha a foto inteira e a escurece.

**Escolha: B**, com **A como reserva** para arte sem página (arte importada,
canvas, post trazido do Zernio). **C fica fora**: os efeitos de recorte e texto
por trás entram num plano próprio, se o Ciro quiser, e de preferência feitos
pelo editor com a silhueta do assunto, não por IA.

## 4. As receitas

Um catálogo único em código (`src/lib/ai/receitas-de-foto.ts`), lido pela tela,
pelo MCP e pelo diretor. Cada receita declara: nome e descrição em português
simples, parâmetros, o trecho fotográfico que ela acrescenta ao prompt, o que
ela protege e quais conferências roda.

| Receita | O que faz | Parâmetros | O que protege |
|---|---|---|---|
| **Humanizar** | Põe um gesto na cena: mão puxando o queijo, garfo na batata, vinho sendo servido, chope na mão, brinde | gesto (sugerido pela análise), lado de entrada, rosto permitido ou não | prato, louça, bebida e ambiente |
| **Foto profissional** | Balanço de branco, luz mais limpa, fundo mais desfocado, prato nítido, aparência de câmera e lente melhores | intensidade (leve ou marcada) | conteúdo e enquadramento |
| **Abrir espaço para o texto** | Recompõe ou estende a foto para deixar uma área calma onde o texto está | a área do texto, lida das camadas da página | prato e o que não está na área |
| **Ajuste livre** | O que a pessoa escrever sobre a foto (o campo atual) | texto | o que o diretor listar |

As receitas se combinam num pedido só (por exemplo, humanizar e foto
profissional), e viram **uma** geração por opção, não uma por receita.

## 5. Quem escreve o prompt

Três origens, um mesmo formato de saída:

1. **Diretor de foto (site e pedido curto pelo chat).** Função nova,
   `planejarMelhoriaDeFoto`, na mesma infraestrutura do diretor atual
   (`diretor-de-arte.ts`, modelo `gpt-5.2`, validação por código). Recebe: a
   foto limpa, a arte pronta (para ver onde o texto mora), as receitas
   escolhidas com seus parâmetros, a direção de foto do DNA, o que o catálogo
   sabe da foto (prato, caixa do assunto) e o pedido curto da pessoa. Devolve:
   - `leitura`: duas ou três frases em português dizendo o que vê e o que vai
     fazer. É o que a tela mostra antes de gastar crédito.
   - `prompt`: em inglês, até 4.000 caracteres, na estrutura que o guia do
     Google recomenda para edição: verbo da operação primeiro; o que muda; a
     lista explícita do que fica exatamente igual; câmera, lente, abertura e
     luz; frases afirmativas ("mesa vazia ao fundo") em vez de negações.
   - `riscos`: o que pode sair errado nesta foto (mão perto de copo, rótulo
     legível, toalha estampada), usado como aviso.
2. **Prompt pronto pelo chat.** O Claude olha a arte e a foto e manda o prompt
   detalhado. O Studio não reescreve: acrescenta por código o bloco de
   preservação da receita e roda as mesmas conferências.
3. **Diagnóstico sem gasto.** O mesmo diretor, sem gerar imagem, devolve três
   ou quatro sugestões para aquela arte. É uma chamada de visão de centavos,
   guardada na Generation para não repetir. Alimenta a tela (seção 7) e fica
   disponível no MCP.

## 6. O caminho da melhoria de foto

Para arte com página:

1. **Achar a página e a foto limpa.** `fieldValues.pageId` ou `sourcePageId`
   da origem, depois a primeira camada de imagem de `Page.layers` (`fileUrl`,
   `crop`, `objectFit`). Vão para a reserva (abaixo): arte sem página, página
   que é modelo (o `ajustarArte` recusa) e **arte que já é uma melhoria
   chapada**. Nesse último caso a página existe, mas não é o que o post mostra,
   e trocar a foto nela jogaria fora a diagramação aprovada. A tela oferece a
   alternativa com todas as letras: "voltar para a versão do editor e melhorar
   a foto". *(Decisão do autor do plano; ver seção 11, item 6.)*
2. **Recortar o quadro que a arte mostra.** A IA edita a foto já no
   enquadramento da peça, não a foto inteira do acervo: "abrir espaço" e a
   composição dependem do quadro. A foto nova entra como fundo sem recorte.
3. **Gerar a opção** no Nano Banana 2.1, modo edição, 2K (a API devolve
   1536x2752 em 9:16), pelo `gemini-image-client.ts` que o PR #319 já estende.
   Uma por padrão; duas em paralelo quando a pessoa pede.
4. **Conferir, avisando.** O assunto continua no lugar
   (`deslocamentoDaFoto`); o prato é o mesmo e nada foi inventado
   (`conferirFidelidadeDaCena`, de `creative-qa.ts`, como está); mãos sem
   defeito aparente. **Tudo isso é aviso ao lado da opção, nunca veto**: vale a
   regra de 10/08 (o verificador avisa), e quem decide é gente, com o antes e
   depois na frente. O único descarte é medido por código: a opção que saiu
   igual à origem (`mudancaNaoEntrou`, do PR #319). Se nenhuma opção mudou,
   termina como "a mudança não entrou".
5. **Montar as prévias sem tocar na página.** Renderiza a página com a foto
   trocada, em memória, uma vez por opção. A página e o post só mudam quando a
   pessoa escolhe.
6. **Guardar as opções no Blob**, com a trilha `foto-melhorada`, a foto de
   origem e a receita. Só a opção **usada** entra no acervo do cliente (seção
   6.1); a recusada nunca vai para a pasta dele.
7. **Aplicar a escolhida.** `ajustarArte({ imageUrl })`
   (`creatives/arte-rapida.ts:1321`), que já grava o fundo, renderiza, registra
   a arte e avisa a agenda com `invalidateScheduledRenders` e
   `pedirRecomposicaoDaArteCongelada`. Atenção ao recorte: a troca pelo slot
   dinâmico zera o `crop` (`bake-layers.ts:143`), a troca pelo fundo
   (`arte-rapida.ts:1484`) não. **Post que já está no Zernio** (`laterPostId`):
   a página é atualizada, e a arte renderizada entra no post pelo mesmo caminho
   que a melhoria usa hoje (`aplicar-arte-melhorada.ts`, troca no Zernio fora
   da janela de publicação, recusa dentro dela). *(Decisão do autor do plano.)*
8. **Registrar o uso**, sem cobrar crédito: uma linha por opção gerada, com o
   modelo e o custo real em dólar.

Reserva, para arte sem página: Nano Banana na arte chapada, com a foto
liberada, conferência de texto e a logo da origem (`recompor-por-zona.ts`, do
PR #319). A tela avisa que nesse caso o texto pode sair diferente.

A posição do texto não muda nesta primeira versão. "Abrir espaço" resolve pela
foto: o diretor recebe a caixa onde o texto está e pede a área calma ali.

### 6.1 Onde a foto nova fica, para ser usada de novo

- **Só a foto usada vira acervo.** Quando a pessoa aplica uma opção, a foto
  limpa (sem texto) é copiada para `Fotos/IA_LAGOSTA` no Drive do cliente, a
  pasta que já recebe as fotos de IA e que a reconciliação das 02:00 já
  cataloga. Opção não usada fica 30 dias no Blob e é apagada.
- **Nome que diz de onde veio:** `<nome da foto original> - humanizada -
  2026-11-17.jpg` (ou `- tratada -`, `- espaco -`).
- **Ficha no catálogo ligada à original.** Três campos novos: tratada por IA
  (sim ou não), foto de origem e receita. A ficha herda da original o prato, as
  etiquetas e a caixa do assunto, e ganha o que a receita acrescentou ("mão",
  "brinde", "vinho sendo servido").
- **Na busca e no seletor de fotos** ela aparece como uma **versão** da
  original, com o selo "IA", e há o filtro "só fotos reais". `buscar-fotos`
  devolve os mesmos campos, para o Claude escolher sabendo o que é.
- **No rodízio** conta como foto própria (é o que multiplica a sessão), mas a
  original e a versão não são sugeridas na mesma semana.
- **As fotos de IA que já estão em `IA_LAGOSTA`** recebem a marca de uma vez,
  pela pasta. Hoje a busca as devolve como se fossem do acervo.

## 7. O site

O botão "Melhorar com IA" continua nos mesmos lugares (galeria, /criativos,
agenda, bancada). O modal muda:

```
┌ Melhorar com IA ────────────────────────────────────────────┐
│  [ A foto ]   [ O texto e a diagramação ]                   │
│                                                             │
│  Sugestões para esta arte                                   │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────┐ │
│  │ Uma mão puxando  │ │ Fundo mais       │ │ Mais espaço  │ │
│  │ uma fatia, pela  │ │ desfocado e o    │ │ calmo no     │ │
│  │ direita          │ │ prato mais nítido│ │ topo         │ │
│  └──────────────────┘ └──────────────────┘ └──────────────┘ │
│                                                             │
│  Ou escolha:  (Humanizar) (Foto profissional)               │
│               (Abrir espaço para o texto)                   │
│                                                             │
│  Quer dizer algo a mais? (opcional)                         │
│  [ a mão segurando um garfo                             ]   │
│                                                             │
│  O que a IA vai fazer                                       │
│  "Vou acrescentar uma mão entrando pela direita, puxando    │
│   uma fatia. O prato, a tábua e a mesa ficam como estão."   │
│                                                             │
│  Opções: (•) 1   ( ) 2                       [ Gerar ]      │
└─────────────────────────────────────────────────────────────┘
```

- A aba **A foto** abre por padrão quando a arte tem foto e página.
- As sugestões aparecem em poucos segundos; enquanto isso as receitas já estão
  clicáveis.
- "O que a IA vai fazer" é a `leitura` do diretor, atualizada quando a pessoa
  muda a escolha. O prompt em inglês fica num "ver detalhes", para quem quiser.
- A aba **O texto e a diagramação** é o modal de hoje, com os três modos.
- **Resultado:** o diálogo de antes e depois mostra a origem e a opção (ou as
  duas), com os avisos ao lado. Botões: "Usar esta", "Gerar outra opção" (mesmo
  pedido, mantendo a anterior para comparar) e "Ajustar esta" (reabre com a
  opção como base e um campo curto, para a segunda rodada).

## 8. O chat (MCP)

`melhorar-arte` ganha, sem quebrar o que existe:

- `alvo`: `foto` ou `arte` (padrão `arte`, o comportamento de hoje).
- `receitas[]` e os parâmetros de cada uma.
- `promptPronto` (até 4.000): o prompt detalhado escrito pelo Claude.
- `opcoes`: 1 ou 2 (padrão 1).
- `instrucaoImagem`, que hoje só a tela tem.

`ver-geracao` passa a devolver `leitura`, `prompt`, as opções com seus avisos e
qual foi aplicada. Uma tool de leitura, `sugerir-melhorias`, devolve o
diagnóstico sem gasto. Aplicar a opção escolhida é uma chamada com o id da
opção; nada é aplicado ao post sem o OK do Ciro no chat.

O perfil só-rascunho continua sem `melhorar-arte`.

Fluxo no chat: o Ciro aponta a arte; o Claude olha a peça e a foto, propõe em
português o que faria, escreve o prompt, gera a opção, mostra antes e depois e
pergunta se usa, se gera outra ou se ajusta.

## 9. Medição antes de virar padrão

Uma bancada como a do PR #319, só no banco de desenvolvimento: 4 clientes,
3 receitas, 2 opções cada (24 imagens, perto de US$ 1,50). O Ciro julga a folha,
que fica **fora do repositório** (ele é público). O que a folha precisa
responder: o prato continua o mesmo; a mão convence; nada foi inventado na
mesa; quantas das 24 ele usaria. A receita só fica ligada na tela se a maioria
das peças dela passar no julgamento dele.

## 10. Fases

Cada fase é um PR, atrás da chave `MELHORIA_DE_FOTO`.

- **Fase 0.** Mesclar o PR #319 (falta o envio forçado que tira a folha do
  branch).
- **Fase 1, o chat.** Catálogo de receitas, diretor de foto, caminho da seção
  6, a foto usada no acervo com a marca de IA (seção 6.1, menos a tela),
  campos novos do `melhorar-arte`, do `ver-geracao` e do `buscar-fotos`,
  bancada de medição, seção de regras. Entrega: o Ciro pede no chat, vê antes
  e depois e decide; a foto usada fica no acervo, marcada.
- **Fase 2, o site.** Diagnóstico sem gasto, modal novo, antes e depois com
  "Gerar outra opção" e "Ajustar esta", versões e filtro "só fotos reais" no
  seletor de fotos.
- **Fase 3, a foto avulsa.** `melhorar-foto` para foto do acervo sem arte (o
  objetivo original do humanizar: multiplicar a sessão de fotos), receitas no
  "Editar com IA" do Drive e do editor, registro de qual receita e qual opção
  foram escolhidas por cliente.

## 11. Decisões do Ciro

1. **Quantas opções.** Uma por padrão, com seletor para duas e o botão "Gerar
   outra opção" (ajustado em 17/11 a pedido do Ciro; a primeira versão do plano
   propunha duas sempre). Nada é aplicado ao post sem alguém ver o antes e
   depois. A bancada da seção 9 dirá se alguma receita, como Humanizar, merece
   duas por padrão.
2. **Aposentar o `feat/humanizar-foto`.** Recomendo aproveitar as ideias
   (proteção do assunto, entrada pelas bordas, conferência da cena) e não o
   código: ele depende da máscara do gpt-image, que foi a origem dos defeitos.
3. **Foto que já tem gente.** O Nano Banana repinta o quadro inteiro, então
   qualquer receita pode alterar um rosto que já está na foto. Recomendo, nas
   fases 1 e 2: quando o diretor vê rosto em foco, o prompt manda manter as
   pessoas como estão e a opção sai com um aviso em destaque ("esta foto tem
   rosto: confira se a pessoa continua a mesma"). Não há trava por código. A
   receita de **postura e sorriso** e a proteção forte (devolver os pixels
   originais do rosto) ficam para depois da Fase 3, com regra própria: é rosto
   de cliente ou funcionário, e a IA pode mudar quem a pessoa é.
4. **A regra da foto intocável ganha exceções com nome.** É regra sua, de 05/09
   e 08/09. O plano não a revoga; ela passa a ter as receitas como exceção.
5. **Preço.** Decidido pelo Ciro em 17/11: sem crédito, o Studio não é mais
   SaaS. Fica só o registro de uso com o custo real.
6. **Arte que já passou pela melhoria.** Se o post mostra uma arte melhorada
   (chapada), a foto por baixo não alcança o que está no post. Recomendo: essas
   vão pela reserva (IA na arte chapada), e a tela oferece voltar à versão do
   editor para melhorar a foto. Com o tempo o fluxo natural passa a ser compor,
   melhorar a foto e agendar, sem a melhoria chapada no meio.

## 12. Riscos e limites

- **O Nano Banana é tímido em parte dos pedidos** (2 de 8 na medição do #319).
  O custo disso é tempo e uma geração a mais em "Gerar outra opção".
- **Mão e dedo com defeito** continuam possíveis. A conferência avisa; quem
  aprova é gente.
- **Marca do Google na imagem** (medido em 17/11, numa edição pela API):
  - não há marca visível; os quatro cantos saem limpos;
  - o arquivo cru traz um selo de procedência nos metadados (C2PA, assinado
    pelo Google), que declara "Created by Google Generative AI" e "Applied
    imperceptible SynthID watermark";
  - esse selo **some** quando a imagem é regravada, que é o que o Studio faz ao
    redimensionar e ao renderizar a arte (medido: zero ocorrências depois);
  - a marca invisível nos pixels (SynthID) é declarada pelo próprio arquivo e
    foi feita para resistir a redimensionar e comprimir. Não há como detectá-la
    por código aqui; dá para conferir enviando a imagem ao Gemini e perguntando
    se foi feita com IA do Google;
  - sem o selo de metadados, o rótulo de IA do Instagram fica menos provável,
    mas não está descartado.
- **Regra de gente que ainda não está escrita.** "Homem nunca de terno ou
  blazer" (22/10) não está em `docs/regras`; entra na seção nova.
- **Arte sem página** só tem a reserva, com texto sujeito a erro.
- **Carrossel:** uma página por vez, como o `slide` de hoje.
- **O que não foi medido:** nada deste plano. Os únicos números são os do
  PR #319 (arte chapada) e o teste de 17/11 numa arte do By Rock.

## 13. O que fica para quem implementar

Nomes de arquivos e funções novas, o formato exato dos parâmetros de cada
receita, onde guardar o diagnóstico, como renderizar a prévia sem persistir, o
limiar das conferências (calibrado na bancada) e os testes unitários. O que
não é dele: as regras da seção 2, a escolha B, as duas opções com escolha e a
ordem das fases.
