/**
 * A MEDIDA DE PARTIDA da qualidade da copy (PR 15 de "Marca simples, copy
 * melhor", 12/09/2026): a mesma medida do relatório de domingo, por cliente,
 * numa janela de datas — para comparar "antes" e "depois" das mudanças da F1
 * à F5 sem esperar domingos.
 *
 * SOMENTE LEITURA, SEMPRE: não há modo de escrita. Cada cliente é lido numa
 * transação PRÓPRIA `SET TRANSACTION READ ONLY` (o executor do serviço) — uma
 * escrita acidental é recusada pelo próprio Postgres, e um erro num cliente não
 * envenena a transação dos seguintes (C15-04). O esquema (`Page.copyAutoral`,
 * `BrandVoice`) é conferido antes por `information_schema`: rodar antes de a
 * pilha chegar à produção mede o que dá e DIZ o que falta.
 *
 * 🔴 **Recusa a PRODUÇÃO** a menos que venha `--producao-somente-leitura`. A
 * produção é reconhecida pelo COMPUTE do Neon (o primeiro rótulo do host, sem
 * `-pooler`, EM MINÚSCULAS — o DNS não distingue caixa), comparado com o `.env`
 * — nunca pelo nome do branch (`scripts/lib/guarda-de-producao.ts`). E o guard
 * FALHA FECHADO: sem `.env` legível (worktree sem o symlink), não há como
 * saber se o banco é a produção, e o script não roda.
 *
 * Uso (branch de dev, pelo runner que recusa produção):
 *   npx tsx scripts/dev-db.ts npx tsx scripts/medir-qualidade-da-copy.ts
 *   npx tsx scripts/dev-db.ts npx tsx scripts/medir-qualidade-da-copy.ts --desde 2026-08-01 --ate 2026-09-12 --projeto 6
 *   … --json            (a medida inteira, por cliente e da carteira)
 *
 * Em produção (só com decisão explícita): com a flag, e sem `DATABASE_URL` no
 * ambiente, o script lê a URL do `.env` (o `tsx` não carrega arquivo nenhum):
 *   npx tsx scripts/medir-qualidade-da-copy.ts --producao-somente-leitura --desde 2026-09-01
 *
 * Sem datas: a última semana COMPLETA (seg–dom, BRT).
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { bancoDaLeitura, type UrlsDoEnv } from './lib/guarda-de-producao'

const args = process.argv.slice(2)
const flag = (nome: string) => args.includes(nome)
const valor = (nome: string) => {
  const i = args.indexOf(nome)
  return i >= 0 ? args[i + 1] : undefined
}

function urlsDoEnv(): UrlsDoEnv | null {
  const arquivo = resolve(process.cwd(), '.env')
  if (!existsSync(arquivo)) return null
  const urls: UrlsDoEnv = {}
  for (const linha of readFileSync(arquivo, 'utf8').split('\n')) {
    const m = linha.trim().match(/^(DATABASE_URL|DIRECT_URL)=(.*)$/)
    if (m) urls[m[1] as keyof UrlsDoEnv] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return urls
}

function sair(mensagem: string): never {
  console.error(`\n✗ ${mensagem}\n`)
  process.exit(1)
}

/** Meia-noite BRT de uma data AAAA-MM-DD (instante UTC). */
function meiaNoiteBrt(data: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) sair(`data inválida: ${data} (use AAAA-MM-DD)`)
  return new Date(`${data}T03:00:00.000Z`)
}

