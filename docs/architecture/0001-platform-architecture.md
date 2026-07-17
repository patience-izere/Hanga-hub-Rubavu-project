# ADR 0001: OPedu platform architecture

- Status: Accepted
- Date: 2026-07-17

## Context

OPedu must deliver curriculum-aligned technical simulations on school devices with unreliable connectivity while preserving assessable evidence and a non-immersive alternative.

## Decision

Use a modular Django monolith with Django REST Framework, PostgreSQL, Redis, and same-origin session authentication. Use React, TypeScript, and Vite for learner and instructor interfaces. Use Three.js through React Three Fiber for the shared desktop/WebXR renderer. Store meaningful learner actions as ordered immutable events; keep deterministic grading on the server. Deliver and validate desktop mode before enabling WebXR. Add offline synchronization through client-generated idempotency keys rather than a separate microservice.

## Consequences

The architecture remains deployable by a small team and keeps grading, permissions, and content versions authoritative. Large 3D dependencies must be route-split. Offline conflicts, content immutability, and tenant isolation require explicit tests. WebXR cannot introduce a separate action vocabulary or grading path.
