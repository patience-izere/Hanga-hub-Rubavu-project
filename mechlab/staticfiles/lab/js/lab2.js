// static/lab/js/lab.js

let scene, camera, renderer;
let cube;  // Object to manipulate

// Initialize the scene
function init() {
    const canvasContainer = document.getElementById('canvas-container');

    // Set up the scene
    scene = new THREE.Scene();

    // Set up the camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 5;

    // Set up the renderer
    renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    canvasContainer.appendChild(renderer.domElement);  // Attach the canvas to the div

    // Add a basic cube to the scene
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    cube = new THREE.Mesh(geometry, material);
    scene.add(cube);

    // Start the animation loop
    animate();
}

// Animate the scene (renders continuously)
function animate() {
    requestAnimationFrame(animate);

    // Render the scene from the perspective of the camera
    renderer.render(scene, camera);
}

// Move Tool: Translate the cube along the X-axis
document.getElementById('move-tool').addEventListener('click', function() {
    cube.position.x += 0.1;  // Move the cube
});

// Rotate Tool: Rotate the cube around the Y-axis
document.getElementById('rotate-tool').addEventListener('click', function() {
    cube.rotation.y += 0.1;  // Rotate the cube
});

// Scale Tool: Increase the size of the cube
document.getElementById('scale-tool').addEventListener('click', function() {
    cube.scale.x += 0.1;  // Scale the cube
});

// Initialize the scene when the page loads
window.onload = init;
