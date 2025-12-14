"use client"

import * as React from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { DropdownTriggerButton } from '@/components/ui/dropdown-trigger-button'
import { Autocomplete } from '@/components/ui/autocomplete'
import { MessageBubble } from '@/components/chat/message-bubble'
import { Card } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { usePageConfig } from '@/hooks/use-page-config'
import {
  Bot,
  ChevronDown,
  History,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  MoreVertical,
  Paperclip,
  Plus,
  Send,
  Sparkles,
  Square,
  Trash2,
  X as XIcon,
  FileText
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useCredits } from '@/hooks/use-credits'
import { CreditStatus } from '@/components/credits/credit-status'
import { useOpenRouterModels } from '@/hooks/use-openrouter-models'
import { useGenerateImage } from '@/hooks/use-ai-image'
import { useAIProviders } from '@/hooks/use-ai-providers'
import { useConversations, useConversation, useCreateConversation, useDeleteConversation } from '@/hooks/use-conversations'
import { useSearchParams } from 'next/navigation'
import { useProjects } from '@/hooks/use-project'
import { ProjectSelector } from '@/app/(protected)/drive/_components/project-selector'
import { useProjectSelectionStore } from '@/stores/project-selection'
import { TrainingModeToggle } from '@/components/chat/training-mode-toggle'
import { KnowledgePreviewCard } from '@/components/chat/knowledge-preview-card'
import { DuplicateWarningCard } from '@/components/chat/duplicate-warning-card'
import { MultipleMatchesCard } from '@/components/chat/multiple-matches-card'
import { EditPreviewForm } from '@/components/chat/edit-preview-form'
import { ChatEmptyState } from '@/components/chat/chat-empty-state'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import type { TrainingPreview } from '@/lib/knowledge/training-pipeline'
import {
  isDisambiguationResponse,
  handleDisambiguationChoice,
  createDisambiguationState,
} from '@/lib/knowledge/disambiguation'

