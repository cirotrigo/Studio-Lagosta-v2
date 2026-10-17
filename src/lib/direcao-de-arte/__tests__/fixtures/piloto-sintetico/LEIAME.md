# Fixtures do piloto sintético — clientes reais PSEUDONIMIZADOS

Esta pasta recebe `cliente-NN/assinaturas.json` (as páginas do template "Assinatura", `Project.assinatura`, as logos e as
candidatas do véu de cada cliente, com o NOME trocado por `cliente-NN` e nenhuma URL real), gerados em dois passos, uma vez:

1. `npx tsx scripts/fixtures/exportar-piloto-sintetico.ts --cliente <id> [--cliente <id>…] <pasta-dos-exports>` — o EXPORTADOR
   de leitura: conecta SÓ ao branch de desenvolvimento do Neon (`.env.development.local`; confere o compute contra a produção e
   aborta se for o mesmo, ou se o arquivo não existir), sessão `default_transaction_read_only=on`, e escreve JSON local.
2. `npx tsx scripts/fixtures/gerar-fixtures-do-piloto-sintetico.ts <pasta-dos-exports> <esta pasta>` — o GERADOR, sem banco:
   pseudonimiza (a tabela nome ↔ NN fica em `human-output/`, fora do repositório), troca URLs por tokens `fixture:*` e grava as
   logos pixel a pixel.

**Hoje a pasta está vazia de propósito**: a lista de clientes é a decisão 5.2 do owner (contrato
`docs/PLANO-2026-10-17-PILOTO-SINTETICO-CONTRATO.md`), e as logos/assinaturas identificam a marca (pseudonimização, não
anonimização). Enquanto isso o piloto roda com `cliente-00` (assinatura sintética limpa) e `cliente-fixture` (a assinatura
anonimizada de 13/10) — e o resumo diz isso ao lado do veredito.

Formato de `assinaturas.json`: `{ "clienteId": "cliente-NN", "numerosDoProjeto": <Project.assinatura>, "paginas": [<Page da
assinatura com layers, tags, width, height, background, name>], "logos": [{ "fileUrl": "fixture:logo-<k>", "isProjectLogo": true }],
"arquivos": { "fixture:logo-<k>": "<png em base64>" }, "candidatasDoVeu": ["#..."] }`.
