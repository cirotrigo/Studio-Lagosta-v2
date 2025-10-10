# Exportação de Vídeo em MP4 - Implementação Futura

## Status Atual
✅ **Implementado**: Exportação em formato WebM (VP9/VP8)
⏳ **Pendente**: Exportação em formato MP4 (H.264)

## Por que WebM e não MP4?

A implementação atual usa o formato WebM porque:

1. **MediaRecorder API nativa do navegador** só suporta WebM (VP8/VP9)
2. **Conversão client-side** de WebM → MP4 é complexa e não confiável
3. **Bibliotecas JavaScript** como FFmpeg.wasm são pesadas (>20MB) e lentas

## Estratégia Recomendada para MP4

### Opção 1: Conversão Server-Side (Recomendada)

**Fluxo:**
```
Cliente (WebM) → Upload → Servidor (FFmpeg) → Conversão → Download (MP4)
```

**Vantagens:**
- ✅ Alta qualidade e confiabilidade
- ✅ Suporte a codecs otimizados (H.264, H.265)
- ✅ Não sobrecarrega o navegador do usuário
- ✅ Funciona em todos os navegadores

**Implementação:**

1. **API Endpoint**: `/api/export/video/convert`
   ```typescript
   // POST: Recebe blob WebM
   // Salva temporariamente no storage
   // Executa FFmpeg no servidor
   // Retorna URL do MP4 convertido
   ```

2. **Dependências:**
   ```bash
   npm install fluent-ffmpeg @types/fluent-ffmpeg
   # Requer FFmpeg instalado no servidor
   ```

3. **Exemplo de conversão:**
   ```typescript
   import ffmpeg from 'fluent-ffmpeg'

   async function convertWebMtoMP4(inputPath: string, outputPath: string) {
     return new Promise((resolve, reject) => {
       ffmpeg(inputPath)
         .outputOptions([
           '-c:v libx264',        // Codec H.264
           '-preset medium',      // Qualidade/velocidade
           '-crf 23',             // Qualidade (18-28)
           '-pix_fmt yuv420p',    // Compatibilidade
         ])
         .output(outputPath)
         .on('end', resolve)
         .on('error', reject)
         .run()
     })
   }
   ```

4. **Storage temporário:**
   - Vercel Blob Storage (já configurado)
   - AWS S3
   - Cloudinary (com transformação automática)

**Custos:**
- Processamento: ~1-5 segundos por vídeo de 30s
- Storage: Vercel Blob cobra por GB armazenado
- Alternativa: Cloudinary (conversão incluída no plano)

---

### Opção 2: Client-Side com FFmpeg.wasm (Não Recomendada)

**Vantagens:**
- ✅ Sem custo de servidor
- ✅ Sem upload necessário

**Desvantagens:**
- ❌ Biblioteca muito pesada (~25MB)
- ❌ Lento (conversão pode levar minutos)
- ❌ Alto uso de CPU no navegador
- ❌ Pode travar em dispositivos fracos

**Implementação (se necessário):**
```bash
npm install @ffmpeg/ffmpeg @ffmpeg/util
```

```typescript
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'

async function convertToMP4(webmBlob: Blob): Promise<Blob> {
  const ffmpeg = new FFmpeg()
  await ffmpeg.load()

  // Escrever arquivo de entrada
  await ffmpeg.writeFile('input.webm', await fetchFile(webmBlob))

  // Converter
  await ffmpeg.exec([
    '-i', 'input.webm',
    '-c:v', 'libx264',
    '-preset', 'ultrafast', // Mais rápido para client-side
    '-crf', '28',
    'output.mp4'
  ])

  // Ler resultado
  const data = await ffmpeg.readFile('output.mp4')
  return new Blob([data.buffer], { type: 'video/mp4' })
}
```

---

## Implementação Recomendada (Passo a Passo)

### Sprint: Conversão MP4 Server-Side

**Tarefas:**

1. **Setup do FFmpeg no servidor**
   - [ ] Adicionar FFmpeg ao Docker/Vercel
   - [ ] Verificar licenciamento (FFmpeg é GPL/LGPL)
   - [ ] Testar conversão básica

2. **Criar API de conversão**
   - [ ] `/api/export/video/convert` - Recebe WebM, retorna MP4
   - [ ] Validação de tamanho máximo (ex: 100MB)
   - [ ] Upload para Vercel Blob Storage
   - [ ] Executar FFmpeg
   - [ ] Retornar URL assinada do MP4

3. **Atualizar fluxo no VideoExportButton**
   - [ ] Após exportar WebM, mostrar opção "Converter para MP4"
   - [ ] Upload do WebM para servidor
   - [ ] Loading state durante conversão
   - [ ] Download automático do MP4

4. **Limpeza e otimização**
   - [ ] Deletar arquivos temporários após 1 hora
   - [ ] Limitar conversões simultâneas (fila)
   - [ ] Adicionar custo em créditos (sugestão: +5 créditos)

---

## Alternativa: Usar Serviço Externo

**Cloudinary Video Transformations:**
- Upload WebM → Cloudinary transforma automaticamente
- Suporta MP4, HLS, DASH
- Otimização automática por dispositivo
- Plano gratuito: 25 créditos/mês

```typescript
// Upload e conversão automática
const result = await cloudinary.uploader.upload(webmFile, {
  resource_type: 'video',
  format: 'mp4',
  transformation: [
    { quality: 'auto' },
    { fetch_format: 'mp4' }
  ]
})

// URL do MP4 convertido
const mp4Url = result.secure_url
```

---

## Decisão de Arquitetura

| Aspecto | Server-Side (FFmpeg) | Client-Side (WASM) | Cloudinary |
|---------|---------------------|-------------------|------------|
| **Performance** | ⭐⭐⭐⭐⭐ Rápida | ⭐ Muito lenta | ⭐⭐⭐⭐⭐ Rápida |
| **Custo** | 💰 Computação | 🆓 Gratuito | 💰💰 Assinatura |
| **UX** | ⭐⭐⭐⭐ Bom | ⭐⭐ Ruim | ⭐⭐⭐⭐⭐ Excelente |
| **Complexidade** | 🔨🔨🔨 Média | 🔨🔨🔨🔨 Alta | 🔨 Baixa |
| **Manutenção** | 🔨🔨 Média | 🔨 Baixa | 🔨 Muito baixa |

**Recomendação Final:**
- **Curto prazo**: Manter WebM (funcional e suficiente)
- **Médio prazo**: Cloudinary (rápido de implementar, escalável)
- **Longo prazo**: FFmpeg server-side (controle total, menor custo em escala)

---

## Referências

- [MediaRecorder API](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)
- [FFmpeg.wasm](https://ffmpegwasm.netlify.app/)
- [Cloudinary Video](https://cloudinary.com/documentation/video_manipulation_and_delivery)
- [H.264 vs VP9](https://netflixtechblog.com/a-large-scale-comparison-of-x264-x265-and-libvpx-a-sneak-peek-2e81e88f8b0f)
