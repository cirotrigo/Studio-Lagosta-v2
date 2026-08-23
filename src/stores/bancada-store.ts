'use client'

/**
 * Fila da bancada — os itens que o operador está produzindo agora.
 *
 * O item nasce RASCUNHO no navegador (foto + copy + papéis, antes de gastar
 * crédito): é o que permite montar a leva inteira e revisar antes de gerar,
 * como na bancada do insta-automatico. A partir do "Gerar", a verdade passa a
 * ser o banco — o item guarda só o `generationId` e o resto vem de lá.
 *
 * localStorage e não tabela nova: o que se perde é um rascunho AINDA não
 * gerado em outro dispositivo, e é o mesmo contrato da fila de melhorias que
 * já roda em produção. Arte gerada, post agendado — o que importa — já são
 * duráveis no banco.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PapelReferencia } from '@/components/creatives/arte-ia-image-picker'
import { ESCOPO_PADRAO, type EscopoAprendizado } from '@/lib/posts/learning-scope'
import { hidratarItens, temTrabalhoNoServidor, type PlanoDoServidor } from '@/lib/planos/para-bancada'
import type { StatusDoItem, ViaDoItem } from '@/lib/planos/vocabulario'

/**
 * `guia-pronto` só existe no carrossel: capa e slide-guia ficaram prontos e a
 * série espera a pessoa CONFIRMAR o look antes de gerar o resto. É a etapa
 * que evita produzir 6 slides no estilo errado.
 */
export type BancadaStatus =
  | 'rascunho'
  | 'gerando'
  | 'guia-pronto'
  | 'pronto'
  | 'erro'
  | 'agendado'

export interface BancadaSlide {
  ordem: number
  /** Vazio na capa (foto pura, sem texto). */
  copy: string[]
  referencia: BancadaReferencia
  generationId?: string
  resultUrl?: string | null
  erro?: string | null
  /** Aviso da conferência automática deste slide (texto não encontrado). */
  aviso?: string | null
}

export interface BancadaReferencia {
  papel: PapelReferencia
  driveFileId?: string
  url?: string
  label?: string
  thumbUrl: string
  /**
   * Presente só quando a referência é uma ARTE DE REFERÊNCIA estrelada
   * (Generation), escolhida no seletor "Base da arte" do card — é o que
   * distingue essa escolha de uma foto de estilo do acervo e permite trocá-la
   * sem mexer nas demais. Escolha do NAVEGADOR por decisão (13/08/2026, sem
   * migration): o item do plano guarda só a via; a referência exata fica no
   * card local, mesma regra das âncoras extras.
   */
  generationId?: string
}

