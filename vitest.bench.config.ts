import { defineConfig } from 'vitest/config';

/** Эксперименты курсового этапа (раздел 10 ТЗ): npm run bench */
export default defineConfig({
  test: { include: ['bench/**/*.bench.ts'], environment: 'node', testTimeout: 600_000, fileParallelism: false },
});
