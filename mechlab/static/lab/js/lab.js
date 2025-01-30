// lab/static/lab/js/lab.js

let scene, camera, renderer;
let tables = [], toolbox, lamps = [];
let gear;
let controls;
let orbitControls;
let transformControls;

// Initialize the scene
function init() {
    const canvasContainer = document.getElementById('canvas-container');

    // Set up the scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xa0a0a0);  // Gray background for better contrast

    // Set up the camera
    camera = new THREE.PerspectiveCamera(75, 
        canvasContainer.clientWidth / canvasContainer.clientHeight, 
        0.1, 1000);
    camera.position.set(0, 10, 15);  // Positioned higher and slightly farther back
    camera.lookAt(0, 0, 0);  // Camera looks towards the center of the scene

    // Set up the renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    canvasContainer.appendChild(renderer.domElement);  // Attach the canvas to the div

    // Add lighting to the scene
    const ambientLight = new THREE.AmbientLight(0x404040, 1);  // Ambient light
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 10, 5);  // Simulate overhead light
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight2.position.set(-5, 10, -5);
    directionalLight2.castShadow = true;
    scene.add(directionalLight2);

    // Add helpers for debugging
    const axesHelper = new THREE.AxesHelper(5);
    //scene.add(axesHelper);

    const gridHelper = new THREE.GridHelper(20, 20);
    scene.add(gridHelper);

    // Add a ground plane for better visibility
    const planeGeometry = new THREE.PlaneGeometry(50, 50);
    const planeMaterial = new THREE.MeshStandardMaterial({ color: 0x808080, side: THREE.DoubleSide });
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = 0;
    plane.receiveShadow = true;
    scene.add(plane);

    // Add a toolbox
    //createToolbox(0, 0.5);

    // Load the gear model
    loadGearModel();

    // Add OrbitControls for easier navigation
    orbitControls = new THREE.OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = true; // For smoother controls
    orbitControls.dampingFactor = 0.05;
    orbitControls.enablePan = false; // Disable panning
    orbitControls.enableRotate = false; // Disable orbiting rotation
    orbitControls.enableZoom = true; // Enable zooming
    orbitControls.update();

// ==========================================================================================
    //    new Selection
    //    =============

    // Initialize TransformControls


transformControls = new THREE.TransformControls(camera, renderer.domElement);
scene.add(transformControls);
transformControls.attach(gear); // Attach the control to the gear

// Event listener for keyboard controls (G for move, R for rotate, S for scale)
window.addEventListener('keydown', (event) => {
  switch (event.key) {
    case 'g':
      transformControls.setMode('translate');
      break;
    case 'r':
      transformControls.setMode('rotate');
      break;
    case 's':
      transformControls.setMode('scale');
      break;
  }
});

// Update orbit controls based on transform control state
transformControls.addEventListener('dragging-changed', (event) => {
  controls.enabled = !event.value;
});


// Enable snapping for translate, rotate, and scale
transformControls.setTranslationSnap(1);
transformControls.setRotationSnap(THREE.MathUtils.degToRad(15));
transformControls.setScaleSnap(0.1);


let history = [];
let currentStep = -1;

// Save state to history
function saveState() {
  currentStep++;
  history = history.slice(0, currentStep); // Trim the history after the current step
  history.push(gear.clone());
}

// Undo function
function undo() {
  if (currentStep > 0) {
    currentStep--;
    scene.remove(gear);
    gear = history[currentStep].clone();
    scene.add(gear);
    transformControls.attach(gear);
  }
}

// Redo function
function redo() {
  if (currentStep < history.length - 1) {
    currentStep++;
    scene.remove(gear);
    gear = history[currentStep].clone();
    scene.add(gear);
    transformControls.attach(gear);
  }
}

// Save the initial state
saveState();

// Bind undo/redo to keyboard shortcuts (Ctrl+Z for undo, Ctrl+Y for redo)
window.addEventListener('keydown', (event) => {
  if (event.ctrlKey && event.key === 'z') {
    undo();
  }
  if (event.ctrlKey && event.key === 'y') {
    redo();
  }
});


let currentMode = 'object'; // Default mode

// Function to toggle modes
function toggleMode() {
  currentMode = currentMode === 'object' ? 'edit' : 'object';
  console.log(`Switched to ${currentMode} mode.`);
}

// Switch modes using the 'Tab' key
window.addEventListener('keydown', (event) => {
  if (event.key === 'Tab') {
    event.preventDefault();
    toggleMode();
  }
});



const gui = new GUI();
const gearFolder = gui.addFolder('gear');
gearFolder.add(gear.position, 'x', -10, 10);
gearFolder.add(gear.position, 'y', -10, 10);
gearFolder.add(gear.position, 'z', -10, 10);
gearFolder.add(gear.rotation, 'x', 0, Math.PI * 2);
gearFolder.add(gear.rotation, 'y', 0, Math.PI * 2);
gearFolder.add(gear.rotation, 'z', 0, Math.PI * 2);
gearFolder.open();


//============================================================================

    // Create room elements
    createRoom();

    // Handle window resize
    window.addEventListener('resize', onWindowResize, false);

    // Start the animation loop
    animate();

    // Initialize the controls
    initControls();
}

