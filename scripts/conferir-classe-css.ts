/**
 * Diz se uma classe do Tailwind EXISTE no CSS compilado deste projeto.
 *
 *   npx tsx scripts/conferir-classe-css.ts grid-rows-2 bg-zinc-400 'sm:w-28'
 *
 * 🔴 Existe para aposentar um erro que custou caro três vezes: medir a classe
 * INJETANDO o elemento na página servida e lendo `getComputedStyle`. O Tailwind
 * é JIT — ele só gera regra para a classe que ENCONTRA no fonte varrido —,
 * então classe ainda não escrita nunca tem regra, em projeto Tailwind nenhum. A
 * medição respondia outra pergunta, e a resposta virou uma lista de "classes
 * mortas" que na verdade nunca foram escritas em lugar nenhum.
 *
 * `grep` no fonte também não serve: o scanner é textual e não distingue código
 * de comentário, então ele gera a classe a partir do próprio comentário que a
 * declara morta. A única prova é o seletor no CSS COMPILADO — que é o que este
 * script procura.
 *
 * Ausente aqui significa "ninguém usa esta classe no fonte varrido", NÃO "esta
 * build não sabe gerá-la": escreva-a num arquivo do `src/`, rode de novo e ela
 * aparece. Presente aqui e sem efeito na tela é outra coisa — precedência
 * (`dark:` vencendo a classe sem prefixo) ou recorte de ancestral.
 */
import fs from 'node:fs'
import path from 'node:path'

/** Tailwind escapa tudo que não é [A-Za-z0-9_-] com barra invertida. */
function seletorDe(classe: string): string {
  return `.${classe.replace(/[^A-Za-z0-9_-]/g, (c) => `\\${c}`)}`
}

async function compilar(): Promise<string> {
  const raiz = path.resolve(__dirname, '..')
  const entrada = path.join(raiz, 'src/app/globals.css')
  const [{ default: postcss }, { default: tailwind }] = await Promise.all([
    import('postcss'),
    import('@tailwindcss/postcss'),
  ])
  const css = fs.readFileSync(entrada, 'utf8')
  const r = await postcss([tailwind()]).process(css, { from: entrada, to: undefined })
  return r.css
}

async function main() {
  const classes = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  if (!classes.length) {
    console.log('uso: npx tsx scripts/conferir-classe-css.ts <classe> [classe…]')
    process.exitCode = 1
    return
  }

  const t0 = Date.now()
  const css = await compilar()
  console.log(`CSS compilado: ${(css.length / 1024).toFixed(0)} KB em ${Date.now() - t0}ms\n`)

  for (const classe of classes) {
    const seletor = seletorDe(classe)
    const i = css.indexOf(`${seletor} `)
    const achou = i >= 0 || css.includes(`${seletor}{`) || css.includes(`${seletor},`)
    if (!achou) {
      console.log(`  ✗ ${classe} — sem regra. Ninguém a usa no fonte; escreva-a e rode de novo.`)
      continue
    }
    // A regra INTEIRA, para quem precisa conferir o valor e não só a
    // existência — fechando as chaves na conta, senão variante com `@media`
    // (que aninha) sai cortada e parece CSS quebrado.
    const inicio = i >= 0 ? i : css.indexOf(seletor)
    let fim = css.indexOf('{', inicio)
    for (let nivel = 0; fim < css.length; fim++) {
      if (css[fim] === '{') nivel++
      else if (css[fim] === '}' && --nivel === 0) break
    }
    const regra = css.slice(inicio, fim + 1).replace(/\s+/g, ' ').trim()
    console.log(`  ✓ ${classe} — ${regra}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
