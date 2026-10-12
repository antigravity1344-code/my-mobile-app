import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
if (!process.env.APP004_SOURCE) throw Error('APP004_SOURCE must name the isolated combined checkout');
const source = resolve(process.env.APP004_SOURCE);
export default {
  root: here,
  resolve: { alias: {
    '@app': source,
    'vitest': join(source, 'node_modules/vitest/dist/index.js'),
    'expo-constants': join(here, 'review/expoMock.ts'),
    '@react-native-async-storage/async-storage': join(here, 'review/storageMock.ts'),
  } },
  server: { fs: { allow: [source, here] } },
  test: { environment: 'node', include: ['review/*.test.ts'], maxWorkers: 1, minWorkers: 1 },
};