function createRoom() {
    // Floor
    const floorGeometry = new THREE.PlaneGeometry(20, 20);
    const floorMaterial = new THREE.MeshBasicMaterial({ color: 0x8B4513 }); // Wood-like brown color
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    // Walls
    const wallMaterial = new THREE.MeshBasicMaterial({
        map: new THREE.TextureLoader().load() // Brick texture
    });

    const wallGeometry = new THREE.PlaneGeometry(20, 10);
    const wall1 = new THREE.Mesh(wallGeometry, wallMaterial);
    wall1.position.set(0, 5, -10); // Back wall
    scene.add(wall1);

    const wall2 = wall1.clone(); // Side walls
    wall2.rotation.y = Math.PI / 2;
    wall2.position.set(-10, 5, 0);
    scene.add(wall2);

    const wall3 = wall1.clone();
    wall3.rotation.y = -Math.PI / 2;
    wall3.position.set(10, 5, 0);
    scene.add(wall3);

    // Ceiling (optional)
    const ceilingGeometry = new THREE.PlaneGeometry(20, 20);
    const ceilingMaterial = new THREE.MeshBasicMaterial({ color: 0xCD853F }); // Light brown for ceiling
    const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = 10;
    scene.add(ceiling);

    // Paintings (placeholders)
    const paintingMaterial1 = new THREE.MeshBasicMaterial({
        map: new THREE.TextureLoader().load('imgur.com/a/xU8f3va'), // Image for painting
    });
    const paintingMaterial2 = new THREE.MeshBasicMaterial({
        map: new THREE.TextureLoader().load('imgur.com/a/xU8f3va'), // Image for another painting
    });

    const paintingGeometry = new THREE.PlaneGeometry(3, 4); // Painting dimensions

    const painting1 = new THREE.Mesh(paintingGeometry, paintingMaterial1);
    painting1.position.set(-4, 5, -9.9); // Position on the back wall
    scene.add(painting1);

    const painting2 = new THREE.Mesh(paintingGeometry, paintingMaterial2);
    painting2.position.set(4, 5, -9.9); // Position on the back wall
    scene.add(painting2);
} 

/* function createToolbox(x, z) {
    const geometry = new THREE.BoxGeometry(1, 0.5, 2);  // Toolbox dimensions
    const material = new THREE.MeshLambertMaterial({ color: 0x8B4513 });  // Brown color for toolbox
    toolbox = new THREE.Mesh(geometry, material);
    toolbox.position.set(x, 0.25, z);  // Raise toolbox slightly above the ground
    toolbox.castShadow = true;
    toolbox.receiveShadow = true;
    scene.add(toolbox);
} */

function loadGearModel() {
    const loader = new THREE.GLTFLoader();
    loader.load(
        '/static/lab/models/Mercedes-Benz 190.glb', // Path to the GLB file
        function(gltf) {
            gear = gltf.scene;
            gear.scale.set(2, 2, 2);  // Adjust scale as needed
            gear.position.set(0, 1, 0);  // Adjust position as needed
            gear.castShadow = true;
            gear.receiveShadow = true;
            scene.add(gear);
            console.log('Gear model loaded successfully.');
        },
        function(xhr) {
            console.log((xhr.loaded / xhr.total * 100) + '% loaded');
        },
        function(error) {
            console.error('An error occurred while loading the gear model', error);
        }
    );
}

function animate() {
    requestAnimationFrame(animate);

    // Update OrbitControls
    orbitControls.update();

    // Optionally, rotate the lamps or toolbox slowly for effect
    lamps.forEach(lamp => {
        lamp.shade.rotation.y += 0.01;  // Slow rotation of the lamp shade
    });

    // Optionally, rotate the gear if loaded
  //  if (gear) {
   //     gear.rotation.y += 0.01;  // Rotate the gear
  //  }

    // Render the scene from the perspective of the camera
    renderer.render(scene, camera);
}

function onWindowResize() {
    const canvasContainer = document.getElementById('canvas-container');
    camera.aspect = canvasContainer.clientWidth / canvasContainer.clientHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
}

function initControls() {
    document.getElementById('rotate-left').addEventListener('click', function() {
        if (gear) {
            gear.rotation.y += 0.5;  // Rotate the gear left
        }
    });

    document.getElementById('rotate-right').addEventListener('click', function() {
        if (gear) {
            gear.rotation.y -= 0.5;  // Rotate the gear right
        }
    });

    document.getElementById('zoom-in').addEventListener('click', function() {
        camera.position.z -= 1;
    });

    document.getElementById('zoom-out').addEventListener('click', function() {
        camera.position.z += 1;
    });

    document.getElementById('pan-left').addEventListener('click', function() {
        camera.position.x -= 1;
    });

    document.getElementById('pan-right').addEventListener('click', function() {
        camera.position.x += 1;
    });

    document.getElementById('select-object').addEventListener('click', function() {
        alert('Select Object functionality is not implemented yet.');               // TODO: implement functionality for select gear faces per example
    });
}


/* // create an AudioListener and add it to the camera
const listener = new THREE.AudioListener();
camera.add( listener );

// create a global audio source
const sound = new THREE.Audio( listener );

// load a sound and set it as the Audio object's buffer
const audioLoader = new THREE.AudioLoader();
audioLoader.load( 'static/sounds/hard typebeat.mp3', function( buffer ) {
	sound.setBuffer( buffer );
	sound.setLoop( true );
	sound.setVolume( 0.5 );
	sound.play();
}); */

// Wait for the DOM to be fully loaded before initializing
document.addEventListener('DOMContentLoaded', init);