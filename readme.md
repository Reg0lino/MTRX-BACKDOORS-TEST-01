# README - Matrix Maze Minigame (Standalone) v1.28

This document describes the standalone Three.js-based Matrix-themed maze minigame.

## Overview

This is a first-person shooter set in a procedurally generated maze with wide corridors, designed to evoke the "back rooms" or "source code" aesthetic of The Matrix. The player uses WASD/Mouse controls and a pistol to eliminate patrolling agents. Agents now exhibit basic combat AI: they detect the player via Line-of-Sight, enter an 'attacking' state, turn to face the player, and fire inaccurate bullets. If the player gets too close, agents will attempt a melee attack. Agent bullets and melee attacks damage the player, indicated by a red screen flash and HP reduction. Getting hit or colliding with an agent can lead to Game Over. The maze features taller, light-gray walls lined with correctly spaced green "door" accents, and bright white floors/ceilings. Stuck agents teleport to recover. Collectible orbs grant temporary map reveals. The objective is to eliminate all agents to reveal and reach the exit.

## Features

*   **Procedural Maze Generation:** DFS with cross-connections (`CROSS_CONNECTION_CHANCE=25%`), wider corridors (2x visual cell width).
*   **Visual Style:** Taller gray walls (`WALL_HEIGHT=24`), white floor/ceiling, spaced green door accents, Matrix aesthetic.
*   **First-Person Controls:** WASD/Mouse/Shift/Click/R. Clamped vertical look. Adjusted walk/run speed. Improved collision handling with penetration check.
*   **Gun & Shooting:** Visual pistol, fast projectile bullets (`BULLET_SPEED=800.0`), particles, recoil, ammo/reload.
*   **Agent AI & Combat:**
    *   **States:** Patrolling, Attacking, Searching (basic), Melee.
    *   **Detection:** Line-of-Sight check (`checkAgentLoS`) against walls. Agents react when player is visible within `AGENT_MAX_VIEW_DISTANCE`.
    *   **Attacking:** Stops moving, turns towards player, fires red bullets (`AGENT_BULLET_SPEED=600.0`) periodically (`AGENT_FIRE_RATE=0.8s`) with inaccuracy (`AGENT_BULLET_SPREAD`).
    *   **Melee:** If player is within `AGENT_MELEE_RANGE` during attack, agent performs melee strike (`AGENT_MELEE_DAMAGE=25`) with cooldown (`AGENT_MELEE_COOLDOWN=1.2s`).
    *   **Pathfinding/Recovery:** Random patrol using `chooseNewPath`. Instant teleport recovery for stuck agents.
    *   **Visuals:** 5 agents, 3 HP, hit feedback, HP bars, removed on death. HUD counts remaining.
*   **Player Damage:**
    *   Takes damage from agent bullets (`AGENT_BULLET_DAMAGE=10`) and melee attacks.
    *   Visual feedback (red screen flash via `#damageOverlay`) and sound on hit.
    *   HP tracked in HUD. HP <= 0 results in Game Over.
*   **Map Power-up Orbs:** Collectible gold orbs (`MAX_ORBS=10`), temporary map reveal (`MAP_REVEAL_DURATION=3s`).
*   **Debug Map:** Toggleable ('M') overlay showing walls, player, agents, orbs, exit.
*   **Player-Agent Collision:** Distance check -> Game Over.
*   **Exit Mechanic:** Spawns on agent clear. Reach to win.
*   **Game States:** Playing, Winning, Game Over. Menu screens.
*   **HUD:** Displays HP, Weapon, Ammo, Reload, Agents Remaining.
*   **Sound:** Player shoot/reload, agent shoot, hits (agent/wall/player), melee, death, win/lose, orb pickup.
*   **Debugging Features (Toggleable):**
    *   'P': Collision Rays.
    *   'M': Map Always On.
    *   'L': Movement/Collision Logs.
    *   'K': Agent AI Logs (States, LoS, Actions).

## Files

*   `maze.html`: Main HTML file (includes damage overlay).
*   `maze.css`: Styling (includes damage overlay style).
*   `maze.js`: Core game logic (includes Agent AI).
*   `README.md`: This file.

## How to Run

1.  Save `maze.html`, `maze.css`, `maze.js`.
2.  Run using a local web server.
3.  Navigate to the HTML file.
4.  Click instructions to play.
5.  Press `Esc` to pause/resume.
6.  Press `P`/`M`/`L`/`K` to toggle debug info/logs.
7.  Click end screen message to reload.

## Debugging Instructions

If you encounter issues (player stuck, agents stuck, AI not working, errors):

1.  **Open Console:** Press F12 -> "Console".
2.  **Enable Logs:** 'L' (Movement), 'K' (Agent AI), 'P' (Collision Rays).
3.  **Reproduce:** Trigger the error. Observe agent state changes and LoS logs ('K'). Check for player damage/hit logs ('L'/'K').
4.  **Copy Output:** Console messages (debug logs + red errors).
5.  **Describe:** What happened, what were you doing, what did you expect?
6.  **Send:** Provide logs and description.

## System Prompt & Instructions for Next Instance (Gemini 2.5)