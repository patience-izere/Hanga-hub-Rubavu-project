import { useEffect, useState } from "react";

import type { AuthoredScenario } from "../api/content";
import {
  useAuthoredAssetPackages,
  useAuthoredScenarios,
  useCloneAuthoredScenario,
  usePublishAuthoredScenario,
  useTransitionAuthoredScenario,
  usePublishAuthoredAssetPackage,
  useUploadAuthoredAsset,
  useUpdateAuthoredScenario,
} from "../learning/useContentAuthoring";

export function ContentAuthoringPage({ canPublish }: { canPublish: boolean }) {
  const scenarios = useAuthoredScenarios();
  const update = useUpdateAuthoredScenario();
  const clone = useCloneAuthoredScenario();
  const publish = usePublishAuthoredScenario();
  const transition = useTransitionAuthoredScenario();
  const assetPackages = useAuthoredAssetPackages();
  const uploadAsset = useUploadAuthoredAsset();
  const publishAsset = usePublishAuthoredAssetPackage();
  const [selectedId, setSelectedId] = useState(0);
  const [title, setTitle] = useState("");
  const [definition, setDefinition] = useState("");
  const [validationError, setValidationError] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [selectedPackageId, setSelectedPackageId] = useState(0);
  const [assetFile, setAssetFile] = useState<File | null>(null);
  const [assetRole, setAssetRole] = useState("primary-scene");
  const [assetLicense, setAssetLicense] = useState("CC-BY-4.0");
  const [assetAttribution, setAssetAttribution] = useState("");
  const [assetAltText, setAssetAltText] = useState("");
  const [assetTranscript, setAssetTranscript] = useState("");

  const selected = scenarios.data?.find((scenario) => scenario.id === selectedId);
  const selectedPackage =
    assetPackages.data?.find((item) => item.id === selectedPackageId) ?? assetPackages.data?.[0];
  let previewSteps: Array<Record<string, unknown>> = [];
  let parsedDefinition: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(definition) as Record<string, unknown> & {
      steps?: Array<Record<string, unknown>>;
    };
    parsedDefinition = parsed;
    previewSteps = Array.isArray(parsed.steps) ? parsed.steps : [];
  } catch {
    previewSteps = [];
  }
  const firstAnchor =
    Array.isArray(parsedDefinition.anchors) && parsedDefinition.anchors.length
      ? (parsedDefinition.anchors[0] as Record<string, unknown>)
      : { code: "rig-origin", x: 0, y: 0, z: 0 };
  useEffect(() => {
    if (!selected) return;
    setTitle(selected.title);
    setDefinition(JSON.stringify(selected.definition, null, 2));
    setValidationError("");
    setReviewNotes(selected.reviewNotes);
  }, [selected]);

  const chooseScenario = (scenario: AuthoredScenario) => setSelectedId(scenario.id);

  function changeDefinition(change: (current: Record<string, unknown>) => void) {
    try {
      const current = JSON.parse(definition) as Record<string, unknown>;
      change(current);
      setDefinition(JSON.stringify(current, null, 2));
      setValidationError("");
    } catch {
      setValidationError("Fix the JSON definition before using the structured editor.");
    }
  }

  function changeStep(index: number, field: string, value: unknown) {
    changeDefinition((current) => {
      const steps = Array.isArray(current.steps)
        ? (current.steps as Array<Record<string, unknown>>)
        : [];
      steps[index] = { ...steps[index], [field]: value };
      current.steps = steps;
    });
  }

  function changeAnchor(field: "x" | "y" | "z", value: number) {
    changeDefinition((current) => {
      const anchors = Array.isArray(current.anchors)
        ? (current.anchors as Array<Record<string, unknown>>)
        : [{ code: "rig-origin", x: 0, y: 0, z: 0 }];
      anchors[0] = { ...anchors[0], [field]: value };
      current.anchors = anchors;
    });
  }

  return (
    <section className="dashboard authoring-page">
      <div className="dashboard-heading">
        <div>
          <div className="eyebrow">Validated content workflow</div>
          <h1>Scenario authoring</h1>
          <p>
            Clone an approved version, edit its renderer-neutral definition, preview the data, and
            submit a complete draft for administrator publication.
          </p>
        </div>
      </div>
      {scenarios.isPending ? <p className="panel-status">Loading scenarios…</p> : null}
      {scenarios.isError ? (
        <p className="form-error" role="alert">
          Scenario content could not be loaded.
        </p>
      ) : null}
      <div className="authoring-grid">
        <aside className="lesson-panel" aria-label="Scenario versions">
          <h2>School scenarios</h2>
          {scenarios.data?.map((scenario) => (
            <button
              className={scenario.id === selectedId ? "authoring-item active" : "authoring-item"}
              key={scenario.id}
              onClick={() => chooseScenario(scenario)}
              type="button"
            >
              <strong>{scenario.title}</strong>
              <span>
                Version {scenario.version} · {scenario.status}
              </span>
            </button>
          ))}
        </aside>
        <article className="lesson-panel">
          {!selected ? (
            <p>Select a scenario version to inspect or clone it into a safe draft.</p>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                try {
                  const parsed = JSON.parse(definition) as Record<string, unknown>;
                  setValidationError("");
                  update.mutate({ id: selected.id, title, definition: parsed });
                } catch {
                  setValidationError("The scenario definition must be valid JSON.");
                }
              }}
            >
              <div className="authoring-actions">
                <span className="status-badge">{selected.status}</span>
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={clone.isPending}
                  onClick={() => clone.mutate(selected.id)}
                >
                  Clone as new draft
                </button>
                {selected.status === "draft" ? (
                  <button
                    className="button button-secondary"
                    type="button"
                    disabled={transition.isPending || !selected.publicationChecks.ready}
                    onClick={() => transition.mutate({ id: selected.id, action: "submit" })}
                  >
                    Submit for review
                  </button>
                ) : null}
                {selected.status === "review" && canPublish ? (
                  <button
                    className="button button-secondary"
                    type="button"
                    disabled={transition.isPending || !selected.publicationChecks.ready}
                    onClick={() =>
                      transition.mutate({ id: selected.id, action: "approve", reviewNotes })
                    }
                  >
                    Approve validated scenario
                  </button>
                ) : null}
                {selected.status === "approved" && canPublish ? (
                  <button
                    className="button button-secondary"
                    type="button"
                    disabled={publish.isPending}
                    onClick={() => publish.mutate(selected.id)}
                  >
                    Publish approved scenario
                  </button>
                ) : null}
                {selected.status === "published" && canPublish ? (
                  <button
                    className="button button-secondary"
                    type="button"
                    disabled={transition.isPending}
                    onClick={() => transition.mutate({ id: selected.id, action: "retire" })}
                  >
                    Retire version
                  </button>
                ) : null}
              </div>
              <label>
                Scenario title
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  disabled={selected.status !== "draft"}
                />
              </label>
              {selected.status === "draft" ? (
                <section className="authoring-preview" aria-label="Structured scenario editor">
                  <span className="eyebrow">Low-code editor</span>
                  <h3>Steps, evidence, safety, and fallback</h3>
                  {previewSteps.map((step, index) => (
                    <fieldset key={String(step.code ?? index)}>
                      <legend>Step {index + 1}</legend>
                      <label>
                        Stable step code
                        <input
                          value={String(step.code ?? "")}
                          onChange={(event) => changeStep(index, "code", event.target.value)}
                        />
                      </label>
                      <label>
                        Learner title
                        <input
                          value={String(step.title ?? "")}
                          onChange={(event) => changeStep(index, "title", event.target.value)}
                        />
                      </label>
                      <label>
                        Instruction
                        <textarea
                          rows={3}
                          value={String(step.instruction ?? "")}
                          onChange={(event) => changeStep(index, "instruction", event.target.value)}
                        />
                      </label>
                      <label>
                        Stable action code
                        <input
                          value={String(step.action_code ?? "")}
                          onChange={(event) => {
                            const actionCode = event.target.value;
                            changeDefinition((current) => {
                              const steps = current.steps as Array<Record<string, unknown>>;
                              steps[index] = {
                                ...steps[index],
                                action_code: actionCode,
                                acceptable_actions: [
                                  {
                                    action_code: actionCode,
                                    label: String(steps[index].title ?? actionCode),
                                    is_primary: true,
                                  },
                                ],
                              };
                            });
                          }}
                        />
                      </label>
                      <label>
                        Competency codes (comma separated)
                        <input
                          value={
                            Array.isArray(step.competency_codes)
                              ? step.competency_codes.join(", ")
                              : ""
                          }
                          onChange={(event) =>
                            changeStep(
                              index,
                              "competency_codes",
                              event.target.value
                                .split(",")
                                .map((value) => value.trim())
                                .filter(Boolean),
                            )
                          }
                        />
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={step.safety_critical === true}
                          onChange={(event) =>
                            changeStep(index, "safety_critical", event.target.checked)
                          }
                        />
                        Safety-critical action
                      </label>
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() =>
                          changeDefinition((current) => {
                            const steps = current.steps as Array<Record<string, unknown>>;
                            current.steps = steps
                              .filter((_, stepIndex) => stepIndex !== index)
                              .map((item, stepIndex) => ({ ...item, order: stepIndex + 1 }));
                          })
                        }
                      >
                        Remove step
                      </button>
                    </fieldset>
                  ))}
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() =>
                      changeDefinition((current) => {
                        const steps = Array.isArray(current.steps)
                          ? (current.steps as Array<Record<string, unknown>>)
                          : [];
                        const order = steps.length + 1;
                        steps.push({
                          order,
                          code: `step-${order}`,
                          title: `Procedure step ${order}`,
                          instruction: "Describe the observable learner action.",
                          action_code: `complete_step_${order}`,
                          acceptable_actions: [
                            {
                              action_code: `complete_step_${order}`,
                              label: `Complete step ${order}`,
                              is_primary: true,
                            },
                          ],
                          tools: [],
                          hazards: [],
                          hints: [],
                          competency_codes: [],
                          safety_critical: false,
                        });
                        current.steps = steps;
                      })
                    }
                  >
                    Add procedure step
                  </button>
                  <h3>Marker and anchor configuration</h3>
                  <label>
                    Marker target value
                    <input
                      value={String(
                        (
                          (parsedDefinition.renderers as Record<string, unknown> | undefined)
                            ?.marker_ar as Record<string, unknown> | undefined
                        )?.targetValue ?? "",
                      )}
                      onChange={(event) =>
                        changeDefinition((current) => {
                          const renderers = (current.renderers ?? {}) as Record<string, unknown>;
                          const marker = (renderers.marker_ar ?? {}) as Record<string, unknown>;
                          marker.targetValue = event.target.value;
                          marker.targetType = "qr-fiducial";
                          marker.enabled = true;
                          marker.manualControlledRigFallback = true;
                          renderers.marker_ar = marker;
                          current.renderers = renderers;
                        })
                      }
                    />
                  </label>
                  <div className="anchor-editor-grid">
                    {(["x", "y", "z"] as const).map((axis) => (
                      <label key={axis}>
                        Anchor {axis.toUpperCase()} offset ·{" "}
                        {Number(firstAnchor[axis] ?? 0).toFixed(2)} m
                        <input
                          type="range"
                          min={-1}
                          max={1}
                          step={0.05}
                          value={Number(firstAnchor[axis] ?? 0)}
                          onChange={(event) => changeAnchor(axis, Number(event.target.value))}
                        />
                      </label>
                    ))}
                  </div>
                  <div className="anchor-placement-preview" aria-label="Anchor placement preview">
                    <span>Printed marker · controlled-rig origin</span>
                    <i
                      aria-hidden="true"
                      style={{
                        left: `${50 + Number(firstAnchor.x ?? 0) * 35}%`,
                        top: `${50 - Number(firstAnchor.y ?? 0) * 35}%`,
                        transform: `scale(${1 + Number(firstAnchor.z ?? 0) * 0.25})`,
                      }}
                    />
                  </div>
                  <p>
                    Drag the axis controls to preview the guidance origin. Final physical alignment
                    still requires the approved rig and instructor review.
                  </p>
                </section>
              ) : null}
              <section className="authoring-preview" aria-label="Non-assessment scenario preview">
                <span className="eyebrow">Preview · no assessment evidence recorded</span>
                <h3>Procedure sequence</h3>
                {previewSteps.length ? (
                  <ol>
                    {previewSteps.map((step, index) => (
                      <li key={String(step.code ?? index)}>
                        <strong>{String(step.title ?? step.code ?? `Step ${index + 1}`)}</strong>
                        <p>{String(step.instruction ?? "No learner instruction supplied.")}</p>
                        <small>Action: {String(step.action_code ?? "missing")}</small>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p>Add valid scenario steps to see the safe preview.</p>
                )}
              </section>
              <label>
                Renderer-neutral scenario definition
                <textarea
                  rows={24}
                  value={definition}
                  onChange={(event) => setDefinition(event.target.value)}
                  disabled={selected.status !== "draft"}
                  spellCheck={false}
                />
              </label>
              <p>
                Grading policy {selected.grading_policy} · asset package{" "}
                {selected.asset_package ?? "fallback only"}
              </p>
              <section className="authoring-preview" aria-live="polite">
                <strong>
                  Publication validation: {selected.publicationChecks.ready ? "ready" : "blocked"}
                </strong>
                {selected.publicationChecks.errors.length ? (
                  <ul>
                    {selected.publicationChecks.errors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                ) : (
                  <p>All automated publication checks pass.</p>
                )}
              </section>
              {canPublish && ["review", "approved"].includes(selected.status) ? (
                <label>
                  Review notes
                  <textarea
                    rows={4}
                    value={reviewNotes}
                    onChange={(event) => setReviewNotes(event.target.value)}
                  />
                </label>
              ) : null}
              {canPublish && ["review", "approved"].includes(selected.status) ? (
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={transition.isPending || !reviewNotes.trim()}
                  onClick={() =>
                    transition.mutate({
                      id: selected.id,
                      action: "return_to_draft",
                      reviewNotes,
                    })
                  }
                >
                  Return to draft with notes
                </button>
              ) : null}
              {validationError ? (
                <p className="form-error" role="alert">
                  {validationError}
                </p>
              ) : null}
              {update.isError || publish.isError || clone.isError || transition.isError ? (
                <p className="form-error" role="alert">
                  The server rejected this change. Confirm safety, fallback, action, asset, and
                  competency requirements before publication.
                </p>
              ) : null}
              {selected.status === "draft" ? (
                <button className="button button-primary" disabled={update.isPending}>
                  {update.isPending ? "Saving…" : "Save draft"}
                </button>
              ) : null}
            </form>
          )}
        </article>
      </div>
      <section className="lesson-panel" aria-labelledby="asset-pipeline-title">
        <span className="eyebrow">Governed immersive assets</span>
        <h2 id="asset-pipeline-title">Validated glTF and media packages</h2>
        <p>
          Uploads are checked for type, declared MIME, size, glTF 2.0 structure, checksum,
          attribution, and generated performance metadata before an administrator can publish.
        </p>
        <label>
          Asset package
          <select
            value={selectedPackage?.id ?? ""}
            onChange={(event) => setSelectedPackageId(Number(event.target.value))}
          >
            {assetPackages.data?.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name} · v{item.version} · {item.status}
              </option>
            ))}
          </select>
        </label>
        {selectedPackage ? (
          <>
            <p>
              {selectedPackage.files.length} validated file(s) ·{" "}
              {Math.ceil(selectedPackage.total_byte_size / 1024)} KB · digest{" "}
              <code>{selectedPackage.sha256.slice(0, 16)}…</code>
            </p>
            <ul>
              {selectedPackage.files.map((file) => (
                <li key={file.id}>
                  <strong>{file.role}</strong> · {file.path} · {file.license_spdx} ·{" "}
                  {Math.ceil(file.byte_size / 1024)} KB
                </li>
              ))}
            </ul>
            {selectedPackage.status === "draft" ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!assetFile) return;
                  uploadAsset.mutate({
                    packageId: selectedPackage.id,
                    file: assetFile,
                    role: assetRole,
                    licenseSpdx: assetLicense,
                    sourceAttribution: assetAttribution,
                    altText: assetAltText,
                    transcript: assetTranscript,
                  });
                }}
              >
                <label>
                  glTF, GLB, KTX2, or fallback image
                  <input
                    type="file"
                    accept=".gltf,.glb,.ktx2,.png,.jpg,.jpeg,.webp,.mp4,.webm,.vtt"
                    onChange={(event) => setAssetFile(event.target.files?.[0] ?? null)}
                  />
                </label>
                <label>
                  Delivery role
                  <select value={assetRole} onChange={(event) => setAssetRole(event.target.value)}>
                    <option value="primary-scene">Primary scene</option>
                    <option value="scene-low">Low-quality scene</option>
                    <option value="scene-medium">Medium-quality scene</option>
                    <option value="scene-high">High-quality scene</option>
                    <option value="thumbnail">Thumbnail</option>
                    <option value="fallback-media">Accessible fallback media</option>
                    <option value="captions">Caption track</option>
                  </select>
                </label>
                <label>
                  SPDX license
                  <input
                    value={assetLicense}
                    onChange={(event) => setAssetLicense(event.target.value)}
                  />
                </label>
                <label>
                  Source and ownership attribution
                  <textarea
                    rows={3}
                    value={assetAttribution}
                    onChange={(event) => setAssetAttribution(event.target.value)}
                  />
                </label>
                <label>
                  Alternative text (required for fallback images)
                  <textarea
                    rows={2}
                    value={assetAltText}
                    onChange={(event) => setAssetAltText(event.target.value)}
                  />
                </label>
                <label>
                  Transcript (required for fallback video)
                  <textarea
                    rows={4}
                    value={assetTranscript}
                    onChange={(event) => setAssetTranscript(event.target.value)}
                  />
                </label>
                <button
                  className="button button-secondary"
                  disabled={
                    uploadAsset.isPending || !assetFile || !assetLicense || !assetAttribution.trim()
                  }
                >
                  {uploadAsset.isPending ? "Validating upload…" : "Validate and add asset"}
                </button>
                {canPublish ? (
                  <button
                    className="button button-primary"
                    type="button"
                    disabled={publishAsset.isPending}
                    onClick={() => publishAsset.mutate(selectedPackage.id)}
                  >
                    Publish validated asset package
                  </button>
                ) : null}
              </form>
            ) : null}
            {uploadAsset.isError || publishAsset.isError ? (
              <p className="form-error" role="alert">
                The asset package failed validation. Review its manifest, license, file metadata,
                and primary-scene role.
              </p>
            ) : null}
          </>
        ) : (
          <p>No asset package is available for this school yet.</p>
        )}
      </section>
    </section>
  );
}
