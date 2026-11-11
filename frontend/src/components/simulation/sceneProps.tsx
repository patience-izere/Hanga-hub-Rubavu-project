/**
 * The shared prop library.
 *
 * Every lesson's scene is assembled from these props by data (see `procedure/scene.ts`). A prop
 * draws itself from simple shapes, names its touchable parts with `<Part>`, and shows whatever
 * state the lesson's finished actions have put it in. A new lesson that reuses these props needs
 * no code; a new kind of equipment is one more entry in `PROP_COMPONENTS`.
 *
 * The geometry is deliberately plain and procedural. It stands in until licensed, dimensionally
 * accurate models are supplied through an asset package.
 */

import { Html, QuadraticBezierLine } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import type { Group } from "three";

import type { PropState, Reading } from "../../procedure/scene";

export type Vec3 = [number, number, number];

export type SceneApi = {
  /** Whether touching this part does anything in this lesson. */
  interactive(partKey: string): boolean;
  highlighted(partKey: string): boolean;
  /** The part is a tool the learner is carrying. */
  held(partKey: string): boolean;
  click(partKey: string): void;
  /** Where another prop's part is, in the frame of the prop asking. */
  anchor(partKey: string, relativeTo: string): Vec3 | null;
  reducedMotion: boolean;
};

export const SceneApiContext = createContext<SceneApi | null>(null);
export const PropIdContext = createContext<string>("");

export type PropProps = {
  id: string;
  state: PropState;
  label?: string;
  reading?: Reading | null;
  /** The meter mode that shows `reading` ("dcv" unless the lesson says otherwise). */
  readingMode?: string;
  /** A short-lived message a consequence put on this prop, such as a blown meter fuse. */
  flash?: string | null;
};

const GLOW = "#ffd45c";
const HELD = "#7fd8ff";

function useApi(): SceneApi {
  const api = useContext(SceneApiContext);
  if (!api) throw new Error("Scene props must be rendered inside a ScenePlayer.");
  return api;
}

/** A floating text label. Never the only way information is given: buttons repeat every action. */
export function Tag({
  children,
  position = [0, 0, 0],
  tone = "plain",
}: {
  children: ReactNode;
  position?: Vec3;
  tone?: "plain" | "name" | "good" | "bad" | "display" | "chart";
}) {
  return (
    <Html center position={position} zIndexRange={[20, 0]} className={`scene-tag is-${tone}`}>
      {children}
    </Html>
  );
}

function Pulse({ radius, color }: { radius: number; color: string }) {
  const api = useApi();
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current || api.reducedMotion) return;
    const scale = 1 + Math.sin(clock.elapsedTime * 4) * 0.12;
    ref.current.scale.setScalar(scale);
  });
  return (
    <group ref={ref}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[radius, radius * 0.09, 8, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.9} />
      </mesh>
    </group>
  );
}

/**
 * A touchable part of a prop.
 *
 * `ring` is the radius of the marker drawn around the part when it is the next thing to touch
 * or is being carried; `at` is where that marker sits.
 */
export function Part({
  name,
  children,
  ring = 0.4,
  at = [0, 0.05, 0],
}: {
  name: string;
  children: ReactNode;
  ring?: number;
  at?: Vec3;
}) {
  const api = useApi();
  const propId = useContext(PropIdContext);
  const key = `${propId}.${name}`;
  const [hovered, setHovered] = useState(false);
  const interactive = api.interactive(key);
  const highlighted = api.highlighted(key);
  const held = api.held(key);

  if (!interactive) return <group>{children}</group>;

  function handleClick(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation();
    api.click(key);
  }

  return (
    <group
      onClick={handleClick}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHovered(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = "";
      }}
      position={held ? [0, 0.35, 0] : [0, 0, 0]}
      scale={hovered ? 1.05 : 1}
    >
      {children}
      {(highlighted || held) && (
        <group position={at}>
          <Pulse radius={ring} color={held ? HELD : GLOW} />
        </group>
      )}
    </group>
  );
}

function PropName({ label, y = -0.02, z = 1 }: { label?: string; y?: number; z?: number }) {
  return label ? (
    <Tag tone="name" position={[0, y, z]}>
      {label}
    </Tag>
  ) : null;
}

/** A sagging cable between two points. */
function Cable({ from, to, color }: { from: Vec3; to: Vec3; color: string }) {
  const mid: Vec3 = [
    (from[0] + to[0]) / 2,
    Math.min(from[1], to[1]) * 0.35 + 0.08,
    (from[2] + to[2]) / 2 + 0.25,
  ];
  return <QuadraticBezierLine start={from} end={to} mid={mid} color={color} lineWidth={3} />;
}

// ---------------------------------------------------------------------------------------------
// Electrical equipment
// ---------------------------------------------------------------------------------------------

