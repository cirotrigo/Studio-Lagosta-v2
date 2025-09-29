export class InsufficientCreditsError extends Error {
  constructor(
    public required: number,
    public available: number,
    message?: string
  ) {
    super(message || `Insufficient credits: required ${required}, available ${available}`)
    this.name = 'InsufficientCreditsError'
  }
}

