/**
 * Fontes e cores do cliente, para a legenda e o título do vídeo.
 *
 *   npx tsx --env-file=.env .claude/skills/editar-video/fontes.ts --projeto 2 --raiz "<pasta>"            # só lista
 *   npx tsx --env-file=.env .claude/skills/editar-video/fontes.ts --projeto 2 --raiz "<pasta>" --baixar   # baixa
 *   npx tsx .claude/skills/editar-video/fontes.ts                                                         # autoconferência
 *
 * Fontes: as da aba Assets do projeto (CustomFont), arquivo público no Blob. Cores: as da marca
 * (BrandColor — as mesmas que o consultar-dna devolve em "colors"). Papéis: a tipografia por papel
 * do projeto (título, subtítulo, corpo), que é a escolha da marca para cada voz.
 *
 * Destino: <RAIZ>/06_ELEMENTOS/Assets/fontes/<fontFamily>.<ext>, a mesma pasta em que o
 * organizar.ts põe fonte achada no material. A RAIZ tem de ser um projeto organizado (com
 * 06_ELEMENTOS/Assets): é o que impede baixar para um lugar errado por engano de digitação.
 *
 * O banco é lido em transação READ ONLY. --baixar nunca sobrescreve: arquivo idêntico ao do Blob é
 * "já estava"; DIFERENTE é conflito e fica como está (pode ser a fonte que o cliente mandou com o
 * mesmo nome). O arquivo só vai para a pasta depois de passar em tipoDeFonte — cabeçalho sfnt E o
 * diretório de tabelas inteiro dentro do arquivo: a página do desafio anti-bot do Blob e o download
 * cortado nunca viram ".ttf" —, pelo caminho .part + rename. Sem --baixar, `noDisco` diz o que há
 * no lugar (false | 'fonte' | 'nao-e-fonte'); se a fonte do disco é a MESMA do Studio, só o
 * --baixar confere.
 *
 * Uma fonte ruim (URL fora de .ttf/.otf/.ttc — a aba Marca aceita woff/woff2 —, URL relativa, nome
 * que some ao limpar) vira "falhou" e as outras seguem. stdout é só o JSON; código 1 se alguma
 * fonte precisa de gente: nome/URL inválidos, arquivo que não é fonte no lugar dela ou, com
 * --baixar, fonte que não ficou pronta.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { PASTAS } from './estrutura'

// Os módulos do Studio logam no stdout; o stdout deste script é só o JSON do resultado.
const saida = (x: unknown) => process.stdout.write(JSON.stringify(x, null, 2) + '\n')
console.log = console.error

export function lerArgs(argv: string[]) {
  const o: { projeto?: number; raiz?: string; baixar: boolean } = { baixar: false }
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i]
    if (t === '--baixar') { o.baixar = true; continue }
    if (t !== '--projeto' && t !== '--raiz') throw new Error(`argumento desconhecido: "${t}" (aceita --projeto <id>, --raiz <pasta>, --baixar)`)
    const v = argv[++i]
    if (v === undefined || v.startsWith('--')) throw new Error(`${t} precisa de um valor`)
    // repetido, o último venceria calado — e o --baixar gravaria as fontes de OUTRO cliente aqui
    if (o[t === '--raiz' ? 'raiz' : 'projeto'] !== undefined) throw new Error(`${t} repetido`)
    if (t === '--raiz') o.raiz = resolve(v)
    else {
      // só dígitos: Number() aceitaria "1e0", "0x2", "2.0" e " 2 "
      if (!/^\d+$/.test(v) || Number(v) <= 0) throw new Error(`--projeto precisa ser um id numérico (veio "${v}")`)
      o.projeto = Number(v)
    }
  }
  if (!o.projeto || !o.raiz) throw new Error('faltou --projeto <id> e/ou --raiz <pasta do projeto>')
  return o as { projeto: number; raiz: string; baixar: boolean }
}

export function extensaoDaUrl(url: string) {
  let caminho: string
  try { caminho = new URL(url).pathname } catch { throw new Error(`URL da fonte inválida: "${url}"`) }
  const ext = caminho.match(/\.(ttf|otf|ttc)$/i)?.[1]
  if (!ext) throw new Error(`a URL da fonte não termina em .ttf/.otf/.ttc: ${url}`)
  return ext.toLowerCase()
}

/** Caminho RELATIVO à RAIZ. O nome vem do banco: sem barra nem caractere proibido, sem ponto inicial. */
export function caminhoDaFonte(fontFamily: string, ext: string) {
  const nome = fontFamily.replace(/[\\/:*?"<>|\x00-\x1f]/g, '-').replace(/^[.\s]+/, '').trim()
  if (!nome) throw new Error(`fontFamily vazio ou inválido: "${fontFamily}"`)
  return join(PASTAS.assets, 'fontes', `${nome}.${ext}`)
}

/** Onde a fonte vai, ou por que não vai. Nunca lança: uma fonte ruim não derruba as outras. */
export function destinoDaFonte(f: { fontFamily: string; fileUrl: string }) {
  try {
    const extensao = extensaoDaUrl(f.fileUrl)
    return { extensao, caminho: caminhoDaFonte(f.fontFamily, extensao), erro: null }
  } catch (e) {
    return { extensao: null, caminho: null, erro: (e as Error).message }
  }
}

/**
 * Tem cara de fonte INTEIRA? Cabeçalho sfnt (o que o FreeType do PIL lê) e o diretório de tabelas
 * cabendo no arquivo: cada registro (tag, checksum, offset, length) aponta para dentro do buffer.
 * Não confere o conteúdo das tabelas — um download cortado com cabeçalho bom é o que isto pega.
 */
export function tipoDeFonte(b: Buffer) {
  const m = b.subarray(0, 4).toString('latin1')
  const tipo = m === 'OTTO' ? 'otf' : m === 'ttcf' ? 'ttc' : m === 'true' || m === '\x00\x01\x00\x00' ? 'ttf' : null
  if (!tipo) return null
  const cabe = (o: number, n: number) => o + n <= b.length
  // diretório sfnt em o: numTables em o+4, registros de 16 bytes a partir de o+12
  const diretorio = (o: number) => {
    if (!cabe(o, 12)) return false
    const n = b.readUInt16BE(o + 4)
    if (!n || !cabe(o + 12, 16 * n)) return false
    for (let r = o + 12; r < o + 12 + 16 * n; r += 16) if (!cabe(b.readUInt32BE(r + 8), b.readUInt32BE(r + 12))) return false
    return true
  }
  if (tipo !== 'ttc') return diretorio(0) ? tipo : null
  // coleção: numFonts em 8, um offset de diretório por fonte a partir de 12
  if (!cabe(0, 12)) return null
  const fontes = b.readUInt32BE(8)
  if (!fontes || !cabe(12, 4 * fontes)) return null
  for (let i = 0; i < fontes; i++) if (!diretorio(b.readUInt32BE(12 + 4 * i))) return null
  return tipo
}

/** Tipografia por papel com a regra do Studio (nonEmpty do brand-context): vazio é "sem escolha". */
export function papeisDaMarca(
  p: { titleFontFamily?: string | null; subtitleFontFamily?: string | null; bodyFontFamily?: string | null },
  familias: string[],
) {
  const limpo = (x?: string | null) => x?.trim() || null
  const corpo = limpo(p.bodyFontFamily)
  const papeis = { titulo: limpo(p.titleFontFamily), subtitulo: limpo(p.subtitleFontFamily) ?? corpo, corpo }
  // papel que aponta família sem arquivo: quem escolher a legenda por ele escolhe fonte que não está no disco
  const cadastradas = new Set(familias.map((f) => f.trim()))
  const avisos = Object.entries(papeis)
    .filter(([, v]) => v && !cadastradas.has(v))
    .map(([k, v]) => `papel ${k} usa "${v}", que não tem arquivo cadastrado no Studio — escolha a fonte entre as de "fontes"`)
  return { papeis, avisos }
}

/** "#547737", "547737 ", "#fff" → { hex: "#547737", rgb: [84, 119, 55] }; inválido → null. */
export function cor(hex: string) {
  let h = hex.replace(/\s+/g, '').replace(/^#/, '')
  if (/^[0-9a-f]{3}$/i.test(h)) h = [...h].map((c) => c + c).join('')
  if (!/^[0-9a-f]{6}$/i.test(h)) return null
  return { hex: '#' + h.toUpperCase(), rgb: [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) }
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** O Blob levanta um desafio anti-bot (403) em rajada: tenta de novo, espaçado. 404 é final. */
async function baixarArquivo(url: string): Promise<Buffer> {
  let ultimo = 0
  for (const espera of [0, 20_000, 45_000]) {
    if (espera) {
      console.error(`  (HTTP ${ultimo}; nova tentativa em ${espera / 1000}s)`)
      await dormir(espera)
    }
    const r = await fetch(url)
    if (r.ok) return Buffer.from(await r.arrayBuffer())
    ultimo = r.status
    if (![403, 429, 500, 502, 503, 504].includes(r.status)) break
  }
  throw new Error(`o Blob não entregou o arquivo (HTTP ${ultimo})`)
}

type Fonte = { id: number; name: string; fontFamily: string; fileUrl: string }

/** Cada fonte decidida (e, com baixar, gravada) sozinha: o erro de uma vira "falhou" e as outras seguem. */
export async function tratarFontes(lista: Fonte[], raiz: string, baixar: boolean, buscar = baixarArquivo) {
  let pendentes = 0
  const fontes: any[] = []
  for (const f of lista) {
    const d = destinoDaFonte(f)
    const absoluto = d.caminho && join(raiz, d.caminho)
    const item = { id: f.id, name: f.name, fontFamily: f.fontFamily, fileUrl: f.fileUrl, extensao: d.extensao, caminho: d.caminho, absoluto }
    if (d.erro) {
      pendentes++
      fontes.push({ ...item, situacao: `falhou: ${d.erro}` })
      continue
    }
    if (!baixar) {
      const noDisco = existsSync(absoluto) && (tipoDeFonte(readFileSync(absoluto)) ? 'fonte' : 'nao-e-fonte')
      if (noDisco === 'nao-e-fonte') pendentes++ // o --baixar marcaria conflito: precisa de gente
      fontes.push({ ...item, noDisco })
      continue
    }
    let situacao: string
    try {
      const b = await buscar(f.fileUrl)
      if (!tipoDeFonte(b)) throw new Error(`o que o Blob entregou não é uma fonte inteira (${b.length} bytes, começa com ${JSON.stringify(b.subarray(0, 8).toString('latin1'))})`)
      if (existsSync(absoluto)) {
        situacao = readFileSync(absoluto).equals(b) ? 'já estava' : 'conflito: já existe um arquivo DIFERENTE com esse nome — ficou como está'
      } else {
        mkdirSync(dirname(absoluto), { recursive: true })
        writeFileSync(absoluto + '.part', b)
        renameSync(absoluto + '.part', absoluto)
        situacao = 'baixada'
      }
    } catch (e) {
      situacao = `falhou: ${(e as Error).message}`
    }
    if (situacao !== 'baixada' && situacao !== 'já estava') pendentes++
    fontes.push({ ...item, situacao })
  }
  return { fontes, pendentes }
}

async function main() {
  const argv = process.argv.slice(2)
  if (!argv.length) return autoconferencia()
  const { projeto, raiz, baixar } = lerArgs(argv)
  if (!existsSync(join(raiz, PASTAS.assets))) {
    throw new Error(`"${raiz}" não é a raiz de um projeto organizado (falta ${PASTAS.assets}) — rode o organizar.ts antes`)
  }

  const { db } = await import('../../../src/lib/db')
  const p: any = await db.$transaction(async (tx: any) => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY')
    return tx.project.findUnique({
      where: { id: projeto },
      select: {
        name: true, titleFontFamily: true, subtitleFontFamily: true, bodyFontFamily: true,
        CustomFont: { select: { id: true, name: true, fontFamily: true, fileUrl: true }, orderBy: { id: 'asc' } },
        BrandColor: { select: { name: true, hexCode: true }, orderBy: { createdAt: 'asc' } },
      },
    })
  })
  if (!p) throw new Error(`o projeto ${projeto} não existe`)
  if (!p.CustomFont.length) throw new Error(`o projeto ${projeto} (${p.name}) não tem fontes cadastradas — envie os arquivos pela aba Marca do Studio`)

  const { papeis, avisos } = papeisDaMarca(p, p.CustomFont.map((f: any) => f.fontFamily))
  const cores = p.BrandColor.map((c: any) => {
    const n = cor(c.hexCode)
    if (!n) avisos.push(`cor "${c.name}" com hex inválido no Studio: "${c.hexCode}"`)
    return { nome: c.name, ...(n ?? { hex: c.hexCode, rgb: null }) }
  })

  const { fontes, pendentes } = await tratarFontes(p.CustomFont, raiz, baixar)

  saida({
    projeto: { id: projeto, nome: p.name },
    raiz,
    papeis,
    fontes,
    cores,
    avisos,
  })
  process.exit(pendentes ? 1 : 0) // o Prisma segura o processo aberto
}

async function autoconferencia() {
  const eq = (a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`) }
  const lanca = (f: () => unknown, rotulo: string) => {
    try { f() } catch { return }
    throw new Error(`devia falhar: ${rotulo}`)
  }
  eq(lerArgs(['--projeto', '2', '--raiz', '/x/y', '--baixar']), { baixar: true, projeto: 2, raiz: '/x/y' })
  eq(lerArgs(['--raiz', '/x', '--projeto', '7']).baixar, false)
  lanca(() => lerArgs(['--projeto', '2']), 'sem raiz')
  lanca(() => lerArgs(['--projeto', 'quintal', '--raiz', '/x']), 'projeto não numérico')
  lanca(() => lerArgs(['--projeto', '0', '--raiz', '/x']), 'projeto zero')
  lanca(() => lerArgs(['--projeto', '--raiz', '/x']), 'flag sem valor')
  lanca(() => lerArgs(['--projeto', '2', '--raiz', '/x', '--forcar']), 'flag desconhecida')
  lanca(() => lerArgs(['2']), 'token solto')
  lanca(() => lerArgs(['--projeto', '2', '--raiz', '/x', '--projeto', '3']), 'projeto repetido')
  lanca(() => lerArgs(['--raiz', '/a', '--projeto', '2', '--raiz', '/b']), 'raiz repetida')
  for (const v of ['1e0', '0x2', '2.0', ' 2 ', '-2']) lanca(() => lerArgs(['--projeto', v, '--raiz', '/x']), `projeto "${v}"`)
  eq(lerArgs(['--projeto', '007', '--raiz', '/x']).projeto, 7)

  eq(extensaoDaUrl('https://b.blob/projects/2/fonts/1759895756753-Amithen.otf'), 'otf')
  eq(extensaoDaUrl('https://b.blob/f/Acumin-Pro-Thin.TTF?download=1'), 'ttf')
  lanca(() => extensaoDaUrl('https://b.blob/f/fonte.woff2'), 'woff2 não é sfnt')
  lanca(() => extensaoDaUrl('https://b.blob/f/fonte'), 'sem extensão')
  lanca(() => extensaoDaUrl('/projects/2/fonts/Amithen.otf'), 'URL relativa')

  eq(caminhoDaFonte('Acumin Pro Semibold', 'ttf'), '06_ELEMENTOS/Assets/fontes/Acumin Pro Semibold.ttf')
  eq(caminhoDaFonte('../../etc/passwd', 'ttf'), '06_ELEMENTOS/Assets/fontes/-..-etc-passwd.ttf') // nunca sai da pasta
  eq(caminhoDaFonte('.oculta', 'otf'), '06_ELEMENTOS/Assets/fontes/oculta.otf')
  lanca(() => caminhoDaFonte('  ', 'ttf'), 'família vazia')

  // sfnt mínimo: cabeçalho, n registros de tabela e as n tabelas de 4 bytes (offsets a partir de base)
  const sfnt = (magia: string, n = 2, base = 0) => {
    const b = Buffer.alloc(12 + 20 * n)
    b.write(magia, 0, 'latin1')
    b.writeUInt16BE(n, 4)
    for (let i = 0; i < n; i++) {
      b.writeUInt32BE(base + 12 + 16 * n + 4 * i, 12 + 16 * i + 8)
      b.writeUInt32BE(4, 12 + 16 * i + 12)
    }
    return b
  }
  const ttc = Buffer.concat([Buffer.from('ttcf\x00\x01\x00\x00\x00\x00\x00\x01\x00\x00\x00\x10', 'latin1'), sfnt('true', 2, 16)])
  eq(tipoDeFonte(sfnt('OTTO')), 'otf')
  eq(tipoDeFonte(sfnt('\x00\x01\x00\x00')), 'ttf')
  eq(tipoDeFonte(sfnt('true')), 'ttf')
  eq(tipoDeFonte(ttc), 'ttc')
  eq(tipoDeFonte(sfnt('OTTO').subarray(0, 50)), null) // cortada: a 2ª tabela passa do fim
  eq(tipoDeFonte(sfnt('OTTO').subarray(0, 30)), null) // cortada no meio do diretório
  eq(tipoDeFonte(sfnt('OTTO', 0)), null) // nenhuma tabela
  eq(tipoDeFonte(ttc.subarray(0, 40)), null)
  eq(tipoDeFonte(Buffer.from('OTTO\x00\x0a', 'latin1')), null) // só o cabeçalho já passou por fonte
  eq(tipoDeFonte(Buffer.from('<!DOCTYPE html>')), null) // o desafio do Blob
  eq(tipoDeFonte(Buffer.from('wOF2....')), null)
  eq(tipoDeFonte(Buffer.alloc(2)), null)

  // papéis: vazio é "sem escolha" (subtítulo cai no corpo) e família sem arquivo avisa
  eq(papeisDaMarca({ titleFontFamily: ' Amithen ', subtitleFontFamily: '', bodyFontFamily: 'DomaniCP' }, ['Amithen', 'DomaniCP']),
    { papeis: { titulo: 'Amithen', subtitulo: 'DomaniCP', corpo: 'DomaniCP' }, avisos: [] })
  eq(papeisDaMarca({ titleFontFamily: null, subtitleFontFamily: null, bodyFontFamily: null }, []).avisos, [])
  eq(papeisDaMarca({ titleFontFamily: 'Bonoco2023', subtitleFontFamily: 'Caveat', bodyFontFamily: 'Caveat' }, ['Bonoco2023', 'The Kathy'])
    .avisos.map((a) => a.split(' usa ')[0]), ['papel subtitulo', 'papel corpo'])

  eq(cor('#547737'), { hex: '#547737', rgb: [84, 119, 55] })
  eq(cor(' 6c370f '), { hex: '#6C370F', rgb: [108, 55, 15] })
  eq(cor('# F5F0E8'), { hex: '#F5F0E8', rgb: [245, 240, 232] }) // hex com espaço já quebrou o canvas
  eq(cor('#fff'), { hex: '#FFFFFF', rgb: [255, 255, 255] })
  eq(cor('verde'), null)
  eq(cor('#5477377F'), null)

  // o laço: fontes ruins no meio da lista não derrubam as outras, nos dois modos
  const raiz = mkdtempSync(join(tmpdir(), 'fontes-'))
  try {
    const pasta = join(raiz, PASTAS.assets, 'fontes')
    mkdirSync(pasta, { recursive: true })
    writeFileSync(join(pasta, 'Cliente.otf'), 'OTTO-versao-do-cliente') // não é fonte
    const boa = sfnt('OTTO')
    const blob: Record<string, Buffer> = { 'https://b/A.otf': boa, 'https://b/Cliente.otf': boa, 'https://b/Cortada.otf': boa.subarray(0, 40) }
    const buscar = async (u: string) => { if (!blob[u]) throw new Error('o Blob não entregou o arquivo (HTTP 404)'); return blob[u] }
    const lista = [
      { id: 1, name: 'A', fontFamily: 'A', fileUrl: 'https://b/A.otf' },
      { id: 2, name: 'Web', fontFamily: 'Web', fileUrl: 'https://b/Web.woff2' },
      { id: 3, name: 'Rel', fontFamily: 'Rel', fileUrl: '/projects/2/fonts/Rel.otf' },
      { id: 4, name: 'Pontos', fontFamily: '...', fileUrl: 'https://b/P.otf' },
      { id: 5, name: 'Cliente', fontFamily: 'Cliente', fileUrl: 'https://b/Cliente.otf' },
      { id: 6, name: 'Cortada', fontFamily: 'Cortada', fileUrl: 'https://b/Cortada.otf' },
      { id: 7, name: 'Sumiu', fontFamily: 'Sumiu', fileUrl: 'https://b/Sumiu.ttf' },
    ]
    const resumo = (r: { fontes: any[] }) => r.fontes.map((f) => f.situacao?.split(':')[0] ?? f.noDisco)
    const l = await tratarFontes(lista, raiz, false, buscar)
    eq(resumo(l), [false, 'falhou', 'falhou', 'falhou', 'nao-e-fonte', false, false])
    eq(l.pendentes, 4)
    eq(l.fontes[1].caminho, null)
    const b = await tratarFontes(lista, raiz, true, buscar)
    eq(resumo(b), ['baixada', 'falhou', 'falhou', 'falhou', 'conflito', 'falhou', 'falhou'])
    eq(b.pendentes, 6)
    eq(readFileSync(join(pasta, 'A.otf')).equals(boa), true)
    eq(readFileSync(join(pasta, 'Cliente.otf'), 'latin1'), 'OTTO-versao-do-cliente') // o do cliente ficou
    eq(existsSync(join(pasta, 'Cortada.otf')), false)
    eq(resumo(await tratarFontes(lista.slice(0, 1), raiz, true, buscar)), ['já estava'])
    eq(resumo(await tratarFontes(lista.slice(0, 1), raiz, false, buscar)), ['fonte'])
  } finally {
    rmSync(raiz, { recursive: true, force: true })
  }
  console.error('autoconferência ok')
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
