/**
 * Validação da IMPRESSÃO DIGITAL das regras (CP5b § 5) — roda no CI, SEM env.
 *
 *   npx tsx scripts/validar-impressao-digital.ts
 *
 * O teste `impressao-digital-das-regras.test.ts` cobra o bump da versão quando a regra muda. Mas, sem este
 * validador, bastava REGENERAR o JSON da versão velha e o teste voltava a passar (Codex R1). Aqui:
 *
 *  A. todo arquivo de `src/lib/creatives/revisao/__tests__/impressao-digital/` que já existe em `origin/main` é
 *     IMUTÁVEL: mudou → falha; SUMIU → falha (Codex R6: o conjunto da base tem de estar contido no do PR);
 *  B. arquivo NOVO só é aceito se o nome bate com a versão correspondente do próprio PR
 *     (`revisao-<VERSAO_DAS_REGRAS>.json` ou `gate-<VERSAO_DO_GATE>.json`) e o conteúdo declara essa versão;
 *  C. as duas versões em vigor têm o seu arquivo.
 *
 * A base é `origin/main`, buscada AQUI (`git fetch --no-tags --depth=1 origin main`): o checkout do CI é raso e não
 * garante a referência (Codex R2). Base indisponível → FALHA explícita, nunca passa em silêncio.
 *
 * Limite dito: quem tem força para editar a `main` diretamente contorna qualquer validador — é o mesmo limite de todo
 * gate do CI deste repositório.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { VERSAO_DAS_REGRAS } from '../src/lib/creatives/revisao/contrato'
import { VERSAO_DO_GATE } from '../src/lib/creatives/revisao/gate'
import { nomeDoArquivoDaImpressao, type ArquivoDaImpressao } from '../src/lib/creatives/revisao/impressao-digital'

const PASTA = 'src/lib/creatives/revisao/__tests__/impressao-digital'
const BASE = 'origin/main'

let falhas = 0
let passos = 0
const ok = (nome: string) => {
  passos += 1
  console.log(`  ✓ ${nome}`)
}
const falha = (nome: string, detalhe?: string) => {
  falhas += 1
  console.error(`  ✗ ${nome}${detalhe ? `\n      ${detalhe}` : ''}`)
}

function git(args: string[]): string | null {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    return null
  }
}

console.log('Impressão digital das regras (CP5b)')

git(['fetch', '--no-tags', '--depth=1', 'origin', 'main'])
const baseSha = git(['rev-parse', '--verify', `${BASE}^{commit}`])?.trim()
if (!baseSha) falha(`sem ${BASE} para comparar (o fetch falhou?)`, 'o validador não passa em silêncio sem a base')
else ok(`base ${BASE} = ${baseSha.slice(0, 10)}`)

const esperados = new Map<string, { camada: 'revisor' | 'gate'; versao: string }>([
  [nomeDoArquivoDaImpressao('revisor', VERSAO_DAS_REGRAS), { camada: 'revisor', versao: VERSAO_DAS_REGRAS }],
  [nomeDoArquivoDaImpressao('gate', VERSAO_DO_GATE), { camada: 'gate', versao: VERSAO_DO_GATE }],
])

const arquivos = existsSync(PASTA) ? readdirSync(PASTA).filter((f) => f.endsWith('.json')).sort() : []
const naBase = baseSha ? (git(['ls-tree', '--name-only', BASE, `${PASTA}/`]) ?? '').split('\n').filter((c) => c.endsWith('.json')).map((c) => c.slice(PASTA.length + 1)) : []

// A — o que a base tem é imutável e não some.
for (const nome of naBase) {
  const caminho = `${PASTA}/${nome}`
  if (!arquivos.includes(nome)) {
    falha(`${nome}: existe em ${BASE} e SUMIU no PR`, 'o arquivo de uma versão já publicada fica commitado (auditoria de quando cada regra mudou)')
    continue
  }
  const conteudoBase = git(['show', `${BASE}:${caminho}`])
  const atual = readFileSync(join(process.cwd(), caminho), 'utf8')
  if (conteudoBase === atual) ok(`${nome}: igual ao de ${BASE} (imutável)`)
  else falha(`${nome}: existe em ${BASE} e foi ALTERADO`, 'o arquivo de uma versão já publicada é imutável; mudou a regra? suba a versão e gere um arquivo NOVO')
}

// B — arquivo novo: nome da versão em vigor no PR e conteúdo coerente.
for (const nome of arquivos.filter((a) => !naBase.includes(a))) {
  const esperado = esperados.get(nome)
  if (!esperado) {
    falha(`${nome}: arquivo novo com nome fora das versões em vigor`, `aceitos: ${[...esperados.keys()].join(', ')}`)
    continue
  }
  let conteudo: ArquivoDaImpressao | null = null
  try {
    conteudo = JSON.parse(readFileSync(join(process.cwd(), `${PASTA}/${nome}`), 'utf8')) as ArquivoDaImpressao
  } catch {
    conteudo = null
  }
  if (!conteudo || conteudo.camada !== esperado.camada || conteudo.versao !== esperado.versao || !/^[0-9a-f]{64}$/.test(conteudo.impressao ?? '')) {
    falha(`${nome}: conteúdo não declara ${esperado.camada}/${esperado.versao} com uma impressão sha256`)
    continue
  }
  ok(`${nome}: novo, nome e conteúdo da versão em vigor (${esperado.versao})`)
}

// C — as duas versões em vigor têm arquivo.
for (const [nome, { camada, versao }] of esperados) {
  if (arquivos.includes(nome)) ok(`${camada} ${versao} tem a sua impressão`)
  else falha(`${camada} ${versao} SEM arquivo ${nome}`, 'gere com IMPRESSAO_DIGITAL=gravar npx vitest run src/lib/creatives/revisao/__tests__/impressao-digital-das-regras.test.ts')
}

console.log(`\n${passos} verificações, ${falhas} falha(s)`)
process.exit(falhas > 0 ? 1 : 0)
