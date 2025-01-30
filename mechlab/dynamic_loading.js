const loadModelList = async () => {
    const response = await fetch('http://localhost:8000/lab/api/models/');
    const models = await response.json();
    
    const modelSelector = document.getElementById('modelSelector');
    models.forEach(model => {
        const button = document.createElement('button');
        button.innerText = model.name;
        button.onclick = () => loadModel(model.model_file);
        modelSelector.appendChild(button);
    });
};