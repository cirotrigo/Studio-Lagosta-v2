/**
 * Contrato PURO da troca de arte de um post da agenda.
 *
 * Aqui moram as decisões que não precisam de banco: quem pode trocar, qual
 * posição da lista é trocada, como a lista nova é montada e — a parte que
 * carrega o risco — que vínculo de render o post passa a ter.
 *
 * Módulo sem `@/lib/db` de propósito (mesma razão de `learning-scope.ts`,
 * `page-layers.ts` e `approval-checklist.ts`): `db.ts` lê `DATABASE_URL` no
 * import e LANÇA quando ela falta, o que tornaria estas regras não-testáveis.
 * O serviço que fala com o banco é `trocar-arte-do-post.ts`.
 */

import { descreverJanela } from './freeze-window'

/** De onde vem a arte nova. */
export type OrigemDaArte =
  /** Uma Generation já pronta (galeria, arte melhorada, upload). */
  | 'galeria'
  /** O render de uma página do editor. */
  | 'pagina'

export interface RecusaDaTroca {
  /** Código estável, para a rota HTTP e as tools. */
  codigo: string
  /** Português natural: quem lê é a equipe de conteúdo. */
  mensagem: string
  status: number
}

export interface PostParaTroca {
  status: string
  laterPostId?: string | null
  scheduledDatetime?: Date | string | null
}

/**
 * Pode trocar a arte deste post? `null` = pode.
 *
 * Duas travas, nesta ordem:
 *
 * 1. **Já entregue ao publicador** (`laterPostId`) — é um fato físico, não uma
 *    regra nossa: o que vai ao ar é a cópia que está no Zernio e nada no funil
 *    de render fala com ele. Trocar `mediaUrls` aqui faria a agenda mentir
 *    sobre o que foi publicado. Vem primeiro porque a mensagem certa é a da
 *    janela de congelamento ("cancele e agende de novo"), não a de aprovação.
 * 2. **Só RASCUNHO.** Post aprovado está armado para publicar, e trocar a arte
 *    dele seria mudar uma publicação real sem re-aprovação — a mesma regra que
 *    `editarPost` já aplica à legenda. O caminho existe e é curto:
 *    voltar-para-rascunho → trocar → aprovar de novo.
 */
export function recusaDaTroca(post: PostParaTroca): RecusaDaTroca | null {
  if (post.laterPostId) {
    return {
      codigo: 'POST_CONGELADO',
      mensagem: descreverJanela(post).mensagem,
      status: 400,
    }
  }

  switch (post.status) {
    case 'DRAFT':
      return null
    case 'SCHEDULED':
      return {
        codigo: 'POST_APROVADO',
        mensagem:
          'Este post já está aprovado e armado para publicar. Traga-o de volta para rascunho ' +
          '(voltar-para-rascunho), troque a arte, e aprove de novo — trocar a arte de algo armado ' +
          'mudaria uma publicação real sem re-aprovação.',
        status: 400,
      }
    case 'POSTED':
      return {
        codigo: 'POST_JA_PUBLICADO',
        mensagem: 'Este post já foi publicado — não dá mais para trocar a arte.',
        status: 400,
      }
    case 'POSTING':
      return {
        codigo: 'POST_SAINDO',
        mensagem: 'Este post está sendo publicado agora — não dá mais para trocar a arte.',
        status: 400,
      }
    case 'FAILED':
      return {
        codigo: 'POST_FALHOU',
        mensagem:
          'Este post falhou ao publicar. Confira o aviso no WhatsApp e use a agenda no Studio, ' +
          'ou crie um post novo com a arte certa.',
        status: 400,
      }
    default:
      return {
        codigo: 'SITUACAO_NAO_PERMITE',
        mensagem: 'Este post não está como rascunho, e só rascunho aceita troca de arte.',
        status: 400,
      }
  }
}

/**
 * Shape único em vez de união discriminada, pelo mesmo motivo de
 * `RenderPostArtResult`: o tsconfig do projeto roda com `strict: false` e, sem
 * `strictNullChecks`, o narrowing por `ok: true` não acontece — quem checasse
 * `ok` não conseguiria ler `recusa` depois. Quem chama testa `ok` antes.
 */
export interface EscolhaDeIndice {
  ok: boolean
  /** Só quando `ok`. */
  indice?: number
  /** Só quando não `ok`. */
  recusa?: RecusaDaTroca
}

/**
 * Qual posição da lista de mídias vai ser trocada.
 *
 * Índice fora do intervalo é RECUSA, nunca clamp. O clamp existe no runner da
 * melhoria (que recebe o índice de uma tela e não de gente), mas aqui quem
 * informa "slide 5" de um carrossel de 3 está enganado sobre o post — e
 * silenciosamente trocar o slide 3 esconderia o engano.
 */
