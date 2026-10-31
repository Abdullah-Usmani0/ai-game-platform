import { fileURLToPath } from 'node:url';
import { gameViteConfig } from '@gg/config/vite-game';
const root = fileURLToPath(new URL('.', import.meta.url));
export default gameViteConfig({ root, entry: 'src/main.ts' });
