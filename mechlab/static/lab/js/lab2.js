// lab/static/lab/js/lab2.js

let scene, camera, renderer;
let model;
let orbitControls, transformControls;
let currentMode = 'object';
let history = [];
let currentStep = -1;
let modelParts = [];
let isExploded = false;
let originalPositions = [];

function init() {
    const canvasContainer = document.getElementById('canvas-container');

    // Set up the scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xa0a0a0);

    // Set up the camera
    camera = new THREE.PerspectiveCamera(75, canvasContainer.clientWidth / canvasContainer.clientHeight, 0.1, 1000);
    camera.position.set(0, 10, 15);
    camera.lookAt(0, 0, 0);

    // Set up the renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    canvasContainer.appendChild(renderer.domElement);

    // Add lighting
    addLighting();

    // Add helpers
    addHelpers();

    // Add ground plane
    addGroundPlane();

    // Add OrbitControls
    orbitControls = new THREE.OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = true;
    orbitControls.dampingFactor = 0.05;
    orbitControls.enablePan = false;
    orbitControls.enableRotate = true;
    orbitControls.enableZoom = true;
    orbitControls.update();

    // Create room elements
    createRoom();

    // Add custom UI overlay
    const uiOverlay = createUIOverlay();
    canvasContainer.appendChild(uiOverlay);

    // Add file input for model upload
    addModelUploadInput();

    // Handle window resize
    window.addEventListener('resize', onWindowResize, false);

    // Start the animation loop
    animate();
}

function addLighting() {
    const ambientLight = new THREE.AmbientLight(0x404040, 1);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 10, 5);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight2.position.set(-5, 10, -5);
    directionalLight2.castShadow = true;
    scene.add(directionalLight2);
}

function addHelpers() {
    const gridHelper = new THREE.GridHelper(20, 20);
    scene.add(gridHelper);
}

function addGroundPlane() {
    const planeGeometry = new THREE.PlaneGeometry(50, 50);
    const planeMaterial = new THREE.MeshStandardMaterial({ color: 0x808080, side: THREE.DoubleSide });
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = 0;
    plane.receiveShadow = true;
    scene.add(plane);
}

function loadModel(file) {
    const loader = new THREE.GLTFLoader();
    const reader = new FileReader();

    reader.onload = function(e) {
        loader.parse(e.target.result, '', function(gltf) {
            if (model) {
                scene.remove(model);
            }
            model = gltf.scene;
            model.scale.set(2, 2, 2);
            model.position.set(0, 1, 0);
            model.castShadow = true;
            model.receiveShadow = true;
            scene.add(model);
            console.log('Model loaded successfully.');

            // Reset modelParts and originalPositions
            modelParts = [];
            originalPositions = [];

            // Process the loaded model
            model.traverse((child) => {
                if (child.isMesh) {
                    modelParts.push(child);
                    originalPositions.push(child.position.clone());
                }
            });

            // If the model is a single mesh, create artificial parts
            if (modelParts.length === 1) {
                const mesh = modelParts[0];
                const geometry = mesh.geometry;
                const material = mesh.material;

                // Get the bounding box of the geometry
                geometry.computeBoundingBox();
                const box = geometry.boundingBox;

                // Calculate the center and dimensions of the bounding box
                const center = new THREE.Vector3();
                box.getCenter(center);
                const size = new THREE.Vector3();
                box.getSize(size);

                // Create 8 parts (cubes) at the corners of the bounding box
                for (let i = 0; i < 8; i++) {
                    const x = center.x + (i & 1 ? 0.5 : -0.5) * size.x;
                    const y = center.y + (i & 2 ? 0.5 : -0.5) * size.y;
                    const z = center.z + (i & 4 ? 0.5 : -0.5) * size.z;

                    const partGeometry = new THREE.BoxGeometry(size.x / 2, size.y / 2, size.z / 2);
                    const partMesh = new THREE.Mesh(partGeometry, material);
                    partMesh.position.set(x, y, z);
                    model.add(partMesh);
                    modelParts.push(partMesh);
                    originalPositions.push(partMesh.position.clone());
                }

                // Hide the original mesh
                mesh.visible = false;
            }

            // Initialize TransformControls after model is loaded
            initTransformControls();

            // Initialize GUI after model is loaded
            initGUI();

            // Save initial state
            saveState();

            // Update transform mode display
            updateTransformModeDisplay();
        }, function(error) {
            console.error('An error occurred while parsing the model', error);
        });
    };

    reader.readAsArrayBuffer(file);
}

function initTransformControls() {
    if (transformControls) {
        scene.remove(transformControls);
    }
    transformControls = new THREE.TransformControls(camera, renderer.domElement);
    scene.add(transformControls);
    transformControls.attach(model);

    transformControls.addEventListener('dragging-changed', (event) => {
        orbitControls.enabled = !event.value;
    });

    // Enable snapping
    transformControls.setTranslationSnap(1);
    transformControls.setRotationSnap(THREE.MathUtils.degToRad(15));
    transformControls.setScaleSnap(0.1);

    console.log('TransformControls initialized and attached to model.');
}

function createRoom() {
    // Floor
    const floorGeometry = new THREE.PlaneGeometry(20, 20);
    const floorMaterial = new THREE.MeshBasicMaterial({ color: 0x8B4513 });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    // Walls
    const wallMaterial = new THREE.MeshBasicMaterial({
        color: 0xcccccc // Light gray color for walls
    });

    const wallGeometry = new THREE.PlaneGeometry(20, 10);
    const wall1 = new THREE.Mesh(wallGeometry, wallMaterial);
    wall1.position.set(0, 5, -10);
    scene.add(wall1);

    const wall2 = wall1.clone();
    wall2.rotation.y = Math.PI / 2;
    wall2.position.set(-10, 5, 0);
    scene.add(wall2);

    const wall3 = wall1.clone();
    wall3.rotation.y = -Math.PI / 2;
    wall3.position.set(10, 5, 0);
    scene.add(wall3);

    // Ceiling
    const ceilingGeometry = new THREE.PlaneGeometry(20, 20);
    const ceilingMaterial = new THREE.MeshBasicMaterial({ color: 0xCD853F });
    const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = 10;
    scene.add(ceiling);
}

