import { baseConfig } from '@gg/config/eslint';
export default baseConfig({ browser: true, ignores: ['.next/**', 'next-env.d.ts', 'public/**', 'scripts/**'] });
