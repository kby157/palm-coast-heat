'use strict';
/* The Palm Coast PD: the wanted system (heat, stars, decay), cruiser spawns,
   pursuit driving, and the bust meter that fills when they pin you down. */

const Police = (() => {
  const rand = mulberry32(90210);
  const state = {
    heat: 0,          // 0..5 float; stars shown = ceil(heat)
    bust: 0,          // 0..1
    unseenFor: 0,     // seconds since a cruiser last had eyes on the player
    cruisers: [],     // car objects (kind 'police') currently on the map
    spawnCd: 0,
  };
  const stars = () => (state.heat <= 0 ? 0 : Math.min(5, Math.ceil(state.heat)));

  // Report a crime. amount is in heat: a stolen car ~1, an assault ~0.7.
  function reportCrime(amount) {
    state.heat = Math.min(5, state.heat + amount);
    state.unseenFor = 0;
  }

  function cruiserCount() { return state.cruisers.length; }

  function spawnCruiser(player) {
    // Come in on a road, a few blocks away, never on top of the player.
    for (let tries = 0; tries < 12; tries++) {
      const ax = World.AVENUES[Math.floor(rand() * World.AVENUES.length)];
      const sy = World.STREETS[Math.floor(rand() * World.STREETS.length)];
      const x = ax + (rand() - 0.5) * 40, y = sy + (rand() - 0.5) * 40;
      const d = Math.hypot(x - player.x, y - player.y);
      if (d < 480 || d > 980) continue;
      const car = Vehicles.makeCar(1, x, y, 0, 'police');
      car.color = '#f2f2f2'; car.cruise = 300;
      state.cruisers.push(car);
      return;
    }
  }

  function update(dt, player, playerCar, events) {
    const s = stars();
    state.spawnCd -= dt;

    // Keep the pressure matched to the star count.
    const wanted = s === 0 ? 0 : Math.min(2 + s, 6);
    if (state.cruisers.length < wanted && state.spawnCd <= 0) {
      spawnCruiser(player);
      state.spawnCd = 1.6;
    }
    // Cruisers that fall far behind give up and despawn.
    for (let i = state.cruisers.length - 1; i >= 0; i--) {
      const c = state.cruisers[i];
      if (Math.hypot(c.x - player.x, c.y - player.y) > 1500) {
        Vehicles.cars.splice(Vehicles.cars.indexOf(c), 1);
        state.cruisers.splice(i, 1);
      }
    }

    // Eyes on the player?
    let nearest = 1e9;
    for (const c of state.cruisers) {
      const d = Math.hypot(c.x - player.x, c.y - player.y);
      if (d < nearest) nearest = d;
    }
    const seen = nearest < 560;
    if (seen) state.unseenFor = 0; else state.unseenFor += dt;

    // Heat decays while nobody is watching; faster the longer you hide.
    if (!seen && state.heat > 0) {
      state.heat = Math.max(0, state.heat - dt * (state.unseenFor > 4 ? 0.14 : 0.05));
      if (state.heat === 0) events.push('escaped');
    }

    // Pursuit driving: aim at the player, ram when close.
    for (const c of state.cruisers) {
      if (c.health <= 0) { c.vx *= 0.92; c.vy *= 0.92; Vehicles.integrate(c, dt); continue; }
      const dx = player.x - c.x, dy = player.y - c.y;
      const dist = Math.hypot(dx, dy) || 1;
      const wantAngle = Math.atan2(dy, dx) + Math.PI / 2;
      let da = wantAngle - c.angle;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      c.angle += World.clamp(da, -2.6 * dt, 2.6 * dt);
      const top = 252 + s * 26 + (dist > 380 ? 42 : 0);
      const fx = Math.sin(c.angle), fy = -Math.cos(c.angle);
      c.vx += fx * 265 * dt; c.vy += fy * 265 * dt;
      const sp = Math.hypot(c.vx, c.vy);
      if (sp > top) { c.vx *= top / sp; c.vy *= top / sp; }
      Vehicles.integrate(c, dt);
      // A cruiser that touches the player's car at speed hurts it a little.
      if (playerCar && Math.hypot(c.x - playerCar.x, c.y - playerCar.y) < 36 && sp > 130) {
        Vehicles.damage(playerCar, 2.2);
      }
    }

    // The bust meter: close cruisers + a slow or on-foot player.
    const playerSpeed = playerCar ? Math.hypot(playerCar.vx, playerCar.vy) : 0;
    const pinned = s > 0 && nearest < 120 && playerSpeed < 42;
    if (pinned) {
      state.bust = Math.min(1, state.bust + dt / 2.1);
      if (state.bust >= 1) events.push('busted');
    } else {
      state.bust = Math.max(0, state.bust - dt * 0.7);
    }
    return { seen, nearest };
  }

  function clear() {
    for (const c of state.cruisers) {
      const i = Vehicles.cars.indexOf(c);
      if (i >= 0) Vehicles.cars.splice(i, 1);
    }
    state.cruisers = [];
    state.heat = 0; state.bust = 0; state.unseenFor = 0;
  }

  return { state, stars, reportCrime, update, clear, cruiserCount };
})();
