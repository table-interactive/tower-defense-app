import { useEffect, useRef, useState } from "react";
import * as PIXI from "pixi.js";

export default function App() {
  const pixiContainer = useRef<HTMLDivElement | null>(null);
  const [lives, setLives] = useState(10);
  const [score, setScore] = useState(0);
  const [wave, setWave] = useState(1);
  const [gameOver, setGameOver] = useState(false);

  // état “joueur présent ?” et “partie démarrée ?” pour l’UI
  const [hasPlayerUI, setHasPlayerUI] = useState(false);

  // refs pour reset/fetch externes (bouton)
  const resetRef = useRef<() => void>();
  const fetchStateRef = useRef<() => void>();

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

    // Contrôle du démarrage/pauses selon présence de joueurs
    let hasPlayer = false; // vrai s’il y a ≥1 joueur dans /state
    let gameStarted = false; // passe à true au premier joueur détecté

    // Vagues basées sur les kills
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

    // --- PARTICULES ---
    const particles = new PIXI.Container();
    app.stage.addChild(particles);
    for (let i = 0; i < 30; i++) {
      const p = new PIXI.Graphics() as PIXI.Graphics & {
        vx: number;
        vy: number;
      };
      p.beginFill(0x4affff, Math.random() * 0.3);
      p.drawCircle(0, 0, Math.random() * 3 + 1).endFill();
      p.x = Math.random() * 1200;
      p.y = Math.random() * 700;
      p.vx = (Math.random() - 0.5) * 0.5;
      p.vy = (Math.random() - 0.5) * 0.5;
      particles.addChild(p);
    }

    // --- OVERLAY ATTENTE/PAUSE ---
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
    waitOverlay.visible = true; // au démarrage, pas de joueur → attente
    app.stage.addChild(waitOverlay);

    // --- SLOTS (3 EMPLACEMENTS) ---
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
      SLOT_RING = 3,
      SNAP_RADIUS = 28;
    const SLOTS: { id: string; x: number; y: number }[] = [
      { id: "S1", x: 250, y: 250 },
      { id: "S2", x: 650, y: 200 },
      { id: "S3", x: 950, y: 450 },
    ];
    const slots: Slot[] = SLOTS.map(({ id, x, y }) => {
      const g = new PIXI.Graphics();
      g.lineStyle(SLOT_RING, 0x7a8699, 0.9)
        .drawCircle(0, 0, SLOT_RADIUS)
        .endFill();
      g.x = x;
      g.y = y;
      g.alpha = 0.95;
      slotsLayer.addChild(g);
      return { id, x, y, node: g, occupied: false };
    });
    function setSlotOccupied(slot: Slot, occupied: boolean) {
      slot.occupied = occupied;
      slot.node.clear();
      slot.node.lineStyle(
        SLOT_RING,
        occupied ? 0x4affff : 0x7a8699,
        occupied ? 1 : 0.9
      );
      slot.node.drawCircle(0, 0, SLOT_RADIUS).endFill();
    }
    function findNearestFreeSlot(x: number, y: number): Slot | null {
      let best: Slot | null = null;
      let bestD = Infinity;
      for (const s of slots) {
        if (s.occupied) continue;
        const d = Math.hypot(s.x - x, s.y - y);
        if (d < bestD) {
          bestD = d;
          best = s;
        }
      }
      return best && bestD <= SNAP_RADIUS ? best : null;
    }

    // --- TOURS (depuis API, attaque incluse) ---
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

    function statsFor(type: string) {
      if (type === "Archer") return { range: 320, cooldownMs: 800 };
      if (type === "Swordsman") return { range: 200, cooldownMs: 250 };
      if (type === "Mage") return { range: 250, cooldownMs: 1000 };
      if (type === "Healer") return { range: 180, cooldownMs: 5000 };
      return { range: 180, cooldownMs: 800 };
    }

    const towersLayer = new PIXI.Container();
    app.stage.addChild(towersLayer);
    const beamsLayer = new PIXI.Container();
    app.stage.addChild(beamsLayer);
    const towersById = new Map<string, Tower>();
    const towerToSlot = new Map<string, string>(); // towerId -> slotId

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
        sword.lineStyle(1, 0xffee99).moveTo(-4, -12).lineTo(-4, 12);
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
    function createOrUpdateTower(dto: TowerDTO, tx: number, ty: number) {
      let t = towersById.get(dto.towerId);

      const ensureNodeForType = (type: string) => {
        const node = drawTowerNode(tx, ty, type);
        towersLayer.addChild(node);
        return node;
      };

      if (!t) {
        const node = ensureNodeForType(dto.towerType);
        const beamLayer = new PIXI.Container();
        beamsLayer.addChild(beamLayer);
        const { range, cooldownMs } = statsFor(dto.towerType);

        t = {
          id: dto.towerId,
          type: dto.towerType, // <= NEW
          node,
          range,
          cooldownMs,
          lastShotAt: 0,
          beamLayer,
        };
        towersById.set(dto.towerId, t);
      } else {
        // si le type a changé, on remplace le visuel + les stats
        if (t.type !== dto.towerType) {
          towersLayer.removeChild(t.node);
          t.node.destroy({ children: true });
          t.node = ensureNodeForType(dto.towerType);
          t.type = dto.towerType;
          const { range, cooldownMs } = statsFor(dto.towerType);
          t.range = range;
          t.cooldownMs = cooldownMs;
          // on reset le cycle de tir pour un feedback immédiat
          t.lastShotAt = 0;
        } else {
          // sinon juste interpolation de la position
          t.node.x += (tx - t.node.x) * 0.35;
          t.node.y += (ty - t.node.y) * 0.35;
        }
      }
    }

    function drawBeam(
      ox: number,
      oy: number,
      tx: number,
      ty: number,
      layer: PIXI.Container
    ) {
      const g = new PIXI.Graphics();
      g.lineStyle(2, 0x4affff, 0.9);
      g.moveTo(ox, oy);
      g.lineTo(tx, ty);
      layer.addChild(g);
      let alpha = 1;
      const fade = () => {
        alpha -= 0.2;
        g.alpha = alpha;
        if (alpha <= 0) {
          layer.removeChild(g);
          g.destroy();
        } else requestAnimationFrame(fade);
      };
      requestAnimationFrame(fade);
    }
    function reconcileTowers(
      serverTowers: {
        towerId: string;
        towerType: string;
        x: number;
        y: number;
      }[]
    ) {
      const seen = new Set<string>();
      for (const s of slots) setSlotOccupied(s, false);

      for (const dto of serverTowers) {
        seen.add(dto.towerId);

        let tx = dto.x,
          ty = dto.y;
        let snappedSlotId = towerToSlot.get(dto.towerId) || null;
        if (!snappedSlotId) {
          const slot = findNearestFreeSlot(dto.x, dto.y);
          if (slot) {
            snappedSlotId = slot.id;
            towerToSlot.set(dto.towerId, slot.id);
          }
        }
        if (snappedSlotId) {
          const slot = slots.find((s) => s.id === snappedSlotId)!;
          tx = slot.x;
          ty = slot.y;
          setSlotOccupied(slot, true);
        }

        // Création/mise à jour de la tour selon son type
        createOrUpdateTower(dto, tx, ty);
      }

      // Suppression des tours disparues côté serveur
      for (const [id, t] of [...towersById.entries()]) {
        if (!seen.has(id)) {
          towersLayer.removeChild(t.node);
          t.node.destroy({ children: true });
          beamsLayer.removeChild(t.beamLayer);
          t.beamLayer.destroy({ children: true });
          towersById.delete(id);

          const sid = towerToSlot.get(id);
          if (sid) {
            const s = slots.find((x) => x.id === sid);
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
         const res = await fetch("https://game-api-4dbs.onrender.com/state", {
        //const res = await fetch("http://localhost:8000/state", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = await res.json();

        // tours
        if (Array.isArray(json?.towers))
          reconcileTowers(json.towers as TowerDTO[]);

        // joueurs
        const playersCount = Array.isArray(json?.players)
          ? json.players.length
          : 0;
        hasPlayer = playersCount > 0;
        setHasPlayerUI(hasPlayer);

        // démarrage au premier joueur
        if (hasPlayer && !gameStarted) {
          gameStarted = true;
          waitOverlay.visible = false;
          // petit kick de départ (optionnel)
          msSinceSpawn = SPAWN_EVERY_MS; // force un spawn rapide à la prochaine frame
        }
        // pause si plus de joueur
        if (!hasPlayer && gameStarted) {
          waitOverlay.visible = true;
        }
      } catch {
        // silencieux
      }
    }
    function startPolling() {
      fetchStateOnce();
      syncTimer = window.setInterval(fetchStateOnce, 900);
    }
    function stopPolling() {
      if (syncTimer !== null) {
        clearInterval(syncTimer);
        syncTimer = null;
      }
    }
    startPolling();

    // --- ENNEMIS ---
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
    const enemiesLayer = new PIXI.Container();
    app.stage.addChild(enemiesLayer);
    const createEnemy = (offsetDist = 0, speedPxPerSec = 110) => {
      const isMiniBoss = waveInternal % 5 === 0 && Math.random() < 0.15; // un boss sur ~15% des spawns pendant la vague
      const c = new PIXI.Container();

      const shadow = new PIXI.Graphics();
      shadow
        .beginFill(0x000000, 0.3)
        .drawEllipse(
          0,
          isMiniBoss ? 8 : 5,
          isMiniBoss ? 25 : 15,
          isMiniBoss ? 12 : 8
        )
        .endFill();
      c.addChild(shadow);

      const body = new PIXI.Graphics();
      body
        .beginFill(isMiniBoss ? 0x9933ff : 0xff3333)
        .drawCircle(0, 0, isMiniBoss ? 25 : 14)
        .endFill();
      c.addChild(body);

      const glow = new PIXI.Graphics();
      glow
        .beginFill(isMiniBoss ? 0xbb88ff : 0xff6666, 0.3)
        .drawCircle(0, 0, isMiniBoss ? 35 : 20)
        .endFill();
      glow.alpha = 0;
      c.addChild(glow);

      enemiesLayer.addChild(c);

      const e: Enemy = {
        sprite: c,
        progress: offsetDist,
        glow,
        rotation: 0,
        speed: isMiniBoss ? 60 : speedPxPerSec,
        hp: isMiniBoss ? 10 : 3,
        reachedEnd: false,
      };
      placeEnemyAtDistance(e, e.progress);
      enemies.push(e);
    };

    // spawn timing (actif seulement si hasPlayer && gameStarted)
    let msSinceSpawn = 0;
    const SPAWN_EVERY_MS = 1200;

    // --- GAME OVER OVERLAY ---
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
      dropShadow: true,
      dropShadowColor: "#000000",
      dropShadowBlur: 10,
      dropShadowDistance: 5,
    });
    gameOverText.anchor.set(0.5);
    gameOverText.position.set(600, 300);
    gameOverContainer.addChild(gameOverText);
    const restartText = new PIXI.Text("Cliquez pour redémarrer", {
      fill: "#4affff",
      fontSize: 32,
      fontFamily: "Arial",
    });
    restartText.anchor.set(0.5);
    restartText.position.set(600, 400);
    gameOverContainer.addChild(restartText);
    app.stage.addChild(gameOverContainer);

    // --- ALERTE MINI-BOSS ---
    const bossAlert = new PIXI.Text("⚠️ MINI-BOSS ⚠️", {
      fill: "#ffcc00",
      fontSize: 60,
      fontWeight: "bold",
      fontFamily: "Arial",
      dropShadow: true,
      dropShadowColor: "#000000",
      dropShadowBlur: 8,
      dropShadowDistance: 4,
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
          // ~2.5s at 60fps
          bossAlert.alpha -= 0.05;
          if (bossAlert.alpha <= 0) {
            bossAlert.visible = false;
            app.ticker.remove(fade);
          }
        }
      };
      app.ticker.add(fade);
    }

    // --- ATTAQUES DES TOURS (désactivées si pas de joueur) ---
    function towersAttack(nowMs: number) {
      if (!hasPlayer || !gameStarted) return;
      if (towersById.size === 0 || enemies.length === 0) return;

      for (const t of towersById.values()) {
        // On ignore les healers ici, ils soignent via le timer global
        if (t.type === "Healer") continue;

        if (nowMs - t.lastShotAt < t.cooldownMs) continue;

        let best: Enemy | null = null;
        let bestD = Infinity;

        // Recherche de la cible la plus proche
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

        // --- Attaque selon le type de tour ---
        if (t.type === "Mage") {
          // Dégâts directs à la cible
          best.hp -= 2;

          // Dégâts de zone autour de la cible
          for (const e of enemies) {
            if (e === best || e.hp <= 0) continue;
            const d = Math.hypot(
              e.sprite.x - best.sprite.x,
              e.sprite.y - best.sprite.y
            );
            if (d <= 140) {
              // rayon de splash
              e.hp -= 1;
            }
          }

          // Effet visuel explosion AoE
          const explosion = new PIXI.Graphics();
          explosion.beginFill(0xff6600, 0.8).drawCircle(0, 0, 20).endFill();
          explosion.x = best.sprite.x;
          explosion.y = best.sprite.y;
          enemiesLayer.addChild(explosion);

          let scale = 1;
          let alpha = 1;
          const fade = () => {
            scale += 0.1;
            alpha -= 0.07;
            explosion.scale.set(scale);
            explosion.alpha = alpha;
            if (alpha <= 0) {
              enemiesLayer.removeChild(explosion);
              explosion.destroy();
            } else {
              requestAnimationFrame(fade);
            }
          };
          requestAnimationFrame(fade);

          drawBeam(
            t.node.x,
            t.node.y,
            best.sprite.x,
            best.sprite.y,
            t.beamLayer
          );
          continue;
        }

        // --- Tours offensives normales (Archer, Swordsman, etc.) ---
        best.hp -= 1;
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
        pp.x += particle.vx;
        pp.y += particle.vy;
        if (pp.x < 0) pp.x = 1200;
        if (pp.x > 1200) pp.x = 0;
        if (pp.y < 0) pp.y = 700;
        if (pp.y > 700) pp.y = 0;
      });

      // --- SOIN GLOBAL (HEALERS) ---
      let healTimerActive = false;

      function startHealTimer() {
        if (healTimerActive) return;
        healTimerActive = true;
        setInterval(() => {
          if (!hasPlayer || !gameStarted) return;

          // Vérifie s'il existe au moins un healer
          const hasHealer = Array.from(towersById.values()).some(
            (t) => t.type === "Healer"
          );
          if (!hasHealer) return;

          // Applique un soin global de +1 (ou selon ton design)
          if (livesInternal < maxLives) {
            livesInternal = Math.min(maxLives, livesInternal + 1);
            setLives(livesInternal);

            // Effet visuel : halo vert au centre du terrain
            const healPulse = new PIXI.Graphics();
            healPulse.lineStyle(5, 0x2ecc71, 0.9).drawCircle(600, 350, 20);
            app.stage.addChild(healPulse);
            let alpha = 1;
            const animate = () => {
              alpha -= 0.05;
              healPulse.alpha = alpha;
              healPulse.scale.set(1 + (1 - alpha));
              if (alpha <= 0) {
                app.stage.removeChild(healPulse);
                healPulse.destroy();
              } else requestAnimationFrame(animate);
            };
            requestAnimationFrame(animate);
          }
        }, 5000);
      }

      // Démarre le soin automatique
      startHealTimer();

      // Pas de joueur → pause complète (pas de spawn, pas de mouvement)
      if (!hasPlayer || !gameStarted) {
        waitOverlay.visible = true;
        return;
      } else {
        waitOverlay.visible = false;
      }

      // spawn ennemis
      msSinceSpawn += dt;
      const spawnPeriod = Math.max(
        700,
        SPAWN_EVERY_MS - (waveInternal - 1) * 50
      );
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

      // morts + score + progression vague
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

      // arrivées au bout
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

    // --- RESET LOCAL réutilisable (bouton & restart)
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

      // on ne force pas gameStarted ici : il redeviendra true dès qu’un joueur sera détecté
      gameStarted = false;

      enemies.forEach((e) => {
        enemiesLayer.removeChild(e.sprite);
        e.sprite.destroy({ children: true });
      });
      enemies.length = 0;
      msSinceSpawn = 0;

      // si déjà un joueur présent, l’overlay se fermera au prochain poll
      waitOverlay.visible = !hasPlayer;
    };
    resetRef.current = hardResetLocal;
    fetchStateRef.current = () => {
      void fetchStateOnce();
    };

    // --- RESTART SUR CLIC uniquement si game over (sinon on laisse le capteur gérer)
    const onCanvasClick = () => {
      if (!gameOverInternal) return;
      hardResetLocal();
    };
    (app.view as HTMLCanvasElement).addEventListener("click", onCanvasClick);

    // --- CLEANUP ---
    return () => {
      (app.view as HTMLCanvasElement).removeEventListener(
        "click",
        onCanvasClick
      );
      stopPolling();
      app.destroy(true, true);
    };
  }, []);

  // Bouton Reset → /reset puis reset local + refetch
  const onResetClick = async () => {
    try {
       await fetch("https://game-api-4dbs.onrender.com/reset", {
      //await fetch("http://localhost:8000/reset", {
        method: "POST",
      });
    } catch {
      /* même si l’API échoue, on reset côté client */
    }
    resetRef.current?.();
    fetchStateRef.current?.();
  };

  // --- UI / HUD ---
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

        {/* HUD gauche */}
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
          {/* Vies */}
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
              <div
                style={{
                  fontSize: 28,
                  color: "#fff",
                  fontWeight: "bold",
                  lineHeight: 1,
                }}
              >
                {lives}
              </div>
            </div>
          </div>

          {/* Score */}
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
                style={{
                  fontSize: 28,
                  color: "#0a1428",
                  fontWeight: "bold",
                  lineHeight: 1,
                }}
              >
                {score}
              </div>
            </div>
          </div>

          {/* Vague */}
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
              <div
                style={{
                  fontSize: 28,
                  color: "#fff",
                  fontWeight: "bold",
                  lineHeight: 1,
                }}
              >
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
              letterSpacing: 2,
            }}
          >
            Table interactive
          </div>

          <button
            onClick={async () => {
              try {
               await fetch("https://game-api-4dbs.onrender.com/reset", {
               // await fetch("http://localhost:8000/reset", {
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
