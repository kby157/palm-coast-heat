// Palm Coast Heat — make.fun entry program.
//
// The grader runs `node /bot/main.ts` with MAKEFUN_BOT_DIR pointing at this
// repository and MAKEFUN_OUTPUT_DIR at an empty output directory. All this
// program does is copy the game and its screenshots into the output and
// write the dossier the bounty grades, using the kit's own buildDossier so
// the bytes match what the gate rebuilds for itself.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = dirname(fileURLToPath(import.meta.url));
const botDir = process.env.MAKEFUN_BOT_DIR ?? here;
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? join(here, 'out');

mkdirSync(outDir, { recursive: true });
cpSync(join(botDir, 'game'), join(outDir, 'game'), { recursive: true });
const shots = join(botDir, 'screenshots');
if (existsSync(shots)) {
  cpSync(shots, join(outDir, 'screenshots'), { recursive: true });
}

const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log('dossier.json written to', outDir);
