import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const peerjsVersion = JSON.parse(readFileSync(new URL('./node_modules/peerjs/package.json', import.meta.url))).version;

// base를 상대경로로 두면 GitHub Pages 같은 하위 경로에서도 그대로 동작해요.
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1000 },
  define: { __PEERJS_VERSION__: JSON.stringify(peerjsVersion) },
});
