---
name: revisar-copy
description: >
  Monta a página de revisão de copy de stories para qualquer cliente do Studio Lagosta. É o padrão aprovado
  pelo Ciro em 15/09/2026: prévia 9:16 com as fontes, cores, margens e logo da assinatura, medidor de largura
  por linha, avisos do DNA, confirmação de mecânica de campanha e aprovação salva no banco da página. Use SEMPRE
  que for criar ou propor os textos de stories, antes de compor, gerar arte, animar ou agendar ("escreve a copy
  dos stories do TERO", "propõe os textos da semana", "quero aprovar as copies antes das artes", "copy dos
  stories animados da Real"). Use também para ler o que foi decidido ("o Ciro já revisou a página de copy?").
---

# Revisar copy de stories

Nenhuma arte, composição ou animação de story sai antes de a copy passar por esta página e de o banco dela
ser lido. A página vem antes da leva: é mais barato o Ciro mudar uma linha aqui do que refazer 15 peças.

- Gerador: `scripts/revisao-de-copy/montar-pagina.ts` (+ `modelo.html`).
- Formato do JSON e exemplo completo (10 clientes): `scripts/revisao-de-copy/exemplo-carteira.json`.
- Gabarito publicado a partir desse JSON: https://claude.ai/artifact/2HLoKgLQdy2BdJKMSWMrto
- Origem: página "Copy dos Stories da Real" (15/09/2026), feita à mão para os stories com motion da Real.
  Ela usa os campos `pre`/`linha1`/`linha2`/`cta`. As páginas deste gerador usam os papéis da assinatura.

## 1. Levantar (grátis, nada é criado)

1. `listar-clientes` → o `projectId`.
2. `consultar-dna`: tom, construções e palavras vetadas, CTAs e pré-títulos aprovados e as "Regras aprendidas
   na prática". O DNA é a lei da forma.
3. `consultar-base`: fatos (horário, cardápio, unidades) e campanhas, com a validade conferida contra a data
   da peça. Preço, horário, data ou mecânica só com a entrada da base.
4. `ver-assinatura`: as variantes de story e os papéis de cada uma (`pre`, `headline`, `headline2`, `apoio`,
   `servico`, `cta`). A variante decide quais campos a página mostra.
5. Foto de cada story: `buscar-fotos`. Numa leva real a foto da prévia é a proposta, então busque sem
   `explorando`. Só use `explorando: true` para exemplo ou conferência. Em story de vídeo, use o quadro do
   plano onde o texto entra (`arquivo` local).

## 2. Escrever o JSON

Uma leva por arquivo, fora do repositório (scratchpad ou a pasta de trabalho do cliente). Campos:

- `pagina`: `titulo` (nome curto, ex.: "Copy dos Stories do TERO"), `subtitulo`, `descartados` (o que ficou
  de fora e por quê). `exemplo` só em página de gabarito.
- `clientes["<projectId>"]`: `proibidas` é OBRIGATÓRIO e sai do DNA, com `[]` quando não houver. `ctas` e
  `preTitulos` são opcionais: viram sugestão no campo, e o CTA fora da lista é acusado.
- `campanhas[]`: `slug`, `projectId`, `titulo`, `resumo` lido na base, `perguntas` que a base não responde.
- `stories[]`: `id` (letras, números, `_ . ~ : @ + -`; vira o documento do banco), `projectId`, `titulo`,
  `uso` (vira filtro), `variante` (id da página de assinatura, ou trecho único do nome), `foto`
  (`driveFileId` | `url` | `arquivo`, + `rotulo`), `copy` por papel (quebra de linha com `\n`, destaque com
  `[colchetes]`), `origem` por papel, `fatos`, `campanha`, `confirmar`, `nota`, `ficha`, `permitir` (palavra
  vetada liberada só nesta peça, como "sorvete" no Dia do Sorvete), `posicao`/`alinhamento` (forçam o lugar do
  texto, como a faixa calma medida num vídeo).

Regras da copy, que a página confere:

- Nunca inventar preço, horário ou promoção. Dado sem `fatos` vira aviso.
- Mecânica de campanha só depois de confirmada no quadro da campanha. As peças ligadas a ela ficam com aviso até lá.
- Poucos textos por story. Acima de 25 palavras vira aviso.
- Pré-título pequeno e claro, sem `[colchetes]`. A cor de destaque vai na manchete e no CTA. No apoio, só a
  palavra que carrega a informação, como pede o DNA de 01/09.
- A caixa da arte é a da string. `CAIXA_DA_MANCHETE` (natural/alta) é conferida, salvo quando a assinatura já
  põe o papel em caixa alta.
- Entrelinha justa: cauda de Q, Ç, g, j, p, y numa linha que tem outra embaixo vira aviso.
- Os blocos se leem como uma frase só, e o pré-título pode terminar no conector que puxa a manchete.
- Campos são opcionais: escreva a mensagem e distribua. Texto em papel que a variante não tem aparece
  marcado e com aviso, porque o compositor o recusaria. Troque a variante ou o campo.
- Linha que passa da coluna útil do compositor (1080 − 2 × margem) sai com a fonte menor. Abaixo de 80% ela
  não cabe e é recusada pelo compositor.

## 3. Montar

Na raiz do repositório (em worktree, antes: `ln -sfn <repo>/.env .env` e
`ln -sfn <repo>/prisma/generated prisma/generated`, desfeitos no fim):

```bash
npx tsx scripts/revisao-de-copy/montar-pagina.ts <propostas.json> --saida <scratchpad>/copy-stories-<cliente>.html
```

Só leitura: o gerador lê a assinatura, as fontes, a logo e as miniaturas do Drive e não grava nada. Ele
imprime, por cliente, as variantes, as fontes embutidas e a fonte que a assinatura usa sem arquivo
cadastrado (em 15/09/2026, o pré-título do Bacana pede Montserrat). O teto é 16 MB. Uma página com a carteira
inteira e 21 stories deu 7,8 MB. Passou disso, faça uma página por cliente.

Conferência: o painel Browser não abre `file://`. Use o Chrome headless, uma captura só:
`"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --window-size=1280,2900 --virtual-time-budget=12000 --screenshot=<png> file://<html>`.

## 4. Publicar

Carregue as skills `artifact-design` e `artifact-capabilities` e publique com `Artifact`:
`capabilities: { db: {} }`, favicon e uma frase de descrição. É um artifact novo por leva. Não republique nem
escreva no banco de uma página que o Ciro pode estar revisando sem ele pedir. Mande o link e diga o que
precisa de resposta primeiro: a mecânica da campanha e os nomes a confirmar.

## 5. Ler antes de seguir

Com `ArtifactData`, liste a coleção `stories` e os documentos `campanha/<slug>`. Só a story mexida tem
documento: sem documento, vale a proposta do JSON e ela continua pendente.

- `status: aprovado` → produzir com o texto do DOCUMENTO, que pode ter sido editado, nunca com o do JSON.
- `status: mudar` → ler o `comentario`, reescrever, remontar e republicar no MESMO arquivo, para manter a URL e o banco.
- `status: descartado` → fica fora da leva.
- Campanha sem `confirmada: true` → nenhuma peça ligada a ela vai para produção.
- Copy final diferente da proposta → comparar e propor regra de DNA com antes e depois, gravando só com confirmação.

## Armadilhas já pagas

- `set` substitui o documento inteiro, e `update` exige que ele exista. A página grava uma escrita por vez por
  documento, com pausa de 700 ms. `onSnapshot` só preenche o campo que não está em foco.
- Fonte entra como data URI, porque o artifact só aceita folha de estilo do Google Fonts. As famílias levam o
  prefixo do projeto (`p5-Montserrat`), senão a Montserrat do TERO mascararia a que falta no Bacana.
- A miniatura do Drive é assinada e expira. O gerador a baixa e embute, nunca passa a URL para a página.
- O Blob responde 403 com desafio anti-bot quando recebe idas demais seguidas. O gerador espera e tenta de novo uma vez.
