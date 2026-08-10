# PhotoSwipe Lightbox - Galeria de Criativos

## Visão Geral

A galeria de criativos utiliza o [PhotoSwipe v5](https://photoswipe.com/) para exibir as imagens exportadas em um lightbox interativo com zoom, navegação e caption personalizado.

## Arquitetura

### Componentes Principais

1. **`src/hooks/use-photoswipe.ts`** - Hook customizado que gerencia o ciclo de vida do PhotoSwipe
2. **`src/components/projects/gallery-item.tsx`** - Item individual da galeria com suporte a PhotoSwipe
3. **`src/components/projects/creatives-gallery.tsx`** - Componente único da galeria do projeto (aba "Criativos" e rota `/projects/[id]/creativos`, que desde 09/08/2026 é só cabeçalho + este componente)
4. **`src/app/(protected)/criativos/page.tsx`** - Galeria global (todos os projetos), implementação separada

## Navegação em tela de toque (corrigido em 09/08/2026)

O `photoswipe.css` do pacote esconde as setas em **qualquer** aparelho com
toque, e só as revela quando o PhotoSwipe enxerga um mouse:

```css
.pswp--touch     .pswp__button--arrow { visibility: hidden;  }
.pswp--has_mouse .pswp__button--arrow { visibility: visible; }
```

`pswp--touch` entra quando `'ontouchstart' in window || navigator.maxTouchPoints > 1`.
`pswp--has_mouse` entra quando há um `mousedown` de verdade, ou no `updateSize`
se `matchMedia('(any-hover: hover)')` casar. **No iPad e no celular nenhuma das
duas coisas acontece**: a galeria abria com o contador certo ("3 / 60"), a
navegação por gesto funcionando e **nenhum controle à vista**. Quem não
descobria o arrasto concluía que o lightbox "abre uma só" — foi exatamente esse
o relato.

A correção é CSS, em `src/hooks/use-photoswipe.css`, ligada pela opção
`mainClass: 'pswp--nav-sempre-visivel'` do hook:

```css
.pswp.pswp--nav-sempre-visivel .pswp__button--arrow { visibility: visible; }
```

Dois detalhes que não são acidentais:

- **O seletor carrega um `.pswp` a mais** (especificidade 0,3,0 contra 0,2,0 do
  pacote). O Next não garante a ordem entre o CSS de um chunk e o de outro, e
  com a especificidade maior a regra vence sem depender disso.
- **`pswp--one-slide` continua escondendo as setas** quando há um único item,
  porque ali o pacote usa `display: none`, que ganha de `visibility`.

O que **não** era a causa (verificado no navegador, com dados reais): cada item
não monta instância própria — há uma única galeria com listener em
`#creatives-gallery`; o `dataSource` inclui todos os itens (`getNumItems()`
devolveu 60 e depois 64); e a paginação infinita não quebra a navegação, porque
o PhotoSwipe consulta os filhos **no clique**, e o hook reinicializa quando
`filtered.length` muda.

## Vídeo no lightbox

O PhotoSwipe só sabe desenhar imagem. Item marcado com `data-pswp-type="video"`
— galeria de criativos, Drive, seletores do compositor de post — virava um
**slide em branco** no meio da navegação. Desde 09/08/2026 o hook trata o tipo
`video` (mesmo desenho que já existia em
`components/templates/creatives-lightbox.tsx`):

- `contentLoad` monta um `<video controls>` no lugar do conteúdo padrão;
- **sem `autoplay`** — o PhotoSwipe pré-carrega os vizinhos, então abrir uma
  imagem faria tocar a trilha do vídeo ao lado. Quem dá play é o
  `contentActivate`, que só dispara no slide realmente ativo;
- `close`/`contentDestroy` e a limpeza do efeito pausam e soltam os bytes.

O `globals.css` força `video { height: auto !important }` abaixo de 768px; o
`use-photoswipe.css` isenta `.pswp video`, como já fazia com `.pswp__img`.

## O slide ficava EM BRANCO ao navegar (corrigido em 10/08/2026)

Sintoma: contador andando, seta funcionando, tela preta. Parecia falha de
carregamento — não era.

O `globals.css` tem, em `@layer base`:

```css
.container,
[class*="container"] { max-width: 100vw; overflow-x: hidden; }
```

O seletor por **substring** casa com `.pswp__container`, o carrossel do
PhotoSwipe. Medido em produção no instante da falha:

| elemento | transform | overflow |
|---|---|---|
| `.pswp__container` | `−2050px` | **`hidden auto`** |
| slide ativo | `+2050px` | `hidden` |

Os transforms se cancelam e a arte cai no centro da tela, mas o `overflow-x`
faz o contêiner recortar pela **própria caixa**, que está em −2050 — o slide
fica inteiro fora dela. Por isso **o primeiro slide sempre funcionava**
(transform 0) e só quebrava ao navegar.

A correção vive em `src/hooks/use-photoswipe.css`: devolve `overflow: visible`
e `max-width: none` ao contêiner, e anula o `* { max-width: 100% }` dentro do
`.pswp` (o PhotoSwipe dimensiona tudo por style inline e conta com isso). O
arquivo fica **sem camada**, então vence o `@layer base` pela cascata.

**Como isso foi encontrado, porque a próxima vez vai parecer igual:** a `<img>`
estava impecável — `complete: true`, `opacity: 1`, `visibility: visible`,
2160×3840, posicionada dentro da viewport. Quem denunciou foi
`document.elementsFromPoint()` no centro dela, que devolvia
`.pswp__scroll-wrap` e **nunca a imagem**. Caixa correta + ausente no hit-test
do próprio centro = recorte de ancestral. Medir carregamento não enxerga isso.

Ao mexer no `.pswp`, confira com um **controle**: um elemento qualquer com
classe contendo "container" deve continuar saindo `overflow-x: hidden` /
`max-width: 0px`. Se ele mudar, a exceção vazou para o resto do app.

## Miniatura enquanto a arte grande carrega

O pacote usa placeholder de imagem **só no primeiro slide**. O código é
literal (`photoswipe.esm.js`, na criação do placeholder):

```js
this.data.msrc && this.slide.isFirstSlide ? this.data.msrc : false
```

Ao navegar, o placeholder vira um `<div>` vazio e o slide fica **preto** até a
arte chegar. Como os criativos são ~1 MB a 2160×3840 (medido em produção),
isso é quase um segundo de tela vazia por slide fora da rede local — e é com
isso que "navega mas a foto não carrega" se parece.

O filtro oficial `placeholderSrc` estende a miniatura a todos os slides:

```ts
lightbox.addFilter('placeholderSrc', (placeholderSrc, content) =>
  content.data.msrc || placeholderSrc)
```

`msrc` o próprio PhotoSwipe preenche com o `currentSrc` da `<img>` do card —
no nosso caso a miniatura otimizada do Next (`&w=750&q=75`), que já está em
cache porque a pessoa acabou de vê-la no grid.

**Limite conhecido:** card que ainda não renderizou a miniatura (`loading="lazy"`,
bem abaixo da dobra) tem `currentSrc` vazio, então não há o que mostrar e o
comportamento antigo vale para ele. Não quebra — só não ganha o fundo.

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
| `childSelector` | `string` | Seletor CSS dos links clicáveis (ex: `a[data-pswp-src]`) |
| `dependencies` | `unknown[]` | Array de dependências para re-inicializar o lightbox quando mudarem |
| `enabled` | `boolean` | Não inicializa enquanto for `false` (ex: modo lista, lista vazia) |

### Características

- **Uma tentativa e um retry**: se o container ainda não existe, tenta de novo
  depois de 500ms
- **Validação**: Verifica se o container e os filhos existem antes de inicializar
- **Auto-cleanup**: uma limpeza só cancela o retry, para os vídeos e destrói a
  instância — antes o caminho do retry devolvia uma limpeza que só cancelava o
  timer, deixando a instância criada por ele viva num desmonte

## Configuração do PhotoSwipe

### Opções Aplicadas

```typescript
{
  gallery: gallerySelector,
  children: childSelector,
  pswpModule: () => import('photoswipe'),   // Lazy loading

  // Setas visíveis também em tela de toque (ver seção acima)
  mainClass: 'pswp--nav-sempre-visivel',

  preload: [1, 3],            // 1 anterior + 3 próximas
  loop: true,
  showHideAnimationType: 'fade',
  wheelToZoom: true,
  bgOpacity: 0.92,
  pinchToClose: true,
  closeOnVerticalDrag: true,
  showAnimationDuration: 200,
  hideAnimationDuration: 150,
  zoom: true,
  clickToCloseNonZoomable: true,
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

- [x] ~~Adicionar suporte a vídeos~~ — feito em 09/08/2026 (seção acima)
- [ ] Implementar share buttons no lightbox
- [ ] Criar preset de opções por tipo de template (Story, Feed, Square)
- [ ] Adicionar analytics de visualizações no lightbox
