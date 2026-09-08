/**
 * A PASSADA CIRÚRGICA (08/09/2026): uma correção LOCAL numa peça já pronta —
 * "aumente o rodapé", "tire o filete" — sem regenerar o resto.
 *
 * É o lugar onde a máscara serve de verdade. Na GERAÇÃO ela perdeu (briga com
 * a composição do modelo: fundo chapado na zona, texto fora da zona apagado,
 * enquadramento perdido). Numa correção local a zona já é conhecida, o resto
 * da peça é a verdade, e a recomposição por código garante que só a zona
 * muda: `restaurarFotoForaDasZonas` usa a PRÓPRIA peça como referência de tom
 * e devolve tudo fora da zona pixel por pixel.
 *
 * Lição da conversa do Ciro com o ChatGPT (08/09): "primeira geração
 * criativa, segunda cirúrgica — tudo o que não está listado permanece igual".
 * Disparada por gente, nunca por revisor automático (regra da casa desde
 * 10/08: verificador avisa, nunca regera).
 */

import sharp from 'sharp'
import { runImageEdit } from './openai-image-client'
import { construirMascara, diferencaForaDaMascara, restaurarFotoForaDasZonas, zonasEditaveis, type ZonaDoBriefing } from './mascara-da-geracao'

export interface PassadaCirurgicaArgs {
  /** A peça pronta (qualquer tamanho; é levada ao tamanho de geração). */
  peca: Buffer
  /** A zona que pode mudar, em frações 0..1. Uma só, de propósito: cirurgia tem um alvo. */
  zona: ZonaDoBriefing
  /** A correção, em português, concreta ("aumente o texto do rodapé para o dobro"). */
  instrucao: string
  /** Os textos que existem na zona e têm de continuar existindo, verbatim. */
  textosDaZona: string[]
  tamanho: { width: number; height: number }
  quality?: 'low' | 'medium' | 'high'
  timeoutMs?: number
}

export function montarPromptCirurgico(instrucao: string, textosDaZona: string[], zona: ZonaDoBriefing): string {
  const faixa = `entre ${Math.round(zona.y0 * 100)}% e ${Math.round(zona.y1 * 100)}% da altura`
  return [
    `Edite APENAS a área editável desta arte (a faixa ${faixa}). Tudo fora dela permanece exatamente igual: fotografia, marca, título, cores, fontes.`,
    `Correção: ${instrucao.trim()}`,
    textosDaZona.length > 0
      ? `Os textos desta área continuam sendo EXATAMENTE estes, letra por letra, cada um uma vez, e nada mais:\n${textosDaZona.map((t) => `"${t}"`).join('\n')}`
      : 'Esta área não tem texto e continua sem texto.',
    'Mantenha a mesma fonte, a mesma cor e o mesmo alinhamento que a área já tem. Não acrescente elemento, ícone, tarja ou fundo. Não escureça a fotografia.',
  ].join('\n\n')
}

/**
 * Executa a passada: máscara na zona → `images.edit` → recomposição da peça
 * original fora da zona (tom casado pelos pixels de fora). Devolve a peça
 * corrigida no tamanho de geração e a prova mecânica.
 */
export async function passadaCirurgica(args: PassadaCirurgicaArgs): Promise<{
  buffer: Buffer
  prompt: string
  difForaAntes: number
  difForaDepois: number
  ms: number
}> {
  const t0 = Date.now()
  const { width, height } = args.tamanho
  const base = await sharp(args.peca).resize(width, height, { fit: 'fill' }).png().toBuffer()
  // Folga pequena: a zona de uma correção é declarada por quem olha a peça.
  const zonas = zonasEditaveis([args.zona], { margemX: 0.01, margemY: 0.01 })
  if (zonas.length === 0) throw new Error('zona inválida')
  const mascara = await construirMascara(zonas, width, height)
  const prompt = montarPromptCirurgico(args.instrucao, args.textosDaZona, args.zona)
  const editada = await runImageEdit({
    images: [{ buffer: base, mimeType: 'image/png', name: 'peca.png' }],
    mask: { buffer: mascara, mimeType: 'image/png', name: 'mask.png' },
    prompt,
    size: `${width}x${height}`,
    quality: args.quality ?? 'low',
    timeoutMs: args.timeoutMs ?? 120_000,
  })
  const antes = await diferencaForaDaMascara(base, editada, zonas)
  // 🔴 A zona precisa conter o conteúdo antigo COM FOLGA: a borda suave da
  // recomposição mistura a peça antiga, e se ela cair sobre a linha antiga o
  // texto vira fantasma sob o novo (medido em 08/09/2026 — zona terminando em
  // 97% com o endereço a 94%). Quem declara a zona dá a folga; o feather
  // fica o padrão, porque curto demais deixa a emenda da faixa visível.
  const r = await restaurarFotoForaDasZonas(base, editada, zonas)
  const depois = await diferencaForaDaMascara(base, r.buffer, zonas)
  return { buffer: r.buffer, prompt, difForaAntes: antes.mediaFora, difForaDepois: depois.mediaFora, ms: Date.now() - t0 }
}