function Battery({ label }: PropProps) {
  return (
    <group>
      <mesh position={[0, 0.42, 0]} castShadow>
        <boxGeometry args={[2, 0.84, 1.2]} />
        <meshStandardMaterial color="#20282f" roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.88, 0]}>
        <boxGeometry args={[1.9, 0.1, 1.1]} />
        <meshStandardMaterial color="#3c4851" />
      </mesh>
      <Part name="terminal_neg" ring={0.3} at={[-0.62, 1.2, 0]}>
        <mesh position={[-0.62, 1.03, 0]} castShadow>
          <cylinderGeometry args={[0.16, 0.19, 0.24, 24]} />
          <meshStandardMaterial color="#2c3338" metalness={0.75} roughness={0.35} />
        </mesh>
        <Tag position={[-0.62, 1.5, 0]}>−</Tag>
      </Part>
      <Part name="terminal_pos" ring={0.3} at={[0.62, 1.2, 0]}>
        <mesh position={[0.62, 1.03, 0]} castShadow>
          <cylinderGeometry args={[0.16, 0.19, 0.24, 24]} />
          <meshStandardMaterial color="#d94b46" metalness={0.45} roughness={0.4} />
        </mesh>
        <Tag position={[0.62, 1.5, 0]}>+</Tag>
      </Part>
      <PropName label={label} z={0.85} />
    </group>
  );
}

const METER_MODES: Array<{ part: string; mode: string; text: string; angle: number }> = [
  { part: "mode_dcv", mode: "dcv", text: "V⎓", angle: -0.95 },
  { part: "mode_acv", mode: "acv", text: "V~", angle: -0.32 },
  { part: "mode_ohm", mode: "ohm", text: "Ω", angle: 0.32 },
  { part: "mode_amp", mode: "amp", text: "A", angle: 0.95 },
];

function Probe({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, 0.28, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.07, 0.5, 12]} />
        <meshStandardMaterial color={color} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.015, 0.03, 0.14, 8]} />
        <meshStandardMaterial color="#cfd6da" metalness={0.9} roughness={0.2} />
      </mesh>
    </group>
  );
}

function Multimeter({ id, state, label, reading, readingMode = "dcv", flash }: PropProps) {
  const api = useApi();
  const mode = typeof state.mode === "string" ? state.mode : "off";
  const blackAt = typeof state.black === "string" ? api.anchor(state.black, id) : null;
  const redAt = typeof state.red === "string" ? api.anchor(state.red, id) : null;
  const pointer = METER_MODES.find((item) => item.mode === mode)?.angle ?? -Math.PI / 2;
  const live = state.live !== false;
  const connected = Boolean(blackAt && redAt);
  let display = "OFF";
  if (flash) display = flash;
  else if (mode === readingMode && connected && reading && live) display = reading.text;
  else if (mode === "dcv") {
    display =
      connected && typeof state.resting === "number" ? `${state.resting.toFixed(2)} V` : "0.00 V";
  } else if (mode === "ohm") display = "OL";
  else if (mode === "acv") display = "0.00 V";
  else if (mode === "amp") display = "0.00 A";
  const jackBlack: Vec3 = [-0.18, 0.1, 0.78];
  const jackRed: Vec3 = [0.18, 0.1, 0.78];
  const restBlack: Vec3 = [-0.95, 0, 0.55];
  const restRed: Vec3 = [-0.95, 0, 0.05];

  return (
    <group>
      <mesh position={[0, 0.14, 0]} castShadow>
        <boxGeometry args={[1.15, 0.28, 1.75]} />
        <meshStandardMaterial color="#e4ae24" roughness={0.45} />
      </mesh>
      <Part name="display" ring={0.45} at={[0, 0.36, -0.5]}>
        <mesh position={[0, 0.29, -0.5]}>
          <boxGeometry args={[0.86, 0.04, 0.46]} />
          <meshStandardMaterial
            color={mode === "off" && !flash ? "#55635d" : "#8bd4b0"}
            emissive="#1d6950"
            emissiveIntensity={mode === "off" && !flash ? 0 : 0.4}
          />
        </mesh>
        <Tag tone="display" position={[0, 0.85, -0.95]}>
          {display}
        </Tag>
      </Part>
      {/* The dial and its pointer. */}
      <mesh position={[0, 0.31, 0.28]}>
        <cylinderGeometry args={[0.24, 0.24, 0.08, 28]} />
        <meshStandardMaterial color="#23292f" />
      </mesh>
      <mesh position={[0, 0.36, 0.28]} rotation={[0, -pointer, 0]}>
        <boxGeometry args={[0.05, 0.03, 0.42]} />
        <meshStandardMaterial color="#f4f1e8" />
      </mesh>
      {METER_MODES.map((item) => {
        const x = Math.sin(item.angle) * 0.44;
        const z = 0.28 - Math.cos(item.angle) * 0.44;
        return (
          <Part key={item.part} name={item.part} ring={0.15} at={[x, 0.34, z]}>
            <mesh position={[x, 0.3, z]}>
              <cylinderGeometry args={[0.1, 0.1, 0.05, 16]} />
              <meshStandardMaterial color={mode === item.mode ? "#d4ef78" : "#2f383f"} />
            </mesh>
            <Tag position={[x * 1.15, 0.42, z + 0.42]}>{item.text}</Tag>
          </Part>
        );
      })}
      {/* Probes: resting beside the meter, carried, or standing on whatever they touch. */}
      <Part name="probe_black" ring={0.22} at={[restBlack[0], 0.05, restBlack[2]]}>
        <group position={blackAt ?? restBlack}>
          <Probe color="#1b1f23" />
        </group>
      </Part>
      <Part name="probe_red" ring={0.22} at={[restRed[0], 0.05, restRed[2]]}>
        <group position={redAt ?? restRed}>
          <Probe color="#d94b46" />
        </group>
      </Part>
      <Cable from={jackBlack} to={blackAt ?? [restBlack[0], 0.3, restBlack[2]]} color="#1b1f23" />
      <Cable from={jackRed} to={redAt ?? [restRed[0], 0.3, restRed[2]]} color="#d94b46" />
      <PropName label={label} z={1.15} />
    </group>
  );
}

