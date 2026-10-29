from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from .models import Profile, OutageReport, OutageEvent, ClusterRun
from .serializers import RegisterSerializer, ProfileSerializer, ReportSerializer
from .services import risk_assessment, train_clusters, link_reports_to_events
User = get_user_model()

class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]

class ProfileView(generics.RetrieveUpdateAPIView):
    serializer_class = ProfileSerializer
    def get_object(self):
        profile, _ = Profile.objects.get_or_create(user=self.request.user)
        return profile

class ReportListCreateView(generics.ListCreateAPIView):
    serializer_class = ReportSerializer
    def get_queryset(self):
        return OutageReport.objects.filter(is_demo=False).order_by("-created_at")[:100]
    def perform_create(self, serializer):
        serializer.save()

@api_view(["GET"])
def health(request):
    return Response({"status":"ok","service":"EnergyResilient API","time":timezone.now().isoformat()})

@api_view(["GET"])
def dashboard(request):
    profile, _ = Profile.objects.get_or_create(user=request.user)
    risk = risk_assessment(profile.grid, profile.region, profile)
    reports = OutageReport.objects.filter(is_demo=False, grid=profile.grid, region=profile.region)
    return Response({
        "profile":ProfileSerializer(profile).data, "risk":risk,
        "recent_reports":ReportSerializer(reports.order_by("-created_at")[:8], many=True).data,
        "stats":{"reports_24h":reports.filter(created_at__gte=timezone.now()-__import__("datetime").timedelta(hours=24)).count(),
                 "events":OutageEvent.objects.filter(is_demo=False,grid=profile.grid,region=profile.region).count()},
    })

@api_view(["GET"])
def risk_view(request):
    profile, _ = Profile.objects.get_or_create(user=request.user)
    grid = request.query_params.get("grid", profile.grid)
    region = request.query_params.get("region", profile.region)
    return Response(risk_assessment(grid, region, profile))

@api_view(["POST"])
def train_view(request):
    if not request.user.is_staff:
        return Response({"detail":"Staff access required."}, status=status.HTTP_403_FORBIDDEN)
    link_reports_to_events()
    run = train_clusters()
    return Response({"status":run.status,"model_version":run.model_version,"sample_count":run.sample_count,
                     "cluster_count":run.cluster_count,"silhouette_score":run.silhouette_score,"summary":run.summary})

@api_view(["GET"])
def events_map(request):
    # Aggregated location only; never expose reporter-level coordinates.
    since = timezone.now()-__import__("datetime").timedelta(hours=24)
    events = OutageEvent.objects.filter(is_demo=False,started_at__gte=since).exclude(latitude__isnull=True).exclude(longitude__isnull=True)
    out = []
    for e in events:
        reports = e.reports.filter(is_demo=False, created_at__gte=since).values("reporter_id").distinct().count()
        if reports >= 3 and e.status != "restored":
            out.append({"id":e.id,"region":e.region,"city":e.city,"latitude":round(e.latitude,3),
                        "longitude":round(e.longitude,3),"reporters":reports,"status":e.status})
    return Response({"zones":out,"privacy":"Coordinates rounded for aggregate zone display."})
