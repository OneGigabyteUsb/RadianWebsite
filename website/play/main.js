import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBB } from "three/addons/math/OBB.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import {
    BasicClass, Place, ServerScripts, Script, Part, Frame, PointLight,
    Instances, activeParts, dynamicParts, collidableMeshes
} from './Classes.js';

THREE.Cache.enabled = true;
const scene = new THREE.Scene()

//=====UGC Object Hierarchy=====\\
// Default parent for Parts, like Roblox's Workspace.
const Workspace = new Place({ name: "Workspace" });
const GameScripts = new ServerScripts({});
window.Workspace = Workspace;
window.GameScripts = GameScripts;

//=====ServerPath=====\\
function getServerIdFromPath() {
    const parts = window.location.pathname.split('/').filter(Boolean);
    if (parts.length >= 2 && parts[0] === 'play') return parts[1];
    return null;
}
function getServerIdFromQuery() {
    return new URLSearchParams(window.location.search).get('id');
}
const GAME_ID = getServerIdFromPath() || getServerIdFromQuery() || document.body.dataset.gameId || 'main';

//=====Variables=====\\
let velocityY = 0;
const gravity = -0.03;
let isClimbing = false;
const climbSpeed = 0.12;
const CLIMB_STICK = 0.05;
const climbNormal = new THREE.Vector3();
const climbLaunchVelocity = new THREE.Vector3();
const CLIMB_LAUNCH_SPEED = 5;
const CLIMB_LAUNCH_DAMPING = 3.5;
const groundY = 0;
let Siftlock = false
let Health = 100
let MaxHealth = 100
let ItemHeld = false

let Grafic = 1;

let Paused = false;
let Siting = false;
let sitCooldown = 0;
const SIT_COOLDOWN_TIME = 20;
const SEAT_HEIGHT_OFFSET = 0.55;

let delta;
let dt;
const terminalVelocity = 3;

let r;
let g;
let b;

let target;

const charForward = new THREE.Vector3();
let isFacingWall;
let pushOverlap;
let isVertical;

let hit;

let clock;

let ratio;
let percentage;

const lockQuaternion = new THREE.Quaternion();
const targetQuaternion = new THREE.Quaternion();
const UP_AXIS = new THREE.Vector3(0, 1, 0);
const heightOffset = 2.7;
let targetRotationY;

// Makes character turning speed the same on any refresh rate.
const ROTATION_SMOOTHING = 0.15;
function frameIndependentLerp(factor, dt) {
    return 1 - Math.pow(1 - factor, dt);
}

let walkAnim;
let idleAnim;

let forwardX;
let forwardZ;
let rightX;
let rightZ;

//=====Html Elements=====\\
const menuButton = document.getElementById('menuButton');
const chatButton = document.getElementById('chatButton');
const emoteButton = document.getElementById('emoteButton');
const loadingScreen = document.getElementById('load');

const centerMenu = document.getElementById('centerMenu');
const resumeButton = document.getElementById('resumeButton');
const resetButton = document.getElementById('resetButton');
const leaveButton = document.getElementById('leaveButton');
const fill = document.getElementById('health-fill');
const GraficsSlider = document.getElementById('volume');

menuButton.addEventListener('click', function (event) {
   Paused = true;
	event.stopPropagation();
	centerMenu.classList.remove('hidden');
});

centerMenu.addEventListener('click', function (event) {
	event.stopPropagation();
});

resumeButton.addEventListener('click', function () {
   Paused = false;
	centerMenu.classList.add('hidden');
});
resetButton.addEventListener('click', function () {
	Health = 0
   Paused = false;
	centerMenu.classList.add('hidden');
});

leaveButton.addEventListener('click', function () {
	console.log('Leave clicked');
});

document.addEventListener('click', function () {
	if (!centerMenu.classList.contains('hidden')) {
      Paused = false;
		centerMenu.classList.add('hidden');
	}
	if (!chatMenu.classList.contains('hidden')) {
		chatMenu.classList.add('hidden');
	}
});

const chatMenu = document.getElementById('chatMenu');
const chatLog = chatMenu.querySelector('.chat-log');
const chatInput = document.getElementById('chatInput');
const sendChatButton = document.getElementById('sendChatButton');

chatButton.addEventListener('click', function (event) {
	event.stopPropagation();
	chatMenu.classList.toggle('hidden');
	if (!chatMenu.classList.contains('hidden')) chatInput.focus();
});

chatMenu.addEventListener('click', function (event) {
	event.stopPropagation();
});

chatInput.addEventListener('keydown', function (event) {
	event.stopPropagation();
	if (event.key === 'Enter') sendChatMessage();
});

sendChatButton.addEventListener('click', function (event) {
	event.stopPropagation();
	sendChatMessage();
});

emoteButton.addEventListener('click', function (event) {
	event.stopPropagation();
	console.log('Emote... does nothing >:3');
});


//=====Chat Messages=====\\
// Add your own words below (lowercase, whole-word match).
const bannedWords = [
    "fuck", "shit", "bitch", "bastard", "cunt", "piss", "slut", "whore", "ass", "hitler",
    "faggot", "retard", "nigger", "nigga", "asshole", "cock", "dick", "motherfucker", "dickbeaters", "cocksucker", "asscracker", "dickmonger", "cunt", "assjacker", "bullshit", "twat"
];

// Allows separator "noise" (spaces, underscores, dashes, dots) between
// letters, so "f_u_c_k" / "f u c k" still get caught, not just "fuck".
function buildBannedWordPattern(word) {
	const letters = word.split('').map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
	const gap = '[\\s_\\-.]*';
	const core = letters.join(gap);
	const suffix = `${gap}(?:s|es|ed|ing|er|ers)?`;
	return new RegExp(`(?<![a-zA-Z0-9])${core}${suffix}(?![a-zA-Z0-9])`, 'gi');
}

function filterMessage(text) {
	if (bannedWords.length === 0) return text;
	let filtered = text;
	for (const word of bannedWords) {
		const pattern = buildBannedWordPattern(word);
		filtered = filtered.replace(pattern, (match) => '#'.repeat(match.length));
	}
	return filtered;
}

function sendChatMessage() {
	const text = filterMessage(chatInput.value.trim());
	if (!text) return;
	if (multiplayerSocket.readyState === WebSocket.OPEN) {
		multiplayerSocket.send(JSON.stringify({ type: 'chat', text }));
	}
	chatInput.value = '';
}

function appendChatMessage(username, text) {
	const line = document.createElement('div');
	line.className = 'chat-message';
	const strong = document.createElement('strong');
	strong.textContent = `${username}: `;
	line.appendChild(strong);
	line.appendChild(document.createTextNode(filterMessage(text)));
	chatLog.appendChild(line);
	chatLog.scrollTop = chatLog.scrollHeight;
}

//=====Player Stuff=====\\
let JumpPower = 0.54;
let WalkSpeed = -0.7;
let spawn = new THREE.Vector3();

