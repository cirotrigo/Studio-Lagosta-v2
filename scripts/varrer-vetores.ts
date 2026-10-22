/**
 * Varredura SÓ LEITURA das camadas `svg-path` (CP-X2a; gate G do CP-X2).
 *
 *   npx tsx scripts/varrer-vetores.ts --executar [--commit <sha>] [--lote 200]
 *
 * 🔴 O `.env` deste repositório aponta para PRODUÇÃO (AGENTS.md). Rodar este script lê produção:
 * só com autorização explícita para a varredura (decisão d10 permite a leitura, a execução pede
 * autorização própria). Sem `--executar` ele não conecta em nada: imprime esta ajuda e sai.
 *
 * - Importar este arquivo não tem efeito (o banco é carregado só dentro de `main`, sob `--executar`).
 * - A varredura enxerga só `findMany` (`somenteLeitura`); o relatório traz contagens e ids, nunca
 *   conteúdo de camada nem credencial.
 */
import { somenteLeitura, varrerVetores, type RelatorioDaVarredura } from '../src/lib/vetor/varredura'

export const AJUDA = [
  'varrer-vetores — varredura SÓ LEITURA das camadas svg-path (CP-X2a).',
  'Uso: npx tsx scripts/varrer-vetores.ts --executar [--commit <sha>] [--lote 200]',
  'Sem --executar nada é lido. O .env deste repo aponta para PRODUÇÃO: rodar exige autorização.',
  '',
].join('\n')

type ClienteDoBanco = Parameters<typeof somenteLeitura>[0] & { $disconnect?: () => Promise<void> }

export interface Dependencias {
  carregarCliente: () => Promise<ClienteDoBanco>
  escrever: (texto: string) => void
}

const padrao: Dependencias = {
  // import tardio: sem --executar o módulo do banco nem é carregado
  carregarCliente: async () => (await import('../src/lib/db')).db as unknown as ClienteDoBanco,
  escrever: (texto) => process.stdout.write(texto),
}

function opcao(argv: string[], nome: string): string | undefined {
  const i = argv.indexOf(nome)
  return i >= 0 ? argv[i + 1] : undefined
}

export async function main(
  argv: string[] = process.argv.slice(2),
  deps: Dependencias = padrao,
): Promise<{ executou: boolean; relatorio?: RelatorioDaVarredura }> {
  if (!argv.includes('--executar')) {
    deps.escrever(AJUDA)
    return { executou: false }
  }
  const lote = Number(opcao(argv, '--lote') ?? 200)
  const cliente = await deps.carregarCliente()
  try {
    const relatorio = await varrerVetores(somenteLeitura(cliente), {
      lote: Number.isInteger(lote) && lote > 0 ? lote : 200,
      commit: opcao(argv, '--commit') ?? null,
    })
    deps.escrever(`${JSON.stringify(relatorio, null, 2)}\n`)
    return { executou: true, relatorio }
  } finally {
    await cliente.$disconnect?.()
  }
}

/**
 * Mensagem EXTERNA genérica: nunca repassa `message` nem `stack` (a primeira linha do erro do Prisma pode
 * trazer a URL de conexão ou um token). Só acrescenta o código do Prisma quando ele tem a forma permitida
 * (`P` + 4 dígitos, por exemplo `P1001`).
 */
export function descreverErro(erro: unknown): string {
  const codigo = typeof erro === 'object' && erro !== null ? (erro as { code?: unknown }).code : undefined
  const permitido = typeof codigo === 'string' && /^P\d{4}$/.test(codigo) ? codigo : null
  return permitido ? `falha na leitura do banco (código ${permitido})` : 'falha na leitura do banco (detalhes omitidos para não expor a conexão)'
}

// Execução explícita: só quando este arquivo é o ponto de entrada (mesmo padrão de scripts/dev-db.ts).
if (process.argv[1] && /(^|[\\/])varrer-vetores\.(ts|js)$/.test(process.argv[1])) {
  main().catch((erro: unknown) => {
    process.stderr.write(`varrer-vetores falhou: ${descreverErro(erro)}\n`)
    process.exitCode = 1
  })
}
