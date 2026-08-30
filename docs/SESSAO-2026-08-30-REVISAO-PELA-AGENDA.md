# Sessão 2026-08-30 — Revisão pela agenda: pedido de correção estruturado

Fecha o fluxo que o Ciro descreveu ao revisar a semana 1 do Espeto: *"pela
arte agendada eu gostaria de navegar e propor a foto, dar o feedback e
solicitar a troca da copy... e depois que eu revisar peço para corrigir na
sessão"*. Commits `35fe03ec` (backend) e `65ce6176` (UI).

## O desenho

A peça central já existia: o feedback de arte ("Gostei / Preciso melhorar" +
texto) É a solicitação de correção — gravada por arte, lida depois por
qualquer sessão via `ver-feedback-das-artes`. O que faltava: (a) a barra não
estava na AGENDA, onde a revisão acontece; (b) "propor a foto" era prosa.

- **Backend**: o pedido ganhou `alvo` opcional (`foto`/`copy`/`horario` —
  vocabulário no próprio `feedback-de-arte.ts`, não no `vocabulario.ts`, que
  está em obra na frente de fotos) e `fotoSugerida` estruturada
  (`driveFileId` + nome). "Gostei" posterior LIMPA o pedido — elogiar é
  retirar o pedido. Idempotência compara alvo e driveFileId também. A tool
  `ver-feedback-das-artes` devolve os campos novos — **só a SAÍDA mudou**;
  schema e descrição intactos, snapshot do registro preservado (a outra
  sessão está com `validar-registro-mcp.ts` em obra).
- **UI**: a MESMA barra da galeria/bancada montada na prévia do post da
  agenda (rota e modal compartilham o `PostDetailView`). Chips de alvo em que
  **escolher já grava** (chip é ação completa — regra do "um clique
  resolve"); placeholder acompanha o chip; "Apontar foto do acervo" abre o
  `GoogleDriveInlineSelector` (seleção única, pasta de imagens do projeto via
  `useProject` consultado só com o diálogo aberto) e o clique na foto grava.
  `projectId` é prop OPCIONAL: galeria e bancada seguem como estavam (ganham
  os chips; o botão de foto exige o id, que a galeria global não tem por
  item).

## O fluxo de revisão que fica

1. Abrir a agenda → prévia do rascunho → **Gostei** (aprova a arte para o
   aprendizado) ou **Preciso melhorar** + chip + texto (+ foto apontada).
2. Navegar para o próximo. Nada bloqueia, nada exige Enviar.
3. Ao terminar: numa sessão qualquer, "corrige os feedbacks da semana do X" —
   `ver-feedback-das-artes` devolve cada pedido com alvo, texto e
   `driveFileId` da foto; a sessão refaz pelo canvas e troca a arte do
   rascunho (copy → editar; horário → reagendar).

## Armadilhas e coexistência

- 🔴 **Working tree compartilhada com a frente de fotos**: ~20 arquivos
  modificados sem commit da outra sessão (schema com `PhotoDestaque`,
  `vocabulario.ts` com `MOTIVOS_DE_TROCA_DE_FOTO`, acervo, picker da
  bancada). Esta sessão trabalhou em conjunto DISJUNTO e os commits
  stageram só os próprios arquivos. Os MOTIVOS da F4 (por que trocou) e os
  ALVOS daqui (o que corrigir) são vocabulários DIFERENTES de propósito.
- O tipo de `fotoSugerida` na entrada admite `driveFileId` opcional (o
  `z.infer` com `strict: false` marca toda chave como opcional); a garantia
  é do runtime (`lerFotoSugerida` devolve null sem id).
- Validado contra produção com cleanup (gravação estruturada, idempotência,
  "gostei" limpando o pedido). A conferência VISUAL da barra na agenda fica
  para a primeira abertura real — a tela exige sessão Clerk, fora do alcance
  da verificação headless daqui.

## O que ainda falta desse ciclo

O comando **"atualizar peça"** (proposta 3 do estudo): a sessão corretora
hoje refaz manualmente (extract do canvas → render → trocar arte). Segue
para a semana 2, com a dor real mapeada — e agora recebendo pedidos
estruturados em vez de prosa.
