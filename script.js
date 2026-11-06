
"use strict";

/* =========================================
   VOID//RUSH 2.0 — GAME ENGINE
========================================= */

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const $ = id => document.getElementById(id);

const ui = {
  score: $("score"),
  best: $("best"),
  sector: $("sector"),
  kills: $("kills"),
  combo: $("combo"),
  health: $("healthBar"),
  shield: $("shieldBar"),
  dash: $("dashBar"),
  healthText: $("healthText"),
  shieldText: $("shieldText"),
  dashText: $("dashText"),
  position: $("position"),
  fps: $("fps"),
  arenaState: $("arenaState"),
  log: $("eventLog")
};

let W = 0;
let H = 0;
let running = false;
let paused = false;
let upgrading = false;
let gameOver = false;
let lastTime = 0;
let frameCount = 0;
let fpsTimer = 0;
let fps = 60;

let score = 0;
let best = Number(localStorage.getItem("voidrush_best") || 0);
let kills = 0;
let sector = 1;
let sectorProgress = 0;
let combo = 1;
let comboTimer = 0;
let elapsed = 0;
let spawnTimer = 0;
let pickupTimer = 0;
let damageTimer = 0;
let regenTimer = 0;
let shake = 0;

ui.best.textContent = formatScore(best);

const keys = {};
const touch = { up: false, down: false, left: false, right: false };

let player;
let enemies = [];
let shards = [];
let pickups = [];
let particles = [];
let stars = [];
let floatingTexts = [];
let upgradesOwned = [];

const random = (min, max) =>
  Math.random() * (max - min) + min;

const clamp = (v, min, max) =>
  Math.max(min, Math.min(max, v));

const formatScore = n =>
  Math.floor(n).toString().padStart(6, "0");

function resize() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  W = rect.width;
  H = rect.height;

  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  stars = Array.from({ length: 75 }, () => ({
    x: random(0, W),
    y: random(0, H),
    size: random(.5, 2),
    speed: random(8, 35)
  }));

  if (player) {
    player.x = clamp(player.x, 20, W - 20);
    player.y = clamp(player.y, 20, H - 20);
  }
}

window.addEventListener("resize", resize);
resize();

function createPlayer() {
  return {
    x: W / 2,
    y: H / 2,
    radius: 11,
    speed: 235,
    health: 100,
    maxHealth: 100,
    shield: 100,
    maxShield: 100,
    dash: 100,
    dashPower: 100,
    dashCooldown: 0,
    dashDuration: 0,
    invulnerable: 0,
    magnet: 0,
    extraHealing: 0,
    shieldRegen: 1,
    speedMultiplier: 1,
    dashMultiplier: 1,
    scoreMultiplier: 1,
    damageReduction: 0,
    trail: [],
    direction: { x: 0, y: -1 }
  };
}

function resetGame() {
  score = 0;
  kills = 0;
  sector = 1;
  sectorProgress = 0;
  combo = 1;
  comboTimer = 0;
  elapsed = 0;
  spawnTimer = 0;
  pickupTimer = 3;
  damageTimer = 0;
  regenTimer = 0;
  shake = 0;

  enemies = [];
  shards = [];
  pickups = [];
  particles = [];
  floatingTexts = [];
  upgradesOwned = [];

  player = createPlayer();

  updateHUD();
  logEvent("Expedition initiated.");
  logEvent("Pilot systems online.");

  gameOver = false;
  upgrading = false;
  paused = false;
  running = true;

  hideScreens();
  ui.arenaState.textContent = "FLIGHT ACTIVE";
}

function hideScreens() {
  ["startScreen", "pauseScreen", "upgradeScreen", "gameOverScreen"]
    .forEach(id => $(id).classList.add("hidden"));
}

function startGame() {
  resetGame();
  lastTime = performance.now();
  requestAnimationFrame(loop);
}

function pauseGame() {
  if (!running || gameOver || upgrading) return;

  paused = !paused;

  $("pauseScreen").classList.toggle("hidden", !paused);
  ui.arenaState.textContent = paused ? "SUSPENDED" : "FLIGHT ACTIVE";

  if (!paused) {
    lastTime = performance.now();
    requestAnimationFrame(loop);
  }
}

function logEvent(message) {
  const p = document.createElement("p");
  p.textContent = "> " + message;
  ui.log.prepend(p);

  while (ui.log.children.length > 7) {
    ui.log.lastChild.remove();
  }
}

/* =========================================
   INPUT
========================================= */

