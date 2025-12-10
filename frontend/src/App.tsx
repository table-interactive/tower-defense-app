import { useEffect, useRef, useState } from "react";
import * as PIXI from "pixi.js";

export default function App() {
  const pixiContainer = useRef<HTMLDivElement | null>(null);
  const [lives, setLives] = useState(10);
  const [score, setScore] = useState(0);
  const [wave, setWave] = useState(1);

  const resetRef = useRef<(() => void) | null>(null);
  const fetchStateRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let maxLives = 10;

    const app = new PIXI.Application({
      width: 1200,
      height: 700,
      backgroundColor: 0x0a0e27,
      antialias: true,
    });
    pixiContainer.current?.appendChild(app.view as unknown as Node);

    // --- ÉTAT INTERNE ---
    let livesInternal = 10;
    let scoreInternal = 0;
    let waveInternal = 1;
    let gameOverInternal = false;
    let hasPlayer = false;
    let gameStarted = false;

    let killsThisWave = 0;
    const waveTarget = (w: number) => 10 + (w - 1) * 5;
    const maybeAdvanceWave = () => {
      while (killsThisWave >= waveTarget(waveInternal)) {
        killsThisWave -= waveTarget(waveInternal);
        waveInternal += 1;
        setWave(waveInternal);
        if (waveInternal % 5 === 0) {
          showBossAlert();
        }
        if (waveInternal % 10 === 0) {
          maxLives += 3;
          livesInternal = Math.min(livesInternal + 3, maxLives);
          setLives(livesInternal);
        }
      }
    };

    // --- FOND & GRILLE ---
    const background = new PIXI.Graphics();
    background.beginFill(0x0f1729).drawRect(0, 0, 1200, 700).endFill();
    app.stage.addChild(background);

    const grid = new PIXI.Graphics();
    grid.lineStyle(1, 0x1a2847, 0.3);
    for (let i = 0; i < 1200; i += 40) {
      grid.moveTo(i, 0);
      grid.lineTo(i, 700);
    }
    for (let i = 0; i < 700; i += 40) {
      grid.moveTo(0, i);
      grid.lineTo(1200, i);
    }
    app.stage.addChild(grid);

    // --- CHEMIN ---
    const path: [number, number][] = [
      [100, 150],
      [400, 150],
      [400, 350],
      [800, 350],
      [800, 550],
      [1100, 550],
    ];
    const segments = path.slice(0, -1).map((p, i) => {
      const [x1, y1] = p;
      const [x2, y2] = path[i + 1];
      const len = Math.hypot(x2 - x1, y2 - y1);
      return { x1, y1, x2, y2, len };
    });

    const pathBorder = new PIXI.Graphics();
    pathBorder.lineStyle(70, 0x1a3a52, 0.5);
    pathBorder.moveTo(path[0][0], path[0][1]);
    for (let i = 1; i < path.length; i++)
      pathBorder.lineTo(path[i][0], path[i][1]);
    app.stage.addChild(pathBorder);

    const road = new PIXI.Graphics();
    road.lineStyle(50, 0x2a5a7a);
    road.moveTo(path[0][0], path[0][1]);
    for (let i = 1; i < path.length; i++) road.lineTo(path[i][0], path[i][1]);
    app.stage.addChild(road);

    const roadCenter = new PIXI.Graphics();
    roadCenter.lineStyle(4, 0x4affff, 0.6);
    roadCenter.moveTo(path[0][0], path[0][1]);
    for (let i = 1; i < path.length; i++)
      roadCenter.lineTo(path[i][0], path[i][1]);
    app.stage.addChild(roadCenter);

    // --- POINTS DÉBUT/FIN ---
    const startPoint = new PIXI.Graphics();
    startPoint
      .beginFill(0x00ff88)
      .drawCircle(path[0][0], path[0][1], 25)
      .endFill();
    startPoint
      .beginFill(0x00cc66)
      .drawCircle(path[0][0], path[0][1], 15)
      .endFill();
    app.stage.addChild(startPoint);

    const endPoint = new PIXI.Graphics();
    endPoint
      .beginFill(0xff4444)
      .drawCircle(path[path.length - 1][0], path[path.length - 1][1], 25)
      .endFill();
    endPoint
      .beginFill(0xcc3333)
      .drawCircle(path[path.length - 1][0], path[path.length - 1][1], 15)
      .endFill();
    app.stage.addChild(endPoint);

    // --- OVERLAY ATTENTE ---
    const waitOverlay = new PIXI.Container();
    const waitBg = new PIXI.Graphics();
    waitBg.beginFill(0x000000, 0.6).drawRect(0, 0, 1200, 700).endFill();
    waitOverlay.addChild(waitBg);
    const waitText = new PIXI.Text("En attente de joueur…", {
      fill: "#ffffff",
      fontSize: 40,
      fontWeight: "bold",
      fontFamily: "Arial",
    });
    waitText.anchor.set(0.5);
    waitText.position.set(600, 350);
    waitOverlay.addChild(waitText);
    waitOverlay.visible = true;
    app.stage.addChild(waitOverlay);

    // --- SLOTS TOURS ---
    type Slot = {
      id: string;
      x: number;
      y: number;
      node: PIXI.Graphics;
      occupied: boolean;
    };
    const slotsLayer = new PIXI.Container();
    app.stage.addChild(slotsLayer);
    const SLOT_RADIUS = 24,
      SLOT_RING = 3
    const SLOTS = [
      { id: "S1", x: 250, y: 250 },
      { id: "S2", x: 650, y: 200 },
      { id: "S3", x: 950, y: 450 },
    ];
    
    // --- TOURS ---
    type TowerDTO = {
      towerId: string;
      towerType: string;
      x: number;
      y: number;
    };
    type Tower = {
      id: string;
      type: string;
      node: PIXI.Container;
      range: number;
      cooldownMs: number;
      lastShotAt: number;
      beamLayer: PIXI.Container;
    };

    const towersLayer = new PIXI.Container();
    app.stage.addChild(towersLayer);
    const beamsLayer = new PIXI.Container();
    app.stage.addChild(beamsLayer);
    const towersById = new Map<string, Tower>();

    function statsFor(type: string) {
      if (type === "Archer") return { range: 320, cooldownMs: 800 };
      if (type === "Swordsman") return { range: 200, cooldownMs: 250 };
      if (type === "Mage") return { range: 250, cooldownMs: 1000 };
      if (type === "Healer") return { range: 180, cooldownMs: 5000 };
      return { range: 180, cooldownMs: 800 };
    }

    function drawTowerNode(x: number, y: number, type: string) {
      const g = new PIXI.Container();
      const base = new PIXI.Graphics();

      if (type === "Archer") {
        base.beginFill(0x1a3a5f).drawCircle(0, 0, 16).endFill();
        const bow = new PIXI.Graphics();
        bow.lineStyle(3, 0x4affff).arc(0, 0, 20, 0, Math.PI, false);
        g.addChild(base, bow);
      } else if (type === "Swordsman") {
        base.beginFill(0x5f2a1a).drawCircle(0, 0, 20).endFill();
        const sword = new PIXI.Graphics();
        sword.lineStyle(3, 0xffaa00).moveTo(0, -12).lineTo(0, 12);
        g.addChild(base, sword);
      } else if (type === "Mage") {
        base.beginFill(0x6633cc).drawCircle(0, 0, 18).endFill();
        const orb = new PIXI.Graphics();
        orb.beginFill(0xaa88ff).drawCircle(0, 0, 8).endFill();
        g.addChild(base, orb);
      } else if (type === "Healer") {
        base.beginFill(0x2ecc71).drawCircle(0, 0, 18).endFill();
        const cross = new PIXI.Graphics();
        cross
          .lineStyle(3, 0xffffff)
          .moveTo(-5, 0)
          .lineTo(5, 0)
          .moveTo(0, -5)
          .lineTo(0, 5);
        g.addChild(base, cross);
      }
      g.x = x;
      g.y = y;
      return g;
    }

    function reconcileTowers(serverTowers: TowerDTO[]) {
      for (const dto of serverTowers) {
        let t = towersById.get(dto.towerId);
        if (!t) {
          const node = drawTowerNode(dto.x, dto.y, dto.towerType);
          const beamLayer = new PIXI.Container();
          beamsLayer.addChild(beamLayer);
          const { range, cooldownMs } = statsFor(dto.towerType);
          t = {
            id: dto.towerId,
            type: dto.towerType,
            node,
            range,
            cooldownMs,
            lastShotAt: 0,
            beamLayer,
          };
          towersById.set(dto.towerId, t);
          towersLayer.addChild(node);
        } else if (t.type !== dto.towerType) {
          towersLayer.removeChild(t.node);
          t.node.destroy({ children: true });
          t.node = drawTowerNode(dto.x, dto.y, dto.towerType);
          towersLayer.addChild(t.node);
          t.type = dto.towerType;
          const { range, cooldownMs } = statsFor(dto.towerType);
          t.range = range;
          t.cooldownMs = cooldownMs;
        }
      }
    }

    // --- POLLING /state corrigé ---
    let syncTimer: number | null = null;
    async function fetchStateOnce() {
      try {
        const res = await fetch("https://game-api-4dbs.onrender.com/state", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = await res.json();

        // Traduction des champs backend
        if (Array.isArray(json?.towers)) {
          const towers = json.towers.map((t: any) => ({
            towerId: t.towerId ?? t.id,
            towerType: t.towerType ?? t.type,
            x: t.x,
            y: t.y,
          }));
          reconcileTowers(towers);
        }

        // Démarrage via capteur mouvement (START_WAVE)
        const hasWaveEvent =
          Array.isArray(json?.events) &&
          json.events.some((e: any) => e.type === "START_WAVE");
        hasPlayer =
          hasWaveEvent ||
          (Array.isArray(json?.players) && json.players.length > 0);

        if ((hasWaveEvent || hasPlayer) && !gameStarted) {
          gameStarted = true;
          waitOverlay.visible = false;
          msSinceSpawn = SPAWN_EVERY_MS;
          console.log("🎮 Partie démarrée !");
        }

        if (!hasPlayer && gameStarted) {
          waitOverlay.visible = true;
        }
      } catch {}
    }

    function startPolling() {
      fetchStateOnce();
      syncTimer = window.setInterval(fetchStateOnce, 900);
    }
    function stopPolling() {
      if (syncTimer) clearInterval(syncTimer);
    }
    startPolling();

    // --- ENNEMIS / TICKER / COMBAT ---
    interface Enemy {
      sprite: PIXI.Container;
      progress: number;
      glow: PIXI.Graphics;
      rotation: number;
      speed: number;
      hp: number;
      reachedEnd: boolean;
    }
    const enemies: Enemy[] = [];
    const enemiesLayer = new PIXI.Container();
    app.stage.addChild(enemiesLayer);

    function placeEnemyAtDistance(e: Enemy, dist: number) {
      let d = dist;
      for (const seg of segments) {
        if (d <= seg.len) {
          const r = d / seg.len;
          e.sprite.x = seg.x1 + (seg.x2 - seg.x1) * r;
          e.sprite.y = seg.y1 + (seg.y2 - seg.y1) * r;
          return false;
        }
        d -= seg.len;
      }
      return true;
    }

    function createEnemy(offsetDist = 0, speedPxPerSec = 110) {
      const c = new PIXI.Container();
      const body = new PIXI.Graphics();
      body.beginFill(0xff3333).drawCircle(0, 0, 14).endFill();
      c.addChild(body);
      enemiesLayer.addChild(c);
      const e: Enemy = {
        sprite: c,
        progress: offsetDist,
        glow: new PIXI.Graphics(),
        rotation: 0,
        speed: speedPxPerSec,
        hp: 3,
        reachedEnd: false,
      };
      placeEnemyAtDistance(e, e.progress);
      enemies.push(e);
    }

    let msSinceSpawn = 0;
    const SPAWN_EVERY_MS = 1200;

    // --- ALERTE BOSS ---
    const bossAlert = new PIXI.Text("⚠️ MINI-BOSS ⚠️", {
      fill: "#ffcc00",
      fontSize: 60,
      fontWeight: "bold",
      fontFamily: "Arial",
    });
    bossAlert.anchor.set(0.5);
    bossAlert.position.set(600, 100);
    bossAlert.visible = false;
    app.stage.addChild(bossAlert);
    function showBossAlert() {
      bossAlert.visible = true;
      bossAlert.alpha = 1;
      let elapsed = 0;
      const fade = (delta: number) => {
        elapsed += delta;
        if (elapsed > 150) {
          bossAlert.alpha -= 0.05;
          if (bossAlert.alpha <= 0) {
            bossAlert.visible = false;
            app.ticker.remove(fade);
          }
        }
      };
      app.ticker.add(fade);
    }

    // --- ATTAQUES TOURS ---
    function towersAttack(nowMs: number) {
      if (!hasPlayer || !gameStarted) return;
      if (towersById.size === 0 || enemies.length === 0) return;
      for (const t of towersById.values()) {
        if (t.type === "Healer") continue;
        if (nowMs - t.lastShotAt < t.cooldownMs) continue;
        let best: Enemy | null = null;
        let bestD = Infinity;
        for (const e of enemies) {
          if (e.hp <= 0) continue;
          const d = Math.hypot(t.node.x - e.sprite.x, t.node.y - e.sprite.y);
          if (d <= t.range && d < bestD) {
            bestD = d;
            best = e;
          }
        }
        if (!best) continue;
        t.lastShotAt = nowMs;
        best.hp -= 1;
      }
    }

    // --- GAME LOOP ---
    app.ticker.add(() => {
      if (gameOverInternal) return;
      const dt = app.ticker.deltaMS;
      const now = performance.now();

      if (!hasPlayer || !gameStarted) {
        waitOverlay.visible = true;
        return;
      } else {
        waitOverlay.visible = false;
      }

      msSinceSpawn += dt;
      const spawnPeriod = Math.max(
        700,
        SPAWN_EVERY_MS - (waveInternal - 1) * 50
      );
      if (msSinceSpawn >= spawnPeriod) {
        createEnemy(0, 100 + waveInternal * 6);
        msSinceSpawn = 0;
      }

      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        e.progress += e.speed * (dt / 1000);
        e.reachedEnd = placeEnemyAtDistance(e, e.progress);
      }

      towersAttack(now);

      for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        if (e.hp <= 0) {
          enemiesLayer.removeChild(e.sprite);
          e.sprite.destroy({ children: true });
          enemies.splice(i, 1);
          scoreInternal += 100;
          setScore(scoreInternal);
          killsThisWave += 1;
          maybeAdvanceWave();
        }
        if (e.reachedEnd) {
          enemiesLayer.removeChild(e.sprite);
          e.sprite.destroy({ children: true });
          enemies.splice(i, 1);
          livesInternal = Math.max(0, livesInternal - 1);
          setLives(livesInternal);
          if (livesInternal <= 0) {
            gameOverInternal = true;
            gameOverContainer.visible = true;
          }
        }
      }
    });

    // --- GAME OVER ---
    const gameOverContainer = new PIXI.Container();
    gameOverContainer.visible = false;
    const gameOverBg = new PIXI.Graphics();
    gameOverBg.beginFill(0x000000, 0.8).drawRect(0, 0, 1200, 700).endFill();
    gameOverContainer.addChild(gameOverBg);
    const gameOverText = new PIXI.Text("PARTIE TERMINÉE", {
      fill: "#ff4444",
      fontSize: 80,
      fontWeight: "bold",
      fontFamily: "Arial",
    });
    gameOverText.anchor.set(0.5);
    gameOverText.position.set(600, 300);
    gameOverContainer.addChild(gameOverText);
    app.stage.addChild(gameOverContainer);

    const onCanvasClick = () => {
      if (!gameOverInternal) return;
      gameOverInternal = false;
      livesInternal = 10;
      scoreInternal = 0;
      waveInternal = 1;
      killsThisWave = 0;
      setLives(10);
      setScore(0);
      setWave(1);
      gameOverContainer.visible = false;
      waitOverlay.visible = !hasPlayer;
    };
    (app.view as HTMLCanvasElement).addEventListener("click", onCanvasClick);

    return () => {
      (app.view as HTMLCanvasElement).removeEventListener(
        "click",
        onCanvasClick
      );
      stopPolling();
      app.destroy(true, true);
    };
  }, []);

  // --- INTERFACE / HUD ---
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background: "linear-gradient(135deg, #0a0e27 0%, #1a1f3a 100%)",
      }}
    >
      <div style={{ position: "relative" }}>
        <div
          ref={pixiContainer}
          style={{
            borderRadius: "12px",
            boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
            border: "2px solid #2a3f5f",
          }}
        />

        {/* --- HUD --- */}
        <div
          style={{
            position: "absolute",
            top: 20,
            left: 20,
            display: "flex",
            gap: 15,
            flexDirection: "column",
          }}
        >
          {/* VIES */}
          <div
            style={{
              background:
                "linear-gradient(135deg, rgba(255,68,68,0.95) 0%, rgba(200,40,40,0.95) 100%)",
              padding: "12px 20px",
              borderRadius: 12,
              border: "2px solid rgba(255,100,100,0.5)",
              boxShadow: "0 4px 15px rgba(255,68,68,0.4)",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span style={{ fontSize: 24 }}>❤️</span>
            <div>
              <div
                style={{
                  fontSize: 12,
                  color: "rgba(255,255,255,0.8)",
                  fontWeight: 600,
                }}
              >
                VIES
              </div>
              <div style={{ fontSize: 28, color: "#fff", fontWeight: "bold" }}>
                {lives}
              </div>
            </div>
          </div>

          {/* SCORE */}
          <div
            style={{
              background:
                "linear-gradient(135deg, rgba(74,255,255,0.95) 0%, rgba(40,180,200,0.95) 100%)",
              padding: "12px 20px",
              borderRadius: 12,
              border: "2px solid rgba(100,255,255,0.5)",
              boxShadow: "0 4px 15px rgba(74,255,255,0.4)",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span style={{ fontSize: 24 }}>⭐</span>
            <div>
              <div
                style={{
                  fontSize: 12,
                  color: "rgba(10,20,40,0.8)",
                  fontWeight: 600,
                }}
              >
                SCORE
              </div>
              <div
                style={{ fontSize: 28, color: "#0a1428", fontWeight: "bold" }}
              >
                {score}
              </div>
            </div>
          </div>

          {/* VAGUE */}
          <div
            style={{
              background:
                "linear-gradient(135deg, rgba(138,43,226,0.95) 0%, rgba(100,30,180,0.95) 100%)",
              padding: "12px 20px",
              borderRadius: 12,
              border: "2px solid rgba(180,100,255,0.5)",
              boxShadow: "0 4px 15px rgba(138,43,226,0.4)",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span style={{ fontSize: 24 }}>🌊</span>
            <div>
              <div
                style={{
                  fontSize: 12,
                  color: "rgba(255,255,255,0.8)",
                  fontWeight: 600,
                }}
              >
                VAGUE
              </div>
              <div style={{ fontSize: 28, color: "#fff", fontWeight: "bold" }}>
                {wave}
              </div>
            </div>
          </div>
        </div>

        {/* Titre + Reset */}
        <div
          style={{
            position: "absolute",
            top: 20,
            right: 20,
            display: "flex",
            gap: 12,
            alignItems: "center",
          }}
        >
          <div
            style={{
              background:
                "linear-gradient(135deg, rgba(0,255,136,0.95) 0%, rgba(0,180,100,0.95) 100%)",
              padding: "15px 30px",
              borderRadius: 12,
              border: "2px solid rgba(100,255,200,0.5)",
              boxShadow: "0 4px 15px rgba(0,255,136,0.4)",
              fontSize: 24,
              color: "#0a1428",
              fontWeight: "bold",
            }}
          >
            Table interactive
          </div>

          <button
            onClick={async () => {
              try {
                await fetch("https://game-api-4dbs.onrender.com/reset", {
                  method: "POST",
                });
              } catch {}
              resetRef.current?.();
              fetchStateRef.current?.();
            }}
            style={{
              cursor: "pointer",
              background:
                "linear-gradient(135deg, rgba(255,196,0,0.95) 0%, rgba(255,140,0,0.95) 100%)",
              color: "#0a1428",
              fontWeight: 800,
              border: "2px solid rgba(255,200,120,0.7)",
              borderRadius: 12,
              padding: "10px 18px",
              boxShadow: "0 4px 15px rgba(255,170,0,0.35)",
            }}
          >
            RESET
          </button>
        </div>
      </div>
    </div>
  );
}
