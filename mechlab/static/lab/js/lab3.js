// lab/static/lab/js/lab2.js

let scene, camera, renderer;
let models = [];
let selectedModel = null;
let referenceModel = null;
let orbitControls, transformControls;
let currentMode = 'object';
let history = [];
let currentStep = -1;
let isExploded = false;
let originalPositions = new Map();

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

    // Add reference model upload input
    addReferenceModelUploadInput();

    // Handle window resize
    window.addEventListener('resize', onWindowResize, false);

    // Add click event listener for model selection
    renderer.domElement.addEventListener('click', onModelClick, false);

    // Start the animation loop
    animate();
}

// ... (keeping the existing helper functions like addLighting, addHelpers, addGroundPlane, createRoom)

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



function loadModel(file, isReference = false) {
    const loader = new THREE.GLTFLoader();
    const reader = new FileReader();

    reader.onload = function(e) {
        loader.parse(e.target.result, '', function(gltf) {
            const model = gltf.scene;
            model.scale.set(2, 2, 2);
            model.position.set(models.length * 5, 1, 0); // Position models side by side
            model.castShadow = true;
            model.receiveShadow = true;
            scene.add(model);
            console.log('Model loaded successfully.');

            if (isReference) {
                if (referenceModel) {
                    scene.remove(referenceModel);
                }
                referenceModel = model;
                referenceModel.visible = false; // Hide reference model
            } else {
                models.push(model);
                if (!selectedModel) {
                    selectModel(model);
                }
            }

            // Store original positions
            originalPositions.set(model, []);
            model.traverse((child) => {
                if (child.isMesh) {
                    originalPositions.get(model).push({mesh: child, position: child.position.clone()});
                }
            });

            // Initialize TransformControls if this is the first model
            if (models.length === 1) {
                initTransformControls();
            }

            // Initialize or update GUI
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

    transformControls.addEventListener('dragging-changed', (event) => {
        orbitControls.enabled = !event.value;
    });

    // Enable snapping
    transformControls.setTranslationSnap(1);
    transformControls.setRotationSnap(THREE.MathUtils.degToRad(15));
    transformControls.setScaleSnap(0.1);

    console.log('TransformControls initialized.');
}

function animate() {
    requestAnimationFrame(animate);

    // Smooth transition for disintegration
    models.forEach(model => {
        if (isExploded) {
            const modelParts = originalPositions.get(model);
            modelParts.forEach(part => {
                const direction = part.mesh.position.clone().sub(model.position).normalize();
                part.mesh.position.lerp(part.position.clone().add(direction.multiplyScalar(2)), 0.05);
            });
        } else {
            const modelParts = originalPositions.get(model);
            modelParts.forEach(part => {
                part.mesh.position.lerp(part.position, 0.05);
            });
        }
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
        { id: 'rotate-left', icon: '↺', action: () => { if (selectedModel) selectedModel.rotation.y += 0.5; } },
        { id: 'rotate-right', icon: '↻', action: () => { if (selectedModel) selectedModel.rotation.y -= 0.5; } },
        { id: 'zoom-in', icon: '🔍+', action: () => { camera.position.z -= 1; } },
        { id: 'zoom-out', icon: '🔍-', action: () => { camera.position.z += 1; } },
        { id: 'pan-left', icon: '⬅', action: () => { camera.position.x -= 1; } },
        { id: 'pan-right', icon: '➡', action: () => { camera.position.x += 1; } },
        { id: 'disintegrate', icon: '💥', action: toggleDisintegration },
        { id: 'check-assembly', icon: '✅', action: checkAssembly }
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
    input.multiple = true;
    input.style.position = 'absolute';
    input.style.top = '10px';
    input.style.left = '10px';
    input.addEventListener('change', (event) => {
        const files = event.target.files;
        for (let i = 0; i < files.length; i++) {
            loadModel(files[i]);
        }
    });
    document.body.appendChild(input);
}

function addReferenceModelUploadInput() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.glb,.gltf';
    input.style.position = 'absolute';
    input.style.top = '40px';
    input.style.left = '10px';
    input.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            loadModel(file, true);
        }
    });
    const label = document.createElement('label');
    label.textContent = 'Upload Reference Model: ';
    label.appendChild(input);
    document.body.appendChild(label);
}

function initGUI() {
    if (window.gui) {
        window.gui.destroy();
    }
    window.gui = new dat.GUI();
    const modelFolder = window.gui.addFolder('Selected Model');
    if (selectedModel) {
        modelFolder.add(selectedModel.position, 'x', -10, 10);
        modelFolder.add(selectedModel.position, 'y', -10, 10);
        modelFolder.add(selectedModel.position, 'z', -10, 10);
        modelFolder.add(selectedModel.rotation, 'x', 0, Math.PI * 2);
        modelFolder.add(selectedModel.rotation, 'y', 0, Math.PI * 2);
        modelFolder.add(selectedModel.rotation, 'z', 0, Math.PI * 2);
    }
    modelFolder.open();
}

function saveState() {
    currentStep++;
    history = history.slice(0, currentStep);
    history.push(models.map(model => model.clone()));
}

function undo() {
    if (currentStep > 0) {
        currentStep--;
        restoreState(history[currentStep]);
    }
}

function redo() {
    if (currentStep < history.length - 1) {
        currentStep++;
        restoreState(history[currentStep]);
    }
}

function restoreState(state) {
    models.forEach(model => scene.remove(model));
    models = state.map(model => {
        scene.add(model);
        return model;
    });
    selectModel(models[0]);
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
}

function onModelClick(event) {
    const mouse = new THREE.Vector2();
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObjects(models, true);

    if (intersects.length > 0) {
        let selectedObject = intersects[0].object;
        while(selectedObject.parent && !models.includes(selectedObject)) {
            selectedObject = selectedObject.parent;
        }
        if (models.includes(selectedObject)) {
            selectModel(selectedObject);
        }
    }
}

function selectModel(model) {
    selectedModel = model;
    transformControls.attach(model);
    initGUI();
}

function checkAssembly() {
    if (!referenceModel || models.length === 0) {
        console.log("Reference model or assembled models are missing.");
        return;
    }

    let totalError = 0;
    let partCount = 0;

    models.forEach(model => {
        const modelParts = originalPositions.get(model);
        modelParts.forEach(part => {
            const referencePos = findCorrespondingPartPosition(part.mesh, referenceModel);
            if (referencePos) {
                const distance = part.mesh.position.distanceTo(referencePos);
                totalError += distance;
                partCount++;
            }
        });
    });

    const averageError = totalError / partCount;
    const threshold = 0.5; // Adjust this value based on your requirements

    if (averageError < threshold) {
        console.log("Assembly successful! Average error: " + averageError);
    } else {
        console.log("Assembly needs improvement. Average error: " + averageError);
    }
}

function findCorrespondingPartPosition(partMesh, referenceModel) {
    let closestDistance = Infinity;
    let closestPosition = null;

    referenceModel.traverse((child) => {
        if (child.isMesh && child.geometry.type === partMesh.geometry.type) {
            const distance = child.position.distanceTo(partMesh.position);
            if (distance < closestDistance) {
                closestDistance = distance;
                closestPosition = child.position;
            }
        }
    });

    return closestPosition;
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