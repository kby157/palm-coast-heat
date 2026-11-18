'use strict';
/* People: Jax on foot (walking, punching, getting in and out of cars) and the
   pedestrians who stroll the sidewalks and run from trouble. */

const People = (() => {
  const rand = mulberry32(4451);
  const SHIRTS = ['#d87f4a', '#4a90d8', '#7bc47f', '#d84a6a', '#e8e3d8', '#8a6fb8', '#3fbfae', '#c2a24d'];
  const peds = [];

  function spawnPeds(n) {
    for (let i = 0; i < n; i++) {
      // Start on a sidewalk: near a random building's edge.
      const b = World.buildings[Math.floor(rand() * World.buildings.length)];
      peds.push({
        x: b.cx + (rand() - 0.5) * b.w, y: b.y - 16,
        angle: rand() * 6.28, speed: 0, state: 'walk',
        tx: 0, ty: 0, retarget: rand() * 4,
        shirt: SHIRTS[Math.floor(rand() * SHIRTS.length)],
        skin: ['#f2c79b', '#c68863', '#8a5a3b', '#6e4530'][Math.floor(rand() * 4)],
        down: 0, panic: 0,
      });
      const p = peds[peds.length - 1];
      p.tx = p.x; p.ty = p.y;
    }
  }

  // A sidewalk-ish wander target: a point just outside a random building.
  function newTarget(p) {
    const b = World.buildings[Math.floor(rand() * World.buildings.length)];
    const side = Math.floor(rand() * 4);
    if (side === 0) { p.tx = b.x + rand() * b.w; p.ty = b.y - 16; }
    else if (side === 1) { p.tx = b.x + rand() * b.w; p.ty = b.y + b.h + 16; }
    else if (side === 2) { p.tx = b.x - 16; p.ty = b.y + rand() * b.h; }
    else { p.tx = b.x + b.w + 16; p.ty = b.y + rand() * b.h; }
  }

  // threat: {x, y} something scary (a punch, a fast car, gunfire of horns).
  function updatePed(p, dt, threat) {
    if (p.down > 0) { p.down -= dt; return; }
    const dxT = threat.x - p.x, dyT = threat.y - p.y;
    const dThreat = Math.hypot(dxT, dyT);
    if (dThreat < 130 && threat.hot) p.panic = 2.2;
    if (p.panic > 0) {
      p.panic -= dt;
      const run = 215;
      p.x -= (dxT / (dThreat || 1)) * run * dt;
      p.y -= (dyT / (dThreat || 1)) * run * dt;
      p.angle = Math.atan2(-(dxT / (dThreat || 1)), (dyT / (dThreat || 1))) ;
      World.collideCircle(p, 9);
      return;
    }
    p.retarget -= dt;
    const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
    if (d < 14 || p.retarget <= 0) { newTarget(p); p.retarget = 6 + rand() * 8; return; }
    const sp = 62;
    p.x += (dx / d) * sp * dt;
    p.y += (dy / d) * sp * dt;
    p.angle = Math.atan2(dx, -dy);
    World.collideCircle(p, 9);
  }

  function drawPerson(ctx, x, y, angle, shirt, skin, down) {
    ctx.save();
    ctx.translate(x, y);
    if (down) ctx.rotate(Math.PI / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(1, 3, 8, 5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#2c3550';                       // legs
    ctx.fillRect(-4.5, 1, 3.6, 8); ctx.fillRect(1, 1, 3.6, 8);
    ctx.fillStyle = shirt;                           // torso
    ctx.beginPath(); ctx.arc(0, 0, 6.4, 0, 7); ctx.fill();
    ctx.fillStyle = skin;                            // head
    ctx.beginPath(); ctx.arc(0, -1.5, 3.6, 0, 7); ctx.fill();
    ctx.restore();
  }

  function drawPeds(ctx) {
    for (const p of peds) drawPerson(ctx, p.x, p.y, p.angle, p.shirt, p.skin, p.down > 0);
  }

  return { peds, spawnPeds, updatePed, drawPeds, drawPerson };
})();

// The player character, on foot. Game state (cash, car, wanted) lives in game.js;
// this is just the body: position, walking, and the punch.
const PlayerBody = {
  x: 340, y: 420, angle: 0, punchCd: 0, punchAnim: 0, moving: false,
  update(dt, input) {
    this.punchCd = Math.max(0, this.punchCd - dt);
    this.punchAnim = Math.max(0, this.punchAnim - dt);
    let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    this.moving = (mx !== 0 || my !== 0);
    if (this.moving) {
      const d = Math.hypot(mx, my);
      const sp = 178;
      this.x += (mx / d) * sp * dt;
      this.y += (my / d) * sp * dt;
      this.angle = Math.atan2(mx, -my);
      World.collideCircle(this, 10);
    }
  },
  // Punch origin and reach, used by game.js to see what got hit.
  fist() {
    return { x: this.x + Math.sin(this.angle) * 24, y: this.y - Math.cos(this.angle) * 24, r: 17 };
  },
};