function animate() {
    requestAnimationFrame(animate);

    // Smooth transition for disintegration
    if (modelParts.length > 0) {
        modelParts.forEach((part, index) => {
            part.position.lerp(
                isExploded 
                    ? part.position.clone().add(part.position.clone().sub(model.position).normalize())
                    : originalPositions[index],
                0.05
            );
        });
    }

    orbitControls.update();
    renderer.render(scene, camera);
}

function onWindowResize() {
    const canvasContainer = document.getElementById('canvas-container');
    camera.aspect = canvasContainer.clientWidth / canvasContainer.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
}

function createUIOverlay() {
    const uiContainer = document.createElement('div');
    uiContainer.style.position = 'absolute';
    uiContainer.style.bottom = '20px';
    uiContainer.style.left = '50%';
    uiContainer.style.transform = 'translateX(-50%)';
    uiContainer.style.display = 'flex';
    uiContainer.style.gap = '10px';
    uiContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    uiContainer.style.padding = '10px';
    uiContainer.style.borderRadius = '10px';

    const controls = [
        { id: 'rotate-left', icon: '↺', action: () => { if (model) model.rotation.y += 0.5; } },
        { id: 'rotate-right', icon: '↻', action: () => { if (model) model.rotation.y -= 0.5; } },
        { id: 'zoom-in', icon: '🔍+', action: () => { camera.position.z -= 1; } },
        { id: 'zoom-out', icon: '🔍-', action: () => { camera.position.z += 1; } },
        { id: 'pan-left', icon: '⬅', action: () => { camera.position.x -= 1; } },
        { id: 'pan-right', icon: '➡', action: () => { camera.position.x += 1; } },
        { id: 'disintegrate', icon: '💥', action: toggleDisintegration }
    ];

    controls.forEach(control => {
        const button = document.createElement('button');
        button.id = control.id;
        button.textContent = control.icon;
        button.style.width = '40px';
        button.style.height = '40px';
        button.style.fontSize = '20px';
        button.style.backgroundColor = 'white';
        button.style.border = 'none';
        button.style.borderRadius = '5px';
        button.style.cursor = 'pointer';
        button.addEventListener('click', control.action);
        uiContainer.appendChild(button);
    });

    return uiContainer;
}

function addModelUploadInput() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.glb,.gltf';
    input.style.position = 'absolute';
    input.style.top = '10px';
    input.style.left = '10px';
    input.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            loadModel(file);
        }
    });
    document.body.appendChild(input);
}

function initGUI() {
    if (window.gui) {
        window.gui.destroy();
    }
    window.gui = new dat.GUI();
    const modelFolder = window.gui.addFolder('Model');
    modelFolder.add(model.position, 'x', -10, 10);
    modelFolder.add(model.position, 'y', -10, 10);
    modelFolder.add(model.position, 'z', -10, 10);
    modelFolder.add(model.rotation, 'x', 0, Math.PI * 2);
    modelFolder.add(model.rotation, 'y', 0, Math.PI * 2);
    modelFolder.add(model.rotation, 'z', 0, Math.PI * 2);
    modelFolder.open();
}

function saveState() {
    currentStep++;
    history = history.slice(0, currentStep);
    history.push(model.clone());
}

function undo() {
    if (currentStep > 0) {
        currentStep--;
        scene.remove(model);
        model = history[currentStep].clone();
        scene.add(model);
        transformControls.attach(model);
    }
}

function redo() {
    if (currentStep < history.length - 1) {
        currentStep++;
        scene.remove(model);
        model = history[currentStep].clone();
        scene.add(model);
        transformControls.attach(model);
    }
}

function toggleMode() {
    currentMode = currentMode === 'object' ? 'edit' : 'object';
    console.log(`Switched to ${currentMode} mode.`);
}

function updateTransformModeDisplay() {
    const modeDisplay = document.getElementById('transform-mode-display');
    if (modeDisplay && transformControls) {
        modeDisplay.textContent = `Transform Mode: ${transformControls.getMode()}`;
    }
}

function toggleDisintegration() {
    isExploded = !isExploded;
    const explosion_factor = 2; // Adjust this to control explosion intensity

    modelParts.forEach((part, index) => {
        if (isExploded) {
            // Move parts away from center
            const direction = part.position.clone().sub(model.position).normalize();
            part.position.add(direction.multiplyScalar(explosion_factor));
        } else {
            // Reset to original positions
            part.position.copy(originalPositions[index]);
        }
    });
}

window.addEventListener('keydown', (event) => {
    if (!transformControls) return;

    switch (event.key.toLowerCase()) {
        case 'g':
            transformControls.setMode('translate');
            updateTransformModeDisplay();
            console.log('TransformControls mode changed to: translate');
            break;
            case 'r':
                transformControls.setMode('rotate');
                updateTransformModeDisplay();
                console.log('TransformControls mode changed to: rotate');
                break;
            case 's':
                transformControls.setMode('scale');
                updateTransformModeDisplay();
                console.log('TransformControls mode changed to: scale');
                break;
            case 'z':
                if (event.ctrlKey) undo();
                break;
            case 'y':
                if (event.ctrlKey) redo();
                break;
            case 'tab':
                event.preventDefault();
                toggleMode();
                break;
        }
    });
    
    document.addEventListener('DOMContentLoaded', init);