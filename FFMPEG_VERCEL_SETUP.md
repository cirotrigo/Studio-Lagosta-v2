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

## Solução: Configurar FFmpeg para Vercel

### ⚠️ Limitações do Vercel

O Vercel tem limitações importantes para FFmpeg:
- **Limite de tamanho**: 50MB para funções serverless
- **Limite de corpo**: 5MB para requisições (já resolvido com Vercel Blob)
- **Tempo de execução**: Máximo de 300 segundos (já configurado)

### 🎯 Opção 1: Usar @ffmpeg-installer/ffmpeg (Já Instalado) ⭐

O pacote **já está instalado** no projeto (`@ffmpeg-installer/ffmpeg@1.1.0`).

#### Passo 1: Verificar se funciona no Vercel

O código já está preparado para buscar o FFmpeg do instalador automaticamente. Faça o deploy e verifique os logs.

#### Passo 2: Se não funcionar automaticamente

Adicione a variável de ambiente no Vercel:

1. Acesse **Vercel Dashboard** → Seu Projeto → **Settings** → **Environment Variables**
2. Adicione:
   ```
   Nome: FFMPEG_PATH
   Valor: /var/task/node_modules/@ffmpeg-installer/ffmpeg/ffmpeg
   ```
3. Marque: **Production**, **Preview**, **Development**
4. Clique em **Save**
5. Faça **Redeploy** do projeto

#### Passo 3: Verificar logs

Após o deploy, ao tentar exportar um vídeo, verifique os logs do Vercel:
- Procure por `[FFmpeg] Testando caminho:`
- Veja qual caminho foi encontrado (se houver)

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

## 🧪 Verificação do FFmpeg

### Endpoint de Teste Criado

Acesse o endpoint para verificar se o FFmpeg está disponível:

```
GET /api/test-ffmpeg
```

Este endpoint retorna:
- ✅ Lista de todos os caminhos testados
- ✅ Quais caminhos existem no sistema
- ✅ Informações do @ffmpeg-installer/ffmpeg
- ✅ Variáveis de ambiente
- ✅ Conteúdo do diretório /var/task

### Como Usar

1. **Em desenvolvimento** (local):
   ```bash
   # Certifique-se de que o servidor está rodando
   npm run dev

   # Abra no navegador ou use curl:
   curl http://localhost:3000/api/test-ffmpeg
   ```

2. **Em produção** (Vercel):
   ```bash
   # Acesse diretamente (requer autenticação se não estiver em dev)
   https://seu-dominio.vercel.app/api/test-ffmpeg
   ```

3. **Interpretar resultados**:
   ```json
   {
     "summary": {
       "foundPaths": ["/caminho/encontrado"],
       "totalTested": 8,
       "totalFound": 1
     }
   }
   ```

   - Se `totalFound > 0`: FFmpeg está disponível! ✅
   - Se `totalFound = 0`: Precisa configurar variável de ambiente ⚠️

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
