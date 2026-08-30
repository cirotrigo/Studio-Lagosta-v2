/**
 * Mapa de contas do Windsor por cliente — v1, em código de propósito.
 *
 * Instagram NÃO precisa de mapa: a linha do Windsor traz `account_name`, que
 * é o próprio username, e casa com `Project.instagramUsername` no banco.
 * Anúncio e Google Meu Negócio não têm esse elo natural, e ids de conta são
 * estáveis (mudam quando um cliente entra/sai — evento raro, editado aqui com
 * revisão de código). Se um dia isso precisar ser editável pela UI, o caminho
 * é coluna no Project via migration à mão + db:deploy, nunca db push.
 *
 * Ids levantados do get_connectors do Windsor em 30/08/2026.
 */

/** Contas de Meta Ads ATIVAS para conferência (decisão do Ciro, 30/08/2026). */
export const ADS_POR_PROJETO: Array<{ projectId: number; nome: string; adsAccountId: string }> = [
  { projectId: 11, nome: 'Wine Vix', adsAccountId: '796355714508886' },
  { projectId: 7, nome: 'By Rock', adsAccountId: '598619278229852' },
  { projectId: 12, nome: 'Empório Fonseca', adsAccountId: '1563112241344037' },
]

/** Nome da conta de anúncio como o Windsor devolve → projeto. */
export const ADS_ACCOUNT_NAME_PARA_PROJETO: Record<string, { projectId: number; nome: string }> = {
  'Wine Vix': { projectId: 11, nome: 'Wine Vix' },
  'CA 1 - By Rock': { projectId: 7, nome: 'By Rock' },
  '01 | CA | Empório Fonseca (Principal)': { projectId: 12, nome: 'Empório Fonseca' },
}

/** Locais do Google Meu Negócio conectados → projeto. */
export const GMB_POR_PROJETO: Array<{ projectId: number; nome: string; locationId: string; accountName: string }> = [
  { projectId: 2, nome: 'O Quintal Parrilla', locationId: 'locations/8311173719700411208', accountName: 'O Quintal Parrilla Bar' },
  { projectId: 3, nome: 'TERO', locationId: 'locations/3090850519112572572', accountName: 'Tero Brasa e Vinho' },
  { projectId: 7, nome: 'By Rock', locationId: 'locations/10103204821192868952', accountName: 'By Rock Steakhouse' },
  { projectId: 6, nome: 'Espeto Gaúcho', locationId: 'locations/7265211222725397616', accountName: 'Espeto Gaúcho' },
]
