/**
 * Semeia o ESTILO DE DESTAQUE de cada cliente em `Project.assinatura.destaque`
 * — o que o compositor usa quando a copy marca uma palavra com [colchetes] e
 * a página de assinatura não desenhou um destaque próprio.
 *
 *   npx tsx scripts/semear-destaque-da-marca.ts            # simulação (default)
 *   npx tsx scripts/semear-destaque-da-marca.ts --aplicar  # grava
 *
 * A cor saiu do que a EQUIPE já fazia à mão nas páginas com rich text da
 * carteira (levantado em 11/09/2026) e, onde não havia uso, das cores de
 * destaque lidas das peças aprovadas (`BrandDNA.estiloDasReferencias`) — sempre
 * uma cor da paleta cadastrada. `pesado: true` = a versão mais pesada da MESMA
 * família do papel entre as fontes cadastradas (Real: StageGrotesk Medium sobre
 * a Thin). Quem quiser outro destaque desenha na página de assinatura: a
 * página vence este valor.
 *
 * `alternativa`: a cor para o papel que JÁ É da cor de destaque — sem ela o
 * destaque some (medido em 11/09/2026: 8 dos 10 clientes têm papel da cor de
 * destaque em alguma variante de assinatura; ex. o CTA vermelho do Espeto).
 * Também da paleta. Quintal e Bacana não têm colisão e ficam sem.
 *
 * Mescla só a chave `destaque`: as outras chaves do JSON (geometria, mancha,
 * logo, halo legado) ficam intactas. O valor anterior sai impresso.
 */
import 'dotenv/config'

import { db } from '@/lib/db'

interface Semente {
  fill: string
  pesado: boolean
  alternativa?: string
  fonte: string
}

const SEMENTES: Record<number, Semente> = {
  1: { fill: '#EA5328', pesado: true, alternativa: '#F6F0E4', fonte: 'equipe: Spritz em StageGrotesk Medium sobre a Thin; alternativa Crema (pré-título laranja numa variante)' },
  2: { fill: '#547737', pesado: true, fonte: 'referências: verde nos destaques pontuais (palavras-chave/dias); paleta "verde"' },
  3: { fill: '#EF7B4F', pesado: true, alternativa: '#F8F2F0', fonte: 'equipe: salmão em Montserrat; alternativa Creme (manchete e CTA salmão)' },
  4: { fill: '#FAA61A', pesado: true, alternativa: '#FFFFFF', fonte: 'equipe: amarelo sobre Bonoco2023; alternativa branco (apoio e serviço amarelos)' },
  5: { fill: '#EF6A00', pesado: true, fonte: 'referências: palavra-chave em negrito forte e laranja; paleta "Laranja"' },
  6: { fill: '#F4301A', pesado: true, alternativa: '#FDC700', fonte: 'referências: palavra-chave em vermelho; alternativa Amarelo (pré-título, CTA e segunda voz vermelhos)' },
  7: { fill: '#dc0909', pesado: true, alternativa: '#FFFFFF', fonte: 'equipe: Metrisch Bold/ExtraBold; termos de oferta em vermelho; alternativa Branco (serviço e segunda voz vermelhos)' },
  8: { fill: '#FA5701', pesado: true, alternativa: '#FFB154', fonte: 'equipe: laranja sobre Coolvetica; alternativa Amarelo (pré-título, manchete e CTA laranja)' },
  11: { fill: '#FCE77B', pesado: true, alternativa: '#F9F7F2', fonte: 'equipe: amarelo da logo nos trechos; alternativa Creme Off-White (pré-título, manchete e CTA amarelos)' },
  12: { fill: '#CAB371', pesado: true, alternativa: '#FFFFFF', fonte: 'equipe: TrajanPro Bold e sépia; alternativa Branco (pré-título, manchete e apoio dourados)' },
}

async function main() {
  const aplicar = process.argv.includes('--aplicar')
  const projetos = await db.project.findMany({
    where: { id: { in: Object.keys(SEMENTES).map(Number) } },
    select: { id: true, name: true, assinatura: true },
    orderBy: { id: 'asc' },
  })
  for (const p of projetos) {
    const semente = SEMENTES[p.id]
    const atual = (p.assinatura && typeof p.assinatura === 'object' ? p.assinatura : {}) as Record<string, unknown>
    const antes = atual.destaque ?? null
    const depois = { fill: semente.fill, pesado: semente.pesado, ...(semente.alternativa ? { alternativa: semente.alternativa } : {}) }
    console.log(`${p.id} ${p.name}: destaque ${JSON.stringify(antes)} → ${JSON.stringify(depois)}  (${semente.fonte})`)
    if (aplicar) {
      await db.project.update({ where: { id: p.id }, data: { assinatura: { ...atual, destaque: depois } as never } })
    }
  }
  console.log(aplicar ? '\nGravado.' : '\nSimulação — nada gravado. Rode com --aplicar para gravar.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
