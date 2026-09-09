# Escolha conjunta de foto e assinatura — piloto opt-in

Implementado em 09/09/2026 a partir do ensaio MCP documentado no checkout original em `docs/investigacao-mcp-editor-2026-09-09/`. TERO, Quintal e Real inspiram os casos de regressão; os testes usam dados sintéticos e dependências simuladas, não cópias atuais de suas assinaturas nem evidência de aprovação estética.

## Antes e depois

Antes, o compositor recebia uma foto e escolhia uma variante por papéis, tema, luz média e rodízio. Um papel ausente podia ser eliminado com aviso. A leitura de assunto esperava uma caixa normalizada, mas o catálogo v3 guarda um nome textual nesse campo. A conversão da caixa legada ignorava proporção e corte.

Agora, `compor-arte` aceita opcionalmente `fotosCandidatas`, até três driveFileIds já curados, na ordem de relevância da busca. Compara até seis pares foto/variante do formato solicitado, monta e mede a copy com as fontes reais e usa a régua de contraste existente antes de persistir a escolhida. A resposta e o diagnóstico persistido incluem `selecao`: combinações, impedimentos, pontuação, limite e indicação de interrupção. Sem candidata utilizável, `SEM_COMBINACAO` devolve motivos e, quando disponíveis, orçamentos de texto.

A foto explícita (`fotoDriveId`/`fotoUrl`, ou `foto` na spec interna) prevalece sobre a lista. A variante explícita restringe a seleção. Âncora, alinhamento, enquadramento fixo e canto da marca são preservados. A seleção é opt-in pela presença de `fotosCandidatas`; o fluxo de uma foto continua disponível. Em todos os fluxos, papéis pedidos e ausentes agora causam `PAPEIS_INCOMPATIVEIS` antes da persistência. Uma variante explícita inexistente também deixa de cair silenciosamente em outra.

```json
{
  "projectId": 2,
  "formato": "story",
  "fotosCandidatas": ["<id-curado-1>", "<id-curado-2>"],
  "blocos": [
    {"papel": "headline", "linhas": ["Quarta no", "Quintal"]},
    {"papel": "servico", "linhas": ["<horário e condições confirmados>"]}
  ]
}
```

Exemplo de contrato, não autorização de criação ou publicação. O campo não foi adicionado ao contrato de `compor-leva` nesta entrega; a estrutura da fila e a orquestração semanal não mudam.

## O que foi reutilizado

- `ranquear-acervo`: relevância lexical/semântica, qualidade, destaques, escolhas e aprendizado continuam ordenando a busca. Não foi criado outro buscador nem outra análise por IA.
- `acervo`: uma leitura por seleção reaproveita preço legível e marca de terceiro; essas fotos recebem impedimentos explícitos nesta seleção conservadora. Metadados ausentes não equivalem a ausência desses elementos.
- `assinatura`: páginas aprovadas do formato e seus papéis. Não se escreve DNA nem se modifica a assinatura.
- `compor`, `blocos`, `mapa-de-calma` e `regua`: encaixe medido, escala, posições, recortes, contraste e autofix. `somenteAvaliar` é opção interna, não campo MCP: para antes de criar pasta, exportar prova, salvar página ou registrar uso da foto.

As tentativas percorrem as variantes na ordem do editor e todas as fotos antes de avançar à próxima variante. Empates preservam a ordem curada das fotos. O score geométrico e a redução tipográfica ordenam apenas pares sem impedimentos; contraste ausente/reprovado e papéis ausentes não são compensados por pontos.

## Segunda voz e halo

Se a assinatura escolhida contém `headline2` e a headline tem duas ou mais linhas, a última linha recebe a segunda voz automaticamente. Com uma linha, ou sem `headline2`, permanece a voz principal. Nunca enviar `headline2` como papel da spec. Esse comportamento já existia e está coberto por regressão de composição.

Quando a página define fundos de texto, os valores aprovados de halo são preservados, inclusive opacidade. A régua só mede. Quando nenhum papel define fundo, permanece a calibragem existente dentro das faixas da assinatura. A seleção não altera os números para fazer uma combinação passar.

## Custos e limites reais

Máximo de três fotos distintas e seis tentativas, mais a composição final da escolhida. Uma janela de 30 segundos impede iniciar novas tentativas após o prazo; **não cancela uma operação em andamento** e não é SLA de duração total. Downloads e dimensões da foto são reutilizados entre tentativas e na composição final. As caixas do catálogo também são reutilizadas. Medições, registro de fontes e renders locais da régua ainda se repetem. Não há chamada de geração paga ou visão nova, mas há CPU, consultas de leitura e rede. `provar` mantém seu contrato existente de exportar a prova final ao armazenamento.

A régua verifica texto, não certifica contraste da logo. A escolha de canto da logo continua sendo a heurística existente. O mapa usa luminância/energia e não sabe identificar prato, rosto, unidade ou campanha. A caixa estimada não é prova de oclusão e apenas penaliza o par, com aviso. A caixa legada, quando válida, agora passa pela transformação cover do corte real; cortes que preservam menos de 75% dela são descartados como posições. Esse limiar conservador precisa de calibração humana. O catálogo v3 textual não fornece uma caixa semântica: não inventamos uma a partir do nome do assunto.

Preço/marca ausentes, catálogo indisponível, enquadramento de ambiente e logo exigem revisão. Fotos fornecidas devem ter sido curadas para unidade, campanha, produto e validade. O sistema preserva os blocos recebidos, mas não consegue detectar uma condição factual que nunca entrou na copy. A seleção não é selo de pronto para publicação.

## Validação local

Testes cobrem seleção com contraste ruim (TERO), serviço e segunda voz (Quintal), escolhas explícitas (Real), limites/deadline, catálogo ausente, preço/marca, régua ausente, transformações cover, preservação do halo aprovado e ausência de persistência nas tentativas. Nenhuma leitura de produção, postagem, agendamento, geração paga, merge ou deploy foi executada.

Comandos:

```bash
./node_modules/.bin/vitest run src/lib/compositor/__tests__ src/lib/creatives/__tests__/ranquear-acervo.test.ts
npm run typecheck
npm run lint
```

Dependências foram acessadas por um symlink ao `node_modules` existente; o cliente Prisma já gerado foi copiado para este worktree para resolver os tipos. Não houve instalação, geração Prisma ou alteração do checkout compartilhado.

Resultado: 9 arquivos de teste, 156 testes aprovados; typecheck aprovado; lint aprovado com avisos preexistentes em outros componentes. Não foi feito benchmark real de latência nem validação visual em navegador/produção.
