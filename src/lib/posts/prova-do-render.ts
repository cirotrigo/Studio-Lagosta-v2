/**
 * A PROVA do render (B1d, checkpoint e): `PostRenderProof` = "estas camadas produziram ESTA mídia".
 *
 * Identidade: (post, URL confirmada pelo CAS do render canônico). Nasce na MESMA transação que confirma a mídia
 * (`render-post-art.ts`) e é append-only. A condição de envio que a exige mora em `later-scheduler.ts`
 * (`CONTRATO_PODE_SER_ENVIADO`).
 */
/** Versão do formato da prova. A migration a fixa por CHECK: uma versão 2 exige migration consciente. */
export const VERSAO_DA_PROVA = 1
