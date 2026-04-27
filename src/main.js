import { Game } from './game.js';
import { DebugMenu } from './debug-menu.js';

const canvas = document.getElementById('canvas');
const game = new Game(canvas);
new DebugMenu(game);

let last = performance.now();
function tick(now) {
  const dt = Math.min((now - last) / 1000, 1 / 30);
  last = now;
  game.update(dt);
  game.render();
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
