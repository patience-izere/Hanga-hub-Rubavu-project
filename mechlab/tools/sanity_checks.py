import os
import sys
import django

# Ensure project package is importable (add project root to path)
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mechlab.settings')
django.setup()

from django.test import Client
from django.contrib.auth.models import User
from django.conf import settings

# Allow the test client host
if 'testserver' not in settings.ALLOWED_HOSTS:
    settings.ALLOWED_HOSTS = list(settings.ALLOWED_HOSTS) + ['testserver']

client = Client()

def report(path, method='get', data=None, follow=False):
    if method == 'get':
        resp = client.get(path)
    else:
        resp = client.post(path, data or {}, follow=follow)
    print(f"{method.upper()} {path} -> {resp.status_code}")
    if resp.status_code in (301, 302) and not follow:
        print(f" Redirects to: {resp['Location']}")
    return resp

def run():
    print('Running sanity checks...')
    report('/')
    report('/lab/')
    report('/lab/live-chat/')
    report('/lab/login/')
    report('/lab/signup/')

    # Try to create a test user via signup POST (test client bypasses CSRF by default)
    test_email = 'sanitytest@example.com'
    if User.objects.filter(username=test_email).exists():
        print('Test user already exists; deleting to re-test signup flow.')
        User.objects.filter(username=test_email).delete()

    signup_data = {
        'first_name': 'Sanity',
        'last_name': 'Check',
        'birth_date': '1990-01-01',
        'organization': 'TestOrg',
        'email': test_email,
        'password': 's3cur3pass',
        'confirm_password': 's3cur3pass',
        'phone_number': '0000000000',
    }

    resp = report('/lab/signup/', method='post', data=signup_data, follow=True)
    print('After signup, final path:', resp.request.get('PATH_INFO'))

    # Check that we can access the lab page which requires login
    resp = report('/lab/')
    # If redirected to login, print that
    if resp.status_code in (301,302):
        print('Accessing /lab/ redirected (not logged in).')
    else:
        print('Accessing /lab/ OK (likely logged in).')

    # Test API endpoint
    resp = report('/lab/api/models/')
    try:
        print('API /lab/api/models/ JSON keys:', resp.json().keys() if resp.status_code==200 else 'N/A')
    except Exception:
        pass

    # Cleanup: remove test user
    try:
        User.objects.filter(username=test_email).delete()
        print('Cleaned up test user')
    except Exception as e:
        print('Cleanup failed:', e)

if __name__ == '__main__':
    run()