export function escolherIndice(midiasAtuais: string[], indice?: number | null): EscolhaDeIndice {
  if (indice === undefined || indice === null) return { ok: true, indice: 0 }

  if (!Number.isInteger(indice) || indice < 0) {
    return {
      ok: false,
      recusa: {
        codigo: 'INDICE_INVALIDO',
        mensagem: `Posição inválida (${indice}). A primeira imagem é 0, a segunda é 1, e assim por diante.`,
        status: 400,
      },
    }
  }

  // Post sem arte nenhuma: a troca vira a PRIMEIRA imagem, e só a posição 0
  // existe. Aceitar 3 aqui criaria buraco na lista.
  const posicoes = Math.max(midiasAtuais.length, 1)
  if (indice >= posicoes) {
    return {
      ok: false,
      recusa: {
        codigo: 'INDICE_FORA_DO_POST',
        mensagem:
          midiasAtuais.length > 1
            ? `Este post tem ${midiasAtuais.length} imagens — informe uma posição de 0 a ${midiasAtuais.length - 1} (a primeira é 0).`
            : 'Este post tem uma imagem só — a posição a trocar é 0.',
        status: 400,
      },
    }
  }

  return { ok: true, indice }
}

/**
 * A lista nova de mídias. **NUNCA reduz a quantidade.**
 *
 * É a lição mais cara do repositório: o runner da melhoria gravava
 * `mediaUrls: [nova]` e apagava todos os outros slides de um carrossel — em
 * silêncio e sem volta, porque a melhoria também marca `NOT_NEEDED` e tira o
 * post do alcance do re-render. Aqui se copia a lista e se troca UMA posição.
 */
export function montarNovasMidias(midiasAtuais: string[], indice: number, url: string): string[] {
  if (midiasAtuais.length === 0) return [url]
  const novas = [...midiasAtuais]
  novas[indice] = url
  return novas
}

export interface DecisaoDeRender {
  /** O que gravar em `SocialPost.renderStatus`. */
  renderStatus: 'RENDERED' | 'NOT_NEEDED'
  /**
   * O post passa a apontar para a página (e continua no alcance do cron de
   * render e da invalidação por edição)?
   */
  vinculaPagina: boolean
  /** Por quê — vai para o log e para o `LearningSignal`. */
  motivo: string
}

/**
 * O CORAÇÃO DA TROCA: que vínculo de render o post passa a ter.
 *
 * - Arte da **galeria** é mídia pronta, que não vem do render de página
 *   nenhuma: `NOT_NEEDED`. Deixá-la `RENDERED` faria o cron `render-stories` e
 *   `invalidateScheduledRenders` sobrescreverem a arte em minutos.
 * - Arte de **página** num post de imagem ÚNICA: `RENDERED`, com a página
 *   gravada. É o que mantém o post no alcance do re-render quando alguém
 *   editar o template — arte que saiu de um render nasce RENDERED, e gravar
 *   NOT_NEEDED nela é o que já congelou posts no PNG do momento da criação.
 * - Arte de página num **CARROSSEL**: `NOT_NEEDED` e a página NÃO é gravada.
 *   Aqui o brief não decidia, e o caminho óbvio é uma armadilha:
 *   `renderPostArt` grava `mediaUrls: [url]` — uma lista de UM —, então um
 *   post de 3 slides que ficasse no alcance do cron perderia 2 deles no
 *   primeiro re-render. O vínculo página↔post só é seguro para post de imagem
 *   única; para carrossel a arte é tratada como pronta, que é o que ela é.
 */
export function decidirRender(origem: OrigemDaArte, totalDeMidias: number): DecisaoDeRender {
  if (origem === 'galeria') {
    return {
      renderStatus: 'NOT_NEEDED',
      vinculaPagina: false,
      motivo: 'arte pronta da galeria — não vem do render de uma página',
    }
  }

  if (totalDeMidias > 1) {
    return {
      renderStatus: 'NOT_NEEDED',
      vinculaPagina: false,
      motivo:
        'carrossel: o re-render publica uma imagem só e apagaria os outros slides, ' +
        'então a arte da página entra como imagem pronta',
    }
  }

  return {
    renderStatus: 'RENDERED',
    vinculaPagina: true,
    motivo: 'a arte vem do render desta página e acompanha edições futuras dela',
  }
}

/**
 * Os textos de uma Generation, no formato de `SocialPost.slotValues`.
 *
 * Espelha o `apenasTextos` de `agendar.ts`: campo começado por `_` é reservado
 * (`_driveImageId`, `_imageUrl`) e valor objeto carrega o texto em `content`.
 * `null` quando não há texto conhecido — e `null` significa "não sei", nunca
 * "não tem", por isso quem chama NÃO apaga o que já estava gravado.
 */
export function textosDaGeneration(fieldValues: unknown): Record<string, string> | null {
  if (!fieldValues || typeof fieldValues !== 'object') return null
  const fv = fieldValues as Record<string, unknown>
  const bruto = fv.slotValues
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return null

  const out: Record<string, string> = {}
  for (const [campo, valor] of Object.entries(bruto as Record<string, unknown>)) {
    if (campo.startsWith('_')) continue
    const texto =
      typeof valor === 'string'
        ? valor
        : valor && typeof valor === 'object' && typeof (valor as { content?: unknown }).content === 'string'
          ? ((valor as { content: string }).content)
          : null
    if (texto?.trim()) out[campo] = texto.trim()
  }
  return Object.keys(out).length > 0 ? out : null
}

/** Frase para a resposta, sem jargão de banco. */
export function descreverTroca(indice: number, total: number): string {
  if (total <= 1) return 'Arte trocada.'
  return `Arte trocada: a imagem ${indice + 1} de ${total}. As outras ${total - 1} ficaram como estavam.`
}
