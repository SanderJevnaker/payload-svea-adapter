import { defineConfig } from 'tsup'

export default defineConfig([
  // Main entry
  {
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    clean: true,
    sourcemap: true,
    external: ['react', 'next', 'payload', '@payloadcms/plugin-ecommerce'],
  },
  // Client entry
  {
    entry: ['src/client.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
    external: ['react', 'next', 'payload', '@payloadcms/plugin-ecommerce'],
  },
  // Handlers entry
  {
    entry: ['src/handlers/index.ts'],
    outDir: 'dist/handlers',
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
    external: ['react', 'next', 'payload', '@payloadcms/plugin-ecommerce'],
  },
  // Components entry
  {
    entry: ['src/components/index.ts'],
    outDir: 'dist/components',
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
    external: ['react', 'next', 'payload', '@payloadcms/plugin-ecommerce'],
    esbuildOptions(options) {
      options.banner = {
        js: '"use client";',
      }
    },
  },
  // Hooks entry
  {
    entry: ['src/hooks/index.ts'],
    outDir: 'dist/hooks',
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
    external: ['react', 'next', 'payload', '@payloadcms/plugin-ecommerce'],
    esbuildOptions(options) {
      options.banner = {
        js: '"use client";',
      }
    },
  },
])

