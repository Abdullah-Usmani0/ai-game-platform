import { baseConfig } from '@gg/config/eslint';
export default baseConfig({ browser: true, gluets: ['src/systems/**/*.ts', 'src/game.ts', 'src/entities.ts'] });
