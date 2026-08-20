import * as THREE from 'https://esm.sh/three@0.174.0';
import { OBB } from 'https://esm.sh/three@0.174.0/addons/math/OBB.js';

export const Instances = new Map();

function register(instance) {
    if (Instances.has(instance.name) && Instances.get(instance.name) !== instance) {
        console.warn(`[Classes] "${instance.name}" is already in use by another object. The old one is being overwritten in the registry and on window.${instance.name}. Give objects unique names to avoid this.`);
    }
    Instances.set(instance.name, instance);
    window[instance.name] = instance;
}

const nameCounters = new Map();
function uniqueName(prefix) {
    const n = (nameCounters.get(prefix) ?? 0) + 1;
    nameCounters.set(prefix, n);
    return `${prefix}_${n}`;
}

export class BasicClass {
    constructor({
       name = "",
       parent = ""
    } = {}) {
       this.name = name
       this.parent = parent
       this.children = []
    }

    _attachToParent() {
        const parentInstance = Instances.get(this.parent);
        if (parentInstance && Array.isArray(parentInstance.children)) {
            parentInstance.children.push(this);
        }
    }

    changeParent(newParentName) {
        const oldParentInstance = Instances.get(this.parent);
        if (oldParentInstance && Array.isArray(oldParentInstance.children)) {
            const idx = oldParentInstance.children.indexOf(this);
            if (idx !== -1) oldParentInstance.children.splice(idx, 1);
        }

        this.parent = newParentName;

        const newParentInstance = Instances.get(newParentName);
        if (newParentInstance && Array.isArray(newParentInstance.children)) {
            newParentInstance.children.push(this);
        }
    }

    findChild(name) {
        return this.children.find(child => child.name === name) ?? null;
    }
}

export class Place extends BasicClass {
    constructor(data = {}) {
        super(data);

       this.name = data.name ?? "Place";
       this.parent = "UGC";

       register(this);
    }
}

export class ServerScripts extends BasicClass {
    constructor(data = {}) {
        super(data);

       this.name = "ServerScripts";
       this.parent = "UGC";

       register(this);
    }

    runAll(context, time) {
        for (const child of this.children) {
            if (child instanceof Script) {
                child.run(context, time);
            }
        }
    }
}

export const MATERIALS = {
    plastic: "textures/Plastic.png",
    grass: "textures/Grass.png",
    wood: "textures/Wood.png",
    planks: "textures/Planks.png",
    stone: "textures/Stone.png",
    pebble: "textures/Pebble.png",
    brick: "textures/Brick.png",
    concrete: "textures/concrete.png"
};

export const activeParts = [];
export const dynamicParts = [];
export const collidableMeshes = [];

const sharedTextureLoader = new THREE.TextureLoader();
const textureCache = new Map();
const materialCache = new Map();
const geometryCache = new Map();
const TILE_SIZE = 2.5;

function getCachedTexture(url, repeatX, repeatZ) {
    const key = `${url}|${repeatX}|${repeatZ}`;
    let tex = textureCache.get(key);
    if (!tex) {
        tex = sharedTextureLoader.load(url);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(repeatX, repeatZ);
        textureCache.set(key, tex);
    }
    return tex;
}

function getCachedMaterial(key, factory) {
    let mat = materialCache.get(key);
    if (!mat) {
        mat = factory();
        materialCache.set(key, mat);
    }
    return mat;
}