export interface BancadaItem {
  id: string
  projectId: number
  /**
   * O item do plano de conteúdo (F3) que este card representa — a CHAVE DE
   * DEDUPE entre o servidor e o navegador. Card montado aqui na bancada não
   * tem: ele nunca esteve no servidor, e é isso que o protege da hidratação.
   */
  itemDePlanoId?: string
  planoId?: string
  /**
   * A situação do item NO PLANO, que é mais fina que a da bancada: `rascunho`
   * cobre proposto, editado, aprovado, reprovado e a espera da fila. Guardá-la
   * é o que permite mostrar a etiqueta certa e calcular de onde partir quando o
   * avanço volta ao servidor.
   */
  situacaoNoPlano?: StatusDoItem
  /** Por onde a arte deve nascer: modelo do cliente (sem custo) ou IA. */
  via?: ViaDoItem
  /**
   * O modelo do cliente a seguir na via template. Nulo/ausente = ninguém
   * escolheu, e aí quem decide é a ROTAÇÃO (o modelo menos usado do formato)
   * na hora de montar. A escolha também é persistida no ItemDePlano
   * (`sourcePageId`), para o chat e os outros navegadores verem a mesma.
   */
  sourcePageId?: string | null
  /** Do que a peça trata — o assunto combinado no plano. */
  tema?: string | null
  /** Por que o item foi reprovado no plano. Recusa com motivo não é beco. */
  motivoReprovacao?: string | null
  trilha: 'arte' | 'imagem'
  formato: 'story' | 'feed' | 'quadrado'
  /** 'peca' = arte única; 'carrossel' = série de slides. */
  tipo?: 'peca' | 'carrossel'
  /** Carrossel: os slides, em ordem (1 = capa, foto pura). */
  slides?: BancadaSlide[]
  /** Carrossel: agrupa as Generations dos slides no banco. */
  carouselGroupId?: string
  /** Carrossel: legenda do post (obrigatória — carrossel vai para o feed). */
  legenda?: string
  copy: string[]
  pedido: string
  instrucaoImagem?: string | null
  /** Co-branding: o cliente CITADO na peça, cuja logomarca é composta na arte. */
  clienteCitado?: { projectId: number; nome: string | null } | null
  referencias: BancadaReferencia[]
  /** Horário planejado (slot da cadência ou escolha manual), "YYYY-MM-DD HH:mm". */
  quando?: string | null
  /**
   * O que o sistema pode aprender com este post (rotina/campanha/pontual).
   * Vai junto no agendamento e vira coluna do post — o estado durável é o do
   * banco, este campo é só o transporte da escolha feita no compositor.
   */
  escopo?: EscopoAprendizado
  /** Por que este horário (motivo do slot) — some quando o operador escolhe à mão. */
  motivoDoSlot?: string | null
  /**
   * O sinal da sugestão de horário que este item aceitou (F1). Vai junto no
   * agendamento e é lá, no SERVIDOR, que o desfecho é decidido comparando o
   * horário proposto com o agendado — a superfície não declara "aceitei".
   *
   * Só existe quando o horário veio do seletor de slots: horário digitado à
   * mão não tem proposta atrás, e a proposta que estava selecionada já foi
   * fechada como `editada` no compositor.
   */
  sugestaoId?: string | null
  status: BancadaStatus
  criadoEm: number
  /** Generation no servidor, a partir do "Gerar". */
  generationId?: string
  /**
   * Página da arte, quando ela nasceu pelo EDITOR (via template). Vai junto no
   * agendamento: com a página vinculada, o post nasce RENDERED e editar a arte
   * depois re-renderiza (`invalidateScheduledRenders` o alcança) — sem ela o
   * post congela no PNG do momento.
   */
  pageId?: string
  resultUrl?: string | null
  erro?: string | null
  /**
   * Arte PRONTA mas com aviso da conferência automática (ex.: texto que o
   * comparador não achou). Não bloqueia nada — é o convite para conferir no
   * olho antes de agendar.
   */
  aviso?: string | null
  /** Post criado ao agendar — o card vira "agendado" e sai do caminho. */
  postId?: string
}

export type NovoItem = Omit<BancadaItem, 'id' | 'status' | 'criadoEm'>

interface BancadaState {
  itens: BancadaItem[]
  hidratou: boolean
  /**
   * Escopo com que os PRÓXIMOS itens nascem marcados — o "modo aprendizado"
   * como açúcar de UI, nunca como interruptor da captura: ele só pré-marca o
   * chip do compositor, e o que vale é o escopo gravado em cada post.
   *
   * De propósito FORA do `partialize`: um padrão persistido em localStorage é
   * exatamente o interruptor esquecido ligado que se quer evitar — semanas de
   * arte marcadas "pontual" sem ninguém notar. Recarregou, volta para rotina.
   */
  escopoPadrao: EscopoAprendizado

  /**
   * `depoisDe`: insere o card logo ABAIXO do card com esse id — é o caso do
   * duplicar, que nasce colado ao original. Sem a opção (ou id não achado), o
   * card entra no topo, que é onde rascunho novo sempre entrou.
   */
  adicionar: (input: NovoItem, opcoes?: { depoisDe?: string }) => string
  atualizar: (id: string, patch: Partial<BancadaItem>) => void
  remover: (id: string) => void
  limparFinalizados: (projectId: number) => void
  setHidratou: (v: boolean) => void
  setEscopoPadrao: (escopo: EscopoAprendizado) => void
  /**
   * Reconcilia a fila com o plano ativo do projeto — é o que faz o chat e a
   * bancada enxergarem a MESMA leva.
   *
   * ⚠️ Só pode ser chamada com uma resposta que CHEGOU: `null` significa "este
   * projeto não tem leva ativa", não "a consulta ainda não voltou". Ver o
   * contrato em `hidratarItens`.
   */
  hidratarDoPlano: (projectId: number, plano: PlanoDoServidor | null) => void
}

