# Staging sintético — pacote local para revisão

Preparação em `codex/marca-preview-preparacao-local`, baseada em `d2f92777`. Nada deste pacote foi publicado. PR draft #196 continua com deploy Git bloqueado. Não liberar Preview antes de aprovação dos alvos/custos, revisão do patch e validação do banco. As nove vozes existentes e todos os dados de clientes ficam preservados.

## Lote proposto, ainda não criado

| Recurso | Nome/limite proposto | Acesso necessário |
|---|---|---|
| Neon, projeto existente `patient-king-49987156` | root `staging-sintetico`, `init_source: schema-only`, origem principal `br-fancy-boat-adl32qyg` | operador autorizado do projeto; confirmar quota disponível |
| Endpoint novo read-write | mínimo = máximo 0.25 CU; suspensão após 60 segundos; sem réplica | conexão pooled/direct da nova branch, nunca da principal |
| Banco vazio | `studio_staging_sintetico`, criado explicitamente com TEMPLATE template0 | bootstrap somente na nova branch; conferir suporte/permissões antes de execução |
| Role SQL própria | `studio_staging_sintetico`, owner somente do banco novo, sem privilégios administrativos | senha inserida em UI segura; nenhuma credencial herdada |
| Clerk app independente | `studio-lagosta-staging-sintetico`, instância development | permissão para criar aplicação e acessar suas chaves; usuário/organização fictícios |
| Vercel | projeto/time Pro existentes; env Preview limitada à branch aprovada | operador com permissão de env; proteção atual preservada |

No lote mínimo, a role própria será owner somente do banco sintético, pois o build atual aplica migrations. Isso dá mais permissões de DDL que um runtime separado, porém não dá acesso à principal e evita role administrativa herdada. Bootstrap de extensão fica com operador da nova branch. Separar runtime/migrations requer mudar a fase de build e será proposta adicional se exigido; não foi apresentado como controle já existente.

API Neon confirma 0.25 CU e mínimo de suspensão Scale 60s. Scale custa US$0.222/CU-hora: 30 dias a 2h/dia ≈ US$3.33; 8h/dia ≈ US$13.32; ligado 24h/dia ≈ US$39.96, somente compute. Sete dias continuamente no teto 0.25 CU ≈ US$9.33. Acrescentar armazenamento US$0.35/GB-mês, histórico de restauração US$0.20/GB-mês e consumo adicional aplicável. Scale inclui 25 branches; acima disso US$1.50/branch-mês. Quota efetivamente disponível precisa ser conferida. Suspensão depende de inatividade; sondagens mantêm compute ativo. Limite de CU não limita storage/tráfego nem é teto financeiro. Alertas de gasto não interrompem consumo. Propor piloto de sete dias e encerramento manual aprovado, sem prometer remoção automática.

Clerk documenta aplicações ilimitadas e development com até 100 usuários, permitindo testar funcionalidades sem contratar upgrade. Para pequeno smoke não há indicação pública de novo plano pago; direitos efetivos da conta, permissão de criação e política de cobrança ainda não foram confirmados por painel autenticado. Nenhuma compra/upgrade autorizado. Aplicação independente é obrigatória: a pk_test atual é compartilhada inclusive com produção.

