from django.shortcuts import render, redirect
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from .models import MechanicalObject, UserProgress
from django.views.decorators.csrf import csrf_exempt
import json
from django.utils.html import format_html
from django.urls import reverse
from .models import UserProfile
from django.contrib.auth.models import User
from rest_framework import viewsets
from rest_framework.response import Response
from .models import ThreeDModel
from .serializers import ThreeDModelSerializer


# Create your views here.

# lab/views.py

from django.shortcuts import render

def home(request):
    return render(request, 'lab/home.html')


# Login View
def login_view(request):
    if request.method == 'POST':
        username = request.POST['username']
        password = request.POST['password']
        user = authenticate(request, username=username, password=password)
        if user is not None:
            login(request, user)
            return redirect('../lab/')
        else:
            return render(request, 'login.html', {'error': 'Invalid credentials'})
    return render(request, 'login.html')


# Other view functions...

def signup_view(request):
    if request.method == 'POST':
        first_name = request.POST['first_name']
        last_name = request.POST['last_name']
        birth_date = request.POST['birth_date']
        organization = request.POST['organization']
        email = request.POST['email']
        password = request.POST['password']
        confirm_password = request.POST['confirm_password']
        phone_number = request.POST['phone_number']

        if password == confirm_password:
            if User.objects.filter(email=email).exists():
                # User already exists, provide a link to the login page instead of redirecting
                error = format_html('<a href="{}">Email already exists. Please sign in instead.</a>', reverse('login'))
                return render(request, 'signup.html', {'error': error})
            else:
                user = User.objects.create_user(username=email, email=email, password=password)
                user.first_name = first_name
                user.last_name = last_name
                user.save()

                # Additional fields
                user_profile = UserProfile(user=user, birth_date=birth_date, organization=organization, phone_number=phone_number)
                user_profile.save()

                login(request, user)
                return redirect('home')
        else:
            error = 'Passwords do not match.'
            return render(request, 'signup.html', {'error': error})

    return render(request, 'signup.html')



# Logout View
def logout_view(request):
    logout(request)
    #return redirect('home')
    return render(request, 'lab/home.html')

# Lab Page - Requires Authentication


@login_required
def lab_view(request):
    return render(request, 'lab/lab.html')

def support(request):
    return render(request, 'lab/support.html')

def live_chat(request):
    return render(request, 'lab/live_chat.html')




def index(request):
    return render(request, 'lab/index.html')

@login_required
def get_lab_state(request):
    objects = MechanicalObject.objects.all()
    data = [{"name": obj.name, "x": obj.position_x, "y": obj.position_y, "z": obj.position_z, "rotation": obj.rotation} for obj in objects]
    return JsonResponse({"mechanical_objectss": data})

@login_required
@csrf_exempt
def save_progress(request):
    if request.method == "POST":
        body = json.loads(request.body)
        user_progress, created = UserProgress.objects.get_or_create(user=request.user)
        user_progress.score = body['score']
        user_progress.save()
        return JsonResponse({"status": "success", "message": "Progress saved"})
    return JsonResponse({"status": "failed", "message": "Invalid method"}, status=405)


class ThreeDModelViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ThreeDModel.objects.all()
    serializer_class = ThreeDModelSerializer