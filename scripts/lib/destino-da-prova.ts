/**
 * O destino de TODA conexão que uma prova de integração abre no banco de DEV (R12-10, 3ª FINAL do Codex sobre
 * 7b7e90e1). Sem Prisma e sem importar módulo do app: roda ANTES de o ambiente existir.
 *
 * A guarda antiga conferia só o `DATABASE_URL`, e as conexões auxiliares da prova (o "dono" e o "vigia" do passo
 * 21) usavam o `DIRECT_URL` — que vinha HERDADO do `.env` (produção), ou do ambiente do processo, quando o arquivo
 * de dev não o definia. Regra: a conexão auxiliar passa pela MESMA guarda de destino que o `db`.
 *
 * - As duas URLs de banco saem SÓ do `.env.development.local`; nada é herdado do `.env` nem do processo, e o
 *   `ambiente` devolvido as sobrescreve.
 * - As duas têm de ser o MESMO banco de dev: mesmo compute E mesmo nome de banco (a regra de `mesmoBanco` da
 *   migração da voz, PR13-16), fora de qualquer compute de produção.
 * - `DIRECT_URL` ausente no dev ABORTA com a instrução, em vez de ser derivada do `DATABASE_URL`: o runner
 *   `scripts/dev-db.ts` já recusa rodar sem as duas e o `db:dev:setup` escreve as duas — derivar seria adivinhar o
 *   formato de URL do provedor, e uma prova não adivinha para onde escreve.
 */

export const CHAVES_DE_BANCO = ['DATABASE_URL', 'DIRECT_URL'] as const

/**
 * O compute de uma URL do Neon (`ep-x-pooler.…` e `ep-x.…` são a mesma instância); `null` quando ilegível. Em
 * minúsculas: `postgresql:` é esquema NÃO especial e o `new URL` preserva a caixa do host, mas o DNS não a
 * distingue — `EP-PROD…` conecta na produção e, comparado como string, passaria por dev (a lição do PR13-49).
 */
export function computeDe(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.toLowerCase().split('.')[0].replace(/-pooler$/, '') || null
  } catch {
    return null
  }
}

/** O NOME do banco na URL (`/neondb`), sem query; `null` quando ilegível ou ausente. */
export function nomeDoBancoDe(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, '')) || null
  } catch {
    return null
  }
}

export interface DestinoDaProvaDeDev {
  /** O compute de dev (sem `-pooler`). */
  compute: string
  /** O `db` da aplicação. */
  databaseUrl: string
  /** As conexões auxiliares da prova — nunca `process.env.DIRECT_URL` direto. */
  directUrl: string
  /** O que a prova aplica ao `process.env`: as chaves do `.env` que o processo não tem, e as de banco SÓ do dev. */
  ambiente: Record<string, string>
}

export type ResultadoDoDestino = { ok: true; destino: DestinoDaProvaDeDev } | { ok: false; titulo: string; linhas: string[] }

export function destinoDaProvaDeDev(entrada: { prod: Record<string, string>; dev: Record<string, string>; processo: Record<string, string | undefined> }): ResultadoDoDestino {
  const { prod, dev, processo } = entrada
  const producao = new Set(CHAVES_DE_BANCO.map((k) => computeDe(prod[k])).filter((c): c is string => c !== null))
  if (producao.size === 0) {
    return { ok: false, titulo: 'o .env não tem DATABASE_URL/DIRECT_URL reconhecível: não dá para saber qual compute é PRODUÇÃO.', linhas: [] }
  }
  const faltando = CHAVES_DE_BANCO.filter((k) => !dev[k])
  if (faltando.length > 0) {
    return {
      ok: false,
      titulo: `.env.development.local não define ${faltando.join(' nem ')}.`,
      linhas: [
        'A prova não herda URL de banco do .env (PRODUÇÃO) nem do ambiente do processo: as duas têm de estar no arquivo de dev.',
        'Rode  npm run db:dev:setup  ou preencha as duas URLs do branch à mão (a DIRECT_URL é a do branch sem "-pooler" no host).',
      ],
    }
  }
  for (const k of CHAVES_DE_BANCO) {
    const c = computeDe(dev[k])
    if (!c) return { ok: false, titulo: `${k} do .env.development.local não é uma URL legível.`, linhas: [] }
    if (producao.has(c)) return { ok: false, titulo: 'O banco resolvido é o de PRODUÇÃO.', linhas: [`${k} do .env.development.local aponta para ${c}.`] }
  }
  const compute = computeDe(dev.DATABASE_URL)!
  const banco = nomeDoBancoDe(dev.DATABASE_URL)
  if (computeDe(dev.DIRECT_URL) !== compute || !banco || nomeDoBancoDe(dev.DIRECT_URL) !== banco) {
    return {
      ok: false,
      titulo: 'DATABASE_URL e DIRECT_URL do .env.development.local não são o MESMO banco.',
      linhas: [`DATABASE_URL: ${compute}/${banco ?? '?'}; DIRECT_URL: ${computeDe(dev.DIRECT_URL)}/${nomeDoBancoDe(dev.DIRECT_URL) ?? '?'}. As conexões auxiliares da prova têm de ver o que o db vê.`],
    }
  }
  const ambiente: Record<string, string> = {}
  for (const [k, v] of Object.entries(prod)) if (!(CHAVES_DE_BANCO as readonly string[]).includes(k) && !(k in processo)) ambiente[k] = v
  ambiente.DATABASE_URL = dev.DATABASE_URL
  ambiente.DIRECT_URL = dev.DIRECT_URL
  return { ok: true, destino: { compute, databaseUrl: dev.DATABASE_URL, directUrl: dev.DIRECT_URL, ambiente } }
}