//=====Movement feel (accel/friction model, coyote time, jump buffer)=====\\
// Velocity ramps up/down instead of snapping to max speed.
let velocityX = 0;
let velocityZ = 0;
const groundAccel = 2;   // ground speed ramp-up rate
const groundFriction = 0.75; // ground stop speed (0-1, higher = snappier)
const airAccel = 0.22;     // air control strength
const airFriction = 0.02;  // air momentum loss (low = keeps speed through jumps)

// Coyote time: jump still works briefly after leaving a ledge.
// Jump buffer: early jump press still registers on landing.
let coyoteTimer = 999;
let jumpBufferTimer = 999;
const COYOTE_TIME = 9;      // ~0.15s at 60fps
const JUMP_BUFFER_TIME = 9; // ~0.15s at 60fps

// Sprint: held key, only takes effect on ground.
let isSprinting = false;
const sprintMultiplier = 1.3; // top speed while sprinting = groundSpeed * this

// Air speed cap: ground cap, or current speed if faster (keeps momentum).
const airMaxSpeedMultiplier = 0.35; // baseline air cap vs ground cap

function SetSpawn(x,y,z) {
   spawn = new THREE.Vector3(x,y,z);
}

const healthBar = document.getElementById("health-bar");
const title = document.getElementById("title");

const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 )
camera.rotation.order = 'YXZ';

let theta = 0;
let phi = 0;
let distance = 8;
let sensitivity = 0.0032; // was 0.007, too fast
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const FIRST_PERSON_DISTANCE = 1.2;
const FIRST_PERSON_FADE_START = 2.5;
const characterMeshes = [];

const CAMERA_COLLISION_BUFFER = 0.3;
const cameraRaycaster = new THREE.Raycaster();
const cameraPivot = new THREE.Vector3();
const cameraDir = new THREE.Vector3();


let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };

const listener = new THREE.AudioListener();
camera.add(listener);

const sharedTextureLoader = new THREE.TextureLoader();

class Sound extends BasicClass {
    constructor(data) {
       super(data);

       this.x = data.x ?? 0;
       this.y = data.y ?? 0;
       this.z = data.z ?? 0;

       this.Sound = data.sound ?? "sounds/test.wav";
       this.volume = data.volume ?? 0.5;
       this.loop = data.loop ?? false
    }
    Play() {
        const sound = new THREE.PositionalAudio(listener);
        const audioLoader = new THREE.AudioLoader();
        sound.position.set(this.x, this.y, this.z);

        audioLoader.load(this.Sound, (buffer) => {
            sound.setBuffer(buffer);
            sound.setLoop(this.loop);
            sound.setVolume(this.volume);
            sound.play();
        });
    }
}

function getOBBAxes(obb, out) {
    const e = obb.rotation.elements;
    out[0].set(e[0], e[1], e[2]);
    out[1].set(e[3], e[4], e[5]);
    out[2].set(e[6], e[7], e[8]);
    return out;
}

function projectedRadius(obb, axes, axis) {
    return (
        obb.halfSize.x * Math.abs(axis.dot(axes[0])) +
        obb.halfSize.y * Math.abs(axis.dot(axes[1])) +
        obb.halfSize.z * Math.abs(axis.dot(axes[2]))
    );
}

const _axesA = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const _axesB = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const _testAxes = Array.from({ length: 15 }, () => new THREE.Vector3());
const _centerDelta = new THREE.Vector3();
const _minAxis = new THREE.Vector3();
const _obbHit = { axis: new THREE.Vector3(), overlap: 0 };
const _pushVec = new THREE.Vector3();

function resolveOBBOverlap(a, b) {
    getOBBAxes(a, _axesA);
    getOBBAxes(b, _axesB);

    let axisCount = 0;
    for (let i = 0; i < 3; i++) _testAxes[axisCount++].copy(_axesA[i]);
    for (let i = 0; i < 3; i++) _testAxes[axisCount++].copy(_axesB[i]);
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            const cross = _testAxes[axisCount];
            cross.crossVectors(_axesA[i], _axesB[j]);
            if (cross.lengthSq() > 1e-8) {
                cross.normalize();
                axisCount++;
            }
        }
    }

    _centerDelta.copy(a.center).sub(b.center);

    let minOverlap = Infinity;
    let found = false;

    for (let k = 0; k < axisCount; k++) {
        const axis = _testAxes[k];
        const rA = projectedRadius(a, _axesA, axis);
        const rB = projectedRadius(b, _axesB, axis);
        const dist = Math.abs(_centerDelta.dot(axis));
        const overlap = rA + rB - dist;

        if (overlap <= 0) return null;

        if (overlap < minOverlap) {
            minOverlap = overlap;
            found = true;
            _minAxis.copy(axis);
            if (_centerDelta.dot(_minAxis) < 0) _minAxis.negate();
        }
    }

    if (!found) return null;
    _obbHit.axis.copy(_minAxis);
    _obbHit.overlap = minOverlap;
    return _obbHit;
}

const renderer = new THREE.WebGLRenderer({ antialias: true })
// renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap; //PCFShadowMap;
renderer.setSize(window.innerWidth, window.innerHeight)
document.body.appendChild(renderer.domElement)

scene.environment = null;

let modelReady = false;
let pendingSpawn = null;
let currentMapData = null;

let mapLights = [];
let mapScripts = [];

function clearMap() {
    activeParts.forEach(part => scene.remove(part.mesh));
    activeParts.length = 0;
    dynamicParts.length = 0;
    collidableMeshes.length = 0;

    mapLights.forEach(light => scene.remove(light.light));
    mapLights = [];

    mapScripts.forEach(script => script.destroy());
    mapScripts = [];

    // Drop only the Parts we own -- leave any other UGC objects alone.
    Workspace.children = Workspace.children.filter(child => !(child instanceof Part));
}

function loadMap(mapData) {
    clearMap();
 
    (mapData.parts || []).forEach(partDef => {
        const part = new Part({ parent: "Workspace", ...partDef });
        part.addTo(scene);
    });

    (mapData.lights || []).forEach(lightDef => {
        const light = new PointLight(lightDef);
        light.addTo(scene);
        mapLights.push(light);
    });

    (mapData.scripts || []).forEach(scriptDef => {
        const script = new Script({ parent: "ServerScripts", ...scriptDef });
        mapScripts.push(script);
    });
 
    currentMapData = mapData;
	console.log(mapData.spawn)

    SetSpawn(0,0,0)

    if (mapData.spawn) {
        if (modelReady === true) {
            gltf.scene.position.x = mapData.spawn.x;
			gltf.scene.position.y = mapData.spawn.y;
			gltf.scene.position.z = mapData.spawn.z;
            velocityY = 0;
        } else {
            pendingSpawn = mapData.spawn;
        }
    }
}

