import { useEffect, useRef, useState } from "react";
import * as PIXI from "pixi.js";

export default function App() {
  const pixiContainer = useRef<HTMLDivElement | null>(null);
  const [lives, setLives] = useState(10);
  const [score, setScore] = useState(0);
  const [wave, setWave] = useState(1);
  const [gameOver, setGameOver] = useState(false);

  // refs pour déclencher un reset et un refetch depuis le bouton
  const resetRef = useRef<() => void>();
  const fetchStateRef = useRef<() => void>();

  useEffect(() => {
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

    // Vagues basées sur les kills
    let killsThisWave = 0;
    const waveTarget = (w: number) => 10 + (w - 1) * 5; // v1=10, v2=15, v3=20...
    const maybeAdvanceWave = () => {
      while (killsThisWave >= waveTarget(waveInternal)) {
        killsThisWave -= waveTarget(waveInternal);
        waveInternal += 1;
        setWave(waveInternal);
      }
    };

    // --- FOND & GRILLE ---
    const background = new PIXI.Graphics();
    background.beginFill(0x0f1729).drawRect(0, 0, 1200, 700).endFill();
    app.stage.addChild(background);

    const grid = new PIXI.Graphics();
    grid.lineStyle(1, 0x1a2847, 0.3);
    for (let i = 0; i < 1200; i += 40) { grid.moveTo(i, 0); grid.lineTo(i, 700); }
    for (let i = 0; i < 700; i += 40) { grid.moveTo(0, i); grid.lineTo(1200, i); }
    app.stage.addChild(grid);

    // --- CHEMIN ---
    const path: [number, number][] = [
      [100, 150], [400, 150], [400, 350],
      [800, 350], [800, 550], [1100, 550],
    ];

    const segments = path.slice(0, -1).map((p, i) => {
      const [x1, y1] = p;
      const [x2, y2] = path[i + 1];
      const len = Math.hypot(x2 - x1, y2 - y1);
      return { x1, y1, x2, y2, len };
    });
    const totalPathLen = segments.reduce((s, a) => s + a.len, 0);

    const pathBorder = new PIXI.Graphics();
    pathBorder.lineStyle(70, 0x1a3a52, 0.5);
    pathBorder.moveTo(path[0][0], path[0][1]);
    for (let i = 1; i < path.length; i++) pathBorder.lineTo(path[i][0], path[i][1]);
    app.stage.addChild(pathBorder);

    const road = new PIXI.Graphics();
    road.lineStyle(50, 0x2a5a7a);
    road.moveTo(path[0][0], path[0][1]);
    for (let i = 1; i < path.length; i++) road.lineTo(path[i][0], path[i][1]);
    app.stage.addChild(road);

    const roadCenter = new PIXI.Graphics();
    roadCenter.lineStyle(4, 0x4affff, 0.6);
    roadCenter.moveTo(path[0][0], path[0][1]);
    for (let i = 1; i < path.length; i++) roadCenter.lineTo(path[i][0], path[i][1]);
    app.stage.addChild(roadCenter);

    const startPoint = new PIXI.Graphics();
    startPoint.beginFill(0x00ff88).drawCircle(path[0][0], path[0][1], 25).endFill();
    startPoint.beginFill(0x00cc66).drawCircle(path[0][0], path[0][1], 15).endFill();
    app.stage.addChild(startPoint);

    const endPoint = new PIXI.Graphics();
    endPoint.beginFill(0xff4444).drawCircle(path[path.length - 1][0], path[path.length - 1][1], 25).endFill();
    endPoint.beginFill(0xcc3333).drawCircle(path[path.length - 1][0], path[path.length - 1][1], 15).endFill();
    app.stage.addChild(endPoint);

    // --- PARTICULES ---
    const particles = new PIXI.Container();
    app.stage.addChild(particles);
    for (let i = 0; i < 30; i++) {
      const p = new PIXI.Graphics() as PIXI.Graphics & { vx: number; vy: number };
      p.beginFill(0x4affff, Math.random() * 0.3);
      p.drawCircle(0, 0, Math.random() * 3 + 1).endFill();
      p.x = Math.random() * 1200; p.y = Math.random() * 700;
      p.vx = (Math.random() - 0.5) * 0.5; p.vy = (Math.random() - 0.5) * 0.5;
      particles.addChild(p);
    }

    // --- SLOTS (3 EMPLACEMENTS) ---
    type Slot = { id: string; x: number; y: number; node: PIXI.Graphics; occupied: boolean; };
    const slotsLayer = new PIXI.Container();
    app.stage.addChild(slotsLayer);
    const SLOT_RADIUS = 24, SLOT_RING = 3, SNAP_RADIUS = 28;

    const SLOTS: { id: string; x: number; y: number }[] = [
      { id: "S1", x: 250, y: 250 },
      { id: "S2", x: 650, y: 200 },
      { id: "S3", x: 950, y: 450 },
    ];

    const slots: Slot[] = SLOTS.map(({ id, x, y }) => {
      const g = new PIXI.Graphics();
      g.lineStyle(SLOT_RING, 0x7a8699, 0.9).drawCircle(0, 0, SLOT_RADIUS).endFill();
      g.x = x; g.y = y; g.alpha = 0.95;
      slotsLayer.addChild(g);
      return { id, x, y, node: g, occupied: false };
    });

    function setSlotOccupied(slot: Slot, occupied: boolean) {
      slot.occupied = occupied;
      slot.node.clear();
      slot.node.lineStyle(SLOT_RING, occupied ? 0x4affff : 0x7a8699, occupied ? 1 : 0.9);
      slot.node.drawCircle(0, 0, SLOT_RADIUS).endFill();
    }

    function findNearestFreeSlot(x: number, y: number): Slot | null {
      let best: Slot | null = null; let bestD = Infinity;
      for (const s of slots) {
        if (s.occupied) continue;
        const d = Math.hypot(s.x - x, s.y - y);
        if (d < bestD) { bestD = d; best = s; }
      }
      return best && bestD <= SNAP_RADIUS ? best : null;
    }

    // --- TOURS (depuis API, attaque incluse) ---
    type TowerDTO = { towerId: string; x: number; y: number };
    type Tower = {
      id: string;
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
    const towerToSlot = new Map<string, string>(); // towerId -> slotId

    function drawTowerNode(x: number, y: number) {
      const g = new PIXI.Container();
      const base = new PIXI.Graphics();
      base.beginFill(0x22324f).drawCircle(0, 0, 18).endFill(); g.addChild(base);
      const ring = new PIXI.Graphics();
      ring.lineStyle(3, 0x4affff, 0.9).drawCircle(0, 0, 24); g.addChild(ring);
      const barrel = new PIXI.Graphics();
      barrel.beginFill(0x7cf0ff).drawRect(-3, -14, 6, 20).endFill(); g.addChild(barrel);
      g.x = x; g.y = y;
      return g;
    }

    function createOrUpdateTower(dto: TowerDTO, tx: number, ty: number) {
      let t = towersById.get(dto.towerId);
      if (!t) {
        const node = drawTowerNode(tx, ty);
        const beamLayer = new PIXI.Container();
        beamsLayer.addChild(beamLayer);
        t = {
          id: dto.towerId,
          node,
          range: 180,
          cooldownMs: 450,
          lastShotAt: 0,
          beamLayer,
        };
        towersById.set(dto.towerId, t);
        towersLayer.addChild(node);
      } else {
        t.node.x += (tx - t.node.x) * 0.35;
        t.node.y += (ty - t.node.y) * 0.35;
      }
    }

    function drawBeam(ox: number, oy: number, tx: number, ty: number, layer: PIXI.Container) {
      const g = new PIXI.Graphics();
      g.lineStyle(2, 0x4affff, 0.9);
      g.moveTo(ox, oy);
      g.lineTo(tx, ty);
      layer.addChild(g);
      let alpha = 1;
      const fade = () => {
        alpha -= 0.2;
        g.alpha = alpha;
        if (alpha <= 0) { layer.removeChild(g); g.destroy(); }
        else requestAnimationFrame(fade);
      };
      requestAnimationFrame(fade);
    }

    function reconcileTowers(serverTowers: TowerDTO[]) {
      const seen = new Set<string>();
      for (const s of slots) setSlotOccupied(s, false);

      for (const dto of serverTowers) {
        seen.add(dto.towerId);

        let tx = dto.x, ty = dto.y;
        let snappedSlotId = towerToSlot.get(dto.towerId) || null;
        if (!snappedSlotId) {
          const slot = findNearestFreeSlot(dto.x, dto.y);
          if (slot) { snappedSlotId = slot.id; towerToSlot.set(dto.towerId, slot.id); }
        }
        if (snappedSlotId) {
          const slot = slots.find(s => s.id === snappedSlotId)!;
          tx = slot.x; ty = slot.y; setSlotOccupied(slot, true);
        }

        createOrUpdateTower(dto, tx, ty);
      }

      // remove disparus
      for (const [id, t] of [...towersById.entries()]) {
        if (!seen.has(id)) {
          towersLayer.removeChild(t.node);
          t.node.destroy({ children: true });
          beamsLayer.removeChild(t.beamLayer);
          t.beamLayer.destroy({ children: true });
          towersById.delete(id);
          const sid = towerToSlot.get(id);
          if (sid) {
            const s = slots.find(x => x.id === sid);
            if (s) setSlotOccupied(s, false);
          }
          towerToSlot.delete(id);
        }
      }
    }

    // --- POLLING /state ---
    let syncTimer: number | null = null;
    async function fetchStateOnce() {
      try {
        const res = await fetch("https://game-api-4dbs.onrender.com/state", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (Array.isArray(json?.towers)) reconcileTowers(json.towers as TowerDTO[]);
      } catch {}
    }
    function startPolling() { fetchStateOnce(); syncTimer = window.setInterval(fetchStateOnce, 900); }
    function stopPolling() { if (syncTimer !== null) { clearInterval(syncTimer); syncTimer = null; } }
    startPolling();

    // --- ENNEMIS ---
    interface Enemy {
      sprite: PIXI.Container;
      progress: number;   // distance sur le chemin (px)
      glow: PIXI.Graphics;
      rotation: number;
      speed: number;      // px/s
      hp: number;         // 3 coups pour mourir
      reachedEnd: boolean;
    }
    const enemies: Enemy[] = [];

    function placeEnemyAtDistance(e: Enemy, dist: number) {
      let d = dist;
      for (const seg of segments) {
        if (d <= seg.len) {
          const r = d / seg.len;
          e.sprite.x = seg.x1 + (seg.x2 - seg.x1) * r;
          e.sprite.y = seg.y1 + (seg.y2 - seg.y1) * r;
          return false; // pas arrivé
        }
        d -= seg.len;
      }
      return true; // arrivé à la fin
    }

    const enemiesLayer = new PIXI.Container();
    app.stage.addChild(enemiesLayer);

    const createEnemy = (offsetDist = 0, speedPxPerSec = 110) => {
      const enemyContainer = new PIXI.Container();

      const shadow = new PIXI.Graphics();
      shadow.beginFill(0x000000, 0.3).drawEllipse(0, 5, 15, 8).endFill();
      enemyContainer.addChild(shadow);

      const body = new PIXI.Graphics();
      body.beginFill(0xff3333).drawCircle(0, 0, 14).endFill();
      body.beginFill(0xff6666).drawCircle(-4, -4, 5).endFill();
      enemyContainer.addChild(body);

      const glow = new PIXI.Graphics();
      glow.beginFill(0xff6666, 0.3).drawCircle(0, 0, 20).endFill();
      glow.alpha = 0; enemyContainer.addChild(glow);

      enemiesLayer.addChild(enemyContainer);

      const e: Enemy = {
        sprite: enemyContainer,
        progress: offsetDist,
        glow,
        rotation: 0,
        speed: speedPxPerSec,
        hp: 3,
        reachedEnd: false,
      };

      placeEnemyAtDistance(e, e.progress);
      enemies.push(e);
    };

    // spawn timing
    let msSinceSpawn = 0;
    const SPAWN_EVERY_MS = 1200;
    createEnemy(0); // premier direct

    // --- GAME OVER OVERLAY ---
    const gameOverContainer = new PIXI.Container();
    gameOverContainer.visible = false;
    const gameOverBg = new PIXI.Graphics();
    gameOverBg.beginFill(0x000000, 0.8).drawRect(0, 0, 1200, 700).endFill();
    gameOverContainer.addChild(gameOverBg);

    const gameOverText = new PIXI.Text("PARTIE TERMINÉE", {
      fill: "#ff4444", fontSize: 80, fontWeight: "bold",
      fontFamily: "Arial", dropShadow: true, dropShadowColor: "#000000",
      dropShadowBlur: 10, dropShadowDistance: 5,
    });
    gameOverText.anchor.set(0.5); gameOverText.position.set(600, 300);
    gameOverContainer.addChild(gameOverText);

    const restartText = new PIXI.Text("Cliquez pour redémarrer", {
      fill: "#4affff", fontSize: 32, fontFamily: "Arial",
    });
    restartText.anchor.set(0.5); restartText.position.set(600, 400);
    gameOverContainer.addChild(restartText);
    app.stage.addChild(gameOverContainer);

    // --- ATTAQUES DES TOURS ---
    function towersAttack(nowMs: number) {
      if (towersById.size === 0 || enemies.length === 0) return;

      for (const t of towersById.values()) {
        if (nowMs - t.lastShotAt < t.cooldownMs) continue;

        let best: Enemy | null = null;
        let bestD = Infinity;

        for (const e of enemies) {
          if (e.hp <= 0) continue;
          const d = Math.hypot(t.node.x - e.sprite.x, t.node.y - e.sprite.y);
          if (d <= t.range && d < bestD) { bestD = d; best = e; }
        }

        if (!best) continue;

        best.hp -= 1;
        t.lastShotAt = nowMs;
        drawBeam(t.node.x, t.node.y, best.sprite.x, best.sprite.y, t.beamLayer);
      }
    }

    // --- TICKER ---
    app.ticker.add(() => {
      if (gameOverInternal) return;
      const dt = app.ticker.deltaMS;
      const now = performance.now();

      // particules
      particles.children.forEach((pp) => {
        const particle = pp as PIXI.Graphics & { vx: number; vy: number };
        pp.x += particle.vx; pp.y += particle.vy;
        if (pp.x < 0) pp.x = 1200; if (pp.x > 1200) pp.x = 0;
        if (pp.y < 0) pp.y = 700; if (pp.y > 700) pp.y = 0;
      });

      // spawn ennemis
      msSinceSpawn += dt;
      const spawnPeriod = Math.max(700, SPAWN_EVERY_MS - (waveInternal - 1) * 50);
      if (msSinceSpawn >= spawnPeriod) {
        createEnemy(0, 100 + waveInternal * 6);
        msSinceSpawn = 0;
      }

      // move ennemis
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        e.rotation += 0.06;
        (e.sprite.children[1] as PIXI.Graphics).rotation = e.rotation;
        e.glow.alpha = Math.sin(Date.now() * 0.01 + i) * 0.3 + 0.3;

        e.progress += e.speed * (dt / 1000);
        e.reachedEnd = placeEnemyAtDistance(e, e.progress);
      }

      // attaques
      towersAttack(now);

      // retirer morts (hp<=0), scorer, avancer vague par kills
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
      }

      // gérer arrivées au bout (restants vivants)
      for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        if (e.reachedEnd) {
          enemiesLayer.removeChild(e.sprite);
          e.sprite.destroy({ children: true });
          enemies.splice(i, 1);
          livesInternal = Math.max(0, livesInternal - 1);
          setLives(livesInternal);
          if (livesInternal <= 0) {
            gameOverInternal = true;
            setGameOver(true);
            gameOverContainer.visible = true;
          }
        }
      }
    });

    // --- RESET LOCAL réutilisable (bouton & restart) ---
    const hardResetLocal = () => {
      gameOverInternal = false;
      livesInternal = 10;
      scoreInternal = 0;
      waveInternal = 1;
      killsThisWave = 0;
      setLives(10);
      setScore(0);
      setWave(1);
      setGameOver(false);
      gameOverContainer.visible = false;

      enemies.forEach(e => { enemiesLayer.removeChild(e.sprite); e.sprite.destroy({ children: true }); });
      enemies.length = 0;
      msSinceSpawn = 0;
      createEnemy(0);
    };
    resetRef.current = hardResetLocal;

    // exp. fetchState vers le bouton
    fetchStateRef.current = () => { void fetchStateOnce(); };

    // --- RESTART SUR CLIC (après game over) ---
    const onCanvasClick = () => {
      if (!gameOverInternal) return;
      hardResetLocal();
    };
    (app.view as HTMLCanvasElement).addEventListener("click", onCanvasClick);

    // --- CLEANUP ---
    return () => {
      (app.view as HTMLCanvasElement).removeEventListener("click", onCanvasClick);
      stopPolling();
      app.destroy(true, true);
    };
  }, []);

  // handler bouton Reset
  const onResetClick = async () => {
    try {
      await fetch("https://game-api-4dbs.onrender.com/reset", { method: "POST" });
    } catch {
      // on s'en fout pour le front: on reset quand même localement
    }
    // reset local immédiat puis refetch l'état serveur
    resetRef.current?.();
    fetchStateRef.current?.();
  };

  // --- UI / HUD ---
  return (
    <div
      style={{
        width: "100vw", height: "100vh", overflow: "hidden",
        display: "flex", justifyContent: "center", alignItems: "center",
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

        {/* HUD gauche */}
        <div
          style={{
            position: "absolute", top: 20, left: 20, display: "flex",
            gap: 15, flexDirection: "column",
          }}
        >
          {/* Vies */}
          <div
            style={{
              background: "linear-gradient(135deg, rgba(255,68,68,0.95) 0%, rgba(200,40,40,0.95) 100%)",
              padding: "12px 20px", borderRadius: 12,
              border: "2px solid rgba(255,100,100,0.5)",
              boxShadow: "0 4px 15px rgba(255,68,68,0.4)",
              display: "flex", alignItems: "center", gap: 10,
            }}
          >
            <span style={{ fontSize: 24 }}>❤️</span>
            <div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", fontWeight: 600 }}>VIES</div>
              <div style={{ fontSize: 28, color: "#fff", fontWeight: "bold", lineHeight: 1 }}>{lives}</div>
            </div>
          </div>

          {/* Score */}
          <div
            style={{
              background: "linear-gradient(135deg, rgba(74,255,255,0.95) 0%, rgba(40,180,200,0.95) 100%)",
              padding: "12px 20px", borderRadius: 12,
              border: "2px solid rgba(100,255,255,0.5)",
              boxShadow: "0 4px 15px rgba(74,255,255,0.4)",
              display: "flex", alignItems: "center", gap: 10,
            }}
          >
            <span style={{ fontSize: 24 }}>⭐</span>
            <div>
              <div style={{ fontSize: 12, color: "rgba(10,20,40,0.8)", fontWeight: 600 }}>SCORE</div>
              <div style={{ fontSize: 28, color: "#0a1428", fontWeight: "bold", lineHeight: 1 }}>{score}</div>
            </div>
          </div>

          {/* Vague */}
          <div
            style={{
              background: "linear-gradient(135deg, rgba(138,43,226,0.95) 0%, rgba(100,30,180,0.95) 100%)",
              padding: "12px 20px", borderRadius: 12,
              border: "2px solid rgba(180,100,255,0.5)",
              boxShadow: "0 4px 15px rgba(138,43,226,0.4)",
              display: "flex", alignItems: "center", gap: 10,
            }}
          >
            <span style={{ fontSize: 24 }}>🌊</span>
            <div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", fontWeight: 600 }}>VAGUE</div>
              <div style={{ fontSize: 28, color: "#fff", fontWeight: "bold", lineHeight: 1 }}>{wave}</div>
            </div>
          </div>
        </div>

        {/* Titre + Bouton Reset */}
        <div
          style={{
            position: "absolute", top: 20, right: 20,
            display: "flex", gap: 12, alignItems: "center",
          }}
        >
          <div
            style={{
              background: "linear-gradient(135deg, rgba(0,255,136,0.95) 0%, rgba(0,180,100,0.95) 100%)",
              padding: "15px 30px", borderRadius: 12,
              border: "2px solid rgba(100,255,200,0.5)",
              boxShadow: "0 4px 15px rgba(0,255,136,0.4)",
              fontSize: 24, color: "#0a1428", fontWeight: "bold", letterSpacing: 2,
            }}
          >
            Table interactive
          </div>

          <button
            onClick={onResetClick}
            style={{
              cursor: "pointer",
              background: "linear-gradient(135deg, rgba(255,196,0,0.95) 0%, rgba(255,140,0,0.95) 100%)",
              color: "#0a1428",
              fontWeight: 800,
              border: "2px solid rgba(255,200,120,0.7)",
              borderRadius: 12,
              padding: "10px 18px",
              boxShadow: "0 4px 15px rgba(255,170,0,0.35)",
            }}
            aria-label="Reset game"
            title="Reset (API + Client)"
          >
            RESET
          </button>
        </div>
      </div>
    </div>
  );
}