window.addEventListener("keydown", e => {
  const k = e.key.toLowerCase();

  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "]
    .includes(k)) e.preventDefault();

  keys[k] = true;

  if (k === "p" || k === "escape") {
    if (!gameOver && !upgrading) pauseGame();
  }

  if (k === " " && !e.repeat) dash();
});

window.addEventListener("keyup", e => {
  keys[e.key.toLowerCase()] = false;
});

document.querySelectorAll("[data-dir]").forEach(btn => {
  const dir = btn.dataset.dir;

  btn.addEventListener("pointerdown", e => {
    e.preventDefault();
    touch[dir] = true;
  });

  ["pointerup", "pointerleave", "pointercancel"].forEach(event => {
    btn.addEventListener(event, () => touch[dir] = false);
  });
});

$("touchDash").addEventListener("pointerdown", e => {
  e.preventDefault();
  dash();
});

function getMovement() {
  let x = 0;
  let y = 0;

  if (keys["a"] || keys["arrowleft"] || touch.left) x--;
  if (keys["d"] || keys["arrowright"] || touch.right) x++;
  if (keys["w"] || keys["arrowup"] || touch.up) y--;
  if (keys["s"] || keys["arrowdown"] || touch.down) y++;

  const length = Math.hypot(x, y);

  if (length > 0) {
    x /= length;
    y /= length;
  }

  return { x, y };
}

function dash() {
  if (!running || paused || upgrading || gameOver) return;
  if (player.dash < 100 || player.dashDuration > 0) return;

  const move = getMovement();

  let dx = move.x;
  let dy = move.y;

  if (dx === 0 && dy === 0) {
    dx = player.direction.x;
    dy = player.direction.y;
  }

  player.direction = { x: dx, y: dy };
  player.dashDuration = .19;
  player.dash = 0;
  player.invulnerable = .42;

  burst(player.x, player.y, 18, "#777", 3);
  floatingText(player.x, player.y - 25, "PHASE DASH", "#555");
}

/* =========================================
   MAIN LOOP
========================================= */

function loop(timestamp) {
  if (!running || paused || upgrading || gameOver) return;

  let dt = Math.min((timestamp - lastTime) / 1000, .035);
  lastTime = timestamp;

  frameCount++;
  fpsTimer += dt;

  if (fpsTimer >= 1) {
    fps = frameCount;
    frameCount = 0;
    fpsTimer = 0;
    ui.fps.textContent = fps;
  }

  update(dt);
  render();

  requestAnimationFrame(loop);
}

/* =========================================
   UPDATE
========================================= */

function update(dt) {
  elapsed += dt;

  updatePlayer(dt);
  updateEnemies(dt);
  updateShards(dt);
  updatePickups(dt);
  updateParticles(dt);
  updateFloatingTexts(dt);
  updateStars(dt);
  updateSpawning(dt);
  updateCombo(dt);
  updateSector(dt);
  updateRecovery(dt);
  updateHUD();
}

function updatePlayer(dt) {
  const move = getMovement();

  if (move.x || move.y) {
    player.direction = { x: move.x, y: move.y };
  }

  const speed = player.speed * player.speedMultiplier;

  if (player.dashDuration > 0) {
    player.dashDuration -= dt;

    player.x += player.direction.x * 900 * dt;
    player.y += player.direction.y * 900 * dt;

    if (Math.random() > .4) {
      burst(player.x, player.y, 1, "#999", 1);
    }
  } else {
    player.x += move.x * speed * dt;
    player.y += move.y * speed * dt;
  }

  player.x = clamp(player.x, 15, W - 15);
  player.y = clamp(player.y, 15, H - 15);

  player.dash = Math.min(100,
    player.dash + 24 * player.dashMultiplier * dt
  );

  player.invulnerable = Math.max(0, player.invulnerable - dt);

  player.trail.unshift({ x: player.x, y: player.y });

  if (player.trail.length > 8) player.trail.pop();
}

function updateRecovery(dt) {
  // Passive hull regeneration after avoiding damage.
  if (damageTimer > 0) {
    damageTimer -= dt;
  } else if (player.health < player.maxHealth) {
    regenTimer += dt;

    if (regenTimer > 2.5) {
      player.health = Math.min(
        player.maxHealth,
        player.health + .8 * dt
      );
    }
  }

  // Shield regenerates gradually.
  player.shield = Math.min(
    player.maxShield,
    player.shield + player.shieldRegen * dt
  );
}