export class Part extends BasicClass {
    constructor(data = {}) {
        super(data);

        this.name = data.name ?? uniqueName("Part");
        this.parent = data.parent ?? "Workspace";

        this.x = data.x ?? 0;
        this.y = data.y ?? 0;
        this.z = data.z ?? 0;

        this.sx = data.sx ?? 1;
        this.sy = data.sy ?? 1;
        this.sz = data.sz ?? 1;

        this.rx = data.rx ?? 0;
        this.ry = data.ry ?? 0;
        this.rz = data.rz ?? 0;

        this.color = data.color ?? "#ffffff";
        this.material = data.material ?? null;
        this.Transparency = data.Transparency ?? data.transparency ?? 1;

        this.killbrick = data.killbrick ?? false;
        this.CanCollide = data.CanCollide ?? false;
        this.isSpawnLocation = data.isSpawnLocation ?? false;
        this.IsClimbable = data.IsClimbable ?? false;
        this.Siting = data.Siting ?? false;
        this.Anchored = data.Anchored ?? true;

        this.velocity = new THREE.Vector3();
        this._grounded = false;

        this.def = {
            name: this.name,
            parent: this.parent,
            x: this.x,
            y: this.y,
            z: this.z,
            sx: this.sx,
            sy: this.sy,
            sz: this.sz,
            rx: this.rx,
            ry: this.ry,
            rz: this.rz,
            color: this.color,
            material: this.material,
            killbrick: this.killbrick,
            CanCollide: this.CanCollide,
            isSpawnLocation: this.isSpawnLocation,
            IsClimbable: this.IsClimbable,
            Siting: this.Siting,
            Anchored: this.Anchored,
            Transparency: this.Transparency
        };

        const texturePath = this.material && MATERIALS[this.material] ? MATERIALS[this.material] : null;

        const geomKey = `${this.sx}|${this.sy}|${this.sz}`;
        let geometry = geometryCache.get(geomKey);
        if (!geometry) {
            geometry = new THREE.BoxGeometry(this.sx, this.sy, this.sz);
            geometryCache.set(geomKey, geometry);
        }

        const repeatX = this.sx / TILE_SIZE;
        const repeatY = this.sy / TILE_SIZE;
        const repeatZ = this.sz / TILE_SIZE;

        let mat;
        if (texturePath) {
            const topTex = getCachedTexture(texturePath, repeatX, repeatZ);
            const topBottomMat = getCachedMaterial(`mat-tb|${this.color}|${texturePath}|${repeatX}|${repeatZ}`, () => new THREE.MeshStandardMaterial({
                color: this.color,
                map: topTex
            }));

            const sideTexX = getCachedTexture(texturePath, repeatZ, repeatY);
            const sideTexZ = getCachedTexture(texturePath, repeatX, repeatY);
            const sideMatX = getCachedMaterial(`mat-sideX|${this.color}|${texturePath}|${repeatZ}|${repeatY}`, () => new THREE.MeshStandardMaterial({
                color: this.color,
                map: sideTexX
            }));
            const sideMatZ = getCachedMaterial(`mat-sideZ|${this.color}|${texturePath}|${repeatX}|${repeatY}`, () => new THREE.MeshStandardMaterial({
                color: this.color,
                map: sideTexZ
            }));

            mat = [sideMatX, sideMatX, topBottomMat, topBottomMat, sideMatZ, sideMatZ];
        } else {
            mat = getCachedMaterial(`plain|${this.color}`, () => new THREE.MeshStandardMaterial({
                color: this.color
            }));
        }

        this.mesh = new THREE.Mesh(geometry, mat);
        this.mesh.position.set(this.x, this.y, this.z);
        this.mesh.rotation.set(this.rx, this.ry, this.rz);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;

        if (this.Transparency < 1) {
            this.mesh.material = Array.isArray(mat) ?
                mat.map(m => m.clone()) :
                mat.clone();

            const mats = Array.isArray(this.mesh.material) ?
                this.mesh.material : [this.mesh.material];

            mats.forEach(m => {
                m.transparent = true;
                m.opacity = this.Transparency;
                m.depthWrite = false;
            });
        }

        this.localOBB = new OBB(
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(this.sx / 2, this.sy / 2, this.sz / 2)
        );
        this.obb = this.localOBB.clone();

        this.boundingRadius = Math.sqrt((this.sx / 2) ** 2 + (this.sy / 2) ** 2 + (this.sz / 2) ** 2);

        activeParts.push(this);
        if (!this.Anchored) dynamicParts.push(this);
        if (!this.CanCollide) collidableMeshes.push(this.mesh);

        this._attachToParent();
        register(this);
    }

    addTo(targetScene) {
        targetScene.add(this.mesh);
    }

    removeFrom(targetScene) {
        targetScene.remove(this.mesh);

        let i = activeParts.indexOf(this);
        if (i !== -1) activeParts.splice(i, 1);

        i = dynamicParts.indexOf(this);
        if (i !== -1) dynamicParts.splice(i, 1);

        i = collidableMeshes.indexOf(this.mesh);
        if (i !== -1) collidableMeshes.splice(i, 1);

        const parentInstance = Instances.get(this.parent);
        if (parentInstance && Array.isArray(parentInstance.children)) {
            const idx = parentInstance.children.indexOf(this);
            if (idx !== -1) parentInstance.children.splice(idx, 1);
        }
    }

    updateHitbox() {
        this.mesh.updateMatrixWorld(true);
        this.obb.copy(this.localOBB);
        this.obb.applyMatrix4(this.mesh.matrixWorld);
    }
}

