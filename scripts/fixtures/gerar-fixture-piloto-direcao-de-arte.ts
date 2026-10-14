/**
 * Gera a fixture ANONIMIZADA da peça piloto da auditoria de direção de arte
 * (13/10/2026) — `src/lib/direcao-de-arte/__tests__/fixtures/piloto-2026-10-13/`.
 *
 * Roda UMA vez, fora da suíte, sobre exports LOCAIS feitos em leitura
 * (transação `default_transaction_read_only=on` e download dos arquivos da
 * peça). Não fala com banco, Blob nem Drive: só lê a pasta de entrada.
 *
 *   npx tsx scripts/fixtures/gerar-fixture-piloto-direcao-de-arte.ts <pasta-dos-exports> <pasta-da-fixture>
 *
 * A pasta de entrada precisa ter: foto.jpg, generations.json, page.json,
 * assinatura-page.json, projeto-assinatura.json (Project.assinatura), logo-ativo2.png,
 * logo-ativo3.png.
 *
 * Anonimização da foto (tem clientes reconhecíveis): ela NÃO entra. Entra
 *  - uma GRADE de luminância de 43×76 (células de ~25 px — ninguém é
 *    reconhecível), que alimenta as heurísticas de foto inteira do compositor
 *    (luz média, mapa de calma, assunto estimado);
 *  - JANELAS de medida na resolução da régua (metade da peça), só sobre as
 *    caixas que as propriedades medem (texto do topo, logo, serviço v1 e v2).
 *    Conferidas a olho em 13/10/2026: teto, mezanino, decoração, balcão,
 *    vitrine e uma mão — nenhum rosto.
 * A grade sozinha amacia os brilhos e tirava o p98 do serviço de 166 para
 * 150 (o que faria a peça "passar sem véu" e mudaria o sentido do caso); com
 * as janelas a régua reproduz a produção em ±3 níveis (ver LEIAME.md).
 *
 * A foto entra JÁ NO ENQUADRAMENTO DA PEÇA (corte right-middle, 1080×1920):
 * a escolha do corte depende da textura fina, que a anonimização remove — com
 * a foto inteira em grade, o compositor escolhia left-middle e as medidas
 * caíam em outra região da foto.
 */
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const [entrada, saida] = process.argv.slice(2)
if (!entrada || !saida) {
  console.error('uso: npx tsx scripts/fixtures/gerar-fixture-piloto-direcao-de-arte.ts <pasta-dos-exports> <pasta-da-fixture>')
  process.exit(1)
}

const GRADE = { largura: 43 }
/** O corte right-middle da peça: a foto de 1283×1920 perde 203 px à esquerda. */
const CORTE_DA_PECA = { left: 203, top: 0, width: 1080, height: 1920 }
/** Janelas em coordenadas da PEÇA (= da foto já cortada). */
const JANELAS = [
  { id: 'topo-texto', x: 54, y: 132, w: 682, h: 345, motivo: 'headline e apoio da v1 e da v2' },
  { id: 'logo', x: 797, y: 132, w: 229, h: 128, motivo: 'logo no canto superior direito' },
  { id: 'servico-v1', x: 314, y: 1712, w: 454, h: 125, motivo: 'serviço na v1 (balcão)' },
  { id: 'servico-v2', x: 314, y: 1482, w: 454, h: 125, motivo: 'serviço na v2 (vitrine)' },
]
/**
 * REGIÃO PROTEGIDA anotada à mão na auditoria (decisão do owner, 13/10/2026):
 * a vitrine de gelato, em coordenadas da peça (corte right-middle) —
 * x 20..870, y 1220..1700. É região narrativamente relevante (o produto que o
 * serviço não pode cobrir), NÃO "o assunto principal" da foto.
 */
const REGIAO_PROTEGIDA_NA_PECA = { x: 20, y: 1220, width: 850, height: 480 }

