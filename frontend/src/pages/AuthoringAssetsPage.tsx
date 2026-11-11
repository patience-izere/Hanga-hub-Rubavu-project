import { FormEvent, useState } from "react";

import { describeApiError } from "../api/client";
import { EmptyState } from "../components/ui/EmptyState";
import {
  useAuthoredAssetPackages,
  useAuthoringCourses,
  useCreateAuthoredAssetPackage,
  useDeleteAuthoredAssetPackage,
  useRemoveAuthoredAssetFile,
  useUpdateAuthoredAssetPackage,
  usePublishAuthoredAssetPackage,
  useUploadAuthoredAsset,
} from "../learning/useContentAuthoring";

function slug(value: string) {
  return (
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "assets"
  );
}

/** Starts an empty draft package so files can be uploaded into it. */
function NewPackageForm({ onCreated }: { onCreated: (id: number) => void }) {
  const courses = useAuthoringCourses();
  const packages = useAuthoredAssetPackages();
  const create = useCreateAuthoredAssetPackage();
  const [courseId, setCourseId] = useState<number | "">("");
  const [name, setName] = useState("");

  const course = courseId === "" ? courses.data?.[0] : courses.data?.find((c) => c.id === courseId);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!course || create.isPending) return;
    const code = slug(name);
    // A new version of an existing package, or version 1 of a new one.
    const version =
      Math.max(
        0,
        ...(packages.data ?? [])
          .filter((item) => item.course === course.id && item.code === code)
          .map((item) => item.version),
      ) + 1;
    create.mutate(
      { course: course.id, code, version, name: name.trim() },
      {
        onSuccess: (created) => {
          setName("");
          onCreated(created.id);
        },
      },
    );
  }

  if (courses.data && courses.data.length === 0) {
    return (
      <p className="field-note">
        Create a course in the Module Studio first; asset packages belong to a course.
      </p>
    );
  }

  return (
    <form className="new-package-form" onSubmit={submit}>
      <h2>New asset package</h2>
      <label>
        Course
        <select
          value={course?.id ?? ""}
          onChange={(event) => setCourseId(Number(event.target.value))}
        >
          {courses.data?.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
      </label>
      <label>
        Package name
        <input
          required
          maxLength={180}
          value={name}
          placeholder="e.g. Brake workshop models"
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      {create.isError ? (
        <p className="form-error" role="alert">
          {describeApiError(create.error, "The package could not be created.")}
        </p>
      ) : null}
      <button className="button button-primary" disabled={create.isPending || !course}>
        {create.isPending ? "Creating…" : "Create draft package"}
      </button>
    </form>
  );
}

/**
 * Asset package management, split out of the scenario editor.
 *
 * Uploading and publishing media is a different job from authoring a procedure, and sharing one
 * scroll with the scenario editor made both harder to follow.
 */
export function AuthoringAssetsPage({ canPublish }: { canPublish: boolean }) {
  const assetPackages = useAuthoredAssetPackages();
  const uploadAsset = useUploadAuthoredAsset();
  const publishAsset = usePublishAuthoredAssetPackage();
  const removeFile = useRemoveAuthoredAssetFile();
  const renamePackage = useUpdateAuthoredAssetPackage();
  const deletePackage = useDeleteAuthoredAssetPackage();
  const [selectedPackageId, setSelectedPackageId] = useState(0);
  const [assetFile, setAssetFile] = useState<File | null>(null);
  const [assetRole, setAssetRole] = useState("primary-scene");
  const [assetLicense, setAssetLicense] = useState("CC-BY-4.0");
  const [assetAttribution, setAssetAttribution] = useState("");
  const [assetAltText, setAssetAltText] = useState("");
  const [assetTranscript, setAssetTranscript] = useState("");

  const selectedPackage =
    assetPackages.data?.find((item) => item.id === selectedPackageId) ?? assetPackages.data?.[0];

  return (
    <section className="dashboard authoring-assets">
      <div className="dashboard-heading">
        <div>
          <span className="eyebrow">Governed immersive assets</span>
          <h1>Asset packages.</h1>
          <p>
            Uploads are checked for type, declared MIME, size, glTF 2.0 structure, checksum,
            attribution, and generated performance metadata before an administrator can publish.
          </p>
        </div>
      </div>

      <section className="lesson-panel">
        <NewPackageForm onCreated={setSelectedPackageId} />
      </section>

      <section className="lesson-panel" aria-labelledby="asset-pipeline-title">
        <h2 id="asset-pipeline-title">Upload files</h2>
        <p className="field-note">
          Accepted: glTF or GLB models, KTX2 textures, PNG, JPEG or WebP images, MP4 or WebM video
          and VTT captions. Up to 25 MB per file. Files can be added only to a draft package.
        </p>
        <label>
          Asset package
          <select
            value={selectedPackage?.id ?? ""}
            onChange={(event) => setSelectedPackageId(Number(event.target.value))}
          >
            {assetPackages.data?.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name} · v{item.version} ·{" "}
                {item.status === "draft" ? "draft, can add files" : item.status}
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
                  {selectedPackage.status === "draft" ? (
                    <>
                      {" "}
                      <button
                        type="button"
                        className="button-link danger-link"
                        disabled={removeFile.isPending}
                        onClick={() => {
                          if (window.confirm(`Remove ${file.path} from this draft package?`)) {
                            removeFile.mutate({ packageId: selectedPackage.id, fileId: file.id });
                          }
                        }}
                      >
                        Remove
                      </button>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
            {selectedPackage.status === "draft" ? (
              <div className="button-row">
                <button
                  type="button"
                  className="button-link"
                  disabled={renamePackage.isPending}
                  onClick={() => {
                    const name = window.prompt("New name for this package", selectedPackage.name);
                    if (name && name.trim()) {
                      renamePackage.mutate({ id: selectedPackage.id, name: name.trim() });
                    }
                  }}
                >
                  Rename package
                </button>
                <button
                  type="button"
                  className="button-link danger-link"
                  disabled={deletePackage.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Delete the draft package "${selectedPackage.name}" and its files?`,
                      )
                    ) {
                      deletePackage.mutate(selectedPackage.id, {
                        onSuccess: () => setSelectedPackageId(0),
                      });
                    }
                  }}
                >
                  Delete draft package
                </button>
              </div>
            ) : null}
            {removeFile.isError || renamePackage.isError || deletePackage.isError ? (
              <p className="form-error" role="alert">
                {describeApiError(
                  removeFile.error ?? renamePackage.error ?? deletePackage.error,
                  "The package could not be changed.",
                )}
              </p>
            ) : null}
            {selectedPackage.status !== "draft" ? (
              <p className="field-note">
                This package is {selectedPackage.status}, so its files cannot change. Create a new
                draft package above to upload files.
              </p>
            ) : null}
            {selectedPackage.status === "draft" ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!assetFile || uploadAsset.isPending) return;
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
                {describeApiError(
                  uploadAsset.error ?? publishAsset.error,
                  "The asset package failed validation. Review its manifest, license, file metadata, and primary-scene role.",
                )}
              </p>
            ) : null}
            {uploadAsset.isSuccess ? (
              <p className="form-success" role="status">
                File validated and added.
              </p>
            ) : null}
          </>
        ) : (
          <EmptyState
            title="No asset packages yet"
            description="Create a draft package above, then upload its models and media here."
          />
        )}
      </section>
    </section>
  );
}
