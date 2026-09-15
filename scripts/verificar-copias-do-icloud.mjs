#!/usr/bin/env node
/**
 * Cópias do iCloud Drive versionadas por engano — roda no CI, SEM dependências.
 *
 *   node scripts/verificar-copias-do-icloud.mjs          # o índice do git
 *   node scripts/verificar-copias-do-icloud.mjs <ref>    # uma ref (ex.: origin/main)
 *
 * Checkout dentro de ~/Documents sincronizado pelo iCloud cria "arquivo 2.ts"
 * ao lado de "arquivo.ts" (e "pasta 2/" ao lado de "pasta/"). Um `git add`
 * amplo levou 26 delas para a main no #104 (07/09/2026): 19 idênticas ao
 * original e 7 com versões ANTIGAS dele — o risco é alguém editar a cópia
 * errada e o PR passar, porque o typecheck não acusa nada nelas.
 *
 * A regra é o PAR, não o nome: só acusa "x 2.ts" quando "x.ts" também está
 * versionado. Nome terminado em número sem irmão ("Layout 2.png") é legítimo e
 * passa. E a guarda é aqui, não no .gitignore: ignorar o padrão esconderia a
 * cópia do `git status` de quem está editando justamente a cópia.
 *
 * Sai com exit 1 quando acha alguma.
 */

import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

// "nome 2.ext", "nome.test 2.ts", "pasta 2", ".env 2"
const COPIA = /^(.+) ([0-9]+)(\.[^. ]+)?$/

/**
 * @param {string[]} caminhos caminhos versionados, com "/" como separador
 * @returns {{ copia: string, original: string }[]}
 */
export function copiasDoIcloud(caminhos) {
  const arquivos = new Set(caminhos)
  const pastas = new Set()
  for (const caminho of caminhos) {
    const partes = caminho.split('/')
    for (let i = 1; i < partes.length; i++) pastas.add(partes.slice(0, i).join('/'))
  }

  const achadas = []
  for (const caminho of caminhos) {
    const partes = caminho.split('/')
    for (let i = 0; i < partes.length; i++) {
      const m = COPIA.exec(partes[i])
      if (!m) continue
      const irmao = [...partes.slice(0, i), m[1] + (m[3] ?? '')].join('/')
      const ehArquivo = i === partes.length - 1
      if (ehArquivo ? arquivos.has(irmao) : pastas.has(irmao)) {
        achadas.push({ copia: caminho, original: ehArquivo ? irmao : `${irmao}/` })
        break
      }
    }
  }
  return achadas
}

function caminhosVersionados(ref) {
  // -z: sem ele o git põe entre aspas e escapa nome com acento ("P\303\241gina 2.ts")
  const args = ref ? ['ls-tree', '-r', '-z', '--name-only', ref] : ['ls-files', '-z']
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\0')
    .filter(Boolean)
}

// argv[1] é undefined quando o módulo é importado por `node -e` (teste do par)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const ref = process.argv[2]
  const caminhos = caminhosVersionados(ref)
  const achadas = copiasDoIcloud(caminhos)

  if (achadas.length === 0) {
    console.log(`✓ nenhuma cópia do iCloud versionada (${caminhos.length} arquivos${ref ? ` em ${ref}` : ''})`)
    process.exit(0)
  }

  console.error(`✗ ${achadas.length} cópia(s) do iCloud versionada(s), com o original ao lado:\n`)
  for (const { copia, original } of achadas) console.error(`  ${copia}  →  ${original}`)
  console.error(
    '\nConfira se a cópia tem algo que o original não tem e só então apague com\n' +
      '`git rm -- "<caminho>"`, um por um. Se o checkout estiver no iCloud Drive,\n' +
      'mova-o para fora (ou marque a pasta como "não sincronizar") para parar de gerar cópias.',
  )
  process.exit(1)
}
