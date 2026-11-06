/* =========================================================
   VOID//RUSH 2.0
   Complete game engine
   Monochrome edition
========================================================= */

"use strict";

/* =========================================================
   DOM HELPERS
========================================================= */

const $ = (id) => document.getElementById(id);

const getElement = (...ids) => {
  for (const id of ids) {
    const element = $(id);
    if (element) return element;
  }
  return null;
};

const canvas = getElement("gameCanvas", "arena", "gameCanvas2") ||
  document.querySelector("canvas");

if (!canvas) {
  throw new Error("VOID//RUSH: Could not find the game canvas.");
}

const ctx = canvas.getContext("2d");

const ui = {
  score: getElement("score"),
  best: getElement("best"),
  sector: getElement("sector"),
  kills: getElement("kills"),
  combo: getElement("combo"),
  arenaState: getElement("arenaState"),

  startBtn: getElement("startBtn"),
  retryBtn: getElement("retryBtn"),
  pauseBtn: getElement("pauseBtn"),
  resumeBtn: getElement("resumeBtn"),

  menu: getElement("menuOverlay", "menuScreen"),
  gameOver: getElement("gameOverOverlay", "gameOverScreen"),
  pause: getElement("pauseOverlay", "pauseScreen"),
  upgrade: getElement("upgradeOverlay", "upgradeScreen"),

  hull: getElement("hullBar", "healthBar"),
  shield: getElement("shieldBar"),
  dash: getElement("dashBar"),

  hullText: getElement("hullText"),
  shieldText: getElement("shieldText"),
  dashText: getElement("dashText"),

  finalScore: getElement("finalScore"),
  finalKills: getElement("finalKills"),
  finalSector: getElement("finalSector"),

  eventLog: getElement("eventLog")
};

/* =========================================================
   CANVAS SETUP
========================================================= */

let W = 0;
let H = 0;
let DPR = 1;

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();

  W = Math.max(320, rect.width);
  H = Math.max(320, rect.height);

  DPR = Math.min(window.devicePixelRatio || 1, 2);

  canvas.width = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);

  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

/* =========================================================
   GAME STATE
========================================================= */

let running = false;
let paused = false;
let gameOver = false;
let upgrading = false;

let score = 0;
let best = Number(localStorage.getItem("voidrush_best") || 0);
let kills = 0;
let sector = 1;
let combo = 0;
let comboTimer = 0;

let elapsed = 0;
let sectorProgress = 0;
let spawnTimer = 0;
let shardTimer = 0;
let lastTime = 0;
let screenShake = 0;

let enemies = [];
let shards = [];
let particles = [];
let pickups = [];
let floatingTexts = [];

let keys = {};
let touchDirection = { x: 0, y: 0 };

let player;
let selectedUpgrade = null;

/* =========================================================
   PLAYER
========================================================= */

function createPlayer() {
  return {
    x: W / 2,
    y: H / 2,

    radius: 12,

    vx: 0,
    vy: 0,

    speed: 250,

    hull: 100,
    maxHull: 100,

    shield: 50,
    maxShield: 50,

    dash: 100,
    maxDash: 100,

    dashCooldown: 0,
    dashDuration: 0,

    invulnerability: 0,

    regenTimer: 0,
    extraHealing: 0,

    magnetRange: 95,

    damage: 1,
    fireRate: 1,

    trail: [],
    upgrades: []
  };
}

/* =========================================================
   GENERAL HELPERS
========================================================= */

const random = (min, max) => Math.random() * (max - min) + min;

const clamp = (value, min, max) =>
  Math.max(min, Math.min(max, value));

const distance = (a, b) =>
  Math.hypot(a.x - b.x, a.y - b.y);

function formatScore(value) {
  return Math.floor(value).toLocaleString();
}

function showOverlay(element) {
  if (element) element.classList.remove("hidden");
}

function hideOverlay(element) {
  if (element) element.classList.add("hidden");
}

