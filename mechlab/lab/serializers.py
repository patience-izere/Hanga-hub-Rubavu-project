from rest_framework import serializers
from .models import ThreeDModel

class ThreeDModelSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()
    thumbnail_url = serializers.SerializerMethodField()

    class Meta:
        model = ThreeDModel
        fields = ['id', 'name', 'description', 'url', 'thumbnail_url']

    def get_url(self, obj):
        if obj.model_file:
            return obj.model_file.url
        return None

    def get_thumbnail_url(self, obj):
        if obj.thumbnail:
            return obj.thumbnail.url
        return None