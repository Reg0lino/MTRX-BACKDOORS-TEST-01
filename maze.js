// maze.js
// Version: 1.31.2 (Agent Anim/Bullet Fixes, Rabbit Look, Spawn Orientation)

// --- Basic Setup ---
const scene = new THREE.Scene();
const canvas = document.getElementById('mazeCanvas');
const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
scene.background = new THREE.Color(0x000000);

// --- Audio ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound(type = 'shoot', volume = 0.3, duration = 0.05) {
    if (!audioCtx) return;
    try {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        let f = 440;
        let t = 'sine';
        switch (type) {
            case 'shoot': f = 1200; duration = 0.04; t = 'triangle'; volume = 0.25; break;
            case 'reload': f = 220; duration = 0.15; t = 'square'; volume = 0.2; break;
            case 'hit_agent': f = 660; duration = 0.08; t = 'sawtooth'; volume = 0.4; break;
            case 'hit_wall': f = 110; duration = 0.04; t = 'square'; volume = 0.15; break;
            case 'agent_death': f = 330; duration = 0.3; t = 'square'; volume = 0.5; break;
            case 'game_over': f = 150; duration = 0.8; t = 'sawtooth'; volume = 0.6; break;
            case 'game_win': f = 1200; duration = 0.6; t = 'sine'; volume = 0.6; break;
            case 'orb_pickup': f = 1500; duration = 0.15; t = 'sine'; volume = 0.5; break; // Name kept for map reveal sound
            case 'agent_shoot': f = 880; duration = 0.06; t = 'sawtooth'; volume = 0.3; break;
            case 'player_hit': f = 400; duration = 0.12; t = 'square'; volume = 0.6; break;
            case 'melee_hit': f = 200; duration = 0.1; t = 'square'; volume = 0.7; break;
            default: f = 440;
        }
        o.type = t;
        o.frequency.setValueAtTime(f, audioCtx.currentTime);
        g.gain.setValueAtTime(volume, audioCtx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
        o.connect(g);
        g.connect(audioCtx.destination);
        o.start();
        o.stop(audioCtx.currentTime + duration);
    } catch (e) {
        console.error("Sound Error:", e);
    }
}

// --- Lighting ---
const ambientLight = new THREE.AmbientLight(0xaaaaaa, 0.3);
scene.add(ambientLight);
const playerLight = new THREE.PointLight(0xffffff, 0.6, 60);
playerLight.castShadow = true;
scene.add(playerLight);

// --- Constants ---
// Maze
const MAZE_GRID_SCALE = 2;
const MAZE_WIDTH_CELLS = 17;
const MAZE_HEIGHT_CELLS = 17;
const CELL_SIZE = 10;
const MAZE_WIDTH_UNITS = MAZE_WIDTH_CELLS * MAZE_GRID_SCALE * CELL_SIZE;
const MAZE_HEIGHT_UNITS = MAZE_HEIGHT_CELLS * MAZE_GRID_SCALE * CELL_SIZE;
const WALL_HEIGHT = 24;
const WALL_HEIGHT_SHORT = 8;
const WALL_THICKNESS = CELL_SIZE;
const SHORT_WALL_CHANCE = 0.08;
const CROSS_CONNECTION_CHANCE = 0.25;
const DOOR_HEIGHT_FACTOR = 0.85;
const DOOR_WIDTH_FACTOR = 0.5;
const DOOR_DEPTH = 0.3;
const DOOR_SPACING = 1;

// Player
const PLAYER_HEIGHT = WALL_HEIGHT * 0.5;
const PLAYER_RADIUS = CELL_SIZE * 0.5;
const PLAYER_MAX_HP = 100;
const PLAYER_SPEED_WALK = 25.0;
const PLAYER_SPEED_RUN = 50.0;
const RAYCAST_ORIGIN_Y_FACTOR = 0.5;
const RAYCAST_DISTANCE_BUFFER = PLAYER_RADIUS * 1.2;
const MAX_ROTATION_DELTA = 0.5;
const CAMERA_POLAR_ANGLE_LIMIT_EPSILON = 0.01;
const PENETRATION_RESOLUTION_FACTOR = 1.1;

// Gun
const GUN_CLIP_SIZE = 12;
const GUN_RELOAD_TIME = 1.5;
const GUN_FIRE_RATE = 0.15;
const GUN_RECOIL_AMOUNT_POS = 0.03;
const GUN_RECOIL_AMOUNT_ROT = 0.05;
const GUN_RECOIL_RECOVERY_TIME = 0.1;
const gunBasePosition = new THREE.Vector3(0.35, -0.3, -0.7);
const gunBaseRotation = new THREE.Euler(0, -Math.PI / 36, 0);
const GUN_RELOAD_ANIM_DOWN_POS = -0.1;
const GUN_RELOAD_ANIM_ROT = Math.PI / 12;

// Bullet
const BULLET_SPEED = 800.0; // Unified bullet speed for player and agent
const BULLET_SIZE = 0.08; // Player bullet size
const BULLET_LIFESPAN = 2.0;
const PARTICLE_COUNT_PER_BULLET = 10;
const PARTICLE_LIFESPAN = 0.25;
const PARTICLE_SIZE = 0.05;
// GOAL: Define agent bullet size relative to player bullet size
const AGENT_BULLET_SIZE = BULLET_SIZE * 1.8; // Agent bullets are larger

// Agent
const STARTING_AGENT_COUNT = 5;
const AGENT_SPEED_PATROL = 15.0;
const AGENT_SPEED_ATTACK = 40.0; // Must be < PLAYER_SPEED_RUN
const AGENT_HP = 3;
const AGENT_BODY_WIDTH = PLAYER_RADIUS * 0.8;
const AGENT_BODY_HEIGHT = PLAYER_HEIGHT * 0.9;
const AGENT_BODY_DEPTH_FACTOR = 0.5;
const AGENT_HEAD_SIZE = PLAYER_RADIUS * 0.7;
const AGENT_ARM_LENGTH = AGENT_BODY_HEIGHT * 0.55;
const AGENT_ARM_WIDTH = AGENT_BODY_WIDTH * 0.25;
const AGENT_GUN_LENGTH = AGENT_ARM_WIDTH * 3;
const AGENT_GUN_WIDTH = AGENT_ARM_WIDTH * 1.5;
const AGENT_SWAY_AMOUNT = Math.PI / 10;
const AGENT_SWAY_SPEED = 5.0;
const AGENT_TURN_DELAY = 1000; // Used for random patrolling turns
const AGENT_STUCK_TIMEOUT = 2.0;
const AGENT_COLLISION_DISTANCE = PLAYER_RADIUS + AGENT_BODY_WIDTH * 0.8;
const AGENT_HIT_COLOR = 0xff0000;
const AGENT_HIT_DURATION = 0.15;
const AGENT_HP_BAR_DURATION = 3.0;
const AGENT_HP_BAR_WIDTH = AGENT_HEAD_SIZE * 1.8;
// GOAL: Define agent shooting arm angle constant
const AGENT_SHOOTING_ARM_ANGLE = -Math.PI / 2; // Aim straight forward horizontally

// Agent AI Constants
const AGENT_LOS_CHECK_INTERVAL = 0.25;
const AGENT_MAX_VIEW_DISTANCE = CELL_SIZE * 18;
const AGENT_TIME_TO_LOSE_TARGET = 1.5;
const AGENT_SEARCH_DURATION = 6.0;
const AGENT_TURN_SPEED = Math.PI * 2.0;
const AGENT_FIRE_RATE = 0.7;
const AGENT_BULLET_DAMAGE = 25;
const AGENT_BULLET_SPREAD = 0.04;
const AGENT_MELEE_RANGE = PLAYER_RADIUS + AGENT_BODY_WIDTH * 1.8;
const AGENT_MELEE_DAMAGE = 20;
const AGENT_MELEE_COOLDOWN = 1.5;
const AGENT_MELEE_BURST_COUNT_MIN = 2;
const AGENT_MELEE_BURST_COUNT_MAX = 4;
const AGENT_MELEE_BURST_INTERVAL = 0.2;
const AGENT_GUN_MUZZLE_FORWARD_OFFSET = AGENT_GUN_LENGTH * 0.6;
const AGENT_TARGET_CELL_RECALC_INTERVAL = 0.5;

// Rabbit (Replacing Orb)
const MAX_RABBITS = 10;
const RABBIT_LIFESPAN = 20.0;
const RABBIT_BODY_RADIUS = CELL_SIZE * 0.20;
const RABBIT_HEAD_RADIUS = RABBIT_BODY_RADIUS * 0.7;
const RABBIT_EAR_LENGTH = RABBIT_BODY_RADIUS * 1.5;
const RABBIT_EAR_WIDTH = RABBIT_BODY_RADIUS * 0.3;
const RABBIT_EYE_RADIUS = RABBIT_HEAD_RADIUS * 0.2;
const RABBIT_SPAWN_INTERVAL = 3.0;
const MAP_REVEAL_DURATION = 3.0;
const RABBIT_PICKUP_DISTANCE = PLAYER_RADIUS + RABBIT_BODY_RADIUS * 1.8;
const RABBIT_SPEED = 8.0;
const RABBIT_STUCK_TIMEOUT = 2.5;
const RABBIT_TURN_DELAY = 1500;
const RABBIT_BOUNCE_HEIGHT = RABBIT_BODY_RADIUS * 1.5;
const RABBIT_BOUNCE_SPEED = 5.0;

// --- State & Core Objects ---
const mazeGrid = [];
const activeBullets = [];
const agents = [];
const activeRabbits = [];
const wallMeshes = [];
let controls;
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let isRunning = false;
let currentSpeed = PLAYER_SPEED_WALK;
let playerPosition = new THREE.Vector3();
let playerHP = PLAYER_MAX_HP;
const clock = new THREE.Clock();
let mazeExitObject = null;
let mazeExitPosition = null;
let gameWon = false;
let gameOver = false;
let agentsRemaining = 0;
let lastCamYRotation = 0; // GOAL: Initialize this properly during player spawn
let gunGroup = null;
let currentAmmo = GUN_CLIP_SIZE;
let isReloading = false;
let reloadTimer = 0;
let canShoot = true;
let shootTimer = 0;
let isRecoiling = false;
let recoilRecoveryTimer = 0;
let isReloadAnimating = false;
let rabbitSpawnTimer = RABBIT_SPAWN_INTERVAL;
let mapRevealTimer = 0;
let isMapRevealing = false;

// --- Debugging ---
let DEBUG_COLLISION = false;
let DEBUG_MOVEMENT = false;
let DEBUG_AGENT = false;
const debugRayArrows = [];
const DEBUG_ARROW_LENGTH = RAYCAST_DISTANCE_BUFFER * 1.1;
let DEBUG_MAP_VISIBLE = false;
let debugMapCanvas = null;
let debugMapCtx = null;
const DEBUG_MAP_SCALE = 5;
let agentStuckCounter = 0;
const AGENT_STUCK_LOG_THRESHOLD = 60;

// --- Raycaster & Temp Vectors ---
const raycaster = new THREE.Raycaster();
const playerWorldDirection = new THREE.Vector3();
const playerRightDirection = new THREE.Vector3();
const collisionCheckOrigin = new THREE.Vector3();
const collisionCheckDirection = new THREE.Vector3();
const tempVec = new THREE.Vector3();
const tempVec2 = new THREE.Vector3();
const tempQuat = new THREE.Quaternion();

// --- Materials ---
const wallMaterial = new THREE.MeshPhongMaterial({ color: 0xcccccc, specular: 0x111111, shininess: 10, emissive: 0x333333, emissiveIntensity: 0.4 });
const floorMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
const doorMaterial = new THREE.MeshBasicMaterial({ color: 0x005500 });
const agentBodyMaterial = new THREE.MeshPhongMaterial({ color: 0x111111, specular: 0x333333, shininess: 20 });
const agentHeadMaterial = new THREE.MeshPhongMaterial({ color: 0xBC8F8F, specular: 0x222222, shininess: 10 });
const sunglassesMaterial = new THREE.MeshBasicMaterial({ color: 0x050505 });
const agentArmMaterial = agentBodyMaterial.clone();
const agentGunMaterial = new THREE.MeshBasicMaterial({ color: 0x333333 });
const gunMaterial = new THREE.MeshPhongMaterial({ color: 0x222222, specular: 0x555555, shininess: 30 });
let exitMaterial = null;
const agentHpBarBgMaterial = new THREE.MeshBasicMaterial({ color: 0x550000, transparent: true, opacity: 0.7 });
const agentHpBarFillMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.9 });
const bulletMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.9 }); // Player's green bullets
const particleMaterial = new THREE.PointsMaterial({ color: 0x00dd00, size: PARTICLE_SIZE, transparent: true, opacity: 0.6, sizeAttenuation: true, blending: THREE.AdditiveBlending });
// GOAL: Define agent bullet material (make it red)
const agentBulletMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.9 }); // Agent's red bullets
// GOAL: Make rabbits white and less shiny
const rabbitBodyMaterial = new THREE.MeshPhongMaterial({
    color: 0xFFFFFF, // White
    specular: 0x555555, // Much less specular reflection
    shininess: 5,      // Much less shiny
});
const rabbitEyeMaterial = new THREE.MeshBasicMaterial({ color: 0x111111 }); // Black eyes


