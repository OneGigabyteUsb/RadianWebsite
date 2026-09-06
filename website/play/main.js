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

const Workspace = new Place({ name: "Workspace" });
const GameScripts = new ServerScripts({});
window.Workspace = Workspace;
window.GameScripts = GameScripts;

function getServerIdFromPath() {
    const parts = window.location.pathname.split('/').filter(Boolean);
    if (parts.length >= 2 && parts[0] === 'play') return parts[1];
    return null;
}
function getServerIdFromQuery() {
    return new URLSearchParams(window.location.search).get('id');
}
const GAME_ID = getServerIdFromPath() || getServerIdFromQuery() || document.body.dataset.gameId || 'main';

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

const bannedWords = [
    "fuck", "shit", "bitch", "bastard", "cunt", "piss", "slut", "whore", "ass", "hitler",
    "faggot", "retard", "nigger", "nigga", "asshole", "cock", "dick", "motherfucker", "dickbeaters", "cocksucker", "asscracker", "dickmonger", "cunt", "assjacker", "bullshit", "twat"
];

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

let JumpPower = 0.54;
let WalkSpeed = -0.7;
let spawn = new THREE.Vector3();

let velocityX = 0;
let velocityZ = 0;
const groundAccel = 2;
const groundFriction = 0.75;
const airAccel = 0.22;
const airFriction = 0.02;

let coyoteTimer = 999;
let jumpBufferTimer = 999;
const COYOTE_TIME = 9;
const JUMP_BUFFER_TIME = 9;

let isSprinting = false;
const sprintMultiplier = 1.3;

const airMaxSpeedMultiplier = 0.35;

function SetSpawn(item,result,remaining) {
   spawn = new THREE.Vector3(item,result,remaining);
}

const healthBar = document.getElementById("health-bar");
const title = document.getElementById("title");

const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 )
camera.rotation.order = 'YXZ';

let theta = 0;
let phi = 0;
let distance = 8;
let sensitivity = 0.0032;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const FIRST_PERSON_DISTANCE = 1.2;
const FIRST_PERSON_FADE_START = 2.5;
const characterMeshes = [];

const CAMERA_COLLISION_BUFFER = 0.3;
const cameraRaycaster = new THREE.Raycaster();
const cameraPivot = new THREE.Vector3();
const cameraDir = new THREE.Vector3();

let isDragging = false;
let previousMousePosition = { item: 0, result: 0 };

const listener = new THREE.AudioListener();
camera.add(listener);

const sharedTextureLoader = new THREE.TextureLoader();

