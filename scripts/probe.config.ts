import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist-probe',
    emptyOutDir: true,
    lib: { entry: 'scripts/probe-entry.ts', formats: ['iife'], name: 'wn2ProbeBundle', fileName: () => 'probe.js' },
  },
});
