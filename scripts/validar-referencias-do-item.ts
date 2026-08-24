/**
 * Prova do contrato de referências do ItemDePlano (23/08/2026) — módulo PURO,
 * sem banco, sem rede, sem custo.
 *
 *   npx tsx scripts/validar-referencias-do-item.ts
 *
 * O que está em jogo: a validação dos tetos (1 cena + 3 âncoras + 2 estilo),
 * a leitura DEFENSIVA da coluna Json (linha antiga/lixo → nunca erro), o
 * espelho derivado da cena e a decisão de geração com a lista presente.
 */
import {
  cenaDasReferencias,
  decidirGeracao,
  ehRecusa,
  lerReferenciasDoItem,
  validarReferencias,
} from '../src/lib/planos/execucao'

let falhas = 0
function ok(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ✓ ${nome}`)
  else {
    falhas++
    console.error(`  ✗ ${nome}${detalhe ? ` — ${detalhe}` : ''}`)
  }
}

console.log('\nvalidarReferencias')
{
  const cheia = validarReferencias([
    { role: 'subject', driveFileId: 'a' },
    { role: 'anchor-ambient', driveFileId: 'b' },
    { role: 'anchor-dish', driveFileId: 'c' },
    { role: 'style', url: 'https://x.blob.vercel-storage.com/s.jpg', label: 'clima' },
  ])
  ok('lista completa válida passa', cheia.ok && cheia.referencias.length === 4)

  ok('2 cenas recusa', !validarReferencias([{ role: 'subject', driveFileId: 'a' }, { role: 'subject', driveFileId: 'b' }]).ok)
  ok(
    '4 âncoras recusa',
    !validarReferencias([
      { role: 'anchor-ambient', driveFileId: 'a' },
      { role: 'anchor-ambient', driveFileId: 'b' },
      { role: 'anchor-dish', driveFileId: 'c' },
      { role: 'anchor-dish', driveFileId: 'd' },
    ]).ok,
  )
  ok('3 estilos recusa', !validarReferencias([
    { role: 'style', driveFileId: 'a' },
    { role: 'style', driveFileId: 'b' },
    { role: 'style', driveFileId: 'c' },
  ]).ok)
  ok('url E driveFileId juntos recusa', !validarReferencias([{ role: 'subject', driveFileId: 'a', url: 'https://x/b.jpg' }]).ok)
  ok('sem endereço nenhum recusa', !validarReferencias([{ role: 'subject' }]).ok)
  ok('papel desconhecido recusa', !validarReferencias([{ role: 'documento', driveFileId: 'a' }]).ok)
  ok('ausente = lista vazia ok', validarReferencias(undefined).ok && validarReferencias(undefined).referencias.length === 0)
}

console.log('\nlerReferenciasDoItem (defensivo)')
{
  ok('não-lista vira []', lerReferenciasDoItem('lixo').length === 0 && lerReferenciasDoItem(null).length === 0)
  const mista = lerReferenciasDoItem([
    { role: 'subject', driveFileId: 'a' },
    { role: 'inventado', driveFileId: 'b' },
    { role: 'style', url: 'https://x/c.jpg' },
  ])
  ok('item quebrado é filtrado sem derrubar os bons', mista.length === 2 && mista[0].role === 'subject' && mista[1].role === 'style')
}

console.log('\ncenaDasReferencias')
{
  const cena = cenaDasReferencias([
    { role: 'anchor-ambient', driveFileId: 'amb' },
    { role: 'subject', driveFileId: 'prato' },
  ])
  ok('a cena é o subject, não a primeira', cena?.driveFileId === 'prato')
  ok('sem subject, a primeira serve', cenaDasReferencias([{ role: 'style', driveFileId: 's' }])?.driveFileId === 's')
}

console.log('\ndecidirGeracao com a lista')
{
  const soAncoras = decidirGeracao({
    tema: 'promoção',
    copyProposta: ['Headline'],
    // Espelho preenchido de propósito: com lista presente, a cena tem de estar NELA.
    fotoDriveId: 'espelho-velho',
    referencias: [{ role: 'anchor-ambient', driveFileId: 'amb' }],
  })
  ok('copy + lista SEM cena recusa (o espelho não a salva)', ehRecusa(soAncoras))

  const arte = decidirGeracao({
    tema: 'promoção',
    copyProposta: ['Headline'],
    referencias: [
      { role: 'subject', driveFileId: 'prato' },
      { role: 'style', url: 'https://x/clima.jpg' },
    ],
  })
  ok(
    'copy + cena → trilha arte com a lista inteira',
    !ehRecusa(arte) && arte.trilha === 'arte' && arte.referencias?.length === 2,
  )

  const cena = decidirGeracao({
    tema: 'salão à noite',
    referencias: [{ role: 'subject', driveFileId: 'salao' }],
  })
  ok(
    'sem copy → trilha imagem e a cena vira âncora de ambiente',
    !ehRecusa(cena) && cena.trilha === 'imagem' && cena.referencias?.[0]?.role === 'anchor-ambient',
  )

  const antigo = decidirGeracao({ tema: 'promoção', copyProposta: ['H'], fotoDriveId: 'foto' })
  ok('item antigo sem lista mantém o caminho do espelho', !ehRecusa(antigo) && antigo.referencias === null)
}

console.log(falhas === 0 ? '\nTudo certo.' : `\n${falhas} falha(s).`)
process.exit(falhas === 0 ? 0 : 1)
