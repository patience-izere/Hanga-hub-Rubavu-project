import { Grid, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Matrix4, PerspectiveCamera, Quaternion, Vector3, type Group } from "three";

import type { ArPose } from "../../ar/markerPose";

import type { ConsequenceEffect, ProcedureStep, SceneDefinition } from "../../api/learning";
import {
  highlightFor,
  readingFor,
  resolveClick,
  sceneState,
  toolLabel,
} from "../../procedure/scene";
import { cue } from "../../procedure/sensory";
import {
  partAnchor,
  PROP_COMPONENTS,
  PropIdContext,
  SceneApiContext,
  type SceneApi,
  type Vec3,
} from "./sceneProps";

export type SceneEffect = { id: number; kind: ConsequenceEffect; action: string };

export type ScenePlayerProps = {
  scene: SceneDefinition;
  steps: ProcedureStep[];
  completedActions: Set<string>;
  /** The action to point the learner towards, or `null` when prompts are hidden. */
  currentAction: string | null;
  disabled: boolean;
  onAction(action: string): void;
  /** The consequence of the last wrong action, shown where it happened. */
  effect?: SceneEffect | null;
  /** Draw only the props over a transparent background, for use on top of a camera view. */
  overlay?: boolean;
  /** The printed marker's 3D pose: the bench is drawn standing on it, tilting with it. */
  arPose?: ArPose | null;
};

/** A camera that matches the phone's: at the origin, looking down −z, same field of view. */
function ArCamera({ pose }: { pose: ArPose }) {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(0, 0, 0);
    camera.rotation.set(0, 0, 0);
    if (camera instanceof PerspectiveCamera) {
      camera.fov = pose.fov;
      camera.aspect = pose.aspect;
      camera.near = 0.01;
      camera.far = 200;
      camera.updateProjectionMatrix();
    }
  }, [camera, pose.fov, pose.aspect]);
  return null;
}

/**
 * Holds the bench. On a marker it eases towards each new pose, because detection arrives a few
 * times a second and jumping between them would shake the bench.
 */
function BenchGroup({ pose, children }: { pose?: ArPose | null; children: ReactNode }) {
  const ref = useRef<Group>(null);
  const target = useRef({
    position: new Vector3(),
    quaternion: new Quaternion(),
    scale: new Vector3(1, 1, 1),
  });
  const placed = useRef(false);
  useEffect(() => {
    if (!pose) {
      placed.current = false;
      return;
    }
    new Matrix4()
      .fromArray(pose.matrix)
      .decompose(target.current.position, target.current.quaternion, target.current.scale);
  }, [pose]);
  useFrame((_, delta) => {
    const group = ref.current;
    if (!group) return;
    if (!pose) {
      group.position.set(0, 0, 0);
      group.quaternion.identity();
      group.scale.set(1, 1, 1);
      return;
    }
    const goal = target.current;
    if (!placed.current) {
      group.position.copy(goal.position);
      group.quaternion.copy(goal.quaternion);
      group.scale.copy(goal.scale);
      placed.current = true;
      return;
    }
    const amount = 1 - Math.exp(-delta * 14);
    group.position.lerp(goal.position, amount);
    group.quaternion.slerp(goal.quaternion, amount);
    group.scale.lerp(goal.scale, amount);
  });
  return <group ref={ref}>{children}</group>;
}

const METER_FLASH: Partial<Record<ConsequenceEffect, string>> = {
  blown_fuse: "FUSE",
  wrong_reading: "Err",
  damage: "Err",
};

function rotateY([x, y, z]: Vec3, degrees = 0): Vec3 {
  const angle = (degrees * Math.PI) / 180;
  return [x * Math.cos(angle) + z * Math.sin(angle), y, -x * Math.sin(angle) + z * Math.cos(angle)];
}

function propOf(scene: SceneDefinition, partKey: string) {
  const [propId, part] = partKey.split(".");
  const prop = scene.props.find((item) => item.id === propId);
  return prop ? { prop, part: part ?? "body" } : null;
}

/** Where a part is in the room. */
function worldAnchor(scene: SceneDefinition, partKey: string): Vec3 | null {
  const found = propOf(scene, partKey);
  if (!found) return null;
  const local = rotateY(partAnchor(found.prop.kind, found.part), found.prop.rotation);
  return [found.prop.position[0] + local[0], local[1], found.prop.position[1] + local[2]];
}

/** The part a learner touches to perform an action, used to place its consequence. */
function partForAction(scene: SceneDefinition, action: string): string | null {
  for (const [partKey, binding] of Object.entries(scene.bindings)) {
    if ("accepts" in binding && Object.values(binding.accepts).includes(action)) return partKey;
    if ("action" in binding) {
      const actions = Array.isArray(binding.action) ? binding.action : [binding.action];
      if (actions.includes(action)) return partKey;
    }
  }
  return null;
}

