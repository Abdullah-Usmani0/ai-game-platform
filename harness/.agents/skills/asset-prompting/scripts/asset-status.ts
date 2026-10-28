import { existsSync, readFileSync } from 'node:fs';
const req = existsSync('game/assets/requests.json') ? JSON.parse(readFileSync('game/assets/requests.json', 'utf8')) : { requests: [] };
const man = existsSync('game/assets/manifest.json') ? JSON.parse(readFileSync('game/assets/manifest.json', 'utf8')) : { assets: [] };
console.log(JSON.stringify({ requested: req.requests.length, delivered: man.assets.length, pending: req.requests.filter((r: { key: string }) => !man.assets.some((a: { key: string }) => a.key === r.key)).map((r: { key: string }) => r.key) }, null, 2));
