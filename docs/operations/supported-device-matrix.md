# Supported-device and acceptance matrix

Status: test protocol defined; no physical device is approved by repository evidence.

| Profile | Required verification | Current status |
|---|---|---|
| Lowest Android phone/tablet | HTTPS, rear camera, QR detection or controlled-rig fallback, WebGL, storage, 24 FPS budget, thermal/battery run | Awaiting named device and lab test |
| Markerless Android | WebXR `immersive-ar`, hit test, placement, interruption, relocalization, portrait/landscape | Awaiting physical test |
| Desktop/laptop | Keyboard, focus, screen reader, reduced motion, WebGL and accessible 2D parity | Automated path implemented; human review pending |
| Unsupported/old mobile | Camera/WebGL denial, clear explanation, accessible 2D fallback, no progress loss | Logic implemented; device test pending |
| Shared school device | install, pre-download, storage cleanup, account separation, logout, outage and recovery | Runbook implemented; custodian rehearsal pending |

For each exact model/browser/OS combination record memory, available storage, camera quality,
first/cached load, download bytes/time, recognition latency and mismatch, tracking loss/recovery,
frame-rate samples, crash, fallback, battery drain, thermal warning, orientation, interruption, and
offline replay result. Approval requires the same grading/evidence outcome in every available
renderer and no AR-caused safety or scoring defect.
