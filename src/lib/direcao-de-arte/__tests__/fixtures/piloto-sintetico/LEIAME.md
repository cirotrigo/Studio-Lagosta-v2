# Fixtures do piloto sintético — clientes reais PSEUDONIMIZADOS

Esta pasta recebe `cliente-NN/assinaturas.json` (as páginas do template "Assinatura", `Project.assinatura`, as logos e as
candidatas do véu de cada cliente, com o NOME trocado por `cliente-NN` e nenhuma URL real), gerados em dois passos, uma vez:

1. `npx tsx scripts/fixtures/exportar-piloto-sintetico.ts --cliente <id> [--cliente <id>…] <pasta-dos-exports>` — o EXPORTADOR
   de leitura: conecta SÓ pelo `.env.development.local` (o branch de desenvolvimento do Neon); lê o `.env` SÓ para a identidade
   da produção e é FAIL-CLOSED (`guarda-do-exportador.ts`: sem `.env`, sem URL parseável nele, ou com o mesmo compute no dev —
   pooled, direto ou em maiúsculas — aborta); transação `READ ONLY`; escreve JSON + PNGs das logos na pasta local.
2. `npx tsx scripts/fixtures/gerar-fixtures-do-piloto-sintetico.ts <pasta-dos-exports> <esta pasta>` — o GERADOR, OFFLINE (sem
   banco, Blob, Drive nem rede): re-codifica cada PNG com o sharp (sem metadado) e pseudonimiza por PROJEÇÃO DE ESQUEMA
   (`pseudonimizar.ts`: só sobrevive o que o esquema conhece — números, cores, enums, fontes; texto → copy sintética pelo papel;
   `name`/`id` → papel ou `camada-N`; `fileUrl` só no topo da camada → token `fixture:*` com bytes obrigatórios; `tags` só das
   conhecidas; toda string sob chave fora do esquema é DESCARTADA e listada, e chave que identifica ou foge à forma cai com o
   valor; nenhum fragmento do nome do cliente sobrevive) e RECUSA a saída se sobrou URL, nome, identificador, texto sob chave não prevista ou PNG
   com metadado; a tabela nome ↔ NN fica em `human-output/`, fora do repositório. O piloto recusa fixture
   cuja camada aponte para um token sem arquivo.

**Hoje a pasta está vazia de propósito**: a lista de clientes é a decisão 5.2 do owner (contrato
`docs/PLANO-2026-10-17-PILOTO-SINTETICO-CONTRATO.md`), e as logos/assinaturas identificam a marca (pseudonimização, não
anonimização). Enquanto isso o piloto roda com `cliente-00` (assinatura sintética limpa) e `cliente-fixture` (a assinatura
anonimizada de 13/10) — e o resumo diz isso ao lado do veredito.

Formato de `assinaturas.json` (o que `suporte/fixtures-de-clientes.ts` lê — cada cliente entra com os PRÓPRIOS ativos):
`{ "clienteId": "cliente-NN", "numerosDoProjeto": <Project.assinatura pseudonimizado>, "paginas": [<name, tags, width, height,
background, layers, order>], "logos": [{ "fileUrl": "fixture:logo-<k>", "isProjectLogo": true }], "arquivos": { "fixture:logo-<k>":
"<png em base64>" }, "candidatasDoVeu": ["#..."] }`.
