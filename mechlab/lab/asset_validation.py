import json
import struct
from io import BytesIO
from pathlib import PurePosixPath

from django.core.exceptions import ValidationError
from PIL import Image

ALLOWED_ASSET_MIME = {
    ".glb": "model/gltf-binary",
    ".gltf": "model/gltf+json",
    ".ktx2": "image/ktx2",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".vtt": "text/vtt",
}
MAX_UPLOAD_BYTES = 25_000_000


def _gltf_metrics(document):
    accessors = document.get("accessors", [])
    triangles = 0
    draw_calls = 0
    for mesh in document.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            draw_calls += 1
            accessor_index = primitive.get("indices")
            if isinstance(accessor_index, int) and accessor_index < len(accessors):
                triangles += int(accessors[accessor_index].get("count", 0)) // 3
    return {
        "gltfVersion": str(document.get("asset", {}).get("version", "")),
        "nodes": len(document.get("nodes", [])),
        "meshes": len(document.get("meshes", [])),
        "triangles": triangles,
        "drawCalls": draw_calls,
        "materials": len(document.get("materials", [])),
        "textures": len(document.get("textures", [])),
    }


def _glb_json(data):
    if len(data) < 20:
        raise ValidationError("GLB file is truncated.")
    magic, version, declared_length = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF" or version != 2 or declared_length != len(data):
        raise ValidationError("GLB requires a valid glTF 2.0 header and declared byte length.")
    chunk_length, chunk_type = struct.unpack_from("<II", data, 12)
    if chunk_type != 0x4E4F534A or 20 + chunk_length > len(data):
        raise ValidationError("GLB is missing its JSON scene chunk.")
    return json.loads(data[20 : 20 + chunk_length].decode("utf-8").rstrip("\x00 \t\r\n"))


def validate_asset_bytes(filename, mime_type, data):
    suffix = PurePosixPath(filename).suffix.lower()
    expected_mime = ALLOWED_ASSET_MIME.get(suffix)
    if expected_mime is None:
        raise ValidationError("Use glTF/GLB, KTX2, PNG, JPEG, WebP, MP4, WebM, or VTT assets.")
    if mime_type != expected_mime:
        raise ValidationError(f"{suffix} files require MIME type {expected_mime}.")
    if not data or len(data) > MAX_UPLOAD_BYTES:
        raise ValidationError(f"Asset size must be between 1 and {MAX_UPLOAD_BYTES} bytes.")
    if suffix == ".gltf":
        try:
            document = json.loads(data.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise ValidationError("The glTF JSON file is invalid.") from error
        metrics = _gltf_metrics(document)
        if metrics["gltfVersion"] != "2.0":
            raise ValidationError("Only glTF 2.0 assets are supported.")
        return metrics
    if suffix == ".glb":
        try:
            document = _glb_json(data)
        except (json.JSONDecodeError, UnicodeDecodeError) as error:
            raise ValidationError("The GLB JSON scene chunk is invalid.") from error
        metrics = _gltf_metrics(document)
        if metrics["gltfVersion"] != "2.0":
            raise ValidationError("Only glTF 2.0 assets are supported.")
        return metrics
    if suffix in {".png", ".jpg", ".jpeg", ".webp"}:
        try:
            with Image.open(BytesIO(data)) as image:
                image.verify()
                return {"width": image.width, "height": image.height, "format": image.format}
        except (OSError, ValueError) as error:
            raise ValidationError("The image payload is invalid.") from error
    if not data.startswith(b"\xabKTX 20\xbb\r\n\x1a\n"):
        if suffix == ".mp4" and len(data) >= 12 and data[4:8] == b"ftyp":
            return {"format": "MP4"}
        if suffix == ".webm" and data.startswith(b"\x1aE\xdf\xa3"):
            return {"format": "WebM"}
        if suffix == ".vtt" and data.lstrip().startswith(b"WEBVTT"):
            return {"format": "WebVTT"}
        raise ValidationError(f"The {suffix} file header is invalid.")
    return {"format": "KTX2"}


def package_publication_errors(package):
    errors = []
    manifest = package.manifest if isinstance(package.manifest, dict) else {}
    for field in ("schemaVersion", "curriculumOwner", "license", "qualityTiers"):
        if not manifest.get(field):
            errors.append(f"Manifest field {field} is required.")
    files = list(package.files.all())
    if not files:
        errors.append("At least one validated asset file is required.")
    if files and not any(file.role == "primary-scene" for file in files):
        errors.append("One file must use the primary-scene role.")
    if sum(file.byte_size for file in files) != package.total_byte_size:
        errors.append("Package byte size does not match its files.")
    quality_tiers = manifest.get("qualityTiers", {})
    for file in files:
        if not file.license_spdx or not file.source_attribution.strip():
            errors.append(f"{file.path} requires a license and source attribution.")
        if not isinstance(file.metadata, dict) or not file.metadata:
            errors.append(f"{file.path} requires generated validation metadata.")
            continue
        tier = file.role.removeprefix("scene-") if file.role.startswith("scene-") else "low"
        budget = quality_tiers.get(tier, {}) if isinstance(quality_tiers, dict) else {}
        comparisons = {
            "maximumBytes": file.byte_size,
            "maximumTriangles": file.metadata.get("triangles", 0),
            "maximumDrawCalls": file.metadata.get("drawCalls", 0),
            "maximumMaterials": file.metadata.get("materials", 0),
            "maximumTextureDimension": max(
                file.metadata.get("width", 0), file.metadata.get("height", 0)
            ),
        }
        for budget_name, actual in comparisons.items():
            maximum = budget.get(budget_name) if isinstance(budget, dict) else None
            if isinstance(maximum, (int, float)) and actual > maximum:
                errors.append(f"{file.path} exceeds {tier} {budget_name}: {actual} > {maximum}.")
    return errors
