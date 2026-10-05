/**
 * Etapa 1 — organiza a pasta do projeto na estrutura padrão.
 *
 *   npx tsx .claude/skills/editar-video/organizar.ts <pasta>                 # só o plano (não mexe em nada)
 *   npx tsx .claude/skills/editar-video/organizar.ts <pasta> --aplicar [--decisoes d.json]
 *   npx tsx .claude/skills/editar-video/organizar.ts --desfazer <pasta>/00_BRIEFING/organizacao-<data>.json
 *   npx tsx .claude/skills/editar-video/organizar.ts --autoteste
 *
 * Move (nunca copia, nunca apaga) dentro do MESMO volume, então é instantâneo e a
 * data do arquivo não muda — o cache da análise continua valendo. Toda mudança fica
 * num manifesto em 00_BRIEFING, que o --desfazer usa para voltar tudo.
 *
 * `--decisoes` responde as dúvidas do plano: { "<caminho relativo>": "<pasta destino>" | "manter" }.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, unlinkSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, relative } from 'node:path'
import { autotesteEstrutura, classificar, jaOrganizado, PASTAS, VIDEO } from './estrutura'

type Movimento = { de: string; para: string; motivo: string }
type Duvida = { arquivo: string; motivo: string; sugestao?: string }

function temAlfa(arquivo: string): boolean {
  try {
    const pix = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=pix_fmt', '-of', 'csv=p=0', arquivo], { encoding: 'utf8' }).trim()
    return /yuva|rgba|argb|bgra|gbrap|ya/.test(pix)
  } catch {
    return false
  }
}

/** Todos os arquivos fora da estrutura, sem ocultos e sem os `._` do exFAT. */
function listar(raiz: string) {
  const arquivos: string[] = []
  const analises: string[] = []
  const visitar = (dir: string) => {
    for (const n of readdirSync(dir).sort()) {
      if (n.startsWith('.')) continue
      const p = join(dir, n)
      const rel = relative(raiz, p)
      if (statSync(p).isDirectory()) {
        if (dir === raiz && jaOrganizado(n)) continue
        if (n === '_analise') analises.push(p)
        else visitar(p)
      } else arquivos.push(p)
    }
  }
  visitar(raiz)
  return { arquivos, analises }
}

function planejar(raiz: string, decisoes: Record<string, string>) {
  const { arquivos, analises } = listar(raiz)
  const movimentos: Movimento[] = []
  const duvidas: Duvida[] = []
  const destinos = new Set<string>()

  for (const arq of arquivos) {
    const rel = relative(raiz, arq)
    const origem = dirname(rel) === '.' ? '' : dirname(rel)
    const escolha = decisoes[rel]
    if (escolha === 'manter') continue
    const d = escolha
      ? { pasta: escolha, motivo: 'decidido pelo Ciro' }
      : classificar(arq, origem, VIDEO.has(extname(arq).toLowerCase()) && temAlfa(arq))
    if ('duvida' in d) {
      duvidas.push({ arquivo: rel, motivo: d.duvida, sugestao: d.sugestao })
      continue
    }
    const para = join(d.pasta, basename(arq))
    if (existsSync(join(raiz, para)) || destinos.has(para)) {
      duvidas.push({ arquivo: rel, motivo: `já existe ${para}` })
      continue
    }
    destinos.add(para)
    movimentos.push({ de: rel, para, motivo: d.motivo })
  }

  // A _analise vai junto com os vídeos da pasta dela — se eles forem todos para o mesmo lugar.
  for (const a of analises) {
    const origem = relative(raiz, dirname(a))
    const dos = movimentos.filter((m) => dirname(m.de) === origem && VIDEO.has(extname(m.de).toLowerCase()))
    const alvos = new Set(dos.map((m) => dirname(m.para)))
    if (alvos.size !== 1) continue
    const para = join([...alvos][0], '_analise')
    if (existsSync(join(raiz, para))) duvidas.push({ arquivo: relative(raiz, a), motivo: `já existe ${para}` })
    else movimentos.push({ de: relative(raiz, a), para, motivo: 'análise acompanha os vídeos' })
  }
  return { movimentos, duvidas }
}