function logEvent(message) {
  if (!ui.eventLog) return;

  const entry = document.createElement("div");
  entry.textContent = message;

  ui.eventLog.prepend(entry);

  while (ui.eventLog.children.length > 5) {
    ui.eventLog.lastElementChild.remove();
  }
}

function floatingText(x, y, text) {
  floatingTexts.push({
    x,
    y,
    text,
    life: 1
  });
}

/* =========================================================
   HUD
========================================================= */

function updateHUD() {
  if (ui.score) ui.score.textContent = formatScore(score);
  if (ui.best) ui.best.textContent = formatScore(best);
  if (ui.sector) ui.sector.textContent = sector;
  if (ui.kills) ui.kills.textContent = kills;
  if (ui.combo) ui.combo.textContent = `x${Math.max(1, combo)}`;

  if (!player) return;

  if (ui.hull) {
    ui.hull.style.width =
      `${(player.hull / player.maxHull) * 100}%`;
  }

  if (ui.shield) {
    ui.shield.style.width =
      `${(player.shield / player.maxShield) * 100}%`;
  }

  if (ui.dash) {
    ui.dash.style.width =
      `${(player.dash / player.maxDash) * 100}%`;
  }

  if (ui.hullText) {
    ui.hullText.textContent = `${Math.ceil(player.hull)}%`;
  }

  if (ui.shieldText) {
    ui.shieldText.textContent = `${Math.ceil(player.shield)}%`;
  }

  if (ui.dashText) {
    ui.dashText.textContent = `${Math.ceil(player.dash)}%`;
  }
}

/* =========================================================
   PARTICLES
========================================================= */

function createParticles(x, y, amount = 8, color = "#777") {
  for (let i = 0; i < amount; i++) {
    const angle = random(0, Math.PI * 2);
    const speed = random(35, 180);

    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: random(0.25, 0.7),
      maxLife: 0.7,
      size: random(1, 3),
      color
    });
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;

    p.vx *= 0.98;
    p.vy *= 0.98;

    if (p.life <= 0) {
      particles.splice(i, 1);
    }
  }
}

/* =========================================================
   ENEMIES
========================================================= */

const enemyTypes = {
  seeker: {
    radius: 10,
    speed: 105,
    health: 1,
    damage: 10,
    color: "#555"
  },

  drifter: {
    radius: 15,
    speed: 65,
    health: 3,
    damage: 15,
    color: "#999"
  },

  hunter: {
    radius: 12,
    speed: 155,
    health: 2,
    damage: 12,
    color: "#222"
  }
};

function spawnEnemy() {
  const side = Math.floor(random(0, 4));

  let x;
  let y;

  if (side === 0) {
    x = random(0, W);
    y = -30;
  } else if (side === 1) {
    x = W + 30;
    y = random(0, H);
  } else if (side === 2) {
    x = random(0, W);
    y = H + 30;
  } else {
    x = -30;
    y = random(0, H);
  }

  const roll = Math.random();

  let type = "seeker";

  if (sector >= 2 && roll > 0.68) {
    type = "drifter";
  }

  if (sector >= 3 && roll > 0.82) {
    type = "hunter";
  }

  const data = enemyTypes[type];

  enemies.push({
    x,
    y,
    vx: 0,
    vy: 0,

    type,

    radius: data.radius,
    speed: data.speed + sector * 3,
    health: data.health + Math.floor(sector / 4),
    maxHealth: data.health + Math.floor(sector / 4),
    damage: data.damage,

    color: data.color,

    phase: random(0, Math.PI * 2)
  });
}

function updateEnemies(dt) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];

    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;

    const dist = Math.hypot(dx, dy) || 1;

    let directionX = dx / dist;
    let directionY = dy / dist;

    if (enemy.type === "drifter") {
      enemy.phase += dt * 2;

      directionX += Math.sin(enemy.phase) * 0.35;
      directionY += Math.cos(enemy.phase) * 0.35;
    }

    const length = Math.hypot(directionX, directionY) || 1;

    directionX /= length;
    directionY /= length;

    enemy.vx = directionX * enemy.speed;
    enemy.vy = directionY * enemy.speed;

    enemy.x += enemy.vx * dt;
    enemy.y += enemy.vy * dt;

    if (dist < enemy.radius + player.radius) {
      damagePlayer(enemy.damage);
    }
  }
}

