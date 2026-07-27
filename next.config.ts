import type { NextConfig } from "next";
import path from "path";

const heavyNodeModulesGlobs = [
  './node_modules/@swc/core-linux-x64-gnu/**/*',
  './node_modules/@swc/core-linux-x64-musl/**/*',
  './node_modules/@swc/core-darwin-x64/**/*',
  './node_modules/@swc/core-darwin-arm64/**/*',
  './node_modules/@esbuild/**/*',
  './node_modules/canvas/**/*',
  // @napi-rs/canvas NOT excluded — needed for server-side story rendering
  // NOTE: sharp is needed for image processing - do NOT exclude it
  './node_modules/playwright/**/*',
  './node_modules/@playwright/**/*',
  './node_modules/axe-core/**/*',
];

const formatToolingGlobs = [
  './node_modules/typescript/**/*',
  './node_modules/eslint/**/*',
  './node_modules/prettier/**/*',
  './scripts/**/*',
  './test-results/**/*',
  './playwright-report/**/*',
  './.next/cache/**/*',
];

const ffmpegGlobs = [
  './node_modules/fluent-ffmpeg/**/*',
  './node_modules/@ffmpeg-installer/ffmpeg/**/*',
  './node_modules/@ffmpeg/**/*',
];

const ffmpegStaticGlobs = [
  './node_modules/ffmpeg-static/**/*',
];

