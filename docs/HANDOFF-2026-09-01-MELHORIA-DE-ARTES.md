# Handoff — a melhoria de artes com IA (01/09/2026)

Documento de contexto para a sessão que vai desenhar a **evolução da melhoria
de artes para toda a carteira**, não só o By Rock.

Escrito por Claude no fim de uma sessão longa, com 7 consertos no ar e o
defeito principal **ainda não confirmado como resolvido** — o último push saiu
minutos antes deste documento e não foi testado.

---

## 1. O que o Ciro quer (o fluxo-alvo)

Ele já decidiu o fluxo de trabalho e ele está em produção:

1. **A semana é planejada e produzida no CANVAS DE DESIGN** — arte escrita em
   HTML, renderizada com Chrome headless, ingerida por `upload-creative`.
   **Custo zero de IA.** É o padrão para os 9 restaurantes.
2. As artes vão para a agenda como rascunho.
3. **Quando uma peça não agrada, ele pede "melhorar com IA"** — e o papel da
   melhoria é ESTREITO e bem definido por ele:

> "a melhoria com IA apenas diagramar e posicionar melhor os textos e destacar
> as palavras-chave, mantendo toda a identidade — normalmente é isso que é
> necessário, e o canvas de design normalmente erra: às vezes a composição que
> ele faz com os textos não fica boa."

**A melhoria NÃO é para criar arte nova.** Ela recebe uma peça pronta e
rediagrama. Foto, copy e identidade são invariantes.

Isto é o oposto do que o código assumia até hoje de manhã — e é a raiz de
quase todos os defeitos abaixo.

---

## 2. O defeito que originou o dia

Ele pediu "melhorar com IA" **sem escrever nada** e recebeu:

- a fotografia **substituída** (duas taças de vinho viraram bife com chopp);
- **horário inventado** ("Ter a Sex, 17h às 00h" — a casa abre todos os dias
  das 11h à meia-noite);
- **endereço inventado**, em quatro cidades diferentes ao longo do dia: Foz do
  Iguaçu, São José dos Pinhais, Jaraguá do Sul, Porto Alegre e São Paulo. O
  By Rock fica em Vitória/ES.

Medido nas 8 melhorias daquela manhã: **6 alteraram a fotografia**, nos dois
tiers (2 de 3 no `high`, 4 de 5 no `low`) — o tier não era a variável.

---

## 3. Os sete consertos que entraram hoje

Todos na `main`, todos com deploy READY confirmado pela API da Vercel.

| # | commit | causa encontrada |
|---|---|---|
| 1 | `2d430cd4` | **`photoDirection` era a ordem de refazer a foto** |
| 2 | `2d430cd4` | régua por visão quando não há texto no banco |
| 3 | `acd32de2` | arte sem texto (capa) continua sem texto |
| 4 | `d2984421` | a direção de arte sai; a composição volta ao modelo |
| 5 | `965ecd30` | a copy do canvas vira régua (`upload-creative` aceita `textos`) |
| 6 | `0fa78a93` | régua vem da RAIZ da linhagem + array de strings enfim conta |
| 7 | `a801fe7f` | **a régua era pulada no caminho do carrossel** |

### 3.1 A `photoDirection` (o achado principal)

Medida a composição do prompt: dos **27.887 chars**, a identidade da marca
levava 18.333 (66%), e só `photoDirection` levava **8.065 (29%)**. Contra 4
linhas mandando não mexer na foto.

E a `photoDirection` do By Rock diz, textualmente:

> "fotografado sobre a mesa de madeira, com a parede de guitarras desfocada ao
> fundo… o prato é o músico"

É a descrição **exata** da imagem que o modelo produziu. Ele não desobedeceu
regra nenhuma: obedeceu à instrução mais longa do prompt.

`photoDirection` é direção para quem **vai fotografar**. Na melhoria a foto já
existe. Hoje ela só entra quando há ajuste de foto pedido.