// --- Geometry ---
const bulletGeometry = new THREE.SphereGeometry(BULLET_SIZE, 6, 6); // Player bullet geometry
// GOAL: Define agent bullet geometry with its specific size
const agentBulletGeometry = new THREE.SphereGeometry(AGENT_BULLET_SIZE, 6, 6); // Agent bullet geometry
// Rabbit geometry components
const rabbitBodyGeometry = new THREE.SphereGeometry(RABBIT_BODY_RADIUS, 8, 6);
const rabbitHeadGeometry = new THREE.SphereGeometry(RABBIT_HEAD_RADIUS, 6, 4);
const rabbitEarGeometry = new THREE.CylinderGeometry(RABBIT_EAR_WIDTH / 2, RABBIT_EAR_WIDTH / 3, RABBIT_EAR_LENGTH, 4);
const rabbitEyeGeometry = new THREE.SphereGeometry(RABBIT_EYE_RADIUS, 4, 4);


// --- HUD & Menu Elements ---
let hudHpBarFill = null;
let hudWeaponName = null;
let hudAmmoCount = null;
let hudReloadIndicator = null;
let hudReloadProgress = null;
let hudAgentCount = null;
let blockerElement = null;
let instructionsElement = null;
let instructionsSpan = null;
const MENU_GLITCH_CHARS = ['█', '▓', '▒', '░', '_', '^', '~', '!', '*', ';', ':', '|', '/', '\\', ' '];
let menuEffectInterval = null;
let damageOverlayElement = null;

// --- Helper: World to Grid Conversion ---
function worldToGrid(worldX, worldZ) {
    const gridX = Math.floor((worldX / (MAZE_GRID_SCALE * CELL_SIZE)) + MAZE_WIDTH_CELLS / 2);
    const gridZ = Math.floor((worldZ / (MAZE_GRID_SCALE * CELL_SIZE)) + MAZE_HEIGHT_CELLS / 2);
    return { x: gridX, y: gridZ }; // y is grid Z
}

function gridToWorld(gridX, gridY) {
    const worldX = (gridX - MAZE_WIDTH_CELLS / 2 + 0.5) * MAZE_GRID_SCALE * CELL_SIZE;
    const worldZ = (gridY - MAZE_HEIGHT_CELLS / 2 + 0.5) * MAZE_GRID_SCALE * CELL_SIZE;
    return { x: worldX, z: worldZ };
}

// --- Maze Generation ---
function initMazeGrid() {
    mazeGrid.length = 0;
    for (let y = 0; y < MAZE_HEIGHT_CELLS; y++) {
        mazeGrid[y] = [];
        for (let x = 0; x < MAZE_WIDTH_CELLS; x++) {
            mazeGrid[y][x] = {
                x: x, y: y, visited: false,
                walls: { top: true, bottom: true, left: true, right: true },
                isWall: true, isPath: false
            };
        }
    }
    console.log(`Initialized ${MAZE_HEIGHT_CELLS}x${MAZE_WIDTH_CELLS} grid.`);
}

function getNeighbors(cell) {
    const neighbors = [];
    const { x, y } = cell;
    const potential = [{ x: x, y: y - 2 }, { x: x, y: y + 2 }, { x: x - 2, y: y }, { x: x + 2, y: y }];
    for (const p of potential) {
        if (p.y >= 0 && p.y < MAZE_HEIGHT_CELLS && p.x >= 0 && p.x < MAZE_WIDTH_CELLS) {
            const neighbor = mazeGrid[p.y]?.[p.x];
            if (neighbor && !neighbor.visited) {
                neighbors.push(neighbor);
            }
        }
    }
    return neighbors;
}

function removeWall(cell1, cell2) {
    const dx = cell1.x - cell2.x; const dy = cell1.y - cell2.y;
    let wallX, wallY;
    if (dx === 2) { wallX = cell1.x - 1; wallY = cell1.y; cell1.walls.left = false; cell2.walls.right = false; }
    else if (dx === -2) { wallX = cell1.x + 1; wallY = cell1.y; cell1.walls.right = false; cell2.walls.left = false; }
    else if (dy === 2) { wallX = cell1.x; wallY = cell1.y - 1; cell1.walls.top = false; cell2.walls.bottom = false; }
    else if (dy === -2) { wallX = cell1.x; wallY = cell1.y + 1; cell1.walls.bottom = false; cell2.walls.top = false; }
    if (wallX !== undefined && wallY !== undefined && mazeGrid[wallY]?.[wallX]) {
        mazeGrid[wallY][wallX].isWall = false; mazeGrid[wallY][wallX].isPath = true;
        if (dx === 2 || dx === -2) { mazeGrid[wallY][wallX].walls.left = false; mazeGrid[wallY][wallX].walls.right = false; }
        if (dy === 2 || dy === -2) { mazeGrid[wallY][wallX].walls.top = false; mazeGrid[wallY][wallX].walls.bottom = false; }
    } else { console.warn(`Could not find wall cell between (${cell1.x},${cell1.y}) and (${cell2.x},${cell2.y})`); }
}

function generateMaze(startCell) {
    console.log(`Starting maze generation...`);
    const stack = []; startCell.visited = true; startCell.isWall = false; startCell.isPath = true; stack.push(startCell);
    while (stack.length > 0) {
        const current = stack.pop(); const neighbors = getNeighbors(current);
        if (neighbors.length > 0) {
            stack.push(current); const chosen = neighbors[Math.floor(Math.random() * neighbors.length)];
            removeWall(current, chosen); chosen.visited = true; chosen.isWall = false; chosen.isPath = true; stack.push(chosen);
        }
    }
    console.log("Maze generation complete.");
}

function addCrossConnections(chance) {
    console.log(`Adding cross connections with chance: ${chance * 100}%`);
    let connectionsAdded = 0;
    for (let y = 0; y < MAZE_HEIGHT_CELLS; y++) {
        for (let x = 0; x < MAZE_WIDTH_CELLS; x++) {
            const cell = mazeGrid[y]?.[x]; if (!cell || !cell.visited) continue;
            if (cell.walls.right && x < MAZE_WIDTH_CELLS - 2 && mazeGrid[y]?.[x + 2]?.visited) { if (Math.random() < chance) { removeWall(cell, mazeGrid[y][x + 2]); connectionsAdded++; } }
            if (cell.walls.bottom && y < MAZE_HEIGHT_CELLS - 2 && mazeGrid[y + 2]?.[x]?.visited) { if (Math.random() < chance) { removeWall(cell, mazeGrid[y + 2][x]); connectionsAdded++; } }
        }
    }
    console.log(`Added ${connectionsAdded} cross connections.`);
}


// --- Create 3D Geometry (Cleaned Format) ---
function createMazeGeometry() {
    console.log("Creating maze geometry...");
    wallMeshes.length = 0; mazeExitObject = null; mazeExitPosition = null;
    const wallGeometryFull = new THREE.BoxGeometry(WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS);
    const wallGeometryShort = new THREE.BoxGeometry(WALL_THICKNESS, WALL_HEIGHT_SHORT, WALL_THICKNESS);
    const doorHeight = WALL_HEIGHT * DOOR_HEIGHT_FACTOR;
    const doorWidth = MAZE_GRID_SCALE * CELL_SIZE * DOOR_WIDTH_FACTOR;
    const doorGeometry = new THREE.BoxGeometry(doorWidth, doorHeight, DOOR_DEPTH);

    const getWallWorldPos = (gridX, gridY) => {
         const worldX = (gridX - (MAZE_WIDTH_CELLS * MAZE_GRID_SCALE) / 2 + 0.5) * CELL_SIZE;
         const worldZ = (gridY - (MAZE_HEIGHT_CELLS * MAZE_GRID_SCALE) / 2 + 0.5) * CELL_SIZE;
         return { x: worldX, z: worldZ };
    }

    for (let gridY = 0; gridY < MAZE_HEIGHT_CELLS * MAZE_GRID_SCALE; gridY++) {
        for (let gridX = 0; gridX < MAZE_WIDTH_CELLS * MAZE_GRID_SCALE; gridX++) {
            const cellX = Math.floor(gridX / MAZE_GRID_SCALE);
            const cellY = Math.floor(gridY / MAZE_GRID_SCALE);
            const cell = mazeGrid[cellY]?.[cellX];

            if (cell && !cell.isPath) { // Is a wall block
                 const isBorder = cellX === 0 || cellX === MAZE_WIDTH_CELLS - 1 || cellY === 0 || cellY === MAZE_HEIGHT_CELLS - 1;
                 let isShort = !isBorder && Math.random() < SHORT_WALL_CHANCE;
                 const wallGeometry = isShort ? wallGeometryShort : wallGeometryFull;
                 const currentWallMaterial = wallMaterial.clone();
                 const wallMesh = new THREE.Mesh(wallGeometry, currentWallMaterial);
                 const meshHeight = isShort ? WALL_HEIGHT_SHORT : WALL_HEIGHT;
                 const wallBaseY = 0;
                 const pos = getWallWorldPos(gridX, gridY);
                 wallMesh.position.set(pos.x, wallBaseY + meshHeight / 2, pos.z);
                 wallMesh.castShadow = true; wallMesh.receiveShadow = true;
                 scene.add(wallMesh);
                 wallMeshes.push(wallMesh);
                 wallMesh.userData = { isWall: true, gridX: gridX, gridY: gridY };

                 if (!isShort) { // Add Doors
                    let placeDoor = false; let doorRotation = 0; let doorOffset = new THREE.Vector3(); const doorWorldY = wallBaseY + doorHeight / 2;
                    const checkAndPlaceDoor = (nX, nY, wd, oD, rY) => {
                        const nCX = Math.floor(nX / MAZE_GRID_SCALE); const nCY = Math.floor(nY / MAZE_GRID_SCALE); const nC = mazeGrid[nCY]?.[nCX];
                        if (nC && nC.isPath) {
                             let spacingOk = (oD === 'x') ? (gridY % (DOOR_SPACING + 1) === 0) : (gridX % (DOOR_SPACING + 1) === 0);
                             if (spacingOk) {
                                 placeDoor = true; doorRotation = rY; doorOffset.set(pos.x, doorWorldY, pos.z);
                                 const sX = Math.sign(nX - gridX); const sZ = Math.sign(nY - gridY);
                                 if (oD === 'x') { doorOffset.x += wd / 2 * sX + DOOR_DEPTH / 2 * sX; } else { doorOffset.z += wd / 2 * sZ + DOOR_DEPTH / 2 * sZ; }
                                 return true;
                             }
                        } return false;
                    };
                    if (!placeDoor && gridX < MAZE_WIDTH_CELLS*MAZE_GRID_SCALE - 1) { checkAndPlaceDoor(gridX + 1, gridY, WALL_THICKNESS, 'x', Math.PI / 2); }
                    if (!placeDoor && gridX > 0) { checkAndPlaceDoor(gridX - 1, gridY, WALL_THICKNESS, 'x', Math.PI / 2); }
                    if (!placeDoor && gridY < MAZE_HEIGHT_CELLS*MAZE_GRID_SCALE - 1) { checkAndPlaceDoor(gridX, gridY + 1, WALL_THICKNESS, 'z', 0); }
                    if (!placeDoor && gridY > 0) { checkAndPlaceDoor(gridX, gridY - 1, WALL_THICKNESS, 'z', 0); }
                    if (placeDoor) { const dM = new THREE.Mesh(doorGeometry, doorMaterial); dM.position.copy(doorOffset); dM.rotation.y = doorRotation; dM.userData = { isDoor: true }; scene.add(dM); }
                 }
            }
        }
    }

    const floorGeometry = new THREE.PlaneGeometry(MAZE_WIDTH_UNITS, MAZE_HEIGHT_UNITS);
    const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial); floorMesh.rotation.x = -Math.PI / 2; floorMesh.position.y = 0; floorMesh.receiveShadow = true;
    scene.add(floorMesh);
    const ceilingMesh = new THREE.Mesh(floorGeometry, floorMaterial.clone()); ceilingMesh.rotation.x = Math.PI / 2; ceilingMesh.position.y = WALL_HEIGHT;
    scene.add(ceilingMesh);

    // GOAL: Set initial player position AND orientation based on maze openings
    const startCellX = 1; const startCellY = 1;
    const startWorldPos = gridToWorld(startCellX, startCellY);
    playerPosition.set(startWorldPos.x, PLAYER_HEIGHT, startWorldPos.z);
    camera.position.copy(playerPosition); // Set camera position

    // Set initial camera rotation
    let initialYRotation = 0; // Default facing positive Z (down in grid)
    const startCell = mazeGrid[startCellY]?.[startCellX];
    if (startCell) {
        if (!startCell.walls.bottom) { // Path down (positive Z)
            initialYRotation = 0;
        } else if (!startCell.walls.right) { // Path right (positive X)
            initialYRotation = -Math.PI / 2;
        } else if (!startCell.walls.top) { // Path up (negative Z)
            initialYRotation = Math.PI;
        } else if (!startCell.walls.left) { // Path left (negative X)
            initialYRotation = Math.PI / 2;
        }
        console.log(`Spawn cell [${startCellX}, ${startCellY}] walls: T${startCell.walls.top}, B${startCell.walls.bottom}, L${startCell.walls.left}, R${startCell.walls.right}. Initial Yaw: ${initialYRotation.toFixed(2)}`);
    } else {
        console.warn(`Could not find start cell [${startCellX}, ${startCellY}] for orientation check.`);
    }
    controls.getObject().rotation.y = initialYRotation; // Set rotation on the controls object
    lastCamYRotation = initialYRotation; // Sync the tracking variable

    console.log("Maze geometry created.");
}


