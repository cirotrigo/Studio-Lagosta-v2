import { API_BASE_URL } from './constants'

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
}

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  // Get cookies from Electron
  const cookies = await window.electronAPI.getCookies()

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  }

  // Add cookies if available
  if (cookies) {
    ;(headers as Record<string, string>)['Cookie'] = cookies
  }

  const config: RequestInit = {
    ...options,
    credentials: 'include',
    headers,
    body:
      options.body instanceof FormData
        ? options.body
        : options.body
          ? JSON.stringify(options.body)
          : undefined,
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, config)

  if (!response.ok) {
    let errorData
    try {
      errorData = await response.json()
    } catch {
      errorData = { message: response.statusText }
    }

    throw new ApiError(
      errorData.message || errorData.error || 'Erro na requisição',
      response.status,
      errorData
    )
  }

  // Handle empty responses
  const text = await response.text()
  if (!text) {
    return {} as T
  }

  try {
    return JSON.parse(text)
  } catch {
    return text as unknown as T
  }
}

export const api = {
  get: <T>(endpoint: string, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: 'GET' }),

  post: <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: 'POST', body }),

  put: <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: 'PUT', body }),

  patch: <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: 'PATCH', body }),

  delete: <T>(endpoint: string, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: 'DELETE' }),

  // For file uploads
  upload: async <T>(endpoint: string, formData: FormData): Promise<T> => {
    const cookies = await window.electronAPI.getCookies()

    const headers: HeadersInit = {}
    if (cookies) {
      headers['Cookie'] = cookies
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: formData,
    })

    if (!response.ok) {
      let errorData
      try {
        errorData = await response.json()
      } catch {
        errorData = { message: response.statusText }
      }
      throw new ApiError(
        errorData.message || 'Erro no upload',
        response.status,
        errorData
      )
    }

    return response.json()
  },

  // For streaming responses (AI caption generation)
  stream: async function* (
    endpoint: string,
    body?: unknown
  ): AsyncGenerator<string, void, unknown> {
    const cookies = await window.electronAPI.getCookies()

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    }
    if (cookies) {
      headers['Cookie'] = cookies
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })

    if (!response.ok) {
      let errorData
      try {
        errorData = await response.json()
      } catch {
        errorData = { message: response.statusText }
      }
      throw new ApiError(
        errorData.message || 'Erro na geração',
        response.status,
        errorData
      )
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('Stream not available')
    }

    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      yield decoder.decode(value, { stream: true })
    }
  },
}