function Spark({ position, reducedMotion }: { position: Vec3; reducedMotion: boolean }) {
  const ref = useRef<Group>(null);
  const started = useRef<number | null>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    started.current ??= clock.elapsedTime;
    const age = clock.elapsedTime - started.current;
    ref.current.visible = reducedMotion ? age < 0.9 : Math.floor(age * 18) % 2 === 0 && age < 0.9;
    if (!reducedMotion) ref.current.scale.setScalar(1 + age * 1.6);
  });
  return (
    <group ref={ref} position={position}>
      {[
        [0, 0, 0],
        [0.14, 0.1, 0.05],
        [-0.12, 0.14, -0.06],
        [0.05, 0.2, 0.1],
      ].map((offset, index) => (
        <mesh key={index} position={offset as Vec3}>
          <sphereGeometry args={[0.07 - index * 0.012, 8, 8]} />
          <meshBasicMaterial color={index % 2 ? "#fff3b0" : "#ffb347"} />
        </mesh>
      ))}
      <pointLight intensity={14} distance={4} color="#ffd27a" />
    </group>
  );
}

function CameraRig({
  azimuth,
  distance,
  floor,
}: {
  azimuth: number;
  distance: number;
  floor: boolean;
}) {
  const { camera } = useThree();
  useEffect(() => {
    const radius = (floor ? 8.4 : 7.6) * distance;
    const height = (floor ? 6.2 : 5.0) * distance;
    camera.position.set(Math.sin(azimuth) * radius, height, Math.cos(azimuth) * radius);
    camera.lookAt(0, 0.3, 0);
  }, [camera, azimuth, distance, floor]);
  return null;
}

