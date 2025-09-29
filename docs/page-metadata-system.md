# Sistema de Metadados de Página

## Visão Geral

O sistema de metadados de página fornece uma maneira modular e centralizada de gerenciar títulos, descrições e breadcrumbs em toda a aplicação protegida.

## Componentes Principais

### 1. PageMetadataProvider
Contexto que envolve o layout protegido e gerencia o estado dos metadados.

### 2. PageHeader
Componente que renderiza automaticamente os breadcrumbs, título e descrição baseados no contexto.

### 3. Hooks Disponíveis

#### `useSetPageMetadata`
Hook principal para definir metadados completos da página.

```tsx
import { useSetPageMetadata } from "@/contexts/page-metadata";

export default function MyPage() {
  useSetPageMetadata({
    title: "Título da Página",
    description: "Descrição da página",
    breadcrumbs: [
      { label: "Início", href: "/dashboard" },
      { label: "Minha Página" }
    ],
    showBreadcrumbs: true // opcional, padrão é true
  });
  
  return <div>Conteúdo da página</div>;
}
```

#### `usePageConfig` (Helper Simplificado)
Hook helper que simplifica a configuração de metadados.

```tsx
import { usePageConfig } from "@/hooks/use-page-config";

// Forma simples
usePageConfig("Título", "Descrição");

// Com breadcrumbs
usePageConfig("Título", "Descrição", [
  { label: "Início", href: "/dashboard" },
  { label: "Página Atual" }
]);

// Com objeto completo
usePageConfig({
  title: "Título",
  description: "Descrição",
  showBreadcrumbs: false
});
```

## Recursos

### Breadcrumbs Automáticos
Se não forem fornecidos breadcrumbs customizados, o sistema gera automaticamente baseado na URL atual.

### Renderização Condicional
O `PageHeader` só renderiza se houver metadados definidos. Se apenas breadcrumbs estiverem presentes (sem título/descrição), apenas os breadcrumbs serão mostrados.

### Integração com Layout
O `PageHeader` é renderizado automaticamente no layout protegido, não sendo necessário incluí-lo em cada página.

## Exemplos de Uso

### Página do Dashboard
```tsx
export default function DashboardPage() {
  const { user } = useUser();
  
  usePageConfig(
    `Bem-vindo, ${user?.firstName || "Usuário"}!`,
    "Aqui está uma visão geral da sua conta"
  );
  
  return <DashboardContent />;
}
```

### Página de Perfil
```tsx
export default function ProfilePage() {
  usePageConfig({
    title: "Configurações de Perfil",
    description: "Gerencie suas informações pessoais",
    breadcrumbs: [
      { label: "Início", href: "/dashboard" },
      { label: "Perfil" }
    ]
  });
  
  return <UserProfile />;
}
```

### Página sem Breadcrumbs
```tsx
export default function SpecialPage() {
  usePageConfig({
    title: "Página Especial",
    showBreadcrumbs: false
  });
  
  return <SpecialContent />;
}
```

## Migração de Páginas Existentes

Para migrar páginas existentes:

1. Remova importações de `BreadcrumbNav`
2. Remova elementos `<h1>` e `<p>` de título/descrição
3. Adicione `"use client"` no topo do arquivo
4. Importe e use `usePageConfig` ou `useSetPageMetadata`
5. Defina os metadados apropriados

### Antes:
```tsx
import { BreadcrumbNav } from "@/components/navigation/breadcrumb-nav";

export default function MyPage() {
  return (
    <div>
      <BreadcrumbNav customItems={[...]} />
      <h1>Título</h1>
      <p>Descrição</p>
      <Content />
    </div>
  );
}
```

### Depois:
```tsx
"use client";
import { usePageConfig } from "@/hooks/use-page-config";

export default function MyPage() {
  usePageConfig("Título", "Descrição");
  
  return <Content />;
}
```

## Benefícios

1. **Centralização**: Todos os metadados em um único lugar
2. **Consistência**: Interface uniforme em todas as páginas
3. **Manutenibilidade**: Mudanças no layout afetam todas as páginas
4. **Flexibilidade**: Suporta configurações automáticas e customizadas
5. **Performance**: Evita re-renderizações desnecessárias com memoização
6. **DX**: API simples e intuitiva