async function loadMapFromURL(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to load map "${url}": ${response.status}`);
    const mapData = await response.json();
    loadMap(mapData);
    return mapData;
}

window.loadMap = loadMap;
window.Part = Part;
window.Sound = Sound;
window.THREE = THREE;
window.scene = scene;
window.spawn = spawn;
window.Health = Health;

function serializeCurrentMap(name, author) {
    return {
        name: name || (currentMapData && currentMapData.name) || 'Untitled',
        author: author || '',
        background: currentMapData ? currentMapData.background : undefined,
        spawn: (modelReady && gltf.scene)
            ? { x: gltf.scene.position.x, y: gltf.scene.position.y, z: gltf.scene.position.z }
            : (currentMapData && currentMapData.spawn) || { x: 0, y: 0, z: 0.9 },
        parts: activeParts.map(part => part.def),
        lights: mapLights.map(light => ({
            name: light.name, parent: light.parent,
            x: light.x, y: light.y, z: light.z,
            intensity: light.intensity, color: light.color, CastShadow: light.CastShadow
        })),
        scripts: mapScripts.map(script => ({
            name: script.name, parent: script.parent,
            scriptString: script.scriptString
        }))
    };
}

const loader = new GLTFLoader();
const controls = new OrbitControls(camera, renderer.domElement)

const ambientLight = new THREE.AmbientLight( '#B3C4FF' );
scene.add(ambientLight)

const defaultMap = {
    name: "Default",
    spawn: { x: 0, y: 0, z: 0.9 },
    parts: [
        { x: 0, y: -0.5, z: 0, sx: 60, sy: 1, sz: 60, color: "#5cb85c" },
        { x: 10, y: 2, z: -10, sx: 10, sy: 4, sz: 10, color: "#6e6e6e" },
        { x: 0, y: 0.5, z: 0, sx: 1, sy: 1, sz: 1, Siting: true, color: "#304173" }
    ]
};

window.defaultMap = defaultMap;
window.loadMapFromURL = loadMapFromURL;
window.clearMap = clearMap;

async function loadMapForCurrentGame() {
    if (GAME_ID === 'main') {
        return loadMapFromURL("maps/Demo.json");
    }

    try {
        const res = await fetch('/api/games.json');
        if (!res.ok) throw new Error(`games.json fetch failed: ${res.status}`);
        const games = await res.json();

        const game = games.find(g => String(g.Id) === String(GAME_ID));
        if (!game) throw new Error(`No game with id ${GAME_ID} in the catalog`);

        const mapPath = game.game_path || `maps/${game.name}_${game.Id}.json`;
        return await loadMapFromURL(mapPath);
    } catch (err) {
        console.warn('[map] could not load map for this game, falling back to the demo map:', err);
        return loadMapFromURL("maps/Demo.json");
    }
}

await loadMapForCurrentGame();


//const floor = new CreatePart({ x: 0, y: -0.5, z: 0, sx: 60, sy: 1, sz: 60, color: "#5cb85c" });
//floor.addTo(scene);

//const wall = new CreatePart({
   //x: 10, 
   //y: 2, 
   //z: -10, 
   //sx: 10, 
   //sy: 4, 
   //sz: 10, 
   //color: "#6e6e6e"
//});
//wall.addTo(scene);

//const cube2 = new CreatePart({ x: 0, y: 0.5, z: 0, sx: 1, sy: 1, sz: 1, color: "#304173" });
//cube2.addTo(scene);

const hemi = new THREE.HemisphereLight('#9FB4D5', '#2E2E2E', 0.9);
hemi.position.set(30, 40, 20);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(30, 40, 20);
sun.castShadow = true;
sun.shadow.normalBias = 0.02;
sun.shadow.camera = new THREE.OrthographicCamera(-50, 50, 50, -50, 0.5, 500);
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -30;
sun.shadow.camera.right = 30;
sun.shadow.camera.top = 30;
sun.shadow.camera.bottom = -30;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 110;
sun.shadow.bias = 0.0001;
scene.add(sun);
scene.add(sun.target);

scene.fog = new THREE.FogExp2( '#01A2DF', 0.01 );
scene.background = new THREE.Color('#01A2DF');

let mixer = null;
let animationsMap = {};
let currentAction = null;
let currentState = "";
let lockedAnimation = false;
let isGrounded = true;

let faceTexture = sharedTextureLoader.load("faces/default.png");
faceTexture.colorSpace = THREE.SRGBColorSpace;
faceTexture.flipY = false;

const gltf = await loader.loadAsync( 'models/model.gltf' );
gltf.scene.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.receiveShadow = true;
    obj.castShadow = true;

    if (obj.name === "Head_1") {
        obj.material = new THREE.MeshStandardMaterial({ color: "#b3b3b3", flatShading: false });
    }
    if (obj.name === "Torso_1") {
        obj.material = new THREE.MeshStandardMaterial({ color: "#9c253b" });
    }
    if (obj.name === "Arm1") {
        obj.material = new THREE.MeshStandardMaterial({ color: "#b3b3b3" });
    }
    if (obj.name === "Right2") {
        obj.material = new THREE.MeshStandardMaterial({ color: "#b3b3b3" });
        let RightArmPos = obj.position
    }
    if (obj.name === "Leg1" || obj.name === "Leg2") {
        obj.material = new THREE.MeshStandardMaterial({ color: "#241616" });
    }
    if (["Face", "Face_1", "Face1"].includes(obj.name)) {
        obj.material = new THREE.MeshStandardMaterial({ map: faceTexture, transparent: true });
        obj.receiveShadow = true;
        obj.castShadow = false;
    }
    if (obj.name === "T-shirt") {
        // No shirt equipped yet by default -- equipShirt() below shows
        // this and sets its texture once avatar data comes back.
        obj.material = new THREE.MeshStandardMaterial({ transparent: true });
        obj.visible = false;
        obj.receiveShadow = true;
        obj.castShadow = false;
    }

    obj.material.transparent = true;
    characterMeshes.push(obj);
});

const AVATAR_PART_MESH_NAMES = {
    head: ["Head_1"],
    torso: ["Torso_1"],
    left_arm: ["Arm1"],
    right_arm: ["Right2"],
    left_leg: ["Leg1"],
    right_leg: ["Leg2"],
};

const meshesWithOwnMaterial = new WeakSet();

function applyAvatarColors(root, colors) {
    if (!colors) return;
    root.traverse((obj) => {
        if (!obj.isMesh) return;
        for (const [part, meshNames] of Object.entries(AVATAR_PART_MESH_NAMES)) {
            if (!meshNames.includes(obj.name) || !colors[part]) continue;
            if (!meshesWithOwnMaterial.has(obj)) {
                obj.material = obj.material.clone();
                meshesWithOwnMaterial.add(obj);
            }
            obj.material.color.set(colors[part]);
        }
    });
}

const itemsCatalogPromise = fetch('/api/items.json')
    .then(r => (r.ok ? r.json() : []))
    .catch(() => []);

const equippedHatsByRoot = new WeakMap(); // root -> array of hat groups

function findHeadBone(root) {
    let headBone = null;
    root.traverse((obj) => {
        if (headBone || !obj.isSkinnedMesh || !obj.skeleton) return;
        headBone = obj.skeleton.bones.find(b => /head/i.test(b.name)) || null;
    });
    return headBone;
}

const HAT_BONE_Y_OFFSET = 0.18;
const HAT_STACK_SPACING = 0.05; // extra height added per stacked hat so they don't overlap

async function equipHat(root, avatar) {
    if (!avatar || !avatar.accessories) return;
    const items = await itemsCatalogPromise;
    const equippedIds = new Set(avatar.accessories.ids);
    const hatItems = items.filter(item => item.type === "Hat" && equippedIds.has(item.Id));

    // Remove any previously equipped hats before adding the new set.
    const previousHats = equippedHatsByRoot.get(root);
    if (previousHats) {
        for (const group of previousHats) group.parent?.remove(group);
        equippedHatsByRoot.delete(root);
    }
    if (hatItems.length === 0) return;

    const newHatGroups = [];

    for (let i = 0; i < hatItems.length; i++) {
        const hatItem = hatItems[i];
        if (!hatItem.model) continue;

        let hat;
        try {
            const hatGltf = await loader.loadAsync(hatItem.model);
            hat = hatGltf.scene;
        } catch (err) {
            console.warn(`[avatar] could not load hat model for item ${hatItem.Id}`, err);
            continue;
        }

        if (hatItem.texture) {
            try {
                const hatTexture = await sharedTextureLoader.loadAsync(hatItem.texture);
                hatTexture.colorSpace = THREE.SRGBColorSpace;
                hat.traverse((obj) => {
                    if (!obj.isMesh) return;
                    obj.material = obj.material.clone();
                    obj.material.map = hatTexture;
                    obj.material.needsUpdate = true;
                });
            } catch (err) {
                console.warn(`[avatar] could not load hat texture for item ${hatItem.Id}`, err);
            }
        }

        const hatGroup = new THREE.Group();
        hatGroup.add(hat);

        // Each stacked hat sits a bit higher than the last so multiple
        // hats don't render on top of each other at the same spot.
        const stackOffset = HAT_BONE_Y_OFFSET + i * HAT_STACK_SPACING;

        const headBone = findHeadBone(root);
        if (headBone) {
            // Bone-local space: no geometry to measure, just a tuned offset.
            hatGroup.position.set(0, stackOffset, 0);
            headBone.add(hatGroup);
        } else {
            const headMesh = root.getObjectByName("Head_1");
            if (headMesh) {
                headMesh.geometry.computeBoundingBox();
                const box = headMesh.geometry.boundingBox;
                hatGroup.position.set(
                    (box.min.x + box.max.x) / 2,
                    box.max.y + i * HAT_STACK_SPACING,
                    (box.min.z + box.max.z) / 2
                );
                headMesh.add(hatGroup);
            } else {
                root.add(hatGroup); // last resort, sits at the model's origin
            }
        }

        newHatGroups.push(hatGroup);
    }

    equippedHatsByRoot.set(root, newHatGroups);
}

async function equipShirt(root, avatar) {
    const shirtMesh = root.getObjectByName("T-shirt");
    if (!shirtMesh) return;

    if (!avatar || !avatar.accessories) {
        shirtMesh.visible = false;
        return;
    }

    const items = await itemsCatalogPromise;
    const equippedIds = new Set(avatar.accessories.ids);
    const shirtItem = items.find(item => item.type === "T-shirt" && equippedIds.has(item.Id));

    if (!shirtItem) {
        shirtMesh.visible = false;
        return;
    }

    if (!meshesWithOwnMaterial.has(shirtMesh)) {
        shirtMesh.material = shirtMesh.material.clone();
        meshesWithOwnMaterial.add(shirtMesh);
    }

    if (shirtItem.texture) {
        try {
            const tex = await sharedTextureLoader.loadAsync(shirtItem.texture);
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.flipY = false;
            shirtMesh.material.map = tex;
            shirtMesh.material.needsUpdate = true;
        } catch (err) {
            console.warn(`[avatar] could not load shirt texture for item ${shirtItem.Id}`, err);
            const tex = await sharedTextureLoader.loadAsync("textures/Plastic.png");
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.flipY = false;
            shirtMesh.material.map = tex;
            shirtMesh.material.needsUpdate = true;
            shirtMesh.visible = false;
        }
    }

    shirtMesh.visible = true;
}

//---Sounds---\\\

const globalSound = new THREE.Audio(listener);

const audioLoader = new THREE.AudioLoader();
audioLoader.load('sound/action_jump.wav', function(buffer) {
    globalSound.setBuffer(buffer);
    globalSound.setLoop(false);
    globalSound.setVolume(2);
});

if (gltf.animations && gltf.animations.length > 0) {
    mixer = new THREE.AnimationMixer(gltf.scene);

    mixer.addEventListener('finished', (e) => {
        if (e.action === animationsMap['point']) {
            lockedAnimation = false;
            currentState = "";
            fadeToAnimation('Idle');
        }
     });

    gltf.animations.forEach((clip) => {
        const action = mixer.clipAction(clip);
        action.enabled = true;
        action.setEffectiveWeight(0);
        action.play();
        animationsMap[clip.name.toLowerCase()] = action;
    });

    if (animationsMap['idle']) {
        currentAction = animationsMap['idle'];
        currentAction.setEffectiveWeight(1);
    }
}

//---Thingy---\\\

gltf.scene.rotation.y = Math.PI;
gltf.scene.position.z = 0.9;
scene.add( gltf.scene );

fetch('/api/me/avatar', { credentials: 'include' })
    .then(r => r.json())
    .then(avatar => {
        applyAvatarColors(gltf.scene, avatar.colors);
        equipHat(gltf.scene, avatar);
        equipShirt(gltf.scene, avatar);
    })
    .catch(() => console.warn('[avatar] could not load your avatar colors'));

let myUserId = null;
fetch('/api/me', { credentials: 'include' })
    .then(r => r.json())
    .then(me => { myUserId = me.id; })
    .catch(() => console.warn('[multiplayer] could not fetch /api/me -- are you logged in?'));

const wsProtocol = location.protocol === "https:" ? "wss:" : "ws:";
const multiplayerSocket = new WebSocket(`${wsProtocol}//${location.host}/ws?game_id=${encodeURIComponent(GAME_ID)}`);
const otherPlayers = {}; // user_id (string) -> remote player record, see buildRemotePlayer()

multiplayerSocket.addEventListener('open', () => console.log('[multiplayer] connected'));
multiplayerSocket.addEventListener('close', (e) => console.log('[multiplayer] disconnected', e.code, e.reason));
multiplayerSocket.addEventListener('error', (err) => console.error('[multiplayer] socket error', err));
multiplayerSocket.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'state') updateOtherPlayers(msg.players);
    else if (msg.type === 'chat') appendChatMessage(msg.username, msg.text);
});

