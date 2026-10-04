import { createHash } from 'node:crypto'
import { versaoIndexadaDe, type CamposIndexados } from './marca-de-indexado'

export const hashDoConteudo = (content: string) => createHash('sha256').update(content).digest('hex')
export const hashDaVersaoIndexada = (entry: CamposIndexados) => hashDoConteudo(versaoIndexadaDe(entry))