⚠️ **O CLAUDE.md já registrava este risco** ("hoje não entra na trilha arte —
se um dia entrar, ela volta a conflitar"). Na melhoria ela sempre entrou.

### 3.2 A direção de arte, e o teste que o Ciro propôs

Ele testou no ChatGPT com um prompt de ~100 chars e disse que funcionou
melhor. Medido, com a mesma peça e o mesmo pedido, 2 rodadas por variante:

| variante | resultado |
|---|---|
| completo (19,8k) | uma quase IDÊNTICA à origem, outra ALTEROU a foto |
| só o pedido (100) | composição muito melhor, mas **perdeu a marca** (tipografia dourada, sem logo, e uma rodada inventou a marca "VINHO SONS") |
| simples (491, ditado por ele) | foto e copy intactas, composição variada, **na marca** |

Conclusão: **os 20 mil chars não eram gordura — a gordura era a
`photoDirection` e a direção de arte.** A identidade é o que segura a marca.

Saíram os ~5.200 chars do `DEFAULT_ART_DIRECTION`; entrou uma seção
`[A TAREFA]` de 439 chars que devolve a composição ao modelo. É a mesma lição
que a trilha `arte` registrou em 17/08 ("prescrição de POSIÇÃO compete com a
leitura da foto") e que fez nascer o modo livre lá.

**Prompt hoje: 15.439 chars** (identidade 66%, regras da casa 30%, tarefa 3%).

### 3.3 A régua de texto — três camadas

Arte do canvas não tem `slotValues`, então `expectedTexts` chegava vazio, a
seção `[TEXTO EXATO — VERBATIM]` sumia do prompt e o modelo **lia o serviço da
própria imagem**, completando o que não entendia.

Ordem de precedência implementada:

1. `expectedTexts` do banco (`slotValues`, `texts`, `textos`, `textosLivres`);
2. **a raiz da LINHAGEM** (`loadExpectedTextsDaLinhagem`, até 8 saltos) — a
   copy verdadeira está na arte do canvas, e melhorar-uma-melhoria é o caso
   comum (o Ciro encadeou 5 elos);
3. **transcrição por VISÃO** da arte de entrada (`transcreverTextosDaArte`).

⚠️ A ordem importa: a origem IMEDIATA de uma cadeia longa **já carrega o dado
inventado**. Transcrever o 4º elo congelaria "Rua Gomes de Carvalho, São
Paulo". Por isso a linhagem vem antes da visão.

### 3.4 O último bug (e o mais instrutivo)

Depois de 4 rodadas de teste dele com o defeito persistindo, a causa estava no
payload do job: **`skipTextVerification: true`**.

Ele melhora o **slide 2 de um carrossel pela agenda**. A regra de 29/07 marca
essa flag quando o slide não é a arte da Generation de origem (para não
reprovar o slide 3 contra os textos do slide 1). Eu condicionei **as duas
buscas de régua** a essa flag — então elas nunca rodavam no caminho que ele
usa.

E o defeito **não deixava rastro**: o ramo de "sem régua" vinha antes do ramo
do skip e gravava `textCheckReason: "sem texto esperado na Generation
original"`. Li essa mensagem três vezes como diagnóstico. Só apareceu ao ler o
`GenerationJob.payload`.

🔴 **Lição para quem continuar: não confie no `textCheckReason`. Leia o
payload do job.**

---

## 4. O que NÃO está resolvido

- 🔴 **O conserto nº 7 não foi testado.** Foi para a `main` (`a801fe7f`)
  minutos antes deste documento. O Ciro testou 4 vezes e falhou 4 vezes; esta
  é a 5ª tentativa e ninguém confirmou.
- **Só o By Rock tem a copy do canvas gravada.** O backfill de 54 artes usou o
  `dados.py` daquela leva. Os outros 8 clientes não têm — para eles a régua
  cai na visão, que é mais frágil.
- **`upload-creative` aceita `textos`, mas nenhuma skill os passa.** O canvas
  gera a copy e o upload a descarta. Enquanto isso não mudar, toda leva nova
  nasce sem régua.
- **A conferência de texto não pega texto A MAIS.** `verifyImageTexts` checa se
  o esperado ESTÁ presente; não há regra contra o que foi acrescentado. Já
  estava registrado no CLAUDE.md sobre os tiers baratos; hoje virou endereço de
  outro estado.
- **Um post ainda com o defeito**: quarta 02/09 às 15h, `SCHEDULED`, com a arte
  que a IA alterou. A troca exige voltar a rascunho e reaprovar.

---

## 5. O que a sessão nova precisa decidir

O pedido do Ciro: **um plano para a evolução da melhoria de artes de TODOS os
clientes**, deixando o fluxo redondo.

Perguntas em aberto que valem a pena:

1. **A régua deveria vir do canvas por construção?** O gerador da leva conhece
   a copy exata. Hoje ela se perde entre o `dados.py` e o `upload-creative`.
   Fechar esse fio resolve os 9 clientes de uma vez, e é mais forte que
   qualquer transcrição por visão.
2. **O `images.edit` do gpt-image regenera a imagem inteira** — não existe
   "editar só o texto". Toda melhoria é uma nova geração condicionada. Vale
   investigar se há caminho que preserve pixels (inpainting com máscara,
   compor o texto por código sobre a foto original, ou até rediagramar no
   próprio canvas em vez de na IA).
3. **O canvas erra a composição de texto** — é o motivo de existir a melhoria.
   Talvez parte disso se resolva no gerador (é determinístico e de graça) em
   vez de na IA.
4. **Falta conferência de texto A MAIS.** A transcrição já volta do
   verificador; a regra caberia ali.
5. **Tier**: hoje o padrão é `low` (US$ 0,008) e sobe para `high` quando há
   ajuste de foto. Medido em 12/08 na trilha `arte`, **não** na melhoria.

---

## 6. Arquivos-chave

| arquivo | papel |
|---|---|
| `src/lib/ai/creative-improvement-runner.ts` | o pipeline da melhoria |
| `src/lib/ai/creative-improvement-service.ts` | validação, créditos, criação da Generation |
| `src/lib/ai/openai-image-client.ts` | `buildPromptSections` — a montagem do prompt |
| `src/lib/ai/regras-da-melhoria.ts` | as regras da casa (9 regras, cada uma de um defeito medido) |
| `src/lib/ai/creative-text-verification.ts` | régua, linhagem, transcrição, conferência |
| `src/lib/creatives/arte-enviada.ts` | `importarArte` — onde a copy do canvas entraria |
| `src/components/creatives/improve-creative-modal.tsx` | os dois campos (arte / foto) |
| `scripts/medir-fidelidade-da-melhoria.ts` | a bancada de medição (dry-run; `--confirmar` gasta) |
| `design-canvas/_halo.py` | o halo, com o manual de portabilidade |
| `docs/SESSAO-2026-08-25-CANVAS-DE-DESIGN.md` | o manual do canvas (seção 4 = armadilhas) |

---

## 7. Método que funcionou (e o que não funcionou)

**Funcionou:**
- Medir a composição do prompt em caracteres por seção. Foi o que revelou a
  `photoDirection` a 29% do total.
- Ler o `GenerationJob.payload` em vez de acreditar no `textCheckReason`.
- Rodar a função isolada (`transcreverTextosDaArte`) contra a arte real: provou
  que o código estava certo e o problema era outro.
- Comparar variantes de prompt lado a lado, na MESMA peça e proporção.

**Não funcionou, e custou rodadas:**
- Supor que instrução de prompt resolveria (a regra de fidelidade estava no ar
  e o modelo trocou a foto assim mesmo).
- Uma métrica automática de "quanto a foto mudou" por diferença de pixels: ela
  mistura troca de foto com rediagramação e não separa nada.
- Testar com a proporção errada (story gerado em tamanho de feed) — invalidou
  6 gerações.
- Concluir de n=1.
