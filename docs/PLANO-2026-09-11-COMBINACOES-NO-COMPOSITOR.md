# Combinações de texto no compositor (11/09/2026)

Pedido do Ciro, depois de decidir que as artes-modelo do Quintal viram as
variantes da assinatura: "Para facilitar o compositor aproveitar assinatura de
textos, logo, o gradiente e também ícones, filetes e outros elementos você pode
agrupar e criar combinações de textos […] ensinar também o compositor a usar,
você pode inclusive editar todas as combinações existentes para criar variações
usáveis para o compositor."

## O que existe hoje

- **Combinação de texto** (`FontCombination`, aba Texto do editor): uma lista de
  elementos de texto com papel TIPOGRÁFICO (`title`/`subtitle`/`body`), estilo,
  posição em frações do canvas e, desde o PR #116, um ícone à esquerda de cada
  texto. Aplicar cria camadas num grupo (`metadata.groupId`) com pilha que reflui.
  Salvar captura os textos selecionados e os ícones ao lado deles.
- **Compositor**: o estilo de cada papel SEMÂNTICO (`pre`, `headline`,
  `headline2`, `apoio`, `cta`, `servico`) vem das camadas da página de
  assinatura, os grupos da página (Cmd+G) viram os blocos, o vão entre papéis é
  uma regra fixa (`vaoEntre`) e **tudo que não é texto, logo ou gradiente é
  ignorado** — ícone de serviço, filete, selo.
- Inventário (11/09): 71 combinações em 10 projetos; a maioria é o catálogo base
  de 6 ("Sabor de Verdade"…) sem ajuste. Próprias: Real (local e horário com
  ícone, comunicado), Seu Quinto (3), Espeto (4), Empório (1).

## O desenho

**Um grupo de texto é uma combinação.** Seja o grupo da página de assinatura,
seja uma combinação salva, o compositor o lê do mesmo jeito: papéis, estilo de
cada texto, o ritmo vertical entre eles e os ELEMENTOS presos a cada texto.

### Fase A — o contrato da combinação (compatível com o que existe)

`FontComboElement` ganha, todos opcionais:

- `papel` — o papel semântico do texto para o compositor. A captura lê de
  `metadata.compositor.papel`, do nome da camada (`headline`, "Título"…) ou do
  rótulo; o painel deixa escolher na edição.
- `ornamentos[]` — imagens presas ao texto: `lado` (`antes`, `depois`, `acima`,
  `abaixo`), `eixo` (`inicio`, `centro`, `fim`) e deslocamento em px na base
  1080. O `icon` que já existe segue valendo (é o `antes` que o painel edita).
- `destaque` — o estilo da palavra entre [colchetes] (cor, família, itálico),
  capturado de camada rich-text.
- `alturaDeBase` — a altura do canvas onde a combinação foi salva, para o
  compositor converter as frações sem esmagar o ritmo num feed.

Aplicar (`buildComboLayers`) passa a criar os ornamentos no grupo, aceitar texto
por papel e transformar [colchetes] em rich-text quando há estilo de destaque.

### Fase B — o compositor usa combinações

- Os grupos da página de assinatura são lidos como combinações (com elementos).
- Para cada grupo, as **combinações salvas com os mesmos papéis** entram como
  alternativas (rodízio pela chave da peça, bônus para tema no nome). Só entra
  combinação em que TODO texto tem papel — as do catálogo base ficam de fora até
  serem revisadas.
- Estilo, vão vertical e elementos vêm da combinação escolhida; o compositor
  continua decidindo a posição pela foto, o corte, a logo, o gradiente e a régua.
- Papel com vários textos na combinação (Local + Horário) recebe uma linha da
  copy por texto, casando endereço com endereço e horário com horário.
- Os elementos são posicionados DEPOIS do autofix, presos à tinta final do texto.
- O diagnóstico registra a combinação usada por grupo; a recomposição a mantém.

### Fase C — os dados

- Cada cliente: dar papel às combinações existentes, reestilizar as do catálogo
  base na marca e criar variações que cubram os conjuntos de papéis da usina
  (manchete; pré + manchete; manchete + apoio; manchete + CTA; manchete + serviço;
  pré + manchete + apoio + CTA; …) em alinhamentos diferentes, com os elementos da
  marca. Folha de contato por cliente antes de gravar.
- Quintal: combinações capturadas das 3 artes-modelo recriadas no editor.

### Fase D — no ar

Junto com o PR do gradiente e destaque, depois da revisão das amostras.
