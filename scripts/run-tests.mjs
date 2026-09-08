import { execFileSync } from 'node:child_process'
import { readdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
rmSync('.test-build', { recursive: true, force: true })
execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.test.json'], { stdio: 'inherit' })
const tests = readdirSync('.test-build/lib/__tests__')
  .filter((file) => file.endsWith('.test.js'))
  .map((file) => `.test-build/lib/__tests__/${file}`)
execFileSync(process.execPath, ['--test', ...tests], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://test:test@127.0.0.1:1/watchlist_test',
    REDIS_URL: '',
  },
})
