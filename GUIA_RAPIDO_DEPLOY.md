# 🚀 Guia Rápido de Deploy - Correções de Vídeo

## ✅ O que foi corrigido

### 1. Acesso de Membros da Organização
- ✅ Corrigida validação de projetos compartilhados
- ✅ Agora usa `organization.clerkOrgId` corretamente
- ✅ Logs detalhados adicionados

### 2. FFmpeg no Vercel ⭐ NOVO
- ✅ **Instalado `ffmpeg-static`** - Pacote otimizado para serverless
- ✅ Código prioriza `ffmpeg-static` sobre `@ffmpeg-installer/ffmpeg`
- ✅ Fallback automático entre pacotes
- ✅ Logs mais informativos
- ✅ Endpoint de teste criado (`/api/test-ffmpeg`)
- ✅ **Testado localmente** - FFmpeg disponível!

---

## 📝 Passo a Passo para Deploy

### Etapa 1: Commit e Push das Alterações

```bash
# 1. Verificar alterações
git status

# 2. Adicionar arquivos modificados
git add .

# 3. Commit
git commit -m "Fix: Corrigir acesso de organização e configurar FFmpeg

- Fix project ownership validation to support organization members
- Add organization.clerkOrgId lookup in video processing queue
- Improve FFmpeg path resolution with Vercel-specific paths
- Add /api/test-ffmpeg endpoint for debugging
- Add detailed logging for troubleshooting"

# 4. Push para o repositório
git push origin main
```

### Etapa 2: Deploy no Vercel

O Vercel deve fazer deploy automaticamente após o push. Caso contrário:

```bash
# Deploy manual
npm run deploy:vercel
```

Ou via dashboard:
1. Acesse https://vercel.com/dashboard
2. Vá no projeto Studio Lagosta v2
3. Clique em "Deployments"
4. Se não houver deploy automático, clique em "Redeploy"

---

## 🧪 Etapa 3: Testar as Correções

### Teste 1: Verificar FFmpeg (PRIORITÁRIO)

```bash
# Após deploy, acesse:
https://studio-lagosta-v2.vercel.app/api/test-ffmpeg
```

**Resultado esperado:**
```json
{
  "summary": {
    "foundPaths": ["/algum/caminho/ffmpeg"],
    "totalFound": 1
  }
}
```

**Se `totalFound = 0`**, vá para **"Etapa 4: Configurar FFmpeg"** abaixo.

**Se `totalFound > 0`**, o FFmpeg está funcionando! ✅

### Teste 2: Exportar Vídeo como Membro da Organização

1. Entre com a conta do **membro** (não admin)
2. Abra um projeto compartilhado com a organização
3. Abra um template com vídeo
4. Clique em "Exportar Vídeo MP4"
5. Verifique os logs no console do navegador

**Resultado esperado:**
- ✅ Upload completa (100%)
- ✅ Job criado com sucesso
- ✅ Polling iniciado
- ⚠️ Pode falhar no processamento se FFmpeg não estiver configurado

---

## ⚙️ Etapa 4: Configurar FFmpeg (Se Necessário)

Se o teste mostrou `totalFound = 0`, siga estes passos:

### Opção A: Adicionar Variável de Ambiente

1. Acesse **Vercel Dashboard**
2. Vá em **Settings** → **Environment Variables**
3. Adicione a variável:

   ```
   Nome: FFMPEG_PATH
   Valor: /var/task/node_modules/@ffmpeg-installer/ffmpeg/ffmpeg
   ```

4. Selecione todos os ambientes:
   - ✅ Production
   - ✅ Preview
   - ✅ Development

5. Clique em **Save**

6. **IMPORTANTE**: Faça um **Redeploy**:
   - Vá em "Deployments"
   - Clique nos 3 pontos do último deploy
   - Clique em "Redeploy"

7. Aguarde o deploy completar

8. Teste novamente: `/api/test-ffmpeg`

### Opção B: Se ainda não funcionar

Veja o arquivo completo: [FFMPEG_VERCEL_SETUP.md](./FFMPEG_VERCEL_SETUP.md)

Alternativas:
- Usar serviço externo de conversão (Cloudinary, Mux)
- Hospedar processamento em Railway/Render
- Usar AWS Lambda com FFmpeg Layer

---

## 📊 Verificar Logs no Vercel

1. Acesse **Vercel Dashboard**
2. Vá em **Deployments** → Último deploy
3. Clique em "View Function Logs"
4. Filtre por `/api/video-processing`

**Procure por:**
- `[Queue Video] Iniciando enfileiramento` ✅
- `[Queue Video] Validando acesso ao projeto` ✅
- `[Queue Video] Resultado da validação` ✅
- `[FFmpeg] Testando caminho` ⚠️
- `[FFmpeg] ✅ Binário encontrado` ✅ (esperado)

---

## 🐛 Solução de Problemas

### Problema: "Projeto não encontrado ou acesso negado"

**Causa**: Membro não está na organização ou projeto não está compartilhado

**Verificar:**
```bash
# Endpoint de debug (criar se necessário):
GET /api/test-org-access?projectId=123

# Retorna:
# - userId
# - orgId
# - Detalhes do projeto e organizações vinculadas
```

**Solução:**
1. Verifique se o membro está na organização no Clerk Dashboard
2. Verifique se o projeto está compartilhado: tabela `OrganizationProject`

### Problema: FFmpeg não encontrado

**Causa**: Binário não está no servidor Vercel

**Solução:**
1. Siga "Etapa 4: Configurar FFmpeg" acima
2. Se não funcionar, considere alternativas no [FFMPEG_VERCEL_SETUP.md](./FFMPEG_VERCEL_SETUP.md)

### Problema: Timeout no processamento

**Causa**: Vídeo muito grande ou processamento lento

**Verificar:**
- Duração do vídeo
- Tamanho do arquivo WebM
- Configuração de timeout no `vercel.json` (já está em 300s)

**Solução:**
- Reduzir qualidade do vídeo (preset: 'fast' → 'ultrafast')
- Processar offline/em background

---

## 📞 Suporte

Se ainda houver problemas após seguir este guia:

1. **Verificar logs detalhados** no Vercel
2. **Copiar mensagem de erro completa**
3. **Compartilhar resposta do `/api/test-ffmpeg`**
4. **Compartilhar logs do navegador** (Console)

---

## ✨ Checklist Final

Antes de considerar concluído:

- [ ] Deploy realizado com sucesso
- [ ] `/api/test-ffmpeg` retorna `totalFound > 0`
- [ ] Membro da organização consegue criar job de vídeo
- [ ] Admin consegue criar job de vídeo
- [ ] Processamento completa com sucesso (status COMPLETED)
- [ ] MP4 é gerado e armazenado no Blob
- [ ] Vídeo aparece na aba "Criativos"

---

**Boa sorte! 🚀**
