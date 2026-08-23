export type VerifiedAssetDescriptor = {
  url: string;
  path: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
};

export type AssetLoadProgress = {
  loadedBytes: number;
  totalBytes: number;
  percent: number | null;
  source: "cache" | "network";
};

const CACHE_NAME = "opedu-verified-assets-v1";

export class AssetIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssetIntegrityError";
  }
}

function asHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function blobArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("The asset bytes could not be read."));
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(blob);
  });
}

async function verify(asset: VerifiedAssetDescriptor, blob: Blob) {
  if (asset.byteSize > 0 && blob.size !== asset.byteSize) {
    throw new AssetIntegrityError(
      `${asset.path} is ${blob.size} bytes; the manifest requires ${asset.byteSize}.`,
    );
  }
  if (!/^[0-9a-f]{64}$/.test(asset.sha256)) {
    throw new AssetIntegrityError(`${asset.path} has no valid SHA-256 manifest entry.`);
  }
  if (!globalThis.crypto?.subtle) {
    throw new AssetIntegrityError("This browser cannot verify downloaded asset integrity.");
  }
  const digest = asHex(
    await globalThis.crypto.subtle.digest("SHA-256", await blobArrayBuffer(blob)),
  );
  if (digest !== asset.sha256) {
    throw new AssetIntegrityError(`${asset.path} failed SHA-256 integrity verification.`);
  }
}

async function responseBlob(
  response: Response,
  asset: VerifiedAssetDescriptor,
  onProgress?: (progress: AssetLoadProgress) => void,
) {
  if (!response.body) {
    const blob = await response.blob();
    onProgress?.({
      loadedBytes: blob.size,
      totalBytes: asset.byteSize || blob.size,
      percent: 100,
      source: "network",
    });
    return blob;
  }

  const reader = response.body.getReader();
  const chunks: ArrayBuffer[] = [];
  let loadedBytes = 0;
  const headerSize = Number(response.headers.get("content-length")) || 0;
  const totalBytes = asset.byteSize || headerSize;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value.slice().buffer as ArrayBuffer);
    loadedBytes += value.byteLength;
    onProgress?.({
      loadedBytes,
      totalBytes,
      percent: totalBytes ? Math.min(100, Math.round((loadedBytes / totalBytes) * 100)) : null,
      source: "network",
    });
  }
  return new Blob(chunks, { type: asset.mimeType || response.headers.get("content-type") || "" });
}

function assetRequest(asset: VerifiedAssetDescriptor) {
  return new Request(asset.url, { credentials: "include" });
}

export async function loadVerifiedAsset(
  asset: VerifiedAssetDescriptor,
  options: {
    signal?: AbortSignal;
    retries?: number;
    onProgress?: (progress: AssetLoadProgress) => void;
  } = {},
) {
  const request = assetRequest(asset);
  const cache = "caches" in globalThis ? await caches.open(CACHE_NAME) : null;
  const cached = await cache?.match(request);
  if (cached) {
    try {
      const blob = await cached.blob();
      await verify(asset, blob);
      options.onProgress?.({
        loadedBytes: blob.size,
        totalBytes: asset.byteSize || blob.size,
        percent: 100,
        source: "cache",
      });
      return blob;
    } catch (error) {
      await cache?.delete(request);
      if (options.signal?.aborted) throw error;
    }
  }

  const attempts = Math.max(1, (options.retries ?? 2) + 1);
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(request.clone(), { signal: options.signal });
      if (!response.ok) {
        throw new Error(`Asset request failed with HTTP ${response.status}.`);
      }
      const blob = await responseBlob(response, asset, options.onProgress);
      await verify(asset, blob);
      await cache?.put(
        request,
        new Response(blob, {
          headers: { "content-type": asset.mimeType || blob.type || "application/octet-stream" },
        }),
      );
      return blob;
    } catch (error) {
      if (
        options.signal?.aborted ||
        (error instanceof DOMException && error.name === "AbortError")
      ) {
        throw error;
      }
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("The asset could not be loaded.");
}
