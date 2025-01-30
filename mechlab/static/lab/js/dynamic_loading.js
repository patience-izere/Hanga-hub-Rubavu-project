let scene, camera, renderer;
let models = []; // Array to store multiple models
let orbitControls, transformControls;
let currentMode = 'object';
let history = [];
let currentStep = -1;
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

    // Set up OrbitControls
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

    // Handle window resize
    window.addEventListener('resize', onWindowResize, false);

    // Fetch and load models from backend
    fetchModelsFromBackend();

    // Start the animation loop
    animate();
}

function fetchModelsFromBackend() {
    fetch('/api/models') // Replace with your actual backend API endpoint
        .then(response => response.json())
        .then(modelsData => {
            modelsData.forEach(modelData => {
                loadModelFromURL(modelData.url, modelData.id);
            });
        })
        .catch(error => console.error('Failed to fetch models from backend:', error));
}

function loadModelFromURL(url, modelId) {
    const loader = new THREE.GLTFLoader();
    
    loader.load(url, function(gltf) {
        const model = gltf.scene;
        model.scale.set(2, 2, 2);
        model.position.set(0, 1, 0);
        model.castShadow = true;
        model.receiveShadow = true;
        model.userData.id = modelId; // Assign an ID to the model for reference
        scene.add(model);
        models.push(model); // Add to the models array
        console.log(`Model ${modelId} loaded successfully from ${url}.`);

        // Save original positions for future manipulations
        const modelParts = [];
        model.traverse((child) => {
            if (child.isMesh) {
                modelParts.push(child);
                originalPositions.push(child.position.clone());
            }
        });

        // Initialize TransformControls for the new model
        initTransformControls(model);
    }, function(error) {
        console.error(`An error occurred while loading model from ${url}`, error);
    });
}

function initTransformControls(model) {
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

    console.log('TransformControls initialized and attached to the model.');
}

function animate() {
    requestAnimationFrame(animate);

    // Smooth transition for disintegration if needed
    if (models.length > 0 && isExploded) {
        models.forEach(model => {
            model.traverse((child) => {
                if (child.isMesh) {
                    const index = originalPositions.findIndex(pos => pos.equals(child.position));
                    if (index !== -1) {
                        child.position.lerp(
                            isExploded 
                                ? child.position.clone().add(child.position.clone().sub(model.position).normalize())
                                : originalPositions[index],
                            0.05
                        );
                    }
                }
            });
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

function toggleDisintegration() {
    isExploded = !isExploded;
}
