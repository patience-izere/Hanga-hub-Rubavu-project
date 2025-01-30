from django.db import models

# Create your models here.

# lab/models.py
from django.db import models
from django.contrib.auth.models import User

class MechanicalObject(models.Model):
    name = models.CharField(max_length=100)
    position_x = models.FloatField()
    position_y = models.FloatField()
    position_z = models.FloatField()
    rotation = models.FloatField(default=0.0)

    def __str__(self):
        return self.name
    
class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    birth_date = models.DateField(null=True, blank=True)
    organization = models.CharField(max_length=100, blank=True)
    phone_number = models.CharField(max_length=20, blank=True)

    def __str__(self):
        return self.user.username

class UserProgress(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    score = models.IntegerField(default=0)
    last_modified = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return self.user
class ThreeDModel(models.Model):
    name = models.CharField(max_length=100)
    description = models.TextField()
    thumbnail = models.ImageField(upload_to='model_thumbnails/', null=True, blank=True)
    model_file = models.FileField(upload_to='3d_models/')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = '3d_models'
        ordering = ['-created_at']

    def __str__(self):
        return self.name
    