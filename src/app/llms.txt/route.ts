import { categories } from '@/components/sales/planos'

// Resumo da agência para assistentes de IA (padrão llms.txt), gerado da MESMA
// lista de planos que a home mostra — preço muda num lugar só. Mesmo molde do
// /llms.txt do cirotrigo.com.br.
export const dynamic = 'force-static'

const SITE_URL = 'https://lagostacriativa.com.br'

export function GET() {
  const lines = [
    '# Lagosta Criativa',
    '',
    '> Marketing gastronômico para restaurantes em Vitória e no Espírito Santo: foto e vídeo, gestão de redes, atendimento com IA no WhatsApp e no Instagram, site com cardápio digital e tráfego pago.',
    '',
    'Atende restaurantes em Vitória e no Espírito Santo. Contato: contato@lagostacriativa.com.br · WhatsApp: https://wa.me/5527997578627 · Instagram: https://www.instagram.com/lagostacriativa/',
    'Fundador e responsável técnico: Ciro Trigo, fotógrafo em Vitória – ES desde 2010 (https://cirotrigo.com.br/sobre). CNPJ 21.339.876/0001-37.',
    '',
    '## Serviços e planos',
    ...categories.flatMap((cat) => [
      `- ${cat.label}: ${cat.description}`,
      ...cat.plans.map(
        (p) => `  - ${p.name}: ${[p.price, p.period].filter(Boolean).join(' ')}. ${p.description} Inclui: ${p.features.join('; ')}.`,
      ),
    ]),
    '',
    '## Links',
    `- [Site](${SITE_URL})`,
    `- [Planos](${SITE_URL}/#pricing)`,
    '- [Instagram](https://www.instagram.com/lagostacriativa/)',
    '- [Ciro Trigo](https://cirotrigo.com.br/sobre)',
    '',
  ]
  return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
