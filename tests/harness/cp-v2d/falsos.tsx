/**
 * Os módulos falsos do harness do CP-V2d (a lista e o motivo de cada um estão em `bundle.ts`, `FALSOS`). Inertes:
 * nada aqui decide rail, painel, inserção, desfazer ou gravação. O `EditorCanvas` falso é a SONDA: lê o contexto REAL
 * do editor e o expõe em `window.__v2d` (o stage Konva, e com ele o atalho Ctrl/⌘+Z, fica fora da prova).
 */
import * as React from 'react'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import type { DesignData } from '@/types/template'

export interface SondaV2d {
  design: () => DesignData
  selecionadas: () => string[]
  canUndo: () => boolean
  canRedo: () => boolean
  undo: () => void
  redo: () => void
  projectId: () => number
}
declare global {
  interface Window {
    __v2d?: SondaV2d
  }
}

// next/image
export default function Imagem({ src, alt, fill: _fill, ...resto }: { src: string; alt: string; fill?: boolean } & Record<string, unknown>) {
  return <img src={src} alt={alt} {...(resto as React.ImgHTMLAttributes<HTMLImageElement>)} />
}

// next/navigation
const roteador = { push() {}, replace() {}, back() {}, forward() {}, refresh() {}, prefetch() {} }
export const useRouter = () => roteador
export const usePathname = () => '/templates/harness'
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
export const useSelectedLayoutSegments = () => []
export const useSelectedLayoutSegment = () => null
export function redirect(): never {
  throw new Error('redirect não existe no harness')
}
export const permanentRedirect = redirect
export const notFound = redirect
export const RedirectType = { push: 'push', replace: 'replace' }

// @clerk/nextjs (nenhum provedor do Clerk é montado; nada aqui fala com o Clerk)
const Nada = () => null
const Filhos = ({ children }: { children?: React.ReactNode }) => <>{children}</>
export const SignedIn = Filhos
export const SignedOut = Nada
export const SignIn = Nada
export const SignUp = Nada
export const SignInButton = Nada
export const UserButton = Nada
export const OrganizationList = Nada
export const OrganizationProfile = Nada
export const OrganizationSwitcher = Nada
export const useAuth = () => ({ isLoaded: true, isSignedIn: true, userId: 'harness', orgId: null, getToken: async () => null })
export const useUser = () => ({ isLoaded: true, isSignedIn: true, user: { id: 'harness', fullName: 'Harness', primaryEmailAddress: null } })
export const useOrganization = () => ({ isLoaded: true, organization: null, membership: null })

// ./editor-canvas → a sonda
export function EditorCanvas() {
  const editor = useTemplateEditor()
  const ref = React.useRef(editor)
  ref.current = editor
  React.useEffect(() => {
    window.__v2d = {
      design: () => JSON.parse(JSON.stringify(ref.current.design)) as DesignData,
      selecionadas: () => [...ref.current.selectedLayerIds],
      canUndo: () => ref.current.canUndo,
      canRedo: () => ref.current.canRedo,
      undo: () => ref.current.undo(),
      redo: () => ref.current.redo(),
      projectId: () => ref.current.projectId,
    }
    return () => {
      delete window.__v2d
    }
  }, [])
  return <div data-falso="canvas" />
}

// ./properties-panel
export const PropertiesPanel = () => null
export const EffectsPanel = () => null

// @/hooks/use-credits
export const useCobrancaLigada = () => false
export const useCredits = () => ({ canPerformOperation: () => true, getCost: () => 0, credits: null, isLoading: false })

// @/hooks/use-page-config
export const usePageConfig = () => undefined
