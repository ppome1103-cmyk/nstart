import { defineConfig } from 'vite';

// base를 상대경로로 두면 GitHub Pages 같은 하위 경로에서도 그대로 동작해요.
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1000 },
});
