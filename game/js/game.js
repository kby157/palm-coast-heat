'use strict';
/* Palm Coast Heat — the game itself. Owns the loop, input, camera, the
   player state that ties the other modules together (cash, health, current
   car), crime bookkeeping for punches and thefts, the HUD and minimap,
   title / pause / banner screens, the localStorage save, and the ?demo=
   scenes used to take the entry screenshots. */

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const mini = document.getElementById('minimap').getContext('2d');
const el = (id) => document.getElementById(id);
const hud = { cash: el('cash'), health: el('healthfill'), vehicle: el('vehicle'),
              stars: el('stars'), objective: el('objective'),
              bustwrap: el('bustwrap'), bustfill: el('bustfill') };

let viewW = 1280, viewH = 800;
function resize() {
  viewW = canvas.width = window.innerWidth;
  viewH = canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- state
const SAVE_KEY = 'palm-coast-heat-v1';
const params = new URLSearchParams(location.search);
const demo = params.get('demo');

const G = {
  state: 'title',            // title | play | pause
  cash: 120,
  health: 100,
  car: null,                 // the car Jax is driving, or null on foot
  threatHot: 0,              // seconds peds stay scared of Jax
  regenWait: 0,
  bannerTimer: null,
  time: 0,
};

function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ cash: G.cash, storyIdx: Missions.storyIdx }));
  } catch (e) { /* private mode: play without saving */ }
}
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

// ---------------------------------------------------------------- world setup
Vehicles.spawnTraffic(12);
const storyCar = Vehicles.spawnParked();
People.spawnPeds(34);

const saved = demo ? null : loadSave();
if (saved) G.cash = saved.cash || G.cash;
Missions.init(storyCar, demo === 'chase' ? 1 : (saved ? saved.storyIdx : 0));

// Start on the sidewalk outside Marlo's Diner.
{
  const spot = World.doorstep(World.buildingNamed("Marlo's Diner"));
  PlayerBody.x = spot.x + 46; PlayerBody.y = spot.y + 30;
}

// ---------------------------------------------------------------- input
const keys = {};
let pressed = {};
window.addEventListener('keydown', (e) => {
  AudioSys.unlock();
  if (G.state === 'title') AudioSys.music(true);   // title loop starts on first gesture
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  if (!keys[e.key.toLowerCase()]) pressed[e.key.toLowerCase()] = true;
  keys[e.key.toLowerCase()] = true;
  if (e.key === 'Enter') {
    if (G.state === 'title') startPlay();
    else if (G.state === 'pause') togglePause();
  }
  if (e.key.toLowerCase() === 'p' && G.state !== 'title') togglePause();
  if (e.key.toLowerCase() === 'm') toggleMute();
  if (e.key.toLowerCase() === 'n' && G.state === 'pause') {
    try { localStorage.removeItem(SAVE_KEY); } catch (err) {}
    location.reload();
  }
});
window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
canvas.addEventListener('mousedown', () => { AudioSys.unlock(); if (G.state === 'title') startPlay(); });
el('mute').addEventListener('click', () => { AudioSys.unlock(); toggleMute(); });

function toggleMute() {
  const m = AudioSys.setMuted(!AudioSys.isMuted());
  el('mute').textContent = m ? 'Sound: off' : 'Sound: on';
}
function input() {
  return {
    up: !!(keys['w'] || keys['arrowup']), down: !!(keys['s'] || keys['arrowdown']),
    left: !!(keys['a'] || keys['arrowleft']), right: !!(keys['d'] || keys['arrowright']),
  };
}

function startPlay() {
  G.state = 'play';
  el('title-screen').classList.remove('on');
  AudioSys.music(false);
}
function togglePause() {
  if (G.state === 'play') { G.state = 'pause'; el('pause-screen').classList.add('on'); AudioSys.engine(false, 0, 0); AudioSys.siren(false); }
  else if (G.state === 'pause') { G.state = 'play'; el('pause-screen').classList.remove('on'); }
}

