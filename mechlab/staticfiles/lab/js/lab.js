import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';







// lab/static/lab/js/lab.js

let scene, camera, renderer;
let tables = [], toolbox, lamps = [];
let gear;
let controls;
let orbitControls;

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
    scene.add(axesHelper);

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

    

    // Add a toolbox (can use a simple box for now)
    createToolbox(0, 0.5);

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

    // Handle window resize
    window.addEventListener('resize', onWindowResize, false);

    // Start the animation loop
    animate();

    // Initialize the controls
    initControls();
}

// Floor
      const floorGeometry = new THREE.PlaneGeometry(20, 20);
      const floorMaterial = new THREE.MeshBasicMaterial({ color: 0x8B4513 }); // Wood-like brown color
      const floor = new THREE.Mesh(floorGeometry, floorMaterial);
      floor.rotation.x = -Math.PI / 2;
      scene.add(floor);

      // Walls
      const wallMaterial = new THREE.MeshBasicMaterial({
        map: new THREE.TextureLoader().load('https://i.imgur.com/w7WWIBy.jpg') // Brick texture
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
        map: new THREE.TextureLoader().load('https://i.imgur.com/Nzmrv1I.jpg'), // Image for painting
      });
      const paintingMaterial2 = new THREE.MeshBasicMaterial({
        map: new THREE.TextureLoader().load('https://i.imgur.com/MbWO3aA.jpg'), // Image for another painting
      });

      const paintingGeometry = new THREE.PlaneGeometry(3, 4); // Painting dimensions

      const painting1 = new THREE.Mesh(paintingGeometry, paintingMaterial1);
      painting1.position.set(-4, 5, -9.9); // Position on the back wall
      scene.add(painting1);

      const painting2 = new THREE.Mesh(paintingGeometry, paintingMaterial2);
      painting2.position.set(4, 5, -9.9); // Position on the back wall
      scene.add(painting2);

      // Camera setup
      camera.position.z = 15;
      camera.position.y = 5;

      // Rendering loop
      function animate() {
        requestAnimationFrame(animate);
        renderer.render(scene, camera);
      }
      animate();

      // Resize handler
      window.addEventListener('resize', () => {
        renderer.setSize(window.innerWidth, window.innerHeight);
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
}

// Create a toolbox (basic box for now, can replace with a model)
function createToolbox(x, z) {
    const geometry = new THREE.BoxGeometry(1, 0.5, 2);  // Toolbox dimensions
    const material = new THREE.MeshLambertMaterial({ color: 0x8B4513 });  // Brown color for toolbox
    toolbox = new THREE.Mesh(geometry, material);
    toolbox.position.set(x, 0.25, z);  // Raise toolbox slightly above the ground
    toolbox.castShadow = true;
    toolbox.receiveShadow = true;
    scene.add(toolbox);
}


// Load the gear model using GLTFLoader
function loadGearModel() {
    const loader = new THREE.GLTFLoader();
    loader.load(
        '/static/lab/models/gear.glb', // Path to the GLB file
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

// Animation loop
function animate() {
    requestAnimationFrame(animate);

    // Update OrbitControls
    orbitControls.update();

    // Optionally, rotate the lamps or toolbox slowly for effect
    lamps.forEach(lamp => {
        lamp.shade.rotation.y += 0.01;  // Slow rotation of the lamp shade
    });

    // Optionally, rotate the gear if loaded
    if (gear) {
        gear.rotation.y += 0.01;  // Rotate the gear
    }

    // Render the scene from the perspective of the camera
    renderer.render(scene, camera);
}

// Handle window resize
function onWindowResize() {
    const canvasContainer = document.getElementById('canvas-container');
    camera.aspect = canvasContainer.clientWidth / canvasContainer.clientHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
}

// Initialize controls in the right panel
function initControls() {
    // Rotate Left
    document.getElementById('rotate-left').addEventListener('click', function() {
        if (gear) {
            gear.rotation.y += 0.5;  // Rotate the gear left
        }
    });

    // Rotate Right
    document.getElementById('rotate-right').addEventListener('click', function() {
        if (gear) {
            gear.rotation.y -= 0.5;  // Rotate the gear right
        }
    });

    // Zoom In
    document.getElementById('zoom-in').addEventListener('click', function() {
        camera.position.z -= 1;
    });

    // Zoom Out
    document.getElementById('zoom-out').addEventListener('click', function() {
        camera.position.z += 1;
    });

    // Pan Left
    document.getElementById('pan-left').addEventListener('click', function() {
        camera.position.x -= 1;
    });

    // Pan Right
    document.getElementById('pan-right').addEventListener('click', function() {
        camera.position.x += 1;
    });

    // Select Object (Placeholder)
    document.getElementById('select-object').addEventListener('click', function() {
        alert('Select Object functionality is not implemented yet.');
    });
}

// Initialize the scene when the page loads
window.onload = init;
