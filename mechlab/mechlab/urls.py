"""Root URL configuration for OPedu."""

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from lab import urls as lab_urls

from mechlab import views

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include("lab.api_urls")),
    path("", views.home, name="index_home"),
    path("lab/", include(lab_urls)),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