function Glasses({ state, label }: PropProps) {
  const worn = state.worn === true;
  return (
    <group>
      <Part name="body" ring={0.62} at={[0, 0.1, 0]}>
        <group position={[0, 0.16, 0]} rotation={[-0.35, 0, 0]}>
          {[-0.32, 0.32].map((x) => (
            <mesh key={x} position={[x, 0, 0]}>
              <torusGeometry args={[0.24, 0.05, 12, 28]} />
              <meshStandardMaterial color="#7cc7ea" transparent opacity={worn ? 0.3 : 0.85} />
            </mesh>
          ))}
          <mesh>
            <boxGeometry args={[0.2, 0.05, 0.05]} />
            <meshStandardMaterial color="#5b6f79" transparent opacity={worn ? 0.3 : 1} />
          </mesh>
        </group>
      </Part>
      {worn ? (
        <Tag tone="good" position={[0, 0.75, 0]}>
          On ✓
        </Tag>
      ) : null}
      <PropName label={label} z={0.6} />
    </group>
  );
}

const KEY_POSITIONS: Record<
  string,
  { angle: number; text: string; tone: "good" | "bad" | "plain" }
> = {
  on: { angle: -0.6, text: "ON", tone: "bad" },
  off: { angle: 0.9, text: "OFF", tone: "good" },
  run: { angle: -1.3, text: "RUNNING", tone: "plain" },
};

function IgnitionKey({ state, label }: PropProps) {
  const position = KEY_POSITIONS[String(state.position ?? "on")] ?? KEY_POSITIONS.on;
  return (
    <group>
      <Part name="body" ring={0.5} at={[0, 0.1, 0]}>
        <mesh position={[0, 0.1, 0]} castShadow>
          <cylinderGeometry args={[0.34, 0.38, 0.2, 28]} />
          <meshStandardMaterial color="#76838b" metalness={0.8} roughness={0.35} />
        </mesh>
        <group position={[0, 0.24, 0]} rotation={[0, position.angle, 0]}>
          <mesh position={[0, 0.05, 0]} castShadow>
            <boxGeometry args={[0.12, 0.14, 0.62]} />
            <meshStandardMaterial color="#dce5e8" metalness={0.9} roughness={0.25} />
          </mesh>
        </group>
      </Part>
      <Tag tone={position.tone} position={[0, 0.85, 0]}>
        {position.text}
      </Tag>
      <PropName label={label} z={0.65} />
    </group>
  );
}

function Clamp({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, 0.12, 0]} rotation={[0, 0, 0.3]} castShadow>
        <boxGeometry args={[0.14, 0.34, 0.2]} />
        <meshStandardMaterial color={color} roughness={0.5} />
      </mesh>
      <mesh position={[0.1, 0.12, 0]} rotation={[0, 0, -0.3]} castShadow>
        <boxGeometry args={[0.14, 0.34, 0.2]} />
        <meshStandardMaterial color={color} roughness={0.5} />
      </mesh>
    </group>
  );
}

function JumpLeads({ id, state, label }: PropProps) {
  const api = useApi();
  const at = (key: string) =>
    typeof state[key] === "string" ? api.anchor(state[key] as string, id) : null;
  const pairs: Array<{ color: string; a: Vec3 | null; b: Vec3 | null; rest: Vec3 }> = [
    { color: "#d94b46", a: at("red_a"), b: at("red_b"), rest: [-0.35, 0, 0] },
    { color: "#1b1f23", a: at("black_a"), b: at("black_b"), rest: [0.35, 0, 0] },
  ];
  return (
    <group>
      <mesh position={[0, 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.42, 0.06, 10, 28]} />
        <meshStandardMaterial color="#39424a" roughness={0.7} />
      </mesh>
      <Part name="clamp_red" ring={0.3} at={[-0.35, 0.05, 0]}>
        <group position={[-0.4, 0, 0]}>
          <Clamp color="#d94b46" />
        </group>
      </Part>
      <Part name="clamp_black" ring={0.3} at={[0.35, 0.05, 0]}>
        <group position={[0.3, 0, 0]}>
          <Clamp color="#1b1f23" />
        </group>
      </Part>
      {pairs.map((pair) => (
        <group key={pair.color}>
          {[pair.a, pair.b].map((point, index) =>
            point ? (
              <group key={index} position={point}>
                <Clamp color={pair.color} />
              </group>
            ) : null,
          )}
          {pair.a && pair.b ? (
            <Cable from={pair.a} to={pair.b} color={pair.color} />
          ) : (pair.a ?? pair.b) ? (
            <Cable from={pair.rest} to={(pair.a ?? pair.b)!} color={pair.color} />
          ) : null}
        </group>
      ))}
      <PropName label={label} z={0.75} />
    </group>
  );
}

