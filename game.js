(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const hudScore = document.getElementById('score');
  const hudLevel = document.getElementById('level');
  const hudStatus = document.getElementById('status');

  // Responsive-ish: keep aspect, fit to screen width
  function resize() {
    const maxW = Math.min(window.innerWidth, 520);
    const ratio = canvas.height / canvas.width;
    canvas.style.width = maxW + 'px';
    canvas.style.height = (maxW * ratio) + 'px';
  }
  window.addEventListener('resize', resize);
  resize();

  // ===== Game State =====
  const W = canvas.width, H = canvas.height;

  const player = {
    x: W/2, y: H-60, w: 40, h: 14,
    speed: 420,
    vx: 0,
    fireCd: 0.28,
    nextFire: 0,
    rapidUntil: 0,
    tripleUntil: 0,
    shield: false
  };

  let score = 0;
  let lives = 3;
  let level = 1;

  const bullets = [];       // player bullets
  const ebullets = [];      // enemy bullets
  const enemies = [];
  const powerups = [];

  let spawnTimer = 0;
  let levelSpawned = 0;
  let levelTarget = 0;
  let spawning = true;

  // Difficulty settings
  const cfg = {
    baseEnemySpeed: 85,
    speedPerLevel: 10,
    baseSpawn: 1.15,
    spawnDecay: 0.07,
    minSpawn: 0.32,
    baseEnemies: 12,
    enemiesGrowth: 4,
    maxOnScreenBase: 7,
    maxOnScreenGrowth: 1,

    bossEvery: 5,
    bossHPBase: 16,
    bossHPGrowth: 5,
    bossShootInterval: 1.05,
    bossSpawnInterval: 1.8,

    powerupChanceBase: 0.07,
    powerupChancePerLevel: 0.01
  };

  // Input (touch-friendly)
  let leftDown = false, rightDown = false;

  const btnLeft = document.getElementById('left');
  const btnRight = document.getElementById('right');
  const btnFire = document.getElementById('fire');

  const down = (el, fn) => {
    el.addEventListener('pointerdown', e => { e.preventDefault(); fn(true); });
    el.addEventListener('pointerup',   e => { e.preventDefault(); fn(false); });
    el.addEventListener('pointercancel', e => { e.preventDefault(); fn(false); });
    el.addEventListener('pointerleave', e => { e.preventDefault(); fn(false); });
  };

  down(btnLeft, on => { leftDown = on; if (on) rightDown = false; });
  down(btnRight,on => { rightDown = on; if (on) leftDown = false; });
  btnFire.addEventListener('pointerdown', e => { e.preventDefault(); fire(); });

  // Optional keyboard for desktop
  window.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') leftDown = true;
    if (e.key === 'ArrowRight') rightDown = true;
    if (e.key === ' ') fire();
  });
  window.addEventListener('keyup', e => {
    if (e.key === 'ArrowLeft') leftDown = false;
    if (e.key === 'ArrowRight') rightDown = false;
  });

  // ===== Helpers =====
  const clamp = (v,min,max)=>Math.max(min,Math.min(max,v));
  const rnd = (a,b)=>a+Math.random()*(b-a);
  const choice = (a,b)=> (Math.random()<0.5?a:b);

  function rectHit(ax,ay,aw,ah,bx,by,bw,bh){
    return ax < bx+bw && ax+aw > bx && ay < by+bh && ay+ah > by;
  }

  function startLevel(lv) {
    level = lv;
    levelSpawned = 0;
    levelTarget = cfg.baseEnemies + cfg.enemiesGrowth*(level-1);
    spawning = true;
    spawnTimer = 0;
    hudLevel.textContent = `Level: ${level}`;
  }

  function hasBossAlive(){
    return enemies.some(e => e.type === 'boss');
  }

  function spawnEnemy67(big=true, x=null, y=null, forced=null, speedMul=1) {
    const value = forced ?? choice('6','7');
    const base = cfg.baseEnemySpeed + cfg.speedPerLevel*(level-1);
    const spd = base * speedMul;

    const e = {
      type: 'enemy',
      value,
      big,
      x: x ?? rnd(30, W-30),
      y: y ?? -30,
      // vertical oscillation
      vy: spd,
      dir: 1,                // 1 down, -1 up (we’ll invert at bounds)
      minY: 80,
      maxY: H-170,
      size: big ? 34 : 22,
      hitR: big ? 22 : 16
    };
    enemies.push(e);
  }

  function spawnBoss13() {
    const hp = cfg.bossHPBase + cfg.bossHPGrowth * Math.floor(level/cfg.bossEvery);
    const base = cfg.baseEnemySpeed + cfg.speedPerLevel*(level-1);

    enemies.push({
      type: 'boss',
      value: '13',
      x: W/2,
      y: 120,
      vx: base * 0.85,
      dir: 1,
      hp,
      shootT: 0,
      spawnT: 0,
      shootI: cfg.bossShootInterval,
      spawnI: cfg.bossSpawnInterval,
      hitR: 34
    });
  }

  function maybeDropPowerUp(x,y) {
    const chance = clamp(cfg.powerupChanceBase + cfg.powerupChancePerLevel*level, 0, 0.35);
    if (Math.random() > chance) return;

    const r = Math.random();
    const kind = r < 0.45 ? 'rapid' : r < 0.80 ? 'triple' : 'shield';
    powerups.push({
      kind,
      x, y,
      vy: 140,
      r: 14
    });
  }

  function applyPowerUp(kind) {
    const t = performance.now()/1000;
    if (kind === 'rapid') player.rapidUntil = t + 6;
    if (kind === 'triple') player.tripleUntil = t + 8;
    if (kind === 'shield') player.shield = true;
  }

  function fire() {
    const t = performance.now()/1000;
    if (t < player.nextFire) return;

    const rapid = t < player.rapidUntil;
    const triple = t < player.tripleUntil;

    const cd = rapid ? player.fireCd*0.45 : player.fireCd;
    player.nextFire = t + cd;

    const make = (angleDeg) => {
      const ang = angleDeg * Math.PI/180;
      const vx = Math.sin(ang) * 520;
      const vy = -Math.cos(ang) * 520;
      bullets.push({ x: player.x, y: player.y-8, vx, vy, r: 3 });
    };

    if (triple) { make(0); make(-12); make(12); }
    else make(0);
  }

  function enemyShoot(x,y){
    ebullets.push({ x, y, vx: 0, vy: 360, r: 4 });
  }

  function playerHit(){
    if (player.shield) { player.shield = false; return; }
    lives--;
    if (lives <= 0) resetGame();
  }

  function resetGame(){
    score = 0; lives = 3;
    bullets.length = 0; ebullets.length = 0; enemies.length = 0; powerups.length = 0;
    player.x = W/2; player.rapidUntil = 0; player.tripleUntil = 0; player.shield = false;
    startLevel(1);
  }

  // ===== Main Loop =====
  let last = performance.now();

  function tick(nowMs){
    const now = nowMs/1000;
    const dt = Math.min(0.033, (nowMs - last)/1000);
    last = nowMs;

    // Input -> player velocity
    player.vx = (leftDown ? -1 : 0) + (rightDown ? 1 : 0);
    player.x = clamp(player.x + player.vx*player.speed*dt, 22, W-22);

    // Spawning logic
    const interval = Math.max(cfg.minSpawn, cfg.baseSpawn - cfg.spawnDecay*(level-1));
    const maxOnScreen = cfg.maxOnScreenBase + cfg.maxOnScreenGrowth*(level-1);

    spawnTimer += dt;

    if (spawning && spawnTimer >= interval) {
      spawnTimer = 0;

      if (enemies.length < maxOnScreen) {
        const bossLevel = (level % cfg.bossEvery === 0);
        const shouldBoss = bossLevel && levelSpawned >= (levelTarget-1) && !hasBossAlive();

        if (shouldBoss) {
          spawnBoss13();
          levelSpawned++;
        } else if (levelSpawned < levelTarget) {
          spawnEnemy67(true);
          levelSpawned++;
          // random powerups tied to enemy spawns
          maybeDropPowerUp(rnd(40,W-40), rnd(20, 80));
        } else {
          spawning = false;
        }
      }
    }

    // If not spawning anymore, advance when clear
    if (!spawning && enemies.length === 0) startLevel(level+1);

    // Update bullets
    for (let i=bullets.length-1;i>=0;i--){
      const b = bullets[i];
      b.x += b.vx*dt; b.y += b.vy*dt;
      if (b.y < -20 || b.x < -20 || b.x > W+20) bullets.splice(i,1);
    }

    for (let i=ebullets.length-1;i>=0;i--){
      const b = ebullets[i];
      b.x += b.vx*dt; b.y += b.vy*dt;
      if (b.y > H+30) { ebullets.splice(i,1); continue; }
      // hit player
      if (rectHit(player.x-player.w/2, player.y-player.h/2, player.w, player.h, b.x-b.r, b.y-b.r, b.r*2, b.r*2)){
        ebullets.splice(i,1);
        playerHit();
      }
    }

    // Update powerups
    for (let i=powerups.length-1;i>=0;i--){
      const p = powerups[i];
      p.y += p.vy*dt;
      if (p.y > H+30) { powerups.splice(i,1); continue; }
      if (rectHit(player.x-player.w/2, player.y-player.h/2, player.w, player.h, p.x-p.r, p.y-p.r, p.r*2, p.r*2)){
        applyPowerUp(p.kind);
        powerups.splice(i,1);
      }
    }

    // Update enemies + boss behavior
    for (let i=enemies.length-1;i>=0;i--){
      const e = enemies[i];

      if (e.type === 'boss'){
        e.x += e.dir * e.vx * dt;
        if (e.x < 60) e.dir = 1;
        if (e.x > W-60) e.dir = -1;

        e.shootT += dt;
        e.spawnT += dt;

        if (e.shootT >= e.shootI){ e.shootT = 0; enemyShoot(e.x, e.y+18); }
        if (e.spawnT >= e.spawnI){
          e.spawnT = 0;
          spawnEnemy67(true, e.x + rnd(-60,60), e.y + 35, null, 1.1);
        }

      } else {
        // vertical oscillation: down then up repeatedly
        e.y += e.dir * e.vy * dt;
        if (e.y >= e.maxY) e.dir = -1;
        if (e.y <= e.minY) e.dir = 1;
      }
    }

    // Collisions: player bullets vs enemies
    for (let bi=bullets.length-1; bi>=0; bi--){
      const b = bullets[bi];
      for (let ei=enemies.length-1; ei>=0; ei--){
        const e = enemies[ei];
        const dx = b.x - e.x, dy = b.y - e.y;
        const rr = (e.hitR + b.r);
        if (dx*dx + dy*dy <= rr*rr){
          bullets.splice(bi,1);

          if (e.type === 'boss'){
            e.hp--;
            score += 15;
            if (e.hp <= 0){
              // boss explodes into big 6/7s
              score += 250;
              const count = Math.floor(rnd(7, 11));
              for (let k=0;k<count;k++){
                spawnEnemy67(true, e.x + rnd(-60,60), e.y + rnd(-20,20), choice('6','7'), 1.15);
              }
              enemies.splice(ei,1);
            }
          } else {
            if (e.big){
              // big -> split into two small same number
              score += 10;
              const v = e.value;
              const sp = e.vy * 1.05;
              spawnEnemy67(false, e.x-18, e.y, v, sp/(cfg.baseEnemySpeed + cfg.speedPerLevel*(level-1)));
              spawnEnemy67(false, e.x+18, e.y, v, sp/(cfg.baseEnemySpeed + cfg.speedPerLevel*(level-1)));
            } else {
              score += 20;
            }
            enemies.splice(ei,1);
          }
          break;
        }
      }
    }

    // Update HUD
    hudScore.textContent = `Score: ${score}`;
    hudStatus.textContent = `Lives: ${lives} | Shield: ${player.shield ? 'ON' : 'OFF'}`;

    // Render
    draw(now);

    requestAnimationFrame(tick);
  }

  function draw(now){
    ctx.clearRect(0,0,W,H);

    // Player
    ctx.fillStyle = '#fff';
    ctx.fillRect(player.x-player.w/2, player.y-player.h/2, player.w, player.h);

    // Shield ring
    if (player.shield){
      ctx.beginPath();
      ctx.arc(player.x, player.y, 24, 0, Math.PI*2);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Bullets
    ctx.fillStyle = '#fff';
    for (const b of bullets){
      ctx.beginPath();
      ctx.arc(b.x,b.y,b.r,0,Math.PI*2);
      ctx.fill();
    }

    // Enemy bullets
    ctx.fillStyle = '#fff';
    for (const b of ebullets){
      ctx.beginPath();
      ctx.arc(b.x,b.y,b.r,0,Math.PI*2);
      ctx.fill();
    }

    // Powerups
    for (const p of powerups){
      ctx.beginPath();
      ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.font = '14px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.fillText(p.kind === 'rapid' ? 'R' : p.kind === 'triple' ? 'T' : 'S', p.x, p.y+0.5);
    }

    // Enemies (numbers)
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const e of enemies){
      const size = (e.type === 'boss') ? 44 : (e.big ? 34 : 22);
      ctx.font = `${size}px system-ui`;
      if (e.type === 'boss'){
        // show HP dots
        const dots = '•'.repeat(Math.max(1, Math.min(12, e.hp)));
        ctx.fillText(`13 ${dots}`, e.x, e.y);
      } else {
        ctx.fillText(e.value, e.x, e.y);
      }
    }
  }

  startLevel(1);
  requestAnimationFrame(tick);
})();