function updateEnemies(dt) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];

    const dx = player.x - e.x;
    const dy = player.y - e.y;
    const dist = Math.hypot(dx, dy) || 1;

    let vx = dx / dist;
    let vy = dy / dist;

    if (e.type === "drifter") {
      vx += Math.sin(elapsed * 3 + e.phase) * .7;
      vy += Math.cos(elapsed * 3 + e.phase) * .7;

      const len = Math.hypot(vx, vy) || 1;
      vx /= len;
      vy /= len;
    }

    if (e.type === "seeker" || e.type === "drifter") {
      e.x += vx * e.speed * dt;
      e.y += vy * e.speed * dt;
    }

    if (e.type === "hunter") {
      e.x += vx * e.speed * dt;
      e.y += vy * e.speed * dt;
    }

    e.rotation += dt * (e.type === "hunter" ? 2 : 1);

    if (dist < player.radius + e.radius) {
      damagePlayer(e.damage);

      const push = 30 * dt;
      e.x -= vx * push;
      e.y -= vy * push;
    }

    if (e.hp <= 0) {
      killEnemy(i);
    }
  }
}

function updateShards(dt) {
  for (let i = shards.length - 1; i >= 0; i--) {
    const s = shards[i];

    s.life -= dt;
    s.rotation += dt * 2;

    let dx = player.x - s.x;
    let dy = player.y - s.y;
    let dist = Math.hypot(dx, dy) || 1;

    if (dist < 110 + player.magnet) {
      const pull = 270 * dt;
      s.x += dx / dist * pull;
      s.y += dy / dist * pull;
    }

    if (dist < player.radius + 10) {
      collectShard(i);
      continue;
    }

    if (s.life <= 0) shards.splice(i, 1);
  }
}

function updatePickups(dt) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];

    p.life -= dt;
    p.rotation += dt * 1.5;

    if (Math.hypot(player.x - p.x, player.y - p.y) < 22) {
      collectPickup(i);
      continue;
    }

    if (p.life <= 0) pickups.splice(i, 1);
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    p.vx *= Math.pow(.3, dt);
    p.vy *= Math.pow(.3, dt);

    if (p.life <= 0) particles.splice(i, 1);
  }
}

function updateFloatingTexts(dt) {
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const t = floatingTexts[i];
    t.y -= 30 * dt;
    t.life -= dt;

    if (t.life <= 0) floatingTexts.splice(i, 1);
  }
}

function updateStars(dt) {
  stars.forEach(s => {
    s.y += s.speed * dt;

    if (s.y > H) {
      s.y = 0;
      s.x = random(0, W);
    }
  });
}

function updateCombo(dt) {
  if (comboTimer > 0) {
    comboTimer -= dt;

    if (comboTimer <= 0) {
      combo = 1;
    }
  }
}

/* =========================================
   SPAWNING AND SECTORS
========================================= */

function updateSpawning(dt) {
  spawnTimer -= dt;
  pickupTimer -= dt;

  const difficulty = 1 + (sector - 1) * .14;

  if (spawnTimer <= 0) {
    spawnEnemy();

    if (Math.random() < .22 + sector * .012) {
      spawnEnemy();
    }

    spawnTimer = Math.max(.35, random(1.5, 2.4) / difficulty);
  }

  if (pickupTimer <= 0) {
    spawnPickup();
    pickupTimer = random(13, 21);
  }
}

function spawnEnemy() {
  const side = Math.floor(Math.random() * 4);
  const margin = 25;

  let x, y;

  if (side === 0) {
    x = random(0, W);
    y = -margin;
  } else if (side === 1) {
    x = W + margin;
    y = random(0, H);
  } else if (side === 2) {
    x = random(0, W);
    y = H + margin;
  } else {
    x = -margin;
    y = random(0, H);
  }

  let type = "seeker";
  const roll = Math.random();

  if (sector >= 2 && roll < .28) type = "drifter";
  if (sector >= 4 && roll > .78) type = "hunter";

  const configs = {
    seeker: { radius: 10, speed: 68, hp: 1, damage: 17 },
    drifter: { radius: 13, speed: 53, hp: 2, damage: 22 },
    hunter: { radius: 16, speed: 42, hp: 4, damage: 27 }
  };

  const c = configs[type];
  const scale = 1 + (sector - 1) * .09;

  enemies.push({
    x, y, type,
    radius: c.radius,
    speed: c.speed * scale,
    hp: c.hp,
    damage: c.damage,
    rotation: 0,
    phase: random(0, 6)
  });
}

