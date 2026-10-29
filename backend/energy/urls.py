from django.urls import path
from .views import RegisterView, ProfileView, ReportListCreateView, health, dashboard, risk_view, train_view, events_map
urlpatterns = [
 path("health/", health),
 path("auth/register/", RegisterView.as_view()),
 path("profile/", ProfileView.as_view()),
 path("reports/", ReportListCreateView.as_view()),
 path("dashboard/", dashboard),
 path("risk/", risk_view),
 path("analytics/train/", train_view),
 path("map/zones/", events_map),
]
