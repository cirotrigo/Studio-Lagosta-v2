# Auditoria de SEO — lagostacriativa.com.br (05/10/2026)

Skill `claude-seo:seo-audit`, 6 agentes (técnico, conteúdo/on-page, schema, GEO/agentes, local, performance/imagens). Sem dados de campo (sem CrUX, GSC, GA4, Moz ou DataForSEO): notas de laboratório. Detalhe e evidência em `findings/*.md`.

## Nota geral: 47/100

| Categoria | Peso | Nota |
|---|---|---|
| SEO técnico | 22% | 58 |
| Conteúdo | 23% | 52 |
| On-page | 20% | 45 |
| Dados estruturados | 10% | 5 (45 com o PR #198) |
| Performance | 10% | 58 |
| Prontidão para busca por IA | 10% | 43 |
| Imagens | 5% | 45 |

Tipo de negócio: agência de marketing gastronômico, service-area (atende no restaurante do cliente), Vitória–ES. O mesmo domínio serve o app Studio Lagosta.

## Os 5 problemas mais graves
1. `/robots.txt`, `/sitemap.xml` e `/llms.txt` respondem 307 para `/sign-in` (não existem, e o middleware os protege).
2. O vídeo de depoimento (`/videos/*.mp4`) também cai no login para visitante anônimo, e tem 28 MB.
3. Metade do conteúdo não está no HTML: respostas do FAQ (accordion fechado) e 4 das 5 abas de planos com os preços.
4. "Vitória" não aparece no título, na descrição nem no texto; a descrição tem ~210 caracteres.
5. Clerk de DESENVOLVIMENTO em produção (`pk_test_`, handshake com 307 antes do HTML; home `force-dynamic` e `no-store`).

## Quick wins
- Criar robots, sitemap e llms.txt e liberar no middleware (junto com os vídeos).
- `forceMount` nas respostas do FAQ e nas abas de planos.
- Título e descrição com "Vitória – ES" e dentro de ~155 caracteres.
- Tirar os cards "Depoimento — Em breve".
- `noindex` em /sign-in e /sign-up.
- Logos do hero e dos clientes em `next/image` (LCP mobile ~10 s → ~3 s estimado).

## Atenção: o que NÃO fazer
- **Não redirecionar www → apex no host inteiro**: o metadata do OAuth do conector MCP publica `www.lagostacriativa.com.br` como issuer/resource; o redirect quebraria o conector e os tokens. O canonical já aponta para o apex.
- **Não marcar o FAQ como FAQPage** (o rich result foi aposentado; as perguntas são objeções de venda).
- **Não inventar endereço, horário nem avaliações** no schema.

## Por categoria (resumo)
- **Técnico:** robots/sitemap/llms (Crítico); qualquer URL inexistente vai para o login em vez de 404 (Crítico); Clerk dev, sign-in indexável, www 200, `no-store` (Alto); padrão `'/[slug]'` do middleware é literal, então páginas de CMS também caem no login (Alto); headers de segurança incompletos e favicon 404 (Baixo).
- **Conteúdo/on-page:** uma URL para cinco serviços (Crítico — propostas de páginas de serviço); FAQ e planos fora do HTML (Crítico); "Vitória" ausente (Crítico); descrição longa com "a única do ES" sem prova, "Em breve" no ar, cases sem número, autor quase invisível (Alto); headings (Médio).
- **Schema:** nenhum em produção; PR #198 correto; faltam WebSite, catálogo de serviços com os preços do site e contato de vendas (WhatsApp).
- **GEO/IA:** crawlers de IA não estão bloqueados, mas nada é declarado; o `worksFor` do cirotrigo.com.br cita a Lagosta sem `@id`.
- **Local:** nota 27; sem NAP visível além de "Vitória, ES"; GBP não confirmado.
- **Performance/imagens:** desktop LCP 1,37 s; mobile LCP 10,1 s (logo PNG de 207 KB como LCP, 10 logos de cliente ~1 MB exibidas a 48 px, imagens sem cache); vídeo 28 MB sem poster.
