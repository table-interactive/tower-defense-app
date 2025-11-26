import { useEffect, useRef, useState } from "react";
import * as PIXI from "pixi.js";

export default function App() {
  const pixiContainer = useRef(null);
  const [lives, setLives] = useState(10);
  const [score, setScore] = useState(0);
  const [wave, setWave] = useState(1);
  const [gameOver, setGameOver] = useState(false);

  useEffect(() => {
    const app = new PIXI.Application({
      width: 1200,
      height: 700,
      backgroundColor: 0x0a0e27,
      antialias: true,
    });
    pixiContainer.current.appendChild(app.view);

    // --- Variables internes ---
    let livesInternal = 10;
    let scoreInternal = 0;
    let waveInternal = 1;
    let gameOverInternal = false;

    // --- Fond avec gradient ---
    const background = new PIXI.Graphics();
    background.beginFill(0x0f1729);
    background.drawRect(0, 0, 1200, 700);
    background.endFill();
    app.stage.addChild(background);

    // --- Grille décorative ---
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

    // --- Chemin amélioré ---
    const path = [
      [100, 150],
      [400, 150],
      [400, 350],
      [800, 350],
      [800, 550],
      [1100, 550],
    ];

    // Bordure du chemin (effet 3D)
    const pathBorder = new PIXI.Graphics();
    pathBorder.lineStyle(70, 0x1a3a52, 0.5);
    pathBorder.moveTo(path[0][0], path[0][1]);
    for (let i = 1; i < path.length; i++)
      pathBorder.lineTo(path[i][0], path[i][1]);
    app.stage.addChild(pathBorder);

    // Chemin principal
    const road = new PIXI.Graphics();
    road.lineStyle(50, 0x2a5a7a);
    road.moveTo(path[0][0], path[0][1]);
    for (let i = 1; i < path.length; i++) road.lineTo(path[i][0], path[i][1]);
    app.stage.addChild(road);

    // Ligne centrale du chemin
    const roadCenter = new PIXI.Graphics();
    roadCenter.lineStyle(4, 0x4affff, 0.6);
    roadCenter.lineStyle(4, 0x4affff, 0.6);
    roadCenter.moveTo(path[0][0], path[0][1]);
    for (let i = 1; i < path.length; i++)
      roadCenter.lineTo(path[i][0], path[i][1]);
    app.stage.addChild(roadCenter);
    roadCenter.moveTo(path[0][0], path[0][1]);
    for (let i = 1; i < path.length; i++)
      roadCenter.lineTo(path[i][0], path[i][1]);
    app.stage.addChild(roadCenter);

    // --- Points de départ et d'arrivée ---
    const startPoint = new PIXI.Graphics();
    startPoint.beginFill(0x00ff88);
    startPoint.drawCircle(path[0][0], path[0][1], 25);
    startPoint.endFill();
    startPoint.beginFill(0x00cc66);
    startPoint.drawCircle(path[0][0], path[0][1], 15);
    startPoint.endFill();
    app.stage.addChild(startPoint);

    const endPoint = new PIXI.Graphics();
    endPoint.beginFill(0xff4444);
    endPoint.drawCircle(path[path.length - 1][0], path[path.length - 1][1], 25);
    endPoint.endFill();
    endPoint.beginFill(0xcc3333);
    endPoint.drawCircle(path[path.length - 1][0], path[path.length - 1][1], 15);
    endPoint.endFill();
    app.stage.addChild(endPoint);

    // --- Particules d'ambiance ---
    const particles = new PIXI.Container();
    app.stage.addChild(particles);

    for (let i = 0; i < 30; i++) {
      const particle = new PIXI.Graphics();
      particle.beginFill(0x4affff, Math.random() * 0.3);
      particle.drawCircle(0, 0, Math.random() * 3 + 1);
      particle.endFill();
      particle.x = Math.random() * 1200;
      particle.y = Math.random() * 700;
      particle.vx = (Math.random() - 0.5) * 0.5;
      particle.vy = (Math.random() - 0.5) * 0.5;
      particles.addChild(particle);
    }

    // --- Ennemis ---
    const enemies = [];
    const createEnemy = (offset = 0) => {
      const enemyContainer = new PIXI.Container();

      // Ombre
      const shadow = new PIXI.Graphics();
      shadow.beginFill(0x000000, 0.3);
      shadow.drawEllipse(0, 5, 15, 8);
      shadow.endFill();
      enemyContainer.addChild(shadow);

      // Corps de l'ennemi
      const enemy = new PIXI.Graphics();
      enemy.beginFill(0xff3333);
      enemy.drawCircle(0, 0, 14);
      enemy.endFill();
      enemy.beginFill(0xff6666);
      enemy.drawCircle(-4, -4, 5);
      enemy.endFill();
      enemyContainer.addChild(enemy);

      // Lueur
      const glow = new PIXI.Graphics();
      glow.beginFill(0xff6666, 0.3);
      glow.drawCircle(0, 0, 20);
      glow.endFill();
      enemyContainer.addChild(glow);
      glow.alpha = 0;

      enemyContainer.x = path[0][0];
      enemyContainer.y = path[0][1];
      app.stage.addChild(enemyContainer);

      enemies.push({
        sprite: enemyContainer,
        progress: offset,
        glow: glow,
        rotation: 0,
      });
    };

    let spawnTimer = 0;

    // --- Game Over texte ---
    const gameOverContainer = new PIXI.Container();
    gameOverContainer.visible = false;

    const gameOverBg = new PIXI.Graphics();
    gameOverBg.beginFill(0x000000, 0.8);
    gameOverBg.drawRect(0, 0, 1200, 700);
    gameOverBg.endFill();
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
    gameOverText.x = 600;
    gameOverText.y = 300;
    gameOverContainer.addChild(gameOverText);

    const restartText = new PIXI.Text("Cliquez pour redémarrer", {
      fill: "#4affff",
      fontSize: 32,
      fontFamily: "Arial",
    });
    restartText.anchor.set(0.5);
    restartText.x = 600;
    restartText.y = 400;
    gameOverContainer.addChild(restartText);

    app.stage.addChild(gameOverContainer);

    // --- Boucle de jeu ---
    app.ticker.add((delta) => {
      if (gameOverInternal) return;

      // Animation des particules
      particles.children.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = 1200;
        if (p.x > 1200) p.x = 0;
        if (p.y < 0) p.y = 700;
        if (p.y > 700) p.y = 0;
      });

      // Spawn
      spawnTimer += delta;
      const spawnRate = Math.max(60, 120 - waveInternal * 5);
      if (spawnTimer > spawnRate) {
        createEnemy(0);
        spawnTimer = 0;
      }

      // Mouvements
      for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];
        enemy.progress += delta * (1.5 + waveInternal * 0.1);
        enemy.rotation += 0.05;
        enemy.sprite.children[1].rotation = enemy.rotation;

        // Animation de la lueur
        enemy.glow.alpha = Math.sin(Date.now() * 0.01 + i) * 0.3 + 0.3;

        let totalDist = 0;
        let reachedEnd = true;

        for (let j = 0; j < path.length - 1; j++) {
          const [x1, y1] = path[j];
          const [x2, y2] = path[j + 1];
          const segLen = Math.hypot(x2 - x1, y2 - y1);

          if (enemy.progress <= totalDist + segLen) {
            const ratio = (enemy.progress - totalDist) / segLen;
            enemy.sprite.x = x1 + (x2 - x1) * ratio;
            enemy.sprite.y = y1 + (y2 - y1) * ratio;
            reachedEnd = false;
            break;
          }
          totalDist += segLen;
        }

        if (reachedEnd) {
          app.stage.removeChild(enemy.sprite);
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

      // Augmenter la vague
      if (enemies.length === 0 && spawnTimer > 30) {
        waveInternal++;
        setWave(waveInternal);
        scoreInternal += 100;
        setScore(scoreInternal);
      }
    });

    // --- Redémarrer ---
    app.view.addEventListener("click", () => {
      if (!gameOverInternal) return;

      gameOverInternal = false;
      livesInternal = 10;
      scoreInternal = 0;
      waveInternal = 1;
      setLives(10);
      setScore(0);
      setWave(1);
      setGameOver(false);
      gameOverContainer.visible = false;

      enemies.forEach((e) => app.stage.removeChild(e.sprite));
      enemies.length = 0;
      spawnTimer = 0;
    });

    return () => app.destroy(true, true);
  }, []);

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

        {/* HUD moderne */}
        <div
          style={{
            position: "absolute",
            top: "20px",
            left: "20px",
            display: "flex",
            gap: "15px",
            flexDirection: "column",
          }}
        >
          {/* Vies */}
          <div
            style={{
              background:
                "linear-gradient(135deg, rgba(255,68,68,0.95) 0%, rgba(200,40,40,0.95) 100%)",
              padding: "12px 20px",
              borderRadius: "12px",
              border: "2px solid rgba(255,100,100,0.5)",
              boxShadow: "0 4px 15px rgba(255,68,68,0.4)",
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <span style={{ fontSize: "24px" }}>❤️</span>
            <div>
              <div
                style={{
                  fontSize: "12px",
                  color: "rgba(255,255,255,0.8)",
                  fontWeight: "600",
                }}
              >
                VIES
              </div>
              <div
                style={{
                  fontSize: "28px",
                  color: "#fff",
                  fontWeight: "bold",
                  lineHeight: "1",
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
              borderRadius: "12px",
              border: "2px solid rgba(100,255,255,0.5)",
              boxShadow: "0 4px 15px rgba(74,255,255,0.4)",
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <span style={{ fontSize: "24px" }}>⭐</span>
            <div>
              <div
                style={{
                  fontSize: "12px",
                  color: "rgba(10,20,40,0.8)",
                  fontWeight: "600",
                }}
              >
                SCORE
              </div>
              <div
                style={{
                  fontSize: "28px",
                  color: "#0a1428",
                  fontWeight: "bold",
                  lineHeight: "1",
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
              borderRadius: "12px",
              border: "2px solid rgba(180,100,255,0.5)",
              boxShadow: "0 4px 15px rgba(138,43,226,0.4)",
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <span style={{ fontSize: "24px" }}>🌊</span>
            <div>
              <div
                style={{
                  fontSize: "12px",
                  color: "rgba(255,255,255,0.8)",
                  fontWeight: "600",
                }}
              >
                VAGUE
              </div>
              <div
                style={{
                  fontSize: "28px",
                  color: "#fff",
                  fontWeight: "bold",
                  lineHeight: "1",
                }}
              >
                {wave}
              </div>
            </div>
          </div>
        </div>

        {/* Titre du jeu */}
        <div
          style={{
            position: "absolute",
            top: "20px",
            right: "20px",
            background:
              "linear-gradient(135deg, rgba(0,255,136,0.95) 0%, rgba(0,180,100,0.95) 100%)",
            padding: "15px 30px",
            borderRadius: "12px",
            border: "2px solid rgba(100,255,200,0.5)",
            boxShadow: "0 4px 15px rgba(0,255,136,0.4)",
          }}
        >
          <div
            style={{
              fontSize: "24px",
              color: "#0a1428",
              fontWeight: "bold",
              letterSpacing: "2px",
            }}
          >
            Table interactive 
          </div>
        </div>
      </div>
    </div>
  );
}