// Fallback static models (used if API fails)
const STATIC_MODELS: Record<string, { id: string; label: string }[]> = {
  openrouter: [
    { id: 'openai/gpt-4o-mini', label: 'OpenAI · GPT-4o Mini' },
    { id: 'anthropic/claude-3.5-sonnet', label: 'Anthropic · Claude 3.5 Sonnet' },
    { id: 'google/gemini-2.0-flash-exp:free', label: 'Google · Gemini 2.0 Flash (Free)' },
    { id: 'mistralai/mistral-small', label: 'Mistral · Mistral Small' },
  ],
  openai: [
    { id: 'gpt-5.1', label: 'GPT-5.1 (Latest Flagship)' },
    { id: 'gpt-5-mini', label: 'GPT-5 Mini (Balanced)' },
    { id: 'gpt-5-nano', label: 'GPT-5 Nano (Fastest)' },
    { id: 'o4-mini', label: 'o4-mini (Reasoning)' },
    { id: 'o3-mini', label: 'o3-mini (Reasoning)' },
    { id: 'gpt-4o', label: 'GPT-4o' },
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  ],
  anthropic: [
    { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
    { id: 'claude-sonnet-4', label: 'Claude Sonnet 4' },
    { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
  ],
  google: [
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash (Experimental)' },
  ],
  mistral: [
    { id: 'mistral-large-latest', label: 'Mistral Large (Latest)' },
    { id: 'mistral-small-latest', label: 'Mistral Small (Latest)' },
    { id: 'mistral-medium-latest', label: 'Mistral Medium (Latest)' },
  ],
}

const STATIC_IMAGE_MODELS_OPENROUTER: { id: string; label: string }[] = [
  { id: 'google/gemini-2.5-flash-image-preview', label: 'Nano Banana' }
]

export default function AIChatPage() {
  usePageConfig('Chat com IA', 'Converse com diferentes LLMs via provedores selecionáveis.', [
    { label: 'Início', href: '/studio' },
    { label: 'Chat com IA' },
  ])

  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const initialProjectFromQuery = React.useMemo(() => {
    const param = searchParams.get('projectId')
    return param ? Number(param) : null
  }, [searchParams])

  const persistedProjectId = useProjectSelectionStore(state => state.lastProjectId)
  const setPersistedProjectId = useProjectSelectionStore(state => state.setLastProjectId)
  const hasProjectSelectionHydrated = useProjectSelectionStore(state => state.hasHydrated)

  const { data: projects, isLoading: isLoadingProjects } = useProjects()
  const [selectedProjectId, setSelectedProjectId] = React.useState<number | null>(initialProjectFromQuery)
  const hasProject = selectedProjectId != null && !Number.isNaN(selectedProjectId)
  const selectedProject = React.useMemo(
    () => projects?.find(p => p.id === selectedProjectId),
    [projects, selectedProjectId]
  )
  const handleProjectChange = React.useCallback(
    (projectId: number | null) => {
      setSelectedProjectId(projectId)
      if (projectId != null) {
        setPersistedProjectId(projectId)
      }
    },
    [setPersistedProjectId]
  )

  // Seleciona projeto inicial (query param se válido, senão primeiro da lista)
  React.useEffect(() => {
    if (!projects || projects.length === 0) return
    if (!hasProjectSelectionHydrated && !initialProjectFromQuery) return

    const isValidProject = (id: number | null) =>
      id != null && projects.some(p => p.id === id)

    if (initialProjectFromQuery && isValidProject(initialProjectFromQuery)) {
      if (selectedProjectId !== initialProjectFromQuery) {
        setSelectedProjectId(initialProjectFromQuery)
      }
      if (persistedProjectId !== initialProjectFromQuery) {
        setPersistedProjectId(initialProjectFromQuery)
      }
      return
    }

    if (selectedProjectId != null && isValidProject(selectedProjectId)) {
      if (persistedProjectId !== selectedProjectId) {
        setPersistedProjectId(selectedProjectId)
      }
      return
    }

    if (isValidProject(persistedProjectId)) {
      setSelectedProjectId(persistedProjectId)
      return
    }

    const fallbackId = projects[0].id
    setSelectedProjectId(fallbackId)
    setPersistedProjectId(fallbackId)
  }, [
    projects,
    selectedProjectId,
    initialProjectFromQuery,
    persistedProjectId,
    hasProjectSelectionHydrated,
    setPersistedProjectId,
  ])

  // Fetch available providers (only those with API keys)
  const { data: providersData, isLoading: isLoadingProviders } = useAIProviders()
  const availableProviders = React.useMemo(() =>
    providersData?.providers ?? [],
    [providersData]
  )

  // Initialize with first available provider
  const [provider, setProvider] = React.useState<string>('')
  const [model, setModel] = React.useState<string>('')
  const [dynamicOpenRouterModels, setDynamicOpenRouterModels] = React.useState<{ id: string; label: string }[] | null>(null)
  const [mode, setMode] = React.useState<'text' | 'image'>('text')

  // Conversation history state
  const [currentConversationId, setCurrentConversationId] = React.useState<string | null>(null)
  const [historyCollapsed, setHistoryCollapsed] = React.useState(false)
  const [historyMobileOpen, setHistoryMobileOpen] = React.useState(false)
  const [conversationSearch, setConversationSearch] = React.useState('')

  // Fetch conversations and current conversation
  const { data: conversationsData, isLoading: isLoadingConversations } = useConversations(
    hasProject ? selectedProjectId : undefined
  )
  const {
    data: currentConversation,
    refetch: refetchConversation,
  } = useConversation(currentConversationId, hasProject ? selectedProjectId : undefined)
  const createConversation = useCreateConversation(hasProject ? selectedProjectId : undefined)
  const deleteConversation = useDeleteConversation(hasProject ? selectedProjectId : undefined)
  const [hydratedConversationId, setHydratedConversationId] = React.useState<string | null>(null)
  const [messageMetadata, setMessageMetadata] = React.useState<Record<string, unknown>>({})
  const [trainingMode, setTrainingMode] = React.useState(false)
  const [pendingPreview, setPendingPreview] = React.useState<TrainingPreview | null>(null)
  const [editingPreview, setEditingPreview] = React.useState<TrainingPreview | null>(null)
  const [isTrainingLoading, setIsTrainingLoading] = React.useState(false)
  const [isSavingPreview, setIsSavingPreview] = React.useState(false)

  // Persist desktop sidebar collapsed state
  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const saved = window.localStorage.getItem('aiChat.historyCollapsed')
    if (saved != null) {
      setHistoryCollapsed(saved === 'true')
    }
  }, [])

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('aiChat.historyCollapsed', String(historyCollapsed))
  }, [historyCollapsed])

  const allConversations = conversationsData?.conversations ?? []
  const filteredConversations = React.useMemo(() => {
    const q = conversationSearch.trim().toLowerCase()
    if (!q) return allConversations
    return allConversations.filter((conv) => conv.title.toLowerCase().includes(q))
  }, [allConversations, conversationSearch])

  // Set initial provider when providers are loaded
  React.useEffect(() => {
    if (availableProviders.length > 0 && !provider) {
      // Prioritize OpenAI with GPT-5.1 as default (most capable model available)
      const openaiProvider = availableProviders.find(p => p.key === 'openai')
      if (openaiProvider) {
        setProvider('openai')
        setModel('gpt-5.1') // GPT-5.1 as default
      } else {
        // Fallback to first available provider
        const firstProvider = availableProviders[0]
        setProvider(firstProvider.key)
        if (firstProvider.models.length > 0) {
          setModel(firstProvider.models[0].id)
        }
      }
    }
  }, [availableProviders, provider])

  // Get current provider data
  const currentProviderData = React.useMemo(() =>
    availableProviders.find(p => p.key === provider),
    [availableProviders, provider]
  )

  // Reset model when provider changes (to prevent stale model selection)
  const prevProviderRef = React.useRef(provider)
  React.useEffect(() => {
    if (prevProviderRef.current !== provider && prevProviderRef.current !== '') {
      // Provider changed, reset model
      setModel('')
    }
    prevProviderRef.current = provider
  }, [provider])

  // Get models for current provider
  const currentModels = React.useMemo(() => {
    if (provider === 'openrouter') {
      return dynamicOpenRouterModels ?? (mode === 'image' ? STATIC_IMAGE_MODELS_OPENROUTER : (currentProviderData?.models ?? STATIC_MODELS['openrouter']))
    }
    return currentProviderData?.models ?? STATIC_MODELS[provider] ?? []
  }, [provider, dynamicOpenRouterModels, mode, currentProviderData])

  const modelItems = React.useMemo(() =>
    currentModels.map((m) => ({ value: m.id, label: m.label })),
    [currentModels]
  )

  // Upload state (declared before useChat so it can be referenced in request body)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const uploadRefs = React.useRef<Record<string, XMLHttpRequest>>({})
  type UploadItem = { id: string; name: string; size: number; url?: string; status: 'uploading' | 'done' | 'error'; progress: number; error?: string }
  const [attachments, setAttachments] = React.useState<UploadItem[]>([])
  const [dragActive, setDragActive] = React.useState(false)
  const readyAttachments = React.useMemo(
    () => attachments.filter((a): a is UploadItem & { url: string } => a.status === 'done' && typeof a.url === 'string'),
    [attachments],
  )
  const hasUploadingAttachments = React.useMemo(
    () => attachments.some(a => a.status === 'uploading'),
    [attachments],
  )

  const [input, setInput] = React.useState('')

  // Use refs to ensure body function always gets current values (AI SDK v5 closure issue)
  const providerRef = React.useRef(provider)
  const modelRef = React.useRef(model)
  const attachmentsRef = React.useRef(readyAttachments)
  const conversationIdRef = React.useRef(currentConversationId)
  const projectIdRef = React.useRef<number | null>(null)

  // Update refs when values change
  React.useEffect(() => {
    providerRef.current = provider
    modelRef.current = model
    attachmentsRef.current = readyAttachments
    conversationIdRef.current = currentConversationId
    projectIdRef.current = hasProject ? selectedProjectId : null
  }, [provider, model, readyAttachments, currentConversationId, hasProject, selectedProjectId])

  const { messages, sendMessage, status, stop, setMessages, regenerate } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/ai/chat',
      body: () => {
        if (!projectIdRef.current) {
          throw new Error('Projeto não selecionado. Selecione um projeto antes de enviar.')
        }
        return {
          provider: providerRef.current,
          model: modelRef.current,
          attachments: attachmentsRef.current.map(a => ({ name: a.name, url: a.url })),
          conversationId: conversationIdRef.current,
          projectId: projectIdRef.current,
        }
      },
    }),
    experimental_throttle: 60,
    onError(error) {
      // Handle 402 errors (insufficient credits)
      if (error.message?.includes('402')) {
        const id = `sys-nocred-${Date.now()}`
        setMessages(prev => [...prev, { id, role: 'assistant', parts: [{ type: 'text', text: 'Você não tem créditos. [Ir para cobrança →](/billing)' }] }])
      }
    },
  })

  const lastStatusRef = React.useRef<typeof status | null>(null)
  React.useEffect(() => {
    if (lastStatusRef.current === 'streaming' && status !== 'streaming') {
      if (hasProject && selectedProjectId != null) {
        queryClient.invalidateQueries({ queryKey: ['conversations', 'list', selectedProjectId] })
      }
      if (currentConversationId) {
        setHydratedConversationId(null)
        setMessageMetadata({})
        refetchConversation()
      }
    }
    lastStatusRef.current = status
  }, [currentConversationId, hasProject, queryClient, refetchConversation, selectedProjectId, status])

  // Load conversation messages when a conversation is selected
  React.useEffect(() => {
    if (!currentConversation?.id) return
    if (hydratedConversationId === currentConversation.id) return

    const serverMessagesCount = currentConversation.messages?.length || 0
    const localMessagesCount = messages.length
    const hasServerMessages = serverMessagesCount > 0
    const hasLocalMessages = localMessagesCount > 0

    // IMPORTANTE: Só carregar do servidor se tivermos MAIS ou IGUAL mensagens no servidor
    // Isso previne race condition onde servidor ainda não salvou a última mensagem
    const shouldLoadFromServer = hasServerMessages && serverMessagesCount >= localMessagesCount

    console.log('[Chat Hydration] Server:', serverMessagesCount, 'Local:', localMessagesCount, 'Should load:', shouldLoadFromServer)

    if (shouldLoadFromServer) {
      const loadedMessages = currentConversation.messages!.map((msg) => ({
        id: msg.id,
        role: msg.role as 'user' | 'assistant' | 'system',
        parts: [{ type: 'text' as const, text: msg.content }],
        metadata: msg.metadata ?? undefined,
      }))
      const metadataMap: Record<string, unknown> = {}
      currentConversation.messages!.forEach((msg) => {
        if (msg.metadata) {
          metadataMap[msg.id] = msg.metadata
        }
      })
      setMessageMetadata(metadataMap)
      setMessages(loadedMessages as any)
      setHydratedConversationId(currentConversation.id)
      return
    }

    // Se não deve carregar do servidor, marcar como hidratado para evitar loop infinito
    if (hasLocalMessages || hasServerMessages) {
      setHydratedConversationId(currentConversation.id)
    }
  }, [currentConversation, hydratedConversationId, messages, setMessages])

  // Ao trocar de projeto, limpar conversa selecionada e histórico carregado
  React.useEffect(() => {
    setCurrentConversationId(null)
    conversationIdRef.current = null
    setMessages([])
    setHydratedConversationId(null)
    setMessageMetadata({})
    setPendingPreview(null)
    setTrainingMode(false)
    setIsTrainingLoading(false)
    setIsSavingPreview(false)
    setHistoryMobileOpen(false)
    setConversationSearch('')
  }, [selectedProjectId, setMessages])

  const { credits, canPerformOperation, getCost, refresh } = useCredits()

  // Use TanStack Query for OpenRouter models
  const {
    data: openRouterModelsData,
    isLoading: isLoadingModels
  } = useOpenRouterModels(
    provider === 'openrouter' ? (mode === 'image' ? 'image' : 'text') : undefined
  )

  // Track if we've already set initial model to avoid infinite loops
  const initialModelSetRef = React.useRef(false)

  React.useEffect(() => {
    if (provider === 'openrouter') {
      if (openRouterModelsData?.models && openRouterModelsData.models.length > 0) {
        // Convert OpenRouterModel to the expected format
        const formattedModels = openRouterModelsData.models.map(m => ({
          id: m.id,
          label: m.label
        }))
        setDynamicOpenRouterModels(formattedModels)

        // Only auto-select model if empty or doesn't exist in new list
        const modelExists = model && formattedModels.some(m => m.id === model)
        if (!modelExists && formattedModels.length > 0) {
          setModel(formattedModels[0].id)
          initialModelSetRef.current = true
        }
      } else if (!isLoadingModels) {
        // Fallback to static models if API fails
        setDynamicOpenRouterModels(null)
        const fallbackModels = mode === 'image' ? STATIC_IMAGE_MODELS_OPENROUTER : (currentProviderData?.models ?? STATIC_MODELS['openrouter'])
        const modelExists = model && fallbackModels.some(m => m.id === model)
        if (!modelExists && fallbackModels.length > 0) {
          setModel(fallbackModels[0].id)
          initialModelSetRef.current = true
        }
      }
    } else if (currentProviderData) {
      // For non-OpenRouter providers, use models from provider data
      const modelExists = model && currentProviderData.models.some(m => m.id === model)
      if (!modelExists && currentProviderData.models.length > 0) {
        setModel(currentProviderData.models[0].id)
        initialModelSetRef.current = true
      }
    }
  }, [provider, mode, model, openRouterModelsData, isLoadingModels, currentProviderData])

  const scrollViewportRef = React.useRef<HTMLDivElement>(null)
  const endRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    // auto-scroll to bottom when messages update
    const viewport = scrollViewportRef.current
    if (!viewport) return

    // Debug: log message count
    console.log('[Chat] Messages count:', messages.length)

    // Double RAF + timeout to ensure DOM is fully rendered
    const rafId = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (viewport) {
            viewport.scrollTop = viewport.scrollHeight
            console.log('[Chat] Scrolled to:', viewport.scrollTop, 'height:', viewport.scrollHeight)
          }
        }, 50)
      })
    })

    return () => {
      cancelAnimationFrame(rafId)
    }
  }, [messages, status])

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      // submit form programmatically
      const form = (e.currentTarget as HTMLTextAreaElement).form
      form?.requestSubmit()
    }
  }

  // Animated input concept states
  // input focus state removed with command palette removal
  const [providerMenuOpen, setProviderMenuOpen] = React.useState(false)
  const [modeMenuOpen, setModeMenuOpen] = React.useState(false)
  // Switch to OpenRouter automatically when enabling image mode
  React.useEffect(() => {
    if (mode === 'image') {
      if (provider !== 'openrouter') setProvider('openrouter')
      // Prefer the first image-capable model from the fetched list; otherwise wait for fetch effect
      const firstImageModel = (dynamicOpenRouterModels ?? STATIC_IMAGE_MODELS_OPENROUTER)[0]?.id
      if (firstImageModel) setModel(firstImageModel)
    } else {
      // back to text: ensure a text-capable model is selected
      if (provider === 'openrouter') {
        const fallback = (dynamicOpenRouterModels ?? STATIC_MODELS['openrouter'])[0]?.id
        if (fallback) setModel(fallback)
      } else {
        const fallback = STATIC_MODELS[provider]?.[0]?.id
        if (fallback) setModel(fallback)
      }
    }
  }, [mode, provider, dynamicOpenRouterModels])

  // Use TanStack Query for image generation
  const generateImage = useGenerateImage()

  const handleSubmitImage = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const prompt = input.trim()
    if (!prompt) return
    if (!hasProject) {
      alert('Selecione um projeto para usar o chat.')
      return
    }

    // Clear input immediately after sending
    setInput('')

    try {
      const result = await generateImage.mutateAsync({
        model,
        prompt,
        size: '1024x1024',
        count: 1,
        attachments: readyAttachments.map(a => ({ name: a.name, url: a.url })),
      })

      refresh()
      const images: string[] = Array.isArray(result?.images) ? result.images : []
      const id1 = `u-${Date.now()}`
      const id2 = `a-${Date.now()}`
      const attachmentCount = readyAttachments.length
      setMessages(prev => [
        ...prev,
        { id: id1, role: 'user', parts: [{ type: 'text', text: prompt + (attachmentCount ? `\n\n(Anexada${attachmentCount > 1 ? 's' : ''} ${attachmentCount} imagem${attachmentCount > 1 ? 'ns' : ''})` : '') }] },
        { id: id2, role: 'assistant', parts: [{ type: 'text', text: JSON.stringify({ images }) }] },
      ])
      setAttachments([])
    } catch (error) {
      const id1 = `u-${Date.now()}`
      const id2 = `a-${Date.now()}`

      // Check if it's a credit error
      if ((error as Error)?.message?.includes('402') || (error as Error)?.message?.includes('crédito')) {
        setMessages(prev => [
          ...prev,
          { id: id1, role: 'user', parts: [{ type: 'text', text: prompt }] },
          { id: id2, role: 'assistant', parts: [{ type: 'text', text: 'Você não tem créditos suficientes. [Ir para cobrança →](/billing)' }] },
        ])
      } else {
        setMessages(prev => [
          ...prev,
          { id: id1, role: 'user', parts: [{ type: 'text', text: prompt }] },
          { id: id2, role: 'assistant', parts: [{ type: 'text', text: 'Não foi possível gerar a imagem. Tente novamente.' }] },
        ])
      }
    }
  }


  const submitMessage = async (text: string) => {
    const prompt = text.trim()
    if (!prompt) {
      return
    }
    if (!hasProject) {
      alert('Selecione um projeto para usar o chat.')
      return
    }

    if (trainingMode) {
      await handleTrainingSubmit(prompt)
      return
    }

    let conversationIdToUse = conversationIdRef.current

    if (!conversationIdToUse) {
      try {
        const title = prompt.length > 50 ? `${prompt.substring(0, 50)}...` : prompt
        conversationIdToUse = await ensureConversationId(title)
      } catch (error) {
        console.error('Error creating conversation:', error)
      }
    }

    sendMessage({ text: prompt })
    setInput('')
    setAttachments([])
    setTimeout(() => refresh(), 300)
  }

  // Wrap text submit to clear input right after sending
  const handleSubmitText = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    await submitMessage(input)
  }


  const handleAttachFile = () => {
    fileInputRef.current?.click()
  }
  const removeAttachment = (i: number) => setAttachments((prev) => prev.filter((_, idx) => idx !== i))

  const startUpload = (file: File) => {
    const id = `u-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const item: UploadItem = { id, name: file.name, size: file.size, status: 'uploading', progress: 0 }
    setAttachments(prev => [...prev, item])
    const fd = new FormData()
    fd.set('file', file)
    const xhr = new XMLHttpRequest()
    uploadRefs.current[id] = xhr
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) {
        const pct = Math.min(99, Math.round((ev.loaded / ev.total) * 100))
        setAttachments(prev => prev.map(a => a.id === id ? { ...a, progress: pct } : a))
      }
    }
    xhr.onreadystatechange = () => {
      if (xhr.readyState === 4) {
        delete uploadRefs.current[id]
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText)
            setAttachments(prev => prev.map(a => a.id === id ? { ...a, url: data?.url, status: 'done', progress: 100 } : a))
          } catch {
            setAttachments(prev => prev.map(a => a.id === id ? { ...a, status: 'error', error: 'Resposta inválida do servidor' } : a))
          }
        } else {
          let msg = 'Falha no upload'
          try { msg = (JSON.parse(xhr.responseText)?.error) || msg } catch { }
          setAttachments(prev => prev.map(a => a.id === id ? { ...a, status: 'error', error: msg } : a))
        }
      }
    }
    xhr.open('POST', '/api/upload')
    xhr.send(fd)
  }

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    files.forEach(f => startUpload(f))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation(); setDragActive(false)
    const files = Array.from(e.dataTransfer.files || [])
    files.forEach(f => startUpload(f))
  }
  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setDragActive(true) }
  const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setDragActive(false) }

  const ensureConversationId = React.useCallback(
    async (titleHint: string) => {
      if (conversationIdRef.current) return conversationIdRef.current
      const newConv = await createConversation.mutateAsync({ title: titleHint })
      conversationIdRef.current = newConv.id
      setCurrentConversationId(newConv.id)
      setHydratedConversationId(null)
      setMessageMetadata({})
      return newConv.id
    },
    [createConversation]
  )

  const handleTrainingSubmit = async (prompt: string) => {
    if (!hasProject || !selectedProjectId) {
      alert('Selecione um projeto para usar o chat.')
      return
    }

    // Detectar resposta de disambiguação (escolha numérica)
    if (pendingPreview?.matchType === 'multiple' && isDisambiguationResponse(prompt)) {
      try {
        const disambState = createDisambiguationState(pendingPreview)
        const resolvedPreview = handleDisambiguationChoice(prompt, disambState)

        if (resolvedPreview) {
          // Usuário escolheu uma opção
          setPendingPreview(resolvedPreview)
          setInput('')
        } else {
          // Usuário cancelou
          setPendingPreview(null)
          setInput('')
          const assistantId = `sys-${Date.now()}`
          setMessages(prev => [
            ...prev,
            { id: assistantId, role: 'assistant', parts: [{ type: 'text', text: '❌ Operação cancelada.' }] },
          ])
        }
        return
      } catch (error) {
        // Escolha inválida
        const assistantId = `err-${Date.now()}`
        setMessages(prev => [
          ...prev,
          { id: assistantId, role: 'assistant', parts: [{ type: 'text', text: (error as Error)?.message || 'Escolha inválida.' }] },
        ])
        setInput('')
        return
      }
    }

    try {
      setIsTrainingLoading(true)
      const title = prompt.length > 50 ? `${prompt.substring(0, 50)}...` : prompt
      const convId = await ensureConversationId(title)

      const response = await fetch('/api/knowledge/training/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProjectId,
          message: prompt,
          conversationId: convId,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data?.error || 'Não foi possível gerar a pré-visualização.')
      }

      if (!data.preview) {
        const assistantId = `sys-${Date.now()}`
        setMessages(prev => [
          ...prev,
          { id: assistantId, role: 'assistant', parts: [{ type: 'text', text: data.message || 'A intenção foi classificada como consulta. Desligue o modo treinamento para fazer perguntas.' }] },
        ])
        return
      }

      setPendingPreview(data.preview as TrainingPreview)

      const userId = `u-${Date.now()}`
      const assistantId = `p-${Date.now()}`

      setMessages(prev => [
        ...prev,
        { id: userId, role: 'user', parts: [{ type: 'text', text: prompt }] },
        { id: assistantId, role: 'assistant', parts: [{ type: 'text', text: data.message }] },
      ])
    } catch (error) {
      console.error('Erro no modo treinamento:', error)
      const assistantId = `err-${Date.now()}`
      setMessages(prev => [
        ...prev,
        { id: assistantId, role: 'assistant', parts: [{ type: 'text', text: (error as Error)?.message || 'Não foi possível processar a solicitação de treinamento.' }] },
      ])
    } finally {
      setInput('')
      setIsTrainingLoading(false)
    }
  }

  const normalizePreviewForConfirm = (preview: TrainingPreview): TrainingPreview => {
    if (
      (preview.operation === 'UPDATE' ||
        preview.operation === 'REPLACE' ||
        preview.operation === 'DELETE') &&
      !preview.targetEntryId
    ) {
      return {
        ...preview,
        operation: 'CREATE',
        matchType: 'single',
        matches: [],
      }
    }
    return preview
  }

  const handleConfirmPreview = async () => {
    if (!pendingPreview || !hasProject || !selectedProjectId) return
    const previewToSend = normalizePreviewForConfirm(pendingPreview)

    try {
      setIsSavingPreview(true)
      const response = await fetch('/api/knowledge/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProjectId,
          preview: previewToSend,
          conversationId: conversationIdRef.current,
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data?.error || 'Não foi possível salvar o conhecimento.')
      }

      setPendingPreview(null)
      refetchConversation()
    } catch (error) {
      console.error('Erro ao confirmar conhecimento:', error)
      const assistantId = `err-${Date.now()}`
      setMessages(prev => [
        ...prev,
        { id: assistantId, role: 'assistant', parts: [{ type: 'text', text: (error as Error)?.message || 'Erro ao confirmar conhecimento.' }] },
      ])
    } finally {
      setIsSavingPreview(false)
    }
  }

  const handleCancelPreview = () => {
    setPendingPreview(null)
  }

  const handleSelectMatch = (entryId: string) => {
    setPendingPreview(prev => {
      if (!prev) return prev
      const chosenMatch = prev.matches?.find(m => m.entryId === entryId)
      return {
        ...prev,
        operation: prev.operation === 'DELETE' ? 'DELETE' : prev.operation === 'CREATE' ? 'UPDATE' : prev.operation,
        targetEntryId: entryId,
        matchType: 'single',
        matches: chosenMatch ? [chosenMatch] : prev.matches,
      }
    })
  }

  const handleCreateNewFromDuplicate = () => {
    setPendingPreview(prev => {
      if (!prev) return prev
      return {
        ...prev,
        operation: 'CREATE',
        targetEntryId: undefined,
        matchType: 'single',
      }
    })
  }

  // Create new conversation
  const handleNewConversation = async () => {
    if (!hasProject) {
      alert('Selecione um projeto para criar conversas.')
      return
    }

    try {
      const newConv = await createConversation.mutateAsync({
        title: 'Nova Conversa',
      })
      setCurrentConversationId(newConv.id)
      setMessages([])
      setMessageMetadata({})
      setHydratedConversationId(null)
      setPendingPreview(null)
      setHistoryMobileOpen(false)
    } catch (error) {
      console.error('Error creating conversation:', error)
    }
  }

  // Select existing conversation
  const handleSelectConversation = (id: string) => {
    setCurrentConversationId(id)
    setMessages([])
    setMessageMetadata({})
    setHydratedConversationId(null)
    setPendingPreview(null)
    setHistoryMobileOpen(false)
  }

  // Delete conversation
  const handleDeleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm('Tem certeza que deseja excluir esta conversa?')) {
      try {
        await deleteConversation.mutateAsync(id)
        if (currentConversationId === id) {
          setCurrentConversationId(null)
          setMessages([])
          setMessageMetadata({})
          setPendingPreview(null)
        }
      } catch (error) {
        console.error('Error deleting conversation:', error)
      }
    }
  }

  const handleRetry = React.useCallback((assistantIndex: number) => {
    // Only makes sense for assistant messages – trim to the last user message before it and reload
    let shouldReload = false
    setMessages(prev => {
      const target = prev[assistantIndex]
      if (!target || target.role === 'user') return prev
      let cut = assistantIndex - 1
      while (cut >= 0 && prev[cut].role !== 'user') cut--
      if (cut < 0) return prev
      shouldReload = true
      return prev.slice(0, cut + 1)
    })
    if (shouldReload) {
      // trigger a regenerate of the last user message
      try {
        // regenerate the last message
        regenerate?.()
      } catch { }
    }
  }, [regenerate, setMessages])

  // Show a helpful bubble when credits transition from >0 to 0 while chatting
  const prevCreditsRef = React.useRef<number | null>(null)
  React.useEffect(() => {
    const current = credits?.creditsRemaining ?? null
    const prev = prevCreditsRef.current
    prevCreditsRef.current = current
    if (prev != null && prev > 0 && current === 0) {
      const hasTip = messages.some(m => m.id?.toString().startsWith('sys-nocred-'))
      if (!hasTip) {
        const id = `sys-nocred-${Date.now()}`
        setMessages(prev => [...prev, { id, role: 'assistant', parts: [{ type: 'text', text: 'Você não tem mais créditos. [Ir para cobrança →](/billing)' }] }])

      }
    }
  }, [credits?.creditsRemaining])

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col md:flex-row gap-4">
      {/* Mobile History Sheet */}
      <Sheet open={historyMobileOpen} onOpenChange={setHistoryMobileOpen}>
        <SheetContent side="left" className="w-[300px] sm:w-[400px] p-0">
          <div className="flex flex-col h-full">
            <div className="p-4 border-b">
              <h2 className="font-semibold text-lg flex items-center gap-2">
                <History className="h-5 w-5" />
                Histórico
              </h2>
            </div>
            <div className="p-4 space-y-4">
              <Button onClick={handleNewConversation} className="w-full gap-2" variant="default">
                <Plus className="h-4 w-4" />
                Nova conversa
              </Button>
              <Input
                value={conversationSearch}
                onChange={(e) => setConversationSearch(e.target.value)}
                placeholder="Buscar conversa..."
              />
            </div>
            <ScrollArea className="flex-1">
              <div className="space-y-1 p-2">
                {isLoadingConversations ? (
                  <p className="text-center text-sm text-muted-foreground py-8">Carregando...</p>
                ) : filteredConversations.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-8">
                    {conversationSearch.trim()
                      ? 'Nenhuma conversa encontrada.'
                      : 'Nenhuma conversa ainda.'}
                  </p>
                ) : (
                  filteredConversations.map((conv) => (
                    <div
                      key={conv.id}
                      className={`group relative flex items-center justify-between rounded-lg border p-3 cursor-pointer transition-all hover:bg-accent/50 ${currentConversationId === conv.id ? 'bg-accent border-primary/50 shadow-sm' : 'border-transparent'
                        }`}
                      onClick={() => handleSelectConversation(conv.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{conv.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(conv.lastMessageAt).toLocaleDateString('pt-BR')}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteConversation(conv.id, e as unknown as React.MouseEvent)
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </SheetContent>
      </Sheet>

      {/* Desktop Sidebar */}
      <div
        className={cn(
          "hidden md:flex flex-col border rounded-xl bg-card overflow-hidden transition-all duration-300 ease-in-out",
          historyCollapsed ? "w-[60px]" : "w-80"
        )}
      >
        <div className="p-3 border-b flex items-center justify-between h-14">
          {!historyCollapsed && <span className="font-semibold text-sm pl-1">Conversas</span>}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 ml-auto"
            onClick={() => setHistoryCollapsed(!historyCollapsed)}
            title={historyCollapsed ? "Expandir histórico" : "Recolher histórico"}
          >
            {historyCollapsed ? <History className="h-4 w-4" /> : <ChevronDown className="h-4 w-4 rotate-90" />}
          </Button>
        </div>

        {!historyCollapsed && (
          <div className="flex flex-col h-full overflow-hidden">
            <div className="p-3 space-y-3">
              <Button onClick={handleNewConversation} className="w-full gap-2 shadow-sm" variant="outline">
                <Plus className="h-4 w-4" />
                Nova Conversa
              </Button>
              <Input
                value={conversationSearch}
                onChange={(e) => setConversationSearch(e.target.value)}
                placeholder="Buscar..."
                className="h-9"
              />
            </div>

            <ScrollArea className="flex-1 px-3 pb-3">
              <div className="space-y-1">
                {isLoadingConversations ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : filteredConversations.length === 0 ? (
                  <p className="text-center text-xs text-muted-foreground py-8">
                    {conversationSearch.trim() ? 'Nada encontrado.' : 'Sem conversas.'}
                  </p>
                ) : (
                  filteredConversations.map((conv) => (
                    <div
                      key={conv.id}
                      className={cn(
                        "group flex items-center justify-between rounded-md p-2 cursor-pointer text-sm transition-colors hover:bg-accent",
                        currentConversationId === conv.id ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground"
                      )}
                      onClick={() => handleSelectConversation(conv.id)}
                    >
                      <span className="truncate">{conv.title}</span>
                      {currentConversationId === conv.id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100"
                          onClick={(e) => handleDeleteConversation(conv.id, e as any)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-background/50 rounded-xl border relative overflow-hidden">
        {/* Background drag overlay */}
        {dragActive && (
          <div className="absolute inset-0 z-50 bg-primary/10 backdrop-blur-sm flex items-center justify-center border-2 border-primary border-dashed rounded-xl" onDrop={onDrop} onDragLeave={onDragLeave} onDragOver={onDragOver}>
            <div className="bg-background p-6 rounded-xl shadow-lg text-center animate-in zoom-in-95 duration-200">
              <div className="mx-auto w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center mb-3">
                <Paperclip className="h-6 w-6 text-primary" />
              </div>
              <p className="font-semibold text-lg">Solte os arquivos aqui</p>
              <p className="text-sm text-muted-foreground">para anexar ao chat</p>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="h-14 border-b flex items-center justify-between px-4 bg-background/80 backdrop-blur-sm z-10 shrink-0">
          <div className="flex items-center gap-2 overflow-hidden">
            {/* Mobile Toggle */}
            <Button variant="ghost" size="icon" className="md:hidden -ml-2" onClick={() => setHistoryMobileOpen(true)}>
              <History className="h-5 w-5" />
            </Button>

            <div className="flex items-center gap-2 overflow-hidden">
              <div className="hidden sm:block">
                <ProjectSelector
                  projects={projects || []}
                  value={selectedProjectId}
                  onChange={handleProjectChange}
                  isLoading={isLoadingProjects}
                />
              </div>
              <div className="h-4 w-[1px] bg-border mx-1 hidden sm:block" />

              {/* Provider/Model Selector Compact */}
              <DropdownMenu open={mode === 'image' ? false : providerMenuOpen} onOpenChange={(o) => { if (mode !== 'image') setProviderMenuOpen(o) }}>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2 font-normal" disabled={mode === 'image' || isLoadingProviders}>
                    <Bot className="h-4 w-4 text-primary" />
                    <span className="truncate max-w-[100px] hidden sm:inline-block">{availableProviders.find((p) => p.key === provider)?.name || 'Provedor'}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {availableProviders.map((p) => (
                    <DropdownMenuItem key={p.key} onClick={() => setProvider(p.key)}>
                      {p.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="h-8 w-[180px]">
                <Autocomplete
                  items={modelItems}
                  value={model}
                  onChange={setModel}
                  icon={<Sparkles className="h-3.5 w-3.5 text-amber-500" />}
                  buttonAriaLabel="Selecionar modelo"
                  placeholder="Modelo..."
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <TrainingModeToggle
              enabled={trainingMode}
              onChange={(value) => {
                setTrainingMode(value)
                setPendingPreview(null)
              }}
            />

            <DropdownMenu open={modeMenuOpen} onOpenChange={setModeMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                  {mode === 'image' ? <ImageIcon className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setMode('text')}>
                  <MessageSquare className="h-4 w-4 mr-2" /> Modo Texto
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setMode('image')}>
                  <ImageIcon className="h-4 w-4 mr-2" /> Modo Imagem
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="h-4 w-[1px] bg-border mx-1" />
            <CreditStatus showUpgradeButton={false} />
          </div>
        </div>

        {/* Messages Area */}
        <div className={cn(
          "flex-1 relative overflow-hidden",
          trainingMode && "bg-amber-500/5"
        )}>
          <ScrollArea className="h-full">
            <div
              ref={(node) => {
                if (node) {
                  const viewport = node.parentElement?.querySelector('[data-slot="scroll-area-viewport"]') as HTMLDivElement
                  if (viewport) scrollViewportRef.current = viewport
                }
              }}
              className="flex flex-col gap-4 py-6 px-4 max-w-3xl mx-auto min-h-full"
            >
              {!hasProject ? (
                <div className="flex flex-col items-center justify-center p-8 text-center h-full my-auto text-muted-foreground opacity-60">
                  <p>Selecione um projeto para iniciar o chat.</p>
                </div>
              ) : messages.length === 0 ? (
                <ChatEmptyState
                  onSelectPrompt={(text) => {
                    setInput(text)
                    // Focus logic could go here
                  }}
                  onSelectMode={(m) => setMode(m)}
                />
              ) : (
                <>
                  {messages.map((m, idx) => {
                    const normalizedRole = (m.role === 'user' || m.role === 'assistant' || m.role === 'system') ? m.role : 'assistant'
                    const disableMarkdown = mode === 'text' && normalizedRole === 'assistant'
                    const content = m.parts?.map(part => part.type === 'text' ? part.text : '').join('') || ''
                    const metadataRaw = (m as { metadata?: unknown }).metadata ?? messageMetadata[m.id]
                    const metadata: Record<string, unknown> | undefined =
                      metadataRaw && typeof metadataRaw === 'object' && !Array.isArray(metadataRaw)
                        ? metadataRaw as Record<string, unknown>
                        : undefined

                    return (
                      <MessageBubble
                        key={m.id}
                        message={{
                          id: m.id,
                          role: normalizedRole,
                          content,
                          metadata,
                        }}
                        onRetry={normalizedRole !== 'user' ? handleRetry : undefined}
                        retryIndex={idx}
                        disableMarkdown={disableMarkdown}
                      />
                    )
                  })}

                  {/* ... Preview Cards Logic ... */}
                  {pendingPreview && !editingPreview && (
                    <div className="space-y-3 pt-2">
                      {pendingPreview.matchType === 'duplicate_warning' ? (
                        <DuplicateWarningCard
                          preview={pendingPreview}
                          onCreateNew={handleCreateNewFromDuplicate}
                          onUpdateExisting={handleSelectMatch}
                          onCancel={handleCancelPreview}
                        />
                      ) : pendingPreview.matchType === 'multiple' && pendingPreview.matches?.length ? (
                        <MultipleMatchesCard
                          preview={pendingPreview}
                          onSelectMatch={(targetId) => {
                            setPendingPreview({
                              ...pendingPreview,
                              targetEntryId: targetId,
                              matchType: 'single',
                              matches: pendingPreview.matches?.filter(m => m.entryId === targetId),
                            })
                          }}
                          onCancel={handleCancelPreview}
                        />
                      ) : (
                        <KnowledgePreviewCard
                          preview={pendingPreview}
                          onConfirm={handleConfirmPreview}
                          onEdit={() => setEditingPreview(pendingPreview)}
                          onCancel={handleCancelPreview}
                          isLoading={isSavingPreview}
                        />
                      )}
                    </div>
                  )}
                  {editingPreview && (
                    <EditPreviewForm
                      preview={editingPreview}
                      onSave={(updated) => {
                        setPendingPreview(updated)
                        setEditingPreview(null)
                      }}
                      onCancel={() => setEditingPreview(null)}
                      isLoading={isSavingPreview}
                    />
                  )}

                  {(status === 'streaming' || generateImage.isPending || isTrainingLoading) && (
                    <div className="flex items-center gap-2 pl-10 pt-2 animate-pulse">
                      <div className="h-2 w-2 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="h-2 w-2 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="h-2 w-2 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  )}
                  <div ref={endRef} className="h-4" />
                </>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Floating Input Capsule */}
        <div className="p-4 bg-background/0 z-20" onDragEnter={onDragOver}>
          <div className="max-w-3xl mx-auto">
            {/* Attachments Preview */}
            <AnimatePresence>
              {attachments.length > 0 && (
                <motion.div
                  className="mb-2 flex flex-wrap gap-2 px-1"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                >
                  {attachments.map((att, i) => (
                    <div
                      key={i}
                      className="group flex items-center gap-2 rounded-lg bg-card border px-3 py-2 text-xs shadow-sm"
                    >
                      <div className="p-1 rounded bg-muted">
                        {att.url ? <ImageIcon className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                      </div>
                      <div className="max-w-[150px] truncate">
                        {att.url ? (
                          <a href={att.url} target="_blank" rel="noreferrer" className="hover:underline font-medium">{att.name}</a>
                        ) : (
                          <span className="font-medium">{att.name}</span>
                        )}
                        <div className="flex justify-between items-center text-[10px] text-muted-foreground mt-0.5">
                          {att.status === 'uploading' && <span>Enviando {att.progress}%</span>}
                          {att.status === 'error' && <span className="text-destructive">Erro</span>}
                          {att.status === 'done' && <span className="text-green-600">Pronto</span>}
                        </div>
                      </div>
                      <button type="button" onClick={() => removeAttachment(i)} className="ml-2 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                        <XIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            <form onSubmit={mode === 'image' ? handleSubmitImage : handleSubmitText} className="relative group">
              <div className={cn(
                "flex items-end gap-2 p-2 rounded-3xl border bg-background shadow-lg transition-all duration-200 ring-offset-background",
                "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
                trainingMode ? "border-amber-500/30 shadow-amber-500/10" : "hover:border-primary/50"
              )}>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-full ml-1 shrink-0 text-muted-foreground hover:bg-muted"
                  onClick={handleAttachFile}
                  title="Anexar arquivos"
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
                <input ref={fileInputRef} type="file" className="hidden" onChange={onFileSelected} multiple accept={mode === 'image' ? 'image/*' : undefined} />

                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder={trainingMode ? "Digite dados para treinar a IA..." : "Envie uma mensagem..."}
                  rows={1}
                  className="flex-1 min-h-[44px] max-h-[200px] w-full resize-none bg-transparent py-3 px-2 text-sm outline-none placeholder:text-muted-foreground scrollbar-hide"
                  style={{ height: '44px' }}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = '44px';
                    target.style.height = `${Math.min(target.scrollHeight, 200)} px`;
                  }}
                />

                <div className="flex items-center gap-1 shrink-0 pb-1 pr-1">
                  {/* Add more context buttons here later if needed */}
                  {status === 'streaming' ? (
                    <Button
                      type="button"
                      onClick={() => stop?.()}
                      variant="secondary"
                      size="icon"
                      className="h-8 w-8 rounded-full"
                    >
                      <Square className="h-3.5 w-3.5 fill-foreground" />
                    </Button>
                  ) : (
                    <Button
                      type="submit"
                      disabled={
                        hasUploadingAttachments ||
                        (mode === 'image' && readyAttachments.length === 0) ||
                        !input.trim() ||
                        status !== 'ready'
                      }
                      size="icon"
                      className={cn("h-8 w-8 rounded-full transition-all", input.trim() ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="absolute -bottom-6 left-0 right-0 flex justify-center opacity-0 transition-opacity focus-within:opacity-100 pointer-events-none">
                <span className="text-[10px] text-muted-foreground">
                  {mode === 'image' ? `Custo aprox: ${getCost('ai_image_generation')} créditos` : trainingMode ? "Modo de Treinamento Ativo" : "Shift + Enter para quebrar linha"}
                </span>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

