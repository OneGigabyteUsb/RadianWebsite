import * as THREE from 'https://esm.sh/three@0.174.0';


//========CLASSES========\\
export class BasicClass {
    constructor({
       name = "",
       parent = ""
    }) {
       this.name = name
       this.parent = parent
       this.children = []
    }
    
    changeParent(object) {
      this.parent = object
    }
}

export class Place extends BasicClass {
    constructor(data) {
        super(data);

       this.name = data.name ?? "Place";
       this.parent = "UGC";

       window[this.name] = this;
    }
}

export class ServerScripts extends BasicClass {
    constructor(data) {
        super(data);

       this.name = "ServerScripts";
       this.parent = "UGC";

       window[this.name] = this;
    }
}

export class Part extends BasicClass {
    constructor(data) {
        super(data);

       this.name = data.name ?? "Part";
       this.parent = data.parent ?? "Place";

       this.x = data.x ?? 0;
       this.y = data.y ?? 0;
       this.z = data.z ?? 0;

       this.sx = data.sx ?? 1;
       this.sy = data.sy ?? 1;
       this.sz = data.sz ?? 1;

       this.rx = data.rx ?? 0;
       this.ry = data.ry ?? 0;
       this.rz = data.rz ?? 0;

        const color = data.color ?? "#ffffff";
       
        let geometry = new THREE.BoxGeometry(this.sx, this.sy, this.sz);
        let mat = new THREE.MeshStandardMaterial({ color });

        this.mesh = new THREE.Mesh(geometry, mat);
        this.mesh.position.x = this.x
        this.mesh.position.y = this.y
        this.mesh.position.z = this.z

        this.mesh.rotation.x = this.rx
        this.mesh.rotation.y = this.ry
        this.mesh.rotation.z = this.rz

        this.mesh.castShadow = true
        this.mesh.receiveShadow = true
        window[this.name] = this;
    }
   
    addTo(targetScene) {
        targetScene.add(this.mesh);
    }

   removeFrom(targetScene) {
        targetScene.remove(this.mesh);
    }
}

export class Script extends BasicClass { 
    constructor(data) { 
        super(data); 
        
        const scriptString = data.scriptString ?? "console.log('Hello World!')"; 
        this.name = data.name ?? "Script";
        this.parent = data.parent ?? "ServerScripts";

        try {
            this.executeScript = new Function('context', 'time', scriptString);
        } catch (error) {
            console.error("Failed to compile script:", error);
            this.executeScript = null;
        }
    }

    run(context = this, time = 0) {
        if (this.executeScript) {
            try {
                this.executeScript(context, time);
            } catch (error) {
                console.error("Runtime error in script:", error);
            }
        }
    }
}


export class Frame extends BasicClass {
  constructor(data) {
    super(data);
    this.name = data.name ?? "Frame";

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
    window[this.name] = this;
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
    constructor(data) {
        super(data);

        this.name = data.name ?? "Point Light";
        this.parent = data.parent ?? "cube";

        this.CastShadow = data.CastShadow ?? false;

        this.x = data.x ?? 0;
        this.y = data.y ?? 0;
        this.z = data.z ?? 0;

        this.intensity = data.intensity ?? 1;

        this.color = data.color ?? "#ffffff"

        const color = data.color ?? "#ffffff";

        this.light = new THREE.PointLight( this.color, this.intensity, 100 );

        this.light.position.x = this.parent.x + this.x ?? this.x;
        this.light.position.y = this.parent.y + this.y ?? this.y;
        this.light.position.z = this.parent.z + this.z ?? this.z;

        this.light.castShadow = this.CastShadow ?? false;

        window[this.name] = this.light;
        scene.add(this.light);
    }

   remove() {
        scene.remove(this.light);
   }
}