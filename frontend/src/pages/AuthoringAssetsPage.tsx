import { useState } from "react";

import {
  useAuthoredAssetPackages,
  usePublishAuthoredAssetPackage,
  useUploadAuthoredAsset,
} from "../learning/useContentAuthoring";

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