const ler = (nome: string) => JSON.parse(fs.readFileSync(path.join(entrada, nome), 'utf8'))
const b64 = (b: Buffer) => b.toString('base64')

/** Troca toda URL de arquivo por um token local — a fixture não pode depender de Blob/Drive. */
function semUrls(layers: Array<Record<string, unknown>>, tokens: Record<string, string>): Array<Record<string, unknown>> {
  return layers.map((l) => {
    if (typeof l.fileUrl !== 'string') return l
    const url = l.fileUrl as string
    const token = Object.entries(tokens).find(([trecho]) => url.includes(trecho))?.[1]
    if (!token) throw new Error(`URL sem token na fixture: camada ${String(l.id)}`)
    return { ...l, fileUrl: token }
  })
}

async function cinzaRaw(buf: Buffer, largura: number, altura: number) {
  const { data, info } = await sharp(buf).grayscale().toColourspace('b-w').resize(largura, altura, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true })
  return { largura: info.width, altura: info.height, valores: b64(data) }
}

/**
 * A logo entra PIXEL A PIXEL (RGBA) no tamanho em que a peça a desenha — logo
 * é ativo público da marca, não dado pessoal, e a média da tinta escondia as
 * partes creme do monograma (achado da revisão do CP0). A tinta média e a
 * luminância ficam como resumo.
 */
async function estatisticasDaLogo(arquivo: string, caixa: { largura: number; altura: number }) {
  const buf = fs.readFileSync(path.join(entrada, arquivo))
  const meta = await sharp(buf).metadata()
  const { data, info } = await sharp(buf).ensureAlpha().resize(caixa.largura, caixa.altura, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).raw().toBuffer({ resolveWithObject: true })
  const alfa = Buffer.alloc(info.width * info.height)
  let r = 0, g = 0, b = 0, n = 0, luz = 0
  for (let p = 0, i = 0; p < data.length; p += info.channels, i++) {
    alfa[i] = data[p + 3]
    if (data[p + 3] < 128) continue
    r += data[p]; g += data[p + 1]; b += data[p + 2]; n++
    luz += 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2]
  }
  const hex = (v: number) => Math.round(v / n).toString(16).padStart(2, '0')
  return {
    original: { largura: meta.width, altura: meta.height },
    largura: info.width,
    altura: info.height,
    tintaMedia: `#${hex(r)}${hex(g)}${hex(b)}`.toUpperCase(),
    luminanciaDaTinta: Number((luz / n).toFixed(1)),
    alfa: b64(alfa),
    rgba: b64(data),
  }
}

