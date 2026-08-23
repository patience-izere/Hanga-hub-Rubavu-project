# Legacy 3D asset quarantine

The files in this directory were previously available beneath `static/lab/models` but have no
repository evidence proving ownership, redistribution rights, source attribution, dimensional
accuracy, curriculum approval, or suitability for the battery procedure:

- `gear.glb`
- `Mercedes-Benz 190.glb`

They are retained only to preserve project history and must not be copied, served, previewed,
published, bundled, or used for learner content. Release requires either documented rights from the
owner or permanent removal. Production assets must instead enter through a versioned `AssetPackage`
with SPDX license, attribution, digest, validation metadata, performance budgets, and instructor
approval.

`python manage.py validate_asset_packages` fails if a 3D file is placed back into the public legacy
directory, preventing accidental re-exposure in CI.