Fontes: [Neon pricing](https://neon.com/pricing), [compute](https://neon.com/docs/manage/computes), [API](https://neon.com/api_spec/release/v2.json), [Clerk environments](https://clerk.com/docs/guides/development/managing-environments), [Clerk pricing](https://clerk.com/pricing).

## Banco sem dados reais: justificativa e cautelas

`schema-only` copia estrutura, não linhas, e cria root independente; a API não documenta opção `empty` para branch no projeto atual. Uma root realmente vazia seria preferível se o provedor a oferecer e a conta confirmar suporte. Não usar default `parent-data`, clone comum, dev-local ou `setup-dev-db`. Não restaurar/resetar staging a partir da principal: isso pode copiar dados.

Schema-only pode copiar funções, defaults, triggers, views, FDW/servers/user mappings e literais sensíveis. Ausência de linhas não certifica ausência de segredos. Não abrir corpos de funções, opções de FDW ou senhas. Não conectar a aplicação aos bancos copiados. Inspecionar somente contagens/nomes de metadados aprovados. Roles/configurações de cluster também merecem revisão.

Criar banco adicional explicitamente com `CREATE DATABASE studio_staging_sintetico TEMPLATE template0 OWNER studio_staging_sintetico`, depois de aprovação e confirmação do alvo novo. A API de databases aceita nome/owner, sem template explícito; não presumir que seu padrão seja vazio. template0 evita objetos adicionados a template1 e estrutura copiada. Role SQL nova sem superuser/createdb/createrole/bypassrls; não copiar senha antiga. Roles criadas por Console/API Neon recebem neon_superuser, portanto não servem automaticamente como runtime mínimo. Bootstrap de extensão vector restrito à nova branch/banco.

Banco novo evita reaplicar migrations sobre schema copiado com `_prisma_migrations` vazio. Nunca `migrate resolve --applied` arbitrário, reset/delete da principal ou alteração de proteção. Provar banco vazio; replay das 42 migrations; verificar checksums, status completo e drift; seed só de identidades/projeto fictícios. [Schema-only](https://neon.com/docs/guides/branching-schema-only), [roles](https://neon.com/docs/manage/roles), [databases](https://neon.com/docs/manage/databases), [template0](https://www.postgresql.org/docs/current/sql-createdatabase.html).

## Replay local e limite comprovado

PostgreSQL 15.13 instalado; replay real descartável sem TCP aplicou 34/42 migrations. A 35ª, `20260907190000_photo_embedding`, requer pgvector e falhou: extensão ausente nas instalações locais verificadas. Oito migrations incluindo essa ainda não certificadas. Cluster parado e removido. Manifesto registra SHA-256 de cada SQL e schema. Único DML identificado atualiza SocialPost e não importa clientes em banco vazio.

Docker CLI existe, mas inventário das imagens foi bloqueado pelo acesso ao daemon no sandbox. Não foi repetido, instalado software, baixada imagem, acessado storage alternativo nem aberto Docker. Falta um PostgreSQL com pgvector já disponível e autorizado; não simular vector, pular migrations ou alegar replay completo. Nenhum SQL remoto executado.

## Guard preparado, não publicado

Preflight antes de `build`, `vercel-build`, `db:deploy`; checagem também antes de PrismaClient compartilhado. VERCEL=1 com VERCEL_ENV ausente/desconhecido falha fechado. Preview exige Neon/TLS, pooled/direct iguais em endpoint/banco/role/schema, parâmetros restritos sem duplicatas e correspondência à tupla aprovada endpoint+banco+role+schema, diferente da produção. `approvedDestinations` e lista de projetos vazias mantêm qualquer Preview bloqueado. Duas URLs iguais entre si para banco copiado/role administrativa continuam recusadas. Preview não reutiliza client global. Backup agora usa cliente protegido, sem desconectar singleton; jobs arquivo/backup recusam Preview antes das operações. Falha de migrations deixa de ser tolerada em Preview. Não executado contra banco real.

Middleware mantém autenticação e permite apenas leitura das páginas e APIs explícitas de projeto sintético aprovado, mais PUT da voz. APIs de postagem, cron, MCP, IA, webhooks e Server Actions POST são bloqueadas. GET /api/projects foi removida porque cria/clona dados por convite e chama Later. GET /api/subscription/status em Preview autenticado retorna status explicitamente sintético antes de billing/banco, para não redirecionar Marca a /subscribe; sem usuário retorna 401. Embeddings individuais/lote são bloqueados antes do SDK mesmo com OpenAI key herdada e Vector ausente. Esses controles não são autorização para manter credenciais reais herdadas.

Scripts operacionais que constroem seu próprio PrismaClient não estão certificados pelo guard: proibido usar esses scripts/manual raw migrate neste lote. Usar somente entrypoints revisados e ambiente limpo. Smoke funcional real, bundle e SSR completo ainda dependem da revisão final, banco/Clerk isolados e autorização. Não alegar sucesso visual agora.

Imagens Preview: config `unoptimized: true` e `remotePatterns: []`; middleware inclui `/_next/image/:path*` e retorna 403 antes de Clerk/otimizador. Assets estáticos locais continuam servidos diretamente. Teste invoca middleware e matcher reais para Blob/Drive/Zernio com fetch monitorado: zero chamadas. Fora de Preview a passagem do otimizador continua sem autenticação adicional. Desativar otimizador não é firewall de rede do navegador: URLs remotas diretas em img/CSS ainda precisam permanecer ausentes dos dados sintéticos. A suíte `test:preview-isolation` foi acrescentada ao workflow CI local; ainda não publicada nem executada remotamente.

## Matriz de ambiente para smoke

| Variáveis/grupo | Configuração futura |
|---|---|
| DATABASE_URL / DIRECT_URL | novo endpoint/banco/role confirmados; substituições Preview somente da branch, sem tocar Production |
| NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY / CLERK_SECRET_KEY | pk_test/sk_test da nova aplicação; não reutilizar app atual |
| CLERK_BILLING_API_KEY / CLERK_WEBHOOK_SECRET | ausentes; status sintético, webhooks bloqueados |
| UPSTASH_REDIS_REST_URL / TOKEN | ambos ausentes; sem cache externo |
| UPSTASH_VECTOR_REST_URL / TOKEN, OPENAI_API_KEY e demais IA | ausentes; embeddings bloqueados; nenhuma geração |
| Blob, Later/Zernio, Zapier, pagamentos, e-mail, Google/Drive, cron e demais providers | ausentes; endpoints correspondentes bloqueados; não publicar/postar/agendar |
| NEXT_PUBLIC_* de GTM/GA/Facebook e tracking | ausentes no build Preview; AnalyticsPixels pode carregar scripts externos no navegador se IDs herdados e consentimento |

Redis desligado e Vector ausente isoladamente não impedem postagem ou cobrança de embeddings. A combinação necessária é env própria sem credenciais externas + gate de rotas + guard embeddings/jobs + autenticação Clerk independente + allowlist sintética.

Escopo parcial: persistência de voz/Marca, revisão e leitura; nenhuma peça. Base semântica, busca/reindexação, embeddings, upload e prompts reais de copy/imagem não validados. Essas funções exigirão índice Vector separado 1536 dimensões, token e budget OpenAI próprios, storage quando necessário e autorização adicional. Não reutilizar namespace de índice real.

## Execução futura segura

1. Ciro confirma nomes, alvos, duração e custos; revisão independente do patch conclui; resolve replay pgvector.
2. Operador cria apenas nova root schema-only, endpoint limitado, role SQL e banco template0. Confere IDs/endpoint; inspeciona metadados sem segredos e prova vazio.
3. Ambiente limpo e DIRECT_URL da role própria exclusivamente de staging aplica 42 migrations; readback/checksums/drift. Seed só fictício com IDs Clerk novos. Não cria o Bacana ou copia voz de cliente.
4. Ciro cria Clerk development independente e insere chaves/conexões diretamente nos campos seguros da UI Vercel Preview da branch. Não enviar em chat, arquivo .env, log, patch ou PR; não `env pull`. Verificar apenas host/endpoint e modo das keys, nunca strings completas.
5. Remover heranças externas somente no escopo Preview autorizado; registrar tupla endpoint+banco+role+schema e projeto sintéticos em allowlist por patch revisado; publicar guard somente com autorização específica. Revalidar nenhuma alteração Production/proteção.
6. Liberar deploy apenas da branch aprovada, smoke sintético login/Marca e zero efeitos externos; relatar parcial Base. Aprovação de Ciro separada para merge/produção e eventual piloto Bacana.

Nenhuma nova API key administrativa é necessária se Ciro operar painéis existentes. Permissões Neon da organização, Clerk para criar app e Vercel para modificar env/deploy precisam ser confirmadas. Não conceder permissões nem criar credenciais nesta preparação.
