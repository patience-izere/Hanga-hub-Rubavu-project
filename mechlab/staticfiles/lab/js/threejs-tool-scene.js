import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

let scene, camera, renderer, orbitControls, transformControls;
let table, selectedObject;
let undoStack = [], redoStack = [];

function init() {
    // Scene setup
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(5, 5, 5);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // Camera position
    camera.position.set(5, 5, 5);
    camera.lookAt(0, 0, 0);

    // Controls
    orbitControls = new OrbitControls(camera, renderer.domElement);
    transformControls = new TransformControls(camera, renderer.domElement);
    scene.add(transformControls);

    transformControls.addEventListener('dragging-changed', (event) => {
        orbitControls.enabled = !event.value;
    });

    transformControls.addEventListener('objectChange', () => {
        if (selectedObject) {
            addToUndoStack();
        }
    });

    // Create table
    const tableGeometry = new THREE.BoxGeometry(4, 0.1, 2);
    const tableTexture = new THREE.TextureLoader().load('path/to/wood_texture.jpg');
    const tableMaterial = new THREE.MeshPhongMaterial({ map: tableTexture });
    table = new THREE.Mesh(tableGeometry, tableMaterial);
    table.receiveShadow = true;
    scene.add(table);

    // Load detailed tool models
    const loader = new GLTFLoader();
    loader.load('path/to/wrench.gltf', (gltf) => {
        const wrench = gltf.scene;
        wrench.scale.set(0.1, 0.1, 0.1);
        wrench.position.set(0.5, 0.1, 0);
        wrench.castShadow = true;
        scene.add(wrench);
    });

    loader.load('path/to/screwdriver.gltf', (gltf) => {
        const screwdriver = gltf.scene;
        screwdriver.scale.set(0.1, 0.1, 0.1);
        screwdriver.position.set(-0.5, 0.1, 0.5);
        screwdriver.castShadow = true;
        scene.add(screwdriver);
    });

    // Event listeners
    window.addEventListener('resize', onWindowResize, false);
    renderer.domElement.addEventListener('click', onMouseClick, false);

    // UI Controls
    createUIControls();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function onMouseClick(event) {
    const mouse = new THREE.Vector2();
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObjects(scene.children, true);

    if (intersects.length > 0) {
        const clickedObject = intersects[0].object;
        if (clickedObject !== table) {
            selectObject(clickedObject);
        }
    }
}

function selectObject(object) {
    if (selectedObject) {
        transformControls.detach();
    }
    selectedObject = object;
    transformControls.attach(selectedObject);
}

function createUIControls() {
    const controlsDiv = document.createElement('div');
    controlsDiv.style.position = 'absolute';
    controlsDiv.style.top = '10px';
    controlsDiv.style.left = '10px';

    const translateButton = createButton('Translate', () => transformControls.setMode('translate'));
    const rotateButton = createButton('Rotate', () => transformControls.setMode('rotate'));
    const scaleButton = createButton('Scale', () => transformControls.setMode('scale'));
    const undoButton = createButton('Undo', undo);
    const redoButton = createButton('Redo', redo);
    const duplicateButton = createButton('Duplicate', duplicateSelected);
    const deleteButton = createButton('Delete', deleteSelected);

    controlsDiv.appendChild(translateButton);
    controlsDiv.appendChild(rotateButton);
    controlsDiv.appendChild(scaleButton);
    controlsDiv.appendChild(undoButton);
    controlsDiv.appendChild(redoButton);
    controlsDiv.appendChild(duplicateButton);
    controlsDiv.appendChild(deleteButton);

    document.body.appendChild(controlsDiv);
}

function createButton(text, onClick) {
    const button = document.createElement('button');
    button.textContent = text;
    button.addEventListener('click', onClick);
    button.style.marginRight = '5px';
    return button;
}

function addToUndoStack() {
    const state = {
        position: selectedObject.position.clone(),
        rotation: selectedObject.rotation.clone(),
        scale: selectedObject.scale.clone()
    };
    undoStack.push(state);
    redoStack = [];
}

function undo() {
    if (undoStack.length > 0 && selectedObject) {
        const currentState = {
            position: selectedObject.position.clone(),
            rotation: selectedObject.rotation.clone(),
            scale: selectedObject.scale.clone()
        };
        redoStack.push(currentState);

        const previousState = undoStack.pop();
        selectedObject.position.copy(previousState.position);
        selectedObject.rotation.copy(previousState.rotation);
        selectedObject.scale.copy(previousState.scale);
    }
}

function redo() {
    if (redoStack.length > 0 && selectedObject) {
        const currentState = {
            position: selectedObject.position.clone(),
            rotation: selectedObject.rotation.clone(),
            scale: selectedObject.scale.clone()
        };
        undoStack.push(currentState);

        const nextState = redoStack.pop();
        selectedObject.position.copy(nextState.position);
        selectedObject.rotation.copy(nextState.rotation);
        selectedObject.scale.copy(nextState.scale);
    }
}

function duplicateSelected() {
    if (selectedObject) {
        const clone = selectedObject.clone();
        clone.position.set(
            selectedObject.position.x + 0.2,
            selectedObject.position.y + 0.2,
            selectedObject.position.z
        );
        scene.add(clone);
        selectObject(clone);
        addToUndoStack();
    }
}

function deleteSelected() {
    if (selectedObject) {
        scene.remove(selectedObject);
        transformControls.detach();
        selectedObject = null;
        addToUndoStack();
    }
}

function animate() {
    requestAnimationFrame(animate);
    orbitControls.update();
    renderer.render(scene, camera);
}

init();
animate();
