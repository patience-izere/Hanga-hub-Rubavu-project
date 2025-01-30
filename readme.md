this is the project directory structure for the virtual mechanical lab to beused for capacity building 

the project will be presented in hanga hubs project.


mechlab/                      # Root directory of your project
│
├── mechlab/                  # Django project folder
│   ├── __init__.py
│   ├── settings.py           # Django settings file

│   ├── urls.py               # Main URL configuration
│   ├── wsgi.py
│   ├── asgi.py
│   └── manage.py             # Django management command
│
├── lab/                      # Django app folder
│   ├── __init__.py
│   ├── admin.py
│   ├── apps.py
│   ├── models.py             # Database models (MechanicalObject, UserProgress)
│   ├── views.py              # Views (Django API endpoints)
│   ├── urls.py               # App URL routing
│   ├── migrations/           # Django migrations for the database
│   │   └── __init__.py
│   ├── static/               # Static assets (JS, CSS, 3D models)
│   │   ├── lab/
│   │   │   ├── js/
│   │   │   │   └── lab.js    # JavaScript logic (Three.js, Cannon.js, interaction)
│   │   │   ├── css/
│   │   │   │   └── style.css # Basic styles for the frontend
│   │   │   └── models/       # 3D models used in the lab (gears, levers, etc.)
│   │   │       └── gear.glb  # Example 3D model (GLTF format)
│   ├── templates/            # Django template files for HTML
│   │   ├── lab/
│   │   │   └── index.html    # Main HTML page for the mechanical lab
│   └── tests.py              # Unit tests (optional)
│
└── db.sqlite3                # SQLite database (created by Django)
