# 🎮 Tower Defense — Web Game (React + Pixi.js)

Un petit jeu **Tower Defense** web fait avec **React**, **Vite**, et **Pixi.js**.  
Le jeu s’affiche sur une table (via projecteur) et peut interagir avec des capteurs externes (ex. RFID sur Raspberry Pi, futur ajout).  
Ce prototype affiche un chemin, des ennemis animés, un HUD dynamique, et un système de vagues / game over / redémarrage.

---

## 🚀 Stack utilisée

| Composant | Technologie |
|------------|-------------|
| **Frontend** | React + Vite |
| **Rendu graphique** | Pixi.js (v7) |
| **Langage** | JavaScript (ESNext) |
| **Gestion d’état** | Hooks React (`useState`, `useEffect`) |
| **Backend (prévu)** | FastAPI (Python) — API pour gérer les tours et la logique du jeu |
| **Compatibilité** | Chrome / Edge / Firefox |

---

## 🧩 Fonctionnalités actuelles

✅ Rendu du terrain et du chemin avec effet 3D  
✅ Animation d’ennemis qui suivent le chemin  
✅ Particules d’ambiance animées  
✅ HUD moderne : vies ❤️, score ⭐, vague 🌊  
✅ Gestion des vagues automatiques (vitesse et difficulté croissante)  
✅ Écran de **Game Over** + redémarrage au clic  
✅ Interface prête pour intégration avec un backend API  

---

## 🖥️ Installation et exécution

### 1️⃣ Cloner le projet
```bash
git clone https://github.com/fabio345i/tower-defense-veille.git
cd tower-defense-veille
