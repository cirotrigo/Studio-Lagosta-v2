# 🎨 Setup de Geração de Imagens com IA

## ⚠️ Erro: "Failed to load resource: the server responded with a status of 400/404"

Se você está recebendo este erro ao tentar gerar imagens na aba IA, é porque a variável de ambiente `REPLICATE_API_TOKEN` não está configurada.

## ✅ Como Corrigir

### 1. Obter Token do Replicate

1. Acesse [replicate.com](https://replicate.com) e crie uma conta (ou faça login)
2. Vá para [Account Settings → API Tokens](https://replicate.com/account/api-tokens)
3. Clique em "Create token"
4. Copie o token (começa com `r8_`)

### 2. Configurar no Projeto

1. Abra o arquivo `.env` na raiz do projeto
2. Adicione a seguinte linha:
   ```
   REPLICATE_API_TOKEN=r8_seu_token_aqui
   ```
3. Substitua `r8_seu_token_aqui` pelo token que você copiou

### 3. Reiniciar o Servidor

```bash
npm run dev
```

## ✨ Pronto!

Agora você pode gerar imagens com IA na aba "IA ✨" do editor de templates.

## 📚 Documentação Completa

Para mais detalhes sobre o sistema de geração de imagens, consulte:
- [docs/ai-image-generation.md](./docs/ai-image-generation.md)

## 💡 Custos

A geração de imagens consome créditos do Replicate. Verifique os preços em [replicate.com/pricing](https://replicate.com/pricing).

No sistema do Studio Lagosta, cada geração consome créditos configurados no sistema de créditos interno.
