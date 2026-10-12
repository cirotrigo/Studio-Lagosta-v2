# Pesquisa: Studio Lagosta como editor operável por IA

Programa de pesquisa e desenvolvimento iniciado em 12/10/2026. A pergunta de fundo é que
comportamentos de plataformas como Figma, Canva, mLabs e CapCut valem a pena para o Studio. Eles
são estudados por observação, nunca por cópia de código.

O ciclo de cada pesquisa:

```text
observação → evidência → especificação funcional → design próprio → implementação → testes → revisão independente
```

## Estado em 12/10/2026

| Etapa | Situação |
|---|---|
| Auditoria da arquitetura atual | Concluída, sobre `f509b0fd` (linhas conferidas em `137a1e7e`) |
| Gap analysis e proposta de fundação | Concluídas. A arquitetura alvo é **proposta, ainda não implementada** |
| Revisão adversarial do Codex | Feita: **needs-attention**, com 4 achados validados e incorporados |
| Correção de segurança achada na auditoria (`projectHint`) | Mergeada no PR #202. Os dois LOWs da verificação foram para o **P1**: a `prepare-creative` legada do stdio e o `ProjectScope` explícito |
| Ferramenta de pesquisa externa (REA) | **Preparada, mas não necessária agora** (ver abaixo) |
| Implementação | Planejada em fases (PR A: fundação aditiva; PR B: adoção). Não iniciada |

## Documentos

| Arquivo | O que tem |
|---|---|
| [studio-current-architecture.md](studio-current-architecture.md) | O código atual: editor, gravação, vias de preenchimento, `aplicarAjustes`, semântica, templates, marca, conteúdo, agenda e MCP |
| [studio-ai-editor-gap-analysis.md](studio-ai-editor-gap-analysis.md) | Lacunas contra os quatro objetivos, com P0/P1/P2 revistos |
| [studio-target-architecture.md](studio-target-architecture.md) | A menor fundação revista: `semanticRole` × `slotId`, cardinalidade esperada, gravação, vias, executor, prioridades e a adoção em fases |

## Primeira pesquisa REA: não necessária agora

A pergunta candidata era o que o Canva preserva e o que recalcula quando a imagem de um modelo é
trocada (o contêiner e o crop). Ela foi reavaliada:

- **A. Alguma decisão está bloqueada?** Não. A regra de troca de imagem do Studio pode ser
  decidida sem ela.
- **B. Dá para adotar uma política própria, razoável e testável?** Sim: zerar o crop manual,
  aplicar `cover` centralizado (ou o foco por assunto, onde existe) e preservar o contêiner. Ela
  é testável com caracterização sobre `Layer[]`.
- **C. A documentação pública basta?** Para essa decisão, provavelmente sim. As ajudas do Canva e
  do Figma descrevem trocar a imagem num frame e reenquadrar. HIPÓTESE: não foi conferido nesta
  rodada.
- **D. O que o REA mudaria?** No máximo um detalhe (manter ou não o ponto de foco), que é
  ajustável depois e não muda a arquitetura.

**O ambiente de pesquisa já está pronto, sem uso por enquanto:**

- o REA 6.4.0 está registrado como MCP no Claude Code, só para o usuário;
- um Chrome isolado, com perfil próprio e porta de depuração só em `127.0.0.1:9222`, foi validado
  ponta a ponta numa página neutra;
- o Hopper não foi ativado, e Ghidra e IDA não foram instalados;
- nada disso é dependência do Studio.

**Conclusão: REA NÃO NECESSÁRIO AGORA.** A primeira pesquisa externa deve esperar uma pergunta
cuja resposta mude uma decisão. A candidata mais provável é o redimensionamento entre formatos
(P2), quando ele entrar na fila.

## Regras desta pasta

- **Rótulos:** toda afirmação leva CONFIRMADO NO CÓDIGO, INFERIDO ou DESCONHECIDO. Nas
  descobertas externas, os rótulos são CONFIRMADO POR EVIDÊNCIA, INFERÊNCIA FORTE, HIPÓTESE ou
  DESCONHECIDO. Inferência nunca vira fato.
- **Fonte de verdade:** os números de linha são do commit auditado e envelhecem. A fonte de
  verdade é o código.
- **Regras do repositório:** o que for decidido aqui e virar regra vai para
  `docs/regras/<area>.md`, como manda o `AGENTS.md`.
- **Pesquisa externa (REA):** segue as regras clean-room. Nada de código proprietário, bundles,
  credenciais, tokens ou contorno de autenticação. As regras e as descobertas ganham pasta
  própria quando a primeira pesquisa for executada.
- **Antes do REA, a documentação pública.** Engenharia reversa só quando ela responder algo que a
  documentação não responde e que muda uma decisão.
