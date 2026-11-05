/**
 * PROVA LOCAL da quebra equilibrada (03/11/2026), ZERO ESCRITA: compõe pela referência aprovada da Brunch
 * (`ref-cmvvab24y0003sw7cwiaizw9d`, a @5 com a manchete em 2 linhas) com a foto do toast, em memória, com manchetes de
 * tamanhos diferentes. Só LÊ: a referência, a assinatura e a caixa do assunto no banco, o catálogo no Drive, a foto por
 * URL lh3 (nunca `driveFileId`: `carregarFoto` por id pode escrever o cache do Blob). `provar: true` devolve o PNG antes
 * da pasta e da persistência (`persistido: null`, conferido abaixo).
 *
 * USO (no worktree): npx tsx --env-file=.env scripts/prova-quebra-equilibrada-local.ts [--saida pasta]
 */
import { mkdirSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { resolve } from 'path'
import sharp from 'sharp'
import { comporPeca } from '../src/lib/compositor/compor'
import { CreativeError } from '../src/lib/creatives/errors'
import type { Layer } from '../src/types/template'

const PROJETO = 12
const REFERENCIA = 'ref-cmvvab24y0003sw7cwiaizw9d' // Ref 02 · Brunch Empório, @5 (03/11/2026)
const TOAST = '1a0KmsM8ubVtrTZvL-rPtjHoI17lI9miz' // caixa marcada à mão em 03/11
const SAIDA = resolve(argumento('saida') ?? resolve(homedir(), 'Documents/Studio-Lagosta-v2/human-output/relatorios/editor-madrugada-2026-10-24/direcao-por-referencia-2026-10-30/quebra-equilibrada'))
const MANCHETES = ['Toast da casa', 'Toast da casa com ovos mexidos', 'Toast da casa com ovos mexidos e café coado']
const APOIO = 'Sabores que elevam sua tarde'
const lh3 = (id: string) => `https://lh3.googleusercontent.com/d/${id}=w2000`

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main() {
  mkdirSync(SAIDA, { recursive: true })
  const linhas: string[] = ['# Prova local da quebra equilibrada (zero escrita)', '', `Referência \`${REFERENCIA}\` (@5), foto \`${TOAST}\`.`, '', '| Manchete | Estado | Linhas desenhadas | Corpo | Avisos |', '|---|---|---|---|---|']
  const pngs: Buffer[] = []
  for (const [i, manchete] of MANCHETES.entries()) {
    const c = await comporPeca(
      { projectId: PROJETO, formato: 'story', foto: { url: lh3(TOAST) }, arquetipo: { id: REFERENCIA }, blocos: [{ papel: 'headline', linhas: [manchete] }, { papel: 'apoio', linhas: [APOIO] }], nome: `Prova quebra ${i + 1}`, tema: 'brunch' },
      { canal: 'claude-code', provar: true },
    ).catch((e) => {
      if (!(e instanceof CreativeError)) throw e
      return e
    })
    if (c instanceof CreativeError) {
      const detalhe = JSON.stringify(c.details ?? null)
      linhas.push(`| ${manchete} | RECUSADA: ${c.code} | — | — | ${c.message.replace(/\|/g, '/')} |`, '', '```json', detalhe, '```', '')
      console.log(`[${i + 1}] "${manchete}" RECUSADA ${c.code}: ${c.message}\n${detalhe}`)
      continue
    }
    if (c.persistido !== null || !c.prova) throw new Error('a prova teria gravado: parando')
    writeFileSync(resolve(SAIDA, `prova-quebra-${i + 1}.png`), c.prova)
    pngs.push(c.prova)
    const textos = (c.layers as Layer[]).filter((l) => l.type === 'text' || l.type === 'rich-text')
    const desenho = textos.map((l) => `${l.id}: ${JSON.stringify(String(l.content ?? '').split('\n'))} @ ${l.style?.fontSize} px${(l.metadata as { compositor?: { distribuida?: number } })?.compositor?.distribuida ? ' (distribuída)' : ''}`)
    const avisos = ((c.diagnostico as unknown as { avisos?: string[] }).avisos ?? []).filter((a) => /distribu|corpo|abaixo|reduzid/.test(a))
    const h = textos.find((l) => l.id === 'headline')
    linhas.push(`| ${manchete} | composta | ${JSON.stringify(String(h?.content ?? '').split('\n'))} | ${h?.style?.fontSize} px | ${avisos.join('; ').replace(/\|/g, '/') || '—'} |`)
    console.log(`[${i + 1}] "${manchete}"\n  ${desenho.join('\n  ')}\n  avisos: ${avisos.join(' | ') || '—'}`)
  }
  if (pngs.length > 0) {
    const faixas = await Promise.all(pngs.map((p) => sharp(p).resize({ width: 540, height: 960, fit: 'fill' }).png().toBuffer()))
    await sharp({ create: { width: 540 * faixas.length, height: 960, channels: 3, background: '#111' } })
      .composite(faixas.map((input, k) => ({ input, left: 540 * k, top: 0 })))
      .png()
      .toFile(resolve(SAIDA, 'prova-quebra-lado-a-lado.png'))
  }
  writeFileSync(resolve(SAIDA, 'prova-quebra.md'), `${linhas.join('\n')}\n`)
  console.log(`saída: ${SAIDA}`)
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e)
  process.exit(1)
})
