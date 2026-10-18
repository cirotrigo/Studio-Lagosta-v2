/**
 * O resultado do registro das fontes padrão NESTE processo (Montserrat empacotada + fallback genérico), escrito por
 * `garantirFontesPadrao` (canvas-renderer). Módulo à parte, sem o addon nativo, para quem só LÊ — a medida
 * (`familiasNaoCarregadas`, `medirCopyDoProjeto`) e a conferência de fontes do revisor/gate — não importar o renderer.
 *
 * `incompleto` = houve tentativa e faltou registro: aí nenhuma medida de texto vale (pode ter saído noutra fonte).
 * `nao-tentado` mantém o comportamento de antes (só o registro do napi-rs responde) — nos fluxos reais o
 * `registerProjectFonts` tenta antes de medir.
 */
let estado: 'nao-tentado' | 'completo' | 'incompleto' = 'nao-tentado'

export function marcarFontesPadrao(completo: boolean): void {
  estado = completo ? 'completo' : 'incompleto'
}

export function fontesPadraoIncompletas(): boolean {
  return estado === 'incompleto'
}
