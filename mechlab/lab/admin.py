from django.contrib import admin

# Register your models here.
from .models import MechanicalObject, UserProgress

admin.site.register(MechanicalObject),
admin.site.register(UserProgress, )