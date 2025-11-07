import type { Metadata, Viewport } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { QueryProvider } from "@/components/providers/query-provider";
import {
  ClerkProvider,
} from "@clerk/nextjs";
import { getSiteSettings } from "@/lib/site-settings";
import { AnalyticsPixels } from "@/components/analytics/pixels";

// Família Montserrat com todos os pesos necessários
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["100", "300", "400", "500", "600", "700", "800", "900"], // Thin, Light, Regular, Medium, SemiBold, Bold, ExtraBold, Black
  style: ["normal"],
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
        apple: appleIconUrl,
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
      description: 'Template Next.js pronto para produção pela AI Coders Academy: autenticação, banco de dados, pagamentos e sistema de créditos incluídos.',
      keywords: ['SaaS', 'Next.js', 'TypeScript', 'Clerk', 'Prisma', 'Tailwind CSS'],
      authors: [{ name: 'Lagosta Criativa (Ciro Trigo)' }],
      metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
      openGraph: {
        title: 'Studio Lagosta',
        description: 'Template Next.js pronto para produção pela AI Coders Academy',
        url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        siteName: 'Studio Lagosta',
        images: [{ url: '/og-image.png' }],
        type: 'website',
      },
      twitter: {
        card: 'summary_large_image',
        title: 'Studio Lagosta',
        description: 'Template Next.js pronto para produção pela AI Coders Academy',
      },
      icons: {
        icon: `/favicon.svg?v=${Date.now()}`,
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
            <ThemeProvider>
              {children}
              <Toaster />
            </ThemeProvider>
          </QueryProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
