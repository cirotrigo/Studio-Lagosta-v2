/**
 * A PASSADA CIRÚRGICA (08/09/2026): uma correção LOCAL numa peça já pronta —
 * "aumente o rodapé", "tire o filete" — sem regenerar o resto.
 *
 * É o lugar onde a máscara serve de verdade. Na GERAÇÃO ela perdeu (briga com
 * a composição do modelo: fundo chapado na zona, texto fora da zona apagado,
 * enquadramento perdido). Numa correção local a zona já é conhecida, o resto
 * da peça é a verdade, e a recomposição por código garante que só a zona
 * muda: `recomporCirurgiaEstrita` copia a PRÓPRIA peça e altera somente
 * pixels dentro da zona efetiva, com conferência integral RGBA.
 *
 * Lição da conversa do Ciro com o ChatGPT (08/09): "primeira geração
 * criativa, segunda cirúrgica — tudo o que não está listado permanece igual".
 * Disparada por gente, nunca por revisor automático (regra da casa desde
 * 10/08: verificador avisa, nunca regera).
 */

import sharp from 'sharp';
import { runImageEdit } from './openai-image-client';
import { construirMascara, type ZonaDoBriefing } from './mascara-da-geracao';
import {
  medirExteriorDaCirurgia,
  recomporCirurgiaEstrita,
  retanguloDaCirurgia,
  type RetanguloDaCirurgia,
} from './recomposicao-estrita';

export interface PassadaCirurgicaArgs {
  /** A peça pronta: o resultado preserva suas dimensões após orientar o EXIF. */
  peca: Buffer;
  /** A zona que pode mudar, em frações 0..1. Uma só, de propósito: cirurgia tem um alvo. */
  zona: ZonaDoBriefing;
  /** A correção, em português, concreta ("aumente o texto do rodapé para o dobro"). */
  instrucao: string;
  /** Os textos que existem na zona e têm de continuar existindo, verbatim. */
  textosDaZona: string[];
  /** Quadro enviado à API; a origem é encaixada sem corte nem deformação. */
  tamanho: { width: number; height: number };
  quality?: 'low' | 'medium' | 'high';
  timeoutMs?: number;
}

export function montarPromptCirurgico(
  instrucao: string,
  textosDaZona: string[],
  zona: ZonaDoBriefing
): string {
  const faixa = `entre ${Math.round(zona.x0 * 100)}% e ${Math.round(zona.x1 * 100)}% da largura e entre ${Math.round(zona.y0 * 100)}% e ${Math.round(zona.y1 * 100)}% da altura`;
  return [
    `Edite APENAS a área editável desta arte (a faixa ${faixa}). Tudo fora dela permanece exatamente igual: fotografia, marca, título, cores, fontes.`,
    `Correção: ${instrucao.trim()}`,
    textosDaZona.length > 0
      ? `Os textos desta área continuam sendo EXATAMENTE estes, letra por letra, cada um uma vez, e nada mais:\n${textosDaZona.map((t) => `"${t}"`).join('\n')}`
      : 'Esta área não tem texto e continua sem texto.',
    'Mantenha a mesma fonte, a mesma cor e o mesmo alinhamento que a área já tem. Não acrescente elemento, ícone, tarja ou fundo. Não escureça a fotografia.',
  ].join('\n\n');
}

/**
 * Executa a passada: máscara na zona → `images.edit` → recomposição da peça
 * original fora da zona. Devolve PNG mestre na resolução original orientada
 * e prova integral RGBA (diferente da antiga média em cinza reduzida).
 */