function buildRemotePlayer(id) {
    const root = SkeletonUtils.clone(gltf.scene);
    root.traverse((obj) => {
        if (obj.isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
        }
    });
    scene.add(root);
	
    fetch(`/api/${id}/avatar`, { credentials: 'include' })
        .then(r => r.json())
        .then(avatar => {
            applyAvatarColors(root, avatar.colors);
            equipHat(root, avatar);
            equipShirt(root, avatar);
        })
        .catch(() => console.warn(`[avatar] could not load avatar colors for player ${id}`));

    const mixer = new THREE.AnimationMixer(root);
    const animMap = {};
    gltf.animations.forEach((clip) => {
        const action = mixer.clipAction(clip);
        action.enabled = true;
        action.setEffectiveWeight(0);
        action.play();
        animMap[clip.name.toLowerCase()] = action;
    });

    let currentAction = animMap['idle'] || null;
    if (currentAction) currentAction.setEffectiveWeight(1);

    const player = {
        root,
        mixer,
        animMap,
        currentAction,
        targetPos: [root.position.x, root.position.y, root.position.z],
        targetRot: [root.quaternion.x, root.quaternion.y, root.quaternion.z, root.quaternion.w],
    };

    mixer.addEventListener('finished', (e) => {
        if (e.action === animMap['point']) {
            setRemoteAnimation(player, 'Idle');
        }
    });

    return player;
}