function destroyEnemy(index) {
  const enemy = enemies[index];

  if (!enemy) return;

  createParticles(enemy.x, enemy.y, 12, enemy.color);

  enemies.splice(index, 1);

  kills++;
  combo++;
  comboTimer = 3;

  const reward = 100 * Math.max(1, combo);

  score += reward;
  sectorProgress += 1;

  floatingText(enemy.x, enemy.y, `+${reward}`);

  if (combo >= 5) {
    logEvent(`${combo}× COMBO ACHIEVED`);
  }

  updateHUD();
}

/* =========================================================
   DAMAGE AND RECOVERY
========================================================= */

function damagePlayer(amount) {
  if (player.invulnerability > 0 || gameOver) return;

  player.invulnerability = 0.7;

  if (player.shield > 0) {
    const absorbed = Math.min(player.shield, amount);

    player.shield -= absorbed;
    amount -= absorbed;
  }

  if (amount > 0) {
    player.hull -= amount;
  }

  screenShake = 8;

  createParticles(player.x, player.y, 7, "#777");

  logEvent("WARNING: HULL IMPACT");

  if (player.hull <= 0) {
    player.hull = 0;
    endGame();
  }

  updateHUD();
}

function updateRecovery(dt) {
  // Passive hull recovery.
  if (player.hull < player.maxHull) {
    player.regenTimer += dt;

    if (player.regenTimer >= 2.5) {
      player.hull = Math.min(
        player.maxHull,
        player.hull + 0.8 * dt
      );
    }
  }

  // Shield recovery.
  if (player.shield < player.maxShield) {
    player.shield = Math.min(
      player.maxShield,
      player.shield + 2.2 * dt
    );
  }

  // Dash energy recovery.
  if (player.dash < player.maxDash) {
    player.dash = Math.min(
      player.maxDash,
      player.dash + 19 * dt
    );
  }

  updateHUD();
}

/* =========================================================
   ENERGY SHARDS
========================================================= */

function spawnShard() {
  shards.push({
    x: random(25, W - 25),
    y: random(25, H - 25),
    radius: 5,
    phase: random(0, Math.PI * 2)
  });
}

function collectShard(index) {
  const shard = shards[index];

  score += 25;
  player.shield = Math.min(player.maxShield, player.shield + 5);
  player.dash = Math.min(player.maxDash, player.dash + 8);

  createParticles(shard.x, shard.y, 5, "#aaa");

  floatingText(shard.x, shard.y, "+25");

  shards.splice(index, 1);

  updateHUD();
}

function updateShards(dt) {
  for (let i = shards.length - 1; i >= 0; i--) {
    const shard = shards[i];

    const dx = player.x - shard.x;
    const dy = player.y - shard.y;

    const dist = Math.hypot(dx, dy) || 1;

    if (dist < player.magnetRange) {
      const force = 170;

      shard.x += (dx / dist) * force * dt;
      shard.y += (dy / dist) * force * dt;
    }

    if (dist < player.radius + shard.radius + 4) {
      collectShard(i);
    }
  }
}

/* =========================================================
   PICKUPS
========================================================= */

function spawnPickup() {
  const types = ["repair", "shield", "energy"];

  pickups.push({
    x: random(35, W - 35),
    y: random(35, H - 35),
    type: types[Math.floor(Math.random() * types.length)],
    life: 12,
    radius: 9
  });
}

function collectPickup(index) {
  const pickup = pickups[index];

  if (pickup.type === "repair") {
    player.hull = Math.min(player.maxHull, player.hull + 25);
    logEvent("HULL REPAIRED");
  }

  if (pickup.type === "shield") {
    player.shield = Math.min(player.maxShield, player.shield + 30);
    logEvent("SHIELD RESTORED");
  }

  if (pickup.type === "energy") {
    player.dash = player.maxDash;
    logEvent("DASH SYSTEM RECHARGED");
  }

  floatingText(pickup.x, pickup.y, "RECOVERED");

  createParticles(pickup.x, pickup.y, 12, "#888");

  pickups.splice(index, 1);

  updateHUD();
}