function updateSector(dt) {
  sectorProgress += dt;

  if (sectorProgress >= 35) {
    sectorProgress = 0;
    sector++;
    logEvent("Sector " + sector + " reached.");

    // Clear the arena and offer three upgrades.
    enemies = [];
    createUpgradeChoices();
  }
}

/* =========================================
   DAMAGE AND RECOVERY
========================================= */

function damagePlayer(amount) {
  if (player.invulnerable > 0 || gameOver || upgrading) return;

  const actualDamage = amount * (1 - player.damageReduction);

  if (player.shield > 0) {
    const absorbed = Math.min(player.shield, actualDamage);
    player.shield -= absorbed;

    player.health -= actualDamage - absorbed;
  } else {
    player.health -= actualDamage;
  }

  damageTimer = 5;
  regenTimer = 0;
  player.invulnerable = .65;
  shake = 9;

  burst(player.x, player.y, 12, "#777", 3);
  floatingText(player.x, player.y - 22, "-" + Math.round(actualDamage), "#555");

  if (player.health <= 0) {
    player.health = 0;
    endGame();
  }
}

/* =========================================
   COLLECTION
========================================= */

function collectShard(index) {
  const s = shards[index];
  shards.splice(index, 1);

  comboTimer = 3;
  combo = Math.min(12, combo + 1);

  const points = Math.round(15 * combo * player.scoreMultiplier);
  score += points;

  // Energy collection restores a little hull.
  const healing = player.extraHealing;

  if (healing > 0) {
    player.health = Math.min(
      player.maxHealth,
      player.health + healing
    );
  }

  floatingText(s.x, s.y, "+" + points, "#555");
  burst(s.x, s.y, 5, "#777", 2);

  if (Math.random() < .12) {
    player.shield = Math.min(player.maxShield, player.shield + 3);
  }
}

function collectPickup(index) {
  const p = pickups[index];
  pickups.splice(index, 1);

  if (p.type === "repair") {
    const heal = 35;
    player.health = Math.min(player.maxHealth, player.health + heal);
    floatingText(player.x, player.y - 25, "+35 HULL", "#555");
    logEvent("Hull repaired.");
  }

  if (p.type === "shield") {
    player.shield = Math.min(player.maxShield, player.shield + 55);
    floatingText(player.x, player.y - 25, "+55 SHIELD", "#777");
    logEvent("Shield restored.");
  }

  if (p.type === "overcharge") {
    player.dash = 100;
    player.invulnerable = 1.5;
    floatingText(player.x, player.y - 25, "OVERCHARGE", "#444");
    logEvent("Overcharge activated.");
  }

  burst(p.x, p.y, 16, "#888", 3);
}

function spawnPickup() {
  const types = ["repair", "shield", "overcharge"];
  const type = types[Math.floor(Math.random() * types.length)];

  pickups.push({
    x: random(35, W - 35),
    y: random(35, H - 35),
    type,
    life: 11,
    rotation: 0
  });
}

/* =========================================
   ENEMY DESTRUCTION
========================================= */

function killEnemy(index) {
  const e = enemies[index];
  enemies.splice(index, 1);

  kills++;
  score += Math.round(40 * player.scoreMultiplier);

  sectorProgress += 1.4;

  burst(e.x, e.y, 14, "#666", 3);

  // Shard drops.
  const amount = e.type === "hunter" ? 4 : e.type === "drifter" ? 2 : 1;

  for (let i = 0; i < amount; i++) {
    shards.push({
      x: e.x + random(-9, 9),
      y: e.y + random(-9, 9),
      rotation: 0,
      life: 13
    });
  }

  floatingText(e.x, e.y, "+40", "#555");

  if (kills % 10 === 0) {
    logEvent("10 eliminations achieved.");
  }
}

/* =========================================
   PARTICLES AND EFFECTS
========================================= */

function burst(x, y, count, color, force) {
  for (let i = 0; i < count; i++) {
    const a = random(0, Math.PI * 2);
    const speed = random(25, 100) * force;

    particles.push({
      x, y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life: random(.25, .8),
      maxLife: .8,
      size: random(1, 3),
      color
    });
  }
}

function floatingText(x, y, text, color) {
  floatingTexts.push({
    x, y, text, color, life: .9
  });
}

/* =========================================
   UPGRADES
========================================= */

