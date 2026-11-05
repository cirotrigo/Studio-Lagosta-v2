/**
 * O cenário da peça piloto para o compositor real: a assinatura, os números
 * estruturados do projeto, a foto anonimizada, as candidatas do véu e o
 * medidor calibrado nas caixas que o servidor mediu na peça.
 */
import { arquivosDaFixture, comArquivos, fixture, fotoReconstruida } from './fixture'
import type { CenarioDoCompositor } from './compositor'
import { medidor } from './medidor-do-piloto'

/**
 * `regiaoProtegidaNoCatalogo`: a vitrine entra no compositor pelo único
 * caminho que ele tem hoje para uma região a proteger — a caixa `assunto` do
 * catálogo da foto (é o nome do campo em produção, não uma afirmação de que a
 * vitrine é o assunto principal).
 */
export async function cenarioDoPiloto(opcoes: { regiaoProtegidaNoCatalogo?: boolean } = {}): Promise<{ cenario: CenarioDoCompositor; spec: Record<string, unknown> }> {
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
        ...(opcoes.regiaoProtegidaNoCatalogo ? { assunto: foto.regiaoProtegida.fracoesDaFoto } : {}),
      },
      medidor,
    },
  }
}