function setRemoteAnimation(player, animName) {
    const next = player.animMap[animName.toLowerCase()];
    if (!next || player.currentAction === next) return;

    next.paused = false; // in case a previous one-shot left it paused

    if (animName.toLowerCase() === "point") {
        next.reset(); // one-shot gesture: always restart from frame 0
        next.setLoop(THREE.LoopOnce, 1);
        next.clampWhenFinished = true;
    } else {
        next.setLoop(THREE.LoopRepeat);
    }

    next.enabled = true;
    next.setEffectiveTimeScale(1);
    next.setEffectiveWeight(1);

    if (player.currentAction) {
        player.currentAction.crossFadeTo(next, 0.2, true);
    } else {
        next.fadeIn(0.2);
    }
    player.currentAction = next;
}

function updateOtherPlayers(players) {
    const seenIds = new Set();

    for (const id in players) {
        if (myUserId !== null && id === String(myUserId)) continue; // skip yourself
        seenIds.add(id);

        const data = players[id];
        if (!otherPlayers[id]) {
            otherPlayers[id] = buildRemotePlayer(id);
        }

        const p = otherPlayers[id];
        p.targetPos = data.pos;
        p.targetRot = data.rot;
        if (data.anim) setRemoteAnimation(p, data.anim);
    }

    // Remove disconnected players
    for (const id in otherPlayers) {
        if (!seenIds.has(id)) {
            scene.remove(otherPlayers[id].root);
            delete otherPlayers[id];
        }
    }
}

const REMOTE_LERP_SPEED = 10; // higher = snappier, lower = smoother but laggier

function interpolateOtherPlayers(deltaSeconds) {
    const t = Math.min(1, REMOTE_LERP_SPEED * deltaSeconds);
    for (const id in otherPlayers) {
        const p = otherPlayers[id];
        p.root.position.lerp(
            new THREE.Vector3(p.targetPos[0], p.targetPos[1], p.targetPos[2]),
            t
        );
        p.root.quaternion.slerp(
            new THREE.Quaternion(p.targetRot[0], p.targetRot[1], p.targetRot[2], p.targetRot[3]),
            t
        );
        if (p.mixer) p.mixer.update(deltaSeconds);
    }
}

const MULTIPLAYER_SEND_RATE = 1 / 20; // matches TICK_RATE in multiplayer.py
let lastMultiplayerSend = 0;

function sendMyPosition(elapsedSeconds) {
    if (elapsedSeconds - lastMultiplayerSend < MULTIPLAYER_SEND_RATE) return;
    lastMultiplayerSend = elapsedSeconds;

    if (multiplayerSocket.readyState !== WebSocket.OPEN) return;

    multiplayerSocket.send(JSON.stringify({
        type: 'move',
        pos: [gltf.scene.position.x, gltf.scene.position.y, gltf.scene.position.z],
        rot: [gltf.scene.quaternion.x, gltf.scene.quaternion.y, gltf.scene.quaternion.z, gltf.scene.quaternion.w],
        anim: currentState || 'idle',
    }));
}

//=========HitBoxs=========\\\
const hitboxHeight = 3;
const hitboxGeo = new THREE.BoxGeometry(1.3, hitboxHeight, 0.6);

let hitboxMat = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true, visible: false });
const playerHitboxMesh = new THREE.Mesh(hitboxGeo, hitboxMat);
hitboxGeo.translate(0, hitboxHeight / 2, 0); 
scene.add(playerHitboxMesh);

const playerLocalOBB = new OBB(
    new THREE.Vector3(0, hitboxHeight / 2, 0),
    new THREE.Vector3(0.65, hitboxHeight / 2, 0.3)
);
const playerOBB = playerLocalOBB.clone();
const playerBoundingRadius = Math.sqrt(0.65 * 0.65 + (hitboxHeight / 2) * (hitboxHeight / 2) + 0.3 * 0.3);

function syncPlayerHitbox() {
    playerHitboxMesh.position.copy(gltf.scene.position);
    playerHitboxMesh.quaternion.copy(gltf.scene.quaternion);
    playerHitboxMesh.updateMatrixWorld(true);

    playerOBB.copy(playerLocalOBB);
    playerOBB.applyMatrix4(playerHitboxMesh.matrixWorld);
}

function GraficsUpdate() {
   if (GraficsSlider.value === "1") {
       sun.shadow.mapSize.set(0, 0);
       updateFrustum(0);
   } else if (GraficsSlider.value === "2") {
       sun.shadow.mapSize.set(2048, 2048);
       updateFrustum(30);
   } else if (GraficsSlider.value === "3") {
       sun.shadow.mapSize.set(2048, 2048);
       updateFrustum(35);
   } else if (GraficsSlider.value === "4") {
       sun.shadow.mapSize.set(2048, 2048);
       updateFrustum(40);
   } else if (GraficsSlider.value === "5") {
       sun.shadow.mapSize.set(2048, 2048);
       updateFrustum(65);
   }

   if (sun.shadow.map) {
       sun.shadow.map.dispose();
       sun.shadow.map = null;
   }
   sun.shadow.camera.updateProjectionMatrix();
   renderer.shadowMap.needsUpdate = true;
}