function EarthPoint({ label }: PropProps) {
  return (
    <group>
      <mesh position={[0, 0.4, 0]} castShadow>
        <boxGeometry args={[1.3, 0.8, 1]} />
        <meshStandardMaterial color="#59646b" metalness={0.5} roughness={0.6} />
      </mesh>
      <Part name="body" ring={0.3} at={[0.35, 1.05, 0.2]}>
        <mesh position={[0.35, 0.9, 0.2]} castShadow>
          <boxGeometry args={[0.34, 0.2, 0.3]} />
          <meshStandardMaterial color="#c9d1d6" metalness={0.9} roughness={0.25} />
        </mesh>
        <Tag position={[0.35, 1.4, 0.2]}>Bare metal</Tag>
      </Part>
      <PropName label={label} z={0.8} />
    </group>
  );
}

function Engine({ state, label }: PropProps) {
  const api = useApi();
  const pulley = useRef<Group>(null);
  const running = state.running === true;
  useFrame((_, delta) => {
    if (pulley.current && running && !api.reducedMotion) pulley.current.rotation.z += delta * 9;
  });
  return (
    <group>
      <mesh position={[0, 0.45, -0.1]} castShadow>
        <boxGeometry args={[1.5, 0.9, 1]} />
        <meshStandardMaterial color="#4d585f" metalness={0.5} roughness={0.6} />
      </mesh>
      <Part name="belt" ring={0.55} at={[0, 0.5, 0.62]}>
        <group ref={pulley} position={[-0.35, 0.5, 0.48]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.26, 0.26, 0.1, 20]} />
            <meshStandardMaterial color="#aeb8be" metalness={0.8} />
          </mesh>
          <mesh position={[0.14, 0, 0.06]}>
            <boxGeometry args={[0.08, 0.08, 0.04]} />
            <meshStandardMaterial color="#23292f" />
          </mesh>
        </group>
        <mesh position={[0.4, 0.5, 0.48]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.18, 0.18, 0.1, 20]} />
          <meshStandardMaterial color="#aeb8be" metalness={0.8} />
        </mesh>
        <mesh position={[0.02, 0.5, 0.52]} scale={[1.75, 1, 1]}>
          <torusGeometry args={[0.28, 0.035, 8, 32]} />
          <meshStandardMaterial color="#15191c" roughness={0.9} />
        </mesh>
      </Part>
      {running ? (
        <Tag tone="bad" position={[0, 1.25, 0.3]}>
          Belt moving
        </Tag>
      ) : state.checked === true ? (
        <Tag tone="good" position={[0, 1.25, 0.3]}>
          Clear ✓
        </Tag>
      ) : null}
      <PropName label={label} z={0.95} />
    </group>
  );
}

const FUSES: Array<{ part: string; code: string; x: number; color: string; text: string }> = [
  { part: "fuse_f1", code: "f1", x: -0.6, color: "#3f7fd6", text: "F1" },
  { part: "fuse_f2", code: "f2", x: -0.2, color: "#c9a26b", text: "F2" },
  { part: "fuse_f3", code: "f3", x: 0.2, color: "#d94b46", text: "F3" },
  { part: "fuse_f4", code: "f4", x: 0.6, color: "#e3c62f", text: "F4" },
];

function FuseBox({ state, label }: PropProps) {
  const selected = String(state.selected ?? "");
  const pulled = state.pulled === true;
  return (
    <group>
      <Part name="body" ring={1.05} at={[0, 0.3, 0]}>
        <mesh position={[0, 0.12, 0]} castShadow>
          <boxGeometry args={[1.9, 0.24, 1.1]} />
          <meshStandardMaterial color="#262d33" roughness={0.6} />
        </mesh>
      </Part>
      {FUSES.map((fuse) => {
        const out = pulled && selected === fuse.code;
        return (
          <Part
            key={fuse.part}
            name={fuse.part}
            ring={0.2}
            at={out ? [fuse.x, 0.1, 0.95] : [fuse.x, 0.5, 0]}
          >
            <mesh
              position={out ? [fuse.x, 0.06, 0.95] : [fuse.x, 0.33, 0]}
              rotation={out ? [Math.PI / 2, 0, 0] : [0, 0, 0]}
              castShadow
            >
              <boxGeometry args={[0.24, 0.2, 0.1]} />
              <meshStandardMaterial
                color={fuse.color}
                emissive={selected === fuse.code ? "#ffffff" : "#000000"}
                emissiveIntensity={selected === fuse.code ? 0.18 : 0}
              />
            </mesh>
            <Tag position={[fuse.x, 0.72, -0.25]}>{fuse.text}</Tag>
          </Part>
        );
      })}
      <Tag tone="chart" position={[0, 0.7, -0.95]}>
        F1 horn 15 A · F2 radio 5 A
        <br />
        F3 tail lamps 10 A · F4 wipers 20 A
      </Tag>
      {state.working === true ? (
        <Tag tone="good" position={[0, 1.15, 0]}>
          Circuit working ✓
        </Tag>
      ) : state.inspected === true && pulled ? (
        <Tag tone="bad" position={[0, 1.15, 0.6]}>
          Strip broken: blown
        </Tag>
      ) : null}
      <PropName label={label} z={1.25} />
    </group>
  );
}

