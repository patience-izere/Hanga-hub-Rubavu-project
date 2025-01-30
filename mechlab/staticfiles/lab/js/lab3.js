// static/lab/js/lab.js

let scene, camera, renderer;
let tables = [], toolbox, lamps = [];

// Initialize the scene
function init() {
    const canvasContainer = document.getElementById('canvas-container');

    // Set up the scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xa0a0a0);  // Gray background for better contrast

    // Set up the camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 10, 15);  // Positioned higher and slightly farther back
    camera.lookAt(0, 0, 0);  // Camera looks towards the center of the scene

    // Set up the renderer
    renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    canvasContainer.appendChild(renderer.domElement);  // Attach the canvas to the div

    // Add lighting to the scene
    const ambientLight = new THREE.AmbientLight(0x404040, 1);  // Ambient light
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 10, 5);  // Simulate overhead light
    scene.add(directionalLight);

    // Create tables of different colors
    createTable(0, 0, 0xFF0000);  // Red table
    createTable(-3, 0, 0x00FF00);  // Green table
    createTable(3, 0, 0x0000FF);  // Blue table

    // Add lamps (simple shapes)
    createLamp(-2, 3);
    createLamp(2, 3);

    // Add a toolbox (can use a simple box for now)
    createToolbox(0, 0.5);

    // Start the animation loop
    animate();
}

// Create a table (basic rectangular shape)
function createTable(x, z, color) {
    const geometry = new THREE.BoxGeometry(2, 0.5, 4);  // Table dimensions
    const material = new THREE.MeshLambertMaterial({ color: color });
    const table = new THREE.Mesh(geometry, material);
    table.position.set(x, 0, z);  // Position the table on the ground
    scene.add(table);
    tables.push(table);
}

// Create a lamp (simple cone and cylinder combination)
function createLamp(x, z) {
    const lampBaseGeometry = new THREE.CylinderGeometry(0.1, 0.1, 2, 32);  // Lamp base
    const lampShadeGeometry = new THREE.ConeGeometry(0.5, 1, 32);  // Lamp shade

    const lampBaseMaterial = new THREE.MeshLambertMaterial({ color: 0x333333 });
    const lampShadeMaterial = new THREE.MeshLambertMaterial({ color: 0xFFFF00 });  // Yellow shade

    const lampBase = new THREE.Mesh(lampBaseGeometry, lampBaseMaterial);
    const lampShade = new THREE.Mesh(lampShadeGeometry, lampShadeMaterial);

    // Position the lamp base and shade
    lampBase.position.set(x, 1, z);  // Raise the base slightly above the ground
    lampShade.position.set(x, 2, z);  // Place the shade on top of the base

    scene.add(lampBase);
    scene.add(lampShade);

    lamps.push({ base: lampBase, shade: lampShade });
}

// Create a toolbox (basic box for now, can replace with a model)
function createToolbox(x, z) {
    const geometry = new THREE.BoxGeometry(1, 0.5, 2);  // Toolbox dimensions
    const material = new THREE.MeshLambertMaterial({ color: 0x8B4513 });  // Brown color for toolbox
    toolbox = new THREE.Mesh(geometry, material);
    toolbox.position.set(x, 0.5, z);  // Raise toolbox slightly above the ground
    scene.add(toolbox);
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);

    // Optionally, rotate the lamps or toolbox slowly for effect
    lamps.forEach(lamp => {
        lamp.shade.rotation.y += 0.01;  // Slow rotation of the lamp shade
    });

    // Render the scene from the perspective of the camera
    renderer.render(scene, camera);
}

// Initialize the scene when the page loads
window.onload = init;