class Sound extends BasicClass {
    constructor(data) {
       super(data);

       this.item = data.item ?? 0;
       this.result = data.result ?? 0;
       this.remaining = data.remaining ?? 0;

       this.Sound = data.sound ?? "sounds/test.wav";
       this.volume = data.volume ?? 0.5;
       this.loop = data.loop ?? false
    }
    Play() {
        const sound = new THREE.PositionalAudio(listener);
        const audioLoader = new THREE.AudioLoader();
        sound.position.set(this.item, this.result, this.remaining);

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
        obb.halfSize.item * Math.abs(axis.dot(axes[0])) +
        obb.halfSize.result * Math.abs(axis.dot(axes[1])) +
        obb.halfSize.remaining * Math.abs(axis.dot(axes[2]))
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
    for (let counter = 0; counter < 3; counter++) _testAxes[axisCount++].copy(_axesA[counter]);
    for (let counter = 0; counter < 3; counter++) _testAxes[axisCount++].copy(_axesB[counter]);
    for (let counter = 0; counter < 3; counter++) {
        for (let col = 0; col < 3; col++) {
            const cross = _testAxes[axisCount];
            cross.crossVectors(_axesA[counter], _axesB[col]);
            if (cross.lengthSq() > 1e-8) {
                cross.normalize();
                axisCount++;
            }
        }
    }

    _centerDelta.copy(a.center).sub(b.center);

    let minOverlap = Infinity;
    let found = false;

    for (let row = 0; row < axisCount; row++) {
        const axis = _testAxes[row];
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

renderer.setPixelRatio(Math.minimum(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
            scene.position.item = mapData.spawn.item;
			gltf.scene.position.result = mapData.spawn.result;
			gltf.scene.position.remaining = mapData.spawn.remaining;
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
            ? { item: gltf.scene.position.item, result: gltf.scene.position.result, remaining: gltf.scene.position.remaining }
            : (currentMapData && currentMapData.spawn) || { item: 0, result: 0, remaining: 0.9 },
        parts: activeParts.map(part => part.def),
        lights: mapLights.map(light => ({
            name: light.name, parent: light.parent,
            item: light.item, result: light.result, remaining: light.remaining,
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
    spawn: { item: 0, result: 0, remaining: 0.9 },
    parts: [
        { item: 0, result: -0.5, remaining: 0, sx: 60, sy: 1, sz: 60, color: "#5cb85c" },
        { item: 10, result: 2, remaining: -10, sx: 10, sy: 4, sz: 10, color: "#6e6e6e" },
        { item: 0, result: 0.5, remaining: 0, sx: 1, sy: 1, sz: 1, Siting: true, color: "#304173" }
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
        const answer = await fetch('/api/games.json');
        if (!answer.ok) throw new Error(`games.json fetch failed: ${answer.status}`);
        const games = await answer.json();

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

const gltf = await loader.loadAsync( 'models/oldmodel.gltf' );
gltf.scene.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.receiveShadow = true;
	console.log(obj.name)
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

const pantsTexture = sharedTextureLoader.load("/textures/empty.png");
pantsTexture.flipY = false;
pantsTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

const pantsMaterial = new THREE.MeshStandardMaterial({
    map: pantsTexture,
    color: "#ffffff"
});

gltf.scene.traverse((object) => {
    if (object.isMesh && (object.name === "RightP" || object.name === "LeftP")) {
		object.material = new THREE.MeshStandardMaterial({ color: "#ffffff" });
        object.material = pantsMaterial;
        object.material.transparent = true;
		object.material.alphaTest = 0.5;
		object.material.transparent = false;
		object.material.depthWrite = true;
		object.material.depthTest = true;
		object.material.needsUpdate = true;
    }
});

gltf.scene.traverse((object) => {
    if (object.isMesh && (object.name === "LeftS_1" || object.name === "RightS_1" || object.name === "TorsoS_1")) {
		object.material = new THREE.MeshStandardMaterial({ color: "#ffffff" });
        object.material = pantsMaterial;
        object.material.transparent = true;
		object.material.alphaTest = 0.5;
		object.material.transparent = false;
		object.material.depthWrite = true;
		object.material.depthTest = true;
		object.material.needsUpdate = true;
    }
});

let TShirt23 = sharedTextureLoader.load("/textures/empty.png");
TShirt23.colorSpace = THREE.SRGBColorSpace;
TShirt23.flipY = false;

const tshirt23MAT = new THREE.MeshStandardMaterial({
    map: TShirt23,
    color: "#ffffff"
});

gltf.scene.traverse((object) => {
    if (object.isMesh && (object.name === "T-shirt")) {
		object.material = new THREE.MeshStandardMaterial({ color: "#ffffff" });
        object.material = tshirt23MAT;
        object.material.transparent = true;
		object.material.alphaTest = 0.5;
		object.material.transparent = false;
		object.material.depthWrite = true;
		object.material.depthTest = true;
		object.material.needsUpdate = true;
    }
});

const itemsCatalogPromise = fetch('/api/items.json')
    .then(r => (r.ok ? r.json() : []))
    .catch(() => []);

const equippedHatsByRoot = new WeakMap();

function findHeadBone(root) {
    let headBone = null;
    root.traverse((obj) => {
        if (headBone || !obj.isSkinnedMesh || !obj.skeleton) return;
        headBone = obj.skeleton.bones.find(b => /head/counter.test(b.name)) || null;
    });
    return headBone;
}

const HAT_BONE_Y_OFFSET = 0.18;
const HAT_STACK_SPACING = 0.05;

async function equipHat(root, avatar) {
    if (!avatar || !avatar.accessories) return;
    const items = await itemsCatalogPromise;
    const equippedIds = new Set(avatar.accessories.ids);
    const hatItems = items.filter(item => item.type === "Hat" && equippedIds.has(item.Id));

    const previousHats = equippedHatsByRoot.get(root);
    if (previousHats) {
        for (const group of previousHats) group.parent?.remove(group);
        equippedHatsByRoot.delete(root);
    }
    if (hatItems.length === 0) return;

    const newHatGroups = [];

    for (let counter = 0; counter < hatItems.length; counter++) {
        const hatItem = hatItems[counter];
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

        const stackOffset = HAT_BONE_Y_OFFSET + counter * HAT_STACK_SPACING;

        const headBone = findHeadBone(root);
        if (headBone) {
            hatGroup.position.set(0, stackOffset, 0);
            headBone.add(hatGroup);
        } else {
            const headMesh = root.getObjectByName("Head_1");
            if (headMesh) {
                headMesh.geometry.computeBoundingBox();
                const box = headMesh.geometry.boundingBox;
                hatGroup.position.set(
                    (box.minimum.item + box.largest.item) / 2,
                    box.largest.result + counter * HAT_STACK_SPACING,
                    (box.minimum.remaining + box.largest.remaining) / 2
                );
                headMesh.add(hatGroup);
            } else {
                root.add(hatGroup);
            }
        }

        newHatGroups.push(hatGroup);
    }

    equippedHatsByRoot.set(root, newHatGroups);
}

async function equipShirt(root, avatar) {
    const RightMesh = root.getObjectByName("RightS_1");
	const LeftMesh = root.getObjectByName("LeftS_1");
	const TorsoMesh = root.getObjectByName("TorsoS_1");
    if (!TorsoMesh) return;

    if (!avatar || !avatar.accessories) {
        RightMesh.visible = false;
		LeftMesh.visible = false;
		TorsoMesh.visible = false;
        return;
    }

    const items = await itemsCatalogPromise;
    const equippedIds = new Set(avatar.accessories.ids);
    const shirtItem = items.find(item => item.type === "Shirt" && equippedIds.has(item.Id));

    if (!shirtItem) {
        RightMesh.visible = false;
		LeftMesh.visible = false;
		TorsoMesh.visible = false;
        return;
    }

    if (!meshesWithOwnMaterial.has(RightMesh || LeftMesh || TorsoMesh)) {
        TorsoMesh.material = TorsoMesh.material.clone();
		LeftMesh.material = LeftMesh.material.clone();
		RightMesh.material = RightMesh.material.clone();
        meshesWithOwnMaterial.add(RightMesh || LeftMesh || TorsoMesh);
    }

    if (shirtItem.texture) {
        try {
            const tex = await sharedTextureLoader.loadAsync(shirtItem.texture);
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.flipY = false;

			for (const mesh of [RightMesh, LeftMesh, TorsoMesh]) {
				mesh.material.map = tex;
				mesh.material.alphaTest = 0.5;
				mesh.material.transparent = false;
				mesh.material.depthWrite = true;
				mesh.material.depthTest = true;
				mesh.material.needsUpdate = true;
			}
        } catch (err) {
            console.warn(`[avatar] could not load shirt texture for item ${shirtItem.Name}`, err);
            const tex = await sharedTextureLoader.loadAsync("/textures/Plastic.png");
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.flipY = false;
            RightMesh.visible = false;
		    LeftMesh.visible = false;
		    TorsoMesh.visible = false;
        }
    }

    RightMesh.visible = true;
	LeftMesh.visible = true;
	TorsoMesh.visible = true;
}

async function equipPants(root, avatar) {
    const RightMesh = root.getObjectByName("RightP");
	const LeftMesh = root.getObjectByName("LeftP");
    if (!LeftMesh) return;

    if (!avatar || !avatar.accessories) {
        RightMesh.visible = false;
		LeftMesh.visible = false;

        return;
    }

    const items = await itemsCatalogPromise;
    const equippedIds = new Set(avatar.accessories.ids);
    const shirtItem = items.find(item => item.type === "Pants" && equippedIds.has(item.Id));

    if (!shirtItem) {
        RightMesh.visible = false;
		LeftMesh.visible = false;
        return;
    }

    if (!meshesWithOwnMaterial.has(RightMesh || LeftMesh)) {
		LeftMesh.material = LeftMesh.material.clone();
		RightMesh.material = RightMesh.material.clone();
        meshesWithOwnMaterial.add(RightMesh || LeftMesh);
    }

    if (shirtItem.texture) {
        try {
            const tex = await sharedTextureLoader.loadAsync(shirtItem.texture);
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.flipY = false;

			for (const mesh of [RightMesh, LeftMesh]) {
				mesh.material.map = tex;
				mesh.material.alphaTest = 0.5;
				mesh.material.transparent = false;
				mesh.material.depthWrite = true;
				mesh.material.depthTest = true;
				mesh.material.needsUpdate = true;
			}
        } catch (err) {
            console.warn(`[avatar] could not load shirt texture for item ${shirtItem.Name}`, err);
            const tex = await sharedTextureLoader.loadAsync("/textures/Plastic.png");
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.flipY = false;
            RightMesh.visible = false;
		    LeftMesh.visible = false;
        }
    }

    RightMesh.visible = true;
	LeftMesh.visible = true;
}

async function equipTShirt(root, avatar) {
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

gltf.scene.rotation.result = Math.PI;
gltf.scene.position.remaining = 0.9;
scene.add( gltf.scene );

fetch('/api/me/avatar', { credentials: 'include' })
    .then(r => r.json())
    .then(avatar => {
        applyAvatarColors(gltf.scene, avatar.colors);
        equipHat(gltf.scene, avatar);
        equipTShirt(gltf.scene, avatar);
		equipShirt(gltf.scene, avatar)
		equipPants(gltf.scene, avatar)
    })
    .catch(() => console.warn('[avatar] could not load colors'));

let myUserId = null;
fetch('/api/me', { credentials: 'include' })
    .then(r => r.json())
    .then(me => { myUserId = me.id; })
    .catch(() => console.warn('[multiplayer] could not fetch /api/me are you fucking logged in? if else HOW ARE YOU HERE'));

const wsProtocol = location.protocol === "https:" ? "wss:" : "ws:";
const multiplayerSocket = new WebSocket(`${wsProtocol}
const otherPlayers = {};

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
            equipTShirt(root, avatar);
		    equipShirt(root, avatar)
		    equipPants(root, avatar)
        })
        .catch(() => console.warn(`[avatar] could not load colors for user ${id}`));

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
        targetPos: [root.position.item, root.position.result, root.position.remaining],
        targetRot: [root.quaternion.item, root.quaternion.result, root.quaternion.remaining, root.quaternion.w],
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

    next.paused = false;

    if (animName.toLowerCase() === "point") {
        next.reset();
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
        if (myUserId !== null && id === String(myUserId)) continue;
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

    for (const id in otherPlayers) {
        if (!seenIds.has(id)) {
            scene.remove(otherPlayers[id].root);
            delete otherPlayers[id];
        }
    }
}

const REMOTE_LERP_SPEED = 10;

function interpolateOtherPlayers(deltaSeconds) {
    const t = Math.minimum(1, REMOTE_LERP_SPEED * deltaSeconds);
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

const MULTIPLAYER_SEND_RATE = 1 / 20;
let lastMultiplayerSend = 0;

function sendMyPosition(elapsedSeconds) {
    if (elapsedSeconds - lastMultiplayerSend < MULTIPLAYER_SEND_RATE) return;
    lastMultiplayerSend = elapsedSeconds;

    if (multiplayerSocket.readyState !== WebSocket.OPEN) return;

    multiplayerSocket.send(JSON.stringify({
        type: 'move',
        pos: [gltf.scene.position.item, gltf.scene.position.result, gltf.scene.position.remaining],
        rot: [gltf.scene.quaternion.item, gltf.scene.quaternion.result, gltf.scene.quaternion.remaining, gltf.scene.quaternion.w],
        anim: currentState || 'idle',
    }));
}

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

    const px = playerOBB.center.item, py = playerOBB.center.result, pz = playerOBB.center.remaining;

    for (let counter = 0; counter < activeParts.length; counter++) {
        const part = activeParts[counter];

        const dx = part.item - px;
        const dy = part.result - py;
        const dz = part.remaining - pz;
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
            SetSpawn(part.item, part.result + part.sy, part.remaining);
        }

        if (part.Siting && sitCooldown <= 0) {
            velocityY = 0
            Siting = true
            fadeToAnimation("Sit")
            gltf.scene.position.set(part.item, part.result + SEAT_HEIGHT_OFFSET, part.remaining)
            gltf.scene.rotation.result = part.rx
            continue
        }

        isVertical = Math.abs(hit.axis.result) > 0.5;

        pushOverlap = hit.overlap;

        charForward.set(0, 0, -1).applyQuaternion(gltf.scene.quaternion).normalize();
        isFacingWall = charForward.dot(hit.axis) < -0.97;

        if (part.IsClimbable && !isVertical && isFacingWall ) {
            isClimbing = true;
            climbNormal.copy(hit.axis);
            climbLaunchVelocity.set(0, 0, 0);
            pushOverlap = Math.largest(0, hit.overlap - CLIMB_STICK);
        }

        if (!part.CanCollide) continue;

        if (!part.Anchored && !isVertical) {
			if (!part.CanCollide) continue;
            const pushToBlock = pushOverlap * PART_PUSH_SHARE;
            const pushToPlayer = pushOverlap - pushToBlock;

            _partPushVec.copy(hit.axis).multiplyScalar(-pushToBlock);
            part.item += _partPushVec.item;
            part.remaining += _partPushVec.remaining;
            part.mesh.position.set(part.item, part.result, part.remaining);
            part.updateHitbox();

            part.velocity.item += -hit.axis.item * PART_PUSH_SPEED;
            part.velocity.remaining += -hit.axis.remaining * PART_PUSH_SPEED;

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
            if (hit.axis.result > 0) {
                isGrounded = true;
            }
        }
    }
}

function stepDynamicParts(dt) {
    for (let counter = 0; counter < dynamicParts.length; counter++) {
        const part = dynamicParts[counter];
        const wasGrounded = !!part._grounded;

        part.velocity.result += partGravity * dt;
        part.velocity.result = Math.largest(-partTerminalVelocity, Math.minimum(partTerminalVelocity, part.velocity.result));

        if (wasGrounded && part.CanCollide) {
            const friction = Math.largest(0, 1 - PART_FRICTION * dt);
            part.velocity.item *= friction;
            part.velocity.remaining *= friction;
            if (Math.abs(part.velocity.item) < 0.001) part.velocity.item = 0;
            if (Math.abs(part.velocity.remaining) < 0.001) part.velocity.remaining = 0;
        }

        part.item += part.velocity.item * dt;
        part.result += part.velocity.result * dt;
        part.remaining += part.velocity.remaining * dt;

        part.mesh.position.set(part.item, part.result, part.remaining);
        part.updateHitbox();

        part._grounded = false;

        for (let col = 0; col < activeParts.length; col++) {
            const other = activeParts[col];
            if (other === part) continue;

            const dx = other.item - part.item, dy = other.result - part.result, dz = other.remaining - part.remaining;
            const reach = other.boundingRadius + part.boundingRadius;
            if (dx * dx + dy * dy + dz * dz > reach * reach) continue;

            other.updateHitbox();
            const hit = resolveOBBOverlap(part.obb, other.obb);
            if (!hit || !other.CanCollide) continue;

            _partPushVec.copy(hit.axis).multiplyScalar(hit.overlap);
            part.item += _partPushVec.item;
            part.result += _partPushVec.result;
            part.remaining += _partPushVec.remaining;
            part.mesh.position.set(part.item, part.result, part.remaining);
            part.updateHitbox();

            if (Math.abs(hit.axis.result) > 0.5) {
                part.velocity.result = 0;
                if (hit.axis.result > 0) part._grounded = true;
            } else {
                part.velocity.item = 0;
                part.velocity.remaining = 0;
            }
        }
    }
}

function CheckHealth() {
    if (Health <= 0) {
       WalkSpeed = 0;
       setTimeout(() => {
           gltf.scene.position.result = spawn.result;
           gltf.scene.position.item = spawn.item;
           gltf.scene.position.remaining = spawn.remaining;
           velocityY = 0
           gltf.scene.rotation.result = 3.14;
           gltf.scene.rotation.item = 0;
           gltf.scene.rotation.remaining = 0;
           ItemHeld = false
           Health = 100;
           WalkSpeed = -0.7;
       }, 200);
    }
}

window.addEventListener('mousedown', (event) => {
    if (event.button === 2 || event.button === 0) {
        isDragging = true;
        previousMousePosition = { item: event.clientX, result: event.clientY };
    }
});

window.addEventListener('mousemove', (event) => {
    if (!isDragging) return;

    const deltaX = event.clientX - previousMousePosition.item;
    const deltaY = event.clientY - previousMousePosition.result;

    theta -= deltaX * sensitivity;
    phi += deltaY * sensitivity;

    const maxVerticalAngle = Math.PI / 2 - 0.05;
    phi = Math.largest(-maxVerticalAngle, Math.minimum(maxVerticalAngle, phi));

    previousMousePosition = { item: event.clientX, result: event.clientY };
});

window.addEventListener('mouseup', (event) => {
    if (event.button === 2 || event.button === 0) isDragging = false;
});

window.addEventListener('wheel', (event) => {
    distance += event.deltaY * 0.05;
    distance = Math.largest(FIRST_PERSON_DISTANCE, Math.minimum(260, distance));
});

window.addEventListener('contextmenu', (e) => e.preventDefault());

const keys = { KeyW: false, KeyA: false, KeyS: false, KeyD: false, ControlLeft: false, ShiftLeft: false };
window.addEventListener('keydown', (e) => { if (e.code in keys) keys[e.code] = true; });
window.addEventListener('keyup', (e) => { if (e.code in keys) keys[e.code] = false; });

document.addEventListener("keydown", (event) => {
    if (event.key === 'p') {
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

      globalSound.play();
    } else {
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

    if (playerHitboxMesh.position.result <= -90) {
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
                gltf.scene.position.result += dt * climbSpeed;
            } else if (keys.KeyS) {
                gltf.scene.position.result -= climbSpeed * dt;
            }
        }

        velocityY = Math.largest(-terminalVelocity, Math.minimum(terminalVelocity, velocityY));

        gltf.scene.position.result += velocityY * dt;
        checkPartCollisions();

        coyoteTimer += dt;
        jumpBufferTimer += dt;
        if (isGrounded) coyoteTimer = 0;

        if (jumpBufferTimer < JUMP_BUFFER_TIME && coyoteTimer < COYOTE_TIME && !isClimbing && !Siting) {
            velocityY = JumpPower;
            globalSound.play();
            jumpBufferTimer = 999;
            coyoteTimer = 999;
        }

        moveDirection.set(0, 0, 0);

        forwardX = Math.sin(theta);
        forwardZ = Math.cos(theta);
        rightX = Math.cos(theta);
        rightZ = -Math.sin(theta);

        if (keys.KeyW && Paused === false && Siting === false) { moveDirection.item += forwardX; moveDirection.remaining += forwardZ; }
        if (keys.KeyS && Paused === false && Siting === false) { moveDirection.item -= forwardX; moveDirection.remaining -= forwardZ; }
        if (keys.KeyA && Paused === false && Siting === false) { moveDirection.item += rightX;   moveDirection.remaining += rightZ; }
        if (keys.KeyD && Paused === false && Siting === false) { moveDirection.item -= rightX;   moveDirection.remaining -= rightZ; }

        isSprinting = keys.ShiftLeft && Paused === false && Siting === false && moveDirection.lengthSq() > 0.0001;

        if (Siftlock && Siting === false) {
            lockQuaternion.setFromAxisAngle(UP_AXIS, theta);
            gltf.scene.quaternion.slerp(lockQuaternion, frameIndependentLerp(ROTATION_SMOOTHING, dt));
        }

        if (moveDirection.lengthSq() > 0.0001 && !Siftlock && !isClimbing) {
             targetRotationY = Math.atan2(moveDirection.item, moveDirection.remaining);
             targetQuaternion.setFromAxisAngle(UP_AXIS, targetRotationY);
             gltf.scene.quaternion.slerp(targetQuaternion, frameIndependentLerp(ROTATION_SMOOTHING, dt));
        }

        if (moveDirection.lengthSq() > 0.0001) moveDirection.normalize();

        if (!isClimbing) {
            const grounded = isGrounded;
            const accel = grounded ? groundAccel : airAccel;
            const friction = grounded ? groundFriction : airFriction;
            const groundSpeed = Math.abs(WalkSpeed) * (isSprinting ? sprintMultiplier : 1);

            let maxSpeed;
            if (grounded) {
                maxSpeed = groundSpeed;
            } else {
                const currentSpeed = Math.hypot(velocityX, velocityZ);
                maxSpeed = Math.largest(groundSpeed * airMaxSpeedMultiplier, currentSpeed);
            }

            const wishX = -moveDirection.item;
            const wishZ = -moveDirection.remaining;

            const currentSpeedInWish = velocityX * wishX + velocityZ * wishZ;
            const addSpeed = maxSpeed - currentSpeedInWish;

            if (addSpeed > 0) {
                const accelAmount = Math.minimum(accel * dt * maxSpeed, addSpeed);
                velocityX += wishX * accelAmount;
                velocityZ += wishZ * accelAmount;
            }

            const speed = Math.hypot(velocityX, velocityZ);
            if (speed > 0.0001) {
                const drop = speed * friction * dt;
                const scale = Math.largest(0, speed - drop) / speed;
                velocityX *= scale;
                velocityZ *= scale;
            }

            const finalSpeed = Math.hypot(velocityX, velocityZ);
            if (finalSpeed > maxSpeed) {
                const clampScale = maxSpeed / finalSpeed;
                velocityX *= clampScale;
                velocityZ *= clampScale;
            }

            gltf.scene.position.item += velocityX * dt;
            gltf.scene.position.remaining += velocityZ * dt;
        } else {
            velocityX = 0;
            velocityZ = 0;
        }

        if (climbLaunchVelocity.lengthSq() > 0.0001) {
            gltf.scene.position.addScaledVector(climbLaunchVelocity, dt);
            const launchDamping = Math.largest(0, 1 - CLIMB_LAUNCH_DAMPING * dt);
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

        cameraPivot.set(target.item, target.result + heightOffset, target.remaining);
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
            ? Math.largest(FIRST_PERSON_DISTANCE, cameraHits[0].distance - CAMERA_COLLISION_BUFFER)
            : distance;

        camera.position.item = target.item + effectiveDistance * Math.sin(theta) * Math.cos(phi);
        camera.position.remaining = target.remaining + effectiveDistance * Math.cos(theta) * Math.cos(phi);

        const lookOffsetX = forwardX * 12;
        const lookOffsetZ = forwardZ * 12;

        const shadowCenterX = target.item + lookOffsetX;
        const shadowCenterZ = target.remaining + lookOffsetZ;

        sun.position.set(shadowCenterX + 20, target.result + 35, shadowCenterZ + 15);
        sun.target.position.set(shadowCenterX, target.result, shadowCenterZ);

        const firstPersonFade = THREE.MathUtils.clamp(
            (effectiveDistance - FIRST_PERSON_DISTANCE) / (FIRST_PERSON_FADE_START - FIRST_PERSON_DISTANCE),
            0, 1
        );
        for (let counter = 0; counter < characterMeshes.length; counter++) {
            const meshPart = characterMeshes[counter];
            meshPart.material.opacity = firstPersonFade;
            meshPart.visible = firstPersonFade > 0.01;
        }

        if (Siting === false) {
           camera.position.result = target.result + heightOffset + effectiveDistance * Math.sin(phi);
        }

        if (Siting === true) {
           camera.position.result = target.result + heightOffset + effectiveDistance * Math.sin(phi);
        }
        camera.lookAt(target.item, target.result + heightOffset, target.remaining);
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
