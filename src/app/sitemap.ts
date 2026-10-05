import type { MetadataRoute } from 'next'

const SITE_URL = 'https://lagostacriativa.com.br'

// Só as páginas públicas de vendas. Página nova de serviço entra aqui.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/privacy-policy`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE_URL}/terms-of-service`, changeFrequency: 'yearly', priority: 0.2 },
  ]
}