// ---------------------------------------------------------------- banners
function banner(title, sub, bad) {
  el('banner-title').textContent = title;
  el('banner-sub').textContent = sub || '';
  const scr = el('banner-screen');
  scr.classList.toggle('bad', !!bad);
  scr.classList.add('on');
  clearTimeout(G.bannerTimer);
  G.bannerTimer = setTimeout(() => scr.classList.remove('on'), 2900);
}

// ---------------------------------------------------------------- crime & contact
function witnessed(radius) {
  for (const p of People.peds) {
    if (Math.hypot(p.x - PlayerBody.x, p.y - PlayerBody.y) < radius) return true;
  }
  return Police.cruiserCount() > 0;
}
function actorPos() {
  return G.car ? { x: G.car.x, y: G.car.y } : { x: PlayerBody.x, y: PlayerBody.y };
}

function tryEnterExit() {
  if (G.car) {
    if (Math.hypot(G.car.vx, G.car.vy) > 70) return;      // not while rolling fast
    const car = G.car;
    PlayerBody.x = car.x + Math.cos(car.angle) * 26;
    PlayerBody.y = car.y + Math.sin(car.angle) * 26;
    PlayerBody.angle = car.angle;
    G.car = null;
    AudioSys.door();
    AudioSys.engine(false, 0, 0);
    return;
  }
  let best = null, bd = 46;
  for (const car of Vehicles.cars) {
    if (car.kind === 'police' || car.health <= 0) continue;
    const d = Math.hypot(car.x - PlayerBody.x, car.y - PlayerBody.y);
    if (d < bd) { bd = d; best = car; }
  }
  if (!best) return;
  if (best.kind === 'traffic') {
    // Yank the driver out: they become a very unhappy pedestrian.
    People.peds.push({ x: best.x + 14, y: best.y, angle: 0, speed: 0, state: 'flee',
      tx: best.x, ty: best.y, retarget: 3, shirt: '#c23b3b', skin: '#c68863', down: 0, panic: 4 });
    best.kind = 'parked';
  }
  if (!best.stolen) {
    best.stolen = true;
    Police.reportCrime(witnessed(210) ? 1.0 : 0.3);
    G.threatHot = 2;
  }
  G.car = best;
  best.vx = 0; best.vy = 0;
  AudioSys.door();
}

function tryPunch() {
  if (G.car || PlayerBody.punchCd > 0) return;
  PlayerBody.punchCd = 0.38;
  PlayerBody.punchAnim = 0.18;
  AudioSys.punch();
  const f = PlayerBody.fist();
  let hitSomething = false;
  for (const p of People.peds) {
    if (p.down <= 0 && Math.hypot(p.x - f.x, p.y - f.y) < f.r + 9) {
      p.down = 2.6; p.panic = 0; hitSomething = true;
    }
  }
  for (const car of Vehicles.cars) {
    if (Math.hypot(car.x - f.x, car.y - f.y) < f.r + 20) {
      Vehicles.damage(car, 4); hitSomething = true;
    }
  }
  if (hitSomething) {
    Police.reportCrime(witnessed(230) ? 0.7 : 0.15);
    G.threatHot = 2.5;
  }
}

// ---------------------------------------------------------------- penalties
function fineAmount() { return Math.min(G.cash, 120 + Police.stars() * 90); }
function busted() {
  const fine = fineAmount();
  G.cash -= fine;
  banner('BUSTED', 'The Palm Coast PD got you. Fine: $' + fine, true);
  AudioSys.busted();
  respawnAt('Palm Coast PD');
}
function wasted() {
  const bill = Math.min(G.cash, 150);
  G.cash -= bill;
  banner('WASTED', 'You wake up at Oceanview Clinic. Bill: $' + bill, true);
  AudioSys.busted();
  respawnAt('Oceanview Clinic');
}
function respawnAt(buildingName) {
  const spot = World.doorstep(World.buildingNamed(buildingName));
  G.car = null;
  PlayerBody.x = spot.x + 40; PlayerBody.y = spot.y + 26;
  G.health = 100;
  Police.clear();
  AudioSys.engine(false, 0, 0);
  AudioSys.siren(false);
  saveGame();
}

