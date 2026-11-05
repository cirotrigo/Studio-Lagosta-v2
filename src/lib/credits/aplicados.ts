/**
 * O Studio é ferramenta INTERNA: quem decide se uma operação roda é a
 * autorização (acesso ao projeto), nunca o saldo de créditos. O consumo segue
 * registrado (`UsageHistory` / `OrganizationUsage`), mas o saldo não bloqueia
 * nem é debitado.
 *
 * `CREDITOS_APLICADOS=true` religa a cobrança de antes, byte a byte. Lido a
 * CADA chamada (o teste troca o valor) e só no servidor: com o prefixo
 * `NEXT_PUBLIC_` ele seria embutido no build, e este módulo é importado ao lado
 * do cliente Prisma. O navegador recebe o valor por `/api/credits/settings`.
 */
export const creditosAplicados = () => process.env.CREDITOS_APLICADOS === 'true'