export class Script extends BasicClass {
    constructor(data = {}) {
        super(data);

        const scriptString = data.scriptString ?? "console.log('Hello World!')";
        this.name = data.name ?? uniqueName("Script");
        this.parent = data.parent ?? "ServerScripts";

        try {
            this.executeScript = new Function('context', 'time', scriptString);
        } catch (error) {
            console.error("Failed to compile script:", error);
            this.executeScript = null;
        }

        this._attachToParent();
        register(this);
    }

    run(context = this, time = 0) {
        if (this.executeScript) {
            try {
                this.executeScript(context, time);
            } catch (error) {
                console.error(`Runtime error in script "${this.name}":`, error);
            }
        }
    }
}

export class Frame extends BasicClass {
  constructor(data = {}) {
    super(data);
    this.name = data.name ?? uniqueName("Frame");

    this.color = data.color ?? "#ffffff"
    this.corner = data.corner ?? 0
    this.alpha = data.alpha ?? 1

    this.shadow = data.shadow ?? false

    this.borderSize = data.borderSize ?? 0
    this.borderColor = data.borderColor ?? "#cccccc"
    this.border = data.border ?? false

    this.gradiant = data.gradiant ?? false
    this.grad1 = data.grad1 ?? "#ffffff"
    this.grad2 = data.grad2 ?? "#000000"

    this.ScaleSize = data.ScaleSize ?? false

    this.backgroundColor = `${this.color}`;
    this.translate = data.translate ?? true

    this.element = document.createElement("div");
    this.element.style.opacity = this.alpha;
    this.element.style.position = "absolute";

    if (this.translate == true) {
      this.element.style.transform = 'translate(-50%, -50%)';
    }

    if (this.shadow == true) {
      this.element.style.boxShadow = '-8px 8px 13px 2px rgba(0,0,0,0.25)';
    }

    if (this.border == true) {
      this.element.style.border = `${this.borderSize}px solid ${this.borderColor}`;
    }

    if (this.gradiant == false) {
      this.element.style.backgroundColor = this.backgroundColor;
    } else {
      this.element.style.background = `linear-gradient(180deg,${this.grad1} 0%, ${this.grad2} 100%)`
    }
    this.element.style.pointerEvents = "auto";

    this.x = data.x ?? 0;
    this.y = data.y ?? 0;

    this.scaleX = data.scaleX ?? 0
    this.scaleY = data.scaleY ?? 0

    this.sx = data.sx ?? 100;
    this.sy = data.sy ?? 100;

    this.updateDimensions(data.x ?? 0, data.y ?? 0, data.sx ?? 200, data.sy ?? 100);

    this._attachToParent();
    register(this);
  }

  updateDimensions(x, y, width, height) {
    this.x = x ?? this.scaleX;
    this.y = y ?? this.scaleY;
    this.sx = width;
    this.sy = height;

    this.element.style.left = `${this.x}%`;
    this.element.style.borderRadius = `${this.corner}px`
    this.element.style.top = `${this.y}%`;
    if (this.ScaleSize == true) {
      this.element.style.width = `${this.sx}%`;
      this.element.style.height = `${this.sy}%`;
    } else {
      this.element.style.width = `${this.sx}px`;
      this.element.style.height = `${this.sy}px`;
    }
  }

  mount(parentHtmlElement) {
    parentHtmlElement.appendChild(this.element);
  }

  update() {
    this.element.style.backgroundColor = this.backgroundColor;
  }
}

export class PointLight extends BasicClass {
    constructor(data = {}) {
        super(data);

        this.name = data.name ?? uniqueName("PointLight");
        this.parent = data.parent ?? "Workspace";

        this.CastShadow = data.CastShadow ?? false;

        this.x = data.x ?? 0;
        this.y = data.y ?? 0;
        this.z = data.z ?? 0;

        this.intensity = data.intensity ?? 1;
        this.color = data.color ?? "#ffffff";

        this.light = new THREE.PointLight(this.color, this.intensity, 100);
        this.light.position.x = (this.x ?? 0) + (this.parent?.x ?? 0);
        this.light.position.y = (this.x ?? 0) + (this.parent?.y ?? 0);
        this.light.position.z = (this.x ?? 0) + (this.parent?.z ?? 0);
        this.light.castShadow = this.CastShadow ?? false;

        this._attachToParent();
        register(this);
    }

    addTo(targetScene) {
        targetScene.add(this.light);
    }

    removeFrom(targetScene) {
        targetScene.remove(this.light);
    }
}