function updatePickups(dt) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const pickup = pickups[i];

    pickup.life -= dt;

    if (distance(player, pickup) < player.radius + pickup.radius) {
      collectPickup(i);
      continue;
    }

    if (pickup.life <= 0) {
      pickups.splice(i, 1);
    }
  }
}

/* =========================================================
   PLAYER MOVEMENT
========================================================= */

function getMovement() {
  let x = 0;
  let y = 0;

  if (keys.ArrowLeft || keys.a || keys.A) x--;
  if (keys.ArrowRight || keys.d || keys.D) x++;
  if (keys.ArrowUp || keys.w || keys.W) y--;
  if (keys.ArrowDown || keys.s || keys.S) y++;

  x += touchDirection.x;
  y += touchDirection.y;

  const length = Math.hypot(x, y);

  if (length > 1) {
    x /= length;
    y /= length;
  }

  return { x, y };
}

function updatePlayer(dt) {
  const movement = getMovement();

  const speed = player.speed;

  if (player.dashDuration > 0) {
    player.dashDuration -= dt;

    player.x += player.vx * dt;
    player.y += player.vy * dt;
  } else {
    player.vx = movement.x * speed;
    player.vy = movement.y * speed;

    player.x += player.vx * dt;
    player.y += player.vy * dt;
  }

  player.x = clamp(player.x, player.radius, W - player.radius);
  player.y = clamp(player.y, player.radius, H - player.radius);

  player.invulnerability = Math.max(
    0,
    player.invulnerability - dt
  );

  player.dashCooldown = Math.max(
    0,
    player.dashCooldown - dt
  );

  player.trail.push({
    x: player.x,
    y: player.y,
    life: 0.35
  });

  if (player.trail.length > 12) {
    player.trail.shift();
  }

  for (const point of player.trail) {
    point.life -= dt;
  }

  player.trail = player.trail.filter(p => p.life > 0);
}

function dash() {
  if (!running || paused || upgrading) return;

  if (player.dash < 30 || player.dashCooldown > 0) {
    return;
  }

  const movement = getMovement();

  let dx = movement.x;
  let dy = movement.y;

  if (dx === 0 && dy === 0) {
    dx = 0;
    dy = -1;
  }

  const length = Math.hypot(dx, dy) || 1;

  dx /= length;
  dy /= length;

  player.vx = dx * 850;
  player.vy = dy * 850;

  player.dash -= 30;
  player.dashDuration = 0.17;
  player.dashCooldown = 0.65;
  player.invulnerability = 0.3;

  createParticles(player.x, player.y, 10, "#aaa");

  logEvent("PHASE DASH ACTIVATED");

  updateHUD();
}

/* =========================================================
   SECTORS
========================================================= */

function updateSector(dt) {
  sectorProgress += dt * 0.15;

  const requirement = 18 + sector * 7;

  if (sectorProgress >= requirement) {
    sectorProgress = 0;
    sector++;

    logEvent(`SECTOR ${sector} ENTERED`);

    openUpgradeMenu();
  }
}

/* =========================================================
   UPGRADES
========================================================= */

