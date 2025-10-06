# PhotoSwipe Lightbox - Galeria de Criativos

## Visão Geral

A galeria de criativos utiliza o [PhotoSwipe v5](https://photoswipe.com/) para exibir as imagens exportadas em um lightbox interativo com zoom, navegação e caption personalizado.

## Arquitetura

### Componentes Principais

1. **`src/hooks/use-photoswipe.ts`** - Hook customizado que gerencia o ciclo de vida do PhotoSwipe
2. **`src/components/projects/gallery-item.tsx`** - Item individual da galeria com suporte a PhotoSwipe
3. **`src/app/(protected)/projects/[id]/creativos/page.tsx`** - Página da galeria de criativos
4. **`src/components/projects/creatives-gallery.tsx`** - Componente reutilizável da galeria

## Hook `usePhotoSwipe`

### Uso

```typescript
import { usePhotoSwipe } from '@/hooks/use-photoswipe'

const MyGallery = () => {
  const { data, isLoading } = useQuery(...)
  const filtered = useMemo(() => filterData(data), [data])

  // Inicializar PhotoSwipe
  usePhotoSwipe({
    gallerySelector: '#my-gallery',
    childSelector: 'a',
    dependencies: [filtered.length, isLoading], // Re-init quando mudar
  })

  return (
    <div id="my-gallery">
      {filtered.map(item => (
        <a
          href={item.imageUrl}
          data-pswp-width={item.width}
          data-pswp-height={item.height}
        >
          <img src={item.imageUrl} alt={item.title} />
        </a>
      ))}
    </div>
  )
}
```

### Parâmetros

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `gallerySelector` | `string` | Seletor CSS do container da galeria (ex: `#creatives-gallery`) |
| `childSelector` | `string` | Seletor CSS dos links clicáveis (ex: `a`) |
| `dependencies` | `unknown[]` | Array de dependências para re-inicializar o lightbox quando mudarem |

### Características

- **Retry Logic**: Tenta inicializar até 5 vezes com intervalo de 200ms (útil para dados assíncronos)
- **Validação**: Verifica se o container e os filhos existem antes de inicializar
- **Auto-cleanup**: Destrói a instância anterior ao re-inicializar ou desmontar
- **Logging**: Console logs para debug (podem ser removidos em produção)

## Configuração do PhotoSwipe

### Opções Aplicadas

```typescript
{
  gallery: '#creatives-gallery',
  children: 'a',
  pswpModule: () => import('photoswipe'), // Lazy loading

  // Padding responsivo
  paddingFn: (viewportSize) => ({
    top: 30,
    bottom: 30,
    left: viewportSize.x < 768 ? 0 : 20,
    right: viewportSize.x < 768 ? 0 : 20,
  }),

  // Aparência
  bgOpacity: 0.9,
  showHideAnimationType: 'zoom',

  // Zoom
  initialZoomLevel: 'fit',      // Imagem ajustada à tela
  secondaryZoomLevel: 1.5,      // Zoom ao clicar
  maxZoomLevel: 3,              // Zoom máximo
}
```

### Caption

O caption foi **removido intencionalmente** para não interferir com extensões do Chrome que adicionam botões no rodapé do lightbox (ex: extensões de download, tradução, etc).

## Estrutura HTML Necessária

### Link com Atributos PhotoSwipe

```html
<a
  href="https://example.com/image.jpg"
  data-pswp-width="1080"
  data-pswp-height="1920"
  target="_blank"
  rel="noopener noreferrer"
  class="cursor-zoom-in"
>
  <img src="..." alt="..." />
</a>
```

### Atributos Importantes

| Atributo | Tipo | Obrigatório | Descrição |
|----------|------|-------------|-----------|
| `href` | string | ✅ | URL da imagem em alta resolução |
| `data-pswp-width` | number | ✅ | Largura real da imagem em pixels |
| `data-pswp-height` | number | ✅ | Altura real da imagem em pixels |
| `target="_blank"` | string | ⚠️ | Fallback se PhotoSwipe falhar |
| `rel="noopener noreferrer"` | string | ⚠️ | Segurança ao abrir em nova aba |

⚠️ **Importante**: `data-pswp-width` e `data-pswp-height` devem ser **números**, não strings!

## Componente GalleryItem

### Props

```typescript
interface GalleryItemProps {
  id: string
  imageUrl: string
  title: string
  date: string
  templateType: 'STORY' | 'FEED' | 'SQUARE'
  selected: boolean
  hasDriveBackup?: boolean
  onToggleSelect: () => void
  onDownload: () => void
  onDelete: () => void
  onDriveOpen?: () => void
  index: number
  pswpWidth: number   // Largura para PhotoSwipe
  pswpHeight: number  // Altura para PhotoSwipe
}
```

### Características

- **Lazy Loading**: Carrega dimensões reais da imagem ao montar
- **Intersection Observer**: Animação de entrada apenas quando visível
- **Grid Responsivo**: Ajusta col-span e row-span baseado no aspect ratio
- **Pointer Events**: Elementos internos têm `pointer-events-none` para não bloquear cliques
- **Hover Effects**: Gradiente e informações aparecem ao passar o mouse
- **Sem Caption no Lightbox**: Rodapé livre para extensões do navegador

## Navegação e Controles

### Teclado

- **←/→**: Navegar entre imagens
- **ESC**: Fechar lightbox
- **+/-**: Zoom in/out

### Mouse/Touch

- **Clique**: Abrir lightbox
- **Scroll/Pinch**: Zoom in/out
- **Arrastar**: Navegar (quando há zoom)
- **Clique no botão X**: Fechar

## Troubleshooting

### Problema: Abre em nova aba ao invés do lightbox

**Causas possíveis**:
1. PhotoSwipe não inicializou antes do clique
2. Container `#creatives-gallery` não existe
3. Links `<a>` não estão como filhos diretos

**Soluções**:
1. Verificar logs no console: "PhotoSwipe: Initialized successfully"
2. Adicionar `dependencies` no hook para re-init quando dados carregarem
3. Garantir que os links estejam dentro do container correto

### Problema: Imagens aparecem pequenas no lightbox

**Causa**: Dimensões incorretas em `data-pswp-width` e `data-pswp-height`

**Solução**:
```typescript
// ❌ ERRADO - String
data-pswp-width="1080"

// ✅ CORRETO - Número
data-pswp-width={1080}
```

### Problema: Extensões do Chrome não funcionam

**Causa**: Caption ou outros elementos sobrepondo a área de extensões

**Solução**: O caption foi removido da implementação atual. O lightbox agora mostra apenas a imagem sem sobreposições no rodapé.

## Performance

### Otimizações Aplicadas

1. **Lazy Loading do Módulo**: `pswpModule: () => import('photoswipe')`
2. **Intersection Observer**: Animações apenas para itens visíveis
3. **Image Loading**: Next.js Image com `loading="lazy"`
4. **Retry com Limite**: Máximo 5 tentativas de inicialização
5. **Cleanup Automático**: Destrói instância ao desmontar

### Métricas

- **Bundle Size**: ~40KB (PhotoSwipe v5)
- **Inicialização**: ~200-1000ms (dependendo do número de imagens)
- **Memória**: ~5-10MB por instância

## Dependências

```json
{
  "photoswipe": "^5.4.4"
}
```

## Recursos Adicionais

- [PhotoSwipe Documentation](https://photoswipe.com/getting-started/)
- [PhotoSwipe API](https://photoswipe.com/api/)
- [PhotoSwipe Events](https://photoswipe.com/events/)
- [PhotoSwipe Options](https://photoswipe.com/options/)

## Próximas Melhorias

- [ ] Adicionar suporte a keyboard navigation customizado
- [ ] Implementar share buttons no lightbox
- [ ] Adicionar suporte a vídeos
- [ ] Criar preset de opções por tipo de template (Story, Feed, Square)
- [ ] Adicionar analytics de visualizações no lightbox
