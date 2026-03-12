# Lagosta Tools — Desktop App

App desktop Electron para agendamento de posts do Studio Lagosta.

## Requisitos

- Node.js 18+
- macOS (arm64 ou x64)

## Instalação

```bash
cd desktop-app
npm install
```

## Desenvolvimento

```bash
# Iniciar apenas o Vite (React)
npm run dev

# Iniciar Vite + Electron juntos
npm run dev:electron
```

## Build

```bash
# Build de produção (renderer + main)
npm run build

# Gerar .dmg para distribuição
npm run package
```

O arquivo `.dmg` será gerado em `desktop-app/release/`.

## Estrutura

```
desktop-app/
├── electron/           # Electron main process
│   ├── main.ts         # Janela principal, IPC handlers
│   ├── preload.ts      # Context bridge
│   └── ipc/
│       ├── image-processor.ts  # Sharp (processamento de imagens)
│       └── secure-storage.ts   # Keychain (token seguro)
├── src/                # React renderer
│   ├── components/     # Componentes UI
│   ├── hooks/          # React Query hooks
│   ├── pages/          # Páginas
│   ├── stores/         # Zustand stores
│   └── lib/            # Utilitários
└── resources/          # Ícones e assets
```

## Autenticação

1. Acesse o Studio Lagosta web em [studio-lagosta-v2.vercel.app](https://studio-lagosta-v2.vercel.app)
2. Vá para Configurações > API & Integrações
3. Copie seu token de acesso
4. Cole no app desktop na tela de login

O token é armazenado de forma segura no Keychain do macOS.

## Funcionalidades

- **Agendador de Posts**: Crie e agende posts para Instagram
- **Processamento Local**: Imagens são redimensionadas localmente via Sharp
- **Geração de Legendas**: Use IA para gerar legendas criativas
- **Tema Escuro**: Interface consistente com o Studio Lagosta web

## Stack Técnica

- **Electron**: Runtime desktop
- **React 18**: UI
- **Vite**: Bundler
- **TypeScript**: Tipagem
- **Tailwind CSS**: Estilos
- **TanStack Query**: Data fetching
- **Zustand**: Estado global
- **Sharp**: Processamento de imagens

## Troubleshooting

### Erro: Cannot read properties of undefined (reading 'login')

**Causa:** A bridge Electron (`window.electronAPI`) não está disponível. Isso acontece quando o app é aberto diretamente no navegador em vez de via Electron.

**Solução:** Execute o app com Electron:

```bash
npm --prefix desktop-app run dev:electron
```

**Validação no DevTools:**

1. Abra o DevTools (Cmd+Option+I)
2. No Console, digite: `window.electronAPI`
3. Se retornar `undefined`, a bridge não está carregada
4. Se retornar um objeto com métodos (`login`, `getCookies`, etc.), está OK

**Por que isso acontece:**
- `npm run dev` inicia apenas o Vite (React) — abre no navegador
- `npm run dev:electron` inicia Vite + Electron juntos — usa a bridge IPC

## API Consumida

O app se conecta à API do Studio Lagosta em produção:
- Base URL: `https://studio-lagosta-v2.vercel.app`
- Autenticação: Bearer token (Clerk)