const upgrades = [
  {
    name: "REINFORCED HULL",
    description: "+25 maximum hull and restore 25 hull.",
    apply() {
      player.maxHull += 25;
      player.hull = Math.min(player.maxHull, player.hull + 25);
    }
  },
  {
    name: "SHIELD MATRIX",
    description: "+25 maximum shield and restore 25 shield.",
    apply() {
      player.maxShield += 25;
      player.shield = Math.min(player.maxShield, player.shield + 25);
    }
  },
  {
    name: "AFTERBURNER",
    description: "Increase movement speed by 12%.",
    apply() {
      player.speed *= 1.12;
    }
  },
  {
    name: "SHARD MAGNET",
    description: "Increase energy collection range.",
    apply() {
      player.magnetRange += 65;
    }
  },
  {
    name: "NANOREPAIR",
    description: "Restore 35 hull immediately.",
    apply() {
      player.hull = Math.min(player.maxHull, player.hull + 35);
    }
  },
  {
    name: "PHASE DRIVE",
    description: "Increase dash energy recovery.",
    apply() {
      player.dash = Math.min(player.maxDash, player.dash + 40);
      player.dashCooldown *= 0.75;
    }
  },
  {
    name: "OVERCHARGE",
    description: "Increase score gained from enemy eliminations.",
    apply() {
      player.damage += 1;
    }
  }
];

function openUpgradeMenu() {
  if (gameOver) return;

  running = false;
  upgrading = true;

  showOverlay(ui.upgrade);

  const options = [...upgrades]
    .sort(() => Math.random() - 0.5)
    .slice(0, 3);

  const slots = document.querySelectorAll(".upgrade-card");

  slots.forEach((slot, index) => {
    const upgrade = options[index];

    if (!upgrade) {
      slot.style.display = "none";
      return;
    }

    slot.style.display = "";

    const title = slot.querySelector("h3, h2, .upgrade-title");
    const description = slot.querySelector("p, .upgrade-description");

    if (title) title.textContent = upgrade.name;
    if (description) description.textContent = upgrade.description;

    slot.onclick = () => {
      upgrade.apply();

      player.upgrades.push(upgrade.name);

      hideOverlay(ui.upgrade);

      upgrading = false;
      running = true;

      logEvent(`SYSTEM UPGRADED: ${upgrade.name}`);

      updateHUD();
      lastTime = performance.now();
      requestAnimationFrame(gameLoop);
    };
  });

  if (slots.length === 0) {
    // Fallback: automatically choose an upgrade if no cards exist.
    options[0].apply();

    upgrading = false;
    running = true;

    hideOverlay(ui.upgrade);
    updateHUD();

    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
  }
}

/* =========================================================
   GAME START / RESET
========================================================= */

function resetGame() {
  score = 0;
  kills = 0;
  sector = 1;
  combo = 0;
  comboTimer = 0;

  elapsed = 0;
  sectorProgress = 0;
  spawnTimer = 0;
  shardTimer = 0;

  enemies = [];
  shards = [];
  particles = [];
  pickups = [];
  floatingTexts = [];

  screenShake = 0;

  player = createPlayer();

  updateHUD();

  if (ui.eventLog) {
    ui.eventLog.innerHTML = "";
  }

  logEvent("SYSTEM INITIALIZED");
}

function startGame() {
  resetGame();

  running = true;
  paused = false;
  gameOver = false;
  upgrading = false;

  hideOverlay(ui.menu);
  hideOverlay(ui.gameOver);
  hideOverlay(ui.pause);
  hideOverlay(ui.upgrade);

  if (ui.arenaState) {
    ui.arenaState.textContent = "SYSTEM ACTIVE";
  }

  logEvent("PILOT CONNECTED");

  lastTime = performance.now();

  requestAnimationFrame(gameLoop);
}

/* =========================================================
   PAUSE / RESUME
========================================================= */

function pauseGame() {
  if (gameOver || upgrading || !player) return;

  if (paused) {
    paused = false;
    running = true;

    hideOverlay(ui.pause);

    if (ui.arenaState) {
      ui.arenaState.textContent = "SYSTEM ACTIVE";
    }

    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
  } else {
    paused = true;
    running = false;

    showOverlay(ui.pause);

    if (ui.arenaState) {
      ui.arenaState.textContent = "SYSTEM PAUSED";
    }
  }
}

/* =========================================================
   GAME OVER
========================================================= */

