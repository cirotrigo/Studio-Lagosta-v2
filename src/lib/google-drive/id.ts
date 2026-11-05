/** Id no formato do Drive. `root` (o Meu Drive) nunca vale. */
export function idDoDriveValido(id: unknown): id is string {
  return typeof id === 'string' && id !== 'root' && /^[A-Za-z0-9_-]{1,200}$/.test(id)
}
