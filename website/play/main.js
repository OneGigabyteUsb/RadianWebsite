import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x01A2DF);

let velocityY = 0;
const gravity = -0.03;
const groundY = 0;
let Siftlock = false
let Health = 100
let MaxHealth = 100
let ItemHeld = false

let JumpPower = 0.55;
let WalkSpeed = -0.18;
let spawn = new THREE.Vector3();

const healthBar = document.getElementById("health-bar");
const title = document.getElementById("title");

const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 )
camera.rotation.order = 'YXZ';
window.camera = camera

let theta = 0;
let phi = 0;
let distance = 8;
const sensitivity = 0.007;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));


let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };

const listener = new THREE.AudioListener();
camera.add(listener);

const activeParts = [];

class CreatePart {
    constructor({
        x = 0, y = 0, z = 0,
        sx = 1, sy = 1, sz = 1,
        rx = 0, ry = 0, rz = 0,
        color = "#ffffff",
        topTexture = "texture.png",
        bottomTexture = "texture2.png",
        killbrick = false,
        name = "part"
    } = {}) {
        this.killbrick = killbrick;
        const geometry = new THREE.BoxGeometry(sx, sy, sz);
        let sideMat = new THREE.MeshStandardMaterial({ color });
        let topMat = sideMat;
        let bottomMat = sideMat;

        if (topTexture) {
            const tex = new THREE.TextureLoader().load(topTexture);
            const tex2 = new THREE.TextureLoader().load(bottomTexture);

            [tex, tex2].forEach(t => {
                t.colorSpace = THREE.SRGBColorSpace;
                t.wrapS = THREE.RepeatWrapping;
                t.wrapT = THREE.RepeatWrapping;
            });

            tex.repeat.set(sx / 2.5, sz / 2.5);
            tex2.repeat.set(sx / 2.5, sz / 2.5);

            //---Load Mesh With Texture Bro---\\

            topMat = new THREE.MeshStandardMaterial({ color, map: tex });
            bottomMat = new THREE.MeshStandardMaterial({ color, map: tex2 });
            sideMat = new THREE.MeshStandardMaterial({ color });
        }

        const materials = [sideMat, sideMat, topMat, bottomMat, sideMat, sideMat];
        this.mesh = new THREE.Mesh(geometry, materials);
        this.mesh.position.set(x, y, z);
        this.mesh.rotation.set(0, 0, 0);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;

        this.boundingBox = new THREE.Box3();
        this.updateHitbox();

        activeParts.push(this);
    }

    addTo(targetScene) {
        targetScene.add(this.mesh);
    }

    updateHitbox() {
        this.boundingBox.setFromObject(this.mesh); 
    }
}

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setSize(window.innerWidth, window.innerHeight)
document.body.appendChild(renderer.domElement)

let modelReady = false;   // flips true once the gltf character has loaded
let pendingSpawn = null;  // a spawn point waiting for the model to be ready
let currentMapData = null;
let SpawnLocation = new THREE.Vector3();

function clearMap() {
    activeParts.forEach(part => scene.remove(part.mesh));
    activeParts.length = 0;
}

function loadMap(mapData) {
    clearMap();
 
    (mapData.parts || []).forEach(partDef => {
        const part = new CreatePart(partDef);
        part.addTo(scene);
    });
 
    currentMapData = mapData;
 
    if (mapData.spawn) {
        if (modelReady === true) {
            Health = 0;
            velocityY = 0;
        } else {
            pendingSpawn = mapData.spawn;
        }
    }
    SpawnLocation.x = mapData.spawn.x;
    SpawnLocation.y = mapData.spawn.y;
    SpawnLocation.z = mapData.spawn.z;
}

