
"use strict";

/* =========================================================
   VOID//RUSH 2.0 — COMPLETE GAME ENGINE
========================================================= */

const $ = id => document.getElementById(id);

const canvas = $("gameCanvas");
const ctx = canvas.getContext("2d");

const ui = {
  score: $("score"),
  best: $("best"),
  sector: $("sector"),
  kills: $("kills"),
  combo: $("combo"),
  arenaState: $("arenaState"),

  start: $("startBtn"),
  retry: $("retryBtn"),
  pause: $("pauseBtn"),
  resume: $("resumeBtn"),

  menu: $("menuOverlay"),
  pauseOverlay: $("pauseOverlay"),
  upgradeOverlay: $("upgradeOverlay"),
  gameOverOverlay: $("gameOverOverlay"),

  upgradeOptions: $("upgradeOptions"),

  hull: $("hullBar"),
  shield: $("shieldBar"),
  dash: $("dashBar"),

  hullText: $("hullText"),
  shieldText: $("shieldText"),
  dashText: $("dashText"),

  finalScore: $("finalScore"),
  finalKills: $("finalKills"),
  finalSector: $("finalSector"),

  eventLog: $("eventLog")
};

/* =========================================================
   CANVAS
========================================================= */

let W = 0;
let H = 0;
let DPR = 1;

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();

  W = Math.max(320, rect.width);
  H = Math.max(320, rect.height);

  DPR = Math.min(window.devicePixelRatio || 1, 2);

  canvas.width = W * DPR;
  canvas.height = H * DPR;

  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

/* =========================================================
   STATE
========================================================= */

let player = null;

let running = false;
let paused = false;
let gameOver = false;
let upgrading = false;

let score = 0;
let kills = 0;
let sector = 1;
let combo = 0;
let comboTimer = 0;

let best = Number(localStorage.getItem("voidrush_best") || 0);

let elapsed = 0;
let sectorProgress = 0;
let spawnTimer = 0;
let shardTimer = 0;
let pickupTimer = 0;

let lastTime = 0;
let screenShake = 0;

let enemies = [];
let shards = [];
let particles = [];
let pickups = [];
let floatingTexts = [];

let keys = {};
let touch = { x: 0, y: 0 };

/* =========================================================
   HELPERS
========================================================= */

const random = (min, max) =>
  Math.random() * (max - min) + min;

const clamp = (value, min, max) =>
  Math.max(min, Math.min(max, value));

const dist = (a, b) =>
  Math.hypot(a.x - b.x, a.y - b.y);

const formatScore = value =>
  Math.floor(value).toLocaleString();

function show(element) {
  if (element) element.classList.remove("hidden");
}

function hide(element) {
  if (element) element.classList.add("hidden");
}

function log(message) {
  if (!ui.eventLog) return;

  const line = document.createElement("div");
  line.textContent = message;

  ui.eventLog.prepend(line);

  while (ui.eventLog.children.length > 5) {
    ui.eventLog.lastElementChild.remove();
  }
}

function textPopup(x, y, text) {
  floatingTexts.push({
    x,
    y,
    text,
    life: 1
  });
}

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

    magnetRange: 100,
    scoreMultiplier: 1,

    hullRegen: 0.65,
    shieldRegen: 2.2,
    dashRegen: 20,

    trail: [],
    upgrades: []
  };
}

/* =========================================================
   HUD
========================================================= */

function updateHUD() {
  if (!player) return;

  ui.score.textContent = formatScore(score);
  ui.best.textContent = formatScore(best);
  ui.sector.textContent = String(sector).padStart(2, "0");
  ui.kills.textContent = kills;
  ui.combo.textContent = `x${Math.max(1, combo)}`;

  ui.hull.style.width =
    `${clamp(player.hull / player.maxHull * 100, 0, 100)}%`;

  ui.shield.style.width =
    `${clamp(player.shield / player.maxShield * 100, 0, 100)}%`;

  ui.dash.style.width =
    `${clamp(player.dash / player.maxDash * 100, 0, 100)}%`;

  ui.hullText.textContent = `${Math.ceil(player.hull)}%`;
  ui.shieldText.textContent = `${Math.ceil(player.shield)}%`;
  ui.dashText.textContent = `${Math.ceil(player.dash)}%`;
}