// ---------------------------------------------------------------- update
const missionHooks = {
  reward(m) {
    G.cash += m.reward;
    banner('JOB DONE', m.title + ' complete — +$' + m.reward);
    AudioSys.missionDone();
    saveGame();
  },
  fail(m) { banner('JOB FAILED', m.title + ' — the clock beat you. It will come around again.', true); },
  banner(t, s) { banner(t, s); },
  step() { AudioSys.pickup(); },
  setHeat(n) { Police.state.heat = Math.max(Police.state.heat, n); },
};

function update(dt) {
  G.time += dt;
  // Screenshot scenes drive themselves: a steady throttle, no steering.
  const inp = (demo === 'drive' || demo === 'chase')
    ? { up: true, down: false, left: false, right: false }
    : input();
  const pos = actorPos();

  if (pressed['e']) tryEnterExit();
  if (pressed['f']) tryPunch();

  let engineLoad = 0;
  if (G.car) {
    const before = G.car.health;
    engineLoad = Vehicles.drivePlayer(G.car, inp, dt);
    if (before - G.car.health > 6) {           // a hard crash hurts Jax too
      G.health -= (before - G.car.health) * 0.35;
      G.threatHot = Math.max(G.threatHot, 1);
    }
    PlayerBody.x = G.car.x; PlayerBody.y = G.car.y;
  } else {
    PlayerBody.update(dt, inp);
    // Getting clipped by a moving car hurts.
    for (const car of Vehicles.cars) {
      const sp = Math.hypot(car.vx, car.vy);
      if (sp > 70 && Math.hypot(car.x - PlayerBody.x, car.y - PlayerBody.y) < 21) {
        G.health -= 16;
        PlayerBody.x += car.vx * 0.05; PlayerBody.y += car.vy * 0.05;
        G.threatHot = 1.5;
      }
    }
  }

  for (const car of Vehicles.cars) {
    if (car.kind === 'traffic' && car !== G.car) Vehicles.updateTraffic(car, dt, pos);
  }

  G.threatHot = Math.max(0, G.threatHot - dt);
  const threat = { x: pos.x, y: pos.y,
    hot: G.threatHot > 0 || (G.car && Math.hypot(G.car.vx, G.car.vy) > 235) };
  for (const p of People.peds) People.updatePed(p, dt, threat);

  const events = [];
  Police.update(dt, actorPos(), G.car, events);
  for (const ev of events) {
    if (ev === 'busted' && !demo) busted();   // demo scenes never end mid-shot
    if (ev === 'escaped' && Police.stars() === 0) { /* heat fully cooled */ }
  }

  // Health regen once things are calm.
  if (Police.stars() === 0 && G.health > 0) G.health = Math.min(100, G.health + 1.6 * dt);
  if (G.health <= 0) { G.health = 0; wasted(); }

  Missions.update(dt, PlayerBody, G.car, missionHooks);

  // Audio follows the action.
  if (G.car) AudioSys.engine(true, engineLoad, Math.hypot(G.car.vx, G.car.vy) / G.car.model.top);
  else AudioSys.engine(false, 0, 0);
  AudioSys.siren(Police.stars() > 0 && Police.cruiserCount() > 0);

  pressed = {};
}

// ---------------------------------------------------------------- render
function camera() {
  const pos = actorPos();
  return {
    x: World.clamp(pos.x - viewW / 2, 0, Math.max(0, World.W - viewW)),
    y: World.clamp(pos.y - viewH / 2, 0, Math.max(0, World.H - viewH)),
    w: viewW, h: viewH,
  };
}

