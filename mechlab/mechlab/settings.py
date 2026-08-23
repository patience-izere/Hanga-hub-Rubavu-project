"""Django settings for the OPedu platform."""

from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import unquote, urlparse

from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BASE_DIR.parent
# load_dotenv(PROJECT_ROOT / ".env")
load_dotenv(BASE_DIR / ".env")


def env_bool(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def env_list(name: str, default: str = "") -> list[str]:
    return [item.strip() for item in os.environ.get(name, default).split(",") if item.strip()]


DEBUG = env_bool("DJANGO_DEBUG", False)

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY")
if not SECRET_KEY:
    if DEBUG:
        SECRET_KEY = "unsafe-development-key-change-me"
    else:
        raise ImproperlyConfigured("DJANGO_SECRET_KEY must be set when DJANGO_DEBUG is false.")

ALLOWED_HOSTS = env_list(
    "DJANGO_ALLOWED_HOSTS",
    "localhost,127.0.0.1,testserver" if DEBUG else "",
)
if not ALLOWED_HOSTS:
    raise ImproperlyConfigured("DJANGO_ALLOWED_HOSTS must contain at least one hostname.")

CSRF_TRUSTED_ORIGINS = env_list(
    "DJANGO_CSRF_TRUSTED_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173" if DEBUG else "",
)
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173").rstrip("/")
OPEDU_RELEASE_VERSION = os.environ.get("OPEDU_RELEASE_VERSION", "development")
if not DEBUG and not FRONTEND_URL.startswith("https://"):
    raise ImproperlyConfigured("FRONTEND_URL must use HTTPS when DJANGO_DEBUG is false.")
if not DEBUG and OPEDU_RELEASE_VERSION == "development":
    raise ImproperlyConfigured("OPEDU_RELEASE_VERSION must identify an immutable production build.")


INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "lab",
    "channels",
    "rest_framework",
    "drf_spectacular",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "lab.middleware.RequestObservabilityMiddleware",
    "lab.middleware.SecurityHeadersMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "mechlab.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "mechlab.wsgi.application"
ASGI_APPLICATION = "mechlab.asgi.application"


def database_from_url(url: str) -> dict[str, object]:
    parsed = urlparse(url)
    if parsed.scheme not in {"postgres", "postgresql"}:
        raise ImproperlyConfigured("DATABASE_URL must use postgres:// or postgresql://.")
    return {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": unquote(parsed.path.lstrip("/")),
        "USER": unquote(parsed.username or ""),
        "PASSWORD": unquote(parsed.password or ""),
        "HOST": parsed.hostname or "localhost",
        "PORT": parsed.port or 5432,
        "CONN_MAX_AGE": 60,
        "CONN_HEALTH_CHECKS": True,
    }


database_url = os.environ.get("DATABASE_URL")
use_sqlite = env_bool("DJANGO_USE_SQLITE", DEBUG and not database_url)
if database_url:
    DATABASES = {"default": database_from_url(database_url)}
elif use_sqlite:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }
else:
    raise ImproperlyConfigured("DATABASE_URL must be set unless DJANGO_USE_SQLITE=true.")


redis_url = os.environ.get("REDIS_URL")
require_redis = env_bool("OPEDU_REQUIRE_REDIS", not DEBUG)
if require_redis and not redis_url:
    raise ImproperlyConfigured("REDIS_URL is required when OPEDU_REQUIRE_REDIS is enabled.")
if redis_url:
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels_redis.core.RedisChannelLayer",
            "CONFIG": {"hosts": [redis_url]},
        }
    }
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": redis_url,
        }
    }
else:
    CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}
    CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}


AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = os.environ.get("DJANGO_TIME_ZONE", "Africa/Kigali")
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATICFILES_DIRS = [BASE_DIR / "static"]
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"
DATA_UPLOAD_MAX_MEMORY_SIZE = int(os.environ.get("DJANGO_MAX_REQUEST_BYTES", "26214400"))
FILE_UPLOAD_MAX_MEMORY_SIZE = int(os.environ.get("DJANGO_MAX_FILE_MEMORY_BYTES", "5242880"))