// --- Agent Creation and Logic ---
function createAgents() {
    const bodyGeom=new THREE.BoxGeometry(AGENT_BODY_WIDTH,AGENT_BODY_HEIGHT,AGENT_BODY_WIDTH*AGENT_BODY_DEPTH_FACTOR); const headGeom=new THREE.BoxGeometry(AGENT_HEAD_SIZE,AGENT_HEAD_SIZE,AGENT_HEAD_SIZE); const glassGeom=new THREE.BoxGeometry(AGENT_HEAD_SIZE*.8,AGENT_HEAD_SIZE*.3,AGENT_HEAD_SIZE*.1); const armGeom=new THREE.BoxGeometry(AGENT_ARM_WIDTH,AGENT_ARM_LENGTH,AGENT_ARM_WIDTH); const gunGeom=new THREE.BoxGeometry(AGENT_GUN_WIDTH,AGENT_GUN_WIDTH,AGENT_GUN_LENGTH); const hpBarH=AGENT_HP_BAR_WIDTH*.15;const hpBgGeo=new THREE.PlaneGeometry(AGENT_HP_BAR_WIDTH,hpBarH);const hpFillGeo=new THREE.PlaneGeometry(AGENT_HP_BAR_WIDTH,hpBarH); agents.length=0;
    for(let i=0;i<STARTING_AGENT_COUNT;i++){
        let placed=false; let ax,ay; const pStartCell=worldToGrid(playerPosition.x,playerPosition.z); while(!placed){ax=Math.floor(Math.random()*(MAZE_WIDTH_CELLS-2))+1; ay=Math.floor(Math.random()*(MAZE_HEIGHT_CELLS-2))+1; if(mazeGrid[ay]?.[ax]?.isPath&&!(ax===pStartCell.x&&ay===pStartCell.y)){placed=true;}} const agentGroup=new THREE.Group(); const bodyM=new THREE.Mesh(bodyGeom,agentBodyMaterial.clone()); bodyM.castShadow=true; bodyM.position.y=AGENT_BODY_HEIGHT/2; agentGroup.add(bodyM); const headM=new THREE.Mesh(headGeom,agentHeadMaterial.clone()); headM.castShadow=true; headM.position.y=AGENT_BODY_HEIGHT+AGENT_HEAD_SIZE/2; agentGroup.add(headM); const glassM=new THREE.Mesh(glassGeom,sunglassesMaterial.clone()); glassM.position.y=headM.position.y; glassM.position.z=AGENT_HEAD_SIZE*.51; agentGroup.add(glassM); const armPY=AGENT_BODY_HEIGHT*.85; const armOX=AGENT_BODY_WIDTH/2+AGENT_ARM_WIDTH/2; const lArmM=new THREE.Mesh(armGeom,agentArmMaterial.clone()); lArmM.castShadow=true; lArmM.position.set(-armOX,armPY-AGENT_ARM_LENGTH/2,0); agentGroup.add(lArmM); const rArmM=new THREE.Mesh(armGeom,agentArmMaterial.clone()); rArmM.castShadow=true; rArmM.position.set(armOX,armPY-AGENT_ARM_LENGTH/2,0); agentGroup.add(rArmM); const gunM=new THREE.Mesh(gunGeom,agentGunMaterial.clone()); gunM.castShadow=true; gunM.position.set(0,-AGENT_ARM_LENGTH/2+AGENT_GUN_WIDTH/2,AGENT_GUN_LENGTH/2-AGENT_ARM_WIDTH/2); gunM.rotation.y=Math.PI/2; rArmM.add(gunM); const hpBgM=new THREE.Mesh(hpBgGeo,agentHpBarBgMaterial.clone()); const hpFillM=new THREE.Mesh(hpFillGeo,agentHpBarFillMaterial.clone()); hpBgM.position.y=headM.position.y+AGENT_HEAD_SIZE*.8; hpFillM.position.y=hpBgM.position.y; hpFillM.position.z=.01; hpBgM.visible=false; hpFillM.visible=false; agentGroup.add(hpBgM); agentGroup.add(hpFillM); const startWorld=gridToWorld(ax,ay); agentGroup.position.set(startWorld.x,0,startWorld.z); scene.add(agentGroup);

        const agentData={
            id: `Agent ${i}`, group: agentGroup, hp: AGENT_HP,
            gridX: ax, gridY: ay, targetPos: agentGroup.position.clone(),
            currentPathCellIndex: -1, pathToTarget: [], targetGridPos: {x: ax, y: ay},
            currentDir: null, lastTurnTime: performance.now() - Math.random() * AGENT_TURN_DELAY,
            hitTimer: 0, hpBar: { bg: hpBgM, fill: hpFillM, timer: 0 },
            leftArm: lArmM, rightArm: rArmM, armPivotY: armPY, gunMesh: gunM,
            isMoving: false, stuckLogTimer: 0, timeSinceLastMove: 0, isTeleporting: false,
            state: 'patrolling', canSeePlayer: false, timeSincePlayerSeen: 0, lastKnownPlayerPos: new THREE.Vector3(),
            shootCooldownTimer: Math.random() * AGENT_FIRE_RATE, meleeCooldownTimer: 0, losCheckTimer: Math.random() * AGENT_LOS_CHECK_INTERVAL,
            searchTimer: 0, targetCellRecalcTimer: 0, currentTargetRotation: new THREE.Quaternion().copy(agentGroup.quaternion),
            meleeBurstCount: 0, meleeBurstIntervalTimer: 0,
        };
        agentGroup.userData={isAgentGroup:true,agentRef:agentData}; bodyM.userData={part:'body',agentRef:agentData,originalMaterial:agentBodyMaterial,isAgentPart:true}; headM.userData={part:'head',agentRef:agentData,originalMaterial:agentHeadMaterial,isAgentPart:true}; glassM.userData={part:'glasses',agentRef:agentData,originalMaterial:sunglassesMaterial,isAgentPart:true}; lArmM.userData={part:'arm_left',agentRef:agentData,originalMaterial:agentArmMaterial,isAgentPart:true}; rArmM.userData={part:'arm_right',agentRef:agentData,originalMaterial:agentArmMaterial,isAgentPart:true}; gunM.userData={part:'gun',agentRef:agentData,originalMaterial:agentGunMaterial,isAgentPart:true}; agents.push(agentData);
    }
    agentsRemaining = agents.length;
    console.log(`Created ${agents.length} agents. Initial count: ${agentsRemaining}`);
}

function getAgentGunTipPosition(agent) {
    if (!agent.gunMesh) return agent.group.position.clone();
    const gunTipPos = tempVec.set(0, 0, AGENT_GUN_MUZZLE_FORWARD_OFFSET);
    agent.gunMesh.localToWorld(gunTipPos);
    return gunTipPos;
}

function checkAgentLoS(agent) {
    if (!controls.isLocked) { agent.canSeePlayer = false; return false; }
    const agentHeadPos = tempVec.copy(agent.group.position);
    agentHeadPos.y += AGENT_BODY_HEIGHT + AGENT_HEAD_SIZE * 0.5;
    const playerPos = camera.position;
    const directionToPlayer = tempVec2.copy(playerPos).sub(agentHeadPos);
    const distanceToPlayer = directionToPlayer.length();
    if (distanceToPlayer > AGENT_MAX_VIEW_DISTANCE) { agent.canSeePlayer = false; return false; }
    directionToPlayer.normalize();
    raycaster.set(agentHeadPos, directionToPlayer);
    const intersections = raycaster.intersectObjects(wallMeshes, false);
    if (intersections.length > 0 && intersections[0].distance < distanceToPlayer - PLAYER_RADIUS) {
        if (agent.canSeePlayer && DEBUG_AGENT) console.log(`${agent.id}: LoS Blocked. Dist:${intersections[0].distance.toFixed(1)}<PlayerDist:${distanceToPlayer.toFixed(1)}`);
        agent.canSeePlayer = false; return false;
    } else {
        if (!agent.canSeePlayer && DEBUG_AGENT) console.log(`${agent.id}: LoS Acquired! PlayerDist:${distanceToPlayer.toFixed(1)}`);
        agent.canSeePlayer = true; agent.timeSincePlayerSeen = 0; agent.lastKnownPlayerPos.copy(playerPos); return true;
    }
}

function smoothTurnTowards(object, targetPosition, turnSpeed, delta) {
    tempVec.copy(targetPosition).sub(object.position); tempVec.y = 0; tempVec.normalize();
    if (tempVec.lengthSq() < 0.0001) return;
    tempQuat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tempVec);
    const angle = object.quaternion.angleTo(tempQuat);
    if (angle < 0.001) { object.quaternion.copy(tempQuat); return; }
    const maxAngle = turnSpeed * delta; const t = Math.min(1, maxAngle / angle);
    if (isNaN(t)) return;
    object.quaternion.slerp(tempQuat, t);
}

