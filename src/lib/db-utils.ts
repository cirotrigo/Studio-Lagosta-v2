/**
 * Database utilities for handling connection errors and retries
 */

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number
    delayMs?: number
    onRetry?: (attempt: number, error: Error) => void
  } = {}
): Promise<T> {
  const { maxRetries = 3, delayMs = 1000, onRetry } = options

  let lastError: Error | undefined

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error as Error

      // Check if error is retryable (connection errors)
      const errorMessage = lastError.message.toLowerCase()
      const isRetryable =
        errorMessage.includes('connection') ||
        errorMessage.includes('timeout') ||
        errorMessage.includes('econnrefused') ||
        errorMessage.includes('network') ||
        errorMessage.includes("can't reach database")

      if (!isRetryable || attempt === maxRetries) {
        throw lastError
      }

      // Call onRetry callback if provided
      if (onRetry) {
        onRetry(attempt, lastError)
      }

      // Wait with exponential backoff
      const delay = delayMs * Math.pow(2, attempt - 1)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw lastError
}

/**
 * Checks if the database is reachable
 * Useful for health checks
 */
export async function isDatabaseConnected(db: any): Promise<boolean> {
  try {
    await db.$queryRaw`SELECT 1`
    return true
  } catch {
    return false
  }
}