function updateFrustum(size) {
    sun.shadow.camera.left = -size;
    sun.shadow.camera.right = size;
    sun.shadow.camera.top = size;
    sun.shadow.camera.bottom = -size;
}

GraficsSlider.addEventListener('input', function() {
    GraficsUpdate()
});
const partGravity = -0.03;
const partTerminalVelocity = 3;
const _partPushVec = new THREE.Vector3();
const PART_PUSH_SHARE = 0.0;
const PART_PUSH_SPEED = 0.04;
const PART_FRICTION = 0.24;

function checkPartCollisions() {
    syncPlayerHitbox();

    isGrounded = false;
    isClimbing = false;

    const px = playerOBB.center.x, py = playerOBB.center.y, pz = playerOBB.center.z;

    for (let i = 0; i < activeParts.length; i++) {
        const part = activeParts[i];

        const dx = part.x - px;
        const dy = part.y - py;
        const dz = part.z - pz;
        const reach = part.boundingRadius + playerBoundingRadius;
        if (dx * dx + dy * dy + dz * dz > reach * reach) continue;

        part.updateHitbox();

        hit = resolveOBBOverlap(playerOBB, part.obb);
        if (!hit) continue;

        if (part.killbrick) {
            Health = 0;
            continue;
        }

        if (part.isSpawnLocation) {
            SetSpawn(part.x, part.y + part.sy, part.z);
        }

        if (part.Siting && sitCooldown <= 0) {
            velocityY = 0
            Siting = true
            fadeToAnimation("Sit")
            gltf.scene.position.set(part.x, part.y + SEAT_HEIGHT_OFFSET, part.z)
            gltf.scene.rotation.y = part.rx
            continue
        }

        isVertical = Math.abs(hit.axis.y) > 0.5;

        pushOverlap = hit.overlap;

        charForward.set(0, 0, -1).applyQuaternion(gltf.scene.quaternion).normalize();
        isFacingWall = charForward.dot(hit.axis) < -0.97;
        
        if (part.IsClimbable && !isVertical && isFacingWall ) {
            isClimbing = true;
            climbNormal.copy(hit.axis);
            climbLaunchVelocity.set(0, 0, 0);
            pushOverlap = Math.max(0, hit.overlap - CLIMB_STICK);
        }

        if (!part.CanCollide) continue;

        if (!part.Anchored && !isVertical) {
			if (!part.CanCollide) continue;
            const pushToBlock = pushOverlap * PART_PUSH_SHARE;
            const pushToPlayer = pushOverlap - pushToBlock;

            _partPushVec.copy(hit.axis).multiplyScalar(-pushToBlock);
            part.x += _partPushVec.x;
            part.z += _partPushVec.z;
            part.mesh.position.set(part.x, part.y, part.z);
            part.updateHitbox();

            part.velocity.x += -hit.axis.x * PART_PUSH_SPEED;
            part.velocity.z += -hit.axis.z * PART_PUSH_SPEED;

            _pushVec.copy(hit.axis).multiplyScalar(pushToPlayer);
            gltf.scene.position.add(_pushVec);
            syncPlayerHitbox();
            continue;
        }

        _pushVec.copy(hit.axis).multiplyScalar(pushOverlap);
        gltf.scene.position.add(_pushVec);
        syncPlayerHitbox();

        if (isVertical) {
            velocityY = 0;
            if (hit.axis.y > 0) {
                isGrounded = true;
            }
        }
    }
}

function stepDynamicParts(dt) {
    for (let i = 0; i < dynamicParts.length; i++) {
        const part = dynamicParts[i];
        const wasGrounded = !!part._grounded;

        part.velocity.y += partGravity * dt;
        part.velocity.y = Math.max(-partTerminalVelocity, Math.min(partTerminalVelocity, part.velocity.y));

        if (wasGrounded && part.CanCollide) {
            const friction = Math.max(0, 1 - PART_FRICTION * dt);
            part.velocity.x *= friction;
            part.velocity.z *= friction;
            if (Math.abs(part.velocity.x) < 0.001) part.velocity.x = 0;
            if (Math.abs(part.velocity.z) < 0.001) part.velocity.z = 0;
        }

        part.x += part.velocity.x * dt;
        part.y += part.velocity.y * dt;
        part.z += part.velocity.z * dt;

        part.mesh.position.set(part.x, part.y, part.z);
        part.updateHitbox();

        part._grounded = false;

        for (let j = 0; j < activeParts.length; j++) {
            const other = activeParts[j];
            if (other === part) continue;

            const dx = other.x - part.x, dy = other.y - part.y, dz = other.z - part.z;
            const reach = other.boundingRadius + part.boundingRadius;
            if (dx * dx + dy * dy + dz * dz > reach * reach) continue;

            other.updateHitbox();
            const hit = resolveOBBOverlap(part.obb, other.obb);
            if (!hit || !other.CanCollide) continue;

            _partPushVec.copy(hit.axis).multiplyScalar(hit.overlap);
            part.x += _partPushVec.x;
            part.y += _partPushVec.y;
            part.z += _partPushVec.z;
            part.mesh.position.set(part.x, part.y, part.z);
            part.updateHitbox();

            if (Math.abs(hit.axis.y) > 0.5) {
                part.velocity.y = 0;
                if (hit.axis.y > 0) part._grounded = true;
            } else {
                part.velocity.x = 0;
                part.velocity.z = 0;
            }
        }
    }
}

function CheckHealth() {
    if (Health <= 0) {
       WalkSpeed = 0;
       setTimeout(() => {
           gltf.scene.position.y = spawn.y;
           gltf.scene.position.x = spawn.x;
           gltf.scene.position.z = spawn.z;
           velocityY = 0
           gltf.scene.rotation.y = 3.14;
           gltf.scene.rotation.x = 0;
           gltf.scene.rotation.z = 0;
           ItemHeld = false
           Health = 100;
           WalkSpeed = -0.7;
       }, 200);
    }
}


//=========Mouse and Keyborad=========\\\
window.addEventListener('mousedown', (event) => {
    if (event.button === 2 || event.button === 0) { 
        isDragging = true;
        previousMousePosition = { x: event.clientX, y: event.clientY };
    }
});

window.addEventListener('mousemove', (event) => {
    if (!isDragging) return; 

    const deltaX = event.clientX - previousMousePosition.x;
    const deltaY = event.clientY - previousMousePosition.y;

    theta -= deltaX * sensitivity;
    phi += deltaY * sensitivity; 

    const maxVerticalAngle = Math.PI / 2 - 0.05; 
    phi = Math.max(-maxVerticalAngle, Math.min(maxVerticalAngle, phi));

    previousMousePosition = { x: event.clientX, y: event.clientY };
});

window.addEventListener('mouseup', (event) => {
    if (event.button === 2 || event.button === 0) isDragging = false;
});

window.addEventListener('wheel', (event) => {
    distance += event.deltaY * 0.05;
    distance = Math.max(FIRST_PERSON_DISTANCE, Math.min(260, distance));
});