function FuseTools({ label }: PropProps) {
  return (
    <group>
      <Part name="puller" ring={0.28} at={[-0.35, 0.05, 0]}>
        <mesh position={[-0.35, 0.06, 0]} rotation={[0, 0.3, 0]} castShadow>
          <boxGeometry args={[0.16, 0.1, 0.5]} />
          <meshStandardMaterial color="#f2c230" roughness={0.6} />
        </mesh>
        <Tag position={[-0.35, 0.5, 0]}>Puller</Tag>
      </Part>
      <Part name="screwdriver" ring={0.28} at={[0.35, 0.05, 0]}>
        <group position={[0.35, 0.06, 0]} rotation={[0, -0.3, 0]}>
          <mesh position={[0, 0, 0.18]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.07, 0.07, 0.3, 12]} />
            <meshStandardMaterial color="#c0392b" />
          </mesh>
          <mesh position={[0, 0, -0.15]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.02, 0.02, 0.4, 8]} />
            <meshStandardMaterial color="#cfd6da" metalness={0.9} />
          </mesh>
        </group>
        <Tag position={[0.35, 0.5, 0]}>Screwdriver</Tag>
      </Part>
      <PropName label={label} z={0.6} />
    </group>
  );
}

const SPARES: Array<{ part: string; x: number; color: string; text: string }> = [
  { part: "fuse_10", x: -0.6, color: "#d94b46", text: "10 A" },
  { part: "fuse_15", x: -0.2, color: "#3f7fd6", text: "15 A" },
  { part: "fuse_20", x: 0.2, color: "#e3c62f", text: "20 A" },
];

function SpareFuses({ label }: PropProps) {
  return (
    <group>
      <mesh position={[0, 0.03, 0]}>
        <boxGeometry args={[1.9, 0.06, 0.7]} />
        <meshStandardMaterial color="#39424a" />
      </mesh>
      {SPARES.map((fuse) => (
        <Part key={fuse.part} name={fuse.part} ring={0.2} at={[fuse.x, 0.1, 0]}>
          <mesh position={[fuse.x, 0.16, 0]} castShadow>
            <boxGeometry args={[0.24, 0.2, 0.1]} />
            <meshStandardMaterial color={fuse.color} />
          </mesh>
          <Tag position={[fuse.x, 0.55, 0]}>{fuse.text}</Tag>
        </Part>
      ))}
      <Part name="wire" ring={0.2} at={[0.65, 0.1, 0]}>
        <mesh position={[0.65, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.12, 0.025, 8, 20]} />
          <meshStandardMaterial color="#c77b30" metalness={0.8} />
        </mesh>
        <Tag position={[0.65, 0.55, 0]}>Wire</Tag>
      </Part>
      <PropName label={label} z={0.6} />
    </group>
  );
}

// ---------------------------------------------------------------------------------------------
// Workshop floor
// ---------------------------------------------------------------------------------------------

function Found({ state, y = 1.1 }: { state: PropState; y?: number }) {
  return state.found === true ? (
    <Tag tone="good" position={[0, y, 0]}>
      Found ✓
    </Tag>
  ) : null;
}

function Spill({ state }: PropProps) {
  return (
    <group>
      <Part name="body" ring={0.75} at={[0, 0.05, 0]}>
        <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.3, 0.8, 1]}>
          <circleGeometry args={[0.55, 28]} />
          <meshStandardMaterial color="#15130f" roughness={0.08} metalness={0.6} />
        </mesh>
        <mesh position={[0.5, 0.013, 0.25]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.2, 20]} />
          <meshStandardMaterial color="#15130f" roughness={0.08} metalness={0.6} />
        </mesh>
      </Part>
      <Found state={state} y={0.6} />
    </group>
  );
}

function ExtensionCable({ state }: PropProps) {
  const frayed = state.frayed === true;
  return (
    <group>
      <Part name="body" ring={0.6} at={[0, 0.05, 0]}>
        <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.36, 0.04, 8, 28, frayed ? Math.PI * 1.55 : Math.PI * 2]} />
          <meshStandardMaterial color="#e2792b" roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.07, 0]}>
          <boxGeometry args={[0.2, 0.12, 0.34]} />
          <meshStandardMaterial color="#f4f1e8" />
        </mesh>
        {frayed ? (
          <mesh position={[0.3, 0.05, 0.2]} rotation={[0, 0.6, 0]}>
            <boxGeometry args={[0.18, 0.03, 0.03]} />
            <meshStandardMaterial
              color="#c77b30"
              metalness={0.9}
              emissive="#ff8a3d"
              emissiveIntensity={0.5}
            />
          </mesh>
        ) : null}
      </Part>
      <Found state={state} y={0.7} />
    </group>
  );
}

