import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { QueryProvider } from "@/components/providers/query-provider";
import {
  ClerkProvider,
} from "@clerk/nextjs";
import { getSiteSettings } from "@/lib/site-settings";
import { AnalyticsPixels } from "@/components/analytics/pixels";

// Família Montserrat com todos os pesos necessários, em WOFF2 derivado sem perdas
// dos TTF do repositório (os mesmos do CanvasRenderer, que segue lendo os TTF):
// o build não depende do Google Fonts.
const montserrat = localFont({
  variable: "--font-montserrat",
  src: [
    { path: "../../assets/fonts/montserrat/Montserrat-100.woff2", weight: "100", style: "normal" }, // Thin
    { path: "../../assets/fonts/montserrat/Montserrat-300.woff2", weight: "300", style: "normal" }, // Light
    { path: "../../assets/fonts/montserrat/Montserrat-400.woff2", weight: "400", style: "normal" }, // Regular
    { path: "../../assets/fonts/montserrat/Montserrat-500.woff2", weight: "500", style: "normal" }, // Medium
    { path: "../../assets/fonts/montserrat/Montserrat-600.woff2", weight: "600", style: "normal" }, // SemiBold
    { path: "../../assets/fonts/montserrat/Montserrat-700.woff2", weight: "700", style: "normal" }, // Bold
    { path: "../../assets/fonts/montserrat/Montserrat-800.woff2", weight: "800", style: "normal" }, // ExtraBold
    { path: "../../assets/fonts/montserrat/Montserrat-900.woff2", weight: "900", style: "normal" }, // Black
  ],
  display: "swap",
  preload: true,
});

// Force dynamic rendering to prevent metadata from being cached at build time
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Metadata dinâmica que busca do banco de dados
export async function generateMetadata(): Promise<Metadata> {
  try {
    const settings = await getSiteSettings();

    // Add cache busting parameter to favicon to force browser refresh
    const cacheBuster = settings.updatedAt ? new Date(settings.updatedAt).getTime() : Date.now();
    const faviconUrl = `${settings.favicon}?v=${cacheBuster}`;
    const appleIconUrl = settings.appleIcon ? `${settings.appleIcon}?v=${cacheBuster}` : undefined;

    return {
      title: settings.metaTitle || settings.siteName,
      description: settings.metaDesc || settings.description,
      keywords: settings.keywords,
      authors: [{ name: 'Lagosta Criativa (Ciro Trigo)' }],
      metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
      openGraph: {
        title: settings.metaTitle || settings.siteName,
        description: settings.metaDesc || settings.description,
        url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        siteName: settings.siteName,
        images: settings.ogImage ? [{ url: settings.ogImage }] : undefined,
        type: 'website',
      },
      twitter: {
        card: 'summary_large_image',
        title: settings.metaTitle || settings.siteName,
        description: settings.metaDesc || settings.description,
      },
      icons: {
        icon: faviconUrl,
        // O ícone configurado no admin vence; sem ele, o apple-touch-icon
        // gerado por scripts/gerar-icones-pwa.ts.
        apple: appleIconUrl ?? '/icons/apple-touch-icon.png',
      },
      // PWA no iOS: instalado pela tela de início, abre sem o chrome do Safari.
      appleWebApp: {
        capable: true,
        title: 'Lagosta',
        statusBarStyle: 'black-translucent',
      },
      other: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    };
  } catch (error) {
    // Fallback to default metadata if database fails
    console.error('Failed to load site settings for metadata:', error);

    return {
      title: 'Studio Lagosta',
      description: 'Studio Lagosta: a plataforma da Lagosta Criativa para criar, agendar e publicar o conteúdo de restaurantes.',
      keywords: ['marketing gastronômico', 'restaurantes', 'Instagram', 'Studio Lagosta'],
      authors: [{ name: 'Lagosta Criativa (Ciro Trigo)' }],
      metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
      openGraph: {
        title: 'Studio Lagosta',
        description: 'A plataforma da Lagosta Criativa para o conteúdo de restaurantes.',
        url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        siteName: 'Studio Lagosta',
        images: [{ url: '/og-image.png' }],
        type: 'website',
      },
      twitter: {
        card: 'summary_large_image',
        title: 'Studio Lagosta',
        description: 'A plataforma da Lagosta Criativa para o conteúdo de restaurantes.',
      },
      icons: {
        icon: `/favicon.svg?v=${Date.now()}`,
        apple: '/icons/apple-touch-icon.png',
      },
      appleWebApp: {
        capable: true,
        title: 'Lagosta',
        statusBarStyle: 'black-translucent',
      },
      other: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    };
  }
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 5, // Permitir zoom para acessibilidade
  userScalable: true,
  viewportFit: 'cover', // Melhor ajuste para notch em iPhones
  // Safari-specific
  interactiveWidget: 'resizes-content',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="pt-br" suppressHydrationWarning>
        <body
          className={`${montserrat.variable} antialiased text-foreground`}
          style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}
        >
          <AnalyticsPixels />
          <QueryProvider>
            <ThemeProvider defaultTheme="dark">
              {children}
              <Toaster />
            </ThemeProvider>
          </QueryProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