OBJECT_STORAGE_BUCKET = os.environ.get("OPEDU_OBJECT_STORAGE_BUCKET", "").strip()
REQUIRE_OBJECT_STORAGE = env_bool("OPEDU_REQUIRE_OBJECT_STORAGE", not DEBUG)
if REQUIRE_OBJECT_STORAGE and not OBJECT_STORAGE_BUCKET:
    raise ImproperlyConfigured(
        "OPEDU_OBJECT_STORAGE_BUCKET is required when OPEDU_REQUIRE_OBJECT_STORAGE is enabled."
    )

STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
        "OPTIONS": {"location": MEDIA_ROOT, "base_url": MEDIA_URL, "allow_overwrite": False},
    },
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}
if OBJECT_STORAGE_BUCKET:
    INSTALLED_APPS.append("storages")
    object_storage_endpoint = os.environ.get("OPEDU_OBJECT_STORAGE_ENDPOINT", "").strip()
    if object_storage_endpoint and not DEBUG and not object_storage_endpoint.startswith("https://"):
        raise ImproperlyConfigured("Production object-storage endpoints must use HTTPS.")
    signed_url_expiry = int(os.environ.get("OPEDU_MEDIA_URL_EXPIRY_SECONDS", "300"))
    if not 60 <= signed_url_expiry <= 3600:
        raise ImproperlyConfigured("OPEDU_MEDIA_URL_EXPIRY_SECONDS must be between 60 and 3600.")
    object_storage_prefix = os.environ.get("OPEDU_OBJECT_STORAGE_PREFIX", "media").strip("/")
    if not object_storage_prefix:
        raise ImproperlyConfigured("OPEDU_OBJECT_STORAGE_PREFIX cannot be empty.")
    storage_encryption = os.environ.get("OPEDU_OBJECT_STORAGE_ENCRYPTION", "AES256")
    object_storage_options = {
        "bucket_name": OBJECT_STORAGE_BUCKET,
        "region_name": os.environ.get("OPEDU_OBJECT_STORAGE_REGION", "").strip() or None,
        "endpoint_url": object_storage_endpoint or None,
        "default_acl": None,
        "querystring_auth": True,
        "querystring_expire": signed_url_expiry,
        "file_overwrite": False,
        "location": object_storage_prefix,
        "signature_version": "s3v4",
        "object_parameters": {
            "CacheControl": "private, max-age=300",
            "ServerSideEncryption": storage_encryption,
        },
    }
    if storage_encryption == "aws:kms":
        kms_key_id = os.environ.get("OPEDU_OBJECT_STORAGE_KMS_KEY_ID", "").strip()
        if not kms_key_id:
            raise ImproperlyConfigured(
                "OPEDU_OBJECT_STORAGE_KMS_KEY_ID is required for aws:kms encryption."
            )
        object_storage_options["object_parameters"]["SSEKMSKeyId"] = kms_key_id
    access_key = os.environ.get("OPEDU_OBJECT_STORAGE_ACCESS_KEY", "").strip()
    secret_key = os.environ.get("OPEDU_OBJECT_STORAGE_SECRET_KEY", "")
    if access_key:
        object_storage_options["access_key"] = access_key
    if secret_key:
        object_storage_options["secret_key"] = secret_key
    STORAGES["default"] = {
        "BACKEND": "storages.backends.s3.S3Storage",
        "OPTIONS": object_storage_options,
    }

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
LOGIN_URL = "login"
LOGIN_REDIRECT_URL = "lab"
LOGOUT_REDIRECT_URL = "home"

SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SECURE = not DEBUG
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SAMESITE = "Lax"
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"
EMAIL_BACKEND = os.environ.get(
    "DJANGO_EMAIL_BACKEND",
    "django.core.mail.backends.console.EmailBackend",
)
DEFAULT_FROM_EMAIL = os.environ.get("DJANGO_DEFAULT_FROM_EMAIL", "no-reply@opedu.local")
LRS_ENDPOINT = os.environ.get("OPEDU_LRS_ENDPOINT", "").strip()
LRS_KEY = os.environ.get("OPEDU_LRS_KEY", "")
LRS_SECRET = os.environ.get("OPEDU_LRS_SECRET", "")
LRS_MAX_DELIVERY_ATTEMPTS = int(os.environ.get("OPEDU_LRS_MAX_DELIVERY_ATTEMPTS", "5"))
RESEARCH_CONSENT_VERSION = os.environ.get(
    "OPEDU_RESEARCH_CONSENT_VERSION", "opedu-pilot-consent-v1"
)
RESEARCH_CONSENT_STATUS = os.environ.get("OPEDU_RESEARCH_CONSENT_STATUS", "draft").strip().lower()
if RESEARCH_CONSENT_STATUS not in {"draft", "approved"}:
    raise ImproperlyConfigured("OPEDU_RESEARCH_CONSENT_STATUS must be draft or approved.")