window.addEventListener('contextmenu', (e) => e.preventDefault());

const keys = { KeyW: false, KeyA: false, KeyS: false, KeyD: false, ControlLeft: false, ShiftLeft: false };
window.addEventListener('keydown', (e) => { if (e.code in keys) keys[e.code] = true; });
window.addEventListener('keyup', (e) => { if (e.code in keys) keys[e.code] = false; });

document.addEventListener("keydown", (event) => {
    if (event.key === 'p') {
        // currentState is what gets broadcast to other players.
        currentState = "point";
        fadeToAnimation('Point');
    }
});

document.addEventListener('keydown', (event) => {
  if (event.code === "Space") {
    if (Siting === true) sitCooldown = SIT_COOLDOWN_TIME;
    Siting = false
    if (isClimbing) {
      isClimbing = false;
      velocityY = JumpPower;
      // climbLaunchVelocity.copy(climbNormal).multiplyScalar(CLIMB_LAUNCH_SPEED);
      globalSound.play();
    } else {
      // Just remember the press; animate() resolves it with coyote time.
      jumpBufferTimer = 0;
    }
  }
});

document.addEventListener('keydown', (event) => {
  if (event.code === "KeyT") {
     Health -= 10
     console.log(Health)
  }
});

document.addEventListener('keydown', (event) => {
  if (event.code === "KeyU") {
     if (ItemHeld === true) {
         ItemHeld = false
     } else {
         ItemHeld = true
     }
  }
});

document.addEventListener('keydown', (event) => {
  if (event.code === "Escape") {
     centerMenu.classList.remove('hidden');
     Paused = true;
  }
});

document.addEventListener('keydown', (event) => {
  if (event.code === "Period") {
     centerMenu.classList.remove('hidden');
     Paused = true;
  }
});

document.addEventListener('keydown', (event) => {
  if (event.ctrlKey) {
     if (Siftlock === true) {
         Siftlock = false
     } else {
         Siftlock = true
     }
   console.log(Siftlock)
  }
});

function Respawn() {
   Health = 0;
}

window.Respawn = Respawn
window.SetSpawn = SetSpawn

//===Animation===\\\

function fadeToAnimation(nextAnimationName) {
    const nextAction = animationsMap[nextAnimationName.toLowerCase()];
    if (!nextAction || currentAction === nextAction || lockedAnimation) return;

    nextAction.reset();
    nextAction.setEffectiveTimeScale(1);
    nextAction.setEffectiveWeight(1);

    if (nextAnimationName === "Point") {
        nextAction.setLoop(THREE.LoopOnce, 1);
        nextAction.clampWhenFinished = true;
        lockedAnimation = true;
    } else {
        nextAction.setLoop(THREE.LoopRepeat);
    }

    if (currentAction) currentAction.crossFadeTo(nextAction, 0.2, true);

    nextAction.play();
    currentAction = nextAction;
}

window.fadeToAnimation = fadeToAnimation

window.addEventListener('resize', () => {
   camera.aspect = window.innerWidth / window.innerHeight;
   camera.updateProjectionMatrix();
   renderer.setSize(window.innerWidth, window.innerHeight);
});

window.gltf = gltf;
window.ItemHeld = ItemHeld;
window.fadeToAnimation = fadeToAnimation

clock = new THREE.Clock();
const moveDirection = new THREE.Vector3();

camera.position.set(0, 3.5, 12);

console.log("Loaded clips:", gltf.animations.map(a => a.name));

window.isClimbing = isClimbing

// Handed to every Script under GameScripts each frame; the intended
// way for UGC scripts to reach into the live game (not `window`).
function buildScriptContext(time) {
    return {
        time,
        dt,
        Part, PointLight, Frame, Script, Place,
        Workspace,
        scene,
        THREE,
        get Health() { return Health; },
        set Health(v) { Health = v; },
        MaxHealth,
        Paused,
        player: gltf && gltf.scene ? gltf.scene : null,
        findInstance: (name) => Instances.get(name) ?? null
    };
}

