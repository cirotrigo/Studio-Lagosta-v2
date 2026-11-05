# Plano de ação — lagostacriativa.com.br

## Fase 1 — aplicado no PR de SEO (05/10/2026)
- robots.txt, sitemap.xml e llms.txt gerados pelo Next e liberados no middleware; `/videos` também liberado.
- `noindex` em /sign-in e /sign-up.
- Título e descrição da home com Vitória – ES, descrição ≤155 caracteres, sem "a única do ES".
- FAQ e todas as abas de planos no HTML (`forceMount`, escondidos visualmente como antes).
- Cards "Depoimento — Em breve" removidos.
- Vídeo com `preload="none"` e capa; recodificado.
- Logos do hero e dos clientes otimizadas (WebP, tamanho de exibição) e com o nome de cada cliente no alt.
- Cache longo para imagens e vídeos estáticos.
- JSON-LD em `@graph`: WebSite + ProfessionalService (do #198) + catálogo de serviços com os preços do site.

## Fase 2 — depende de decisão do Ciro
- Clerk de produção (chaves `pk_live`/`sk_live` na Vercel e domínio no Clerk). Destrava cache da home e tira o handshake.
- WhatsApp como telefone público (texto e schema)? Número: +55 27 99757-8627.
- Perfil da Lagosta no Google (Business Profile): existe? categoria, cidades atendidas.
- Cidades atendidas para o texto e o `areaServed`.
- Páginas por serviço (marketing para restaurantes em Vitória, fotografia gastronômica, atendimento com IA, cardápio digital, tráfego pago) — copy a aprovar.
- Números dos cases e autorização para citar clientes.

## Fase 3 — técnico com cuidado
- 404 de verdade para URL inexistente (hoje vai para o login) e corrigir o padrão `'/[slug]'` do middleware: mexe na proteção do app, precisa de lista de prefixos do app e teste.
- `worksFor` do cirotrigo.com.br com `@id` `https://lagostacriativa.com.br/#lagosta-criativa`.
- Headers de segurança (CSP, nosniff, referrer-policy), favicon.ico.

## Fase 4 — acompanhamento
- Depois do deploy: Teste de Pesquisa Aprimorada, enviar sitemap no Search Console, `drift baseline` desta auditoria.
