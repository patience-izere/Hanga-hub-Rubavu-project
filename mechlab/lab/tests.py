from django.test import TestCase, override_settings
from django.urls import reverse
from django.contrib.auth.models import User
from .models import UserProfile


@override_settings(ALLOWED_HOSTS=['testserver', '127.0.0.1', 'localhost'])
class IntegrationTests(TestCase):
	def test_pages_and_signup_flow(self):
		# Home page
		resp = self.client.get(reverse('index_home'))
		self.assertEqual(resp.status_code, 200)

		# Lab page should redirect to login when not authenticated
		resp = self.client.get(reverse('lab'))
		self.assertIn(resp.status_code, (200, 302))

		# Live chat and support pages
		resp = self.client.get(reverse('live_chat'))
		self.assertEqual(resp.status_code, 200)

		# Signup a new user
		signup_url = reverse('signup')
		email = 'integtest@example.com'
		data = {
			'first_name': 'Integrate',
			'last_name': 'Tester',
			'birth_date': '1990-01-01',
			'organization': 'TestOrg',
			'email': email,
			'password': 'strong-pass-123',
			'confirm_password': 'strong-pass-123',
			'phone_number': '0000000000',
		}
		resp = self.client.post(signup_url, data, follow=True)
		# Should end up on a page (redirects followed)
		self.assertEqual(resp.status_code, 200)
		# User created
		user = User.objects.filter(username=email).first()
		self.assertIsNotNone(user)
		# Profile created
		self.assertTrue(UserProfile.objects.filter(user=user).exists())

		# Access lab while logged in
		resp = self.client.get(reverse('lab'))
		self.assertEqual(resp.status_code, 200)

		# Logout
		resp = self.client.get(reverse('logout'), follow=True)
		self.assertEqual(resp.status_code, 200)

	def test_signup_edge_cases(self):
		signup_url = reverse('signup')
		email = 'edgecase@example.com'
		data = {
			'first_name': 'Edge',
			'last_name': 'Case',
			'birth_date': '1990-01-01',
			'organization': 'TestOrg',
			'email': email,
			'password': 'pass1',
			'confirm_password': 'pass1',
			'phone_number': '0000000000',
		}
		# First signup should succeed
		resp1 = self.client.post(signup_url, data, follow=True)
		self.assertEqual(resp1.status_code, 200)
		self.assertTrue(User.objects.filter(username=email).exists())

		# Duplicate signup (same email) should not create another user and should show an error
		users_before = User.objects.filter(username=email).count()
		resp2 = self.client.post(signup_url, data)
		self.assertEqual(User.objects.filter(username=email).count(), users_before)
		self.assertContains(resp2, 'Email already exists', status_code=200)

		# Password mismatch
		bad = data.copy()
		bad['email'] = 'mismatch@example.com'
		bad['confirm_password'] = 'different'
		resp3 = self.client.post(signup_url, bad)
		self.assertContains(resp3, 'Passwords do not match', status_code=200)

	def test_login_logout_flow(self):
		# Create user directly
		email = 'loginflow@example.com'
		password = 'letmein123'
		user = User.objects.create_user(username=email, email=email, password=password)
		UserProfile.objects.create(user=user)

		login_url = reverse('login')
		resp = self.client.post(login_url, {'username': email, 'password': password}, follow=True)
		# After login, should be able to access lab
		self.assertEqual(resp.status_code, 200)
		resp = self.client.get(reverse('lab'))
		self.assertEqual(resp.status_code, 200)

		# Logout
		resp = self.client.get(reverse('logout'), follow=True)
		self.assertEqual(resp.status_code, 200)

