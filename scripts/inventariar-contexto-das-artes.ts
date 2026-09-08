/** Somente SELECTs. Não altera DNA, manual, assinatura nem consulta provedores de IA. */
import { writeFile } from 'node:fs/promises';
import { db } from '../src/lib/db';
import { loadBrandContext } from '../src/lib/brand/brand-context';
import { resolverContextoVisualDaGeracao } from '../src/lib/ai/contexto-visual-da-geracao';

async function main() {
  const saidaIndex = process.argv.indexOf('--saida');
  const saida = saidaIndex >= 0 ? process.argv[saidaIndex + 1] : undefined;
  if (saidaIndex >= 0 && (!saida || saida.startsWith('--')))
    throw new Error('--saida exige um caminho de arquivo');
  const projetos = await db.project.findMany({
    select: { id: true, name: true },
    orderBy: { id: 'asc' },
  });
  const inventario = [];
  for (const projeto of projetos) {
    const brand = await loadBrandContext(projeto.id);
    if (!brand) continue;
    const { resolucao } = resolverContextoVisualDaGeracao(brand);
    inventario.push({
      projeto: projeto.name,
      projectId: projeto.id,
      manualCadastrado: !!brand.brandManualUrl,
      logoCadastrada: !!brand.logoUrl,
      fontes: brand.fonts,
      coresCadastradas: brand.colors.length,
      estiloObservadoCadastrado: !!brand.estiloDasReferencias,
      resolucao,
    });
  }
  const relatorio = {
    observadoEm: new Date().toISOString(),
    escopo:
      'Cadastro de marca e contexto textual; não verifica disponibilidade dos arquivos ou flags publicados',
    projetos: inventario,
  };
  if (saida)
    await writeFile(saida, `${JSON.stringify(relatorio, null, 2)}\n`, 'utf8');
  console.log(
    JSON.stringify(
      {
        projetos: inventario.length,
        comAjustes: inventario.filter((p) => p.resolucao.ajustes.length).length,
        ajustes: inventario.map((p) => ({
          projeto: p.projeto,
          suprimidos: p.resolucao.ajustes.filter(
            (a) => a.decisao === 'suprimido'
          ).length,
          revisar: p.resolucao.ajustes.filter((a) => a.decisao === 'revisao')
            .length,
        })),
        ...(saida ? { arquivo: saida } : {}),
      },
      null,
      2
    )
  );
}

main()
  .catch(() => {
    console.error(
      'Inventário não concluído. Confira a conexão de leitura e o caminho de saída.'
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
