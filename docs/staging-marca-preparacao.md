# Preview sintético da Marca

Este runbook descreve o isolamento de um Preview dedicado ao smoke da Marca. Use somente dados fictícios e recursos de teste aprovados. Identificadores de contas, endpoints reais, recibos de execução e credenciais ficam fora do repositório.

## Runtime e migrations

O deployment Preview recebe **duas URLs de staging_runtime**: DATABASE_URL pooled e DIRECT_URL direct do mesmo endpoint, database, schema e role restrita. DIRECT_URL continua necessária ao datasource Prisma, mas não fornece acesso DDL. O build Preview gera Prisma e compila sem executar migrations.

Somente o executor separado recebe **duas URLs de staging_migrator**: pooled/direct do mesmo endpoint, database, schema e role de migrations. O segredo DDL fica nesse executor efêmero e nunca no deployment. Não misturar runtime/migrator entre as URLs de um contexto.

A policy commitada usa approvedDestinations para runtime e approvedMigrationDestinations para executor. Ambas as listas e approvedProjectIds começam vazias. Tupla exata endpoint+database+role+schema, Neon/TLS e distinção da Production são obrigatórias. Uma role não pode ser aprovada nos dois contextos. Flags ou JSON de ambiente não aprovam destinos. Preflight ocorre antes de subprocessos ou conexão.

O comando db:preview:deploy exige o executor separado aprovado e recusa ambiente hospedado. db:deploy recusa Preview. Não usar raw migrate ou scripts alternativos que ignorem os guards.

## Provisionamento e autenticação

1. Confirmar escopo, orçamento, duração e autorização dos recursos. Criar branch schema-only e database vazio com TEMPLATE template0, preservando o schema copiado. Restringir compute e definir expiração; autosuspend e auto-delete não são teto financeiro.
2. Criar roles SQL separadas, sem privilégios administrativos, com validade limitada. Inicializar e definir senhas pelo fluxo privado aprovado. Não presumir que Console Reset inicializa uma role sem senha. Não habilitar LOGIN antes de confirmar senhas definitivas e reler flags/memberships. Não elevar roles ou trocar owner para resolver conexão.
3. Criar aplicativo Clerk Development independente, sem OAuth/webhooks no smoke, e usuário pessoal de teste sem organização. Login no dashboard administrativo não fornece o userId do aplicativo.
4. Usuário preenche URLs runtime e keys Clerk test somente no escopo Preview aprovado. URLs migrator somente no executor separado. Sem secrets em chat, log, patch, query SQL histórica ou arquivo rastreado; não env pull. Conferir ausência de herança de credenciais Production e provedores.

Schema-only pode copiar funções, defaults, triggers e outras definições. Não consultar conteúdo de clientes, corpos de funções, opções de FDW ou senhas. Não conectar a aplicação ao schema copiado, restaurar a partir da principal, fazer db push/reset ou baseline arbitrário.

## Bootstrap e replay

No database vazio, o owner pode instalar vector0.8.0 se o catálogo confirmar a versão como trusted e o owner tiver CREATE no database. Não conceder neon_superuser ao runtime ou migrator. Defaults de outra role são configurados pelo executor administrativo existente, com autoridade apropriada, sem novo grant. Conferir role/database efetivos antes de cada bloco.

Aplicar as 43 migrations preservando histórico/checksums; confirmar lock_timeout e statement_timeout na conexão efetiva. Defaults de role/database valem em novas conexões; SET ROLE não os aplica. Conferir readback, drift, índices HNSW e subtitleFontFamily TEXT nullable sem default. Replay PostgreSQL 15 local não certifica Neon 17. Não pular extensão ou migrations; estimativa n_live_tup não prova ausência de linhas.

Semear apenas projeto/identidades fictícios aprovados. Project.userId e User.clerkId usam o ID Clerk; User.id interno é distinto. Sem tokens, URLs remotas, clientes, posts ou jobs. Voz permanece PRÉVIA: migradaEm/dnaArquivado nulos e DNA legado preservado. Após replay/fixtures, aplicar grants restritos de leitura e escrita das colunas da prévia BrandVoice; sem DDL, ativação, snapshot, DNA, jobs ou DELETE.

Tuplas/projectId só entram na policy após readback e revisão autorizada. Manter deploymentEnabled=false até liberação explícita do Preview. Aprovação de orçamento/provisionamento não equivale a autorização de deploy, merge ou Production.

## Escopo e envs do smoke

| Grupo | Preview |
|---|---|
| DATABASE_URL / DIRECT_URL | Ambas staging_runtime, pooled/direct, tupla exata aprovada |
| Segredo staging_migrator | Ausente do deployment; somente executor separado |
| NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY / CLERK_SECRET_KEY | App Development independente; preenchimento privado pelo usuário |
| Billing/webhooks Clerk, Redis/Vector, IA, Blob, postagem, pagamentos, e-mail, Drive, cron | Ausentes; endpoints de efeitos bloqueados |
| GTM/GA/Facebook/tracking | Ausentes do build Preview |

Middleware preserva auth e permite APIs explícitas do projeto fictício e PUT voz. Cron, MCP, IA, webhooks e Server Actions POST são bloqueados. GET projects não entra porque pode criar/clonar dados e chamar provedor. Subscription status sintético somente após auth, sem billing. Jobs/embeddings recusam Preview antes do SDK; isso não autoriza herdar credenciais externas.

Imagens Preview: unoptimized=true, remotePatterns vazio, /_next/image bloqueado antes de Clerk/otimizador. Assets locais continuam disponíveis. URLs diretas em img/CSS também devem permanecer ausentes das fixtures. Bundle/SSR e smoke visual exigem validação própria.

Após todos os gates e autorização específica, testar login pessoal, GET voz, PUT prévia com CAS/readback/conflito 409, legado sem ativação, logout/tenant errado negados e zero efeitos externos. Nenhuma geração, upload, pagamento, publicação ou Base vetorial. Ampliações exigem recursos e aprovação próprios, sem reutilizar índices/namespaces reais.

## Falhas de migration em Production

Production mantém migrations antes de generate/build. Retorno nãozero interrompe o build, como o fallback anterior quando VERCEL_ENV=production. O wrapper pode propagar o código nãozero do Prisma; o fallback anterior retornava 1. Ambos falham o build. Desenvolvimento preserva a tolerância existente; Preview não executa migrations.

## Validação e encerramento

Executar test:preview-isolation, typecheck e lint antes de publicar alterações. Revalidar preflight, destino, grants e ausência de segredos DDL no deployment antes do smoke. CI aprovado não certifica Neon 17 ou execução visual. Acompanhar custo agregado e expiração; teardown apenas do ambiente sintético autorizado. Production e legado permanecem preservados.
