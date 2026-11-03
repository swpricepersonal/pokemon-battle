import { defineConfig } from 'vite';

/**
 * Builds the app as a single IIFE with React loaded from a CDN as globals,
 * so scripts/build-artifact.mjs can inline it into one standalone HTML page.
 */
export default defineConfig({
  define: { 'import.meta.env.VITE_ARTIFACT': JSON.stringify('1') },
  esbuild: {
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    jsxInject: "import React from 'react'",
  },
  build: {
    outDir: 'dist-artifact',
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: { entry: 'src/main.tsx', name: 'BattleSim', formats: ['iife'], fileName: () => 'app.js' },
    rollupOptions: {
      external: ['react', 'react-dom', 'react-dom/client'],
      output: {
        globals: { react: 'React', 'react-dom': 'ReactDOM', 'react-dom/client': 'ReactDOM' },
        assetFileNames: 'app[extname]',
      },
    },
  },
});
