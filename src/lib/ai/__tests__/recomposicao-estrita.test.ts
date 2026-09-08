import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  medirExteriorDaCirurgia,
  recomporCirurgiaEstrita,
  retanguloDaCirurgia,
} from '../recomposicao-estrita';
import { passadaCirurgica } from '../passada-cirurgica';
import { runImageEdit } from '../openai-image-client';

vi.mock('../openai-image-client', () => ({ runImageEdit: vi.fn() }));
afterEach(() => vi.resetAllMocks());

const zona = { nome: 'bloco', x0: 0.3, x1: 0.6, y0: 0.3, y1: 0.6 };
const png = (
  data: Buffer,
  width: number,
  height: number,
  channels: 1 | 3 | 4 = 3
) => sharp(data, { raw: { width, height, channels } }).png().toBuffer();

describe('preservação integral fora da zona', () => {
  it('corrige o contraexemplo que mantinha 1.200 pixels externos alterados', async () => {
    const w = 256,
      h = 256;
    const raw = Buffer.alloc(w * h * 3);
    for (let p = 0; p < w * h; p++) raw.fill(p % 256, p * 3, p * 3 + 3);
    const alterada = Buffer.from(raw);
    for (let y = 90; y < 150; y++)
      for (let x = 155; x < 175; x++)
        alterada.fill(255, (y * w + x) * 3, (y * w + x) * 3 + 3);
    const original = await png(raw, w, h);
    const editada = await png(alterada, w, h);
    expect(
      (await medirExteriorDaCirurgia(original, editada, zona)).pixelsAlterados
    ).toBe(1200);
    const resultado = await recomporCirurgiaEstrita(original, editada, zona);
    expect(
      await medirExteriorDaCirurgia(original, resultado, zona)
    ).toMatchObject({ pixelsAlterados: 0, maiorDiferenca: 0, media: 0 });
  });

  it.each([1, 3, 4] as const)(
    'preserva exterior e realmente edita o núcleo com %i canais',
    async (channels) => {
      const original = await png(
        Buffer.alloc(100 * 100 * channels, 80),
        100,
        100,
        channels
      );
      const editada = await png(
        Buffer.alloc(100 * 100 * channels, 220),
        100,
        100,
        channels
      );
      const resultado = await recomporCirurgiaEstrita(original, editada, zona);
      expect(
        (await medirExteriorDaCirurgia(original, resultado, zona))
          .pixelsAlterados
      ).toBe(0);
      const out = await sharp(resultado).ensureAlpha().raw().toBuffer();
      expect(out[(45 * 100 + 45) * 4]).toBe(220);
    }
  );

  it('não deixa o feather engolir zona de dois pixels', async () => {
    const original = await png(Buffer.alloc(100 * 100 * 3), 100, 100);
    const editada = await png(Buffer.alloc(100 * 100 * 3, 255), 100, 100);
    const pequena = { nome: 'pequena', x0: 0.5, x1: 0.52, y0: 0.5, y1: 0.52 };
    const resultado = await recomporCirurgiaEstrita(
      original,
      editada,
      pequena,
      50
    );
    expect(
      (await medirExteriorDaCirurgia(original, resultado, pequena))
        .pixelsAlterados
    ).toBe(0);
    const out = await sharp(resultado).raw().toBuffer();
    expect(out[(50 * 100 + 50) * 4]).toBe(255);
  });

  it('edita até a borda inferior sem transbordar para cima', async () => {
    const original = await png(Buffer.alloc(100 * 100 * 3), 100, 100);
    const editada = await png(Buffer.alloc(100 * 100 * 3, 255), 100, 100);
    const rodape = { nome: 'rodapé', x0: 0, x1: 1, y0: 0.8, y1: 1 };
    const resultado = await recomporCirurgiaEstrita(original, editada, rodape);
    expect(
      (await medirExteriorDaCirurgia(original, resultado, rodape))
        .pixelsAlterados
    ).toBe(0);
    const out = await sharp(resultado).raw().toBuffer();
    expect(out[(99 * 100 + 50) * 4]).toBe(255);
  });

  it('não declara pixels externos protegidos quando a zona cobre tudo', async () => {
    const base = await png(Buffer.alloc(100 * 100 * 3), 100, 100);
    expect(
      (
        await medirExteriorDaCirurgia(base, base, {
          nome: 'tudo',
          x0: 0,
          x1: 1,
          y0: 0,
          y1: 1,
        })
      ).pixelsFora
    ).toBe(0);
  });

  it.each([
    { ...zona, x0: -0.1 },
    { ...zona, x1: NaN },
    { ...zona, y1: 2 },
    { ...zona, x0: 0.6, x1: 0.3 },
    { ...zona, x1: 0.300001 },
  ])('recusa zona inválida ou sem pixels: %j', (invalida) => {
    expect(() => retanguloDaCirurgia(invalida, 100, 100)).toThrow();
  });
});

