# FFmpeg no Vercel - Configuração

## Problema

O processamento de vídeos no servidor Vercel está falando com o erro:
```
FFmpeg não encontrado. Candidatos testados: /usr/bin/ffmpeg, /usr/local/bin/ffmpeg, /opt/homebrew/bin/ffmpeg
```

## Causa

O pacote `@ffmpeg-installer/ffmpeg` não funciona no ambiente serverless do Vercel porque:
1. O Vercel usa um sistema de arquivos read-only
2. Os binários estáticos não são incluídos no build
3. As funções serverless têm limitações de tamanho

## Solução: FFmpeg Layer da Vercel

O Vercel oferece uma camada (layer) oficial do FFmpeg que deve ser configurada no projeto.

### Opção 1: Usar Layer Externa (Recomendado)

1. **Adicionar FFmpeg Layer ao projeto**:
   - Acesse: https://vercel.com/integrations
   - Procure por "FFmpeg" ou use layers de terceiros como:
     - [vercel-ffmpeg](https://www.npmjs.com/package/@vercel/ffmpeg)

2. **Instalar o pacote no projeto**:
   ```bash
   npm install @vercel/ffmpeg
   ```

3. **Atualizar o código** em `src/lib/video/ffmpeg-server-converter.ts`:
   ```typescript
   // No topo do arquivo
   import { path as ffmpegPath } from '@vercel/ffmpeg'

   // Na função ensureFfmpegPath(), adicionar como primeiro candidato:
   const candidates = [
     ffmpegPath, // FFmpeg da Vercel
     process.env.FFMPEG_PATH,
     installerPath,
     // ... resto dos candidatos
   ]
   ```

### Opção 2: Usar Variável de Ambiente

Se você já configurou uma layer do FFmpeg manualmente no Vercel:

1. Vá para **Project Settings** → **Environment Variables**
2. Adicione a variável:
   ```
   FFMPEG_PATH=/opt/bin/ffmpeg
   ```
   (O caminho exato depende da layer instalada)

3. Faça redeploy do projeto

### Opção 3: Processar Vídeos Externamente (Alternativa)

Se as opções acima não funcionarem, considere usar um serviço externo:

1. **Cloudflare Workers** com FFmpeg
2. **AWS Lambda** com FFmpeg Layer
3. **Railway.app** ou **Render.com** (suportam FFmpeg nativamente)
4. **Serviços especializados**: Mux, Cloudinary, etc.

## Verificação

Para verificar se o FFmpeg está disponível no Vercel:

1. Crie um endpoint de teste: `/api/test-ffmpeg`
2. Use o código:
   ```typescript
   import { existsSync } from 'fs'

   export async function GET() {
     const paths = [
       '/opt/bin/ffmpeg',
       '/usr/bin/ffmpeg',
       '/usr/local/bin/ffmpeg',
       process.env.FFMPEG_PATH
     ]

     const results = paths.map(path => ({
       path,
       exists: path ? existsSync(path) : false
     }))

     return Response.json({ results, env: process.env.FFMPEG_PATH })
   }
   ```

## Status Atual

- ✅ Upload de vídeo funcionando
- ✅ Criação de job na fila funcionando
- ❌ Conversão WebM → MP4 falhando (FFmpeg não encontrado)
- ✅ Sistema de polling funcionando

## Próximos Passos

1. [ ] Configurar FFmpeg Layer no Vercel
2. [ ] Atualizar código para usar o caminho correto
3. [ ] Testar conversão de vídeo
4. [ ] Remover pacote `@ffmpeg-installer/ffmpeg` se não for mais necessário

## Links Úteis

- [Vercel Functions - Using Binary Files](https://vercel.com/docs/functions/runtimes#binary-files)
- [FFmpeg WASM Alternative](https://github.com/ffmpegwasm/ffmpeg.wasm) (não recomendado para serverless)
- [Vercel Edge Functions Limitations](https://vercel.com/docs/functions/edge-functions/limitations)
