'use strict';
/* Jax Marlowe's work: a four-job story (First Wheels, Hot Package, Dockside
   Dash, The Big Goodbye) and then endless courier runs. A mission is a list
   of steps; each step is a place to reach or a car to steal, some against a
   countdown. The manager owns progress and timers; game.js owns rewards,
   banners and the wanted side effects it asks for through hooks. */

const Missions = (() => {
  const rand = mulberry32(31337);
  let storyIdx = 0;          // next story mission to run
  let active = null;         // mission currently being run
  let stepIdx = 0;
  let stepTime = null;       // seconds left on the current step, if timed
  let between = 0;           // pause between missions

  function dockPoint() { return { x: World.WATER_X - 90, y: 1240 }; }

  function storyMissions(storyCar) {
    const diner = World.buildingNamed("Marlo's Diner");
    const mall = World.buildingNamed('Palm Mall');
    const garage = World.buildingNamed('Marina Parking');
    const warehouse = World.buildingNamed('Dockside Warehouse');
    const hotel = World.buildingNamed('Hotel Sol');
    const hideout = World.buildingNamed('Casa Azul Flats');
    const chandlery = World.buildingNamed('Harbor Chandlery');
    return [
      {
        id: 'first-wheels', title: 'First Wheels', reward: 250,
        intro: 'Marlo wants the teal Comet outside his diner. Take it, bring it to Marina Parking.',
        steps: [
          { kind: 'steal', car: storyCar, x: storyCar.x, y: storyCar.y,
            label: 'Steal the teal Comet outside ' + diner.name },
          { kind: 'goto', ...World.doorstep(garage), label: 'Deliver the Comet to Marina Parking' },
        ],
      },
      {
        id: 'hot-package', title: 'Hot Package', reward: 420,
        intro: 'A package waits at Palm Mall. The buyer at the docks is impatient — and so are the cops.',
        steps: [
          { kind: 'goto', ...World.doorstep(mall), label: 'Pick up the package at Palm Mall' },
          { kind: 'goto', ...World.doorstep(warehouse), time: 150, heat: 2,
            label: 'Deliver to Dockside Warehouse — fast' },
        ],
      },
      {
        id: 'dockside-dash', title: 'Dockside Dash', reward: 520,
        intro: 'A lookout at the pier, then a drop at the chandlery. The clock is the whole job.',
        steps: [
          { kind: 'goto', ...dockPoint(), time: 75, label: 'Reach the pier lookout' },
          { kind: 'goto', ...World.doorstep(chandlery), time: 65, label: 'Drop the bag at Harbor Chandlery' },
        ],
      },
      {
        id: 'big-goodbye', title: 'The Big Goodbye', reward: 900,
        intro: 'Pick up a friend at Hotel Sol, get her to the pier, then vanish at Casa Azul.',
        steps: [
          { kind: 'goto', ...World.doorstep(hotel), label: 'Pick up your passenger at Hotel Sol' },
          { kind: 'goto', ...dockPoint(), time: 170, heat: 3, label: 'Get her to the pier — heat is on' },
          { kind: 'goto', ...World.doorstep(hideout), label: 'Lose the tail and reach Casa Azul Flats' },
        ],
      },
    ];
  }

  function courierJob() {
    const a = World.buildings[Math.floor(rand() * World.buildings.length)];
    let b = World.buildings[Math.floor(rand() * World.buildings.length)];
    if (b === a) b = World.buildings[(World.buildings.indexOf(a) + 5) % World.buildings.length];
    const pa = World.doorstep(a), pb = World.doorstep(b);
    const dist = Math.hypot(pa.x - pb.x, pa.y - pb.y);
    return {
      id: 'courier', title: 'Courier Run', reward: Math.round(70 + dist * 0.09),
      intro: 'Courier work: ' + a.name + ' to ' + b.name + '.',
      steps: [
        { kind: 'goto', ...pa, label: 'Pick up at ' + a.name },
        { kind: 'goto', ...pb, time: Math.round(dist / 200 + 30), label: 'Deliver to ' + b.name },
      ],
    };
  }

  let story = [];
  function init(storyCar, savedIdx) {
    story = storyMissions(storyCar);
    storyIdx = Math.min(savedIdx || 0, story.length);
    active = null; stepIdx = 0; between = 1.2;
  }

  function startNext() {
    active = storyIdx < story.length ? story[storyIdx] : courierJob();
    stepIdx = 0;
    beginStep();
  }
  function beginStep() {
    const step = active.steps[stepIdx];
    stepTime = step.time || null;
  }

  // hooks: {reward(mission), banner(title, sub), setHeat(n), fail(mission)}
  function update(dt, actor, playerCar, hooks) {
    if (!active) {
      between -= dt;
      if (between <= 0) { startNext(); hooks.banner(active.title, active.intro); }
      return;
    }
    const step = active.steps[stepIdx];
    if (step.heat && !step.heatApplied) {
      step.heatApplied = true;
      hooks.setHeat(step.heat);
    }
    if (stepTime !== null) {
      stepTime -= dt;
      if (stepTime <= 0) {
        const failed = active;
        active = null; between = 2.5;
        hooks.fail(failed);
        return;
      }
    }
    let done = false;
    if (step.kind === 'steal') done = (playerCar === step.car);
    else {
      const px = playerCar ? playerCar.x : actor.x;
      const py = playerCar ? playerCar.y : actor.y;
      done = Math.hypot(px - step.x, py - step.y) < 62;
    }
    if (done) {
      stepIdx++;
      if (stepIdx >= active.steps.length) {
        const finished = active;
        if (finished.id !== 'courier') storyIdx++;
        active = null; between = 2.2;
        hooks.reward(finished);
      } else {
        beginStep();
        hooks.step(active.steps[stepIdx].label);
      }
    }
  }

  function objective() {
    if (!active) return { text: 'Waiting for the next job…', x: null, y: null, time: null };
    const step = active.steps[stepIdx];
    return { text: active.title + ' — ' + step.label, x: step.x, y: step.y, time: stepTime };
  }

  // Skip the between-missions pause (used by the demo scenes so the first
  // job is already on the clock when the shot is taken).
  function beginImmediately() { if (!active) between = Math.min(between, 0.01); }

  return { init, update, objective, beginImmediately,
           get storyIdx() { return storyIdx; },
           get storyLength() { return story.length; },
           get activeTitle() { return active ? active.title : null; } };
})();
