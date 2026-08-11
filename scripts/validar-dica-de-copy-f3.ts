/**
 * A dica de copy (F3, fatia B1) contra clientes REAIS — para dar para julgar a
 * qualidade do texto com o olho, que é a única medida que resta desde que os
 * vereditos automáticos foram desligados.
 *
 * ⚠️ **SOMENTE LEITURA.** Não escreve NADA no banco:
 *  - `montarDicasDeCopy` só lê (identidade da marca, perfil aprendido, base de
 *    conhecimento) e chama o modelo;
 *  - não chama `sugerirPosts`, que REGISTRA cada slot emitido como
 *    `LearningSignal` — os slots aqui são montados à mão, para a validação não
 *    sujar o corpus que ela está medindo (mesmo cuidado de
 *    `validar-cadencia-f2.ts`);
 *  - não grava plano, item, post nem Generation.
 *
 * O único efeito colateral fora do banco é o cache de resultados do RAG
 * (Redis), o mesmo de qualquer leitura da base. Por isso ele pode rodar contra
 * o `.env` (produção) sem guard de banco de dev.
 *
 * Custa: 1 chamada de `gpt-4o-mini` para a leva inteira + 1 de revisão
 * ortográfica por dica. Nenhum crédito é debitado (a dica é de graça por
 * contrato — só `executar-plano` gasta).
 *
 * USO
 *   npx tsx scripts/validar-dica-de-copy-f3.ts            # Wine Vix e By Rock
 *   npx tsx scripts/validar-dica-de-copy-f3.ts 6 2
 *   npx tsx scripts/validar-dica-de-copy-f3.ts --prompt   # mostra o prompt inteiro
 */
import 'dotenv/config'
import { db } from '@/lib/db'
import { taxonomiaAprovada } from '@/lib/aprendizado/pilares-service'
import {
  montarDicasDeCopy,
  montarPromptDeDica,
  prepararDica,
  quandoEmBRT,
  type PedidoDeDica,
} from '@/lib/planos/dica-de-copy'

/**
 * O par de sempre: Wine Vix (crivo quase todo conforme-no-sim) e By Rock (cheio
 * de reprova-no-sim). Um projeto só não mostra regressão — é a mesma dupla que
 * o crivo usa desde 11/08/2026.
 */
const PADRAO = [11, 7]

const MOSTRAR_PROMPT = process.argv.includes('--prompt')
const PROJETOS = process.argv
  .slice(2)
  .filter((a) => /^\d+$/.test(a))
  .map(Number)

/** Uma semana de slots plausível: quinta 19h, sexta 12h, sábado 19h, domingo 12h. */
function slotsDaSemana(): Date[] {
  const base = new Date()
  base.setUTCHours(0, 0, 0, 0)
  // 22:00 UTC = 19:00 BRT; 15:00 UTC = 12:00 BRT.
  return [
    new Date(base.getTime() + 2 * 86_400_000 + 22 * 3_600_000),
    new Date(base.getTime() + 3 * 86_400_000 + 15 * 3_600_000),
    new Date(base.getTime() + 4 * 86_400_000 + 22 * 3_600_000),
    new Date(base.getTime() + 5 * 86_400_000 + 15 * 3_600_000),
  ]
}

/**
 * Monta a leva do jeito que `propor-semana` (B2) vai montar: assunto vindo dos
 * pilares aprovados do PRÓPRIO cliente, formatos variados — e, de propósito,
 * uma peça sem tema nenhum (o cold start) e uma com pedido livre.
 */
async function levaDe(projectId: number): Promise<PedidoDeDica[]> {
  const pilares = await taxonomiaAprovada(projectId).catch(() => [])
  const temas = pilares.map((p) => p.nome)
  const quando = slotsDaSemana()
  const formatos: Array<PedidoDeDica['formato']> = ['story', 'feed', 'story', 'quadrado']

  return quando.map((data, i) => ({
    ref: `slot-${i + 1}`,
    // A última peça vai SEM tema: é o cold start, e é onde se vê se o modelo
    // usa o que a marca costuma publicar em vez de inventar um assunto.
    tema: i === quando.length - 1 ? null : (temas[i % Math.max(1, temas.length)] ?? null),
    quando: data,
    formato: formatos[i],
    observacao: i === 1 ? 'puxa o que a casa tem de mais forte nesse dia' : null,
  }))
}

/**
 * O prompt EXATO — montado pelos mesmos insumos do serviço (`prepararDica`),
 * nunca por uma reconstrução paralela, que envelheceria sozinha.
 */
async function mostrarPrompt(projectId: number, pedidos: PedidoDeDica[]): Promise<void> {
  const preparo = await prepararDica(projectId, pedidos)
  if (!preparo.insumos) {
    console.log('\n--- sem prompt: não deu para ler a identidade desta marca ---\n')
    return
  }
  console.log(`\n--- PROMPT (${preparo.entradas.length} entradas da base) ---`)
  console.log(montarPromptDeDica(preparo.insumos, pedidos, preparo.entradas))
  console.log('--- fim do prompt ---\n')
}

async function main() {
  const alvos = PROJETOS.length > 0 ? PROJETOS : PADRAO

  for (const projectId of alvos) {
    const projeto = await db.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true },
    })
    if (!projeto) {
      console.log(`\n=== projeto ${projectId} não existe ===`)
      continue
    }

    const pedidos = await levaDe(projectId)
    console.log(`\n${'='.repeat(78)}`)
    console.log(`${projeto.name} (projeto ${projeto.id}) — ${pedidos.length} peças`)
    console.log('='.repeat(78))

    if (MOSTRAR_PROMPT) await mostrarPrompt(projectId, pedidos)

    const inicio = Date.now()
    const resultado = await montarDicasDeCopy({ projectId, pedidos })
    const segundos = ((Date.now() - inicio) / 1000).toFixed(1)

    console.log(
      `versão ${resultado.versao} · ${resultado.dicas.length} com copy · ${resultado.semDica.length} sem · ${segundos}s${
        resultado.indisponivel ? ' · INDISPONÍVEL' : ''
      }`,
    )

    for (const pedido of pedidos) {
      const dica = resultado.dicas.find((d) => d.ref === pedido.ref)
      console.log(
        `\n  ▸ ${pedido.ref} · ${pedido.formato} · ${quandoEmBRT(pedido.quando)} · assunto: ${
          pedido.tema ?? '(livre)'
        }`,
      )
      if (pedido.observacao) console.log(`    pedido: ${pedido.observacao}`)
      if (!dica) {
        console.log('    (sem dica)')
        continue
      }
      for (const bloco of dica.blocos) console.log(`    │ ${bloco}`)
      if (dica.legenda) console.log(`    legenda: ${dica.legenda}`)
      if (dica.fontes.length > 0) console.log(`    fontes: ${dica.fontes.join(' · ')}`)
      for (const aviso of dica.avisos) console.log(`    ⚠ ${aviso}`)
      for (const s of dica.suspeitas) {
        console.log(`    ✎ "${s.trecho}" → "${s.sugestao}" (${s.motivo})`)
      }
    }

    if (resultado.avisos.length > 0) {
      console.log('\n  avisos da leva:')
      for (const aviso of resultado.avisos) console.log(`    ⚠ ${aviso}`)
    }
  }
}

main()
  .then(() => db.$disconnect())
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error(e)
    await db.$disconnect()
    process.exit(1)
  })
