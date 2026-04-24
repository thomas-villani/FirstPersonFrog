import { Game } from './game.js';

const canvas = document.getElementById('canvas');
const game = new Game(canvas);

let last = performance.now();
function tick(now) {
  const dt = Math.min((now - last) / 1000, 1 / 30);
  last = now;
  game.update(dt);
  game.render();
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
