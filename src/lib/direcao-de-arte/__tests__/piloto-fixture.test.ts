/**
 * CP0 — a fixture da peça piloto é FIEL e LOCAL.
 *
 * Fiel: a régua de produção, sobre as camadas gravadas da v1 e da v2 e a foto
 * anonimizada, reproduz os números da peça (gravados na Generation da v1 e
 * medidos com a foto ORIGINAL na v2) dentro de TOLERANCIA_DA_FIXTURE.
 * Local: nenhuma URL, nenhuma foto inteira, nenhum banco (a suíte é
 * hermética — `vitest.setup.ts` bloqueia fetch, sockets e o Prisma).
 */
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { beforeAll, describe, expect, it } from 'vitest'

import { medirContrasteDaPeca, type ContrasteMedido } from '@/lib/compositor/regua'
import { arquivosDaFixture, caixasForaDasJanelas, comArquivos, fixture, logoReconstruida } from './suporte/fixture'
import { leiturasDosTextos, LIMIAR_DE_CONTRASTE_DA_LOGO } from './suporte/propriedades'

/**
 * Diferença máxima, em níveis de 0–255, entre a medida na fixture e a de
 * produção. Medido em 13/10/2026: a pior diferença foi 3 (headline v1, 182 →
 * 185) — a grade e as janelas em meia resolução amaciam um pouco o p98.
 */
const TOLERANCIA_DA_FIXTURE = 4

/**
 * A v2 não tem medida gravada (ajustar-arte não mede). Estes números saíram
 * da régua de 2fc0a319 sobre as camadas da v2 e a foto ORIGINAL, em 13/10/2026
 * — e batem com o p98 = 235 do serviço que o owner relatou da revisão.
 */
const V2_COM_A_FOTO_ORIGINAL = { servico: { sem: 235, com: 235 }, headline: { sem: 30, com: 113 }, apoio: { sem: 134, com: 156 } }

const CANVAS = { width: 1080, height: 1920 }
let arquivos: Record<string, string>
beforeAll(async () => {
  arquivos = await arquivosDaFixture()
})

const porTexto = (medidas: ContrasteMedido[]) =>
  Object.fromEntries(medidas.flatMap((m) => (m.textos ?? []).map((t) => [t.camada, { sem: t.p98SemHalo, com: t.p98ComHalo, ok: t.ok }])))