/* =========================================================
   PARTICLES
========================================================= */

function burst(x, y, amount = 8, color = "#777") {
  for (let i = 0; i < amount; i++) {
    const angle = random(0, Math.PI * 2);
    const speed = random(35, 180);

    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: random(1, 3),
      life: random(0.25, 0.7),
      maxLife: 0.7,
      color
    });
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];

    p.x += p.vx * dt;
    p.y += p.vy * dt;

    p.vx *= 0.98;
    p.vy *= 0.98;

    p.life -= dt;

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
    y = -25;
  } else if (side === 1) {
    x = W + 25;
    y = random(0, H);
  } else if (side === 2) {
    x = random(0, W);
    y = H + 25;
  } else {
    x = -25;
    y = random(0, H);
  }

  const roll = Math.random();

  let type = "seeker";

  if (sector >= 2 && roll > 0.68) {
    type = "drifter";
  }

  if (sector >= 3 && roll > 0.84) {
    type = "hunter";
  }

  const data = enemyTypes[type];

  enemies.push({
    x,
    y,

    radius: data.radius,
    speed: data.speed + sector * 3,

    health: data.health + Math.floor(sector / 4),
    maxHealth: data.health + Math.floor(sector / 4),

    damage: data.damage,
    type,
    color: data.color,

    phase: random(0, Math.PI * 2)
  });
}

function updateEnemies(dt) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];

    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;

    const length = Math.hypot(dx, dy) || 1;

    let vx = dx / length;
    let vy = dy / length;

    if (enemy.type === "drifter") {
      enemy.phase += dt * 2;

      vx += Math.sin(enemy.phase) * 0.35;
      vy += Math.cos(enemy.phase) * 0.35;

      const adjustedLength = Math.hypot(vx, vy) || 1;

      vx /= adjustedLength;
      vy /= adjustedLength;
    }

    enemy.x += vx * enemy.speed * dt;
    enemy.y += vy * enemy.speed * dt;

    if (dist(enemy, player) < enemy.radius + player.radius) {
      damagePlayer(enemy.damage);
    }
  }
}

function destroyEnemy(index) {
  const enemy = enemies[index];

  if (!enemy) return;

  burst(enemy.x, enemy.y, 12, enemy.color);

  enemies.splice(index, 1);

  kills++;
  combo++;
  comboTimer = 3;

  const reward = Math.floor(
    100 * combo * player.scoreMultiplier
  );

  score += reward;

  sectorProgress += 1;

  textPopup(enemy.x, enemy.y, `+${reward}`);

  if (combo >= 5) {
    log(`${combo}× COMBO`);
  }

  updateHUD();
}

/* =========================================================
   PLAYER DAMAGE AND RECOVERY
========================================================= */

function damagePlayer(amount) {
  if (player.invulnerability > 0 || gameOver) return;

  player.invulnerability = 0.7;

  const absorbed = Math.min(player.shield, amount);

  player.shield -= absorbed;

  const remaining = amount - absorbed;

  if (remaining > 0) {
    player.hull -= remaining;
  }

  screenShake = 8;

  burst(player.x, player.y, 7, "#777");

  log("WARNING: HULL IMPACT");

  if (player.hull <= 0) {
    player.hull = 0;
    endGame();
  }

  updateHUD();
}

