import sharp from 'sharp';
import type { ZonaDoBriefing } from './mascara-da-geracao';

export interface RetanguloDaCirurgia {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function retanguloDaCirurgia(
  zona: ZonaDoBriefing,
  width: number,
  height: number
): RetanguloDaCirurgia {
  if (![width, height].every((n) => Number.isSafeInteger(n) && n > 0))
    throw new Error('Dimensões inválidas');
  if (
    ![zona.x0, zona.x1, zona.y0, zona.y1].every(
      (n) => Number.isFinite(n) && n >= 0 && n <= 1
    ) ||
    zona.x1 <= zona.x0 ||
    zona.y1 <= zona.y0
  ) {
    throw new Error('Zona inválida: selecione uma área dentro da imagem');
  }
  const left = Math.round(zona.x0 * width);
  const top = Math.round(zona.y0 * height);
  const w = Math.round(zona.x1 * width) - left;
  const h = Math.round(zona.y1 * height) - top;
  if (!w || !h) throw new Error('Zona sem pixels editáveis');
  return { left, top, width: w, height: h };
}

async function rgba(buffer: Buffer) {
  return sharp(buffer)
    .rotate()
    .toColourspace('srgb')
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
}

/** Medição integral RGBA, sem redução, blur ou tolerância de compressão. */
export async function medirExteriorDaCirurgia(
  original: Buffer,
  resultado: Buffer,
  zona: ZonaDoBriefing
) {
  const [a, b] = await Promise.all([rgba(original), rgba(resultado)]);
  if (a.info.width !== b.info.width || a.info.height !== b.info.height)
    throw new Error('Dimensões divergentes na conferência da cirurgia');
  const rect = retanguloDaCirurgia(zona, a.info.width, a.info.height);
  let pixelsAlterados = 0;
  let pixelsFora = 0;
  let maiorDiferenca = 0;
  let soma = 0;
  for (let y = 0; y < a.info.height; y++) {
    for (let x = 0; x < a.info.width; x++) {
      if (
        x >= rect.left &&
        x < rect.left + rect.width &&
        y >= rect.top &&
        y < rect.top + rect.height
      )
        continue;
      pixelsFora++;
      const i = (y * a.info.width + x) * 4;
      let mudou = false;
      for (let c = 0; c < 4; c++) {
        const d = Math.abs(a.data[i + c] - b.data[i + c]);
        if (d) mudou = true;
        soma += d;
        maiorDiferenca = Math.max(maiorDiferenca, d);
      }
      if (mudou) pixelsAlterados++;
    }
  }
  return {
    pixelsAlterados,
    pixelsFora,
    maiorDiferenca,
    media: pixelsFora ? soma / (pixelsFora * 4) : 0,
  };
}

/**
 * Copia a origem e só escreve DENTRO do retângulo. Não existe banda de
 * transbordo. O feather é interno e diminui em zonas pequenas para preservar
 * um núcleo de edição. A garantia vale para pixels sRGB orientados, no PNG.
 */
export async function recomporCirurgiaEstrita(
  original: Buffer,
  editada: Buffer,
  zona: ZonaDoBriefing,
  featherPx?: number
): Promise<Buffer> {
  const [base, nova] = await Promise.all([rgba(original), rgba(editada)]);
  const { width, height } = base.info;
  if (width !== nova.info.width || height !== nova.info.height)
    throw new Error('Dimensões divergentes na recomposição da cirurgia');
  const rect = retanguloDaCirurgia(zona, width, height);
  if (featherPx !== undefined && (!Number.isFinite(featherPx) || featherPx < 0))
    throw new Error('Feather inválido');
  const feather = Math.min(
    featherPx ?? height * 0.025,
    rect.width / 4,
    rect.height / 4
  );
  const out = Buffer.from(base.data);
  for (let y = rect.top; y < rect.top + rect.height; y++) {
    for (let x = rect.left; x < rect.left + rect.width; x++) {
      // Nas bordas do quadro não há costura com a origem: edição pode ir até o fim.
      const distancia = Math.min(
        rect.left === 0 ? Infinity : x + 0.5 - rect.left,
        rect.top === 0 ? Infinity : y + 0.5 - rect.top,
        rect.left + rect.width === width
          ? Infinity
          : rect.left + rect.width - x - 0.5,
        rect.top + rect.height === height
          ? Infinity
          : rect.top + rect.height - y - 0.5
      );
      const t = feather === 0 ? 1 : Math.min(1, distancia / feather);
      const alpha = t * t * (3 - 2 * t);
      const i = (y * width + x) * 4;
      for (let c = 0; c < 4; c++)
        out[i + c] = Math.round(
          base.data[i + c] * (1 - alpha) + nova.data[i + c] * alpha
        );
    }
  }
  return sharp(out, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
}