function updateAgents(delta, time) {
    const now = performance.now();
    for (let i = 0; i < agents.length; i++) {
        const agent = agents[i]; const agentId = agent.id;
        // HP Bar & Hit Flash
        agent.stuckLogTimer -= delta;
        if(agent.hitTimer>0){agent.hitTimer-=delta;if(agent.hitTimer<=0){agent.group.traverse((c)=>{if(c.isMesh&&c.userData.originalMaterial){c.material=c.userData.originalMaterial;if(c.userData.hitMaterial){c.userData.hitMaterial=null;}}});}}
        if(agent.hpBar.timer>0){agent.hpBar.timer-=delta;if(!agent.hpBar.bg.visible){agent.hpBar.bg.visible=true;agent.hpBar.fill.visible=true;}agent.hpBar.bg.lookAt(camera.position);agent.hpBar.fill.lookAt(camera.position);const hpR=Math.max(0,agent.hp)/AGENT_HP;agent.hpBar.fill.scale.x=hpR;agent.hpBar.fill.position.x=-AGENT_HP_BAR_WIDTH*(1-hpR)/2;}else if(agent.hpBar.bg.visible){agent.hpBar.bg.visible=false;agent.hpBar.fill.visible=false;}
        // AI Timers & LoS
        agent.shootCooldownTimer -= delta; agent.meleeCooldownTimer -= delta; agent.meleeBurstIntervalTimer -= delta;
        agent.losCheckTimer -= delta; agent.targetCellRecalcTimer -= delta;
        if(agent.state==='attacking'||agent.state==='searching'||agent.state==='melee'||agent.losCheckTimer<=0){checkAgentLoS(agent);agent.losCheckTimer=AGENT_LOS_CHECK_INTERVAL;}
        if(agent.canSeePlayer){agent.timeSincePlayerSeen=0;}else{agent.timeSincePlayerSeen+=delta;}
        const playerDist = agent.group.position.distanceTo(playerPosition);
        // State Transitions
        const currentState=agent.state; let nextState=currentState;
        switch(currentState){case 'patrolling':if(agent.canSeePlayer){nextState='attacking';}break;case 'attacking':if(!agent.canSeePlayer&&agent.timeSincePlayerSeen>AGENT_TIME_TO_LOSE_TARGET){nextState='searching';}else if(agent.canSeePlayer&&playerDist<AGENT_MELEE_RANGE){nextState='melee';}break;case 'searching':if(agent.canSeePlayer){nextState='attacking';}else if(agent.searchTimer<=0||agent.group.position.distanceTo(agent.targetPos)<CELL_SIZE*0.5){nextState='patrolling';}break;case 'melee':if(agent.meleeCooldownTimer<=0&&playerDist>=AGENT_MELEE_RANGE&&agent.canSeePlayer){nextState='attacking';}else if(!agent.canSeePlayer&&agent.timeSincePlayerSeen>AGENT_TIME_TO_LOSE_TARGET){nextState='searching';}break;case 'teleporting':nextState='patrolling';break;}
        if(nextState!==currentState){if(DEBUG_AGENT)console.log(`${agentId}: State change ${currentState} -> ${nextState}`);agent.state=nextState;agent.currentDir=null;agent.isMoving=false;if(nextState==='searching'){agent.searchTimer=AGENT_SEARCH_DURATION;agent.targetCellRecalcTimer=0;if(DEBUG_AGENT)console.log(`${agentId}: Starting search towards grid ${agent.targetGridPos.x},${agent.targetGridPos.y}`);}if(nextState==='patrolling'){agent.lastTurnTime=now-AGENT_TURN_DELAY;}if(nextState==='melee'){agent.meleeBurstCount=0;agent.targetCellRecalcTimer=0;}if(nextState==='attacking'){agent.targetCellRecalcTimer=0;}}
        // Execute State Behavior
        let agentSpeed = AGENT_SPEED_PATROL;
        switch(agent.state){case'patrolling':agentSpeed=AGENT_SPEED_PATROL;const dTgtP=agent.group.position.distanceTo(agent.targetPos);if(agent.currentDir&&dTgtP>CELL_SIZE*.5){agent.timeSinceLastMove+=delta;}else{agent.timeSinceLastMove=0;}if(agent.timeSinceLastMove>AGENT_STUCK_TIMEOUT){if(agent.stuckLogTimer<=0){console.warn(`${agentId} stuck timeout. Teleporting.`);agent.stuckLogTimer=5.0;}const cPos=gridToWorld(agent.gridX,agent.gridY);agent.group.position.set(cPos.x,0,cPos.z);agent.targetPos.copy(agent.group.position);agent.group.visible=true;agent.timeSinceLastMove=0;agent.currentDir=null;agent.lastTurnTime=now-AGENT_TURN_DELAY;agent.state='teleporting';if(DEBUG_AGENT)console.log(`${agentId}: Teleported.`);continue;}if(!agent.currentDir||dTgtP<CELL_SIZE*.5||now-agent.lastTurnTime>AGENT_TURN_DELAY){chooseNewAgentPath(agent,!agent.currentDir);}break;case'attacking':case'searching':case'melee':agentSpeed=AGENT_SPEED_ATTACK;smoothTurnTowards(agent.group,agent.lastKnownPlayerPos,AGENT_TURN_SPEED,delta);if(agent.targetCellRecalcTimer<=0){agent.targetGridPos=worldToGrid(agent.lastKnownPlayerPos.x,agent.lastKnownPlayerPos.z);agent.targetCellRecalcTimer=AGENT_TARGET_CELL_RECALC_INTERVAL;agent.currentDir=null;if(DEBUG_AGENT)console.log(`${agentId}(${agent.state}): Recalculating path towards grid (${agent.targetGridPos.x},${agent.targetGridPos.y})`);}const dTgtA=agent.group.position.distanceTo(agent.targetPos);if(!agent.currentDir||dTgtA<CELL_SIZE*.5){chooseAgentPathTowards(agent,agent.targetGridPos.x,agent.targetGridPos.y);}if(agent.state==='attacking'){agentAttemptShoot(agent);}if(agent.state==='melee'){attemptMeleeBurst(agent);}if(agent.state==='searching'){agent.searchTimer-=delta;}break;}
        // Apply Movement
        if(agent.currentDir&&agent.group.position.distanceTo(agent.targetPos)>0.05){const mDir=agent.targetPos.clone().sub(agent.group.position).normalize();const mDist=agentSpeed*delta;agent.group.position.add(mDir.multiplyScalar(Math.min(mDist,agent.group.position.distanceTo(agent.targetPos))));agent.isMoving=true;}else if(agent.currentDir){agent.group.position.copy(agent.targetPos);agent.isMoving=false;agent.currentDir=null;}else{agent.isMoving=false;}

        // GOAL: Adjust agent arm animations for shooting and patrolling
        // Animation
        if (agent.state === 'attacking' || agent.state === 'melee') {
            // Right arm (shooting arm) moves to horizontal shooting position
            agent.rightArm.rotation.x = THREE.MathUtils.lerp(agent.rightArm.rotation.x, AGENT_SHOOTING_ARM_ANGLE, delta * 10); // Faster lerp to shooting pose
            // Left arm stays relatively neutral
            agent.leftArm.rotation.x = THREE.MathUtils.lerp(agent.leftArm.rotation.x, 0, delta * 10);
        } else if (agent.state === 'patrolling' && agent.leftArm && agent.rightArm) {
            if (agent.isMoving) {
                 // Both arms sway when moving during patrol
                const s = Math.sin(time * AGENT_SWAY_SPEED) * AGENT_SWAY_AMOUNT;
                agent.leftArm.rotation.x = s;
                agent.rightArm.rotation.x = -s;
            } else {
                // Arms return to neutral when stopped during patrol
                agent.leftArm.rotation.x = THREE.MathUtils.lerp(agent.leftArm.rotation.x, 0, delta * 10);
                agent.rightArm.rotation.x = THREE.MathUtils.lerp(agent.rightArm.rotation.x, 0, delta * 10);
            }
        } else if (agent.leftArm && agent.rightArm) { // Default/Other states (like searching, teleporting)
            // Arms return to neutral
            agent.leftArm.rotation.x = THREE.MathUtils.lerp(agent.leftArm.rotation.x, 0, delta * 10);
            agent.rightArm.rotation.x = THREE.MathUtils.lerp(agent.rightArm.rotation.x, 0, delta * 10);
        }
    }
}

// Renamed from choosePathTowards
function chooseAgentPathTowards(agent, targetGridX, targetGridY) {
    const agentId = agent.id; const now = performance.now(); const currentCell = mazeGrid[agent.gridY]?.[agent.gridX];
    if (!currentCell || !currentCell.isPath) { if(agent.stuckLogTimer <= 0){console.warn(`${agentId} chooseAgentPathTowards: Invalid current cell (${agent.gridX},${agent.gridY})`); agent.stuckLogTimer = 1.0;} agent.currentDir = null; return false; }
    const possibleMoves = []; const { gridX, gridY } = agent;
    if (!currentCell.walls.top && mazeGrid[gridY - 1]?.[gridX]?.isPath) possibleMoves.push({ dx: 0, dy: -1, name: "Up" }); if (!currentCell.walls.bottom && mazeGrid[gridY + 1]?.[gridX]?.isPath) possibleMoves.push({ dx: 0, dy: 1, name: "Down" }); if (!currentCell.walls.left && mazeGrid[gridY]?.[gridX - 1]?.isPath) possibleMoves.push({ dx: -1, dy: 0, name: "Left" }); if (!currentCell.walls.right && mazeGrid[gridY]?.[gridX + 1]?.isPath) possibleMoves.push({ dx: 1, dy: 0, name: "Right" });
    if (possibleMoves.length === 0) { if(agent.stuckLogTimer <= 0){console.warn(`${agentId} chooseAgentPathTowards: Stuck at (${gridX},${gridY})`); agent.stuckLogTimer = 5.0;} agent.currentDir = null; return false; }
    let bestMove = null; let minDistanceSq = Infinity;
    for (const move of possibleMoves) {
        const nextX = gridX + move.dx; const nextY = gridY + move.dy; const distSq = Math.pow(nextX - targetGridX, 2) + Math.pow(nextY - targetGridY, 2);
        const isReversing = agent.currentDir && (move.dx === -agent.currentDir.dx && move.dy === -agent.currentDir.dy);
        if (distSq < minDistanceSq && (!isReversing || possibleMoves.length === 1)) { minDistanceSq = distSq; bestMove = move; }
    }
    if (!bestMove) { const nonRev = possibleMoves.filter(d => !(agent.currentDir && d.dx===-agent.currentDir.dx && d.dy===-agent.currentDir.dy)); if(nonRev.length>0){bestMove=nonRev[Math.floor(Math.random()*nonRev.length)];}else{bestMove=possibleMoves[Math.floor(Math.random()*possibleMoves.length)];} }
    agent.currentDir = bestMove; const nextGridX = gridX + agent.currentDir.dx; const nextGridY = gridY + agent.currentDir.dy;
    agent.gridX = nextGridX; agent.gridY = nextGridY; const targetWorldPos = gridToWorld(nextGridX, nextGridY); agent.targetPos.set(targetWorldPos.x, 0, targetWorldPos.z); agent.lastTurnTime = now;
    if (DEBUG_AGENT) console.log(`${agentId}(${agent.state}): Moving ${agent.currentDir.name} towards (${targetGridX},${targetGridY}). Next:(${nextGridX},${nextGridY})`);
    return true;
}

// Renamed from chooseNewPath
function chooseNewAgentPath(agent, forceRandom = false) {
    const agentId = agent.id; const now = performance.now(); const currentCell = mazeGrid[agent.gridY]?.[agent.gridX];
    if (!currentCell || !currentCell.isPath) { if(agent.stuckLogTimer<=0){console.warn(`${agentId} chooseNewAgentPath: Invalid cell (${agent.gridX},${agent.gridY})`);agent.stuckLogTimer=1.0;} agent.currentDir=null; return false;}
    const possibleMoves = []; const { gridX, gridY } = agent;
    if(!currentCell.walls.top&&mazeGrid[gridY-1]?.[gridX]?.isPath)possibleMoves.push({dx:0,dy:-1,name:"Up"});if(!currentCell.walls.bottom&&mazeGrid[gridY+1]?.[gridX]?.isPath)possibleMoves.push({dx:0,dy:1,name:"Down"});if(!currentCell.walls.left&&mazeGrid[gridY]?.[gridX-1]?.isPath)possibleMoves.push({dx:-1,dy:0,name:"Left"});if(!currentCell.walls.right&&mazeGrid[gridY]?.[gridX+1]?.isPath)possibleMoves.push({dx:1,dy:0,name:"Right"});
    if(possibleMoves.length===0){if(agent.stuckLogTimer<=0){console.warn(`${agentId} chooseNewAgentPath: Stuck at (${gridX},${gridY})`);agent.stuckLogTimer=5.0;} agent.currentDir=null;return false;}
    let potentialDirs = possibleMoves; if(!forceRandom&&agent.currentDir&&possibleMoves.length>1){potentialDirs=possibleMoves.filter(dir=>!(dir.dx===-agent.currentDir.dx&&dir.dy===-agent.currentDir.dy));if(potentialDirs.length===0)potentialDirs=possibleMoves;}
    const chosenMove = potentialDirs[Math.floor(Math.random()*potentialDirs.length)];
    agent.currentDir = chosenMove; const nextGridX = gridX + agent.currentDir.dx; const nextGridY = gridY + agent.currentDir.dy;
    agent.gridX = nextGridX; agent.gridY = nextGridY; const targetWorldPos = gridToWorld(nextGridX, nextGridY); agent.targetPos.set(targetWorldPos.x, 0, targetWorldPos.z); agent.lastTurnTime = now;
    if (DEBUG_AGENT) console.log(`${agentId}(patrolling): Moving ${agent.currentDir.name}. Next:(${nextGridX},${nextGridY})`);
    return true;
}

