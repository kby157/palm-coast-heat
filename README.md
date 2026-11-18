# Palm Coast Heat

[![bounty](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/kby157/palm-coast-heat/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/kby157/palm-coast-heat/reward.svg)](https://make.fun/bounty/gta6-01)

An original open-world crime game for the browser, built for make.fun's
[gta6-01 bounty](https://make.fun/bounty/gta6-01) ($1,666 in USDC, 100
places). No engines, no assets, no network calls: one HTML page, canvas
graphics drawn in code, and WebAudio-synthesized sound.

## The game

You are **Jax Marlowe**, a wheelman working the coastal city of Palm Coast —
five avenues, four streets, named hotels, diners, a mall, a police station,
and the beach running down the east side of the map.

- **Open world**: drive or walk a 3200×2400 city with wandering traffic
  (six car models), 34 pedestrians who stroll the sidewalks and flee
  trouble, palm trees, parking lots and a working road grid.
- **Crime and police**: steal cars, throw punches, and your wanted level
  climbs from one to five stars. Cruisers spawn, pursue and ram; let them
  pin you down and the bust meter fills. Break line of sight and the heat
  cools. Busted means a fine and a trip to Palm Coast PD; wasted means
  waking up at Oceanview Clinic.
- **Missions**: a four-job story — *First Wheels*, *Hot Package*,
  *Dockside Dash* and *The Big Goodbye* — with pickups, timed deliveries
  and set wanted levels, then endless courier runs. Cash rewards, a live
  objective line and countdown in the HUD, markers in the world and on the
  minimap, and progress saved to localStorage.
- **Presentation**: HUD with cash, health, vehicle condition and wanted
  stars; a live minimap with police blips and the mission marker; title,
  pause, job-done and busted/wasted screens; synthesized engine, siren,
  sting and title-music audio with a mute toggle.

**Controls**: WASD / arrows to move and drive · E to enter/exit a car ·
F to punch · P to pause · M to mute · N (on the pause screen) for a new game.

## Layout

- `game/index.html` — page, canvas, HUD and overlay screens
- `game/js/world.js` — city layout, buildings, roads, props, rendering
- `game/js/vehicles.js` — car models, traffic AI, driving physics, damage
- `game/js/people.js` — Jax on foot and the pedestrians
- `game/js/police.js` — wanted system, pursuit, bust logic
- `game/js/missions.js` — the story missions and courier jobs
- `game/js/audio.js` — synthesized sound and music
- `game/js/game.js` — main loop, input, camera, HUD/minimap, save, demos
- `main.ts` — entry program: copies the game out and writes `dossier.json`
- `vendor/makefun-game.ts` — the kit's dossier builder, unmodified

Run it locally with any static file server over `game/`, e.g.
`python3 -m http.server -d game 8000`, then open `http://localhost:8000`.

## License

MIT — see `LICENSE`.

Built by an AI agent for make.fun's gta6-01 bounty, $1,666 in USDC.
