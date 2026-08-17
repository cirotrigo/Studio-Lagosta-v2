/**
 * Duplicar uma arte da galeria para a BANCADA — o mesmo briefing, aberto para
 * uma referência nova.
 *
 * O par do "Gerar de novo" (refazer): aquele repete os MESMOS insumos com
 * outra rodada de dados; este leva copy, foto e pedido de volta ao compositor
 * para a pessoa trocar a variável que errou — quase sempre a referência de
 * estilo, que no modo modelo-livre é a alavanca principal (pedido do Ciro,
 * 17/08/2026: "um botão de duplicar para criar a mesma arte novamente
 * escolhendo um novo template").
 *
 * 🔴 A referência de ESTILO fica de fora de propósito: duplicar existe para
 * escolhê-la de novo. Carregar a antiga pré-selecionada faria o clique mais
 * fácil ser regenerar o que a pessoa acabou de rejeitar — e para isso o
 * "Gerar de novo" já existe, um botão ao lado.
 *
 * Módulo PURO (sem Prisma, sem store): a galeria monta o item e o entrega ao
 * `useBancadaStore.adicionar`, que é quem sabe criar o card.
 */

type Papel = 'subject' | 'anchor-ambient' | 'anchor-dish'

export interface ReferenciaDuplicada {
  papel: Papel
  driveFileId?: string
  url?: string
  label?: string
  thumbUrl: string
}

export interface ItemDuplicado {
  trilha: 'arte' | 'imagem'
  formato: 'story' | 'feed' | 'quadrado'
  copy: string[]
  pedido: string
  instrucaoImagem: string | null
  referencias: ReferenciaDuplicada[]
}

const PAPEIS_QUE_VIAJAM = new Set<Papel>(['subject', 'anchor-ambient', 'anchor-dish'])
const FORMATOS = new Set(['story', 'feed', 'quadrado'])

/**
 * A copy sai de `slotValues` na ORDEM dos blocos (bloco1, bloco2, …) — a mesma
 * ordem em que foi escrita e desenhada. `Object.keys` não garante essa ordem
 * quando o JSON passou pelo banco, então o sufixo numérico é a verdade.
 */
function copyDe(slotValues: unknown): string[] {
  if (!slotValues || typeof slotValues !== 'object' || Array.isArray(slotValues)) return []
  return Object.entries(slotValues as Record<string, unknown>)
    .filter((par): par is [string, string] => typeof par[1] === 'string' && par[1].trim().length > 0)
    .sort(([a], [b]) => {
      const na = Number(a.replace(/\D/g, '')) || 0
      const nb = Number(b.replace(/\D/g, '')) || 0
      return na - nb || a.localeCompare(b)
    })
    .map(([, texto]) => texto.trim())
}

/**
 * Monta o item da bancada a partir do `fieldValues` de uma Generation.
 *
 * `null` quando a arte não tem como ser duplicada: só `source: 'arte-ia'`
 * carrega o briefing completo (arte de template ou de upload não tem pedido
 * nem referências para reconstituir — o mesmo gate do refazer), e sem NENHUMA
 * foto o compositor abriria um card vazio, que é pior que não abrir.
 */
export function duplicarParaBancada(fieldValues: unknown): ItemDuplicado | null {
  if (!fieldValues || typeof fieldValues !== 'object') return null
  const fv = fieldValues as Record<string, unknown>
  if (fv.source !== 'arte-ia') return null

  const referencias: ReferenciaDuplicada[] = []
  for (const bruto of Array.isArray(fv.referencias) ? fv.referencias : []) {
    if (!bruto || typeof bruto !== 'object') continue
    const ref = bruto as Record<string, unknown>
    const papel = ref.role as Papel
    if (!PAPEIS_QUE_VIAJAM.has(papel)) continue
    const driveFileId = typeof ref.driveFileId === 'string' ? ref.driveFileId : undefined
    const url = typeof ref.url === 'string' ? ref.url : undefined
    // A miniatura do Drive vem da rota da casa (nunca o lh3 assinado, que
    // expira); referência por URL usa a própria imagem.
    const thumbUrl = driveFileId ? `/api/drive/thumbnail/${driveFileId}?size=400` : url
    if (!thumbUrl) continue
    referencias.push({
      papel,
      driveFileId,
      url,
      label: typeof ref.label === 'string' ? ref.label : undefined,
      thumbUrl,
    })
  }
  if (referencias.length === 0) return null

  const formato = FORMATOS.has(fv.formato as string)
    ? (fv.formato as ItemDuplicado['formato'])
    : 'story'

  return {
    trilha: fv.track === 'imagem' ? 'imagem' : 'arte',
    formato,
    copy: copyDe(fv.slotValues),
    pedido: typeof fv.pedido === 'string' ? fv.pedido : '',
    instrucaoImagem: typeof fv.instrucaoImagem === 'string' && fv.instrucaoImagem.trim() ? fv.instrucaoImagem : null,
    referencias,
  }
}