// --- Collision Detection ---
function checkRaycastCollisions(currentPos, intendedMovement) {
    const allowedMovement = intendedMovement instanceof THREE.Vector3 ? intendedMovement.clone() : new THREE.Vector3();
    if (!(intendedMovement instanceof THREE.Vector3)) { console.error("CRITICAL: intendedMovement is not a Vector3!", intendedMovement); return new THREE.Vector3(0, 0, 0); }
    collisionCheckOrigin.copy(currentPos); collisionCheckOrigin.y = PLAYER_HEIGHT * RAYCAST_ORIGIN_Y_FACTOR;
    let collisionForward = false, collisionBackward = false, collisionLeft = false, collisionRight = false;
    try { camera.getWorldDirection(playerWorldDirection); } catch (e) { console.error("Error getting camera world direction:", e); playerWorldDirection.set(0, 0, -1); }
    playerWorldDirection.y = 0; playerWorldDirection.normalize(); if (isNaN(playerWorldDirection.x) || isNaN(playerWorldDirection.z) || playerWorldDirection.lengthSq() < 0.1) { if (DEBUG_MOVEMENT) console.warn("Invalid playerWorldDirection:", playerWorldDirection); playerWorldDirection.set(0, 0, -1); }
    try { playerRightDirection.crossVectors(camera.up, playerWorldDirection).normalize(); } catch (e) { console.error("Error calculating playerRightDirection:", e); playerRightDirection.set(1, 0, 0); }
    if (isNaN(playerRightDirection.x) || isNaN(playerRightDirection.z) || playerRightDirection.lengthSq() < 0.1) { if (DEBUG_MOVEMENT) console.warn("Invalid playerRightDirection:", playerRightDirection); playerRightDirection.set(1, 0, 0); }
    if (DEBUG_MOVEMENT) { /* Logging */ console.log(`-- Raycast Check -- O:(${collisionCheckOrigin.x.toFixed(1)},${collisionCheckOrigin.y.toFixed(1)},${collisionCheckOrigin.z.toFixed(1)}) M:(${intendedMovement.x.toFixed(2)},${intendedMovement.z.toFixed(2)}) F:(${playerWorldDirection.x.toFixed(2)},${playerWorldDirection.z.toFixed(2)}) R:(${playerRightDirection.x.toFixed(2)},${playerRightDirection.z.toFixed(2)})`); }
    const rayDefs = [{dir:playerWorldDirection,flag:'forward',idx:0},{dir:playerWorldDirection.clone().negate(),flag:'backward',idx:1},{dir:playerRightDirection.clone().negate(),flag:'left',idx:2},{dir:playerRightDirection,flag:'right',idx:3}];
    if (!DEBUG_COLLISION) { debugRayArrows.forEach(a => { if (a) a.visible = false; }); }
    for (const rInfo of rayDefs) {
        let rayColor = 0x00ff00; if (!rInfo.dir || isNaN(rInfo.dir.x) || isNaN(rInfo.dir.z)) { if (DEBUG_MOVEMENT) console.warn(`Skipping raycast: invalid dir ${rInfo.flag}`); continue; }
        raycaster.set(collisionCheckOrigin, rInfo.dir); const ints = raycaster.intersectObjects(wallMeshes);
        if (ints.length > 0 && ints[0].distance < RAYCAST_DISTANCE_BUFFER) {
            rayColor = 0xff0000; if (rInfo.flag === 'forward') collisionForward = true; else if (rInfo.flag === 'backward') collisionBackward = true; else if (rInfo.flag === 'left') collisionLeft = true; else if (rInfo.flag === 'right') collisionRight = true;
            if (DEBUG_MOVEMENT) console.log(`  HIT: ${rInfo.flag}, D:${ints[0].distance.toFixed(2)} < ${RAYCAST_DISTANCE_BUFFER.toFixed(2)}`);
        }
        if (DEBUG_COLLISION) { const aL=RAYCAST_DISTANCE_BUFFER;const hL=aL*0.2;const hW=hL*0.8;if(!debugRayArrows[rInfo.idx]){debugRayArrows[rInfo.idx]=new THREE.ArrowHelper(rInfo.dir,collisionCheckOrigin,aL,rayColor,hL,hW);scene.add(debugRayArrows[rInfo.idx]);}else{debugRayArrows[rInfo.idx].position.copy(collisionCheckOrigin);debugRayArrows[rInfo.idx].setDirection(rInfo.dir);debugRayArrows[rInfo.idx].setColor(rayColor);debugRayArrows[rInfo.idx].setLength(aL,hL,hW);}debugRayArrows[rInfo.idx].visible=true; } else if (debugRayArrows[rInfo.idx]){ debugRayArrows[rInfo.idx].visible = false; }
    }
    const fComp = intendedMovement.dot(playerWorldDirection); const rComp = intendedMovement.dot(playerRightDirection); if (DEBUG_MOVEMENT) console.log(`  Comps F:${fComp.toFixed(3)}, R:${rComp.toFixed(3)}`);
    try {
        if (fComp > 0 && collisionForward) { allowedMovement.sub(playerWorldDirection.clone().multiplyScalar(fComp)); if (DEBUG_MOVEMENT) console.log(`  Restricting Fwd`); }
        if (fComp < 0 && collisionBackward) { allowedMovement.sub(playerWorldDirection.clone().multiplyScalar(fComp)); if (DEBUG_MOVEMENT) console.log(`  Restricting Bwd`); }
        if (rComp > 0 && collisionRight) { allowedMovement.sub(playerRightDirection.clone().multiplyScalar(rComp)); if (DEBUG_MOVEMENT) console.log(`  Restricting Rgt`); }
        if (rComp < 0 && collisionLeft) { allowedMovement.sub(playerRightDirection.clone().multiplyScalar(rComp)); if (DEBUG_MOVEMENT) console.log(`  Restricting Lft`); }
    } catch (e) { console.error("Error applying move restrictions:", e); return new THREE.Vector3(0, 0, 0); }
    if (DEBUG_MOVEMENT) console.log(`  FINAL Allowed: (${allowedMovement.x.toFixed(3)},${allowedMovement.z.toFixed(3)})`);
    if (isNaN(allowedMovement.x) || isNaN(allowedMovement.z)) { console.error("CRITICAL: allowedMovement NaN!", allowedMovement); return new THREE.Vector3(0, 0, 0); }
    return allowedMovement;
}

function resolvePenetration(pPos) {
    const checkRadius = PLAYER_RADIUS * 0.95; const pushFactor = PENETRATION_RESOLUTION_FACTOR;
    collisionCheckOrigin.copy(pPos); collisionCheckOrigin.y = PLAYER_HEIGHT * RAYCAST_ORIGIN_Y_FACTOR;
    const dirs = [playerWorldDirection, playerWorldDirection.clone().negate(), playerRightDirection.clone().negate(), playerRightDirection];
    let totalCorrection = tempVec.set(0, 0, 0); let correctionsMade = 0;
    for (const dir of dirs) {
        if (!dir || isNaN(dir.x) || isNaN(dir.z)) continue; raycaster.set(collisionCheckOrigin, dir); const ints = raycaster.intersectObjects(wallMeshes);
        if (ints.length > 0 && ints[0].distance < checkRadius) {
            const penetrationDepth = checkRadius - ints[0].distance; const correction = dir.clone().negate().multiplyScalar(penetrationDepth * pushFactor); totalCorrection.add(correction); correctionsMade++;
            if (DEBUG_MOVEMENT) console.warn(`  Penetration! D:${ints[0].distance.toFixed(3)}<${checkRadius.toFixed(3)}. Push:(${correction.x.toFixed(3)},${correction.z.toFixed(3)})`);
        }
    }
    if (correctionsMade > 0) { if (!isNaN(totalCorrection.x) && !isNaN(totalCorrection.z)) { controls.getObject().position.add(totalCorrection); if (DEBUG_MOVEMENT) console.log(`  Applied Total Correction: (${totalCorrection.x.toFixed(3)},${totalCorrection.z.toFixed(3)})`); } else { console.error("Penetration correction NaN!"); } }
    pPos.copy(controls.getObject().position);
}

function checkAgentCollisions() {
    if (gameOver || gameWon) return;
    for (const agent of agents) { if (agent.hp <= 0) continue; const distance = playerPosition.distanceTo(agent.group.position); if (distance < AGENT_COLLISION_DISTANCE && agent.state !== 'teleporting') { console.log("Collision with Agent!"); triggerGameOver("Agent Collision"); return; } }
}

// --- Gun Functions ---
function createGun() {
    if (gunGroup) {
        camera.remove(gunGroup);
    }
    gunGroup = new THREE.Group();
    const barrelLength = 0.4, barrelRadius = 0.04, handleHeight = 0.25, handleWidth = 0.08, handleDepth = 0.15;
    const barrelGeo = new THREE.CylinderGeometry(barrelRadius, barrelRadius * 0.9, barrelLength, 12);
    const handleGeo = new THREE.BoxGeometry(handleWidth, handleHeight, handleDepth);
    const barrelMesh = new THREE.Mesh(barrelGeo, gunMaterial);
    barrelMesh.rotation.x = Math.PI / 2;
    barrelMesh.position.z = -barrelLength / 2;
    const handleMesh = new THREE.Mesh(handleGeo, gunMaterial);
    handleMesh.position.y = -handleHeight / 2 - barrelRadius * 0.5;
    handleMesh.position.z = -barrelLength * 0.2;
    handleMesh.rotation.x = Math.PI / 18;
    gunGroup.add(barrelMesh);
    gunGroup.add(handleMesh);
    gunGroup.position.copy(gunBasePosition);
    gunGroup.rotation.copy(gunBaseRotation);
    camera.add(gunGroup);
    console.log("Gun created/added.");
}

function triggerRecoil() {
    if (!gunGroup || isRecoiling) return;
    isRecoiling = true;
    recoilRecoveryTimer = GUN_RECOIL_RECOVERY_TIME;
    gunGroup.position.z += GUN_RECOIL_AMOUNT_POS;
    gunGroup.rotation.x -= GUN_RECOIL_AMOUNT_ROT;
}

function recoverRecoil(delta) {
    if (!isRecoiling || !gunGroup) return;
    recoilRecoveryTimer -= delta;
    const p = Math.max(0, 1.0 - recoilRecoveryTimer / GUN_RECOIL_RECOVERY_TIME);
    gunGroup.position.lerpVectors(new THREE.Vector3(gunBasePosition.x, gunBasePosition.y, gunBasePosition.z + GUN_RECOIL_AMOUNT_POS), gunBasePosition, p);
    const targetRot = gunBaseRotation.clone();
    const startRotEuler = new THREE.Euler(gunBaseRotation.x - GUN_RECOIL_AMOUNT_ROT, gunBaseRotation.y, gunBaseRotation.z);
    const qStart = tempQuat.setFromEuler(startRotEuler);
    const qEnd = new THREE.Quaternion().setFromEuler(targetRot);
    const qCurrent = new THREE.Quaternion();
    THREE.Quaternion.slerp(qStart, qEnd, qCurrent, p);
    gunGroup.rotation.setFromQuaternion(qCurrent);
    if (recoilRecoveryTimer <= 0) {
        isRecoiling = false;
        gunGroup.position.copy(gunBasePosition);
        gunGroup.rotation.copy(gunBaseRotation);
    }
}

function startReload() {
    if (isReloading || currentAmmo === GUN_CLIP_SIZE) return;
    console.log("Reloading...");
    isReloading = true;
    isReloadAnimating = true;
    reloadTimer = GUN_RELOAD_TIME;
    canShoot = false;
    playSound('reload');
    updateHUD();
}

function fireGun() {
    if (!canShoot || isReloading || gameOver || gameWon || !controls.isLocked) return;
    if (currentAmmo <= 0) {
        startReload();
        return;
    }
    currentAmmo--;
    canShoot = false;
    shootTimer = GUN_FIRE_RATE;
    playSound('shoot');
    triggerRecoil();
    // Player uses standard bullet geometry and material
    const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial.clone());
    camera.getWorldDirection(playerWorldDirection);
    const offset = playerWorldDirection.clone().multiplyScalar(1.0);
    const startPos = camera.position.clone().add(offset);
    bullet.position.copy(startPos);
    bullet.userData = {
        velocity: playerWorldDirection.clone().multiplyScalar(BULLET_SPEED),
        life: BULLET_LIFESPAN,
        isAgentBullet: false,
        damage: 0 // Player bullets don't damage player
    };
    scene.add(bullet);
    activeBullets.push(bullet);
    updateHUD();
}


// --- Agent Actions ---
function agentAttemptShoot(agent) {
    if (agent.shootCooldownTimer <= 0 && agent.canSeePlayer && agent.meleeBurstCount <= 0) {
        if (DEBUG_AGENT) console.log(`${agent.id} attempting shoot.`);
        agentFireGun(agent);
        agent.shootCooldownTimer = AGENT_FIRE_RATE;
    }
}

