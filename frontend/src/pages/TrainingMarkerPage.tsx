import QRCode from "qrcode";
import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

export function TrainingMarkerPage() {
  const [params] = useSearchParams();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const target = params.get("value") || "OPEDU-battery-testing-V1";

  useEffect(() => {
    if (!canvasRef.current) return;
    void QRCode.toCanvas(canvasRef.current, target, {
      width: 480,
      margin: 4,
      errorCorrectionLevel: "H",
      color: { dark: "#071d19", light: "#ffffff" },
    });
  }, [target]);

  return (
    <section className="training-marker-page">
      <div className="training-marker-sheet">
        <span className="eyebrow">OPedu controlled training target</span>
        <h1>Automotive battery practical</h1>
        <canvas ref={canvasRef} aria-label={`QR marker containing ${target}`} />
        <strong>{target}</strong>
        <p>
          Attach only to the approved, de-energized training rig. Keep the marker flat, well lit,
          and clear of terminals, controls, and hazard labels.
        </p>
        <p>Digital guidance does not replace qualified instructor supervision.</p>
        <button className="button button-primary marker-no-print" onClick={() => window.print()}>
          Print marker
        </button>
      </div>
    </section>
  );
}