function criarEstrutura(raiz: string) {
  for (const p of Object.values(PASTAS)) mkdirSync(join(raiz, p), { recursive: true })
}

/** Apaga pastas que ficaram vazias (ignorando os `._`/.DS_Store), de baixo para cima. */
function limparVazias(raiz: string, dirs: string[]) {
  const ordem = [...new Set(dirs)].sort((a, b) => b.length - a.length)
  for (const d of ordem) {
    let atual = join(raiz, d)
    while (atual !== raiz && existsSync(atual)) {
      const sobra = readdirSync(atual).filter((n) => !n.startsWith('._') && n !== '.DS_Store')
      if (sobra.length) break
      for (const n of readdirSync(atual)) {
        try {
          unlinkSync(join(atual, n)) // só sobraram ._ e .DS_Store
        } catch {
          /* se não sair, o rmdir abaixo falha e a pasta fica */
        }
      }
      try {
        rmdirSync(atual)
      } catch {
        break
      }
      atual = dirname(atual)
    }
  }
}

function aplicar(raiz: string, movimentos: Movimento[]) {
  criarEstrutura(raiz)
  const feitos: Movimento[] = []
  const manifesto = join(raiz, PASTAS.briefing, `organizacao-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  try {
    for (const m of movimentos) {
      mkdirSync(dirname(join(raiz, m.para)), { recursive: true })
      renameSync(join(raiz, m.de), join(raiz, m.para))
      feitos.push(m)
    }
  } finally {
    writeFileSync(manifesto, JSON.stringify({ raiz, em: new Date().toISOString(), movimentos: feitos }, null, 2))
  }
  limparVazias(raiz, feitos.map((m) => dirname(m.de)).filter((d) => d !== '.'))
  return { manifesto, feitos: feitos.length }
}

function desfazer(manifesto: string) {
  const { raiz, movimentos } = JSON.parse(readFileSync(manifesto, 'utf8')) as { raiz: string; movimentos: Movimento[] }
  let n = 0
  for (const m of [...movimentos].reverse()) {
    if (!existsSync(join(raiz, m.para)) || existsSync(join(raiz, m.de))) {
      console.error(`⚠️ pulei ${m.para} (não está mais lá, ou o lugar original está ocupado)`)
      continue
    }
    mkdirSync(dirname(join(raiz, m.de)), { recursive: true })
    renameSync(join(raiz, m.para), join(raiz, m.de))
    n++
  }
  console.log(`${n} de ${movimentos.length} itens voltaram ao lugar original`)
}

function main() {
  const a = process.argv.slice(2)
  if (a.includes('--autoteste')) {
    autotesteEstrutura()
    return console.log('autoteste ok')
  }
  const i = a.indexOf('--desfazer')
  if (i >= 0) return desfazer(a[i + 1])
  const raiz = a.find((x) => !x.startsWith('--') && a[a.indexOf(x) - 1] !== '--decisoes')
  if (!raiz || !existsSync(raiz)) {
    console.error('uso: organizar.ts <pasta> [--aplicar] [--decisoes d.json] | --desfazer <manifesto> | --autoteste')
    process.exit(2)
  }
  const d = a.indexOf('--decisoes')
  const decisoes = d >= 0 ? JSON.parse(readFileSync(a[d + 1], 'utf8')) : {}
  const plano = planejar(raiz, decisoes)
  if (!a.includes('--aplicar')) {
    console.log(JSON.stringify({ raiz, aplicado: false, ...plano }, null, 2))
    return
  }
  const r = aplicar(raiz, plano.movimentos)
  console.log(JSON.stringify({ raiz, aplicado: true, ...r, duvidas: plano.duvidas }, null, 2))
}

main()
