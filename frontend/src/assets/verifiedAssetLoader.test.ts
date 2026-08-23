import { afterEach, describe, expect, it, vi } from "vitest";

import { AssetIntegrityError, loadVerifiedAsset } from "./verifiedAssetLoader";

const helloSha256 = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";

function descriptor(sha256 = helloSha256) {
  return {
    url: "http://localhost/media/assets/workshop.glb",
    path: "workshop.glb",
    mimeType: "model/gltf-binary",
    byteSize: 5,
    sha256,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("loadVerifiedAsset", () => {
  it("verifies a network response before caching it", async () => {
    const put = vi.fn();
    vi.stubGlobal("caches", {
      open: vi.fn().mockResolvedValue({ match: vi.fn(), put, delete: vi.fn() }),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("hello", {
          headers: { "content-type": "model/gltf-binary", "content-length": "5" },
        }),
      ),
    );
    const progress = vi.fn();

    const blob = await loadVerifiedAsset(descriptor(), { onProgress: progress, retries: 0 });

    expect(blob.size).toBe(5);
    expect(put).toHaveBeenCalledOnce();
    expect(progress).toHaveBeenLastCalledWith(
      expect.objectContaining({ loadedBytes: 5, percent: 100, source: "network" }),
    );
  });

  it("rejects a response whose digest differs from the immutable manifest", async () => {
    vi.stubGlobal("caches", {
      open: vi.fn().mockResolvedValue({ match: vi.fn(), put: vi.fn(), delete: vi.fn() }),
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("hello")));

    await expect(
      loadVerifiedAsset(descriptor("0".repeat(64)), { retries: 0 }),
    ).rejects.toBeInstanceOf(AssetIntegrityError);
  });

  it("uses a verified cached response without a network request", async () => {
    vi.stubGlobal("caches", {
      open: vi.fn().mockResolvedValue({
        match: vi.fn().mockResolvedValue(new Response("hello")),
        put: vi.fn(),
        delete: vi.fn(),
      }),
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const blob = await loadVerifiedAsset(descriptor());

    expect(blob.size).toBe(5);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
