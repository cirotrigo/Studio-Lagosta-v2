"use client"

import * as React from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
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

/**
 * TemplateAIChat - Componente de chat com IA otimizado para o painel lateral do editor
 * Versão compacta sem seleção de providers/models (usa defaults)
 * Inclui histórico de conversas com persistência
 */
export function TemplateAIChat({ projectId }: { projectId: number }) {
  // Conversation history state
  const [currentConversationId, setCurrentConversationId] = React.useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = React.useState(false)

  // Fetch conversations and current conversation
  const { data: conversationsData } = useConversations(projectId)
  const { data: currentConversation } = useConversation(currentConversationId, projectId)
  const createConversation = useCreateConversation(projectId)
  const deleteConversation = useDeleteConversation(projectId)

  const [input, setInput] = React.useState('')

  // Use ref to ensure body function always gets current conversationId (AI SDK v5 closure issue)
  const conversationIdRef = React.useRef(currentConversationId)
  React.useEffect(() => {
    conversationIdRef.current = currentConversationId
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
      }))
      setMessages(loadedMessages)
    }
  }, [currentConversation, setMessages])

  const deferredMessages = React.useDeferredValue(messages)
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

  const handleSubmitWrapper = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const prompt = input.trim()
    if (!prompt) return

    // Auto-create conversation if none selected
    if (!currentConversationId) {
      try {
        const title = prompt.length > 50 ? prompt.substring(0, 50) + '...' : prompt
        const newConv = await createConversation.mutateAsync({ title })
        setCurrentConversationId(newConv.id)

        // Wait a bit for state to update before submitting
        setTimeout(() => {
          sendMessage({ text: prompt })
          setInput('')
          setTimeout(() => refresh(), 300)
        }, 100)
      } catch (error) {
        console.error('Error creating conversation:', error)
        // Fallback: continue without conversation
        sendMessage({ text: prompt })
        setInput('')
        setTimeout(() => refresh(), 300)
      }
    } else {
      sendMessage({ text: prompt })
      setInput('')
      setTimeout(() => refresh(), 300)
    }
  }

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

              // Extract text content from parts
              const content = m.parts?.map(part => part.type === 'text' ? part.text : '').join('') || ''

              return (
                <MessageBubble
                  key={m.id}
                  message={{
                    id: m.id,
                    role: normalizedRole,
                    content
                  }}
                  disableMarkdown={disableMarkdown}
                />
              )
            })}
            {status === 'streaming' && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Gerando resposta...
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
                  disabled={!input.trim() || !canPerformOperation('ai_chat') || status !== 'ready'}
                  className="gap-2"
                >
                  <Send className="h-3.5 w-3.5" />
                  Enviar
                </Button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
