from rest_framework import viewsets

from .asset_serializers import ThreeDModelSerializer
from .models import ThreeDModel


class ThreeDModelViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ThreeDModel.objects.all()
    serializer_class = ThreeDModelSerializer
