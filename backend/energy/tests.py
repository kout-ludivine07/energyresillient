from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from .models import Profile, OutageEvent
from .services import risk_assessment, train_clusters
User = get_user_model()

class EnergyApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="SafePassword123")
        self.profile = Profile.objects.create(user=self.user, grid="RIS/SIG", region="North-West", city="Bamenda")
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_profile_region_does_not_require_gps(self):
        response = self.client.get("/api/profile/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["region"], "North-West")

    def test_sparse_data_does_not_invent_risk_probability(self):
        result = risk_assessment("RIS/SIG", "North-West", self.profile)
        self.assertEqual(result["level"], "insufficient_data")
        self.assertIsNone(result["score"])
        self.assertEqual(result["score_type"], "rule_score_not_probability")

    def test_report_location_removed_without_consent(self):
        response = self.client.post("/api/reports/", {
            "kind":"outage","grid":"RIS/SIG","region":"North-West","city":"Bamenda",
            "latitude":4.05,"longitude":9.70,"accuracy_m":20,"location_consent":False,
            "client_report_id":"test-no-consent-001","note":"Test report"
        }, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertIsNone(response.data["latitude"])
        self.assertIsNone(response.data["longitude"])

    def test_kmeans_refuses_sparse_events(self):
        run = train_clusters()
        self.assertEqual(run.status, "insufficient_data")
