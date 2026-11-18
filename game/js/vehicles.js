'use strict';
/* Cars: the six models on Palm Coast's streets, the parked fleet, wandering
   traffic that follows the road grid, and the arcade driving model the
   player uses (acceleration, drift, collisions, damage). Police cars are
   built here too but driven by police.js. */

const Vehicles = (() => {
  const MODELS = [
    { name: 'Comet',   w: 24, l: 46, top: 335, accel: 300, grip: 5.2, colors: ['#d64541', '#3f7fbf', '#e8b13c', '#59b06a'] },
    { name: 'Voyager', w: 27, l: 52, top: 285, accel: 240, grip: 4.6, colors: ['#7a4fa3', '#bfbfbf', '#2e6f6a', '#8c3b2e'] },
    { name: 'Bantam',  w: 22, l: 40, top: 260, accel: 230, grip: 5.6, colors: ['#e8e3d8', '#69a7d8', '#d87fb0', '#4d4d4d'] },
    { name: 'Hauler',  w: 28, l: 58, top: 245, accel: 200, grip: 4.2, colors: ['#c96a2c', '#5b7a99', '#777d84', '#946b54'] },
    { name: 'Zephyr',  w: 23, l: 44, top: 360, accel: 330, grip: 5.8, colors: ['#f2f2f2', '#22242a', '#c22f6d', '#2fa39a'] },
    { name: 'Mule',    w: 26, l: 50, top: 270, accel: 215, grip: 4.4, colors: ['#a08c4a', '#6a8caf', '#7fbf5a', '#b0524a'] },
  ];
  const rand = mulberry32(77003);
  const cars = [];
  let nextId = 1;

  function makeCar(modelIdx, x, y, angle, kind) {
    const m = MODELS[modelIdx];
    const car = {
      id: nextId++, model: m, modelIdx, x, y, angle,
      vx: 0, vy: 0, speed: 0, health: 100, kind,           // parked | traffic | police
      color: kind === 'police' ? '#f4f4f4' : m.colors[Math.floor(rand() * m.colors.length)],
      // traffic route state
      axis: 'v', fixed: 0, dir: 1, target: 0, cruise: 120 + rand() * 60,
      sirenPhase: rand() * 6,
    };
    cars.push(car);
    return car;
  }

  // Lane offset for right-hand traffic on a road centred at c.
  function laneV(avenueX, dir) { return avenueX + (dir < 0 ? 27 : -27); }   // dir -1 = north
  function laneH(streetY, dir) { return streetY + (dir > 0 ? 27 : -27); }   // dir +1 = east

  function startRoute(car) {
    // Put the car on the nearest avenue, heading to a far intersection.
    let best = World.AVENUES[0], bd = 1e9;
    for (const ax of World.AVENUES) { const d = Math.abs(ax - car.x); if (d < bd) { bd = d; best = ax; } }
    car.axis = 'v'; car.dir = rand() < 0.5 ? 1 : -1;
    car.fixed = best; car.x = laneV(best, car.dir);
    car.target = car.dir > 0 ? World.H - 80 : 80;
    car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  }

  function spawnTraffic(n) {
    for (let i = 0; i < n; i++) {
      const ax = World.AVENUES[Math.floor(rand() * World.AVENUES.length)];
      const sy = World.STREETS[Math.floor(rand() * World.STREETS.length)];
      const car = makeCar(Math.floor(rand() * MODELS.length),
        ax + (rand() - 0.5) * 30, sy + (rand() - 0.5) * 900, 0, 'traffic');
      startRoute(car);
    }
  }

  function spawnParked() {
    // Cars waiting in the parking lots and along the beach road.
    for (const b of World.buildings) {
      if (!b.lot) continue;
      const n = 2 + Math.floor(rand() * 3);
      for (let i = 0; i < n; i++) {
        const car = makeCar(Math.floor(rand() * MODELS.length),
          b.x + 30 + i * 46, b.y + b.h / 2, Math.PI / 2, 'parked');
        car.angle = rand() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
      }
    }
    for (let i = 0; i < 6; i++) {
      const car = makeCar(Math.floor(rand() * MODELS.length),
        World.AVENUES[4] - 20, 200 + i * 360, Math.PI / 2, 'parked');
      car.angle = Math.PI / 2;
    }
    // The story car: a teal Comet parked outside Marlo's Diner.
    const diner = World.buildingNamed("Marlo's Diner");
    const spot = World.doorstep(diner);
    const comet = makeCar(0, spot.x - 34, spot.y + 10, 0, 'parked');
    comet.color = '#19b8a6'; comet.storyCar = true;
    return comet;
  }

  // ---- shared motion -------------------------------------------------------
  // Move a car kinematically, collide with the world and other cars.
  function integrate(car, dt) {
    car.x += car.vx * dt; car.y += car.vy * dt;
    const before = { x: car.x, y: car.y };
    const hit = World.collideCircle(car, 17);
    if (hit) {
      const impact = Math.hypot(car.vx, car.vy);
      if (impact > 130) damage(car, (impact - 120) * 0.05);
      car.vx *= 0.35; car.vy *= 0.35;
      if (car.x === before.x && car.y === before.y) { car.vx = 0; car.vy = 0; }
    }
    for (const other of cars) {
      if (other === car) continue;
      const dx = car.x - other.x, dy = car.y - other.y;
      const d2 = dx * dx + dy * dy, rr = 34;
      if (d2 < rr * rr && d2 > 0.01) {
        const d = Math.sqrt(d2), push = (rr - d) / 2;
        car.x += (dx / d) * push; car.y += (dy / d) * push;
        other.x -= (dx / d) * push; other.y -= (dy / d) * push;
        const impact = Math.abs(car.speed - other.speed);
        if (impact > 120) { damage(car, 3); damage(other, 3); }
        car.vx *= 0.6; car.vy *= 0.6;
      }
    }
    car.speed = Math.hypot(car.vx, car.vy);
  }

  function damage(car, amount) {
    car.health = Math.max(0, car.health - amount);
  }

  // ---- traffic ---------------------------------------------------------------
  function updateTraffic(car, dt, playerPos) {
    if (car.health <= 0) { car.vx *= 0.9; car.vy *= 0.9; integrate(car, dt); return; }
    // target point along the current leg
    let tx, ty;
    if (car.axis === 'v') { tx = laneV(car.fixed, car.dir); ty = car.target; }
    else { tx = car.target; ty = laneH(car.fixed, car.dir); }

    // slow for a car ahead
    let want = car.cruise;
    for (const other of cars) {
      if (other === car) continue;
      const dx = other.x - car.x, dy = other.y - car.y;
      const ahead = dx * Math.sin(car.angle) + dy * -Math.cos(car.angle);
      const side = Math.abs(dx * Math.cos(car.angle) + dy * Math.sin(car.angle));
      const dist = Math.hypot(dx, dy);
      if (dist < 74 && side < 20 && ahead > 0) want = Math.min(want, 40);
    }
    const dx = tx - car.x, dy = ty - car.y;
    const distT = Math.hypot(dx, dy);
    const wantAngle = Math.atan2(dy, dx) + Math.PI / 2;   // car sprites face +angle with 0 = north
    let da = wantAngle - car.angle;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    car.angle += World.clamp(da, -2.4 * dt, 2.4 * dt);
    const fx = Math.sin(car.angle), fy = -Math.cos(car.angle);
    car.vx += fx * 160 * dt; car.vy += fy * 160 * dt;
    const sp = Math.hypot(car.vx, car.vy);
    if (sp > want) { car.vx *= want / sp; car.vy *= want / sp; }
    integrate(car, dt);

    // reached the end of the leg (an intersection or the map edge): choose next
    if (distT < 46) {
      const nearNode = World.nodes.reduce((acc, n) => {
        const d = Math.hypot(n.x - car.x, n.y - car.y);
        return d < acc.d ? { n, d } : acc;
      }, { n: null, d: 1e9 });
      if (nearNode.d < 90 && rand() < 0.62) {
        // turn onto the crossing road
        if (car.axis === 'v') {
          car.axis = 'h'; car.fixed = nearNode.n.y;
          car.dir = rand() < 0.5 ? 1 : -1;
          car.target = car.dir > 0 ? World.BEACH_X : 70;
        } else {
          car.axis = 'v'; car.fixed = nearNode.n.x;
          car.dir = rand() < 0.5 ? 1 : -1;
          car.target = car.dir > 0 ? World.H - 70 : 70;
        }
      } else if (car.axis === 'v') {
        car.target = car.dir > 0 ? World.H - 70 : 70;
        if ((car.dir > 0 && car.y > World.H - 130) || (car.dir < 0 && car.y < 130)) car.dir *= -1;
      } else {
        car.target = car.dir > 0 ? World.BEACH_X : 70;
        if ((car.dir > 0 && car.x > World.BEACH_X - 60) || (car.dir < 0 && car.x < 130)) car.dir *= -1;
      }
    }
  }

  // ---- player driving ---------------------------------------------------------
  // input: {up, down, left, right}; returns the engine load 0..1 for audio.
  function drivePlayer(car, input, dt) {
    const m = car.model;
    const fx = Math.sin(car.angle), fy = -Math.cos(car.angle);
    const rx = Math.cos(car.angle), ry = Math.sin(car.angle);
    let fwd = car.vx * fx + car.vy * fy;
    let side = car.vx * rx + car.vy * ry;
    let load = 0;
    if (car.health > 0) {
      if (input.up) { fwd += m.accel * dt; load = 1; }
      if (input.down) { fwd -= (fwd > 12 ? 330 : 150) * dt; load = 0.5; }
      const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
      if (steer !== 0 && Math.abs(fwd) > 4) {
        car.angle += steer * 1.85 * dt * Math.sign(fwd) * Math.min(1, Math.abs(fwd) / 120);
      }
    }
    fwd -= fwd * 0.55 * dt;                                  // drag
    fwd = World.clamp(fwd, -110, m.top * (0.35 + 0.65 * (car.health / 100)));
    side -= side * Math.min(1, m.grip * dt) * side * 0.012 + side * 2.2 * dt; // drift bleed
    car.vx = fx * fwd + rx * side;
    car.vy = fy * fwd + ry * side;
    const hardHit = Math.abs(side) > 190;
    integrate(car, dt);
    if (hardHit && Math.hypot(car.vx, car.vy) < 60) damage(car, 4);
    return load;
  }

  // ---- drawing ------------------------------------------------------------------
  function drawCar(ctx, car, t) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    const { w, l } = car.model;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-w / 2 + 3, -l / 2 + 5, w, l);
    ctx.fillStyle = car.health <= 0 ? '#3a3a3a' : car.color;
    roundRect(ctx, -w / 2, -l / 2, w, l, 6); ctx.fill();
    if (car.kind === 'police') {
      ctx.fillStyle = '#16181d'; ctx.fillRect(-w / 2, -l * 0.08, w, l * 0.2);
      const flash = Math.sin(t * 0.02 + car.sirenPhase) > 0;
      ctx.fillStyle = flash ? '#ff4040' : '#4040ff';
      ctx.fillRect(-w / 4 - 3, -4, 6, 8);
      ctx.fillStyle = flash ? '#4040ff' : '#ff4040';
      ctx.fillRect(w / 4 - 3, -4, 6, 8);
      ctx.fillStyle = '#16181d'; ctx.font = 'bold 8px Verdana'; ctx.textAlign = 'center';
      ctx.fillText('PD', 0, -l * 0.22);
    }
    // cabin and glass
    ctx.fillStyle = 'rgba(18,24,34,0.9)';
    roundRect(ctx, -w / 2 + 4, -l * 0.18, w - 8, l * 0.34, 4); ctx.fill();
    ctx.fillStyle = 'rgba(140,190,230,0.55)';
    ctx.fillRect(-w / 2 + 5, -l * 0.3, w - 10, l * 0.1);
    // headlights
    ctx.fillStyle = '#ffe9a8';
    ctx.fillRect(-w / 2 + 3, -l / 2, 5, 3); ctx.fillRect(w / 2 - 8, -l / 2, 5, 3);
    ctx.fillStyle = '#c22f2f';
    ctx.fillRect(-w / 2 + 3, l / 2 - 3, 5, 3); ctx.fillRect(w / 2 - 8, l / 2 - 3, 5, 3);
    if (car.health < 45) {  // smoke wisps from a hurt engine
      ctx.fillStyle = 'rgba(60,60,60,0.5)';
      const s = 4 + Math.sin(t * 0.01 + car.id) * 1.5;
      ctx.beginPath(); ctx.arc(0, -l / 2 - 4, s, 0, 7); ctx.fill();
    }
    ctx.restore();
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  return { MODELS, cars, makeCar, spawnTraffic, spawnParked, updateTraffic,
           drivePlayer, integrate, damage, drawCar };
})();
