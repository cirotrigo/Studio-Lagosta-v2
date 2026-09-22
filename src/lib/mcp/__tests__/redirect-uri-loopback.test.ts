import { describe, expect, it } from 'vitest'
import { redirectUriRegistrada } from '../oauth-regras'

const CODEX = 'http://127.0.0.1:52555/callback/5UeOj3_b_tMp'

describe('redirectUriRegistrada', () => {
  it('igualdade exata', () => {
    expect(redirectUriRegistrada(['https://claude.ai/api/mcp/auth_callback'], 'https://claude.ai/api/mcp/auth_callback'))
      .toBe('https://claude.ai/api/mcp/auth_callback')
  })

  it('o 127.0.0.1 que o Next trocou por localhost devolve o REGISTRADO', () => {
    expect(redirectUriRegistrada([CODEX], 'http://localhost:52555/callback/5UeOj3_b_tMp')).toBe(CODEX)
    expect(redirectUriRegistrada(['http://localhost:52555/callback/x'], 'http://[::1]:52555/callback/x')).toBe('http://localhost:52555/callback/x')
  })

  it('porta, caminho ou query diferentes não conferem', () => {
    expect(redirectUriRegistrada([CODEX], 'http://localhost:52556/callback/5UeOj3_b_tMp')).toBeNull()
    expect(redirectUriRegistrada([CODEX], 'http://localhost:52555/callback/outro')).toBeNull()
    expect(redirectUriRegistrada([CODEX], 'http://localhost:52555/callback/5UeOj3_b_tMp?x=1')).toBeNull()
  })

  it('a folga vale só para http loopback', () => {
    expect(redirectUriRegistrada([CODEX], 'https://localhost:52555/callback/5UeOj3_b_tMp')).toBeNull()
    expect(redirectUriRegistrada(['https://a.com/cb'], 'https://A.com/cb/')).toBeNull()
    expect(redirectUriRegistrada([CODEX], 'http://127.0.0.1.evil.com:52555/callback/5UeOj3_b_tMp')).toBeNull()
    expect(redirectUriRegistrada([CODEX], 'lixo')).toBeNull()
  })
})