describe('a fixture é local e anonimizada', () => {
  it('nenhum arquivo da fixture tem URL ou referência a Blob/Drive', () => {
    for (const { nome, texto } of fixture.arquivos()) {
      expect(texto, nome).not.toMatch(/https?:\/\//)
      expect(texto, nome).not.toMatch(/vercel-storage|drive\.google|googleusercontent|blob\./)
    }
  })

  it('toda imagem das camadas é um token local fixture:*', () => {
    const camadas = [...fixture.peca().v1.layers, ...fixture.peca().v2.layers, ...fixture.assinatura().pagina.layers]
    const urls = camadas.map((l) => l.fileUrl).filter((u): u is string => typeof u === 'string')
    expect(urls.length).toBeGreaterThan(0)
    expect(urls.every((u) => u.startsWith('fixture:'))).toBe(true)
  })

  it('a foto não entra: só uma grade de ~25 px e janelas de medida pequenas, em meia resolução', () => {
    const f = fixture.foto()
    expect(f.grade.largura).toBeLessThanOrEqual(43)
    expect(f.grade.altura).toBeLessThanOrEqual(76)
    for (const j of f.janelas) {
      expect(j.w * j.h, j.id).toBeLessThanOrEqual(700 * 350)
      expect(j.escala, j.id).toBe(0.5)
    }
    const areaDasJanelas = f.janelas.reduce((s, j) => s + j.w * j.h, 0)
    // 29/10/2026: a janela `servico-v1` cresceu 80 px para cima (P9 com a margem da base em 160), com o ok do Ciro —
    // a área das janelas foi de 18,2 % para 20,0 % da foto. O teto sobe de 19 % para 21 %; a faixa nova é balcão e um frasco.
    expect(areaDasJanelas / (f.origem.largura * f.origem.altura)).toBeLessThan(0.21)
  })

  it('o projeto da spec é o fictício 9001 (a fixture não depende do projectId real)', () => {
    expect(fixture.peca().spec.projectId).toBe(9001)
  })

  it('toda caixa de texto e de logo da v1 e da v2 cai dentro de uma janela fiel', () => {
    expect(caixasForaDasJanelas(fixture.peca().v1.layers)).toEqual([])
    expect(caixasForaDasJanelas(fixture.peca().v2.layers)).toEqual([])
  })

  it('as logos são reconstruídas pixel a pixel (a luminância da tinta bate com a gravada)', async () => {
    for (const logo of Object.values(fixture.marca().logos)) {
      const { data, info } = await sharp(await logoReconstruida(logo)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      let soma = 0
      let n = 0
      for (let p = 0; p < data.length; p += info.channels) {
        if (data[p + 3] < 128) continue
        soma += 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2]
        n++
      }
      expect(Math.abs(soma / n - logo.luminanciaDaTinta), logo.papel).toBeLessThan(0.5)
    }
  })
})

describe('a régua de produção reproduz a peça sobre a fixture', () => {
  it('o registro de produção tem UMA cor de véu para a peça inteira, #F3EADC no topo (0.9) e no rodapé (0.45) — o defeito de polaridade que o CP2A corrige', () => {
    expect(fixture.peca().composicaoRegistrada.gradientes.map(({ borda, cor, forca }) => ({ borda, cor, forca }))).toEqual([
      { borda: 'topo', cor: '#F3EADC', forca: 0.9 },
      { borda: 'rodape', cor: '#F3EADC', forca: 0.45 },
    ])
  })

  it('v1 (compositor): serviço ≈166→194, apoio ≈33→121, headline ≈71→182 — os números gravados na Generation', async () => {
    const r = await medirContrasteDaPeca({ layers: comArquivos(fixture.peca().v1.layers, arquivos), canvas: CANVAS, background: '#FFFFFF', faixa: [0.45, 0.9], corrigir: false })
    const medido = porTexto(r.medidas)
    const gravado = porTexto(fixture.peca().composicaoRegistrada.contraste)
    for (const camada of ['servico', 'apoio', 'headline']) {
      expect(Math.abs(medido[camada].sem - gravado[camada].sem), `${camada} sem`).toBeLessThanOrEqual(TOLERANCIA_DA_FIXTURE)
      expect(Math.abs(medido[camada].com - gravado[camada].com), `${camada} com`).toBeLessThanOrEqual(TOLERANCIA_DA_FIXTURE)
      expect(medido[camada].ok, `${camada} ok`).toBe(gravado[camada].ok)
    }
    expect(gravado.servico).toMatchObject({ sem: 166, com: 194, ok: false })
  }, 60_000)

  it('v2 (após ajustar-arte): serviço ≈235 com e sem véu (vitrine), headline ≈30→113', async () => {
    const r = await medirContrasteDaPeca({ layers: comArquivos(fixture.peca().v2.layers, arquivos), canvas: CANVAS, background: '#FFFFFF', faixa: [0.45, 0.9], corrigir: false })
    const medido = porTexto(r.medidas)
    for (const [camada, ref] of Object.entries(V2_COM_A_FOTO_ORIGINAL)) {
      expect(Math.abs(medido[camada].sem - ref.sem), `${camada} sem`).toBeLessThanOrEqual(TOLERANCIA_DA_FIXTURE)
      expect(Math.abs(medido[camada].com - ref.com), `${camada} com`).toBeLessThanOrEqual(TOLERANCIA_DA_FIXTURE)
    }
  }, 60_000)

  it('o oráculo das propriedades mede o mesmo que a régua (texto claro: p98; escuro: p02)', async () => {
    const layers = comArquivos(fixture.peca().v1.layers, arquivos)
    const [r, leituras] = await Promise.all([
      medirContrasteDaPeca({ layers, canvas: CANVAS, background: '#FFFFFF', faixa: [0.45, 0.9], corrigir: false }),
      leiturasDosTextos(layers, CANVAS),
    ])
    const regua = porTexto(r.medidas)
    for (const l of leituras) expect({ camada: l.camada, sem: l.sem, com: l.com }).toEqual({ camada: l.camada, sem: regua[l.camada].sem, com: regua[l.camada].com })
  }, 60_000)
})

describe('limiares reaproveitados continuam com o dono', () => {
  it('o limiar de contraste da logo é o CONTRASTE_MINIMO do logo-compositor', () => {
    // Desde o CP3 o número mora em `legibilidade-da-logo.ts` (fonte única); o logo-compositor o importa de lá, e a
    // guarda lê a fonte para garantir que ele não voltou a ser um literal.
    const fonte = fs.readFileSync(path.join(process.cwd(), 'src/lib/ai/logo-compositor.ts'), 'utf8')
    expect(fonte).toMatch(/const CONTRASTE_MINIMO = LIMIAR_DE_CONTRASTE_DA_LOGO\b/)
    // O alfa que decide pixel visível também veio de lá: nenhum `data[p + 3] < 128` literal sobrou.
    expect(fonte).not.toMatch(/data\[p(?: \+ 3)?\] [<>]=? 128\b/)
    expect(LIMIAR_DE_CONTRASTE_DA_LOGO).toBe(45)
  })
})
