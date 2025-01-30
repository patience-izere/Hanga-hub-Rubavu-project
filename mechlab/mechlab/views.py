from django.shortcuts import render

def home(request):
    return render(request, 'lab/templates/index_home.html')