function updateRecovery(dt) {
  if (player.hull < player.maxHull) {
    player.hull = Math.min(
      player.maxHull,
      player.hull + player.hullRegen * dt
    );
  }

  if (player.shield < player.maxShield) {
    player.shield = Math.min(
      player.maxShield,
      player.shield + player.shieldRegen * dt
    );
  }

  if (player.dash < player.maxDash) {
    player.dash = Math.min(
      player.maxDash,
      player.dash + player.dashRegen * dt
    );
  }
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

function updateShards(dt) {
  for (let i = shards.length - 1; i >= 0; i--) {
    const shard = shards[i];

    const dx = player.x - shard.x;
    const dy = player.y - shard.y;

    const length = Math.hypot(dx, dy) || 1;

    if (length < player.magnetRange) {
      const force = 175;

      shard.x += dx / length * force * dt;
      shard.y += dy / length * force * dt;
    }

    if (length < player.radius + shard.radius + 4) {
      score += 25;

      player.shield = Math.min(
        player.maxShield,
        player.shield + 5
      );

      player.dash = Math.min(
        player.maxDash,
        player.dash + 8
      );

      burst(shard.x, shard.y, 5, "#888");

      textPopup(shard.x, shard.y, "+25");

      shards.splice(i, 1);
    }
  }
}

/* =========================================================
   RECOVERY PICKUPS
========================================================= */

function spawnPickup() {
  const types = ["repair", "shield", "energy"];

  pickups.push({
    x: random(35, W - 35),
    y: random(35, H - 35),

    type: types[Math.floor(Math.random() * types.length)],

    radius: 10,
    life: 14
  });
}

function collectPickup(index) {
  const pickup = pickups[index];

  if (pickup.type === "repair") {
    player.hull = Math.min(
      player.maxHull,
      player.hull + 30
    );

    log("HULL REPAIRED");
  }

  if (pickup.type === "shield") {
    player.shield = Math.min(
      player.maxShield,
      player.shield + 35
    );

    log("SHIELD RESTORED");
  }

  if (pickup.type === "energy") {
    player.dash = player.maxDash;

    log("PHASE ENERGY RESTORED");
  }

  burst(pickup.x, pickup.y, 12, "#888");

  textPopup(pickup.x, pickup.y, "RECOVERED");

  pickups.splice(index, 1);

  updateHUD();
}

function updatePickups(dt) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const pickup = pickups[i];

    pickup.life -= dt;

    if (dist(player, pickup) < player.radius + pickup.radius) {
      collectPickup(i);
      continue;
    }

    if (pickup.life <= 0) {
      pickups.splice(i, 1);
    }
  }
}

/* =========================================================
   MOVEMENT
========================================================= */

function getMovement() {
  let x = 0;
  let y = 0;

  if (keys.ArrowLeft || keys.a || keys.A) x--;
  if (keys.ArrowRight || keys.d || keys.D) x++;

  if (keys.ArrowUp || keys.w || keys.W) y--;
  if (keys.ArrowDown || keys.s || keys.S) y++;

  x += touch.x;
  y += touch.y;

  const length = Math.hypot(x, y);

  if (length > 1) {
    x /= length;
    y /= length;
  }

  return { x, y };
}

