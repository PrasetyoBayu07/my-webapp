// generator.js
import fs from 'fs-extra';
import path from 'path';

const TEMPLATE = path.join(process.cwd(), 'template');
const OUT = path.join(process.cwd(), 'generated');

const variations = [
  { name: 'red', speed: 200, sprite: 'assets/sprite_red.png', bg: 'assets/bg_red.png' },
  { name: 'blue', speed: 300, sprite: 'assets/sprite_blue.png', bg: 'assets/bg_blue.png' },
  { name: 'slow', speed: 120, sprite: 'assets/sprite_green.png', bg: 'assets/bg_green.png' }
];

async function run() {
  await fs.remove(OUT);
  await fs.ensureDir(OUT);

  for (const v of variations) {
    const dir = path.join(OUT, `game-${v.name}`);
    await fs.copy(TEMPLATE, dir);
    // write config injection file
    const config = {
      width: 800, height: 600,
      speed: v.speed,
      bg: v.bg,
      sprite: v.sprite
    };
    await fs.writeFile(path.join(dir, 'config.js'), `window.GAME_CONFIG = ${JSON.stringify(config, null, 2)};`, 'utf8');
    // inject config tag in index.html (simple)
    const indexPath = path.join(dir, 'index.html');
    let html = await fs.readFile(indexPath, 'utf8');
    html = html.replace('<script src="./main.js"></script>', `<script src="./config.js"></script>\n  <script src="./main.js"></script>`);
    await fs.writeFile(indexPath, html, 'utf8');
    console.log('Generated', dir);
  }
  console.log('All done.');
}

run().catch(console.error);
