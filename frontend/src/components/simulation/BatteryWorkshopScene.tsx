import { Grid, OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { Component, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Mesh } from "three";

import { loadVerifiedAsset, type VerifiedAssetDescriptor } from "../../assets/verifiedAssetLoader";

type SceneProps = {
  currentAction: string | null;
  completedActions: Set<string>;
  disabled: boolean;
  onAction: (action: string) => void;
  modelAsset?: VerifiedAssetDescriptor;
  onAssetFailure?: () => void;
  onAssetLoaded?: () => void;
};

class AssetBoundary extends Component<
  { children: ReactNode; fallback: ReactNode; onFailure?: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onFailure?.();
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

type InteractiveProps = {
  action: string;
  currentAction: string | null;
  completedActions: Set<string>;
  disabled: boolean;
  children: React.ReactNode;
  onAction: (action: string) => void;
};

function Interactive({
  action,
  currentAction,
  completedActions,
  disabled,
  children,
  onAction,
}: InteractiveProps) {
  const [hovered, setHovered] = useState(false);
  const active = currentAction === action;
  const completed = completedActions.has(action);

  function handleClick(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation();
    if (!disabled) onAction(action);
  }

  return (
    <group
      onClick={handleClick}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
      scale={hovered || active ? 1.06 : 1}
    >
      {children}
      {(active || completed) && (
        <mesh position={[0, 0.02, 0]}>
          <sphereGeometry args={[active ? 0.16 : 0.11, 16, 16]} />
          <meshStandardMaterial
            color={active ? "#ffd45c" : "#44d7a8"}
            emissive={active ? "#c48b00" : "#0b7857"}
            emissiveIntensity={0.8}
            transparent
            opacity={0.78}
          />
        </mesh>
      )}
    </group>
  );
}

function ProductionModel({
  modelUrl,
  disabled,
  onAction,
  onAssetLoaded,
}: SceneProps & { modelUrl: string }) {
  const { scene } = useGLTF(modelUrl);
  const model = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((object) => {
      if ("isMesh" in object) {
        const mesh = object as Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    return clone;
  }, [scene]);

  useEffect(() => {
    onAssetLoaded?.();
  }, [modelUrl, onAssetLoaded]);

  function handleClick(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation();
    const action = String(
      event.object.userData.actionCode ||
        (event.object.name.startsWith("ACTION_") ? event.object.name.slice(7).toLowerCase() : ""),
    );
    if (!disabled && action) onAction(action);
  }

  return <primitive object={model} onClick={handleClick} />;
}

function ProductionWorkshop(props: SceneProps & { modelUrl: string }) {
  return (
    <>
      <ambientLight intensity={1.2} />
      <directionalLight position={[5, 7, 4]} intensity={2.2} castShadow />
      <Suspense fallback={null}>
        <ProductionModel {...props} />
      </Suspense>
      <Grid
        position={[0, -0.62, 0]}
        args={[12, 12]}
        cellColor="#53626c"
        sectionColor="#81929c"
        fadeDistance={12}
        infiniteGrid
      />
      <OrbitControls makeDefault minDistance={3} maxDistance={10} maxPolarAngle={Math.PI / 2.05} />
    </>
  );
}

function Workshop({ currentAction, completedActions, disabled, onAction }: SceneProps) {
  const common = { currentAction, completedActions, disabled, onAction };
  return (
    <>
      <ambientLight intensity={1.2} />
      <directionalLight position={[5, 7, 4]} intensity={2.2} castShadow />
      <pointLight position={[-4, 3, -2]} intensity={16} color="#8abfff" />

      <mesh position={[0, -0.45, 0]} receiveShadow>
        <boxGeometry args={[7.4, 0.35, 4.8]} />
        <meshStandardMaterial color="#29343e" roughness={0.78} />
      </mesh>

      <group position={[-0.45, 0.25, 0]}>
        <mesh castShadow>
          <boxGeometry args={[2.8, 1.35, 1.75]} />
          <meshStandardMaterial color="#222a31" roughness={0.55} />
        </mesh>
        <mesh position={[0, 0.72, 0]}>
          <boxGeometry args={[2.65, 0.15, 1.6]} />
          <meshStandardMaterial color="#3c4851" />
        </mesh>
        <Interactive action="connect_black_negative" {...common}>
          <mesh position={[-0.92, 0.92, 0]} castShadow>
            <cylinderGeometry args={[0.22, 0.25, 0.28, 24]} />
            <meshStandardMaterial color="#30363b" metalness={0.75} />
          </mesh>
        </Interactive>
        <Interactive action="connect_red_positive" {...common}>
          <mesh position={[0.92, 0.92, 0]} castShadow>
            <cylinderGeometry args={[0.22, 0.25, 0.28, 24]} />
            <meshStandardMaterial color="#d94b46" metalness={0.45} />
          </mesh>
        </Interactive>
      </group>

      <group position={[2.05, 0.05, 0.4]} rotation={[-0.14, -0.08, 0]}>
        <mesh castShadow>
          <boxGeometry args={[1.25, 1.85, 0.45]} />
          <meshStandardMaterial color="#e4ae24" roughness={0.45} />
        </mesh>
        <Interactive action="read_voltage" {...common}>
          <mesh position={[0, 0.5, 0.25]}>
            <boxGeometry args={[0.82, 0.42, 0.04]} />
            <meshStandardMaterial color="#8bd4b0" emissive="#1d6950" emissiveIntensity={0.35} />
          </mesh>
        </Interactive>
        <Interactive action="set_meter_dc" {...common}>
          <mesh position={[0, -0.2, 0.3]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.34, 0.34, 0.18, 28]} />
            <meshStandardMaterial color="#23292f" />
          </mesh>
        </Interactive>
      </group>

      <Interactive action="confirm_ppe" {...common}>
        <group position={[-2.65, 0.25, 0.45]} rotation={[0, 0.25, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.33, 0.07, 12, 28]} />
            <meshStandardMaterial color="#99d9f3" transparent opacity={0.72} />
          </mesh>
          <mesh position={[0.65, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.33, 0.07, 12, 28]} />
            <meshStandardMaterial color="#99d9f3" transparent opacity={0.72} />
          </mesh>
          <mesh position={[0.325, 0, 0]}>
            <boxGeometry args={[0.18, 0.06, 0.06]} />
            <meshStandardMaterial color="#5b6f79" />
          </mesh>
        </group>
      </Interactive>

      <Interactive action="turn_ignition_off" {...common}>
        <group position={[-2.45, 0.12, -1.15]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.32, 0.32, 0.16, 28]} />
            <meshStandardMaterial color="#76838b" metalness={0.8} />
          </mesh>
          <mesh position={[0, 0.15, 0.14]} rotation={[0, 0, -0.6]}>
            <boxGeometry args={[0.13, 0.55, 0.08]} />
            <meshStandardMaterial color="#dce5e8" metalness={0.9} />
          </mesh>
        </group>
      </Interactive>

      <Grid
        position={[0, -0.62, 0]}
        args={[12, 12]}
        cellColor="#53626c"
        sectionColor="#81929c"
        fadeDistance={12}
        infiniteGrid
      />
      <OrbitControls makeDefault minDistance={5} maxDistance={10} maxPolarAngle={Math.PI / 2.05} />
    </>
  );
}

export function BatteryWorkshopScene(props: SceneProps) {
  const { modelAsset, onAssetFailure } = props;
  const [viewKey, setViewKey] = useState(0);
  const [retryKey, setRetryKey] = useState(0);
  const [assetCancelled, setAssetCancelled] = useState(false);
  const [modelUrl, setModelUrl] = useState<string>();
  const [assetState, setAssetState] = useState<"idle" | "loading" | "ready" | "failed">(
    modelAsset ? "loading" : "idle",
  );
  const [assetProgress, setAssetProgress] = useState<number | null>(null);
  const [assetError, setAssetError] = useState("");
  const [cameraPreset, setCameraPreset] = useState(0);
  const [cameraDistance, setCameraDistance] = useState(1);
  const [cameraHistory, setCameraHistory] = useState<Array<[number, number]>>([]);
  const baseCameras = [
    [5.6, 4.4, 6.4],
    [-5.6, 4.4, 6.4],
    [-5.6, 4.4, -6.4],
    [5.6, 4.4, -6.4],
  ] as const;
  const cameraPosition = baseCameras[cameraPreset].map(
    (coordinate) => coordinate * cameraDistance,
  ) as [number, number, number];

  function moveCamera(nextPreset: number, nextDistance = cameraDistance) {
    setCameraHistory((history) => [...history.slice(-9), [cameraPreset, cameraDistance]]);
    setCameraPreset((nextPreset + baseCameras.length) % baseCameras.length);
    setCameraDistance(Math.min(1.45, Math.max(0.72, nextDistance)));
    setViewKey((current) => current + 1);
  }

  useEffect(() => {
    if (!modelAsset || assetCancelled) {
      setAssetState("idle");
      setModelUrl(undefined);
      return;
    }
    const controller = new AbortController();
    let objectUrl: string | undefined;
    setAssetState("loading");
    setAssetError("");
    setAssetProgress(0);
    loadVerifiedAsset(modelAsset, {
      signal: controller.signal,
      onProgress: (progress) => setAssetProgress(progress.percent),
    })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setModelUrl(objectUrl);
        setAssetState("ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setModelUrl(undefined);
        setAssetState("failed");
        setAssetError(error instanceof Error ? error.message : "The 3D asset could not be loaded.");
        onAssetFailure?.();
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assetCancelled, modelAsset, onAssetFailure, retryKey]);

  return (
    <div className="simulation-canvas-container">
      <div className="simulation-canvas" aria-hidden="true">
        <Canvas
          key={`${viewKey}-${cameraPreset}-${cameraDistance}`}
          camera={{ position: cameraPosition, fov: 44 }}
          dpr={[1, 1.5]}
          shadows
        >
          <color attach="background" args={["#101a22"]} />
          <fog attach="fog" args={["#101a22", 8, 15]} />
          {modelUrl ? (
            <AssetBoundary fallback={<Workshop {...props} />} onFailure={props.onAssetFailure}>
              <ProductionWorkshop {...props} modelUrl={modelUrl} />
            </AssetBoundary>
          ) : (
            <Workshop {...props} />
          )}
        </Canvas>
      </div>
      {assetState === "loading" ? (
        <div className="asset-load-status" role="status">
          <span>
            Verifying workshop model{assetProgress === null ? "" : ` · ${assetProgress}%`}
          </span>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => {
              setAssetCancelled(true);
            }}
          >
            Cancel download
          </button>
        </div>
      ) : null}
      {assetState === "failed" ? (
        <div className="asset-load-status" role="alert">
          <span>{assetError} The equivalent procedural model is active.</span>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => {
              setAssetCancelled(false);
              setRetryKey((current) => current + 1);
            }}
          >
            Retry verified model
          </button>
        </div>
      ) : null}
      <div
        className="scene-controls"
        role="group"
        aria-label="3D camera controls"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") moveCamera(cameraPreset - 1);
          else if (event.key === "ArrowRight") moveCamera(cameraPreset + 1);
          else if (event.key === "+" || event.key === "=")
            moveCamera(cameraPreset, cameraDistance - 0.12);
          else if (event.key === "-" || event.key === "_")
            moveCamera(cameraPreset, cameraDistance + 0.12);
          else if (event.key === "Home") {
            setCameraHistory([]);
            setCameraPreset(0);
            setCameraDistance(1);
            setViewKey((current) => current + 1);
          } else return;
          event.preventDefault();
        }}
      >
        <button type="button" onClick={() => moveCamera(cameraPreset - 1)}>
          Rotate left
        </button>
        <button type="button" onClick={() => moveCamera(cameraPreset + 1)}>
          Rotate right
        </button>
        <button type="button" onClick={() => moveCamera(cameraPreset, cameraDistance - 0.12)}>
          Zoom in
        </button>
        <button type="button" onClick={() => moveCamera(cameraPreset, cameraDistance + 0.12)}>
          Zoom out
        </button>
        <button
          type="button"
          disabled={!cameraHistory.length}
          onClick={() => {
            const previous = cameraHistory.at(-1);
            if (!previous) return;
            setCameraPreset(previous[0]);
            setCameraDistance(previous[1]);
            setCameraHistory((history) => history.slice(0, -1));
            setViewKey((current) => current + 1);
          }}
        >
          Undo view
        </button>
        <button
          type="button"
          onClick={() => {
            setCameraHistory([]);
            setCameraPreset(0);
            setCameraDistance(1);
            setViewKey((current) => current + 1);
          }}
        >
          Reset 3D view
        </button>
        <small>Keyboard: left/right rotate · plus/minus zoom · Home resets</small>
      </div>
    </div>
  );
}