function agentFireGun(agent) {
    // GOAL: Use agent-specific bullet geometry and material
    const bullet = new THREE.Mesh(agentBulletGeometry, agentBulletMaterial.clone()); // Use larger geometry, red material
    const startPos = getAgentGunTipPosition(agent);
    bullet.position.copy(startPos);

    const targetPos = tempVec.copy(camera.position);
    const direction = tempVec2.copy(targetPos).sub(startPos).normalize();

    const spreadRotation = tempQuat.setFromEuler(new THREE.Euler(
        (Math.random() - 0.5) * AGENT_BULLET_SPREAD * 2,
        (Math.random() - 0.5) * AGENT_BULLET_SPREAD * 2,
        0
    ));
    direction.applyQuaternion(spreadRotation);

    bullet.userData = {
        // GOAL: Ensure agent bullets use the unified BULLET_SPEED
        velocity: direction.multiplyScalar(BULLET_SPEED), // Use unified speed
        life: BULLET_LIFESPAN,
        isAgentBullet: true,
        damage: AGENT_BULLET_DAMAGE
    };

    scene.add(bullet);
    activeBullets.push(bullet);
    playSound('agent_shoot');
    if (DEBUG_AGENT) console.log(`${agent.id} Fired!`);
}

function attemptMeleeBurst(agent) {
    if (agent.meleeCooldownTimer <= 0 && agent.meleeBurstCount <= 0) {
        agent.meleeBurstCount = Math.floor(Math.random() * (AGENT_MELEE_BURST_COUNT_MAX - AGENT_MELEE_BURST_COUNT_MIN + 1)) + AGENT_MELEE_BURST_COUNT_MIN;
        agent.meleeBurstIntervalTimer = 0;
        if (DEBUG_AGENT) console.log(`${agent.id} Starting melee burst (${agent.meleeBurstCount} hits).`);
    }

    if (agent.meleeBurstCount > 0 && agent.meleeBurstIntervalTimer <= 0) {
        agentPerformSingleMelee(agent);
        agent.meleeBurstCount--;
        agent.meleeBurstIntervalTimer = AGENT_MELEE_BURST_INTERVAL;

        if (agent.meleeBurstCount <= 0) {
            agent.meleeCooldownTimer = AGENT_MELEE_COOLDOWN;
            if (DEBUG_AGENT) console.log(`${agent.id} Melee burst finished. Cooldown started.`);
        }
    }
}

function agentPerformSingleMelee(agent) {
    if (playerPosition.distanceTo(agent.group.position) < AGENT_MELEE_RANGE * 1.1) {
         if (DEBUG_AGENT) console.log(`${agent.id} Melee Hit!`);
         playSound('melee_hit');
         damagePlayer(AGENT_MELEE_DAMAGE, "Melee");
    } else {
         if (DEBUG_AGENT) console.log(`${agent.id} Melee whiffed - player moved out of range.`);
    }
}


// --- Player Interaction ---
function damagePlayer(amount, source = "Bullet") {
    if (gameOver || gameWon) return;

    playerHP -= amount;
    playerHP = Math.max(0, playerHP);
    if (DEBUG_MOVEMENT || DEBUG_AGENT) console.log(`Player took ${amount} damage from ${source}. HP: ${playerHP}`);
    updateHUD();
    playSound('player_hit');

    if (damageOverlayElement) {
        damageOverlayElement.style.display = 'block';
        requestAnimationFrame(() => {
            damageOverlayElement.style.opacity = '1';
            setTimeout(() => {
                if (damageOverlayElement) damageOverlayElement.style.opacity = '0';
                setTimeout(() => {
                     if (damageOverlayElement && damageOverlayElement.style.opacity === '0') {
                        damageOverlayElement.style.display = 'none';
                    }
                }, 60);
            }, 50);
        });
    }

    if (playerHP <= 0) {
        triggerGameOver(`Eliminated by Agent ${source}`);
    }
}

function triggerGameOver(reason = "Unknown") {
    if (gameOver || gameWon) return;
    console.log(`Game Over: ${reason}`);
    gameOver = true;
    playerHP = 0;
    updateHUD();

    if (instructionsSpan) instructionsSpan.textContent = `GAME OVER - ${reason}`;
    if (blockerElement) blockerElement.style.display = 'flex';
    if (instructionsElement) instructionsElement.style.display = '';

    controls.unlock();
    playSound('game_over');
    startMenuEffects();
}

// --- Bullet Update and Collision ---
function updateBullets(delta) {
    for (let i = activeBullets.length - 1; i >= 0; i--) {
        const bullet = activeBullets[i];
        const velocity = bullet.userData.velocity;
        let life = bullet.userData.life;
        const previousPos = bullet.position.clone();
        const isAgentBullet = bullet.userData.isAgentBullet || false;
        const bulletDamage = bullet.userData.damage || 0;
        // GOAL: Determine bullet size based on type for collision checks
        const currentBulletRadius = isAgentBullet ? AGENT_BULLET_SIZE / 2 : BULLET_SIZE / 2;

        // Movement & Lifespan
        bullet.position.add(velocity.clone().multiplyScalar(delta));
        bullet.userData.life -= delta;
        life = bullet.userData.life;

        // Collision
        const moveVector = bullet.position.clone().sub(previousPos);
        const moveDistance = moveVector.length();
        let hitWall = false, hitAgent = false, hitPlayer = false;

        if (moveDistance > 0) {
            raycaster.set(previousPos, moveVector.normalize());

            // Check Walls
            const wallHits = raycaster.intersectObjects(wallMeshes, false);
             // Adjust distance check slightly by bullet radius
            if (wallHits.length > 0 && wallHits[0].distance <= moveDistance + currentBulletRadius) {
                hitWall = true;
                playSound('hit_wall', 0.1);
            }

            // Check Agents (Only if Player bullet hit)
            if (!hitWall && !isAgentBullet) {
                for (const agent of agents) {
                    if (agent.hp <= 0) continue;
                    const agentBox = new THREE.Box3().setFromObject(agent.group);
                    if (raycaster.ray.intersectsBox(agentBox)) {
                        const agentHits = raycaster.intersectObject(agent.group, true);
                        for (const hit of agentHits) {
                             // Adjust distance check slightly by bullet radius + approx agent part size buffer
                            if (hit.object.userData.isAgentPart && hit.distance <= moveDistance + currentBulletRadius + AGENT_BODY_WIDTH * 0.5) {
                                const hitAgentRef = hit.object.userData.agentRef;
                                if (hitAgentRef) {
                                    hitAgentRef.hp--;
                                    playSound('hit_agent');
                                    hitAgentRef.hitTimer = AGENT_HIT_DURATION;
                                    hitAgentRef.hpBar.timer = AGENT_HP_BAR_DURATION;
                                    hitAgentRef.group.traverse((c) => {
                                        if (c.isMesh && c.userData.isAgentPart) {
                                            c.material = new THREE.MeshBasicMaterial({ color: AGENT_HIT_COLOR });
                                            c.userData.hitMaterial = c.material;
                                        }
                                    });
                                    if (hitAgentRef.hp <= 0) {
                                        console.log(`${hitAgentRef.id} eliminated!`);
                                        const deathPos = hitAgentRef.group.position.clone();
                                        scene.remove(hitAgentRef.group);
                                        agents.splice(agents.indexOf(hitAgentRef), 1);
                                        agentsRemaining--;
                                        playSound('agent_death');
                                        updateHUD();
                                        if (agentsRemaining === 0) {
                                            console.log("All agents eliminated!");
                                            createExitMarker(deathPos);
                                        }
                                    }
                                    hitAgent = true;
                                    break;
                                }
                            }
                        }
                    }
                    if (hitAgent) break;
                }
            }

            // Check Player (Only if Agent bullet hit)
            if (!hitWall && isAgentBullet && !gameOver && !gameWon) {
                // Use slightly more generous sphere for larger agent bullets
                const playerSphere = new THREE.Sphere(camera.position, PLAYER_RADIUS * 1.1 + currentBulletRadius);
                if (raycaster.ray.intersectsSphere(playerSphere)) {
                    const intersectionPoint = new THREE.Vector3();
                    raycaster.ray.intersectSphere(playerSphere, intersectionPoint);
                    const distToIntersection = previousPos.distanceTo(intersectionPoint);
                     // Adjust distance check by bullet radius + player radius
                    if (distToIntersection <= moveDistance + currentBulletRadius + PLAYER_RADIUS) {
                        hitPlayer = true;
                        damagePlayer(bulletDamage, "Bullet");
                    }
                }
            }
        }

        // Removal
        if (life <= 0 || hitWall || hitAgent || hitPlayer) {
            scene.remove(bullet);
            activeBullets.splice(i, 1);
        }
    }
}


// --- Exit Marker ---
function createExitMarker(position) { if(mazeExitObject)scene.remove(mazeExitObject);const s=CELL_SIZE*.6;const g=new THREE.IcosahedronGeometry(s,1);if(!exitMaterial){exitMaterial=new THREE.MeshPhongMaterial({color:0xffff00,emissive:0xffff00,emissiveIntensity:1.5,specular:0xffffff,shininess:100,opacity:.85,transparent:true,});}mazeExitObject=new THREE.Mesh(g,exitMaterial);mazeExitObject.position.copy(position);mazeExitObject.position.y=PLAYER_HEIGHT*1.2;mazeExitPosition=mazeExitObject.position;const l=new THREE.PointLight(0xffffaa,1.5,CELL_SIZE*3);mazeExitObject.add(l);scene.add(mazeExitObject);console.log("Exit created at:",mazeExitPosition); }

// --- HUD ---
function setupHUD(){hudHpBarFill=document.getElementById('hpBarFill');hudWeaponName=document.getElementById('weaponName');hudAmmoCount=document.getElementById('ammoCount');hudReloadIndicator=document.getElementById('reloadIndicator');hudReloadProgress=document.getElementById('reloadProgress');hudAgentCount=document.getElementById('agentCount');damageOverlayElement=document.getElementById('damageOverlay');if(!hudHpBarFill||!hudWeaponName||!hudAmmoCount||!hudReloadIndicator||!hudReloadProgress||!hudAgentCount||!damageOverlayElement){console.error("HUD/Overlay elements missing!");return;}hudWeaponName.textContent="9mm";hudAgentCount.textContent=`${agentsRemaining}`;updateHUD();}
function updateHUD(){if(!hudHpBarFill||!hudAmmoCount||!hudReloadIndicator||!hudReloadProgress||!hudAgentCount)return;const hpP=Math.max(0,playerHP)/PLAYER_MAX_HP*100;hudHpBarFill.style.width=`${hpP}%`;hudAgentCount.textContent=`${agentsRemaining}`;if(isReloading){hudAmmoCount.textContent="Reloading...";hudReloadIndicator.style.display='block';const p=Math.max(0,(GUN_RELOAD_TIME-reloadTimer)/GUN_RELOAD_TIME)*100;hudReloadProgress.style.strokeDasharray=`${p} 100`;hudReloadProgress.style.strokeDashoffset='0';}else{hudAmmoCount.textContent=`${currentAmmo} / ∞`;hudReloadIndicator.style.display='none';hudReloadProgress.style.strokeDasharray='0 100';}}

// --- Menu Effects ---
function glitchText(el,i=.05,ch=MENU_GLITCH_CHARS){if(!el||!el.dataset.originalText)return;let t=el.dataset.originalText;const l=t.length;let r='';for(let j=0;j<l;j++){r+=Math.random()<i?ch[Math.floor(Math.random()*ch.length)]:t[j];}el.textContent=r;}
function applyMenuEffects(){if(instructionsSpan){glitchText(instructionsSpan);}}
function startMenuEffects(){if(!menuEffectInterval&&instructionsSpan){if(!instructionsSpan.dataset.originalText){instructionsSpan.dataset.originalText=instructionsSpan.textContent;}menuEffectInterval=setInterval(applyMenuEffects,100);}}
function stopMenuEffects(){if(menuEffectInterval){clearInterval(menuEffectInterval);menuEffectInterval=null;if(instructionsSpan&&instructionsSpan.dataset.originalText)instructionsSpan.textContent=instructionsSpan.dataset.originalText;}}