export function ScenePlayer({
  scene,
  steps,
  completedActions: completedInput,
  currentAction,
  disabled,
  onAction,
  effect = null,
  overlay = false,
  arPose = null,
}: ScenePlayerProps) {
  const [heldTool, setHeldTool] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [azimuth, setAzimuth] = useState(0);
  const [distance, setDistance] = useState(1);
  const [liveEffect, setLiveEffect] = useState<SceneEffect | null>(null);
  const reducedMotion = useMemo(
    () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
    [],
  );
  const floor = scene.layout === "floor";
  // Callers build a new Set on every render; key it by content so holding a tool, the prop
  // state and the highlights only change when the procedure actually moves on.
  const completedKey = [...completedInput].sort().join("|");
  const completedActions = useMemo(
    () => new Set(completedKey.split("|").filter(Boolean)),
    [completedKey],
  );

  // A consequence is shown briefly, then the workshop returns to how it was.
  useEffect(() => {
    if (!effect) return;
    setLiveEffect(effect);
    setHeldTool(null);
    const timer = window.setTimeout(() => setLiveEffect(null), 1600);
    return () => window.clearTimeout(timer);
  }, [effect]);

  // A tool that has been placed is no longer in the hand.
  useEffect(() => setHeldTool(null), [completedActions]);

  const state = useMemo(() => sceneState(scene, completedActions), [scene, completedActions]);
  const highlight = useMemo(
    () => highlightFor(scene, currentAction, heldTool, completedActions),
    [scene, currentAction, heldTool, completedActions],
  );
  const heldPart = useMemo(
    () =>
      heldTool
        ? (Object.entries(scene.bindings).find(
            ([, binding]) => "tool" in binding && binding.tool === heldTool,
          )?.[0] ?? null)
        : null,
    [scene, heldTool],
  );

  const api = useMemo<SceneApi>(
    () => ({
      interactive: (partKey) => partKey in scene.bindings,
      highlighted: (partKey) => highlight.parts.has(partKey),
      held: (partKey) => partKey === heldPart,
      click: (partKey) => {
        if (disabled) return;
        const result = resolveClick(scene, partKey, heldTool, completedActions);
        switch (result.kind) {
          case "pick":
            cue("pick");
            setHeldTool(result.tool);
            setNotice(`Holding the ${result.label.toLowerCase()}. Tap where it goes.`);
            break;
          case "drop":
            setHeldTool(null);
            setNotice("Put down.");
            break;
          case "needs-tool":
            setNotice("Pick up a tool first, then tap here.");
            break;
          case "wrong-place":
            setNotice("That does not go there.");
            break;
          case "action":
            setNotice("");
            onAction(result.action);
            break;
          default:
            break;
        }
      },
      anchor: (partKey, relativeTo) => {
        const target = worldAnchor(scene, partKey);
        const origin = scene.props.find((item) => item.id === relativeTo);
        if (!target || !origin) return null;
        const local = rotateY(
          [target[0] - origin.position[0], target[1], target[2] - origin.position[1]],
          -(origin.rotation ?? 0),
        );
        return local;
      },
      reducedMotion,
    }),
    [scene, highlight, heldPart, heldTool, completedActions, disabled, onAction, reducedMotion],
  );

  const effectPart = liveEffect ? partForAction(scene, liveEffect.action) : null;
  const effectAt = effectPart ? worldAnchor(scene, effectPart) : null;
  const showSpark = liveEffect && ["spark", "blown_fuse"].includes(liveEffect.kind) && effectAt;
  const meterFlash = liveEffect ? (METER_FLASH[liveEffect.kind] ?? null) : null;

  return (
    <div
      className={`scene-player${overlay ? " is-overlay" : ""}${
        liveEffect ? ` is-effect-${liveEffect.kind}` : ""
      }`}
    >
      <div className="scene-player-canvas">
        <Canvas
          camera={{ position: [0, 5, 7.6], fov: 42 }}
          dpr={[1, 1.5]}
          shadows={!overlay}
          gl={{ alpha: overlay }}
        >
          {arPose ? (
            <ArCamera pose={arPose} />
          ) : (
            <CameraRig azimuth={azimuth} distance={distance} floor={floor} />
          )}
          {overlay ? null : (
            <>
              <color attach="background" args={["#101a22"]} />
              <fog attach="fog" args={["#101a22", 12, 22]} />
            </>
          )}
          <ambientLight intensity={1.25} />
          <directionalLight position={[5, 8, 4]} intensity={2.2} castShadow />
          <pointLight position={[-4, 3, -2]} intensity={14} color="#8abfff" />

          {overlay ? null : floor ? (
            <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
              <planeGeometry args={[9, 5.4]} />
              <meshStandardMaterial color="#59626a" roughness={0.9} />
            </mesh>
          ) : (
            <>
              <mesh position={[0, -0.18, 0.1]} receiveShadow>
                <boxGeometry args={[8.2, 0.34, 4.6]} />
                <meshStandardMaterial color="#2b363f" roughness={0.8} />
              </mesh>
              <Grid
                position={[0, -0.36, 0]}
                args={[14, 14]}
                cellColor="#53626c"
                sectionColor="#81929c"
                fadeDistance={16}
                infiniteGrid
              />
            </>
          )}

          <BenchGroup pose={arPose}>
            <SceneApiContext.Provider value={api}>
              {scene.props.map((prop) => {
                const Component = PROP_COMPONENTS[prop.kind] ?? PROP_COMPONENTS.block;
                return (
                  <group
                    key={prop.id}
                    position={[prop.position[0], 0, prop.position[1]]}
                    rotation={[0, ((prop.rotation ?? 0) * Math.PI) / 180, 0]}
                  >
                    <PropIdContext.Provider value={prop.id}>
                      <Component
                        id={prop.id}
                        state={state[prop.id] ?? {}}
                        label={prop.label}
                        reading={prop.reading_step ? readingFor(steps, prop.reading_step) : null}
                        readingMode={prop.reading_mode}
                        flash={prop.kind === "multimeter" ? meterFlash : null}
                      />
                    </PropIdContext.Provider>
                  </group>
                );
              })}
            </SceneApiContext.Provider>

            {showSpark && effectAt ? (
              <Spark key={liveEffect.id} position={effectAt} reducedMotion={reducedMotion} />
            ) : null}
          </BenchGroup>

          {arPose ? null : (
            <OrbitControls
              makeDefault
              enablePan={false}
              minDistance={4.5}
              maxDistance={15}
              maxPolarAngle={Math.PI / 2.15}
              target={[0, 0.3, 0]}
            />
          )}
        </Canvas>
      </div>

      {heldTool ? (
        <div className="scene-held" role="status">
          <span>
            Holding: <strong>{toolLabel(scene, heldTool)}</strong>
          </span>
          <button type="button" onClick={() => setHeldTool(null)}>
            Put down
          </button>
        </div>
      ) : null}
      <p className="sr-only" role="status" aria-live="polite">
        {notice}
      </p>
      {notice && !heldTool ? <div className="scene-notice">{notice}</div> : null}

      {arPose ? null : (
        <div className="scene-view-controls" role="group" aria-label="3D view">
          <button
            type="button"
            aria-label="Turn view left"
            onClick={() => setAzimuth((a) => a - 0.5)}
          >
            ⟲
          </button>
          <button
            type="button"
            aria-label="Turn view right"
            onClick={() => setAzimuth((a) => a + 0.5)}
          >
            ⟳
          </button>
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => setDistance((value) => Math.max(0.65, value - 0.12))}
          >
            +
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => setDistance((value) => Math.min(1.5, value + 0.12))}
          >
            −
          </button>
          <button
            type="button"
            aria-label="Reset view"
            onClick={() => {
              setAzimuth(0);
              setDistance(1);
            }}
          >
            ⌂
          </button>
        </div>
      )}
    </div>
  );
}