function endGame() {
  running = false;
  paused = false;
  gameOver = true;

  if (score > best) {
    best = score;
    localStorage.setItem("voidrush_best", best);
  }

  if (ui.finalScore) {
    ui.finalScore.textContent = formatScore(score);
  }

  if (ui.finalKills) {
    ui.finalKills.textContent = kills;
  }

  if (ui.finalSector) {
    ui.finalSector.textContent = sector;
  }

  if (ui.arenaState) {
    ui.arenaState.textContent = "PILOT SIGNAL LOST";
  }

  createParticles(player.x, player.y, 35, "#555");

  updateHUD();

  showOverlay(ui.gameOver);
}

/* =========================================================
   INPUT
========================================================= */

window.addEventListener("keydown", (event) => {
  keys[event.key] = true;

  if (
    ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "]
      .includes(event.key)
  ) {
    event.preventDefault();
  }

  if (event.key === " " || event.key === "Shift") {
    dash();
  }

  if (event.key.toLowerCase() === "p" || event.key === "Escape") {
    if (running || paused) pauseGame();
  }
});

window.addEventListener("keyup", (event) => {
  keys[event.key] = false;
});

window.addEventListener("blur", () => {
  if (running) pauseGame();
});

/* =========================================================
   MOBILE TOUCH CONTROLS
========================================================= */

function setupTouchControls() {
  const directions = {
    up: [0, -1],
    down: [0, 1],
    left: [-1, 0],
    right: [1, 0]
  };

  for (const [name, vector] of Object.entries(directions)) {
    const button = getElement(
      `move${name.charAt(0).toUpperCase() + name.slice(1)}`,
      `${name}Btn`
    );

    if (!button) continue;

    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      touchDirection.x += vector[0];
      touchDirection.y += vector[1];
    });

    const release = () => {
      touchDirection.x -= vector[0];
      touchDirection.y -= vector[1];
    };

    button.addEventListener("pointerup", release);
    button.addEventListener("pointerleave", release);
    button.addEventListener("pointercancel", release);
  }

  const dashButton = getElement("dashBtn", "touchDash");

  if (dashButton) {
    dashButton.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      dash();
    });
  }
}

setupTouchControls();

/* =========================================================
   GAME UPDATE
========================================================= */

function update(dt) {
  if (!running || paused || gameOver || upgrading) return;

  elapsed += dt;

  updatePlayer(dt);
  updateEnemies(dt);
  updateShards(dt);
  updatePickups(dt);
  updateParticles(dt);
  updateRecovery(dt);
  updateSector(dt);

  spawnTimer += dt;
  shardTimer += dt;

  const spawnInterval = Math.max(
    0.38,
    1.35 - sector * 0.055
  );

  if (spawnTimer >= spawnInterval) {
    spawnTimer = 0;
    spawnEnemy();
  }

  if (shardTimer >= 2.1) {
    shardTimer = 0;
    spawnShard();
  }

  if (elapsed > 15 && Math.random() < dt * 0.025) {
    spawnPickup();
  }

  if (comboTimer > 0) {
    comboTimer -= dt;
  } else {
    combo = 0;
  }

  screenShake = Math.max(0, screenShake - dt * 25);

  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    floatingTexts[i].y -= 25 * dt;
    floatingTexts[i].life -= dt;

    if (floatingTexts[i].life <= 0) {
      floatingTexts.splice(i, 1);
    }
  }

  updateHUD();
}

/* =========================================================
   DRAWING
========================================================= */

function drawBackground() {
  ctx.fillStyle = "#f1f1f1";
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "rgba(0,0,0,0.055)";
  ctx.lineWidth = 1;

  const grid = 36;

  for (let x = 0; x < W; x += grid) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }

  for (let y = 0; y < H; y += grid) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
}

