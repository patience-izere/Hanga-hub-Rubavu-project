import { Grid, OrbitControls } from "@react-three/drei";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { useState } from "react";

type SceneProps = {
  currentAction: string | null;
  completedActions: Set<string>;
  disabled: boolean;
  onAction: (action: string) => void;
};

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
  return (
    <div className="simulation-canvas" aria-hidden="true">
      <Canvas camera={{ position: [5.6, 4.4, 6.4], fov: 44 }} dpr={[1, 1.5]} shadows>
        <color attach="background" args={["#101a22"]} />
        <fog attach="fog" args={["#101a22", 8, 15]} />
        <Workshop {...props} />
      </Canvas>
    </div>
  );
}