function drawObjectiveMarker(obj, cam, t) {
  if (obj.x === null || obj.x === undefined) return;
  const bob = Math.sin(t * 0.006) * 6;
  ctx.save();
  ctx.translate(obj.x, obj.y + bob);
  ctx.fillStyle = 'rgba(255,214,10,0.16)';
  ctx.fillRect(-7, -190, 14, 190);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = '#ffd60a';
  ctx.strokeStyle = '#7a5b00'; ctx.lineWidth = 2;
  const s = 13 + Math.sin(t * 0.006) * 2;
  ctx.fillRect(-s / 2, -s / 2, s, s); ctx.strokeRect(-s / 2, -s / 2, s, s);
  ctx.restore();
  // Off-screen direction arrow.
  const sx = obj.x - cam.x, sy = obj.y - cam.y;
  if (sx < 0 || sy < 0 || sx > viewW || sy > viewH) {
    const cx = World.clamp(sx, 30, viewW - 30), cy = World.clamp(sy, 30, viewH - 30);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.atan2(sy - cy, sx - cx));
    ctx.fillStyle = '#ffd60a';
    ctx.beginPath(); ctx.moveTo(13, 0); ctx.lineTo(-8, -8); ctx.lineTo(-8, 8); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

function render(t) {
  const cam = camera();
  ctx.save();
  ctx.translate(-cam.x, -cam.y);
  World.draw(ctx, cam, t);
  const obj = Missions.objective();
  drawObjectiveMarker(obj, cam, t);
  for (const car of Vehicles.cars) Vehicles.drawCar(ctx, car, t);
  People.drawPeds(ctx);
  if (!G.car) {
    People.drawPerson(ctx, PlayerBody.x, PlayerBody.y, PlayerBody.angle, '#ffd60a', '#c68863', false);
    if (PlayerBody.punchAnim > 0) {          // the swinging fist
      const f = PlayerBody.fist();
      ctx.fillStyle = '#c68863';
      ctx.beginPath(); ctx.arc(f.x, f.y, 5, 0, 7); ctx.fill();
    }
  }
  ctx.restore();

  if (G.state === 'title') {
    const g = ctx.createLinearGradient(0, 0, 0, viewH);
    g.addColorStop(0, 'rgba(255,120,80,0.20)');
    g.addColorStop(0.55, 'rgba(120,40,120,0.12)');
    g.addColorStop(1, 'rgba(4,6,14,0.25)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, viewW, viewH);
  }
  drawMinimap(obj);
  updateHud(obj);
}

function drawMinimap(obj) {
  const sx = 220 / World.W, sy = 165 / World.H;
  mini.fillStyle = '#101725'; mini.fillRect(0, 0, 220, 165);
  mini.fillStyle = '#2277aa'; mini.fillRect(World.WATER_X * sx, 0, (World.W - World.WATER_X) * sx, 165);
  mini.fillStyle = '#e3cf9e'; mini.fillRect(World.BEACH_X * sx, 0, (World.WATER_X - World.BEACH_X) * sx, 165);
  mini.strokeStyle = 'rgba(200,205,215,0.8)'; mini.lineWidth = 2;
  mini.beginPath();
  for (const ax of World.AVENUES) { mini.moveTo(ax * sx, 0); mini.lineTo(ax * sx, 165); }
  for (const sy2 of World.STREETS) { mini.moveTo(0, sy2 * sy); mini.lineTo(220, sy2 * sy); }
  mini.stroke();
  if (obj.x !== null && obj.x !== undefined) {
    mini.fillStyle = '#ffd60a';
    mini.save(); mini.translate(obj.x * sx, obj.y * sy); mini.rotate(Math.PI / 4);
    mini.fillRect(-4, -4, 8, 8); mini.restore();
  }
  const blink = Math.sin(performance.now() * 0.012) > 0;
  for (const c of Police.state.cruisers) {
    mini.fillStyle = blink ? '#ff4040' : '#4060ff';
    mini.beginPath(); mini.arc(c.x * sx, c.y * sy, 3.4, 0, 7); mini.fill();
  }
  const pos = actorPos();
  mini.save();
  mini.translate(pos.x * sx, pos.y * sy);
  mini.rotate(G.car ? G.car.angle : PlayerBody.angle);
  mini.fillStyle = '#ffffff';
  mini.beginPath(); mini.moveTo(0, -6); mini.lineTo(-4, 5); mini.lineTo(4, 5); mini.closePath(); mini.fill();
  mini.restore();
}

let lastHud = '';
function updateHud(obj) {
  const stars = Police.stars();
  const time = obj.time !== null && obj.time !== undefined ? Math.max(0, Math.ceil(obj.time)) : null;
  const key = [G.cash, Math.round(G.health), stars, obj.text, time,
               G.car ? G.car.model.name + ':' + Math.round(G.car.health) : 'foot',
               Math.round(Police.state.bust * 100)].join('|');
  if (key === lastHud) return;
  lastHud = key;
  hud.cash.textContent = '$' + G.cash;
  hud.health.style.width = Math.max(0, G.health) + '%';
  hud.vehicle.textContent = G.car
    ? G.car.model.name + ' — hull ' + Math.round(G.car.health) + '%'
    : 'On foot';
  hud.stars.innerHTML = '★★★★★'.split('').map((s, i) =>
    '<span class="' + (i < stars ? '' : 'off') + '">★</span>').join('');
  hud.objective.innerHTML = obj.text +
    (time !== null ? ' &nbsp;<span id="timer">' + Math.floor(time / 60) + ':' + String(time % 60).padStart(2, '0') + '</span>' : '');
  const showBust = Police.state.bust > 0.02;
  hud.bustwrap.style.display = showBust ? 'block' : 'none';
  if (showBust) hud.bustfill.style.width = (Police.state.bust * 100) + '%';
}

// ---------------------------------------------------------------- demo scenes
function setupDemo() {
  if (!demo) { el('title-screen').classList.add('on'); return; }
  G.state = 'play';
  Missions.beginImmediately();   // a live objective in every scene
  if (demo === 'title') {
    G.state = 'title';
    el('title-screen').classList.add('on');
    PlayerBody.x = 1500; PlayerBody.y = 900;
  } else if (demo === 'foot') {
    PlayerBody.x = storyCar.x + 42; PlayerBody.y = storyCar.y + 16;
    PlayerBody.angle = -Math.PI / 2;
  } else if (demo === 'drive') {
    const car = Vehicles.makeCar(4, World.AVENUES[2], 1500, 0, 'parked');
    car.stolen = true; car.angle = 0;   // facing north up the avenue
    G.car = car;
    PlayerBody.x = car.x; PlayerBody.y = car.y;
  } else if (demo === 'chase') {
    // In a Zephyr at Palm Mall with the package run about to start and the
    // PD already rolling: three stars, three cruisers on the minimap.
    // The first update completes the pickup step, so the timed delivery
    // step (and its countdown) is what the shot shows.
    const mall = World.buildingNamed('Palm Mall');
    const spot = World.doorstep(mall);
    const onAvenue = World.AVENUES.includes(spot.x);
    const heading = onAvenue ? 0 : Math.PI / 2;         // north, or east
    const fx = Math.sin(heading), fy = -Math.cos(heading);
    const car = Vehicles.makeCar(4, spot.x, spot.y, heading, 'parked');
    car.stolen = true;
    G.car = car;
    PlayerBody.x = car.x; PlayerBody.y = car.y;
    Police.state.heat = 3;
    Missions.beginImmediately();
    const behind = [[150, 26], [230, -30], [320, 44]];
    for (const [back, side] of behind) {
      const c = Vehicles.makeCar(1,
        car.x - fx * back - fy * side, car.y - fy * back + fx * side,
        heading, 'police');
      c.color = '#f2f2f2';
      Police.state.cruisers.push(c);
    }
  }
}
setupDemo();
if (G.state === 'title') AudioSys.music(false);   // starts on first gesture via unlock()

// ---------------------------------------------------------------- loop
let lastT = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - lastT) / 1000);
  lastT = now;
  if (G.state === 'play') update(dt);
  else pressed = {};
  render(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