describe('cirurgia com provedor simulado', () => {
  it('preserva dimensões originais e mapeia a máscara ao padding sem esticar a foto', async () => {
    const peca = await png(Buffer.alloc(128 * 128 * 3, 80), 128, 128);
    vi.mocked(runImageEdit).mockResolvedValue(
      await png(Buffer.alloc(128 * 256 * 3, 220), 128, 256)
    );
    const selecionada = {
      nome: 'centro',
      x0: 0.25,
      x1: 0.75,
      y0: 0.25,
      y1: 0.75,
    };
    const r = await passadaCirurgica({
      peca,
      zona: selecionada,
      instrucao: 'Aumente o texto',
      textosDaZona: [],
      tamanho: { width: 128, height: 256 },
    });
    expect(r.tamanhoFinal).toEqual({ width: 128, height: 128 });
    expect(r.zonaEfetiva).toEqual({ left: 32, top: 32, width: 64, height: 64 });
    expect(r.pixelsAlteradosFora).toBe(0);
    expect(
      (await medirExteriorDaCirurgia(peca, r.buffer, selecionada))
        .pixelsAlterados
    ).toBe(0);
    const args = vi.mocked(runImageEdit).mock.calls[0][0];
    const mask = await sharp(args.mask!.buffer).raw().toBuffer();
    expect(mask[(10 * 128 + 64) * 4 + 3]).toBe(255);
    expect(mask[(128 * 128 + 64) * 4 + 3]).toBe(0);
    const base = await sharp(args.images[0].buffer)
      .ensureAlpha()
      .raw()
      .toBuffer();
    expect(base[(10 * 128 + 64) * 4 + 3]).toBe(0);
    expect(base[(128 * 128 + 64) * 4 + 3]).toBe(255);
  });

  it('orienta EXIF antes de definir zona e resolução final', async () => {
    const peca = await sharp({
      create: { width: 80, height: 40, channels: 3, background: '#765432' },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    vi.mocked(runImageEdit).mockResolvedValue(
      await png(Buffer.alloc(128 * 256 * 3, 150), 128, 256)
    );
    const r = await passadaCirurgica({
      peca,
      zona,
      instrucao: 'Aumente o texto',
      textosDaZona: [],
      tamanho: { width: 128, height: 256 },
    });
    expect(r.tamanhoFinal).toEqual({ width: 40, height: 80 });
    expect(
      (await medirExteriorDaCirurgia(peca, r.buffer, zona)).pixelsAlterados
    ).toBe(0);
  });

  it('não chama a API com zona inválida', async () => {
    const peca = await png(Buffer.alloc(100 * 100 * 3), 100, 100);
    await expect(
      passadaCirurgica({
        peca,
        zona: { ...zona, x0: -1 },
        instrucao: 'Editar',
        textosDaZona: [],
        tamanho: { width: 128, height: 128 },
      })
    ).rejects.toThrow('Zona inválida');
    expect(runImageEdit).not.toHaveBeenCalled();
  });

  it('recusa dimensão inesperada do provedor em vez de deformar o resultado', async () => {
    const peca = await png(Buffer.alloc(100 * 100 * 3), 100, 100);
    vi.mocked(runImageEdit).mockResolvedValue(peca);
    await expect(
      passadaCirurgica({
        peca,
        zona,
        instrucao: 'Editar',
        textosDaZona: [],
        tamanho: { width: 128, height: 128 },
      })
    ).rejects.toThrow('dimensões diferentes');
  });
});
