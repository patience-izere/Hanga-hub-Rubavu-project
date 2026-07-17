from rest_framework import serializers

from .models import ThreeDModel


class ThreeDModelSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()
    thumbnail_url = serializers.SerializerMethodField()

    class Meta:
        model = ThreeDModel
        fields = ["id", "name", "description", "url", "thumbnail_url"]

    def get_url(self, obj) -> str | None:
        if obj.model_file:
            return self._absolute(obj.model_file.url)
        return None

    def get_thumbnail_url(self, obj) -> str | None:
        if obj.thumbnail:
            return self._absolute(obj.thumbnail.url)
        return None

    def _absolute(self, url: str) -> str:
        request = self.context.get("request")
        return request.build_absolute_uri(url) if request else url
