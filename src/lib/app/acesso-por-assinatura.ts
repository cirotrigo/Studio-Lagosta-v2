/**
 * O layout protegido manda para `/subscribe` quem não tem assinatura ativa —
 * regra COMERCIAL, não de autorização (login e acesso a projetos seguem nas
 * suas próprias checagens, e nenhuma API exige assinatura).
 *
 * Com o Studio como ferramenta interna (cobrança desligada, `CREDITOS_APLICADOS`
 * fora), o acesso é por convite e ninguém assina plano: o redirecionamento só
 * vale com a cobrança ligada EXPLICITAMENTE. Desconhecido (configuração
 * carregando ou com falha) conta como desligado, como no resto da UI.
 */
export function deveIrParaAssinatura({
  cobrancaLigada,
  assinaturaAtiva,
  pathname,
}: {
  cobrancaLigada: boolean
  assinaturaAtiva: boolean
  pathname: string
}): boolean {
  if (!cobrancaLigada || assinaturaAtiva) return false
  return !['/subscribe', '/billing'].some((rota) => pathname.startsWith(rota))
}