function Extinguisher({ state }: PropProps) {
  const blocked = state.blocked === true;
  return (
    <group>
      <Part name="body" ring={0.7} at={[0, 0.05, 0.2]}>
        <mesh position={[0, 0.5, -0.2]} castShadow>
          <cylinderGeometry args={[0.16, 0.16, 0.75, 20]} />
          <meshStandardMaterial color="#c0392b" roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.94, -0.2]}>
          <cylinderGeometry args={[0.05, 0.08, 0.14, 12]} />
          <meshStandardMaterial color="#23292f" />
        </mesh>
        {blocked
          ? [
              [-0.25, 0.22, 0.3],
              [0.3, 0.22, 0.35],
              [0, 0.66, 0.32],
            ].map((position, index) => (
              <mesh key={index} position={position as Vec3} castShadow>
                <boxGeometry args={[0.5, 0.44, 0.5]} />
                <meshStandardMaterial color="#a9825a" roughness={0.9} />
              </mesh>
            ))
          : null}
      </Part>
      <Found state={state} y={1.35} />
    </group>
  );
}

function FuelCan({ state }: PropProps) {
  const open = state.open === true;
  return (
    <group>
      <Part name="body" ring={0.5} at={[0, 0.05, 0]}>
        <mesh position={[0, 0.3, 0]} castShadow>
          <boxGeometry args={[0.5, 0.6, 0.3]} />
          <meshStandardMaterial color="#2f7d4f" roughness={0.5} />
        </mesh>
        <mesh position={[0.15, 0.66, 0]}>
          <cylinderGeometry args={[0.06, 0.06, 0.12, 12]} />
          <meshStandardMaterial color={open ? "#101417" : "#e3c62f"} />
        </mesh>
        {open ? (
          <mesh position={[0.5, 0.03, 0.2]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.07, 0.07, 0.05, 12]} />
            <meshStandardMaterial color="#e3c62f" />
          </mesh>
        ) : null}
      </Part>
      <Found state={state} y={1.1} />
    </group>
  );
}

function LooseTools({ state }: PropProps) {
  return (
    <group>
      <Part name="body" ring={0.6} at={[0, 0.05, 0]}>
        <mesh position={[-0.15, 0.03, 0]} rotation={[0, 0.5, 0]} castShadow>
          <boxGeometry args={[0.7, 0.05, 0.1]} />
          <meshStandardMaterial color="#b7c0c6" metalness={0.9} roughness={0.3} />
        </mesh>
        <group position={[0.2, 0.04, 0.15]} rotation={[0, -0.7, 0]}>
          <mesh>
            <boxGeometry args={[0.55, 0.06, 0.06]} />
            <meshStandardMaterial color="#8a5a2b" />
          </mesh>
          <mesh position={[0.3, 0, 0]}>
            <boxGeometry args={[0.14, 0.12, 0.26]} />
            <meshStandardMaterial color="#4d585f" metalness={0.8} />
          </mesh>
        </group>
      </Part>
      <Found state={state} y={0.6} />
    </group>
  );
}

function Workbench({ state }: PropProps) {
  return (
    <group>
      <Part name="body" ring={1.1} at={[0, 0.95, 0]}>
        <mesh position={[0, 0.85, 0]} castShadow>
          <boxGeometry args={[1.9, 0.08, 0.8]} />
          <meshStandardMaterial color="#8a6a45" roughness={0.8} />
        </mesh>
        {[
          [-0.85, -0.32],
          [0.85, -0.32],
          [-0.85, 0.32],
          [0.85, 0.32],
        ].map(([x, z]) => (
          <mesh key={`${x}${z}`} position={[x, 0.42, z]}>
            <boxGeometry args={[0.08, 0.84, 0.08]} />
            <meshStandardMaterial color="#4d585f" />
          </mesh>
        ))}
        <mesh position={[0.3, 1.03, 0]} castShadow>
          <boxGeometry args={[0.7, 0.28, 0.36]} />
          <meshStandardMaterial color="#c0392b" />
        </mesh>
      </Part>
      <Found state={state} y={1.6} />
    </group>
  );
}

function FirstAid({ state }: PropProps) {
  return (
    <group>
      <Part name="body" ring={0.45} at={[0, 0.05, 0]}>
        <mesh position={[0, 0.6, 0]}>
          <boxGeometry args={[0.06, 1.2, 0.06]} />
          <meshStandardMaterial color="#4d585f" />
        </mesh>
        <mesh position={[0, 1.25, 0.02]} castShadow>
          <boxGeometry args={[0.5, 0.42, 0.14]} />
          <meshStandardMaterial color="#f4f1e8" />
        </mesh>
        <mesh position={[0, 1.25, 0.1]}>
          <boxGeometry args={[0.26, 0.08, 0.02]} />
          <meshStandardMaterial color="#1f9d55" />
        </mesh>
        <mesh position={[0, 1.25, 0.1]}>
          <boxGeometry args={[0.08, 0.26, 0.02]} />
          <meshStandardMaterial color="#1f9d55" />
        </mesh>
      </Part>
      <Found state={state} y={1.75} />
    </group>
  );
}

/** A labelled block: stands in for any action in a lesson authored without a scene. */
function Block({ state, label }: PropProps) {
  const done = state.done === true;
  return (
    <group>
      <Part name="body" ring={0.62} at={[0, 0.05, 0]}>
        <mesh position={[0, 0.2, 0]} castShadow>
          <boxGeometry args={[0.9, 0.4, 0.9]} />
          <meshStandardMaterial color={done ? "#19735d" : "#7b8a93"} roughness={0.6} />
        </mesh>
      </Part>
      <Tag tone={done ? "good" : "plain"} position={[0, 0.8, 0]}>
        {done ? `${label} ✓` : label}
      </Tag>
    </group>
  );
}