async function loadMapFromURL(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to load map "${url}": ${response.status}`);
    const mapData = await response.json();
    loadMap(mapData);
    return mapData;
}

window.loadMap = loadMap;
window.CreatePart = new CreatePart
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
        parts: activeParts.map(part => part.def)
    };
}

const loader = new GLTFLoader();
const controls = new OrbitControls(camera, renderer.domElement)

const ambientLight = new THREE.AmbientLight( 0x616161 );
scene.add(ambientLight)

const defaultMap = {
    name: "Default",
    spawn: { x: 0, y: 0, z: 0.9 },
    parts: [
        { x: 0, y: -0.5, z: 0, sx: 60, sy: 1, sz: 60, color: "#5cb85c" },
        { x: 10, y: 2, z: -10, sx: 10, sy: 4, sz: 10, color: "#6e6e6e" },
        { x: 0, y: 0.5, z: 0, sx: 1, sy: 1, sz: 1, color: "#304173" }
    ]
};

window.defaultMap = defaultMap;
window.loadMapFromURL = loadMapFromURL;
window.clearMap = clearMap;
loadMap(defaultMap);


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

const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x1a1a1a, 0.9);
scene.add(hemi);

const directionalLight = new THREE.DirectionalLight( 0xcfcfcf, 2.5 );
directionalLight.castShadow = true;
directionalLight.position.set(30, 40, 30); 
directionalLight.shadow.mapSize.set(6096, 6096);

const d = 150; 
directionalLight.shadow.camera.left = -d;
directionalLight.shadow.camera.right = d;
directionalLight.shadow.camera.top = d;
directionalLight.shadow.camera.bottom = -d;
directionalLight.shadow.camera.near = 0.1;
directionalLight.shadow.camera.far = 1000;
scene.add(directionalLight);

let mixer = null;
let animationsMap = {};
let currentAction = null;
let currentState = "";
let lockedAnimation = false;
let isGrounded = true;

let faceTexture = new THREE.TextureLoader().load("faces/default.png");
faceTexture.colorSpace = THREE.SRGBColorSpace;
faceTexture.flipY = false;

let TShirt = new THREE.TextureLoader().load("t-shirts/Hoodie.png");
TShirt.colorSpace = THREE.SRGBColorSpace;
TShirt.flipY = false;

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
        obj.material = new THREE.MeshStandardMaterial({ map: TShirt, transparent: true });
        obj.receiveShadow = true;
        obj.castShadow = false;
    }
});

//---Sounds---\\\

const globalSound = new THREE.Audio(listener);

const audioLoader = new THREE.AudioLoader();
audioLoader.load('sound/action_jump.wav', function(buffer) {
    globalSound.setBuffer(buffer);
    globalSound.setLoop(false);
    globalSound.setVolume(0.5);
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
        animationsMap[clip.name.toLowerCase()] = mixer.clipAction(clip);
    });

    if (animationsMap['idle']) {
        currentAction = animationsMap['idle'];
        currentAction.play();
    }
}

//---Thingy---\\\

gltf.scene.rotation.y = Math.PI;
gltf.scene.position.z = 0.9;
scene.add( gltf.scene );

//---HitBoxs---\\\
const hitboxHeight = 3;
const hitboxGeo = new THREE.BoxGeometry(1.3, hitboxHeight, 0.6);

let hitboxMat = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true, visible: true });
const playerHitboxMesh = new THREE.Mesh(hitboxGeo, hitboxMat);
hitboxGeo.translate(0, hitboxHeight / 2, 0); 
scene.add(playerHitboxMesh);

const playerBox = new THREE.Box3();

function checkPartCollisions() {
    playerHitboxMesh.position.copy(gltf.scene.position);
    playerHitboxMesh.rotation.copy(gltf.scene.rotation);
    playerBox.setFromObject(playerHitboxMesh); 

    isGrounded = false;

    for (let i = 0; i < activeParts.length; i++) {
        const part = activeParts[i];
        if (!part.boundingBox) continue;

        if (playerBox.intersectsBox(part.boundingBox)) {
            // Calculate current axis penetrations

            if (part.killbrick) {
                Health = 0;
                continue;
            }
            
            const overlapX = Math.min(playerBox.max.x, part.boundingBox.max.x) - Math.max(playerBox.min.x, part.boundingBox.min.x);
            const overlapY = Math.min(playerBox.max.y, part.boundingBox.max.y) - Math.max(playerBox.min.y, part.boundingBox.min.y);
            const overlapZ = Math.min(playerBox.max.z, part.boundingBox.max.z) - Math.max(playerBox.min.z, part.boundingBox.min.z);

            if (overlapY < overlapX && overlapY < overlapZ) {
                const distFromTop = part.boundingBox.max.y - playerBox.min.y;
                const distFromBottom = playerBox.max.y - part.boundingBox.min.y;

                if (distFromTop <= distFromBottom) {
                    gltf.scene.position.y = part.boundingBox.max.y + 0.001;
                    isGrounded = true;
                } else {
                    // Hit ceiling from below
                    gltf.scene.position.y = part.boundingBox.min.y - hitboxHeight - 0.001;
                }
                velocityY = 0;

                playerHitboxMesh.position.copy(gltf.scene.position);
                playerBox.setFromObject(playerHitboxMesh);
            } 
            else if (overlapX < overlapZ) {
                const dirX = gltf.scene.position.x > part.mesh.position.x ? 1 : -1;
                gltf.scene.position.x += overlapX * dirX;
                
                playerHitboxMesh.position.copy(gltf.scene.position);
                playerBox.setFromObject(playerHitboxMesh);
            } 
            else {
                const dirZ = gltf.scene.position.z > part.mesh.position.z ? 1 : -1;
                gltf.scene.position.z += overlapZ * dirZ;
                
                // Recalculate box boundary immediately
                playerHitboxMesh.position.copy(gltf.scene.position);
                playerBox.setFromObject(playerHitboxMesh);
            }
        }
    }
}


//---Mouse and Keyborad---\\\
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
    distance = Math.max(3, Math.min(260, distance));
});

window.addEventListener('contextmenu', (e) => e.preventDefault());

const keys = { KeyW: false, KeyA: false, KeyS: false, KeyD: false };
window.addEventListener('keydown', (e) => { if (e.code in keys) keys[e.code] = true; });
window.addEventListener('keyup', (e) => { if (e.code in keys) keys[e.code] = false; });

document.addEventListener("keydown", (event) => {
    if (event.key === 'p') {
        fadeToAnimation('Point');
    }
    if (event.key === 'y') {
        TShirt = new THREE.TextureLoader().load("faces/default.png");
        TShirt.flipY = false;
        gltf.scene.traverse((obj) => {
            if (obj.isMesh && obj.name === "T-shirt") {
                obj.material.map = TShirt;
                obj.material.needsUpdate = true;
            }
        });
    }
});

document.addEventListener('keydown', (event) => {
  if (event.code === "Space") {
    if (velocityY === 0) {
      velocityY = JumpPower; 
      globalSound.play();
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
  if (event.shiftKey) {
     if (Siftlock === true) {
         Siftlock = false
     } else {
         Siftlock = true
     }
   console.log(Siftlock)
  }
});

//---Animation---\\\

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

window.gltf = gltf;
window.ItemHeld = ItemHeld;
window.fadeToAnimation = fadeToAnimation

const clock = new THREE.Clock();
const moveDirection = new THREE.Vector3();

camera.position.set(0, 3.5, 12);

console.log("Loaded clips:", gltf.animations.map(a => a.name));

function animate() {
    requestAnimationFrame(animate);
    const ratio = Health / MaxHealth;
    const percentage = ratio * 100;
    // healthBar.style.width = percentage + 1 + "%";

    const red = Math.floor((1.5 - ratio) * 255);
    const green = Math.floor(ratio * 255);
    const blue = 25;

    // healthBar.style.backgroundColor = `rgb(${red}, ${green}, ${blue})`;

    if (playerHitboxMesh.position.y <= -100) {
       Health = 0;
    }

    if (Health <= 0) {
       fadeToAnimation("Idle")
       WalkSpeed = 0;
       setTimeout(() => {
           gltf.scene.position.y = SpawnLocation.x;
           gltf.scene.position.x = SpawnLocation.y;
           gltf.scene.position.z = SpawnLocation.z;
           gltf.scene.rotation.y = 3.14;
           velocityY = 0;
           gltf.scene.rotation.x = 0;
           gltf.scene.rotation.z = 0;
           ItemHeld = false
           Health = 100;
           WalkSpeed = -0.18;
       }, 750);
    }

    if (gltf && gltf.scene) {
        // 1. Calculate & Apply Vertical Movement (Gravity)
        velocityY += gravity;
        gltf.scene.position.y += velocityY;

        // Ground floor constraint fallback
        //if (gltf.scene.position.y <= groundY) {
            //gltf.scene.position.y = groundY;
            //velocityY = 0;
        //}

        // 2. Calculate & Apply Horizontal Keyboard Movement
        moveDirection.set(0, 0, 0);

        const forwardX = Math.sin(theta);
        const forwardZ = Math.cos(theta);
        const rightX = Math.cos(theta);
        const rightZ = -Math.sin(theta);

        activeParts.forEach(part => part.updateHitbox());

        if (keys.KeyW) { moveDirection.x += forwardX; moveDirection.z += forwardZ; }
        if (keys.KeyS) { moveDirection.x -= forwardX; moveDirection.z -= forwardZ; }
        if (keys.KeyA) { moveDirection.x += rightX;   moveDirection.z += rightZ; }
        if (keys.KeyD) { moveDirection.x -= rightX;   moveDirection.z -= rightZ; }

        if (Siftlock) {
            const lockQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), theta);
            gltf.scene.quaternion.slerp(lockQuaternion, 0.15);
        }

        if (moveDirection.lengthSq() > 0.0001) {
            moveDirection.normalize();

            if (!Siftlock) {
                const targetRotationY = Math.atan2(moveDirection.x, moveDirection.z);
                const targetQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), targetRotationY);
                gltf.scene.quaternion.slerp(targetQuaternion, 0.15);
            }
            gltf.scene.position.addScaledVector(moveDirection, WalkSpeed + 0.0001);
        }

        if (!isGrounded) {
            if (currentState !== "jump") {
                fadeToAnimation('Jump');
                currentState = "jump";
            }
        } else if (moveDirection.lengthSq() > 0.0001) {
            const walkAnim = ItemHeld ? 'itemheld-walk' : "walk";
            if (currentState !== walkAnim) {
                fadeToAnimation(ItemHeld ? 'IdleHeld-Walk' : 'Walk');
                currentState = walkAnim;
            }
        } else {
            const idleAnim = ItemHeld ? 'itemheld-idle' : "idle";
            if (currentState !== idleAnim) {
                fadeToAnimation(ItemHeld ? 'ItemHeld-Idle' : 'Idle');
                currentState = idleAnim;
            }
        }

        // 3. Resolve ALL Collisions (Horizontal and Vertical) BEFORE the camera updates
        checkPartCollisions();

        // 4. Update Camera View Matrix (now using the clean, non-clipped position)
        const target = playerHitboxMesh.position;
        const heightOffset = 2.5;
        camera.position.x = target.x + distance * Math.sin(theta) * Math.cos(phi);
        camera.position.z = target.z + distance * Math.cos(theta) * Math.cos(phi);
        camera.position.y = target.y + heightOffset + distance * Math.sin(phi);
        camera.lookAt(target.x, target.y + heightOffset, target.z);
    }

    // 5. Update animations and render the clean frame
    if (mixer) {
        mixer.update(clock.getDelta());
    }
    window.addEventListener('resize', () => {
       camera.aspect = window.innerWidth / window.innerHeight;
       camera.updateProjectionMatrix();
       renderer.setSize(window.innerWidth, window.innerHeight);
    });

    renderer.render(scene, camera);
}

animate();
