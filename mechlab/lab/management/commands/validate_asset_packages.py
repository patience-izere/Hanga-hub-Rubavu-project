from pathlib import Path, PurePosixPath

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from lab.models import AssetPackage

ALLOWED_EXTENSIONS = {
    ".gltf",
    ".glb",
    ".ktx2",
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".mp4",
    ".webm",
    ".vtt",
}
ALLOWED_MIME_TYPES = {
    "model/gltf+json",
    "model/gltf-binary",
    "image/ktx2",
    "image/png",
    "image/jpeg",
    "image/webp",
    "video/mp4",
    "video/webm",
    "text/vtt",
}
PUBLIC_3D_EXTENSIONS = {".glb", ".gltf", ".obj", ".fbx", ".dae", ".stl"}


class Command(BaseCommand):
    help = "Validate versioned 3D/AR asset manifests, licenses, file metadata, and budgets."

    def add_arguments(self, parser):
        parser.add_argument(
            "--strict",
            action="store_true",
            help="Treat prototype assets and packages without real files as failures.",
        )

    def handle(self, *args, **options):
        findings = []
        public_asset_findings = []
        public_model_root = Path(settings.BASE_DIR) / "static" / "lab" / "models"
        if public_model_root.exists():
            for path in public_model_root.rglob("*"):
                if path.is_file() and path.suffix.lower() in PUBLIC_3D_EXTENSIONS:
                    public_asset_findings.append(
                        f"{path.relative_to(settings.BASE_DIR)}: unversioned 3D assets must be "
                        "moved to quarantine or uploaded through a licensed AssetPackage"
                    )
        findings.extend(public_asset_findings)
        packages = AssetPackage.objects.prefetch_related("files").order_by(
            "course_id", "code", "version"
        )
        for package in packages:
            manifest = package.manifest
            prefix = f"{package.code} v{package.version}"
            if not isinstance(manifest, dict):
                findings.append(f"{prefix}: manifest must be an object")
                continue
            if not manifest.get("licenseStatus"):
                findings.append(f"{prefix}: licenseStatus is required")
            tiers = manifest.get("qualityTiers")
            if not isinstance(tiers, dict) or not tiers:
                findings.append(f"{prefix}: qualityTiers must define at least one delivery tier")
            else:
                for tier, budget in tiers.items():
                    if not isinstance(budget, dict) or int(budget.get("maximumBytes", 0)) <= 0:
                        findings.append(f"{prefix}: {tier} quality tier requires maximumBytes")
                        continue
                    for metric in [
                        "maximumTextureDimension",
                        "maximumTriangles",
                        "maximumDrawCalls",
                        "maximumMaterials",
                    ]:
                        if int(budget.get(metric, 0)) <= 0:
                            findings.append(f"{prefix}: {tier} quality tier requires {metric}")
            files = list(package.files.all())
            if options["strict"] and not files:
                findings.append(f"{prefix}: strict validation requires at least one asset file")
            if options["strict"] and manifest.get("productionReplacementRequired"):
                findings.append(
                    f"{prefix}: prototype package still requires production replacement"
                )
            total = 0
            for asset in files:
                total += asset.byte_size
                suffix = PurePosixPath(asset.path).suffix.lower()
                if suffix not in ALLOWED_EXTENSIONS:
                    findings.append(f"{prefix}: unsupported extension for {asset.path}")
                if asset.mime_type not in ALLOWED_MIME_TYPES:
                    findings.append(f"{prefix}: unsupported MIME type for {asset.path}")
                if not asset.role:
                    findings.append(f"{prefix}: asset role is required for {asset.path}")
                if len(asset.sha256) != 64:
                    findings.append(f"{prefix}: SHA-256 is invalid for {asset.path}")
            if total != package.total_byte_size:
                findings.append(
                    f"{prefix}: total_byte_size={package.total_byte_size} but files total {total}"
                )

        if findings:
            for finding in findings:
                self.stderr.write(self.style.WARNING(f"- {finding}"))
            if options["strict"] or public_asset_findings:
                raise CommandError(f"Asset validation failed with {len(findings)} finding(s).")
            self.stdout.write(
                self.style.WARNING(
                    f"Validated {packages.count()} asset package(s) with {len(findings)} warning(s)."
                )
            )
            return
        self.stdout.write(self.style.SUCCESS(f"Validated {packages.count()} asset package(s)."))
