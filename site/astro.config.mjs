// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://minzique.github.io',
  base: '/claude-code-re',
  outDir: '../docs',
  build: { assets: '_assets' },
});