const upgradePool = [
  {
    icon: "♥",
    name: "REINFORCED HULL",
    description: "+30 maximum hull and restore 30 health.",
    apply: () => {
      player.maxHealth += 30;
      player.health = Math.min(player.maxHealth, player.health + 30);
    }
  },
  {
    icon: "◇",
    name: "SHIELD MATRIX",
    description: "+40 maximum shield and faster regeneration.",
    apply: () => {
      player.maxShield += 40;
      player.shield = player.maxShield;
      player.shieldRegen += .6;
    }
  },
  {
    icon: "↯",
    name: "PHASE DRIVE",
    description: "Dash recharges 45% faster.",
    apply: () => {
      player.dashMultiplier *= 1.45;
    }
  },
  {
    icon: "✧",
    name: "SHARD MAGNET",
    description: "Collect energy shards from much further away.",
    apply: () => {
      player.magnet += 110;
    }
  },
  {
    icon: "»",
    name: "AFTERBURNER",
    description: "Increase movement speed by 18%.",
    apply: () => {
      player.speedMultiplier *= 1.18;
    }
  },
  {
    icon: "◎",
    name: "NANOREPAIR",
    description: "Restore 1.8 hull per second when safe.",
    apply: () => {
      regenTimer = 999;
      player.extraHealing += 1.5;
    }
  },
  {
    icon: "✦",
    name: "ENERGY HARVEST",
    description: "Increase score and shard rewards by 30%.",
    apply: () => {
      player.scoreMultiplier *= 1.3;
      player.extraHealing += 1;
    }
  },
  {
    icon: "⬡",
    name: "ARMOR PLATING",
    description: "Reduce incoming damage by 15%.",
    apply: () => {
      player.damageReduction = Math.min(.6, player.damageReduction + .15);
    }
  }
];

function createUpgradeChoices() {
  upgrading = true;
  ui.arenaState.textContent = "EVOLUTION REQUIRED";

  $("upgradeScreen").classList.remove("hidden");

  const container = $("upgradeOptions");
  container.innerHTML = "";

  const choices = [...upgradePool]
    .sort(() => Math.random() - .5)
    .slice(0, 3);

  choices.forEach(upgrade => {
    const card = document.createElement("button");
    card.className = "upgrade-card";

    const icon = document.createElement("div");
    icon.className = "upgrade-icon";
    icon.textContent = upgrade.icon;

    const title = document.createElement("strong");
    title.textContent = upgrade.name;

    const desc = document.createElement("p");
    desc.textContent = upgrade.description;

    card.append(icon, title, desc);

    card.addEventListener("click", () => {
      upgrade.apply();
      upgradesOwned.push(upgrade.name);

      $("upgradeScreen").classList.add("hidden");
      upgrading = false;

      logEvent("Upgrade acquired: " + upgrade.name);
      ui.arenaState.textContent = "FLIGHT ACTIVE";

      lastTime = performance.now();
      requestAnimationFrame(loop);
    });

    container.appendChild(card);
  });
}

/* =========================================
   GAME OVER
========================================= */

function endGame() {
  running = false;
  gameOver = true;

  if (score > best) {
    best = score;
    localStorage.setItem("voidrush_best", best);
  }

  $("finalScore").textContent = formatScore(score);
  $("finalSector").textContent = sector;
  $("finalKills").textContent = kills;

  $("gameOverScreen").classList.remove("hidden");
  ui.arenaState.textContent = "EXPEDITION TERMINATED";

  updateHUD();
}

/* =========================================
   HUD
========================================= */

function updateHUD() {
  ui.score.textContent = formatScore(score);
  ui.best.textContent = formatScore(best);
  ui.sector.textContent = String(sector).padStart(2, "0");
  ui.kills.textContent = String(kills).padStart(2, "0");
  ui.combo.textContent = "x" + combo;

  ui.health.style.width = player.health / player.maxHealth * 100 + "%";
  ui.shield.style.width = player.shield / player.maxShield * 100 + "%";
  ui.dash.style.width = player.dash + "%";

  ui.healthText.textContent = Math.round(player.health) + "%";
  ui.shieldText.textContent = Math.round(player.shield) + "%";
  ui.dashText.textContent = player.dash >= 99 ? "READY" : Math.round(player.dash) + "%";

  ui.position.textContent =
    Math.round(player.x) + " / " + Math.round(player.y);

  $("regenStatus").textContent =
    damageTimer <= 0 ? "ONLINE" : "STANDBY";

  $("dashStatus").textContent =
    player.dash >= 99 ? "READY" : "RECHARGING";
}

