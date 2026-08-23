# Assessment content versioning

OPedu separates editable lesson authoring records from the immutable material used by an assessment attempt.

## Version chain

`Lesson → SimulationScenario(version) → GradingPolicy(version)`

A scenario may also reference one `AssetPackage(version)`, which contains a manifest and zero or more `AssetFile` records. Each file records its logical path, MIME type, byte size, SHA-256 digest, and role. The package records its own SHA-256 digest and total byte size.

An assignment binds a learner to one published scenario version. Starting the assignment copies that scenario and its grading policy onto the attempt. Attempt progress reads the scenario's step snapshot, not the lesson's mutable `ProcedureStep` authoring rows. Completion uses the attempt's policy parameters and algorithm identifier, not application-wide penalty constants.

## Immutability rules

- Draft scenarios, policies, packages, and package files may be edited.
- Published versions may only move to retired; their definitions and versioned parameters cannot change or be deleted through the application models.
- Files cannot be added, changed, or deleted after their package is published.
- A scenario may only use an asset package from the lesson's course.
- A published scenario requires at least one ordered step and a published grading policy. If it references an asset package, that package must also be published.
- A retired version cannot be reactivated. Changes require a new version record.

These rules are enforced by model validation, read-only assessment APIs, Django Admin configuration, protected foreign keys, and automated tests. Direct database maintenance must preserve the same invariants.

## Migration and compatibility

Migration `0010_versioned_simulation` creates a standard deterministic grading policy, snapshots every existing lesson's ordered procedure into a scenario matching `Lesson.content_version`, binds existing assignments, and copies the scenario and policy references to historical attempts before making those references required.

The old `ThreeDModel` endpoint remains temporarily for compatibility but contains no published
records. New content must use `AssetPackage` and `AssetFile`. The two repository GLBs that lacked
license and provenance evidence were moved out of the public static tree to
`mechlab/quarantine/legacy-assets`; CI rejects any unversioned 3D file reintroduced under
`static/lab/models`. Supplying a real licensed and instructor-approved glTF package remains a
production asset-pipeline gate.