const STORAGE_KEY = 'lagosta.bancada'

function novoId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)
}

export const useBancadaStore = create(
  persist<BancadaState>(
    (set) => ({
      itens: [],
      hidratou: false,
      escopoPadrao: ESCOPO_PADRAO,

      adicionar: (input, opcoes) => {
        const id = novoId()
        set((state) => {
          const novo: BancadaItem = { ...input, id, status: 'rascunho', criadoEm: Date.now() }
          const apos = opcoes?.depoisDe
            ? state.itens.findIndex((i) => i.id === opcoes.depoisDe)
            : -1
          if (apos < 0) return { itens: [novo, ...state.itens] }
          const itens = [...state.itens]
          itens.splice(apos + 1, 0, novo)
          return { itens }
        })
        return id
      },

      atualizar: (id, patch) =>
        set((state) => ({
          itens: state.itens.map((i) => (i.id === id ? { ...i, ...patch } : i)),
        })),

      remover: (id) => set((state) => ({ itens: state.itens.filter((i) => i.id !== id) })),

      limparFinalizados: (projectId) =>
        set((state) => ({
          itens: state.itens.filter(
            (i) => i.projectId !== projectId || (i.status !== 'agendado' && i.status !== 'erro'),
          ),
        })),

      setHidratou: (v) => set({ hidratou: v }),

      setEscopoPadrao: (escopo) => set({ escopoPadrao: escopo }),

      hidratarDoPlano: (projectId, plano) =>
        // `hidratarItens` devolve a MESMA referência quando nada mudou, e é o
        // que impede a fila de repintar a cada refetch da consulta.
        set((state) => ({ itens: hidratarItens(state.itens, plano, projectId) })),
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({ itens: state.itens } as BancadaState),
      onRehydrateStorage: () => (state, error) => {
        if (error) console.error('[bancada] erro ao reidratar a fila', error)
        if (state) {
          /**
           * Item que ficou "gerando" ao recarregar continua gerando NO
           * SERVIDOR — o polling reata pelo id da Generation. Sem NENHUM id,
           * porém, o clique se perdeu antes do POST: volta a rascunho para
           * não ficar um card girando para sempre.
           *
           * No carrossel o id não está no item, está nos SLIDES: olhar só
           * `generationId` fazia a série voltar para "na fila" a cada recarga
           * mesmo com capa e guia prontos — e quem clicasse em Gerar de novo
           * pagaria duas vezes pelo mesmo trabalho.
           *
           * O predicado mudou de casa para `@/lib/planos/para-bancada` (módulo
           * puro) porque a hidratação do plano precisa da MESMA resposta para
           * decidir o que fazer com um card cujo item sumiu da leva. A regra
           * aqui não mudou nem um caractere.
           */
          state.itens = state.itens.map((i) => {
            if (i.status === 'gerando' && !temTrabalhoNoServidor(i)) {
              return { ...i, status: 'rascunho' as const }
            }
            // Rede de segurança: rascunho que JÁ tem geração no servidor
            // (estado que a versão anterior deste guard produzia) volta para
            // "gerando" e deixa o polling reconciliar. Sem isso o card
            // oferece "Gerar" de novo e a pessoa paga duas vezes pelo mesmo
            // trabalho.
            if (i.status === 'rascunho' && temTrabalhoNoServidor(i)) {
              return { ...i, status: 'gerando' as const }
            }
            return i
          })
          state.setHidratou(true)
        }
      },
    },
  ),
)

/** Itens de um projeto, mais recentes primeiro (é fila, não grade). */
export function selecionarItensDoProjeto(projectId: number) {
  return (state: BancadaState) => state.itens.filter((i) => i.projectId === projectId)
}