const montserratFontGlobs = [
  './assets/fonts/montserrat/*.ttf',
];

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // 禁用 Next.js 热重载，由 nodemon 处理重编译
  reactStrictMode: false,
  serverExternalPackages: ['fluent-ffmpeg', '@ffmpeg-installer/ffmpeg', 'ffmpeg-static', '@napi-rs/canvas'],

  // Performance optimizations
  experimental: {
    optimizePackageImports: [
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-select',
      '@radix-ui/react-accordion',
      '@radix-ui/react-tabs',
      '@radix-ui/react-popover',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-avatar',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-label',
      '@radix-ui/react-progress',
      '@radix-ui/react-radio-group',
      '@radix-ui/react-separator',
      '@radix-ui/react-slider',
      '@radix-ui/react-switch',
      '@radix-ui/react-toast',
      'lucide-react',
      'recharts',
      'framer-motion',
      'react-konva',
      'konva',
    ],
    webpackMemoryOptimizations: true,
    // Increase body size limit for uploads (100MB)
    serverActions: {
      bodySizeLimit: '100mb',
    },
  },

  // Compiler optimizations
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },

  // Optimize tracing so Vercel functions stay below size limits
  outputFileTracingExcludes: {
    '*': [
      ...heavyNodeModulesGlobs,
      ...ffmpegGlobs, // Exclude old ffmpeg packages
      ...formatToolingGlobs,
    ],
  },
  outputFileTracingIncludes: {
    // IMPORTANT: Keep ffmpeg-static binary for video processing
    '/api/video-processing/process': ffmpegStaticGlobs,
    '/api/test-ffmpeg': ffmpegStaticGlobs,
    // Fontes Montserrat lidas em runtime pelo CanvasRenderer: sem isto o
    // tracing não as inclui (não são importadas, são abertas por path) e a
    // arte exportada sai com a fonte de fallback do sistema
    '/api/cron/render-stories': montserratFontGlobs,
    '/api/projects/[projectId]/generations/carousel': montserratFontGlobs,
    '/api/templates/[id]/thumbnail': montserratFontGlobs,
    // Artes pedidas de fora (Claudinho, conector do claude.ai) renderizam aqui
    '/api/external/creatives': montserratFontGlobs,
    '/api/mcp': montserratFontGlobs,
  },

  // Descoberta OAuth do conector MCP. Os caminhos /.well-known/* são fixados
  // pelas RFCs 8414/9728, e uma pasta iniciada por ponto dentro de app/ não
  // vira rota — daí o rewrite para as rotas reais sob /api/oauth.
  async rewrites() {
    return [
      {
        source: '/.well-known/oauth-authorization-server',
        destination: '/api/oauth/metadata/authorization-server',
      },
      {
        source: '/.well-known/oauth-authorization-server/api/mcp',
        destination: '/api/oauth/metadata/authorization-server',
      },
      {
        source: '/.well-known/oauth-protected-resource',
        destination: '/api/oauth/metadata/protected-resource',
      },
      {
        source: '/.well-known/oauth-protected-resource/api/mcp',
        destination: '/api/oauth/metadata/protected-resource',
      },
    ]
  },

  // Headers necessários para FFmpeg.wasm (SharedArrayBuffer) e PhotoSwipe
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
          {
            key: 'Cross-Origin-Embedder-Policy',
            // Usar 'credentialless' ao invés de 'require-corp' para permitir
            // recursos cross-origin (como imagens do Vercel Blob) funcionarem
            value: 'credentialless',
          },
          {
            key: 'Cross-Origin-Resource-Policy',
            value: 'cross-origin',
          },
        ],
      },

      // O conector do claude.ai fala com estes endpoints do navegador dele:
      // sem CORS a descoberta e o registro são bloqueados antes de sair.
      {
        source: '/.well-known/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
          { key: 'Access-Control-Max-Age', value: '86400' },
        ],
      },
      {
        source: '/api/oauth/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
          { key: 'Access-Control-Max-Age', value: '86400' },
        ],
      },
      {
        source: '/api/mcp',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'POST, OPTIONS' },
          // MCP-Protocol-Version é mandado pelos clientes a partir da revisão 2025-06-18
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization, MCP-Protocol-Version, Mcp-Session-Id',
          },
          { key: 'Access-Control-Expose-Headers', value: 'WWW-Authenticate' },
          { key: 'Access-Control-Max-Age', value: '86400' },
        ],
      },

      // A autorização abre numa janela popup e o claude.ai depende do vínculo
      // com a janela que a abriu para saber que o login terminou. O COOP
      // 'same-origin' global corta esse vínculo — aqui ele precisa ser afrouxado.
      // Não afeta o SharedArrayBuffer do FFmpeg, que roda em outras páginas.
      {
        source: '/oauth/:path*',
        headers: [{ key: 'Cross-Origin-Opener-Policy', value: 'unsafe-none' }],
      },
      {
        source: '/sign-in',
        headers: [{ key: 'Cross-Origin-Opener-Policy', value: 'unsafe-none' }],
      },
      {
        source: '/sign-in/:path*',
        headers: [{ key: 'Cross-Origin-Opener-Policy', value: 'unsafe-none' }],
      },
      {
        source: '/sign-up',
        headers: [{ key: 'Cross-Origin-Opener-Policy', value: 'unsafe-none' }],
      },
      {
        source: '/sign-up/:path*',
        headers: [{ key: 'Cross-Origin-Opener-Policy', value: 'unsafe-none' }],
      },
    ]
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'html.tailus.io',
      },
      {
        protocol: 'https',
        hostname: 'blob.vercel-storage.com',
      },
      {
        protocol: 'https',
        hostname: '*.public.blob.vercel-storage.com',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'drive.google.com',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
      },
      {
        protocol: 'https',
        hostname: 'i.ytimg.com',
      },
      {
        protocol: 'https',
        hostname: 'img.youtube.com',
      },
      {
        protocol: 'https',
        hostname: 'via.placeholder.com',
      },
      {
        protocol: 'https',
        hostname: 'media.zernio.com',
      },
      {
        protocol: 'https',
        hostname: '*.zernio.com',
      },
      {
        // Supabase Storage do Claudinho (insta-automatico) — artes e fotos
        // agendadas via /api/external chegam com mediaUrls deste host
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
    // OPTIMIZED: Image optimization settings
    formats: ['image/avif', 'image/webp'], // Use modern formats for better compression
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840], // Standard device sizes
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384], // Image sizes for different use cases
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days cache (reduced from 60 for better updates)
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  webpack: (config, { dev, isServer }) => {
    // Configure path aliases
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname, './src'),
    };

    // Externalizar @napi-rs/canvas para evitar bundle no webpack
    if (isServer) {
      config.externals = config.externals || [];
      if (Array.isArray(config.externals)) {
        config.externals.push('@napi-rs/canvas');
        config.externals.push('canvas');
      }
    }

    // Fix HMR issues with Tailwind v4 CSS extraction
    if (dev && !isServer) {
      config.optimization = {
        ...config.optimization,
        runtimeChunk: 'single',
        splitChunks: {
          ...config.optimization?.splitChunks,
          cacheGroups: {
            ...config.optimization?.splitChunks?.cacheGroups,
            styles: {
              name: 'styles',
              type: 'css/mini-extract',
              chunks: 'all',
              enforce: true,
            },
          },
        },
      };
    }

    // Reduce webpack cache serialization size
    if (dev) {
      const originalCache = config.cache;
      config.cache = originalCache === false ? false : {
        type: 'filesystem',
        compression: 'gzip',
        maxMemoryGenerations: 3,
        maxAge: 1000 * 60 * 60 * 24, // 1 day
        ...(typeof originalCache === 'object' ? originalCache : {}),
      };
    }

    return config;
  },

};

export default nextConfig;