// ---------------------------------------------------------------------------------------------
// Electrical installation
// ---------------------------------------------------------------------------------------------

const BREAKER_CODES = ["b1", "b2", "b3", "b4", "b5", "b6"];

function ConsumerUnit({ state, label }: PropProps) {
  const selected = String(state.selected ?? "");
  const off = state.off === true;
  const locked = state.locked === true;
  return (
    <group>
      <Part name="body" ring={1.2} at={[0, 0.15, 0.7]}>
        <mesh position={[0, 0.55, -0.1]} castShadow>
          <boxGeometry args={[2.3, 1.1, 0.5]} />
          <meshStandardMaterial color="#e9ecef" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.55, 0.16]}>
          <boxGeometry args={[2.1, 0.5, 0.04]} />
          <meshStandardMaterial color="#c9d1d6" />
        </mesh>
      </Part>
      {BREAKER_CODES.map((code, index) => {
        const x = -0.85 + index * 0.34;
        const isOff = off && selected === code;
        return (
          <Part key={code} name={`breaker_${code}`} ring={0.17} at={[x, 0.95, 0.25]}>
            <mesh position={[x, 0.55, 0.22]} castShadow>
              <boxGeometry args={[0.26, 0.42, 0.12]} />
              <meshStandardMaterial
                color={selected === code ? "#fff3c4" : "#f8f9fa"}
                emissive={selected === code ? "#c48b00" : "#000000"}
                emissiveIntensity={selected === code ? 0.15 : 0}
              />
            </mesh>
            <mesh position={[x, isOff ? 0.45 : 0.65, 0.3]}>
              <boxGeometry args={[0.1, 0.12, 0.08]} />
              <meshStandardMaterial color={isOff ? "#d94b46" : "#2f7d4f"} />
            </mesh>
            <Tag position={[x, 0.98, 0.25]}>{code.toUpperCase()}</Tag>
          </Part>
        );
      })}
      {locked ? (
        <group position={[-0.85 + Math.max(0, BREAKER_CODES.indexOf(selected)) * 0.34, 0.32, 0.4]}>
          <mesh>
            <boxGeometry args={[0.22, 0.2, 0.1]} />
            <meshStandardMaterial color="#d94b46" />
          </mesh>
          <mesh position={[0, 0.16, 0]}>
            <torusGeometry args={[0.07, 0.02, 8, 16, Math.PI]} />
            <meshStandardMaterial color="#cfd6da" metalness={0.9} />
          </mesh>
          <Tag tone="bad" position={[0, -0.25, 0.1]}>
            DANGER: do not switch on
          </Tag>
        </group>
      ) : null}
      <Tag tone="chart" position={[0, 1.55, -0.2]}>
        B1 lights · B2 living room · B3 kitchen
        <br />
        B4 cooker · B5 water heater · B6 outside
      </Tag>
      {state.checked === true ? (
        <Tag tone="good" position={[1.4, 1.1, 0]}>
          Proved dead ✓
        </Tag>
      ) : null}
      <PropName label={label} z={0.75} />
    </group>
  );
}

function LockKit({ label }: PropProps) {
  return (
    <group>
      <Part name="body" ring={0.45} at={[0, 0.05, 0]}>
        <mesh position={[-0.15, 0.12, 0]} castShadow>
          <boxGeometry args={[0.32, 0.26, 0.14]} />
          <meshStandardMaterial color="#d94b46" />
        </mesh>
        <mesh position={[-0.15, 0.3, 0]}>
          <torusGeometry args={[0.1, 0.025, 8, 16, Math.PI]} />
          <meshStandardMaterial color="#cfd6da" metalness={0.9} />
        </mesh>
        <mesh position={[0.25, 0.04, 0.05]} rotation={[-Math.PI / 2, 0, 0.3]}>
          <planeGeometry args={[0.32, 0.22]} />
          <meshStandardMaterial color="#e3c62f" side={2} />
        </mesh>
      </Part>
      <PropName label={label} z={0.5} />
    </group>
  );
}

function VoltageTester({ label }: PropProps) {
  return (
    <group>
      <Part name="body" ring={0.4} at={[0, 0.05, 0]}>
        <mesh position={[0, 0.1, 0]} rotation={[0, 0.4, 0]} castShadow>
          <boxGeometry args={[0.24, 0.16, 0.7]} />
          <meshStandardMaterial color="#e3c62f" />
        </mesh>
        <mesh position={[0, 0.19, -0.1]} rotation={[0, 0.4, 0]}>
          <boxGeometry args={[0.16, 0.02, 0.24]} />
          <meshStandardMaterial color="#1b1f23" />
        </mesh>
      </Part>
      <PropName label={label} z={0.55} />
    </group>
  );
}

