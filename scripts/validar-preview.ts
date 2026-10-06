import { assertPreviewDatabaseIsolation } from '../src/lib/preview-isolation'
import policy from '../src/lib/preview-database-policy.json'

try {
  assertPreviewDatabaseIsolation(process.env, policy)
  console.log('Preview: validação do destino do banco concluída; nenhuma conexão executada.')
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Preview isolado: validação falhou.')
  process.exitCode = 1
}
