// lab/static/lab/js/lab2.js

let scene, camera, renderer;
let gear;
let orbitControls, transformControls;
let currentMode = 'object';
let history = [];
let currentStep = -1;
let gearParts = [];
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

    // Load the gear model
    loadGearModel();

    // Add OrbitControls
    orbitControls = new THREE.OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = true;
    orbitControls.dampingFactor = 0.05;
    orbitControls.enablePan = false;
    orbitControls.enableRotate = false;
    orbitControls.enableZoom = true;

    orbitControls.minDistance = 1; // Minimum zoom (closest distance)
    orbitControls.maxDistance = 50; // Maximum zoom (farthest distance)
    
    orbitControls.update();

    // Create room elements
    createRoom();

    // Add custom UI overlay
    const uiOverlay = createUIOverlay();
    canvasContainer.appendChild(uiOverlay);

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

function loadGearModel() {
    const loader = new THREE.GLTFLoader();
    loader.load(
        '/static/lab/models/Mercedes-Benz 190.glb',
        function(gltf) {
            gear = gltf.scene;
            gear.scale.set(2, 2, 2);
            gear.position.set(0, 1, 0);
            gear.castShadow = true;
            gear.receiveShadow = true;
            scene.add(gear);
            console.log('Gear model loaded successfully.');

            // Process the loaded model
            gear.traverse((child) => {
                if (child.isMesh) {
                    gearParts.push(child);
                    originalPositions.push(child.position.clone());
                }
            });

            // Initialize TransformControls after gear is loaded
            initTransformControls();

            // Initialize GUI after gear is loaded
            initGUI();

            // Save initial state
            saveState();

            // Update transform mode display
            updateTransformModeDisplay();
        },
        function(xhr) {
            console.log((xhr.loaded / xhr.total * 100) + '% loaded');
        },
        function(error) {
            console.error('An error occurred while loading the gear model', error);
        }
    );
}

function initTransformControls() {
    transformControls = new THREE.TransformControls(camera, renderer.domElement);
    scene.add(transformControls);
    transformControls.attach(gear);

    transformControls.addEventListener('dragging-changed', (event) => {
        orbitControls.enabled = !event.value;
    });

    // Enable snapping
    transformControls.setTranslationSnap(1);
    transformControls.setRotationSnap(THREE.MathUtils.degToRad(15));
    transformControls.setScaleSnap(0.1);

    console.log('TransformControls initialized and attached to gear.');
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
    gearParts.forEach((part, index) => {
        part.position.lerp(
            isExploded 
                ? part.position.clone().add(part.position.clone().sub(gear.position).normalize())
                : originalPositions[index],
            0.05
        );
    });

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
        { id: 'rotate-left', icon: '↺', action: () => { if (gear) gear.rotation.y += 0.5; } },
        { id: 'rotate-right', icon: '↻', action: () => { if (gear) gear.rotation.y -= 0.5; } },
        { id: 'zoom-in', icon: '🔍+', action: () => { camera.position.z -= 1; } },
        { id: 'zoom-out', icon: '🔍-', action: () => { camera.position.z += 1; } },
        { id: 'pan-left', icon: '⬅', action: () => { camera.position.x -= 1; } },
        { id: 'pan-right', icon: '➡', action: () => { camera.position.x += 1; } },
        { id: 'disintegrate', icon: '💥', action: toggleDisintegration } // Added disintegration button
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

function initGUI() {
    const gui = new dat.GUI();
    const gearFolder = gui.addFolder('Gear');
    gearFolder.add(gear.position, 'x', -10, 10);
    gearFolder.add(gear.position, 'y', -10, 10);
    gearFolder.add(gear.position, 'z', -10, 10);
    gearFolder.add(gear.rotation, 'x', 0, Math.PI * 2);
    gearFolder.add(gear.rotation, 'y', 0, Math.PI * 2);
    gearFolder.add(gear.rotation, 'z', 0, Math.PI * 2);
    gearFolder.open();
}

function saveState() {
    currentStep++;
    history = history.slice(0, currentStep);
    history.push(gear.clone());
}

function undo() {
    if (currentStep > 0) {
        currentStep--;
        scene.remove(gear);
        gear = history[currentStep].clone();
        scene.add(gear);
        transformControls.attach(gear);
    }
}

function redo() {
    if (currentStep < history.length - 1) {
        currentStep++;
        scene.remove(gear);
        gear = history[currentStep].clone();
        scene.add(gear);
        transformControls.attach(gear);
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

    gearParts.forEach((part, index) => {
        if (isExploded) {
            // Move parts away from center
            const direction = part.position.clone().sub(gear.position).normalize();
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