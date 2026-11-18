'use strict';
/* Palm Coast: the city itself. A deterministic grid of five avenues and four
   streets on a 3200x2400 lot, with the beach and the sea along the east edge.
   Owns the layout data (buildings, props, road network), collision queries
   against that layout, and all static world rendering. */

// Small seeded generator so every visit builds the exact same city.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const World = (() => {
  const W = 3200, H = 2400;
  const ROAD_HALF = 60;                       // half the width of a road
  const AVENUES = [280, 820, 1360, 1900, 2440]; // vertical road centres (x)
  const STREETS = [320, 880, 1440, 2000];       // horizontal road centres (y)
  const BEACH_X = 2740;                        // sand starts here
  const WATER_X = 2950;                        // open water starts here

  const rand = mulberry32(20261119);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  // ---- buildings -----------------------------------------------------------
  const NAMES = [
    'Hotel Sol', 'Banco Marina', "Marlo's Diner", 'Palm Mall',
    'Palm Coast PD', 'Oceanview Clinic', 'Casa Azul Flats', 'The Salty Anchor',
    'Palm Coast Library', 'Neptune Gym', 'Coral Court Motel', 'Vista Offices',
    'Harbor Chandlery', 'Sunset Bakery', 'Gilded Flamingo', 'Tidal Records',
    'Marina Parking', 'The Breakers Hotel', 'Coco Loco Club', 'Port Authority',
    'Flamingo Laundromat', 'Seabreeze School', 'The Sandbar', 'Kelvin Motors',
    'Azure Condos', 'Dockside Warehouse', 'Palm Print Shop', 'Hotel Miramar',
  ];
  const ROOFS = ['#b5524a', '#c96f4a', '#8a6fb8', '#4a7fb5', '#53a08a', '#c2a24d',
    '#7a8ba0', '#a05a7a', '#5b8c5a', '#946b54'];
  const buildings = [];
  let nameIdx = 0;

  // Blocks are the rectangles left between neighbouring roads.
  const xEdges = [36, ...AVENUES, BEACH_X - 40];
  const yEdges = [36, ...STREETS, H - 36];
  for (let i = 0; i < xEdges.length - 1; i++) {
    for (let j = 0; j < yEdges.length - 1; j++) {
      const bx = xEdges[i] + (i === 0 ? 0 : ROAD_HALF + 16);
      const bw = xEdges[i + 1] - xEdges[i] - (i === 0 ? 16 : ROAD_HALF + 16) - 16;
      const by = yEdges[j] + (j === 0 ? 0 : ROAD_HALF + 16);
      const bh = yEdges[j + 1] - yEdges[j] - (j === 0 ? 16 : ROAD_HALF + 16) - 16;
      if (bw < 150 || bh < 150) continue;
      const roll = rand();
      if (roll < 0.16) continue;                       // park: trees only
      if (roll < 0.30) { buildings.push(makeLot(bx, by, bw, bh)); continue; }
      if (bw > 330 && rand() < 0.5) {                  // two smaller buildings
        buildings.push(makeBuilding(bx, by, bw * 0.46, bh));
        buildings.push(makeBuilding(bx + bw * 0.54, by, bw * 0.46, bh));
      } else {
        buildings.push(makeBuilding(bx + bw * 0.08, by + bh * 0.08, bw * 0.84, bh * 0.84));
      }
    }
  }
  function makeBuilding(x, y, w, h) {
    const name = nameIdx < NAMES.length ? NAMES[nameIdx++] : 'Palm Court ' + (nameIdx++ - NAMES.length + 1);
    return { x, y, w, h, name, color: pick(ROOFS), lot: false,
             cx: x + w / 2, cy: y + h / 2 };
  }
  function makeLot(x, y, w, h) {
    return { x, y, w, h, name: 'Parking Lot', color: '#565d66', lot: true,
             cx: x + w / 2, cy: y + h / 2 };
  }
  function buildingNamed(name) { return buildings.find((b) => b.name === name); }
  // A spot on the road just beside a building: where mission markers live.
  function doorstep(b) {
    let best = null, bd = 1e12;
    for (const ax of AVENUES) { const d = Math.abs(ax - b.cx); if (d < bd) { bd = d; best = { x: ax, y: b.cy }; } }
    for (const sy of STREETS) { const d = Math.abs(sy - b.cy); if (d < bd) { bd = d; best = { x: b.cx, y: sy }; } }
    return best;
  }

  // ---- props: palms, lamps, benches ---------------------------------------
  const props = [];
  for (const ax of AVENUES) for (let y = 90; y < H - 60; y += 170)
    props.push({ x: ax - ROAD_HALF - 12, y: y + rand() * 40, r: 9, kind: 'palm' });
  for (const sy of STREETS) for (let x = 110; x < BEACH_X - 60; x += 190)
    props.push({ x: x + rand() * 40, y: sy + ROAD_HALF + 12, r: 9, kind: 'palm' });
  for (let y = 120; y < H - 80; y += 130)                       // beach palms
    props.push({ x: BEACH_X + 40 + rand() * 120, y, r: 9, kind: 'palm' });
  for (let i = 0; i < 60; i++)                                  // lamps & benches
    props.push({ x: 80 + rand() * (BEACH_X - 160), y: 80 + rand() * (H - 160),
                 r: 5, kind: rand() < 0.5 ? 'lamp' : 'bench' });

  // ---- queries --------------------------------------------------------------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function onRoad(x, y) {
    if (x >= WATER_X) return false;
    for (const ax of AVENUES) if (Math.abs(x - ax) <= ROAD_HALF) return true;
    for (const sy of STREETS) if (Math.abs(y - sy) <= ROAD_HALF) return true;
    return false;
  }
  function inWater(x, y) { return x >= WATER_X; }
  // Push a circle out of every building and prop it overlaps; returns true on hit.
  function collideCircle(p, r) {
    let hit = false;
    for (const b of buildings) {
      if (b.lot) continue;
      const nx = clamp(p.x, b.x, b.x + b.w), ny = clamp(p.y, b.y, b.y + b.h);
      const dx = p.x - nx, dy = p.y - ny, d2 = dx * dx + dy * dy;
      if (d2 < r * r) {
        hit = true;
        if (d2 > 0.01) { const d = Math.sqrt(d2); p.x = nx + (dx / d) * r; p.y = ny + (dy / d) * r; }
        else { p.y = b.y - r; }
      }
    }
    for (const pr of props) {
      const dx = p.x - pr.x, dy = p.y - pr.y, rr = r + pr.r;
      if (dx * dx + dy * dy < rr * rr && dx * dx + dy * dy > 0.01) {
        const d = Math.sqrt(dx * dx + dy * dy);
        p.x = pr.x + (dx / d) * rr; p.y = pr.y + (dy / d) * rr; hit = true;
      }
    }
    p.x = clamp(p.x, r, W - r); p.y = clamp(p.y, r, H - r);
    if (p.x > WATER_X - r && onRoad(p.x, p.y) === false && p.y > 0) { /* shore is walkable sand */ }
    return hit;
  }
  function buildingAt(x, y) {
    for (const b of buildings) if (!b.lot && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
    return null;
  }
  // Intersections of the road grid, the nodes traffic drives between.
  const nodes = [];
  for (const ax of AVENUES) for (const sy of STREETS) nodes.push({ x: ax, y: sy });

  // ---- rendering --------------------------------------------------------------
  function draw(ctx, cam, t) {
    // ground: city grass, then sand, then sea
    ctx.fillStyle = '#3f7a44'; ctx.fillRect(cam.x, cam.y, cam.w, cam.h);
    ctx.fillStyle = '#e3cf9e'; ctx.fillRect(BEACH_X, 0, WATER_X - BEACH_X, H);
    const wave = Math.sin(t * 0.0012) * 6;
    ctx.fillStyle = '#2277aa'; ctx.fillRect(WATER_X, 0, W - WATER_X, H);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (let y = 40; y < H; y += 90) ctx.fillRect(WATER_X + 14 + ((y + wave * 8) % 30), y, 42, 4);
    ctx.fillStyle = '#f2e3bb'; ctx.fillRect(WATER_X - 8, 0, 10, H);

    // blocks: sidewalks under the buildings
    ctx.fillStyle = '#9aa0a3';
    for (const b of buildings) ctx.fillRect(b.x - 10, b.y - 10, b.w + 20, b.h + 20);

    // roads
    ctx.fillStyle = '#33373c';
    for (const ax of AVENUES) ctx.fillRect(ax - ROAD_HALF, 0, ROAD_HALF * 2, H);
    for (const sy of STREETS) ctx.fillRect(0, sy - ROAD_HALF, BEACH_X + 60, ROAD_HALF * 2);
    ctx.strokeStyle = 'rgba(240,220,120,0.75)'; ctx.lineWidth = 3; ctx.setLineDash([26, 22]);
    ctx.beginPath();
    for (const ax of AVENUES) { ctx.moveTo(ax, 0); ctx.lineTo(ax, H); }
    for (const sy of STREETS) { ctx.moveTo(0, sy); ctx.lineTo(BEACH_X + 60, sy); }
    ctx.stroke(); ctx.setLineDash([]);

    // buildings and lots
    for (const b of buildings) {
      if (b.lot) {
        ctx.fillStyle = '#4c5157'; ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2;
        for (let lx = b.x + 18; lx < b.x + b.w - 20; lx += 42) { ctx.beginPath(); ctx.moveTo(lx, b.y + 8); ctx.lineTo(lx, b.y + b.h - 8); ctx.stroke(); }
        continue;
      }
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(b.x + 7, b.y + 9, b.w, b.h);
      ctx.fillStyle = b.color; ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fillRect(b.x, b.y, b.w, 12);
      ctx.fillStyle = 'rgba(255,235,170,0.5)';
      const cols = Math.floor(b.w / 34), rows = Math.floor(b.h / 34);
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++)
        if ((i * 7 + j * 13) % 3 !== 0) ctx.fillRect(b.x + 12 + i * 34, b.y + 16 + j * 34, 13, 10);
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 15px Verdana'; ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowBlur = 5;
      ctx.fillText(b.name, b.cx, b.y - 14);
      ctx.shadowBlur = 0;
    }

    // props
    for (const pr of props) {
      if (pr.kind === 'palm') {
        ctx.strokeStyle = '#7a5a34'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(pr.x, pr.y); ctx.lineTo(pr.x + 4, pr.y - 13); ctx.stroke();
        ctx.strokeStyle = '#2e8b3a'; ctx.lineWidth = 4;
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2 + 0.5;
          ctx.beginPath(); ctx.moveTo(pr.x + 4, pr.y - 13);
          ctx.lineTo(pr.x + 4 + Math.cos(a) * 17, pr.y - 13 + Math.sin(a) * 9 - 3); ctx.stroke();
        }
      } else if (pr.kind === 'lamp') {
        ctx.fillStyle = '#ffd76a'; ctx.beginPath(); ctx.arc(pr.x, pr.y, 4.5, 0, 7); ctx.fill();
        ctx.fillStyle = '#444'; ctx.fillRect(pr.x - 1.5, pr.y - 2, 3, 9);
      } else {
        ctx.fillStyle = '#8a6a44'; ctx.fillRect(pr.x - 10, pr.y - 3, 20, 6);
      }
    }
  }

  return { W, H, ROAD_HALF, AVENUES, STREETS, BEACH_X, WATER_X,
           buildings, props, nodes, buildingNamed, doorstep, onRoad, inWater,
           collideCircle, buildingAt, draw, clamp };
})();
