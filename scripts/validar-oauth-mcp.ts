/**
 * Validação das regras PURAS do OAuth do conector MCP — roda no CI, SEM env.
 *
 *   npx tsx scripts/validar-oauth-mcp.ts
 *
 * Três seções, no molde de validar-registro-mcp.ts:
 *  A. Audiência (RFC 8707) — normalização, aceite e a recusa na porta; e o
 *     próprio IMPORT é metade do teste: oauth-regras.ts não pode tocar Prisma
 *     (@/lib/db lança sem DATABASE_URL), e um import estático pesado ali
 *     derruba este script na hora.
 *  B. PKCE — só S256; verifier trocado e challenge "plain" caem.
 *  C. Prazos — refresh de 30 dias renovado na rotação; NULO passa (token
 *     anterior à migração, que ganha prazo ao rotacionar).
 *
 * Sem banco, sem rede, sem custo. Qualquer falha sai com exit 1.
 */

import { createHash } from 'node:crypto'
import {
  ACCESS_TOKEN_TTL_MS,
  REFRESH_TOKEN_TTL_MS,
  audienciaConfere,
  audienciaEsperada,
  normalizarResource,
  prazoDoRefresh,
  refreshVencido,
  resourceAceito,
  verifyPkce,
} from '../src/lib/mcp/oauth-regras'

let falhas = 0
let passos = 0

function ok(nome: string) {
  passos += 1
  console.log(`  ✓ ${nome}`)
}

function falha(nome: string, detalhe?: string) {
  falhas += 1
  console.error(`  ✗ ${nome}${detalhe ? `\n      ${detalhe}` : ''}`)
}

function confere(nome: string, condicao: boolean, detalhe?: string) {
  if (condicao) ok(nome)
  else falha(nome, detalhe)
}

// ─────────────────────────────────────────────────────────────────────────
// A. Audiência (RFC 8707)
// ─────────────────────────────────────────────────────────────────────────

console.log('\nA. Audiência (RFC 8707)')

const ISSUER = 'https://studio.exemplo.com.br'
const ENDPOINT = `${ISSUER}/api/mcp`

confere('audienciaEsperada é o endpoint /api/mcp do issuer', audienciaEsperada(ISSUER) === ENDPOINT)
confere('issuer com barra final dá a mesma audiência', audienciaEsperada(`${ISSUER}/`) === ENDPOINT)

confere('resource exato é aceito', resourceAceito(ENDPOINT, ISSUER))
confere('barra final no resource é aceita', resourceAceito(`${ENDPOINT}/`, ISSUER))
confere(
  'host em maiúsculas é aceito (URL normaliza)',
  resourceAceito('https://STUDIO.exemplo.com.br/api/mcp', ISSUER),
)
confere(
  'porta default explícita é aceita (URL normaliza)',
  resourceAceito('https://studio.exemplo.com.br:443/api/mcp', ISSUER),
)

confere('outro host é recusado', !resourceAceito('https://outro.exemplo.com.br/api/mcp', ISSUER))
confere('outro caminho é recusado', !resourceAceito(`${ISSUER}/api/mcp2`, ISSUER))
confere('a raiz do issuer é recusada (o recurso é o endpoint, não o site)', !resourceAceito(ISSUER, ISSUER))
confere('fragmento é recusado (proibido pela RFC 8707)', !resourceAceito(`${ENDPOINT}#frag`, ISSUER))
confere('query é recusada (nenhum endpoint nosso tem)', !resourceAceito(`${ENDPOINT}?x=1`, ISSUER))
confere('esquema que não é http(s) é recusado', !resourceAceito('ftp://studio.exemplo.com.br/api/mcp', ISSUER))
confere('valor que não é URL é recusado', !resourceAceito('api/mcp', ISSUER))

confere('normalizarResource devolve null para URL inválida', normalizarResource('não é url') === null)
confere(
  'normalizarResource preserva porta não-default',
  normalizarResource('http://localhost:3000/api/mcp') === 'http://localhost:3000/api/mcp',
)

confere('audiência NULA passa (token anterior à migração)', audienciaConfere(null, ISSUER))
confere('audiência undefined passa', audienciaConfere(undefined, ISSUER))
confere('audiência igual ao endpoint passa', audienciaConfere(ENDPOINT, ISSUER))
confere(
  'audiência de OUTRO deploy é recusada',
  !audienciaConfere('https://outro.exemplo.com.br/api/mcp', ISSUER),
)
confere('audiência ilegível é recusada', !audienciaConfere('lixo-gravado', ISSUER))

// ─────────────────────────────────────────────────────────────────────────
// B. PKCE (só S256)
// ─────────────────────────────────────────────────────────────────────────

console.log('\nB. PKCE (só S256)')

const verifier = 'um-code-verifier-de-teste-suficientemente-longo'
const challenge = createHash('sha256').update(verifier).digest('base64url')

confere('challenge S256 correto confere', verifyPkce(verifier, challenge))
confere('verifier trocado não confere', !verifyPkce('outro-verifier-qualquer-igualmente-longo', challenge))
confere(
  'challenge "plain" (igual ao verifier) não confere — só S256 é aceito',
  !verifyPkce(verifier, verifier),
)

// ─────────────────────────────────────────────────────────────────────────
// C. Prazos
// ─────────────────────────────────────────────────────────────────────────

console.log('\nC. Prazos')

const agora = new Date('2026-08-25T12:00:00Z')

confere('access token vale 1 hora', ACCESS_TOKEN_TTL_MS === 60 * 60 * 1000)
confere('refresh token vale 30 dias', REFRESH_TOKEN_TTL_MS === 30 * 24 * 60 * 60 * 1000)
confere(
  'prazoDoRefresh = agora + 30 dias, exato',
  prazoDoRefresh(agora).getTime() === agora.getTime() + REFRESH_TOKEN_TTL_MS,
)

confere('prazo NULO não vence (token anterior à migração)', !refreshVencido(null, agora))
confere('prazo undefined não vence', !refreshVencido(undefined, agora))
confere('prazo no futuro não vence', !refreshVencido(new Date(agora.getTime() + 1000), agora))
confere('prazo no passado vence', refreshVencido(new Date(agora.getTime() - 1000), agora))
confere('prazo exatamente agora vence (limite fechado)', refreshVencido(agora, agora))

// ─────────────────────────────────────────────────────────────────────────

console.log(`\n${passos} verificações, ${falhas} falha(s)\n`)
if (falhas > 0) process.exit(1)