function animate() {
    requestAnimationFrame(animate);

    delta = clock.getDelta();
    dt = delta * 60;
	if (dt > 0.99) {
		dt = 0.99
	}

    if (playerHitboxMesh.position.y <= -90) {
       Health = 0
    }

    if (Health >= MaxHealth) {
       Health = MaxHealth
    }
    ratio = Health / MaxHealth
    percentage = ratio * 100
    fill.style.width = percentage + "%";

    setTimeout(() => {
        loadingScreen.classList.add('hidden');
    }, 1350);

    r = Math.floor((1.5 - ratio) * 255); -3
    g = Math.floor(ratio * 255); -3
    b = 25;

    fill.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;

    CheckHealth()

    GameScripts.runAll(buildScriptContext(clock.getElapsedTime()), clock.getElapsedTime());

    if (gltf && gltf.scene) {
        if (sitCooldown > 0) sitCooldown -= dt;

        if (Siting === true) {
            velocityY = 0;
        } else if (isClimbing === false) {
            velocityY += gravity * dt;
        } else if (isClimbing === true && Paused === false)  {
            velocityY = 0;
            if (keys.KeyW) {
                gltf.scene.position.y += dt * climbSpeed;
            } else if (keys.KeyS) {
                gltf.scene.position.y -= climbSpeed * dt;
            }
        }

        velocityY = Math.max(-terminalVelocity, Math.min(terminalVelocity, velocityY));

        gltf.scene.position.y += velocityY * dt;
        checkPartCollisions();

        // Coyote time + jump buffer resolution (timers count up).
        coyoteTimer += dt;
        jumpBufferTimer += dt;
        if (isGrounded) coyoteTimer = 0;

        if (jumpBufferTimer < JUMP_BUFFER_TIME && coyoteTimer < COYOTE_TIME && !isClimbing && !Siting) {
            velocityY = JumpPower;
            globalSound.play();
            jumpBufferTimer = 999; // consume it so it can't double-fire
            coyoteTimer = 999;
        }

        moveDirection.set(0, 0, 0);

        forwardX = Math.sin(theta);
        forwardZ = Math.cos(theta);
        rightX = Math.cos(theta);
        rightZ = -Math.sin(theta);

        if (keys.KeyW && Paused === false && Siting === false) { moveDirection.x += forwardX; moveDirection.z += forwardZ; }
        if (keys.KeyS && Paused === false && Siting === false) { moveDirection.x -= forwardX; moveDirection.z -= forwardZ; }
        if (keys.KeyA && Paused === false && Siting === false) { moveDirection.x += rightX;   moveDirection.z += rightZ; }
        if (keys.KeyD && Paused === false && Siting === false) { moveDirection.x -= rightX;   moveDirection.z -= rightZ; }

        // Sprint only applies while grounded and moving.
        isSprinting = keys.ShiftLeft && Paused === false && Siting === false && moveDirection.lengthSq() > 0.0001;

        if (Siftlock && Siting === false) {
            lockQuaternion.setFromAxisAngle(UP_AXIS, theta);
            gltf.scene.quaternion.slerp(lockQuaternion, frameIndependentLerp(ROTATION_SMOOTHING, dt));
        }

        if (moveDirection.lengthSq() > 0.0001 && !Siftlock && !isClimbing) {
             targetRotationY = Math.atan2(moveDirection.x, moveDirection.z);
             targetQuaternion.setFromAxisAngle(UP_AXIS, targetRotationY);
             gltf.scene.quaternion.slerp(targetQuaternion, frameIndependentLerp(ROTATION_SMOOTHING, dt));
        }

        if (moveDirection.lengthSq() > 0.0001) moveDirection.normalize();

        if (!isClimbing) {
            // Accelerate/decelerate instead of snapping to max speed.
            // WalkSpeed is negative (death sets it to 0, killing movement).
            const grounded = isGrounded;
            const accel = grounded ? groundAccel : airAccel;
            const friction = grounded ? groundFriction : airFriction;
            const groundSpeed = Math.abs(WalkSpeed) * (isSprinting ? sprintMultiplier : 1);

            let maxSpeed;
            if (grounded) {
                maxSpeed = groundSpeed;
            } else {
                const currentSpeed = Math.hypot(velocityX, velocityZ);
                maxSpeed = Math.max(groundSpeed * airMaxSpeedMultiplier, currentSpeed);
            }

            // WalkSpeed is negative, so wish direction is flipped.
            const wishX = -moveDirection.x;
            const wishZ = -moveDirection.z;

            const currentSpeedInWish = velocityX * wishX + velocityZ * wishZ;
            const addSpeed = maxSpeed - currentSpeedInWish;

            if (addSpeed > 0) {
                const accelAmount = Math.min(accel * dt * maxSpeed, addSpeed);
                velocityX += wishX * accelAmount;
                velocityZ += wishZ * accelAmount;
            }

            // Friction: strong on ground, weak in air (keeps jump momentum).
            const speed = Math.hypot(velocityX, velocityZ);
            if (speed > 0.0001) {
                const drop = speed * friction * dt;
                const scale = Math.max(0, speed - drop) / speed;
                velocityX *= scale;
                velocityZ *= scale;
            }

            // Hard cap: stops speed from building up past maxSpeed
            // when spinning fast (fixes flying off the map).
            const finalSpeed = Math.hypot(velocityX, velocityZ);
            if (finalSpeed > maxSpeed) {
                const clampScale = maxSpeed / finalSpeed;
                velocityX *= clampScale;
                velocityZ *= clampScale;
            }

            gltf.scene.position.x += velocityX * dt;
            gltf.scene.position.z += velocityZ * dt;
        } else {
            velocityX = 0;
            velocityZ = 0;
        }

        if (climbLaunchVelocity.lengthSq() > 0.0001) {
            gltf.scene.position.addScaledVector(climbLaunchVelocity, dt);
            const launchDamping = Math.max(0, 1 - CLIMB_LAUNCH_DAMPING * dt);
            climbLaunchVelocity.multiplyScalar(launchDamping);
            if (climbLaunchVelocity.lengthSq() < 0.0004) climbLaunchVelocity.set(1, 0, 0);
        }


        if (Siting) {
            if (currentState !== "sit") {
                fadeToAnimation('Sit');
                currentState = "sit";
            }
        } else if (!isGrounded) {
            if (currentState !== "jump" && velocityY >= 0) {
                fadeToAnimation('Jump');
                currentState = "jump";
            } else if (velocityY <= -0) {
                fadeToAnimation('Fall');
                currentState = "fall";
            }
        } else if (moveDirection.lengthSq() > 0.0001) {
            walkAnim = ItemHeld ? 'itemheld-walk' : "walk";
            if (currentState !== walkAnim) {
                fadeToAnimation(ItemHeld ? 'ItemHeld-Walk' : 'Walk');
                currentState = walkAnim;
            }
        } else {
            idleAnim = ItemHeld ? 'itemheld-idle' : "idle";
            if (currentState !== idleAnim) {
                fadeToAnimation(ItemHeld ? 'ItemHeld-Idle' : 'Idle');
                currentState = idleAnim;
            }
        }

        if (isClimbing) {
            if (currentState !== "climb") {
                fadeToAnimation("Climb");
                currentState = "climb";
            }
        }

        checkPartCollisions();
        stepDynamicParts(dt);

        target = playerHitboxMesh.position;

        cameraPivot.set(target.x, target.y + heightOffset, target.z);
        cameraDir.set(
            Math.sin(theta) * Math.cos(phi),
            Math.sin(phi),
            Math.cos(theta) * Math.cos(phi)
        );
        cameraRaycaster.set(cameraPivot, cameraDir);
        cameraRaycaster.near = 0;
        cameraRaycaster.far = distance;
        const cameraHits = cameraRaycaster.intersectObjects(collidableMeshes, false);
        const effectiveDistance = cameraHits.length > 0
            ? Math.max(FIRST_PERSON_DISTANCE, cameraHits[0].distance - CAMERA_COLLISION_BUFFER)
            : distance;

        camera.position.x = target.x + effectiveDistance * Math.sin(theta) * Math.cos(phi);
        camera.position.z = target.z + effectiveDistance * Math.cos(theta) * Math.cos(phi);

        const lookOffsetX = forwardX * 12;
        const lookOffsetZ = forwardZ * 12;

        const shadowCenterX = target.x + lookOffsetX;
        const shadowCenterZ = target.z + lookOffsetZ;

        sun.position.set(shadowCenterX + 20, target.y + 35, shadowCenterZ + 15);
        sun.target.position.set(shadowCenterX, target.y, shadowCenterZ);
       
        const firstPersonFade = THREE.MathUtils.clamp(
            (effectiveDistance - FIRST_PERSON_DISTANCE) / (FIRST_PERSON_FADE_START - FIRST_PERSON_DISTANCE),
            0, 1
        );
        for (let i = 0; i < characterMeshes.length; i++) {
            const meshPart = characterMeshes[i];
            meshPart.material.opacity = firstPersonFade;
            meshPart.visible = firstPersonFade > 0.01;
        }

        if (Siting === false) {
           camera.position.y = target.y + heightOffset + effectiveDistance * Math.sin(phi);
        }

        if (Siting === true) {
           camera.position.y = target.y + heightOffset + effectiveDistance * Math.sin(phi);
        }
        camera.lookAt(target.x, target.y + heightOffset, target.z);
    }

    if (mixer) {
        mixer.update(delta);
    }

    interpolateOtherPlayers(delta);
    sendMyPosition(clock.getElapsedTime());

    mapLights.forEach(light => light.updatePosition());

    renderer.render(scene, camera);
}

animate();