/* =========================================
   RENDERING
========================================= */

function render() {
  ctx.save();

  if (shake > 0) {
    ctx.translate(random(-shake, shake), random(-shake, shake));
    shake *= .86;
  }

  ctx.clearRect(-20, -20, W + 40, H + 40);

  // Background.
  ctx.fillStyle = "#e5e5e5";
  ctx.fillRect(-20, -20, W + 40, H + 40);

  // Grid.
  ctx.strokeStyle = "#d9d9d9";
  ctx.lineWidth = .7;

  for (let x = 0; x < W; x += 35) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }

  for (let y = 0; y < H; y += 35) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  // Stars.
  stars.forEach(s => {
    ctx.fillStyle = "#aaa";
    ctx.globalAlpha = .35 + s.size * .15;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.globalAlpha = 1;

  drawShards();
  drawPickups();
  drawEnemies();
  drawParticles();
  drawPlayer();
  drawFloatingTexts();

  ctx.restore();
}

function drawPlayer() {
  const p = player;

  // Trail.
  p.trail.forEach((t, i) => {
    ctx.globalAlpha = (1 - i / p.trail.length) * .17;
    ctx.fillStyle = "#555";
    ctx.beginPath();
    ctx.arc(t.x, t.y, 9 - i * .7, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.globalAlpha = 1;

  if (p.invulnerable > 0 && Math.floor(elapsed * 15) % 2 === 0) {
    ctx.globalAlpha = .45;
  }

  // Shield.
  if (p.shield > 0) {
    ctx.strokeStyle = "#999";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 20, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Spaceship.
  const angle = Math.atan2(p.direction.y, p.direction.x) + Math.PI / 2;

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(angle);

  ctx.fillStyle = "#333";
  ctx.beginPath();
  ctx.moveTo(0, -15);
  ctx.lineTo(10, 12);
  ctx.lineTo(0, 7);
  ctx.lineTo(-10, 12);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(4, 7);
  ctx.lineTo(-4, 7);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawEnemies() {
  enemies.forEach(e => {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.rotation);

    ctx.strokeStyle = e.type === "hunter" ? "#333" : "#777";
    ctx.fillStyle = e.type === "hunter" ? "#555" : "#aaa";
    ctx.lineWidth = 2;

    if (e.type === "seeker") {
      ctx.beginPath();
      ctx.moveTo(0, -e.radius);
      ctx.lineTo(e.radius, 0);
      ctx.lineTo(0, e.radius);
      ctx.lineTo(-e.radius, 0);
      ctx.closePath();
    } else if (e.type === "drifter") {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3;
        const x = Math.cos(a) * e.radius;
        const y = Math.sin(a) * e.radius;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    } else {
      ctx.beginPath();
      ctx.rect(-e.radius, -e.radius, e.radius * 2, e.radius * 2);
    }

    ctx.fill();
    ctx.stroke();
    ctx.restore();
  });
}

function drawShards() {
  shards.forEach(s => {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rotation);

    ctx.fillStyle = "#777";
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(6, 0);
    ctx.lineTo(0, 7);
    ctx.lineTo(-6, 0);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  });
}

function drawPickups() {
  pickups.forEach(p => {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);

    const colors = {
      repair: "#555",
      shield: "#999",
      overcharge: "#333"
    };

    ctx.strokeStyle = colors[p.type];
    ctx.lineWidth = 2;
    ctx.strokeRect(-9, -9, 18, 18);

    ctx.fillStyle = colors[p.type];
    ctx.font = "bold 13px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.fillText(
      p.type === "repair" ? "+" :
      p.type === "shield" ? "◇" : "⚡",
      0, 0
    );

    ctx.restore();
  });
}

function drawParticles() {
  particles.forEach(p => {
    ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.globalAlpha = 1;
}

function drawFloatingTexts() {
  floatingTexts.forEach(t => {
    ctx.globalAlpha = clamp(t.life, 0, 1);
    ctx.fillStyle = t.color;
    ctx.font = "bold 11px monospace";
    ctx.textAlign = "center";
    ctx.fillText(t.text, t.x, t.y);
  });

  ctx.globalAlpha = 1;
}

/* =========================================
   BUTTONS
========================================= */

$("startBtn").addEventListener("click", startGame);
$("retryBtn").addEventListener("click", startGame);
$("pauseBtn").addEventListener("click", pauseGame);
$("resumeBtn").addEventListener("click", pauseGame);

ui.best.textContent = formatScore(best);

player = createPlayer();
render();
