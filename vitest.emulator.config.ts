import { defineConfig } from 'vitest/config'

// Testes que dependem do Firestore Emulator. Rode com `npm run test:emulator`.
export default defineConfig({
  test: {
    include: ['api/_lib/emulator/**/*.emulator.test.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
})
