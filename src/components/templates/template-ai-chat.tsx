"use client"

import * as React from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { MessageBubble } from '@/components/chat/message-bubble'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Loader2, Send, Square, Trash2, History, Plus, MoreVertical } from 'lucide-react'
import { useCredits } from '@/hooks/use-credits'
import { useConversations, useConversation, useCreateConversation, useDeleteConversation } from '@/hooks/use-conversations'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuPortal,
} from '@/components/ui/dropdown-menu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { TrainingModeToggle } from '@/components/chat/training-mode-toggle'
import { KnowledgePreviewCard } from '@/components/chat/knowledge-preview-card'
import { DuplicateWarningCard } from '@/components/chat/duplicate-warning-card'
import { MultipleMatchesCard } from '@/components/chat/multiple-matches-card'
import { EditPreviewForm } from '@/components/chat/edit-preview-form'
import type { TrainingPreview } from '@/lib/knowledge/training-pipeline'
import { useProjectSelectionStore } from '@/stores/project-selection'
import {
  isDisambiguationResponse,
  handleDisambiguationChoice,
  createDisambiguationState,
} from '@/lib/knowledge/disambiguation'

/**
 * TemplateAIChat - Componente de chat com IA otimizado para o painel lateral do editor
 * Versão compacta sem seleção de providers/models (usa defaults)
 * Inclui histórico de conversas com persistência
 */