function drawPlayer() {
  if (!player) return;

  for (const point of player.trail) {
    ctx.globalAlpha = point.life * 0.35;
    ctx.fillStyle = "#555";

    ctx.beginPath();
    ctx.arc(
      point.x,
      point.y,
      player.radius * point.life,
      0,
      Math.PI * 2
    );

    ctx.fill();
  }

  ctx.globalAlpha = 1;

  if (player.invulnerability > 0 && Math.floor(elapsed * 15) % 2 === 0) {
    return;
  }

  ctx.save();
  ctx.translate(player.x, player.y);

  ctx.fillStyle = "#222";
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.moveTo(0, -16);
  ctx.lineTo(12, 11);
  ctx.lineTo(0, 6);
  ctx.lineTo(-12, 11);
  ctx.closePath();

  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

function drawEnemies() {
  for (const enemy of enemies) {
    ctx.fillStyle = enemy.color;
    ctx.strokeStyle = "#222";
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Enemy health indicator.
    if (enemy.health < enemy.maxHealth) {
      const width = enemy.radius * 2;

      ctx.fillStyle = "#ccc";
      ctx.fillRect(
        enemy.x - enemy.radius,
        enemy.y - enemy.radius - 7,
        width,
        3
      );

      ctx.fillStyle = "#222";
      ctx.fillRect(
        enemy.x - enemy.radius,
        enemy.y - enemy.radius - 7,
        width * (enemy.health / enemy.maxHealth),
        3
      );
    }
  }
}

function drawShards() {
  for (const shard of shards) {
    shard.phase += 0.04;

    const pulse = Math.sin(shard.phase) * 2;

    ctx.fillStyle = "#777";

    ctx.beginPath();
    ctx.arc(
      shard.x,
      shard.y,
      shard.radius + pulse,
      0,
      Math.PI * 2
    );

    ctx.fill();
  }
}

function drawPickups() {
  for (const pickup of pickups) {
    const labels = {
      repair: "+",
      shield: "S",
      energy: "D"
    };

    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.arc(
      pickup.x,
      pickup.y,
      pickup.radius,
      0,
      Math.PI * 2
    );

    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#222";
    ctx.font = "bold 12px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.fillText(
      labels[pickup.type],
      pickup.x,
      pickup.y
    );
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
    ctx.fillStyle = p.color;

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
}

function drawFloatingTexts() {
  for (const item of floatingTexts) {
    ctx.globalAlpha = clamp(item.life, 0, 1);
    ctx.fillStyle = "#333";
    ctx.font = "bold 12px Arial";
    ctx.textAlign = "center";

    ctx.fillText(item.text, item.x, item.y);
  }

  ctx.globalAlpha = 1;
}

function render() {
  if (!ctx) return;

  ctx.save();

  if (screenShake > 0) {
    ctx.translate(
      random(-screenShake, screenShake),
      random(-screenShake, screenShake)
    );
  }

  drawBackground();
  drawShards();
  drawPickups();
  drawEnemies();
  drawParticles();
  drawPlayer();
  drawFloatingTexts();

  ctx.restore();
}

/* =========================================================
   MAIN GAME LOOP
========================================================= */

function gameLoop(timestamp) {
  if (!running || paused || gameOver || upgrading) return;

  const dt = Math.min((timestamp - lastTime) / 1000, 0.033);

  lastTime = timestamp;

  update(dt);
  render();

  if (running) {
    requestAnimationFrame(gameLoop);
  }
}

/* =========================================================
   BUTTONS
========================================================= */

if (ui.startBtn) {
  ui.startBtn.addEventListener("click", startGame);
}

if (ui.retryBtn) {
  ui.retryBtn.addEventListener("click", startGame);
}

if (ui.pauseBtn) {
  ui.pauseBtn.addEventListener("click", pauseGame);
}

if (ui.resumeBtn) {
  ui.resumeBtn.addEventListener("click", pauseGame);
}

/* =========================================================
   INITIALIZATION
========================================================= */

// IMPORTANT: Create the player before rendering.
player = createPlayer();

updateHUD();

if (ui.arenaState) {
  ui.arenaState.textContent = "AWAITING PILOT";
}

if (ui.best) {
  ui.best.textContent = formatScore(best);
}

hideOverlay(ui.pause);
hideOverlay(ui.gameOver);
hideOverlay(ui.upgrade);

// Keep the menu visible on startup.
render();

console.log("VOID//RUSH 2.0 — SYSTEM ONLINE");
