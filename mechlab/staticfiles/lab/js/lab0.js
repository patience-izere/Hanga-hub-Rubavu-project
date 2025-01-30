// static/lab/js/lab.js

// Setup scene, camera, and renderer
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('canvas-container').appendChild(renderer.domElement);

// Add light
const light = new THREE.PointLight(0xFFFFFF);
light.position.set(100, 200, 100);
scene.add(light);

// Load 3D models
const loader = new THREE.GLTFLoader();
let gear = null;

loader.load('/static/lab/models/gear.glb', function(gltf) {
    gear = gltf.scene;
    scene.add(gear);
    gear.position.set(0, 0, 0);
});

// Setup camera position
camera.position.z = 10;

// Physics setup with Cannon.js
const world = new CANNON.World();
world.gravity.set(0, -9.82, 0);

// Create physics material and objects (simple example)
const groundMaterial = new CANNON.Material("groundMaterial");
const gearBody = new CANNON.Body({ mass: 1 });
gearBody.addShape(new CANNON.Box(new CANNON.Vec3(1, 1, 1)));  // Simple box shape
gearBody.position.set(0, 1, 0);
world.addBody(gearBody);

// Animate scene and physics world
function animate() {
    requestAnimationFrame(animate);

    world.step(1/60);  // Update physics world

    if (gear) {
        gear.rotation.y += 0.01;  // Rotate gear
        gear.position.copy(gearBody.position);  // Sync with physics
    }

    renderer.render(scene, camera);
}
animate();

// Interaction (saving progress)
document.getElementById('save-progress').addEventListener('click', function() {
    const score = 100;  // Example score value
    fetch('/save_progress/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score: score })
    })
    .then(response => response.json())
    .then(data => {
        console.log(data.message);  // Feedback on saving progress
    });
});