export function TemplateAIChat({ projectId }: { projectId: number }) {
  const setPersistedProjectId = useProjectSelectionStore(state => state.setLastProjectId)
  const hasProjectSelectionHydrated = useProjectSelectionStore(state => state.hasHydrated)

  React.useEffect(() => {
    if (!hasProjectSelectionHydrated) return
    setPersistedProjectId(projectId)
  }, [hasProjectSelectionHydrated, projectId, setPersistedProjectId])

  const queryClient = useQueryClient()
  // Conversation history state
  const [currentConversationId, setCurrentConversationId] = React.useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = React.useState(false)
  const [trainingMode, setTrainingMode] = React.useState(false)
  const [pendingPreview, setPendingPreview] = React.useState<TrainingPreview | null>(null)
  const [editingPreview, setEditingPreview] = React.useState<TrainingPreview | null>(null)
  const [isSavingPreview, setIsSavingPreview] = React.useState(false)
  const [isTrainingLoading, setIsTrainingLoading] = React.useState(false)
  const [messageMetadata, setMessageMetadata] = React.useState<Record<string, unknown>>({})

  // Fetch conversations and current conversation
  const { data: conversationsData } = useConversations(projectId)
  const {
    data: currentConversation,
    refetch: refetchConversation,
  } = useConversation(currentConversationId, projectId)
  const createConversation = useCreateConversation(projectId)
  const deleteConversation = useDeleteConversation(projectId)

  const [input, setInput] = React.useState('')

  // Use ref to ensure body function always gets current conversationId (AI SDK v5 closure issue)
  const conversationIdRef = React.useRef(currentConversationId)
  React.useEffect(() => {
    conversationIdRef.current = currentConversationId
  }, [currentConversationId])
  React.useEffect(() => {
    // Limpa pré-visualizações ao trocar de conversa
    setPendingPreview(null)
  }, [currentConversationId])

  const { messages, sendMessage, status, stop, setMessages } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/ai/chat',
      body: () => ({
        provider: 'openai',
        model: 'gpt-5-mini', // Modelo econômico e balanceado para uso no editor
        conversationId: conversationIdRef.current,
        projectId,
      }),
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

  // Load conversation messages when a conversation is selected
  React.useEffect(() => {
    if (currentConversation?.messages) {
      const loadedMessages = currentConversation.messages.map((msg) => ({
        id: msg.id,
        role: msg.role as 'user' | 'assistant' | 'system',
        parts: [{ type: 'text' as const, text: msg.content }],
        metadata: msg.metadata ?? undefined,
      }))
      const metadataMap: Record<string, unknown> = {}
      currentConversation.messages.forEach((msg) => {
        if (msg.metadata) {
          metadataMap[msg.id] = msg.metadata
        }
      })
      setMessageMetadata(metadataMap)
      setMessages(loadedMessages as any)
    }
  }, [currentConversation, setMessages])

  const deferredMessages = React.useDeferredValue(messages)
  const lastStatusRef = React.useRef<typeof status | null>(null)
  React.useEffect(() => {
    if (lastStatusRef.current === 'streaming' && status !== 'streaming') {
      queryClient.invalidateQueries({ queryKey: ['conversations', 'list', projectId] })
      if (currentConversationId) {
        refetchConversation()
      }
    }
    lastStatusRef.current = status
  }, [currentConversationId, projectId, queryClient, refetchConversation, status])
  const { canPerformOperation, getCost, refresh } = useCredits()

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
      const form = (e.currentTarget as HTMLTextAreaElement).form
      form?.requestSubmit()
    }
  }

  const ensureConversationId = React.useCallback(
    async (titleHint: string) => {
      if (conversationIdRef.current) return conversationIdRef.current

      const newConv = await createConversation.mutateAsync({
        title: titleHint,
      })

      setCurrentConversationId(newConv.id)
      conversationIdRef.current = newConv.id
      return newConv.id
    },
    [createConversation]
  )

  const handleTrainingSubmit = async (prompt: string) => {
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
          projectId,
          message: prompt,
          conversationId: convId,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data?.error || 'Não foi possível gerar a pré-visualização.')
      }

      // Intent foi classificada como consulta
      if (!data.preview) {
        const assistantId = `a-${Date.now()}`
        setMessages(prev => [
          ...prev,
          { id: assistantId, role: 'assistant', parts: [{ type: 'text', text: data.message || 'Ative o modo consulta para fazer perguntas.' }] },
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
      if (conversationIdRef.current) {
        queryClient.invalidateQueries({ queryKey: ['conversations', 'list', projectId] })
      }
    } catch (error) {
      console.error('Erro no modo treinamento:', error)
      const message =
        (error as Error)?.message || 'Não foi possível processar a solicitação de treinamento.'
      const assistantId = `err-${Date.now()}`
      setMessages(prev => [
        ...prev,
        { id: assistantId, role: 'assistant', parts: [{ type: 'text', text: message }] },
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
    if (!pendingPreview) return
    const previewToSend = normalizePreviewForConfirm(pendingPreview)

    try {
      setIsSavingPreview(true)
      const response = await fetch('/api/knowledge/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          preview: previewToSend,
          conversationId: conversationIdRef.current,
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data?.error || 'Não foi possível salvar o conhecimento.')
      }

      setPendingPreview(null)
    } catch (error) {
      console.error('Erro ao confirmar conhecimento:', error)
      const assistantId = `err-${Date.now()}`
      setMessages(prev => [
        ...prev,
        {
          id: assistantId,
          role: 'assistant',
          parts: [{ type: 'text', text: (error as Error)?.message || 'Erro ao salvar.' }],
        },
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

  const handleSubmitWrapper = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const prompt = input.trim()
    if (!prompt) return

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

    if (conversationIdToUse) {
      conversationIdRef.current = conversationIdToUse
    }

    sendMessage({ text: prompt })
    setInput('')
    setTimeout(() => refresh(), 300)
  }

  // Create new conversation
  const handleNewConversation = async () => {
    try {
      const newConv = await createConversation.mutateAsync({
        title: 'Nova Conversa',
      })
      setCurrentConversationId(newConv.id)
      setMessages([])
      setMessageMetadata({})
      setHistoryOpen(false)
    } catch (error) {
      console.error('Error creating conversation:', error)
    }
  }

  // Select existing conversation
  const handleSelectConversation = (id: string) => {
    setCurrentConversationId(id)
    setMessageMetadata({})
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
          setMessageMetadata({})
        }
      } catch (error) {
        console.error('Error deleting conversation:', error)
      }
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header with history and new conversation buttons */}
      <div className="flex-shrink-0 flex items-center justify-between gap-2 border-b border-border/40 p-4 pb-3">
        <div className="flex items-center gap-1">
          <Popover open={historyOpen} onOpenChange={setHistoryOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title="Histórico de conversas"
              >
                <History className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="start">
              <div className="flex flex-col max-h-[400px]">
                <div className="flex-shrink-0 border-b border-border/40 p-3">
                  <h3 className="text-sm font-semibold">Histórico de Conversas</h3>
                </div>
                <div className="flex-shrink-0 p-2 border-b border-border/40">
                  <Button
                    onClick={handleNewConversation}
                    className="w-full gap-2"
                    variant="outline"
                    size="sm"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Nova Conversa
                  </Button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto">
                  <div className="space-y-1 p-2">
                    {conversationsData?.conversations.map((conv) => (
                      <div
                        key={conv.id}
                        className={`group relative flex items-center gap-2 rounded-md border p-2 transition-colors hover:bg-accent ${
                          currentConversationId === conv.id ? 'bg-accent border-primary' : ''
                        }`}
                      >
                        <div
                          className="flex-1 min-w-0 cursor-pointer"
                          onClick={() => handleSelectConversation(conv.id)}
                        >
                          <div className="font-medium text-xs truncate">
                            {conv.title}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {conv._count?.messages || 0} msgs · {new Date(conv.lastMessageAt).toLocaleDateString('pt-BR')}
                          </div>
                        </div>
                        <DropdownMenu modal={false}>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 flex-shrink-0"
                              onClick={(e) => {
                                e.stopPropagation()
                                e.preventDefault()
                              }}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuPortal>
                            <DropdownMenuContent
                              align="end"
                              side="bottom"
                              className="z-[9999]"
                              onCloseAutoFocus={(e) => e.preventDefault()}
                              sideOffset={5}
                            >
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDeleteConversation(conv.id, e as unknown as React.MouseEvent)
                                }}
                                className="text-destructive cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-2" />
                                Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenuPortal>
                        </DropdownMenu>
                      </div>
                    ))}

                    {(!conversationsData?.conversations || conversationsData.conversations.length === 0) && (
                      <p className="text-center text-xs text-muted-foreground py-4">
                        Nenhuma conversa ainda.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleNewConversation}
            title="Nova conversa"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      <div className="text-[10px] text-muted-foreground">
        GPT-5 Mini · {getCost('ai_chat')} crédito
      </div>
    </div>

      <div className="flex-shrink-0 border-b border-border/40 px-4 pb-3">
        <TrainingModeToggle
          enabled={trainingMode}
          onChange={(value) => {
            setTrainingMode(value)
            setPendingPreview(null)
          }}
        />
      </div>

      {/* Messages area */}
      <div className="flex-1 min-h-0 overflow-hidden px-4">
        <ScrollArea className="h-full">
          <div ref={listRef} className="flex flex-col gap-3 pr-2 py-3">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  Faça perguntas sobre design, conteúdo ou peça ajuda com seu template.
                </p>
              </div>
            )}
            {deferredMessages.map((m, idx) => {
              const normalizedRole = (m.role === 'user' || m.role === 'assistant' || m.role === 'system') ? m.role : 'assistant'
              const disableMarkdown = normalizedRole === 'assistant' && status === 'streaming' && idx === deferredMessages.length - 1
              const metadata = (m as { metadata?: Record<string, unknown> }).metadata ?? messageMetadata[m.id]

              // Extract text content from parts
              const content = m.parts?.map(part => part.type === 'text' ? part.text : '').join('') || ''

              return (
                <MessageBubble
                  key={m.id}
                  message={{
                    id: m.id,
                    role: normalizedRole,
                    content,
                    metadata,
                  }}
                  disableMarkdown={disableMarkdown}
                />
              )
            })}
            {pendingPreview && !editingPreview && (
              <div className="space-y-3">
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
                      // Atualizar preview com targetEntryId selecionado
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
            {(status === 'streaming' || isTrainingLoading) && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />{' '}
                {trainingMode ? 'Gerando pré-visualização...' : 'Gerando resposta...'}
              </div>
            )}
            <div ref={endRef} />
          </div>
        </ScrollArea>
      </div>

      {/* Input area */}
      <div className="flex-shrink-0 border-t border-border/40 p-4 pt-3">
        <form onSubmit={handleSubmitWrapper}>
          <div className="flex flex-col gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Digite sua mensagem... (Enter para enviar)"
              rows={3}
              className="w-full resize-none rounded-md border border-border/60 bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary"
            />
            <div className="flex justify-end">
              {status === 'streaming' ? (
                <Button
                  type="button"
                  onClick={() => stop?.()}
                  variant="secondary"
                  size="sm"
                  className="gap-2"
                >
                  <Square className="h-3.5 w-3.5" />
                  Parar
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="sm"
                  disabled={
                    !input.trim() ||
                    !canPerformOperation('ai_chat') ||
                    status !== 'ready' ||
                    isTrainingLoading ||
                    isSavingPreview ||
                    (trainingMode && !!pendingPreview)
                  }
                  className="gap-2"
                >
                  <Send className="h-3.5 w-3.5" />
                  {trainingMode ? 'Gerar preview' : 'Enviar'}
                </Button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
