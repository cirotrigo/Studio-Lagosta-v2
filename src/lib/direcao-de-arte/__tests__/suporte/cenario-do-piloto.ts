/**
 * O cenário da peça piloto para o compositor real: a assinatura, os números
 * estruturados do projeto, a foto anonimizada, as candidatas do véu e o
 * medidor calibrado nas caixas que o servidor mediu na peça.
 */
import { arquivosDaFixture, comArquivos, fixture, fotoReconstruida } from './fixture'
import type { CenarioDoCompositor } from './compositor'
import { medidor } from './medidor-do-piloto'

export async function cenarioDoPiloto(opcoes: { assuntoNoCatalogo?: boolean } = {}): Promise<{ cenario: CenarioDoCompositor; spec: Record<string, unknown> }> {
  const peca = fixture.peca()
  const assinatura = fixture.assinatura()
  const foto = fixture.foto()
  const arquivos = await arquivosDaFixture()
  return {
    spec: peca.spec,
    cenario: {
      projeto: { id: Number(peca.spec.projectId), assinatura: assinatura.numerosDoProjeto, logoDoProjeto: arquivos['fixture:logo-monograma'] },
      paginasDeAssinatura: [{ ...assinatura.pagina, layers: comArquivos(assinatura.pagina.layers, arquivos) }],
      foto: { url: arquivos['fixture:foto'], bytes: await fotoReconstruida() },
      candidatasDoVeu: fixture.marca().candidatasDoVeuNaBibliotecaAtual,
      catalogo: {
        driveFileId: String((peca.spec.foto as { driveFileId: string }).driveFileId),
        ...(opcoes.assuntoNoCatalogo ? { assunto: foto.assuntoAnotado.fracoesDaFoto } : {}),
      },
      medidor,
    },
  }
}