function ProvingUnit({ state, label }: PropProps) {
  const proved = Number(state.proved ?? 0);
  return (
    <group>
      <Part name="body" ring={0.42} at={[0, 0.05, 0]}>
        <mesh position={[0, 0.16, 0]} castShadow>
          <boxGeometry args={[0.5, 0.32, 0.36]} />
          <meshStandardMaterial color="#3a4249" />
        </mesh>
        <mesh position={[0, 0.33, 0]}>
          <cylinderGeometry args={[0.06, 0.06, 0.04, 12]} />
          <meshStandardMaterial
            color={proved ? "#8fe3a8" : "#55635d"}
            emissive={proved ? "#2f9d5a" : "#000000"}
            emissiveIntensity={proved ? 0.8 : 0}
          />
        </mesh>
      </Part>
      {proved ? (
        <Tag tone="good" position={[0, 0.75, 0]}>
          {proved === 1 ? "Tester works ✓" : "Tester still works ✓"}
        </Tag>
      ) : null}
      <PropName label={label} z={0.5} />
    </group>
  );
}

function Socket({ state, label, reading }: PropProps) {
  const tested = state.tested === true;
  const live = (reading?.value ?? 0) > 0;
  return (
    <group>
      <mesh position={[0, 0.6, -0.15]} castShadow>
        <boxGeometry args={[1.2, 1.2, 0.08]} />
        <meshStandardMaterial color="#d9cfbf" roughness={0.9} />
      </mesh>
      <Part name="body" ring={0.45} at={[0, 0.05, 0.2]}>
        <mesh position={[0, 0.6, -0.08]}>
          <boxGeometry args={[0.6, 0.6, 0.08]} />
          <meshStandardMaterial color="#f8f9fa" />
        </mesh>
        {[
          [-0.12, 0.62],
          [0.12, 0.62],
          [0, 0.47],
        ].map(([x, y]) => (
          <mesh key={`${x}${y}`} position={[x, y, -0.03]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.035, 0.035, 0.02, 10]} />
            <meshStandardMaterial color="#1b1f23" />
          </mesh>
        ))}
      </Part>
      {tested && reading ? (
        <Tag tone={live ? "bad" : "display"} position={[0, 1.4, 0]}>
          Tester: {reading.text}
        </Tag>
      ) : null}
      <PropName label={label} z={0.4} />
    </group>
  );
}

function CableRun({ label }: PropProps) {
  const ends: Array<{ part: string; x: number; text: string }> = [
    { part: "end_a", x: -1.4, text: "End A" },
    { part: "end_b", x: 1.4, text: "End B" },
  ];
  return (
    <group>
      <mesh position={[0, 0.08, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.05, 0.05, 2.6, 12]} />
        <meshStandardMaterial color="#c0392b" roughness={0.6} />
      </mesh>
      {ends.map((end) => (
        <Part key={end.part} name={end.part} ring={0.26} at={[end.x, 0.05, 0]}>
          <mesh position={[end.x, 0.12, 0]} castShadow>
            <boxGeometry args={[0.32, 0.24, 0.32]} />
            <meshStandardMaterial color="#f4f1e8" />
          </mesh>
          <mesh position={[end.x, 0.26, 0]}>
            <cylinderGeometry args={[0.04, 0.04, 0.06, 10]} />
            <meshStandardMaterial color="#c77b30" metalness={0.9} />
          </mesh>
          <Tag position={[end.x, 0.6, 0]}>{end.text}</Tag>
        </Part>
      ))}
      <PropName label={label} z={0.5} />
    </group>
  );
}

export const PROP_COMPONENTS: Record<string, (props: PropProps) => ReactNode> = {
  battery: Battery,
  multimeter: Multimeter,
  glasses: Glasses,
  key: IgnitionKey,
  jump_leads: JumpLeads,
  earth_point: EarthPoint,
  engine: Engine,
  fusebox: FuseBox,
  fuse_tools: FuseTools,
  spare_fuses: SpareFuses,
  spill: Spill,
  cable: ExtensionCable,
  extinguisher: Extinguisher,
  fuel_can: FuelCan,
  loose_tools: LooseTools,
  workbench: Workbench,
  first_aid: FirstAid,
  block: Block,
  consumer_unit: ConsumerUnit,
  lock_kit: LockKit,
  voltage_tester: VoltageTester,
  proving_unit: ProvingUnit,
  socket: Socket,
  cable_run: CableRun,
};

/**
 * Where each part can be touched, in its prop's own frame. Leads and clamps are drawn to these
 * points, and consequences such as a spark appear at them.
 */
export const PART_ANCHORS: Record<string, Record<string, Vec3>> = {
  battery: { terminal_neg: [-0.62, 1.15, 0], terminal_pos: [0.62, 1.15, 0] },
  earth_point: { body: [0.35, 1.0, 0.2] },
  multimeter: { display: [0, 0.4, -0.5], body: [0, 0.3, 0] },
  fusebox: { body: [0, 0.3, 0] },
  engine: { belt: [0, 0.5, 0.5] },
  consumer_unit: { body: [0, 0.4, 0.3] },
  proving_unit: { body: [0, 0.35, 0] },
  socket: { body: [0, 0.6, 0] },
  cable_run: { end_a: [-1.4, 0.3, 0], end_b: [1.4, 0.3, 0] },
};

export function partAnchor(kind: string, part: string): Vec3 {
  return PART_ANCHORS[kind]?.[part] ?? [0, 0.35, 0];
}
