"""
Django settings for chatproject.
"""
import os
from pathlib import Path
from datetime import timedelta

import dj_database_url
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent


def env_bool(name, default=False):
    return os.environ.get(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


def env_list(name, default=()):
    return [value.strip() for value in os.environ.get(name, "").split(",") if value.strip()] or list(default)


DEBUG = env_bool("DJANGO_DEBUG", default=True)
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "")
if not SECRET_KEY:
    if not DEBUG:
        raise ImproperlyConfigured("DJANGO_SECRET_KEY must be set when DJANGO_DEBUG is false.")
    SECRET_KEY = "dev-only-secret-key-not-for-production"

RENDER_EXTERNAL_HOSTNAME = os.environ.get("RENDER_EXTERNAL_HOSTNAME", "").strip()
RENDER_FRONTEND_HOST = os.environ.get("RENDER_FRONTEND_HOST", "").strip()
ALLOWED_HOSTS = env_list(
    "DJANGO_ALLOWED_HOSTS",
    [RENDER_EXTERNAL_HOSTNAME] if RENDER_EXTERNAL_HOSTNAME else (["*"] if DEBUG else []),
)
if RENDER_FRONTEND_HOST and RENDER_FRONTEND_HOST not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append(RENDER_FRONTEND_HOST)

if not DEBUG:
    required_settings = {
        "DJANGO_ALLOWED_HOSTS": ALLOWED_HOSTS,
        "DATABASE_URL": os.environ.get("DATABASE_URL"),
        "REDIS_URL": os.environ.get("REDIS_URL"),
    }
    missing_settings = [name for name, value in required_settings.items() if not value]
    if missing_settings:
        raise ImproperlyConfigured(
            "Production settings are incomplete. Set: " + ", ".join(missing_settings)
        )

INSTALLED_APPS = [
    "daphne",  # must be first: provides the ASGI-capable runserver
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third party
    "rest_framework",
    "rest_framework.authtoken",
    "corsheaders",
    "channels",
    # Local
    "chat",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "chatproject.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
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

WSGI_APPLICATION = "chatproject.wsgi.application"
ASGI_APPLICATION = "chatproject.asgi.application"

# Database
DATABASE_URL = os.environ.get("DATABASE_URL")
if DATABASE_URL:
    DATABASES = {
        "default": dj_database_url.parse(
            DATABASE_URL,
            conn_max_age=600,
            ssl_require=not DEBUG,
        )
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 6}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = Path(os.environ.get("MEDIA_ROOT", str(BASE_DIR / "media")))
SERVE_MEDIA_FILES = env_bool("SERVE_MEDIA_FILES", default=DEBUG)
STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ---------------------------------------------------------------------------
# Django REST Framework
# ---------------------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.TokenAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
}

# ---------------------------------------------------------------------------
# CORS - allow the React dev server to talk to this API
# ---------------------------------------------------------------------------
CORS_ALLOWED_ORIGINS = env_list(
    "CORS_ALLOWED_ORIGINS",
    [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
)
if RENDER_FRONTEND_HOST:
    CORS_ALLOWED_ORIGINS.append(f"https://{RENDER_FRONTEND_HOST}")
CORS_ALLOW_CREDENTIALS = False
# In development allow any port (Vite may pick 5174, 3000, ...)
CORS_ALLOW_ALL_ORIGINS = DEBUG

CSRF_TRUSTED_ORIGINS = env_list(
    "CSRF_TRUSTED_ORIGINS",
    [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        *([f"https://{RENDER_FRONTEND_HOST}"] if RENDER_FRONTEND_HOST else []),
    ],
)

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = env_bool("DJANGO_SECURE_SSL_REDIRECT", default=not DEBUG)
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
SECURE_HSTS_SECONDS = 31536000 if not DEBUG else 0
SECURE_CONTENT_TYPE_NOSNIFF = True

# ---------------------------------------------------------------------------
# Channels
# ---------------------------------------------------------------------------
REDIS_URL = os.environ.get("REDIS_URL")
if REDIS_URL:
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels_redis.core.RedisChannelLayer",
            "CONFIG": {"hosts": [REDIS_URL]},
        }
    }
else:
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels.layers.InMemoryChannelLayer",
        }
    }
