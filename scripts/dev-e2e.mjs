#!/usr/bin/env node
import { spawn } from 'node:child_process'

const env = {
  ...process.env,
  E2E_AUTH_BYPASS: '1',
  ADMIN_USER_IDS: process.env.ADMIN_USER_IDS || 'e2e-admin',
  NEXT_PUBLIC_E2E_TEST: '1',
  PORT: '3100',
}

const prisma = spawn('npx', ['prisma', 'generate'], {
  stdio: 'inherit',
  env,
})

prisma.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  if (code && code !== 0) {
    process.exit(code)
  }

  const dev = spawn('npx', ['next', 'dev', '--hostname', '127.0.0.1', '--port', env.PORT], {
    stdio: 'inherit',
    env,
  })

  dev.on('exit', (devCode, devSignal) => {
    if (devSignal) {
      process.kill(process.pid, devSignal)
      return
    }
    process.exit(devCode ?? 0)
  })
})
