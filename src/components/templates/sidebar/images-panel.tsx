"use client"

import * as React from 'react'
import Image from 'next/image'
import { createApi } from 'unsplash-js'
import { Loader2, Search } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useTemplateEditor, createDefaultLayer } from '@/contexts/template-editor-context'
import { useDebouncedValue } from '@/hooks/use-debounced-value'

interface UnsplashPhoto {
  id: string
  alt_description: string | null
  urls: {
    small: string
    regular: string
  }
}

const UNSPLASH_ACCESS_KEY = process.env.NEXT_PUBLIC_UNSPLASH_ACCESS_KEY

export function ImagesPanel() {
  const { addLayer } = useTemplateEditor()
  const [search, setSearch] = React.useState('creative design')
  const debouncedSearch = useDebouncedValue(search, 500)
  const [photos, setPhotos] = React.useState<UnsplashPhoto[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const unsplashApi = React.useMemo(() => {
    if (!UNSPLASH_ACCESS_KEY) return null
    return createApi({ accessKey: UNSPLASH_ACCESS_KEY })
  }, [])

  const fetchPhotos = React.useCallback(
    async (query: string) => {
      if (!unsplashApi) {
        setError('Defina NEXT_PUBLIC_UNSPLASH_ACCESS_KEY para usar a biblioteca do Unsplash.')
        return
      }
      setLoading(true)
      setError(null)
      try {
        const result = await unsplashApi.search.getPhotos({
          query,
          page: 1,
          perPage: 24,
          orientation: 'landscape',
        })
        if (result.type === 'success') {
          setPhotos(result.response.results as UnsplashPhoto[])
        } else {
          setError('Não foi possível carregar imagens do Unsplash.')
        }
      } catch (err) {
        console.error('[ImagesPanel] Unsplash request failed', err)
        setError('Erro ao conectar com o Unsplash.')
      } finally {
        setLoading(false)
      }
    },
    [unsplashApi],
  )

  React.useEffect(() => {
    if (debouncedSearch) {
      void fetchPhotos(debouncedSearch)
    }
  }, [debouncedSearch, fetchPhotos])

  const handleAddImage = React.useCallback(
    (photo: UnsplashPhoto) => {
      const base = createDefaultLayer('image')
      addLayer({
        ...base,
        name: photo.alt_description ? `Imagem - ${photo.alt_description}` : 'Imagem Unsplash',
        fileUrl: photo.urls.regular,
        style: {
          ...base.style,
          objectFit: 'cover',
        },
      })
    },
    [addLayer],
  )

  return (
    <div className="flex h-full min-h-[400px] flex-col gap-3 rounded-lg border border-border/40 bg-card/60 p-4 shadow-sm">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Imagens</h3>
        <p className="text-xs text-muted-foreground">Busque imagens livres via Unsplash.</p>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar imagens..."
              className="pl-8"
            />
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => debouncedSearch && fetchPhotos(debouncedSearch)}
            disabled={loading}
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Atualizar
          </Button>
        </div>
        {!UNSPLASH_ACCESS_KEY && (
          <p className="rounded-md border border-dashed border-border/60 bg-muted/40 p-2 text-xs text-muted-foreground">
            Adicione a variável <code className="font-mono">NEXT_PUBLIC_UNSPLASH_ACCESS_KEY</code> para habilitar o Unsplash.
          </p>
        )}
      </div>
      <ScrollArea className="flex-1">
        <div className="grid gap-3 pr-2 md:grid-cols-2">
          {loading &&
            Array.from({ length: 6 }).map((_, index) => (
              <div key={`img-skeleton-${index}`} className="overflow-hidden rounded-lg border border-border/40 bg-muted/40">
                <Skeleton className="h-32 w-full" />
              </div>
            ))}

          {!loading && error && (
            <div className="col-span-full rounded-lg border border-dashed border-red-300 bg-red-50 p-4 text-xs text-red-600">
              {error}
            </div>
          )}

          {!loading && !error && photos.length === 0 && (
            <div className="col-span-full rounded-lg border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
              Nenhum resultado encontrado.
            </div>
          )}

          {photos.map((photo) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => handleAddImage(photo)}
              className="group overflow-hidden rounded-lg border border-border/40 bg-muted/40 text-left transition hover:border-primary"
            >
              <div className="relative h-32 w-full">
                <Image
                  src={photo.urls.small}
                  alt={photo.alt_description ?? 'Imagem do Unsplash'}
                  fill
                  sizes="200px"
                  className="object-cover transition group-hover:scale-105"
                  unoptimized
                />
              </div>
              <div className="px-3 py-2 text-xs">
                <p className="truncate font-medium text-foreground">
                  {photo.alt_description ?? 'Imagem Unsplash'}
                </p>
                <p className="text-muted-foreground">Clique para adicionar</p>
              </div>
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
