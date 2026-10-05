import { SalesPage } from "@/components/sales/SalesPage"
import { Metadata } from "next"

export const revalidate = 0

const SITE_URL = 'https://lagostacriativa.com.br'
const TITLE = "Lagosta Criativa | Marketing Gastronômico que Gera Vendas"
const DESCRIPTION =
  "Não vendemos posts. Vendemos mesas ocupadas. Foto e vídeo, gestão de redes, atendimento com IA, sites e tráfego pago para restaurantes — a única empresa do ES que une tudo isso com método."

// A metadata da raiz (`src/app/layout.tsx`) vem do SiteSettings do admin, que
// é do STUDIO (a ferramenta). A Home é a página de vendas da AGÊNCIA, então ela
// declara o próprio Open Graph e Twitter por inteiro — antes só title/description
// eram sobrescritos e o `twitter:description` herdava o texto do template
// ("Template Next.js pronto para produção pela AI Coders Academy…"), que era o
// que aparecia ao compartilhar o link. A imagem `og-lagosta.png` substitui o
// `og-image.png` do template (um SVG "Template SaaS Completo", que WhatsApp e
// Instagram nem renderizam).
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  metadataBase: new URL(SITE_URL),
  alternates: { canonical: '/' },
  keywords: [
    'marketing gastronômico',
    'agência de marketing para restaurantes',
    'marketing para restaurantes Vitória ES',
    'fotografia gastronômica',
    'gestão de redes sociais para restaurantes',
    'atendimento com IA para restaurantes',
    'cardápio digital',
    'tráfego pago para restaurantes',
  ],
  openGraph: {
    title: TITLE,
    description: "Escale seu restaurante com método e precisão: conteúdo, atendimento com IA, site e tráfego em uma só empresa.",
    url: SITE_URL,
    siteName: 'Lagosta Criativa',
    locale: 'pt_BR',
    type: "website",
    images: [{ url: '/og-lagosta.png', width: 1200, height: 630, alt: 'Lagosta Criativa — marketing gastronômico que gera fila na porta' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: "Escale seu restaurante com método e precisão: conteúdo, atendimento com IA, site e tráfego em uma só empresa.",
    images: ['/og-lagosta.png'],
  },
}

// Dados estruturados da agência. O `@id` do fundador é o MESMO que o
// cirotrigo.com.br usa: é ele que faz o Google juntar a pessoa dos dois sites.
const JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'ProfessionalService',
  '@id': `${SITE_URL}/#lagosta-criativa`,
  name: 'Lagosta Criativa',
  url: SITE_URL,
  logo: `${SITE_URL}/lagosta-logo.png`,
  image: `${SITE_URL}/og-lagosta.png`,
  description: DESCRIPTION,
  email: 'contato@lagostacriativa.com.br',
  address: { '@type': 'PostalAddress', addressLocality: 'Vitória', addressRegion: 'ES', addressCountry: 'BR' },
  taxID: '21.339.876/0001-37',
  areaServed: [
    { '@type': 'City', name: 'Vitória' },
    { '@type': 'State', name: 'Espírito Santo' },
  ],
  sameAs: ['https://www.instagram.com/lagostacriativa/'],
  founder: {
    '@type': 'Person',
    '@id': 'https://cirotrigo.com.br/#ciro-trigo',
    name: 'Ciro Trigo',
    url: 'https://cirotrigo.com.br/sobre',
    sameAs: ['https://www.instagram.com/cirotrigo/', 'https://www.linkedin.com/in/ciro-trigo/'],
  },
}

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        // JSON.stringify não escapa "<"; o replace impede um "</script>" no texto.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD).replace(/</g, '\\u003c') }}
      />
      <SalesPage />
    </>
  )
}
