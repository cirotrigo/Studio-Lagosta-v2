/**
 * Perfil MCP do principal: `normal` (o catálogo de sempre) ou `draft-only`
 * (H4 do Dot, 13/10/2026).
 *
 * `draft-only` é o perfil de um agente que opera sozinho e PARA NO RASCUNHO.
 * A garantia é mecânica, não de prompt. A porta só deixa existir, na lista e
 * na chamada, o que está em `TOOLS_DRAFT_ONLY`. O resto responde como
 * ferramenta desconhecida. As mutações permitidas recusam peça aprovada e
 * horário ocupado no próprio servidor.
 *
 * ALLOWLIST, não denylist: tool nova nasce PROIBIDA para o perfil até alguém
 * decidir incluí-la aqui. O manual (`operacao-dot.ts`) explica o que o agente
 * deve fazer; este módulo impede o que ele não pode, e um teste confere que os
 * dois não divergem grosseiramente.
 *
 * Puro (sem db): a porta e o validador do registro carregam sem env.
 */

import type { McpPrincipal } from '../oauth';

export type PerfilMcp = 'normal' | 'draft-only';

/**
 * O que o perfil `draft-only` enxerga e pode chamar, por nome CANÔNICO (o
 * apelido resolve antes, na porta). Leituras puras, a produção pela leva
 * (compor-leva, agendar-leva só rascunho) e o ajuste da peça própria
 * (ajustar-arte, com guarda de peça aprovada).
 */
export const TOOLS_DRAFT_ONLY: ReadonlySet<string> = new Set([
  // a rodada
  'auditar-operacao',
  'listar-clientes',
  'ver-agenda',
  // fontes da peça
  'consultar-dna',
  'consultar-voz',
  'consultar-base',
  'buscar-fotos',
  'listar-fotos-da-pasta',
  'ver-assinatura',
  'ver-ajustes-da-assinatura',
  'medir-copy',
  'ver-feedback-das-artes',
  // produção, sempre até rascunho
  'compor-leva',
  'ver-geracao',
  'agendar-leva',
  // revisão da peça própria
  'revisar-arte',
  'conferir-arte',
  'ajustar-arte',
]);

/** Os clientIds OAuth do perfil: lista separada por vírgula, cada id exato (sem substring), espaços aparados. */
export function clientesDraftOnly(
  valor: string | undefined = process.env.MCP_DRAFT_ONLY_CLIENT_IDS
): ReadonlySet<string> {
  return new Set(
    (valor ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
  );
}

/**
 * Só um principal de USUÁRIO OAuth, com `clientId` listado EXATAMENTE na env,
 * é `draft-only`. O principal de serviço nunca é. A env é lida a cada chamada,
 * nunca guardada no cache de tokens, então mudar a env vale na hora.
 */
export function perfilDoPrincipal(
  principal: McpPrincipal,
  valor?: string
): PerfilMcp {
  // O stdio em modo só-rascunho: o PROCESSO inteiro é draft-only, qualquer que seja o principal local (o de
  // serviço sem STUDIO_AUTOR, ou o usuário com clientId fixo). Sem isso as guardas das mutações permitidas não
  // rodavam ali (revisão do Codex, H4). Na Vercel a flag não existe; se alguém a puser, o erro é para o lado seguro.
  if (modoSoRascunhoLocal()) return 'draft-only';
  if (principal.kind !== 'user' || !principal.clientId) return 'normal';
  const ids =
    valor === undefined ? clientesDraftOnly() : clientesDraftOnly(valor);
  return ids.has(principal.clientId) ? 'draft-only' : 'normal';
}

/** A tool (nome canônico) existe para este perfil? */
export function toolNoPerfil(perfil: PerfilMcp, nomeCanonico: string): boolean {
  return perfil === 'normal' || TOOLS_DRAFT_ONLY.has(nomeCanonico);
}

// ── Servidor local (stdio) em modo só-rascunho ─────────────────────────────

/**
 * `STUDIO_SO_RASCUNHO=1` no ambiente do servidor stdio (`scripts/mcp-server.ts`):
 * o mesmo limite, para quem roda um agente local. Flag ausente: comportamento
 * de sempre. NÃO é configuração da Vercel: o perfil remoto vem do cliente
 * OAuth (`MCP_DRAFT_ONLY_CLIENT_IDS`).
 */
export function modoSoRascunhoLocal(
  valor: string | undefined = process.env.STUDIO_SO_RASCUNHO
): boolean {
  return valor?.trim() === '1';
}

/**
 * As tools INGLESAS do stdio que continuam registradas no modo só-rascunho:
 * só as de LEITURA. Allowlist: a inglesa nova nasce de fora. Ficam fora:
 * - as que publicam, apagam, falam com o Zernio ou mudam status
 *   (create-post aceita SCHEDULED, update-post, delete-posts,
 *   recover-stuck-post, sync-zernio-posts);
 * - as que escrevem fora do rascunho (render-story sobre qualquer post,
 *   create-template, create-page, upload-*, download-drive-image no disco);
 * - as que criam post sem a guarda de horário (plan-week);
 * - as que gravam fora da leva (create-arte-rapida, prepare-creative, que
 *   grava a sugestão do modelo).
 */
export const TOOLS_INGLESAS_SO_RASCUNHO: ReadonlySet<string> = new Set([
  'list-projects',
  'list-templates',
  'get-template-pages',
  'list-posts',
  'list-drive-images',
  'search-catalog',
  'get-image-thumbnail',
  'get-knowledge',
  'get-brand-assets',
]);

/** A tool do stdio (inglesa ou do catálogo) é registrada neste modo? */
export function registrarNoStdio(
  nome: string,
  origem: 'inglesa' | 'catalogo',
  soRascunho = modoSoRascunhoLocal()
): boolean {
  if (!soRascunho) return true;
  return origem === 'inglesa'
    ? TOOLS_INGLESAS_SO_RASCUNHO.has(nome)
    : TOOLS_DRAFT_ONLY.has(nome);
}
