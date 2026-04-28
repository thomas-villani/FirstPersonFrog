import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/FirstPersonFrog/' : '/',
  server: {
    open: true,
  },
}));