// --- Rabbit Functions (Replacing Orb Functions) ---
function createRabbitModel() {
    const rabbitGroup = new THREE.Group();

    const bodyMesh = new THREE.Mesh(rabbitBodyGeometry, rabbitBodyMaterial);
    bodyMesh.castShadow = true;
    rabbitGroup.add(bodyMesh);

    const headMesh = new THREE.Mesh(rabbitHeadGeometry, rabbitBodyMaterial);
    headMesh.position.y = RABBIT_BODY_RADIUS * 0.8;
    headMesh.position.z = RABBIT_BODY_RADIUS * 0.1;
    headMesh.castShadow = true;
    rabbitGroup.add(headMesh);

    const earY = headMesh.position.y + RABBIT_HEAD_RADIUS * 0.5;
    const earZ = headMesh.position.z - RABBIT_HEAD_RADIUS * 0.3;
    const earAngle = Math.PI / 6;

    const leftEarMesh = new THREE.Mesh(rabbitEarGeometry, rabbitBodyMaterial);
    leftEarMesh.position.set(-RABBIT_HEAD_RADIUS * 0.5, earY + RABBIT_EAR_LENGTH / 2, earZ);
    leftEarMesh.rotation.z = earAngle;
    leftEarMesh.castShadow = true;
    rabbitGroup.add(leftEarMesh);

    const rightEarMesh = new THREE.Mesh(rabbitEarGeometry, rabbitBodyMaterial);
    rightEarMesh.position.set(RABBIT_HEAD_RADIUS * 0.5, earY + RABBIT_EAR_LENGTH / 2, earZ);
    rightEarMesh.rotation.z = -earAngle;
    rightEarMesh.castShadow = true;
    rabbitGroup.add(rightEarMesh);

    const eyeY = headMesh.position.y + RABBIT_HEAD_RADIUS * 0.1;
    const eyeZ = headMesh.position.z + RABBIT_HEAD_RADIUS * 0.8;
    const eyeX = RABBIT_HEAD_RADIUS * 0.5;

    const leftEyeMesh = new THREE.Mesh(rabbitEyeGeometry, rabbitEyeMaterial);
    leftEyeMesh.position.set(-eyeX, eyeY, eyeZ);
    rabbitGroup.add(leftEyeMesh);

    const rightEyeMesh = new THREE.Mesh(rabbitEyeGeometry, rabbitEyeMaterial);
    rightEyeMesh.position.set(eyeX, eyeY, eyeZ);
    rabbitGroup.add(rightEyeMesh);

    return rabbitGroup;
}

function spawnRabbit() {
    if (activeRabbits.length >= MAX_RABBITS) return;
    let placed = false;
    let spawnPosWorld;
    let gridX, gridY;
    let attempts = 0;
    const maxAttempts = 50;

    while (!placed && attempts < maxAttempts) {
        attempts++;
        gridX = Math.floor(Math.random() * (MAZE_WIDTH_CELLS - 2)) + 1;
        gridY = Math.floor(Math.random() * (MAZE_HEIGHT_CELLS - 2)) + 1;
        if (mazeGrid[gridY]?.[gridX]?.isPath) {
            spawnPosWorld = gridToWorld(gridX, gridY);
            placed = true;
        }
    }

    if (placed) {
        const rabbitGroup = createRabbitModel();
        const startY = PLAYER_HEIGHT * 0.5 - RABBIT_BOUNCE_HEIGHT * 0.5;
        rabbitGroup.position.set(spawnPosWorld.x, startY, spawnPosWorld.z);
        rabbitGroup.castShadow = true;

        rabbitGroup.userData = {
            isRabbit: true,
            life: RABBIT_LIFESPAN,
            creationTime: clock.getElapsedTime(),
            gridX: gridX,
            gridY: gridY,
            targetPos: rabbitGroup.position.clone(),
            currentDir: null,
            lastTurnTime: performance.now() - Math.random() * RABBIT_TURN_DELAY,
            isMoving: false,
            stuckLogTimer: 0,
            timeSinceLastMove: 0,
        };
        scene.add(rabbitGroup);
        activeRabbits.push(rabbitGroup);
    } else {
        console.warn(`Failed rabbit spawn after ${maxAttempts} attempts.`);
    }
}

function chooseNewRabbitPath(rabbit, forceRandom = false) {
    const rabbitData = rabbit.userData;
    const now = performance.now();
    const currentCell = mazeGrid[rabbitData.gridY]?.[rabbitData.gridX];

    if (!currentCell || !currentCell.isPath) {
        console.warn(`Rabbit chooseNewRabbitPath: Invalid cell (${rabbitData.gridX},${rabbitData.gridY})`);
        rabbitData.currentDir = null; return false;
    }

    const possibleMoves = [];
    const { gridX, gridY } = rabbitData;
    if (!currentCell.walls.top && mazeGrid[gridY - 1]?.[gridX]?.isPath) possibleMoves.push({ dx: 0, dy: -1, name: "Up" });
    if (!currentCell.walls.bottom && mazeGrid[gridY + 1]?.[gridX]?.isPath) possibleMoves.push({ dx: 0, dy: 1, name: "Down" });
    if (!currentCell.walls.left && mazeGrid[gridY]?.[gridX - 1]?.isPath) possibleMoves.push({ dx: -1, dy: 0, name: "Left" });
    if (!currentCell.walls.right && mazeGrid[gridY]?.[gridX + 1]?.isPath) possibleMoves.push({ dx: 1, dy: 0, name: "Right" });

    if (possibleMoves.length === 0) {
        console.warn(`Rabbit chooseNewRabbitPath: Stuck at (${gridX},${gridY})`);
        rabbitData.currentDir = null; return false;
    }

    let potentialDirs = possibleMoves;
    if (!forceRandom && rabbitData.currentDir && possibleMoves.length > 1) {
        potentialDirs = possibleMoves.filter(dir => !(dir.dx === -rabbitData.currentDir.dx && dir.dy === -rabbitData.currentDir.dy));
        if (potentialDirs.length === 0) potentialDirs = possibleMoves;
    }

    const chosenMove = potentialDirs[Math.floor(Math.random() * potentialDirs.length)];
    rabbitData.currentDir = chosenMove;
    const nextGridX = gridX + rabbitData.currentDir.dx;
    const nextGridY = gridY + rabbitData.currentDir.dy;

    rabbitData.gridX = nextGridX;
    rabbitData.gridY = nextGridY;
    const targetWorldPos = gridToWorld(nextGridX, nextGridY);
    rabbitData.targetPos.set(targetWorldPos.x, rabbit.position.y, targetWorldPos.z);
    rabbitData.lastTurnTime = now;
    rabbitData.isMoving = true;
    return true;
}

function updateRabbits(delta, time) {
    rabbitSpawnTimer -= delta;
    if (rabbitSpawnTimer <= 0) {
        spawnRabbit();
        rabbitSpawnTimer = RABBIT_SPAWN_INTERVAL;
    }
    const now = performance.now();

    for (let i = activeRabbits.length - 1; i >= 0; i--) {
        const rabbit = activeRabbits[i];
        const rabbitData = rabbit.userData;

        rabbitData.life -= delta;
        if (rabbitData.life <= 0) {
            scene.remove(rabbit);
            activeRabbits.splice(i, 1);
            continue;
        }

        const distToPlayer = playerPosition.distanceTo(rabbit.position);
        if (distToPlayer < RABBIT_PICKUP_DISTANCE) {
            if (DEBUG_MOVEMENT) console.log("Rabbit picked up!");
            playSound('orb_pickup');
            scene.remove(rabbit);
            activeRabbits.splice(i, 1);
            if (!isMapRevealing) {
                isMapRevealing = true;
                mapRevealTimer = MAP_REVEAL_DURATION;
                if (debugMapCanvas) { debugMapCanvas.style.display = 'block'; requestAnimationFrame(() => debugMapCanvas.style.opacity = '1'); if (DEBUG_MOVEMENT) console.log("Map Reveal START"); }
            } else {
                mapRevealTimer = MAP_REVEAL_DURATION;
                if (DEBUG_MOVEMENT) console.log("Map Reveal REFRESH");
            }
            continue;
        }

        const bounceYOffset = Math.abs(Math.sin(time * RABBIT_BOUNCE_SPEED)) * RABBIT_BOUNCE_HEIGHT;
        const baseY = PLAYER_HEIGHT * 0.5 - RABBIT_BOUNCE_HEIGHT * 0.5;
        rabbit.position.y = baseY + bounceYOffset;

         if (rabbitData.isMoving && rabbitData.currentDir) {
             tempVec.copy(rabbitData.targetPos).sub(rabbit.position).normalize();
             if (tempVec.lengthSq() > 0.01) {
                const targetAngle = Math.atan2(tempVec.x, tempVec.z);
                let diff = targetAngle - rabbit.rotation.y;
                while (diff < -Math.PI) diff += Math.PI * 2;
                while (diff > Math.PI) diff -= Math.PI * 2;
                const turnSpeed = Math.PI * 1.5;
                rabbit.rotation.y += THREE.MathUtils.clamp(diff, -turnSpeed * delta, turnSpeed * delta);
             }
         }

        rabbitData.stuckLogTimer -= delta;
        const distToTarget = rabbit.position.distanceTo(rabbitData.targetPos);

        if (rabbitData.currentDir && distToTarget > 0.1) {
            rabbitData.timeSinceLastMove += delta;
        } else {
            rabbitData.timeSinceLastMove = 0;
        }

        if (rabbitData.timeSinceLastMove > RABBIT_STUCK_TIMEOUT) {
            if (rabbitData.stuckLogTimer <= 0) {
                console.warn(`Rabbit stuck timeout at grid (${rabbitData.gridX}, ${rabbitData.gridY}). Resetting path.`);
                rabbitData.stuckLogTimer = 5.0;
            }
            const currentWorldPos = gridToWorld(rabbitData.gridX, rabbitData.gridY);
            rabbit.position.x = currentWorldPos.x;
            rabbit.position.z = currentWorldPos.z;
            rabbitData.targetPos.copy(rabbit.position);
            rabbitData.targetPos.y = rabbit.position.y;
            rabbitData.timeSinceLastMove = 0;
            rabbitData.currentDir = null;
            rabbitData.lastTurnTime = now - RABBIT_TURN_DELAY;
            continue;
        }

        if (!rabbitData.currentDir || distToTarget < CELL_SIZE * 0.1 || now - rabbitData.lastTurnTime > RABBIT_TURN_DELAY) {
           chooseNewRabbitPath(rabbit, !rabbitData.currentDir);
        }

        if (rabbitData.currentDir && rabbit.position.distanceTo(rabbitData.targetPos) > 0.05) {
            rabbitData.isMoving = true;
            tempVec.copy(rabbitData.targetPos).sub(rabbit.position);
            tempVec.y = 0;
            tempVec.normalize();
            const moveAmount = RABBIT_SPEED * delta;
            if (moveAmount < distToTarget) {
                rabbit.position.add(tempVec.multiplyScalar(moveAmount));
            } else {
                rabbit.position.x = rabbitData.targetPos.x;
                rabbit.position.z = rabbitData.targetPos.z;
                rabbitData.currentDir = null;
                rabbitData.isMoving = false;
            }
        } else if (rabbitData.currentDir) {
             rabbit.position.x = rabbitData.targetPos.x;
             rabbit.position.z = rabbitData.targetPos.z;
             rabbitData.currentDir = null;
             rabbitData.isMoving = false;
        } else {
            rabbitData.isMoving = false;
        }
    }
}

