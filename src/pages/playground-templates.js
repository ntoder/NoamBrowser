// Starter projects for the Code Playground.
window.PG_TEMPLATES = [
  { id: 'hello', emoji: '👋', name: 'Hello, world!', desc: 'Your very first web page',
    html: `<h1>Hello, world! 👋</h1>
<p>This is my first web page.</p>
<p>Change these words and watch the page update!</p>
<button id="btn">Click me</button>`,
    css: `body {
  font-family: sans-serif;
  background: #fdf6ec;
  text-align: center;
  padding: 40px;
}

h1 {
  color: #6a55f5;
  font-size: 48px;
}

button {
  font-size: 20px;
  padding: 10px 24px;
  border: none;
  border-radius: 12px;
  background: #ee7a2e;
  color: white;
  cursor: pointer;
}`,
    js: `const btn = document.getElementById('btn');

btn.onclick = function () {
  btn.textContent = 'You clicked me! 🎉';
  console.log('The button was clicked');
};` },
  { id: 'counter', emoji: '🔢', name: 'Click counter', desc: 'Count clicks with a variable',
    html: `<div class="card">
  <h1 id="count">0</h1>
  <button id="plus">+1</button>
  <button id="minus">−1</button>
  <button id="reset">Reset</button>
</div>`,
    css: `body { font-family: system-ui, sans-serif; display: grid; place-items: center; height: 100vh; margin: 0; background: linear-gradient(135deg, #7c68fa, #e055a3); }
.card { background: white; padding: 30px 40px; border-radius: 24px; text-align: center; box-shadow: 0 20px 50px rgba(0,0,0,.25); }
h1 { font-size: 90px; margin: 0 0 10px; color: #3b2c85; }
button { font-size: 22px; padding: 10px 18px; margin: 4px; border: 0; border-radius: 12px; background: #f0eefa; cursor: pointer; }
button:active { transform: scale(.94); }`,
    js: `let count = 0;   // a variable remembers a number

const show = () => {
  document.getElementById('count').textContent = count;
};

document.getElementById('plus').onclick = () => { count = count + 1; show(); };
document.getElementById('minus').onclick = () => { count = count - 1; show(); };
document.getElementById('reset').onclick = () => { count = 0; show(); };` },
  { id: 'ball', emoji: '🏀', name: 'Bouncing ball', desc: 'Animation on a canvas',
    html: `<canvas id="game" width="600" height="400"></canvas>
<p>Click to change the colour!</p>`,
    css: `body { background: #1d1836; color: white; font-family: sans-serif; text-align: center; }
canvas { background: #2c2550; border-radius: 16px; max-width: 100%; }`,
    js: `const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

let x = 100, y = 100;      // where the ball is
let dx = 4, dy = 3;        // how fast it moves
let color = '#ffd84d';
const r = 25;              // the ball's size

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  x += dx; y += dy;
  if (x < r || x > canvas.width - r) dx = -dx;   // bounce off the sides
  if (y < r || y > canvas.height - r) dy = -dy;  // bounce off top and bottom

  requestAnimationFrame(draw);   // do it again next frame
}
draw();

canvas.onclick = () => {
  color = 'hsl(' + Math.random() * 360 + ', 90%, 60%)';
};` },
  { id: 'draw', emoji: '🎨', name: 'Drawing pad', desc: 'Draw with your mouse',
    html: `<div class="tools">
  <input type="color" id="color" value="#6a55f5">
  <input type="range" id="size" min="1" max="40" value="8">
  <button id="clear">Clear</button>
</div>
<canvas id="pad" width="800" height="500"></canvas>`,
    css: `body { margin: 0; font-family: sans-serif; background: #eee; text-align: center; }
.tools { padding: 10px; display: flex; gap: 10px; justify-content: center; align-items: center; }
canvas { background: white; border-radius: 12px; cursor: crosshair; max-width: 100%; touch-action: none; }`,
    js: `const pad = document.getElementById('pad');
const ctx = pad.getContext('2d');
let drawing = false;

pad.onpointerdown = (e) => { drawing = true; ctx.beginPath(); ctx.moveTo(e.offsetX, e.offsetY); };
pad.onpointerup = () => { drawing = false; };
pad.onpointermove = (e) => {
  if (!drawing) return;
  ctx.lineTo(e.offsetX, e.offsetY);
  ctx.strokeStyle = document.getElementById('color').value;
  ctx.lineWidth = document.getElementById('size').value;
  ctx.lineCap = 'round';
  ctx.stroke();
};
document.getElementById('clear').onclick = () => ctx.clearRect(0, 0, pad.width, pad.height);` },
  { id: 'guess', emoji: '🔮', name: 'Guess the number', desc: 'A game with if / else',
    html: `<h1>🔮 Guess my number</h1>
<p>I'm thinking of a number from 1 to 100.</p>
<input id="guess" type="number" min="1" max="100" placeholder="Your guess">
<button id="go">Guess!</button>
<p id="msg"></p>`,
    css: `body { font-family: system-ui, sans-serif; text-align: center; padding: 40px; background: #e8f4ff; }
input, button { font-size: 20px; padding: 8px 14px; border-radius: 10px; border: 2px solid #3e8deb; }
button { background: #3e8deb; color: white; cursor: pointer; }
#msg { font-size: 26px; font-weight: bold; }`,
    js: `const secret = Math.floor(Math.random() * 100) + 1;
let tries = 0;

document.getElementById('go').onclick = () => {
  const guess = Number(document.getElementById('guess').value);
  const msg = document.getElementById('msg');
  tries = tries + 1;

  if (guess === secret) {
    msg.textContent = '🎉 Yes! It was ' + secret + '. You took ' + tries + ' tries.';
  } else if (guess < secret) {
    msg.textContent = '⬆️ Higher!';
  } else {
    msg.textContent = '⬇️ Lower!';
  }
};` },
  { id: 'catch', emoji: '⭐', name: 'Catch the stars', desc: 'A real game with a score',
    html: `<div id="hud">Score: <b id="score">0</b> · Time: <b id="time">30</b></div>
<div id="sky"></div>`,
    css: `body { margin: 0; overflow: hidden; background: radial-gradient(#2c2550, #0d0a1f); color: white; font-family: system-ui, sans-serif; height: 100vh; }
#hud { position: fixed; top: 10px; left: 0; right: 0; text-align: center; font-size: 22px; z-index: 2; }
.star { position: absolute; font-size: 40px; cursor: pointer; user-select: none; transition: transform .1s; }
.star:active { transform: scale(1.6); }`,
    js: `let score = 0, time = 30;
const sky = document.getElementById('sky');

function addStar() {
  const s = document.createElement('div');
  s.className = 'star';
  s.textContent = Math.random() < 0.15 ? '🌟' : '⭐';
  s.style.left = Math.random() * (innerWidth - 50) + 'px';
  s.style.top = Math.random() * (innerHeight - 80) + 40 + 'px';
  s.onclick = () => {
    score += s.textContent === '🌟' ? 5 : 1;
    document.getElementById('score').textContent = score;
    s.remove();
  };
  sky.appendChild(s);
  setTimeout(() => s.remove(), 1500);   // stars disappear after 1.5 s
}

const starTimer = setInterval(addStar, 500);
const clock = setInterval(() => {
  time--;
  document.getElementById('time').textContent = time;
  if (time === 0) {
    clearInterval(starTimer); clearInterval(clock);
    sky.innerHTML = '<h1 style="text-align:center;margin-top:40vh">Game over! You scored ' + score + ' ⭐</h1>';
  }
}, 1000);` },
  { id: 'aboutme', emoji: '🪪', name: 'About me page', desc: 'Pictures, lists and links',
    html: `<header>
  <h1>Hi, I'm Noam! 👋</h1>
  <p>Welcome to my page.</p>
</header>
<main>
  <section>
    <h2>Things I like</h2>
    <ul>
      <li>🎮 Making games</li>
      <li>⚽ Football</li>
      <li>🍕 Pizza</li>
    </ul>
  </section>
  <section>
    <h2>My favourite website</h2>
    <a href="https://www.wikipedia.org" target="_blank">Wikipedia</a>
  </section>
</main>`,
    css: `body { margin: 0; font-family: system-ui, sans-serif; background: #f5f3ff; color: #1d1836; }
header { background: linear-gradient(120deg, #7c68fa, #3e8deb); color: white; padding: 40px; text-align: center; }
main { max-width: 700px; margin: 20px auto; display: grid; gap: 16px; padding: 0 16px; }
section { background: white; border-radius: 16px; padding: 16px 22px; box-shadow: 0 4px 14px rgba(0,0,0,.08); }
h2 { color: #6a55f5; margin-top: 0; }`,
    js: `// Try: show today's date at the bottom
const p = document.createElement('p');
p.textContent = 'Today is ' + new Date().toLocaleDateString();
p.style.textAlign = 'center';
document.body.appendChild(p);` },
  { id: 'blank', emoji: '📄', name: 'Blank page', desc: 'Start from nothing', html: '', css: '', js: '' },
];
