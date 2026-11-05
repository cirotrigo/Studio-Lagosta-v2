/**
 * G4.6 · aviso de célula vazia ao agendar: o helper puro único (modal e resolver) e o MODAL real "Agendar Story"
 * montado dentro do `TemplateEditorProvider` real (host sem DOM). O aviso sai do design do editor ANTES de confirmar,
 * o botão segue habilitado, e os `warnings` da resposta viram a descrição do toast. Dublês: o Dialog (guarda o
 * conteúdo sem desenhar), o toast, o crédito, o `useSocialPosts` (nada é agendado) e o `fetch` do upload.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import type { DesignData, Layer, Page } from '@/types/template'

const h = vi.hoisted(() => ({
  paginas: { data: [] as unknown[], isLoading: false, refetch: () => undefined },
  toasts: [] as Array<{ title?: string; description?: string; variant?: string }>,
  conteudo: null as unknown,
  envios: [] as unknown[],
  resposta: { postId: 'post-1' } as { postId: string; warnings?: string[] },
}))
vi.mock('@/hooks/use-pages', () => ({ usePages: () => h.paginas, useUpdatePage: () => ({ mutateAsync: async () => undefined }) }))
vi.mock('@/hooks/use-toast', () => {
  const toast = (t: { description?: string }) => void h.toasts.push(t)
  return { toast, useToast: () => ({ toast }) }
})
vi.mock('@/hooks/use-credits', () => ({ useCobrancaLigada: () => false }))
vi.mock('@/hooks/use-social-posts', () => ({
  useSocialPosts: () => ({
    createPost: {
      mutateAsync: async (dados: unknown) => {
        h.envios.push(dados)
        return h.resposta
      },
    },
  }),
}))
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => children,
  DialogContent: ({ children }: { children: React.ReactNode }) => {
    h.conteudo = children
    return null
  },
  DialogDescription: () => null,
  DialogHeader: () => null,
  DialogTitle: () => null,
}))

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MultiPageProvider } from '@/contexts/multi-page-context'
import { TemplateEditorProvider, type TemplateResource } from '@/contexts/template-editor-context'
import { ScheduleStoryModal } from '@/components/templates/modals/schedule-story-modal'
import { Button } from '@/components/ui/button'
import { avisoDeCelulasVazias, celulasVaziasVisiveis } from '../presenca'
import { emAct, montar } from './suporte/host-sem-dom'
import { BLOB, doisPorDois } from './fixtures'

describe('avisoDeCelulasVazias (puro, o mesmo para o modal e o resolver)', () => {
  const cel = (id: string, grade: string, extra: Record<string, unknown> = {}) => ({ id, type: 'image', metadata: { grade: { id: grade }, groupId: grade }, ...extra })
  it('conta "" e ausente, ignora oculta e foto avulsa; plural e mais de uma grade', () => {
    expect(avisoDeCelulasVazias([cel('a', 'g', { fileUrl: '' })])).toBe('A grade tem 1 célula vazia: ela sai sem foto na arte publicada.')
    expect(celulasVaziasVisiveis([cel('a', 'g', { fileUrl: '' }), cel('b', 'g'), cel('c', 'g', { fileUrl: '', visible: false }), { id: 'f', type: 'image', fileUrl: '' }])).toEqual({ vazias: 2, grades: 1 })
    expect(avisoDeCelulasVazias(JSON.stringify([cel('a', 'g'), cel('b', 'h', { fileUrl: '' })]))).toBe('As grades têm 2 células vazias: elas saem sem foto na arte publicada.')
    expect(avisoDeCelulasVazias([cel('a', 'g', { fileUrl: `${BLOB}/a.jpg` })])).toBeNull()
    expect(avisoDeCelulasVazias('{quebrado')).toBeNull()
  })
})

// ── O modal real ────────────────────────────────────────────────────────────
type Elemento = { type: unknown; props: Record<string, unknown> }
function elementos(no: unknown, saida: Elemento[] = []): Elemento[] {
  if (Array.isArray(no)) no.forEach((n) => elementos(n, saida))
  else if (no && typeof no === 'object' && 'props' in (no as object)) {
    saida.push(no as Elemento)
    elementos((no as Elemento).props.children, saida)
  }
  return saida
}
const texto = (no: unknown): string =>
  typeof no === 'string' ? no : Array.isArray(no) ? no.map(texto).join('') : no && typeof no === 'object' && 'props' in (no as object) ? texto((no as Elemento).props.children) : ''
const botao = (rotulo: string) => elementos(h.conteudo).find((e) => e.type === Button && texto(e.props.children).includes(rotulo))!
const aviso = () => elementos(h.conteudo).find((e) => e.type === 'p' && e.props.role === 'status')

let desmontar: (() => Promise<void>) | null = null
async function abrir(layers: Layer[]) {
  const d = { canvas: { width: 1080, height: 1350, backgroundColor: '#ffffff' }, layers } as DesignData
  h.paginas = { data: [{ id: 'p1', name: 'p1', width: 1080, height: 1350, layers, order: 0 } as unknown as Page], isLoading: false, refetch: () => undefined }
  const t: TemplateResource = { id: 1, name: 'T1', type: 'FEED', dimensions: '1080x1350', designData: d, dynamicFields: [], projectId: 5 }
  const modal = React.createElement(ScheduleStoryModal, {
    open: true, onClose: () => undefined, projectId: 5, templateId: 1, pageId: 'p1',
    onExportImage: async () => 'data:image/jpeg;base64,/9j/AAAA', onExportCreative: async () => { throw new Error('não usado') },
  })
  const m = await montar(
    React.createElement(QueryClientProvider, { client: new QueryClient() },
      React.createElement(MultiPageProvider, { templateId: 1, initialPageId: 'p1' } as React.ComponentProps<typeof MultiPageProvider>,
        React.createElement(TemplateEditorProvider, { template: t } as React.ComponentProps<typeof TemplateEditorProvider>, modal))),
  )
  desmontar = m.desmontar
}
const agir = (f: () => unknown) =>
  emAct(async () => {
    await f()
    for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0))
  })
afterEach(async () => {
  await desmontar?.()
  desmontar = null
  h.toasts.length = 0
  h.envios.length = 0
  h.conteudo = null
  h.resposta = { postId: 'post-1' }
  vi.unstubAllGlobals()
})

describe('modal "Agendar Story" × célula vazia (G4.6)', () => {
  it('avisa ANTES de confirmar, com o botão habilitado; os warnings da resposta vão para o toast', async () => {
    await abrir(doisPorDois([`${BLOB}/a.jpg`, '', '', `${BLOB}/d.jpg`]))
    expect(texto(aviso()!.props.children)).toBe('A grade tem 2 células vazias: elas saem sem foto na arte publicada.')
    await agir(() => (botao('Postar agora').props.onClick as () => void)())
    const confirmar = botao('Publicar agora')
    expect(confirmar.props.disabled).toBe(false)

    vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => ({ url: `${BLOB}/story.jpg` }) }))
    h.resposta = { postId: 'post-1', warnings: ['A grade tem 2 células vazias: elas saem sem foto na arte publicada.'] }
    await agir(() => (confirmar.props.onClick as () => Promise<void>)())
    expect(h.envios).toHaveLength(1)
    expect(h.envios[0]).toMatchObject({ postType: 'STORY', pageId: 'p1', mediaUrls: [`${BLOB}/story.jpg`] })
    expect(h.toasts.at(-1)).toMatchObject({ title: 'Story enviado para publicação!', description: 'A grade tem 2 células vazias: elas saem sem foto na arte publicada.' })
  })

  it('grade cheia: sem aviso, e o toast de sempre (sem descrição)', async () => {
    await abrir(doisPorDois([`${BLOB}/a.jpg`, `${BLOB}/b.jpg`, `${BLOB}/c.jpg`, `${BLOB}/d.jpg`]))
    expect(aviso()).toBeUndefined()
    await agir(() => (botao('Postar agora').props.onClick as () => void)())
    vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => ({ url: `${BLOB}/story.jpg` }) }))
    await agir(() => (botao('Publicar agora').props.onClick as () => Promise<void>)())
    expect(h.toasts.at(-1)).toEqual({ title: 'Story enviado para publicação!' })
  })
})