function updatePlayer(dt) {
  const movement = getMovement();

  if (player.dashDuration > 0) {
    player.dashDuration -= dt;

    player.x += player.vx * dt;
    player.y += player.vy * dt;
  } else {
    player.vx = movement.x * player.speed;
    player.vy = movement.y * player.speed;

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
  if (!running || paused || upgrading || gameOver) return;

  if (player.dash < 30 || player.dashCooldown > 0) {
    return;
  }

  const movement = getMovement();

  let dx = movement.x;
  let dy = movement.y;

  if (dx === 0 && dy === 0) {
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

  burst(player.x, player.y, 10, "#999");

  log("PHASE DASH ACTIVATED");

  updateHUD();
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
    description: "Increase movement speed by 15%.",
    apply() {
      player.speed *= 1.15;
    }
  },
  {
    name: "SHARD MAGNET",
    description: "Increase collection range by 65.",
    apply() {
      player.magnetRange += 65;
    }
  },
  {
    name: "NANOREPAIR",
    description: "Restore 40 hull and improve regeneration.",
    apply() {
      player.hull = Math.min(player.maxHull, player.hull + 40);
      player.hullRegen += 0.35;
    }
  },
  {
    name: "PHASE DRIVE",
    description: "Improve dash energy recovery by 35%.",
    apply() {
      player.dashRegen *= 1.35;
      player.dash = Math.min(player.maxDash, player.dash + 30);
    }
  },
  {
    name: "OVERCHARGE",
    description: "Increase score from eliminations by 30%.",
    apply() {
      player.scoreMultiplier *= 1.3;
    }
  },
  {
    name: "FORTIFIED SHIELD",
    description: "Increase shield regeneration by 40%.",
    apply() {
      player.shieldRegen *= 1.4;
    }
  }
];

function openUpgradeMenu() {
  running = false;
  upgrading = true;

  show(ui.upgradeOverlay);

  ui.upgradeOptions.innerHTML = "";

  const options = [...upgrades]
    .sort(() => Math.random() - 0.5)
    .slice(0, 3);

  options.forEach((upgrade, index) => {
    const card = document.createElement("button");

    card.className = "upgrade-card";

    card.innerHTML = `
      <span class="upgrade-number">SYSTEM 0${index + 1}</span>
      <strong>${upgrade.name}</strong>
      <p>${upgrade.description}</p>
    `;

    card.addEventListener("click", () => {
      upgrade.apply();

      player.upgrades.push(upgrade.name);

      hide(ui.upgradeOverlay);

      upgrading = false;
      running = true;

      log(`UPGRADE INSTALLED: ${upgrade.name}`);

      updateHUD();

      lastTime = performance.now();
      requestAnimationFrame(gameLoop);
    });

    ui.upgradeOptions.appendChild(card);
  });
}

/* =========================================================
   SECTOR PROGRESSION
========================================================= */

function updateSector(dt) {
  sectorProgress += dt;

  const requirement = 35 + sector * 8;

  if (sectorProgress >= requirement) {
    sectorProgress = 0;
    sector++;

    log(`SECTOR ${sector} ENTERED`);

    openUpgradeMenu();
  }
}

/* =========================================================
   GAME RESET AND START
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
  pickupTimer = 0;

  enemies = [];
  shards = [];
  particles = [];
  pickups = [];
  floatingTexts = [];

  screenShake = 0;

  player = createPlayer();

  ui.eventLog.innerHTML = "";

  log("SYSTEM INITIALIZED");

  updateHUD();
}

function startGame() {
  resetGame();

  running = true;
  paused = false;
  gameOver = false;
  upgrading = false;

  hide(ui.menu);
  hide(ui.pauseOverlay);
  hide(ui.upgradeOverlay);
  hide(ui.gameOverOverlay);

  ui.arenaState.textContent = "SYSTEM ACTIVE";

  log("PILOT CONNECTED");

  lastTime = performance.now();

  requestAnimationFrame(gameLoop);
}

/* =========================================================
   PAUSE
========================================================= */

function pauseGame() {
  if (gameOver || upgrading || !player) return;

  if (paused) {
    paused = false;
    running = true;

    hide(ui.pauseOverlay);

    ui.arenaState.textContent = "SYSTEM ACTIVE";

    lastTime = performance.now();

    requestAnimationFrame(gameLoop);
  } else if (running) {
    paused = true;
    running = false;

    show(ui.pauseOverlay);

    ui.arenaState.textContent = "SYSTEM PAUSED";
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

    localStorage.setItem(
      "voidrush_best",
      String(best)
    );
  }

  ui.finalScore.textContent = formatScore(score);
  ui.finalKills.textContent = kills;
  ui.finalSector.textContent = sector;

  ui.arenaState.textContent = "PILOT SIGNAL LOST";

  burst(player.x, player.y, 35, "#555");

  updateHUD();

  show(ui.gameOverOverlay);
}

/* =========================================================
   KEYBOARD INPUT
========================================================= */

window.addEventListener("keydown", event => {
  keys[event.key] = true;

  if (
    ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "]
      .includes(event.key)
  ) {
    event.preventDefault();
  }

  if (event.repeat) return;

  if (event.key === " " || event.key === "Shift") {
    dash();
  }

  if (
    event.key.toLowerCase() === "p" ||
    event.key === "Escape"
  ) {
    if (running || paused) {
      pauseGame();
    }
  }
});

window.addEventListener("keyup", event => {
  keys[event.key] = false;
});

window.addEventListener("blur", () => {
  if (running) pauseGame();
});

/* =========================================================
   TOUCH INPUT
========================================================= */

document.querySelectorAll("[data-direction]").forEach(button => {
  const direction = button.dataset.direction;

  const vectors = {
    up: [0, -1],
    down: [0, 1],
    left: [-1, 0],
    right: [1, 0]
  };

  const vector = vectors[direction];

  if (!vector) return;

  let active = false;

  function press(event) {
    event.preventDefault();

    if (active) return;

    active = true;

    touch.x += vector[0];
    touch.y += vector[1];

    button.setPointerCapture?.(event.pointerId);
  }

  function release(event) {
    if (!active) return;

    active = false;

    touch.x -= vector[0];
    touch.y -= vector[1];
  }

  button.addEventListener("pointerdown", press);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
});

$("mobileDashBtn").addEventListener("pointerdown", event => {
  event.preventDefault();
  dash();
});

/* =========================================================
   DRAWING
========================================================= */

function drawBackground() {
  ctx.fillStyle = "#f0f0f0";
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

  if (
    player.invulnerability > 0 &&
    Math.floor(elapsed * 15) % 2 === 0
  ) {
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
    ctx.arc(
      enemy.x,
      enemy.y,
      enemy.radius,
      0,
      Math.PI * 2
    );

    ctx.fill();
    ctx.stroke();

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
        width * enemy.health / enemy.maxHealth,
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
   UPDATE
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
  pickupTimer += dt;

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

  if (pickupTimer >= 16) {
    pickupTimer = 0;

    if (Math.random() < 0.75) {
      spawnPickup();
    }
  }

  if (comboTimer > 0) {
    comboTimer -= dt;
  } else {
    combo = 0;
  }

  screenShake = Math.max(0, screenShake - dt * 25);

  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const item = floatingTexts[i];

    item.y -= 25 * dt;
    item.life -= dt;

    if (item.life <= 0) {
      floatingTexts.splice(i, 1);
    }
  }

  updateHUD();
}

/* =========================================================
   GAME LOOP
========================================================= */

function gameLoop(timestamp) {
  if (!running || paused || gameOver || upgrading) return;

  const dt = Math.min(
    (timestamp - lastTime) / 1000,
    0.033
  );

  lastTime = timestamp;

  update(dt);
  render();

  if (running && !paused && !upgrading && !gameOver) {
    requestAnimationFrame(gameLoop);
  }
}

/* =========================================================
   BUTTONS
========================================================= */

ui.start.addEventListener("click", startGame);
ui.retry.addEventListener("click", startGame);
ui.pause.addEventListener("click", pauseGame);
ui.resume.addEventListener("click", pauseGame);

/* =========================================================
   INITIALIZATION
========================================================= */

function initialize() {
  resizeCanvas();

  player = createPlayer();

  running = false;
  paused = false;
  gameOver = false;
  upgrading = false;

  ui.best.textContent = formatScore(best);
  ui.arenaState.textContent = "AWAITING PILOT";

  hide(ui.pauseOverlay);
  hide(ui.upgradeOverlay);
  hide(ui.gameOverOverlay);

  show(ui.menu);

  updateHUD();
  render();

  console.log("VOID//RUSH 2.0 successfully initialized.");
}

initialize();
