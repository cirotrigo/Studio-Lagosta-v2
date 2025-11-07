import type { NextConfig } from "next";
import path from "path";

const heavyNodeModulesGlobs = [
  './node_modules/@swc/core-linux-x64-gnu/**/*',
  './node_modules/@swc/core-linux-x64-musl/**/*',
  './node_modules/@swc/core-darwin-x64/**/*',
  './node_modules/@swc/core-darwin-arm64/**/*',
  './node_modules/@esbuild/**/*',
  './node_modules/canvas/**/*',
  './node_modules/@napi-rs/canvas/**/*',
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
  serverExternalPackages: ['fluent-ffmpeg', '@ffmpeg-installer/ffmpeg', 'ffmpeg-static'],

  // Performance optimizations
  experimental: {
    optimizePackageImports: [
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-select',
      '@radix-ui/react-accordion',
      '@radix-ui/react-tabs',
      '@radix-ui/react-popover',
      'lucide-react',
      'recharts',
      'framer-motion',
    ],
    webpackMemoryOptimizations: true,
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
    // Ensure AI image generation route is included in deployment
    '/api/ai/generate-image': ['**/*'],
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