async function main() {
  fs.mkdirSync(saida, { recursive: true })
  const original = fs.readFileSync(path.join(entrada, 'foto.jpg'))
  const metaOriginal = await sharp(original).metadata()
  const foto = await sharp(original).extract(CORTE_DA_PECA).toBuffer()
  const W = CORTE_DA_PECA.width, H = CORTE_DA_PECA.height
  const grade = await cinzaRaw(foto, GRADE.largura, Math.round(GRADE.largura * H / W))
  const janelas = []
  for (const j of JANELAS) {
    const recorte = await sharp(foto).extract({ left: j.x, top: j.y, width: j.w, height: j.h }).toBuffer()
    janelas.push({ ...j, escala: 0.5, ...(await cinzaRaw(recorte, Math.round(j.w / 2), Math.round(j.h / 2))) })
  }
  const a = REGIAO_PROTEGIDA_NA_PECA
  fs.writeFileSync(path.join(saida, 'foto.json'), JSON.stringify({
    descricao: 'Foto de ambiente da peça piloto, anonimizada: grade de luminância + janelas de medida (ver LEIAME.md).',
    origem: { largura: W, altura: H },
    corte: { daFotoOriginal: { largura: metaOriginal.width, altura: metaOriginal.height }, ...CORTE_DA_PECA, posicao: 'right-middle' },
    grade,
    janelas,
    regiaoProtegida: {
      descricao: 'vitrine de gelato: região protegida / narrativamente relevante (o produto que o serviço não pode cobrir), anotada à mão na auditoria — não é "o assunto principal" da foto',
      naPeca: a,
      fracoesDaFoto: {
        x0: Number((a.x / W).toFixed(4)),
        y0: Number((a.y / H).toFixed(4)),
        x1: Number(((a.x + a.width) / W).toFixed(4)),
        y1: Number(((a.y + a.height) / H).toFixed(4)),
      },
    },
  }))

  const tokens = {
    'drive-cache/1/': 'fixture:foto',
    'Ativo_2real': 'fixture:logo-wordmark',
    'Ativo_3real': 'fixture:logo-monograma',
    'Delivery-cmt05362': 'fixture:foto-da-assinatura',
  }
  const gens = ler('generations.json') as Array<{ id: string; fieldValues: Record<string, any> }>
  const v1 = gens.find((g) => g.id === 'cmv7bqyvd0002ii06n3iq5ef0')!.fieldValues
  const v2 = gens.find((g) => g.id === 'cmv7bur3d0008ii06nvxat755')!.fieldValues
  const page = ler('page.json')
  const assinatura = ler('assinatura-page.json')
  const camadasDaAssinatura = typeof assinatura.layers === 'string' ? JSON.parse(assinatura.layers) : assinatura.layers
  const c = v1.composicao
  fs.writeFileSync(path.join(saida, 'peca.json'), JSON.stringify({
    descricao: 'Story da peça piloto (13/10/2026): spec que o agente mandou, camadas da v1 (compositor), camadas da v2 (após ajustar-arte) e o registro do ajuste.',
    canvas: { width: 1080, height: 1920 },
    spec: { ...v1.spec, projectId: 9001, foto: { driveFileId: 'fixture-foto' } },
    v1: { layers: semUrls(v1.layersSnapshot, tokens) },
    v2: { layers: semUrls(page.layers, tokens), revisao: v2.revisao },
    composicaoRegistrada: {
      posicao: c.posicao, candidatos: c.candidatos, assunto: c.assunto, assuntoOrigem: c.assuntoOrigem,
      gradientes: c.gradientes, contraste: c.contraste, logo: c.logo, avisos: c.avisos,
      assinatura: c.assinatura, medidasFinais: c.medidasFinais, blocos: c.blocos,
    },
  }))
  fs.writeFileSync(path.join(saida, 'assinatura.json'), JSON.stringify({
    descricao: 'A página de assinatura de story usada na peça (variante fixada por id), com os halos por grupo.',
    pagina: { id: assinatura.id, name: assinatura.name, width: assinatura.width, height: assinatura.height, tags: [], background: '#FFFFFF', layers: semUrls(camadasDaAssinatura, tokens) },
    // Project.assinatura (números estruturados do projeto). A geometria de story
    // traz 250/350, que a derivação pela página sobrepõe (148/100) na composição.
    numerosDoProjeto: ler('projeto-assinatura.json'),
  }))
  fs.writeFileSync(path.join(saida, 'marca.json'), JSON.stringify({
    descricao: 'Dados de marca da peça como fixture — NUNCA regra de produção.',
    // O DNA declara "Verde Real sobre Crema e vice-versa como pares oficiais de leitura".
    paresDeLeitura: [['#283D36', '#F6F0E4']],
    candidatasDoVeuNaBibliotecaAtual: ['#283D36', '#F3EADC'],
    logos: {
      wordmark: { papel: 'logo da página de assinatura (usada na peça)', ...(await estatisticasDaLogo('logo-ativo2.png', { largura: 197, altura: 95 })) },
      monograma: { papel: 'isProjectLogo', ...(await estatisticasDaLogo('logo-ativo3.png', { largura: 128, altura: 128 })) },
    },
  }))
  console.log('fixture gravada em', saida)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
