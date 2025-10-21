"use client"

import * as React from 'react'
import { useChat } from '@ai-sdk/react'
import { Button } from '@/components/ui/button'
import { DropdownTriggerButton } from '@/components/ui/dropdown-trigger-button'
import { Autocomplete } from '@/components/ui/autocomplete'
import { MessageBubble } from '@/components/chat/message-bubble'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { usePageConfig } from '@/hooks/use-page-config'
import { Bot, Loader2, Paperclip, Send, Square, Trash2, X as XIcon, Sparkles, Image as ImageIcon, MessageSquare } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useCredits } from '@/hooks/use-credits'
import { CreditStatus } from '@/components/credits/credit-status'
import { useOpenRouterModels } from '@/hooks/use-openrouter-models'
import { useGenerateImage } from '@/hooks/use-ai-image'
import { useAIProviders } from '@/hooks/use-ai-providers'
import { useConversations, useConversation, useCreateConversation, useDeleteConversation } from '@/hooks/use-conversations'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { History, Plus, MoreVertical, Pencil } from 'lucide-react'

// Fallback static models (used if API fails)
const STATIC_MODELS: Record<string, { id: string; label: string }[]> = {
  openrouter: [
    { id: 'openai/gpt-4o-mini', label: 'OpenAI · GPT-4o Mini' },
    { id: 'anthropic/claude-3.5-sonnet', label: 'Anthropic · Claude 3.5 Sonnet' },
    { id: 'google/gemini-2.0-flash-exp:free', label: 'Google · Gemini 2.0 Flash (Free)' },
    { id: 'mistralai/mistral-small', label: 'Mistral · Mistral Small' },
  ],
  openai: [
    { id: 'gpt-4o', label: 'GPT-4o (Latest)' },
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { id: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
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
    { label: 'Início', href: '/dashboard' },
    { label: 'Chat com IA' },
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
  const [historyOpen, setHistoryOpen] = React.useState(false)

  // Fetch conversations and current conversation
  const { data: conversationsData } = useConversations()
  const { data: currentConversation } = useConversation(currentConversationId)
  const createConversation = useCreateConversation()
  const deleteConversation = useDeleteConversation()

  // Set initial provider when providers are loaded
  React.useEffect(() => {
    if (availableProviders.length > 0 && !provider) {
      // Prioritize OpenAI with GPT-4o as default (most capable model available)
      const openaiProvider = availableProviders.find(p => p.key === 'openai')
      if (openaiProvider) {
        setProvider('openai')
        setModel('gpt-4o') // GPT-4o as default
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
  type UploadItem = { id: string; name: string; size: number; url?: string; status: 'uploading'|'done'|'error'; progress: number; error?: string }
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

  const { messages, input, setInput, handleInputChange, handleSubmit, isLoading, stop, setMessages, reload } = useChat({
    api: '/api/ai/chat',
    body: {
      provider,
      model,
      attachments: readyAttachments.map(a => ({ name: a.name, url: a.url })),
      conversationId: currentConversationId,
    },
    experimental_throttle: 60,
    async onResponse(res) {
      if (res.status === 402) {
        try {
          const data = await res.clone().json()
          const msg = `Você não tem créditos. Necessário ${data?.required ?? ''}, disponível ${data?.available ?? ''}.\n\n[Ir para cobrança →](/billing)`
          const id = `sys-nocred-${Date.now()}`
          setMessages(prev => [...prev, { id, role: 'assistant', content: msg }])
        } catch {
          const id = `sys-nocred-${Date.now()}`
          setMessages(prev => [...prev, { id, role: 'assistant', content: 'Você não tem créditos. [Ir para cobrança →](/billing)' }])
        }
      }
    },
  })

  const deferredMessages = React.useDeferredValue(messages)

  // Load conversation messages when a conversation is selected
  React.useEffect(() => {
    if (currentConversation?.messages) {
      const loadedMessages = currentConversation.messages.map((msg) => ({
        id: msg.id,
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content,
      }))
      setMessages(loadedMessages)
    }
  }, [currentConversation, setMessages])

  const { credits, canPerformOperation, getCost, refresh } = useCredits()

  // Use TanStack Query for OpenRouter models
  const {
    data: openRouterModelsData,
    isLoading: isLoadingModels
  } = useOpenRouterModels(
    provider === 'openrouter' ? (mode === 'image' ? 'image' : 'text') : undefined
  )

  React.useEffect(() => {
    if (provider === 'openrouter') {
      if (openRouterModelsData?.models && openRouterModelsData.models.length > 0) {
        // Convert OpenRouterModel to the expected format
        const formattedModels = openRouterModelsData.models.map(model => ({
          id: model.id,
          label: model.label
        }))
        setDynamicOpenRouterModels(formattedModels)
        if (formattedModels.length > 0 && !model) {
          setModel(formattedModels[0].id)
        }
      } else if (!isLoadingModels) {
        // Fallback to static models if API fails
        setDynamicOpenRouterModels(null)
        const fallbackModels = mode === 'image' ? STATIC_IMAGE_MODELS_OPENROUTER : (currentProviderData?.models ?? STATIC_MODELS['openrouter'])
        if (fallbackModels.length > 0 && !model) {
          setModel(fallbackModels[0].id)
        }
      }
    } else if (currentProviderData) {
      // For non-OpenRouter providers, use models from provider data
      if (currentProviderData.models.length > 0 && !model) {
        setModel(currentProviderData.models[0].id)
      }
    }
  }, [provider, mode, openRouterModelsData, isLoadingModels, currentProviderData, model])

  const listRef = React.useRef<HTMLDivElement>(null)
  const endRef = React.useRef<HTMLDivElement>(null)
  const scrollRafRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    // auto-scroll to bottom when messages update
    if (scrollRafRef.current != null) {
      cancelAnimationFrame(scrollRafRef.current)
    }
    scrollRafRef.current = requestAnimationFrame(() => {
      endRef.current?.scrollIntoView({ block: 'end' })
      scrollRafRef.current = null
    })
    return () => {
      if (scrollRafRef.current != null) {
        cancelAnimationFrame(scrollRafRef.current)
        scrollRafRef.current = null
      }
    }
  }, [deferredMessages])

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
        { id: id1, role: 'user', content: prompt + (attachmentCount ? `\n\n(Anexada${attachmentCount>1?'s':''} ${attachmentCount} imagem${attachmentCount>1?'ns':''})` : '') },
        { id: id2, role: 'assistant', content: JSON.stringify({ images }) },
      ])
      setAttachments([])
    } catch (error) {
      const id1 = `u-${Date.now()}`
      const id2 = `a-${Date.now()}`

      // Check if it's a credit error
      if ((error as Error)?.message?.includes('402') || (error as Error)?.message?.includes('crédito')) {
        setMessages(prev => [
          ...prev,
          { id: id1, role: 'user', content: prompt },
          { id: id2, role: 'assistant', content: 'Você não tem créditos suficientes. [Ir para cobrança →](/billing)' },
        ])
      } else {
        setMessages(prev => [
          ...prev,
          { id: id1, role: 'user', content: prompt },
          { id: id2, role: 'assistant', content: 'Não foi possível gerar a imagem. Tente novamente.' },
        ])
      }
    }
  }
  
  // Wrap text submit to clear input right after sending
  const handleSubmitText = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const prompt = input.trim()
    if (!prompt) {
      return
    }

    // Auto-create conversation if none selected
    if (!currentConversationId) {
      try {
        const title = prompt.length > 50 ? prompt.substring(0, 50) + '...' : prompt
        const newConv = await createConversation.mutateAsync({ title })
        setCurrentConversationId(newConv.id)

        // Wait a bit for state to update before submitting
        setTimeout(() => {
          handleSubmit(e)
          setInput('')
          setAttachments([])
          setTimeout(() => refresh(), 300)
        }, 100)
      } catch (error) {
        console.error('Error creating conversation:', error)
        // Fallback: continue without conversation
        handleSubmit(e)
        setInput('')
        setAttachments([])
        setTimeout(() => refresh(), 300)
      }
    } else {
      handleSubmit(e)
      setInput('')
      setAttachments([])
      setTimeout(() => refresh(), 300)
    }
  }
  

  const handleAttachFile = () => {
    fileInputRef.current?.click()
  }
  const removeAttachment = (i: number) => setAttachments((prev) => prev.filter((_, idx) => idx !== i))

  const startUpload = (file: File) => {
    const id = `u-${Date.now()}-${Math.random().toString(36).slice(2,8)}`
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
          try { msg = (JSON.parse(xhr.responseText)?.error) || msg } catch {}
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

  // Create new conversation
  const handleNewConversation = async () => {
    try {
      const newConv = await createConversation.mutateAsync({
        title: 'Nova Conversa',
      })
      setCurrentConversationId(newConv.id)
      setMessages([])
      setHistoryOpen(false)
    } catch (error) {
      console.error('Error creating conversation:', error)
    }
  }

  // Select existing conversation
  const handleSelectConversation = (id: string) => {
    setCurrentConversationId(id)
    setHistoryOpen(false)
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
      // trigger a reload of the last user message
      try {
        // reload may exist on this hook version
        reload?.()
      } catch {}
    }
  }, [reload, setMessages])

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
        setMessages(prev => [...prev, { id, role: 'assistant', content: 'Você não tem mais créditos. [Ir para cobrança →](/billing)' }])
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [credits?.creditsRemaining])

  return (
    <>
      {/* History Sidebar */}
      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="mb-3 gap-2"
            onClick={() => setHistoryOpen(true)}
          >
            <History className="h-4 w-4" />
            Histórico de Conversas
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-80 overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Histórico de Conversas</SheetTitle>
          </SheetHeader>

          <div className="mt-6 space-y-2">
            <Button
              onClick={handleNewConversation}
              className="w-full gap-2"
              variant="default"
            >
              <Plus className="h-4 w-4" />
              Nova Conversa
            </Button>

            <div className="mt-4 space-y-1">
              {conversationsData?.conversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`group relative flex items-center justify-between rounded-lg border p-3 cursor-pointer transition-colors hover:bg-accent ${
                    currentConversationId === conv.id ? 'bg-accent border-primary' : ''
                  }`}
                  onClick={() => handleSelectConversation(conv.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">
                      {conv.title}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {conv._count?.messages || 0} mensagens · {new Date(conv.lastMessageAt).toLocaleDateString('pt-BR')}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteConversation(conv.id, e as unknown as React.MouseEvent)
                        }}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}

              {(!conversationsData?.conversations || conversationsData.conversations.length === 0) && (
                <p className="text-center text-sm text-muted-foreground py-8">
                  Nenhuma conversa ainda. Comece uma nova!
                </p>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <div>
          Modo: <span className="font-medium text-foreground">{mode === 'text' ? 'Texto' : 'Imagem'}</span> · Provedor: <span className="font-medium text-foreground">{availableProviders.find(p=>p.key===provider)?.name || 'N/A'}</span> · Modelo: <span className="font-medium text-foreground">{currentModels.find(m => m.id === model)?.label || model}</span>
          {provider === 'openrouter' && model.includes(':free') && (
            <span className="ml-1 text-green-600 dark:text-green-400">(Gratuito)</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {credits && (
            <div className="hidden sm:flex items-center gap-2 mr-2">
              <span className="text-xs">Créditos: <span className="font-medium text-foreground">{credits.creditsRemaining}</span></span>
            </div>
          )}
          <div className="hidden sm:block">
            <CreditStatus showUpgradeButton={false} />
          </div>
          <Button variant="ghost" size="icon" aria-label="Limpar chat" onClick={() => setMessages([])}>
            <Trash2 className="h-4 w-4" />
          </Button>
          {/* Stop button moved next to Enviar */}
        </div>
      </div>

      <ScrollArea className="mb-3">
        <div ref={listRef} className="flex flex-col gap-3 pr-2">
          {messages.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Selecione o provedor e o modelo, envie uma mensagem e acompanhe a resposta em tempo real.
            </p>
          )}
          {deferredMessages.map((m, idx) => {
            const normalizedRole = (m.role === 'user' || m.role === 'assistant' || m.role === 'system') ? m.role : 'assistant'
            const disableMarkdown =
              mode === 'text' &&
              normalizedRole === 'assistant' &&
              isLoading &&
              idx === deferredMessages.length - 1

            return (
              <MessageBubble
                key={m.id}
                message={{
                  id: m.id,
                  role: normalizedRole,
                  content: m.content
                }}
                onRetry={normalizedRole !== 'user' ? handleRetry : undefined}
                retryIndex={idx}
                disableMarkdown={disableMarkdown}
              />
            )
          })}
          {(isLoading || generateImage.isPending) && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {mode === 'image' ? 'Gerando imagem...' : 'Gerando resposta...'}
            </div>
          )}
          <div ref={endRef} />
        </div>
      </ScrollArea>

      {/* Animated input concept */}
      <div className={"relative rounded-2xl border bg-background/90 " + (dragActive ? 'border-primary ring-2 ring-primary/30' : 'border-border/60')} onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}>

        <form onSubmit={mode === 'image' ? handleSubmitImage : handleSubmitText} className="p-3">
          <textarea
            value={input}
            onChange={handleInputChange}
            onKeyDown={onKeyDown}
            placeholder="Digite sua mensagem... (Shift+Enter para nova linha)"
            rows={2}
            className="min-h-[60px] w-full resize-none rounded-md bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
          />
          <input ref={fileInputRef} type="file" className="hidden" onChange={onFileSelected} multiple accept={mode==='image' ? 'image/*' : undefined} />
          <AnimatePresence>
            {attachments.length > 0 && (
              <motion.div
                className="mt-2 flex flex-wrap gap-2"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                {attachments.map((att, i) => (
                  <motion.div
                    key={i}
                    className="flex items-center gap-2 rounded-lg bg-muted px-3 py-1.5 text-xs"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                  >
                    {att.url ? (
                      <a href={att.url} target="_blank" rel="noreferrer" className="underline hover:no-underline">{att.name}</a>
                    ) : (
                      <span>{att.name}</span>
                    )}
                    {att.status === 'uploading' && (
                      <span className="text-muted-foreground">{att.progress}%</span>
                    )}
                    {att.status === 'error' && (
                      <span className="text-destructive">{att.error || 'Falhou'}</span>
                    )}
                    <button type="button" onClick={() => {
                      const a = attachments[i]
                      if (a && a.status === 'uploading') {
                        const xhr = uploadRefs.current[a.id]
                        try { xhr?.abort() } catch {}
                        delete uploadRefs.current[a.id]
                      }
                      removeAttachment(i)
                    }} className="text-muted-foreground hover:text-foreground">
                      <XIcon className="h-3 w-3" />
                    </button>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-3 flex items-center justify-between gap-3 border-t pt-3">
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" size="icon" onClick={handleAttachFile} aria-label="Anexar">
                <Paperclip className="h-4 w-4" />
              </Button>
              
              {/* Mode selector */}
              <DropdownMenu open={modeMenuOpen} onOpenChange={setModeMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <DropdownTriggerButton isOpen={modeMenuOpen} aria-label="Selecionar modo">
                    {mode === 'image' ? (
                      <ImageIcon className="h-4 w-4" />
                    ) : (
                      <MessageSquare className="h-4 w-4" />
                    )}
                    <span className="truncate max-w-[100px]">{mode === 'text' ? 'Texto' : 'Imagem'}</span>
                  </DropdownTriggerButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={() => setMode('text')}>
                    <MessageSquare className="h-4 w-4 mr-2" /> Texto
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setMode('image')}>
                    <ImageIcon className="h-4 w-4 mr-2" /> Imagem
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Provider selector */}
              <DropdownMenu open={mode === 'image' ? false : providerMenuOpen} onOpenChange={(o)=>{ if (mode !== 'image') setProviderMenuOpen(o) }}>
                <DropdownMenuTrigger asChild>
                  <DropdownTriggerButton isOpen={providerMenuOpen} aria-label="Selecionar provedor" disabled={mode==='image' || isLoadingProviders}>
                    <Bot className="h-4 w-4" />
                    <span className="truncate max-w-[140px]">{availableProviders.find((p) => p.key === provider)?.name || 'Carregando...'}</span>
                  </DropdownTriggerButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {availableProviders.length === 0 ? (
                    <DropdownMenuItem disabled>
                      Nenhum provedor disponível
                    </DropdownMenuItem>
                  ) : (
                    availableProviders.map((p) => (
                      <DropdownMenuItem key={p.key} onClick={() => setProvider(p.key)}>
                        {p.name}
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              {/* Model selector */}
              <Autocomplete
                items={modelItems}
                value={model}
                onChange={setModel}
                icon={<Sparkles className="h-4 w-4" />}
                buttonAriaLabel="Selecionar modelo"
                placeholder="Buscar modelo..."
                className="min-w-[200px]"
              />
            </div>
            {mode === 'image' ? (
              <span className="text-xs text-muted-foreground mr-2">Custo: {getCost('image_generation')} créditos</span>
            ) : (
              <span className="text-xs text-muted-foreground mr-2">Custo: {getCost('ai_chat')} crédito</span>
            )}
            {isLoading ? (
              <Button
                type="button"
                onClick={() => stop?.()}
                variant="secondary"
                className="gap-2"
                aria-label="Parar geração"
              >
                <Square className="h-4 w-4" />
                Parar
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={
                  hasUploadingAttachments ||
                  (mode === 'image' && readyAttachments.length === 0) ||
                  !input.trim() ||
                  (mode === 'image' ? !canPerformOperation('image_generation') : !canPerformOperation('ai_chat'))
                }
                className="gap-2"
              >
                {generateImage.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Enviar
              </Button>
            )}
          </div>
        </form>
      </div>
    </Card>
    </>
  )
}
