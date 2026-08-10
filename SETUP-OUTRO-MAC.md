# Setup Studio Lagosta no Outro Mac

## Pré-requisitos manuais

1. Instalar Claude Code: `npm i -g @anthropic-ai/claude-code`
2. Copiar o arquivo `.env` do Mac principal para algum lugar acessível (AirDrop, iCloud, etc.)

## Prompt

Abra o terminal, rode `claude` e cole o prompt abaixo:

---

```
Configure este Mac para trabalhar com o Studio Lagosta. Execute todos os passos abaixo na ordem, sem pular nenhum.

## 1. Clonar o projeto

```bash
cd ~/Documents
git clone https://github.com/cirotrigo/Studio-Lagosta-v2.git
cd Studio-Lagosta-v2
npm install
```

## 2. Copiar o .env

O usuário vai fornecer o arquivo .env separadamente. Por enquanto crie um .env vazio e avise que precisa ser preenchido:

```bash
cp .env.example .env 2>/dev/null || touch .env
```

Avise o usuário para preencher o .env com as variáveis do Mac principal (DATABASE_URL, CLERK keys, GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, GOOGLE_DRIVE_REFRESH_TOKEN, etc).

## 3. Clonar as Skills do Studio Lagosta

```bash
mkdir -p ~/.claude/skills
cd ~/.claude/skills
git clone https://github.com/cirotrigo/conteudo-instagram.git
```

Criar symlinks para as satellite skills:

```bash
cd ~/.claude/skills
ln -sf conteudo-instagram/satellite-skills/analyze-drive-images analyze-drive-images
ln -sf conteudo-instagram/satellite-skills/content-planner content-planner
ln -sf conteudo-instagram/satellite-skills/create-copy create-copy
ln -sf conteudo-instagram/satellite-skills/create-template-pages create-template-pages
ln -sf conteudo-instagram/satellite-skills/schedule-content schedule-content
```

## 4. Configurar MCP Servers

### 4.1 Garantir permissão do wrapper script

O projeto inclui um wrapper (`scripts/mcp-wrapper.sh`) que resolve o node/npx automaticamente, independente de como foi instalado (nvm, homebrew, volta, fnm, instalador oficial). Verificar:

```bash
cd ~/Documents/Studio-Lagosta-v2
chmod +x scripts/mcp-wrapper.sh
```

### 4.2 Testar o MCP server localmente

Rodar este comando para verificar se o server inicia:

```bash
cd ~/Documents/Studio-Lagosta-v2
./scripts/mcp-wrapper.sh < /dev/null 2>&1 & PID=$!; sleep 2; kill $PID 2>/dev/null; wait $PID 2>/dev/null
```

Deve imprimir: `[studio-lagosta-mcp] Server started on stdio`

Se der erro de módulo não encontrado, rodar:
```bash
npx prisma generate
```
E testar novamente.

### 4.3 Configurar ~/.claude/mcp_servers.json

Escreva o arquivo `~/.claude/mcp_servers.json` com este conteúdo (substituindo USUARIO pelo nome do usuário deste Mac):

```json
{
  "mcpServers": {
    "ai-context": {
      "command": "npx",
      "args": ["-y", "@ai-coders/context@latest", "mcp"],
      "env": {}
    },
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp@latest"],
      "env": {}
    },
    "studio-lagosta": {
      "command": "./scripts/mcp-wrapper.sh",
      "cwd": "/Users/USUARIO/Documents/Studio-Lagosta-v2"
    }
  }
}
```

IMPORTANTE: substitua `/Users/USUARIO/Documents/Studio-Lagosta-v2` pelo caminho absoluto real onde o projeto foi clonado. Use `pwd` no terminal para descobrir.

### 4.4 Verificar o .mcp.json do projeto

O arquivo `.mcp.json` na raiz do projeto já deve estar correto (veio com o git clone). Verificar se contém:

```json
{
  "mcpServers": {
    "studio-lagosta": {
      "type": "stdio",
      "command": "./scripts/mcp-wrapper.sh",
      "cwd": "/Users/USUARIO/Documents/Studio-Lagosta-v2"
    }
  }
}
```

Se o `cwd` estiver com o path do outro Mac, corrija para o path deste Mac.

## 5. Instalar Playwright (para exportação de stories e carrosséis)

```bash
pip3 install playwright && playwright install chromium
```

## 6. Gerar o Prisma client

```bash
cd ~/Documents/Studio-Lagosta-v2
npx prisma generate
```

Nota: NÃO rode `prisma db push` — o banco de dados já existe e é compartilhado. Só precisa gerar o client local.

## 7. Verificação final

Liste o que foi configurado e confirme cada item:

- [ ] Node >= 18 instalado (`node --version`)
- [ ] Projeto em ~/Documents/Studio-Lagosta-v2 (`ls package.json`)
- [ ] node_modules instalado (`ls node_modules/.package-lock.json`)
- [ ] Prisma client gerado (`ls node_modules/.prisma/client/`)
- [ ] Wrapper com permissão de execução (`ls -la scripts/mcp-wrapper.sh`)
- [ ] MCP server inicia sem erro (teste do passo 4.2)
- [ ] Skills em ~/.claude/skills/ (6 pastas: conteudo-instagram + 5 symlinks)
- [ ] MCP servers em ~/.claude/mcp_servers.json (3 servers com cwd correto)
- [ ] .mcp.json com cwd correto para este Mac
- [ ] Playwright instalado (`python3 -c "from playwright.sync_api import sync_playwright; print('ok')"`)

Avise o usuário que:
1. Precisa preencher o .env com as credenciais do Mac principal
2. Precisa reiniciar o Claude Code (sair e entrar de novo) para carregar os MCP servers
3. Para testar após reiniciar: dizer "liste os projetos" — deve retornar os projetos do Studio Lagosta

Execute tudo agora.
```