RESEARCH_RETENTION_DAYS = int(os.environ.get("OPEDU_RESEARCH_RETENTION_DAYS", "365"))
if RESEARCH_RETENTION_DAYS < 1:
    raise ImproperlyConfigured("OPEDU_RESEARCH_RETENTION_DAYS must be at least 1.")
LOGIN_FAILURE_LIMIT = int(os.environ.get("DJANGO_LOGIN_FAILURE_LIMIT", "5"))
LOGIN_LOCKOUT_SECONDS = int(os.environ.get("DJANGO_LOGIN_LOCKOUT_SECONDS", "300"))

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "loggers": {
        "opedu.requests": {
            "handlers": ["console"],
            "level": os.environ.get("DJANGO_REQUEST_LOG_LEVEL", "INFO"),
            "propagate": False,
        },
        "opedu.health": {"handlers": ["console"], "level": "WARNING", "propagate": False},
        "opedu.client_errors": {
            "handlers": ["console"],
            "level": "ERROR",
            "propagate": False,
        },
    },
}

if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_SSL_REDIRECT = env_bool("DJANGO_SECURE_SSL_REDIRECT", True)
    SECURE_HSTS_SECONDS = int(os.environ.get("DJANGO_HSTS_SECONDS", "31536000"))
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "EXCEPTION_HANDLER": "lab.api_exceptions.opedu_exception_handler",
    "DEFAULT_FILTER_BACKENDS": [
        "rest_framework.filters.OrderingFilter",
        "rest_framework.filters.SearchFilter",
    ],
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": os.environ.get("DJANGO_ANON_THROTTLE_RATE", "120/hour"),
        "user": os.environ.get("DJANGO_USER_THROTTLE_RATE", "1200/hour"),
    },
}

SPECTACULAR_SETTINGS = {
    "TITLE": "OPedu API",
    "DESCRIPTION": "School-scoped technical learning, simulation, and evidence API.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
    "ENUM_NAME_OVERRIDES": {
        "LessonPublicationStatusEnum": [
            ("draft", "Draft"),
            ("review", "In review"),
            ("approved", "Approved"),
            ("published", "Published"),
            ("retired", "Retired"),
        ],
        "AttemptStatusEnum": [
            ("in_progress", "In progress"),
            ("completed", "Completed"),
            ("requires_review", "Requires review"),
            ("abandoned", "Abandoned"),
        ],
        "AttemptOutcomeEnum": [
            ("pending", "Pending"),
            ("passed", "Passed"),
            ("failed", "Failed"),
            ("requires_review", "Requires review"),
            ("mastered", "Mastered"),
        ],
        "StepResultOutcomeEnum": [
            ("passed", "Passed"),
            ("failed", "Failed"),
            ("requires_review", "Requires review"),
        ],
        "AdaptiveRecommendationKindEnum": [
            ("continue", "Continue"),
            ("remediate", "Remediate"),
            ("retry", "Retry"),
            ("instructor_review", "Instructor review"),
            ("complete", "Complete"),
        ],
        "ResearchSurveyInstrumentEnum": [
            ("tam", "Technology Acceptance Model"),
            ("sus", "System Usability Scale"),
            ("pre_test", "Pre-test"),
            ("post_test", "Post-test"),
            ("transfer", "Practical transfer"),
            ("interview", "Interview"),
        ],
        "PilotObservationInstrumentEnum": [
            ("pre_test", "Pre-test"),
            ("post_test", "Post-test"),
            ("transfer", "Independent transfer rubric"),
            ("sus", "System Usability Scale"),
            ("tam", "Technology Acceptance Model"),
            ("learner_interview", "Learner interview codes"),
            ("instructor_interview", "Instructor interview codes"),
            ("instructor_workload", "Instructor workload"),
        ],
    },
}