// --- Debug Map ---
function drawDebugMap() { if (!debugMapCtx) return; const mapVis=DEBUG_MAP_VISIBLE||isMapRevealing; if(!mapVis){if(debugMapCanvas&&debugMapCanvas.style.display!=='none'&&debugMapCanvas.style.opacity!=='0'){debugMapCanvas.style.opacity='0';setTimeout(()=>{if(!DEBUG_MAP_VISIBLE&&!isMapRevealing&&debugMapCanvas.style.opacity==='0'){debugMapCanvas.style.display='none';}},300);}return;} if(debugMapCanvas&&debugMapCanvas.style.display==='none'){debugMapCanvas.style.display='block';requestAnimationFrame(()=>debugMapCanvas.style.opacity='1');} const cW=debugMapCanvas.width;const cH=debugMapCanvas.height;debugMapCtx.fillStyle='rgba(0,0,0,0.7)';debugMapCtx.fillRect(0,0,cW,cH); const tWW=MAZE_WIDTH_UNITS;const tWH=MAZE_HEIGHT_UNITS;const mSX=cW/tWW;const mSZ=cH/tWH;const mS=Math.min(mSX,mSZ)*.9;const mRW=tWW*mS;const mRH=tWH*mS;const mOX=(cW-mRW)/2;const mOZ=(cH-mRH)/2; const w2m=(wx,wz)=>{const nX=(wx+tWW/2)/tWW;const nZ=(wz+tWH/2)/tWH;return{x:nX*mRW+mOX,y:nZ*mRH+mOZ};}; debugMapCtx.strokeStyle='#00ff00';debugMapCtx.lineWidth=1;const wDS=CELL_SIZE*mS;for(let gy=0;gy<MAZE_HEIGHT_CELLS*MAZE_GRID_SCALE;gy++){for(let gx=0;gx<MAZE_WIDTH_CELLS*MAZE_GRID_SCALE;gx++){const cx=Math.floor(gx/MAZE_GRID_SCALE);const cy=Math.floor(gy/MAZE_GRID_SCALE);const cell=mazeGrid[cy]?.[cx];if(cell&&!cell.isPath){const wwX=(gx-(MAZE_WIDTH_CELLS*MAZE_GRID_SCALE)/2+.5)*CELL_SIZE;const wwZ=(gy-(MAZE_HEIGHT_CELLS*MAZE_GRID_SCALE)/2+.5)*CELL_SIZE;const mP=w2m(wwX,wwZ);debugMapCtx.strokeRect(mP.x-wDS/2,mP.y-wDS/2,wDS,wDS);}}} const pMP=w2m(playerPosition.x,playerPosition.z);debugMapCtx.fillStyle='#ffffff';debugMapCtx.beginPath();debugMapCtx.arc(pMP.x,pMP.y,3,0,Math.PI*2);debugMapCtx.fill(); debugMapCtx.fillStyle='#ff0000';for(const ag of agents){if(ag.hp > 0){const aMP=w2m(ag.group.position.x,ag.group.position.z);debugMapCtx.beginPath();debugMapCtx.arc(aMP.x,aMP.y,3,0,Math.PI*2);debugMapCtx.fill();}}
 debugMapCtx.fillStyle='#AAAAAA';
 for(const rabbit of activeRabbits){
    const rMP = w2m(rabbit.position.x, rabbit.position.z);
    debugMapCtx.beginPath();
    debugMapCtx.arc(rMP.x, rMP.y, 2, 0, Math.PI*2);
    debugMapCtx.fill();
 }
 if(mazeExitObject){const eMP=w2m(mazeExitObject.position.x,mazeExitObject.position.z);debugMapCtx.fillStyle='#ffff00';debugMapCtx.beginPath();debugMapCtx.arc(eMP.x,eMP.y,4,0,Math.PI*2);debugMapCtx.fill();}
}

// --- Game Loop ---
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    const time = clock.getElapsedTime();

    // Timers & Player Gun Updates
    if(!canShoot){shootTimer-=delta;if(shootTimer<=0){canShoot=true;}}if(isReloading){reloadTimer-=delta;if(isReloadAnimating&&gunGroup){const rP=1.0-Math.max(0,reloadTimer)/GUN_RELOAD_TIME;const aP=Math.sin(rP*Math.PI);gunGroup.position.y=gunBasePosition.y+GUN_RELOAD_ANIM_DOWN_POS*aP;gunGroup.rotation.x=gunBaseRotation.x-GUN_RELOAD_ANIM_ROT*aP;}if(reloadTimer<=0){isReloading=false;isReloadAnimating=false;currentAmmo=GUN_CLIP_SIZE;canShoot=true;if(gunGroup){gunGroup.position.copy(gunBasePosition);gunGroup.rotation.copy(gunBaseRotation);}updateHUD();}else{updateHUD();}}else if(isReloadAnimating){isReloadAnimating=false;if(gunGroup){gunGroup.position.copy(gunBasePosition);gunGroup.rotation.copy(gunBaseRotation);}}
    recoverRecoil(delta);

    // --- World Updates ---
    updateBullets(delta);
    if (!gameWon && !gameOver) {
        updateRabbits(delta, time);
        updateAgents(delta, time);
    }

    // --- Player Movement & Interaction ---
    if (!gameWon && !gameOver) {
        if (controls.isLocked) {
            const currentPos = controls.getObject().position.clone();
            const currentYRot=controls.getObject().rotation.y;let dYR=currentYRot-lastCamYRotation;if(dYR>Math.PI)dYR-=Math.PI*2;if(dYR<-Math.PI)dYR+=Math.PI*2;lastCamYRotation=currentYRot;
            const lDZ=Number(moveForward)-Number(moveBackward);const lDX=-(Number(moveRight)-Number(moveLeft));let fID=new THREE.Vector3();if(lDZ!==0||lDX!==0){const dF=lDZ*currentSpeed*delta;const dR=lDX*currentSpeed*delta;camera.getWorldDirection(playerWorldDirection);playerWorldDirection.y=0;playerWorldDirection.normalize();playerRightDirection.crossVectors(camera.up,playerWorldDirection).normalize();if(!isNaN(playerWorldDirection.x)&&!isNaN(playerRightDirection.x)){fID.add(playerWorldDirection.clone().multiplyScalar(dF));fID.add(playerRightDirection.clone().multiplyScalar(dR));fID.y=0;}else{if(DEBUG_MOVEMENT)console.warn("NaN direction vectors.");fID.set(0,0,0);}}
            const allowedDisp=checkRaycastCollisions(currentPos,fID);if(allowedDisp&&!isNaN(allowedDisp.x)&&!isNaN(allowedDisp.z)){controls.getObject().position.add(allowedDisp);playerPosition.copy(controls.getObject().position);resolvePenetration(playerPosition);}else{if(DEBUG_MOVEMENT||!allowedDisp)console.error("Invalid allowedDisp!",allowedDisp);playerPosition.copy(controls.getObject().position);}
            checkAgentCollisions();
            if(!gameOver&&mazeExitObject&&playerPosition.distanceTo(mazeExitPosition)<CELL_SIZE*1.2){console.log("Exit Reached!");gameWon=true;if(instructionsSpan)instructionsSpan.textContent="EXIT REACHED - OBJECTIVE COMPLETE";blockerElement.style.display='flex';instructionsElement.style.display='';controls.unlock();playSound('game_win');startMenuEffects();}
            if(!DEBUG_COLLISION){debugRayArrows.forEach(a=>{if(a)a.visible=false;});}
        }
        playerLight.position.copy(camera.position); playerLight.position.y += 1;
        if (controls.isLocked || isReloading) { updateHUD(); }
    } else { if(blockerElement&&blockerElement.style.display!=='none'&&!menuEffectInterval){startMenuEffects();} }

    // Map Reveal Fade
     if(isMapRevealing){mapRevealTimer-=delta;if(mapRevealTimer<=0){isMapRevealing=false;mapRevealTimer=0;if(debugMapCanvas){debugMapCanvas.style.opacity='0';if(DEBUG_MOVEMENT)console.log("Map Reveal END/Fade Out");setTimeout(()=>{if(!DEBUG_MAP_VISIBLE&&debugMapCanvas.style.opacity==='0'){debugMapCanvas.style.display='none';}},300);}}else{if(debugMapCanvas&&debugMapCanvas.style.display!=='block'){debugMapCanvas.style.display='block';requestAnimationFrame(()=>debugMapCanvas.style.opacity='1');if(DEBUG_MOVEMENT)console.log("Map Reveal START");}else if(debugMapCanvas&&debugMapCanvas.style.opacity!=='1'){debugMapCanvas.style.opacity='1';}}}else{if(!DEBUG_MAP_VISIBLE&&debugMapCanvas&&debugMapCanvas.style.display!=='none'&&debugMapCanvas.style.opacity==='0'){debugMapCanvas.style.display='none';}}

    // Wall Shimmer
    if (!gameWon && !gameOver) { scene.traverse(child => { if (child.isMesh && child.material === wallMaterial) { const s=Math.sin(time*1.5+child.position.x*0.1+child.position.z*0.05)*0.3+0.6; child.material.emissiveIntensity=s;}else if(child===mazeExitObject){const p=Math.sin(time*3.0)*0.3+1.3;child.material.emissiveIntensity=p;}}); }

    drawDebugMap();
    renderer.render(scene, camera);
} // End Game Loop

// --- Initialization ---

const onKeyDown = function (event) {
    switch (event.code) {
        case 'ArrowUp': case 'KeyW': moveForward = true; break;
        case 'ArrowLeft': case 'KeyA': moveLeft = true; break;
        case 'ArrowDown': case 'KeyS': moveBackward = true; break;
        case 'ArrowRight': case 'KeyD': moveRight = true; break;
        case 'ShiftLeft': case 'ShiftRight': if (!isRunning) { isRunning = true; currentSpeed = PLAYER_SPEED_RUN; } break;
        case 'KeyR': startReload(); break;
        case 'KeyP': DEBUG_COLLISION = !DEBUG_COLLISION; console.log(`Collision Debug: ${DEBUG_COLLISION?'ON':'OFF'}`); if(!DEBUG_COLLISION){debugRayArrows.forEach(a=>{if(a)a.visible=false;});} break;
        case 'KeyM': DEBUG_MAP_VISIBLE = !DEBUG_MAP_VISIBLE; console.log(`Map Always On: ${DEBUG_MAP_VISIBLE?'ON':'OFF'}`); if(debugMapCanvas){ if(!DEBUG_MAP_VISIBLE&&!isMapRevealing){debugMapCanvas.style.opacity='0';setTimeout(()=>debugMapCanvas.style.display='none',300);}else{debugMapCanvas.style.display='block';requestAnimationFrame(()=>debugMapCanvas.style.opacity='1');}} break;
        case 'KeyL': DEBUG_MOVEMENT = !DEBUG_MOVEMENT; console.log(`Movement Debug: ${DEBUG_MOVEMENT?'ON':'OFF'}`); break;
        case 'KeyK': DEBUG_AGENT = !DEBUG_AGENT; console.log(`Agent Debug: ${DEBUG_AGENT?'ON':'OFF'}`); break;
    }
};
const onKeyUp = function (event) {
    switch (event.code) {
        case 'ArrowUp': case 'KeyW': moveForward = false; break;
        case 'ArrowLeft': case 'KeyA': moveLeft = false; break;
        case 'ArrowDown': case 'KeyS': moveBackward = false; break;
        case 'ArrowRight': case 'KeyD': moveRight = false; break;
        case 'ShiftLeft': case 'ShiftRight': if (isRunning) { isRunning = false; currentSpeed = PLAYER_SPEED_WALK; } break;
    }
};

function init() {
    console.log("Initializing Matrix Maze...");
    blockerElement = document.getElementById('blocker');
    instructionsElement = document.getElementById('instructions');
    if (instructionsElement) instructionsSpan = instructionsElement.querySelector('span');
    if (instructionsSpan) instructionsSpan.dataset.originalText = instructionsSpan.innerHTML;
    debugMapCanvas = document.getElementById('debugMapCanvas');
    if (debugMapCanvas) { debugMapCtx = debugMapCanvas.getContext('2d'); debugMapCanvas.width = 200; debugMapCanvas.height = 200; debugMapCanvas.style.opacity = '0'; debugMapCanvas.style.display = 'none'; }
    else { console.error("Debug Map Canvas not found!"); }

    controls = new THREE.PointerLockControls(camera, document.body);
    if (instructionsElement) {
        instructionsElement.addEventListener('click', () => {
            if (gameOver || gameWon) { window.location.reload(); }
            else if (!controls.isLocked) { try { controls.lock(); } catch (e) { console.warn("Pointer lock failed:", e); } }
        });
    }
    controls.addEventListener('lock', () => { if(instructionsElement) instructionsElement.style.display = 'none'; if(blockerElement) blockerElement.style.display = 'none'; document.body.classList.add('locked'); stopMenuEffects(); });
    controls.addEventListener('unlock', () => { if (!gameOver && !gameWon) { if(blockerElement) blockerElement.style.display = 'flex'; if(instructionsElement) instructionsElement.style.display = ''; startMenuEffects(); } else { if(blockerElement) blockerElement.style.display = 'flex'; if(instructionsElement) instructionsElement.style.display = ''; stopMenuEffects(); if (instructionsSpan && instructionsSpan.dataset.originalText) instructionsSpan.innerHTML = instructionsSpan.dataset.originalText; startMenuEffects(); } document.body.classList.remove('locked'); });
    scene.add(controls.getObject());

    initMazeGrid();
    generateMaze(mazeGrid[1][1]);
    addCrossConnections(CROSS_CONNECTION_CHANCE);
    // GOAL: Ensure createMazeGeometry sets initial player orientation correctly *after* controls exist
    createMazeGeometry(); // This now sets initial player position and camera rotation
    createAgents();
    createGun();
    setupHUD();
    spawnRabbit();

    window.addEventListener('mousedown', (event) => { if (controls.isLocked && event.button === 0) { fireGun(); } });
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); if (debugMapCanvas) { debugMapCanvas.width = 200; debugMapCanvas.height = 200; } });

    startMenuEffects();
    console.log("--- DEBUG TOGGLES ---"); console.log(" P: Collision Rays | M: Map Always On | L: Movement Logs | K: Agent Logs"); console.log("---------------------");
    animate();
    console.log("Matrix Maze Initialized. Click screen to start.");
}

init();