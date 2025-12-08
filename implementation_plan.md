---
description: Plano de implementação para padronização de UI/UX do Studio Lagosta
---

# Plano de Implementação: Padronização UI/UX Studio Lagosta

Este documento detalha as etapas para alinhar a interface da área interna (`/studio`) com a identidade visual premium e vibrante (Laranja/Dark) estabelecida na página inicial.

## Objetivos
1.  **Unificação Visual**: Garantir que as cores, tipografia e estilos da área logada reflitam a marca "Lagosta Criativa".
2.  **Paleta de Cores**: Substituir tons de ciano/magenta por variações de Laranja Lagosta e tons escuros profundos.
3.  **Componentes**: Atualizar a aparência de botões, cards e inputs para consistência.

## Etapas de Execução

### 1. Atualização do Sistema de Cores (`globals.css`)
O arquivo `globals.css` define as variáveis raiz. Precisamos ajustar as cores primárias e de destaque.

-   **Ação**: Atualizar variáveis CSS para usar a paleta Laranja.
    -   `--primary`: Mudar para o tom laranja principal (similar ao `orange-500` do Tailwind).
    -   `--primary-foreground`: Manter contraste (branco ou preto dependendo do fundo).
    -   `--neon` e `--neon-2`: Ajustar para tons de Laranja/Dourado para manter o efeito de brilho, mas na cor correta.
    -   `--sidebar-primary`: Ajustar para Laranja.

#### Referência de Cores (Baseado na Home)
-   Orange 500: `#f97316` (Aprox. no OKLCH)
-   Orange 600: `#ea580c`
-   Background Dark: `#0a0a0a` ou similar.

### 2. Refatoração do Layout Protegido (`src/app/(protected)/layout.tsx`)
O layout atual usa gradientes ciano/magenta.

-   **Ação**: Atualizar o background `radial-gradient` para usar tons de Laranja e Laranja-Escuro.
-   **Ação**: Verificar o efeito `glass-panel` para garantir que o "brilho" da borda seja laranja/dourado.

### 3. Revisão de Componentes Chave
Alguns componentes podem ter cores hardcoded ou variantes que precisam ser ajustadas.

-   **Sidebar**: Verificar se o ícone ativo e hover states estão usando a cor primária (agora laranja).
-   **Botões**: O componente `Button` padrão deve herdar a nova cor `--primary`.

### 4. Verificação de Páginas Internas
-   Verificar o `Dashboard` em `/studio` para garantir que os cards e gráficos sigam a nova paleta.

## Status das Tarefas
- [x] Atualizar `globals.css` com nova paleta Laranja.
- [x] Ajustar gradientes em `src/app/(protected)/layout.tsx`.
- [ ] Verificar componentes de UI básicos.
