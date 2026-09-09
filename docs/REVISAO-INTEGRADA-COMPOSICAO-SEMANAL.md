# Revisão integrada: seleção e retomada semanal

09/09/2026. Branch isolado `codex/foto-assinatura`.

- Seleção inicial preservada: `e9cdfe6a`.
- Retomada original `669e0baa4c945c0a5ce8304a084ac47af1a0f895`, incorporada por cherry-pick sem conflitos como `6892e362`.
- Esta revisão conecta os contratos e corrige as lacunas abaixo. Não houve merge no main, deploy ou mudança no checkout compartilhado.

## Caminho integrado

`ItemDePlano.fotoCandidatas` → `montarSpecDoItem` → `spec.fotosCandidatas` → transação de enfileiramento → payload do job COMPOR → seleção limitada → composição final → fechamento da mesma Generation → callback protegido do item.

A proposta semanal já armazenava as candidatas do card; o executor não as encaminhava. Agora usa o parser defensivo existente, remove ids repetidos e limita a três, preservando a ordem. Não busca fotos novamente nem altera reservas semanais. `compor-leva` também aceita `fotosCandidatas` em cada item, junto das preferências explícitas existentes.

**Foto preenchida no card continua explícita.** A proposta grava também a foto que escolheu automaticamente, e o item não distingue sua origem de uma escolha humana. Por isso a conexão conserva essa foto e compara variantes para ela. Só um item sem `fotoDriveId`/`fotoUrl` permite escolher entre alternativas. Não se inferiu consentimento para substituir a foto do card. Sem candidatas persistidas, permanece o fluxo anterior. Preferências de variante/posição podem ser enviadas por `compor-leva`; o modelo do item semanal não oferece um campo próprio de preferências de composição e esta entrega não inventa essa configuração nem interpreta `sourcePageId` como assinatura.

## Revisão durável e composição final

A revisão inclui as candidatas persistidas, além do conteúdo que já era comparado. O payload mantém a spec de entrada com candidatas; a arte final registra a spec resolvida (foto/variante escolhida) e o diagnóstico. A reutilização consulta a spec **do job**, não o `fieldValues.spec` da arte, evitando que resolver a seleção pareça uma revisão nova.

As tentativas de avaliação não recebem o generationId da fila nem persistem. A reentrada final mantém generationId, autor e vínculos de plano/item, e fecha a Generation já criada. Um teste isola esse encaminhamento com seleção/persistência simuladas. Outro acompanha entrada → job → runner → retomada usando um banco e compositor falsos. Eles não demonstram persistência PostgreSQL real nem renderização visual real.

## Defeitos corrigidos

1. O mapeamento semanal podia cortar copy excedente ou retirar um serviço sem papel antes da validação. O executor agora usa o modo estrito do mapeador: devolve erro com os textos sem papel. A heurística ainda distribui a copy por posição e reconhecimento de horário/endereço; não certifica fatos nem recupera condição ausente da entrada.
2. `SEM_COMBINACAO` e `PAPEIS_INCOMPATIVEIS` não estavam na lista de falhas determinísticas e seriam repetidos sem reparo. Agora encerram a tentativa com diagnóstico. Falha de download/infraestrutura ou ausência da régua fica como `SELECAO_INDISPONIVEL` e usa as tentativas limitadas da fila. Não há laço de geração paga.
3. Conferir o vínculo e depois chamar transições separadas deixava uma janela para sobrescrever edição/nova geração. O callback valida o caminho permitido e faz um único `updateMany` condicionado por id/projeto/plano, geração esperada, estado lido e updatedAt. Se qualquer um mudou, não publica o desfecho no item. A arte antiga pode existir na galeria, mas não substitui o vínculo revisado.

## Concorrência: alcance da evidência

O SQL de enfileiramento usa `SELECT ... FOR UPDATE` no item e cria Generation/job/vínculo na mesma transação. A revisão de código confirma esse desenho. Os testes exercitam resposta perdida, reaproveitamento após conclusão, rollback do adaptador falso, edição entre leitura/escrita, revisão diferente e falhas parciais. **Não foi executado PostgreSQL concorrente; o adaptador falso não prova isolamento, bloqueio ou rollback do banco real.**

O compare-and-set protege este callback contra uma alteração já efetivada antes de sua escrita. Outros escritores e reconciliações conservam seus contratos; esta entrega não unifica todos os locks do sistema. Preparação de pasta continua fora da transação do item. Render/persistência interrompidos continuam sob a recuperação existente: não se promete exatamente uma página em todo ponto de falha. Jobs legados sem revisão, composição avulsa e geração síncrona da bancada não recebem a garantia nova de idempotência por item.

## Limites de seleção no plano

- Continua sendo escolha por item. Não existe reserva atômica de alternativas entre jobs; permitir alternativas sem foto explícita pode exigir revisão de repetição na semana.
- Mudanças externas no catálogo/assinatura não fazem parte da revisão do item. Uma nova tentativa pode avaliar dados externos atualizados; uma arte já pronta não é invalidada automaticamente por isso.
- Até seis combinações; a janela de 30 segundos é verificada entre tentativas e não cancela operações em curso. Não há benchmark de latência real desta integração.
- Logo, unidade, validade de campanha e assunto semântico exigem revisão humana. Passar a régua de texto não aprova publicação.

## Verificação

```bash
./node_modules/.bin/vitest run src/lib/compositor/__tests__ src/lib/planos/__tests__ src/lib/creatives/__tests__/ranquear-acervo.test.ts
npm run typecheck
npm run lint
```

Resultado: **15 arquivos, 402 testes aprovados**; typecheck aprovado; lint aprovado com avisos preexistentes em outros componentes. Testes offline/simulados, sem PostgreSQL, navegador ou benchmark de produção. Nenhuma geração paga, publicação ou agendamento executado.