async function main() {
  const doEnv = urlsDoEnv()
  if (doEnv && !process.env.DATABASE_URL && flag('--producao-somente-leitura')) {
    for (const chave of ['DATABASE_URL', 'DIRECT_URL'] as const) if (doEnv[chave]) process.env[chave] = doEnv[chave]
  }
  // O compute em minúsculas, dos dois lados: `EP-PROD-…` é a produção (`scripts/lib/guarda-de-producao.ts`).
  const banco = bancoDaLeitura(doEnv, process.env.DATABASE_URL)
  if (banco.ok === false) {
    sair(
      banco.motivo === 'sem-env'
        ? 'não há .env legível: sem ele não dá para saber se o banco é a PRODUÇÃO, e o guard falha fechado. Rode na raiz do repositório (ou com o symlink do .env no worktree).'
        : 'DATABASE_URL ausente ou ilegível.',
    )
  }
  const { compute, ehProducao } = banco
  if (ehProducao && !flag('--producao-somente-leitura')) {
    sair(`o banco resolvido (${compute}) é a PRODUÇÃO. Para medir no branch de dev: npx tsx scripts/dev-db.ts npx tsx scripts/medir-qualidade-da-copy.ts … — para a produção, só com --producao-somente-leitura.`)
  }

  const { db } = await import('../src/lib/db')
  const { janelaDaSemanaAnterior } = await import('../src/lib/relatorios/semanal')
  const { executarEmLeitura, medirQualidadeDaCarteira } = await import('../src/lib/relatorios/qualidade-da-copy')
  const { blocoDaQualidadeDaCopy, linhaDaCopyDoCliente } = await import('../src/lib/relatorios/qualidade-da-copy-contrato')

  const semana = janelaDaSemanaAnterior(new Date())
  const inicio = valor('--desde') ? meiaNoiteBrt(valor('--desde')!) : semana.inicio
  // `--ate` é INCLUSIVO: a janela vai até a meia-noite BRT do dia seguinte.
  const fim = valor('--ate') ? new Date(meiaNoiteBrt(valor('--ate')!).getTime() + 24 * 3600_000) : semana.fim
  if (fim <= inicio) sair('--ate é anterior a --desde.')
  const projeto = valor('--projeto') ? Number(valor('--projeto')) : null

  console.log(`[medir-qualidade-da-copy] banco ${compute} (${ehProducao ? 'PRODUÇÃO — somente leitura' : 'não-produção'}) · ${inicio.toISOString()} → ${fim.toISOString()}${projeto ? ` · projeto ${projeto}` : ''}`)

  // A lista de clientes também sai de uma transação READ ONLY; cada cliente
  // é medido na SUA (o executor padrão do serviço).
  const clientes = await executarEmLeitura(
    (leitor) =>
      leitor.project.findMany({
        where: projeto ? { id: projeto } : { status: 'ACTIVE' },
        select: { id: true, name: true },
        orderBy: { id: 'asc' },
      }),
    { tetoMs: 30_000 },
  )
  // Sem o relógio do cron: a janela do script pode ser longa; o teto por cliente continua.
  const resultado = await medirQualidadeDaCarteira(
    clientes.map((c) => ({ projectId: c.id, nome: c.name })),
    { inicio, fim },
    { prazo: Date.now() + 15 * 60_000, tetoPorClienteMs: 120_000 },
  )

  if (flag('--json')) {
    console.log(JSON.stringify({ janela: { inicio, fim }, carteira: resultado.carteira, clientes: [...resultado.porCliente.values()].map(({ medidas: _m, ...r }) => r) }, null, 2))
  } else {
    for (const r of resultado.porCliente.values()) {
      const linha = linhaDaCopyDoCliente(r.qualidade)
      console.log(`\n${r.nome} (${r.projectId})${r.indisponivel ? ` — indisponível: ${r.indisponivel}` : ''}`)
      if (linha) console.log(linha)
      else if (!r.indisponivel) console.log('  copy: nenhuma peça na janela')
      for (const a of r.avisos) console.log(`  ⚠️ ${a}`)
    }
    console.log(blocoDaQualidadeDaCopy(resultado.bloco) ?? '\n(sem peças na janela)')
  }
  await db.$disconnect()
}

main().catch((erro) => {
  console.error(erro)
  process.exit(1)
})
