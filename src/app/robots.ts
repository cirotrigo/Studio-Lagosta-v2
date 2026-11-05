import type { MetadataRoute } from 'next'

const SITE_URL = 'https://lagostacriativa.com.br'

// O domínio serve a página de vendas E o app Studio Lagosta. Só a parte de vendas
// é para busca; as rotas do app redirecionam para o login e só gastariam crawl.
// /.well-known fica liberado de propósito: é a descoberta OAuth do conector MCP.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/sign-in',
          '/sign-up',
          '/oauth/',
          '/envio/',
          '/admin',
          '/agenda',
          '/ai-chat',
          '/bancada',
          '/biblioteca-musicas',
          '/billing',
          '/caixa-de-respostas',
          '/criativos',
          '/drive',
          '/gerar-criativo',
          '/knowledge',
          '/organization',
          '/projects',
          '/prompts',
          '/studio',
          '/templates',
          '/tools',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
