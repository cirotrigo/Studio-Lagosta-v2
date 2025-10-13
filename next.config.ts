import type { NextConfig } from "next";
import path from "path";

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
  experimental: {
    serverComponentsExternalPackages: ['fluent-ffmpeg', '@ffmpeg-installer/ffmpeg'],
    outputFileTracingIncludes: {
      'app/api/video-processing/process/route.ts': [
        './node_modules/fluent-ffmpeg/**/*',
        './node_modules/@ffmpeg-installer/ffmpeg/**/*',
      ],
    },
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