export async function passadaCirurgica(args: PassadaCirurgicaArgs): Promise<{
  buffer: Buffer;
  prompt: string;
  difForaAntes: number;
  difForaDepois: number;
  ms: number;
  zonaEfetiva: RetanguloDaCirurgia;
  tamanhoFinal: { width: number; height: number };
  pixelsAlteradosFora: number;
  pixelsFora: number;
}> {
  const t0 = Date.now();
  const { width, height } = args.tamanho;
  if (![width, height].every((n) => Number.isSafeInteger(n) && n > 0))
    throw new Error('Dimensões inválidas');
  if (!args.instrucao.trim()) throw new Error('Informe a correção desejada');
  const origem = await sharp(args.peca)
    .rotate()
    .toColourspace('srgb')
    .ensureAlpha()
    .png()
    .toBuffer({ resolveWithObject: true });
  const zonaEfetiva = retanguloDaCirurgia(
    args.zona,
    origem.info.width,
    origem.info.height
  );
  // Sem ampliação implícita de 1%. A área escolhida é a área efetiva, arredondada em pixels.
  const zonaOriginal = {
    nome: args.zona.nome,
    x0: zonaEfetiva.left / origem.info.width,
    x1: (zonaEfetiva.left + zonaEfetiva.width) / origem.info.width,
    y0: zonaEfetiva.top / origem.info.height,
    y1: (zonaEfetiva.top + zonaEfetiva.height) / origem.info.height,
  };
  const conteudo = await sharp(origem.data)
    .resize(width, height, { fit: 'inside' })
    .png()
    .toBuffer({ resolveWithObject: true });
  const left = Math.floor((width - conteudo.info.width) / 2);
  const top = Math.floor((height - conteudo.info.height) / 2);
  const base = await sharp(conteudo.data)
    .extend({
      left,
      top,
      right: width - conteudo.info.width - left,
      bottom: height - conteudo.info.height - top,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  const zonaDaApi = {
    nome: args.zona.nome,
    x0: (left + zonaOriginal.x0 * conteudo.info.width) / width,
    x1: (left + zonaOriginal.x1 * conteudo.info.width) / width,
    y0: (top + zonaOriginal.y0 * conteudo.info.height) / height,
    y1: (top + zonaOriginal.y1 * conteudo.info.height) / height,
  };
  retanguloDaCirurgia(zonaDaApi, width, height); // Recusar zona que desaparece ao reduzir, antes de faturar.
  const mascara = await construirMascara(
    [{ ...zonaDaApi, origem: 'briefing' }],
    width,
    height
  );
  const prompt = montarPromptCirurgico(
    args.instrucao,
    args.textosDaZona,
    zonaDaApi
  );
  const editada = await runImageEdit({
    images: [{ buffer: base, mimeType: 'image/png', name: 'peca.png' }],
    mask: { buffer: mascara, mimeType: 'image/png', name: 'mask.png' },
    prompt,
    size: `${width}x${height}`,
    quality: args.quality ?? 'low',
    timeoutMs: args.timeoutMs ?? 120_000,
  });
  const meta = await sharp(editada).metadata();
  if (meta.width !== width || meta.height !== height)
    throw new Error('A edição retornou dimensões diferentes das solicitadas');
  // Retira somente o padding criado acima e devolve a edição à resolução da origem.
  const editadaNaOrigem = await sharp(editada)
    .extract({
      left,
      top,
      width: conteudo.info.width,
      height: conteudo.info.height,
    })
    .resize(origem.info.width, origem.info.height, { fit: 'fill' })
    .png()
    .toBuffer();
  const antes = await medirExteriorDaCirurgia(
    origem.data,
    editadaNaOrigem,
    zonaOriginal
  );
  const buffer = await recomporCirurgiaEstrita(
    origem.data,
    editadaNaOrigem,
    zonaOriginal
  );
  const depois = await medirExteriorDaCirurgia(
    origem.data,
    buffer,
    zonaOriginal
  );
  if (depois.pixelsAlterados !== 0)
    throw new Error('Falha ao preservar a área externa da cirurgia');
  return {
    buffer,
    prompt,
    difForaAntes: antes.media,
    difForaDepois: depois.media,
    ms: Date.now() - t0,
    zonaEfetiva,
    tamanhoFinal: { width: origem.info.width, height: origem.info.height },
    pixelsAlteradosFora: depois.pixelsAlterados,
    pixelsFora: depois.pixelsFora,
  };
}
