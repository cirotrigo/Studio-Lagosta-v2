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
  serverExternalPackages: ['fluent-ffmpeg', '@ffmpeg-installer/ffmpeg'],

  // Optimize tracing so Vercel functions stay below size limits
  outputFileTracingExcludes: {
    '*': [
      ...heavyNodeModulesGlobs,
      ...ffmpegGlobs,
      ...formatToolingGlobs,
    ],
  },
  outputFileTracingIncludes: {
    // Keep ffmpeg binaries only for the video processing worker
    '/api/video-processing/process': ffmpegGlobs,
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

    return config;
  },

};

export default nextConfig;
