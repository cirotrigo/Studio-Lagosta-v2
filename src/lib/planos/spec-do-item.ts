import { CreativeError } from '@/lib/creatives/errors'
import { copyParaBlocos } from '@/lib/compositor/copy-para-blocos'
import { blocosParaOCompositor, lerCopyAutoral } from '@/lib/copy-autoral'
import type { Formato, Papel, SpecDePeca } from '@/lib/compositor/spec'
import { lerFotoCandidatas } from './proposta-de-semana'

interface ItemParaComposicao {
  id: string
  planoId: string
  formato?: string | null
  copyProposta?: string[] | null
  /** F1: o contrato da copy autoral gravado no item (`ItemDePlano.copyAutoral`). */
  copyAutoral?: unknown
  fotoDriveId?: string | null
  fotoUrl?: string | null
  fotoCandidatas?: unknown
  tema?: string | null
  quando?: Date | string | null
}

/** Ponte pura entre o item revisado e a spec durável da fila. */
export function montarSpecDoItem(item: ItemParaComposicao, projectId: number, paginas: Array<{ formato: Formato | null; papeis: Papel[] }>, selecaoExperimental = false): SpecDePeca {
  const formato = (item.formato ?? 'story') as Formato
  const doFormato = paginas.filter((p) => p.formato === formato)
  const papeis = doFormato.length > 0
    ? [...new Set(doFormato.flatMap((p) => p.papeis))].filter((p): p is Exclude<Papel, 'headline2'> => p !== 'headline2')
    : undefined
  // F1: item com contrato → a spec leva o contrato e os blocos saem da ÚNICA
  // conversão sancionada (`blocosParaOCompositor`, sem transformar texto);
  // `validarSpec` recusa bloco livre com texto (a camada livre chega na F3).
  // Sem contrato, o caminho legado (posicional → papéis do formato).
  const contrato = item.copyAutoral == null ? null : lerCopyAutoral(item.copyAutoral).copy
  const blocos = contrato
    ? (blocosParaOCompositor(contrato).blocos as unknown as SpecDePeca['blocos'])
    : copyParaBlocos(item.copyProposta ?? [], { papeis, estrito: true })
  if (!blocos.length && !contrato) throw new CreativeError('ITEM_INCOMPLETO', 'Este item não tem texto — o compositor precisa de pelo menos a manchete.', 400)
  const foto = item.fotoDriveId?.trim() ? { driveFileId: item.fotoDriveId.trim() }
    : item.fotoUrl?.trim() ? { url: item.fotoUrl.trim() } : undefined
  const fotosCandidatas = [...new Set(lerFotoCandidatas(item.fotoCandidatas).map((f) => f.driveFileId))].slice(0, 3)
  // O card não distingue foto automática de decisão humana. Tratar a foto
  // preenchida como explícita: ela restringe a seleção, nunca é substituída.
  return {
    ...(selecaoExperimental ? { selecaoExperimental: true } : {}),
    projectId, formato, blocos, itemDePlanoId: item.id, planoId: item.planoId,
    ...(contrato ? { copyAutoral: contrato } : {}),
    ...(foto ? { foto } : {}), ...(fotosCandidatas.length ? { fotosCandidatas } : {}),
    ...(item.tema ? { tema: item.tema, nome: `${item.tema} — plano` } : {}),
    ...(item.quando ? { quando: typeof item.quando === 'string' ? item.quando : item.quando.toISOString() } : {}),
  }
}
