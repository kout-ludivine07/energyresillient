from django.conf import settings
from django.db import models

class Profile(models.Model):
    GRID_CHOICES = [("RIS/SIG","RIS/SIG"),("RIN/NIG","RIN/NIG"),("RIE/EIG","RIE/EIG")]
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="energy_profile")
    display_name = models.CharField(max_length=80, blank=True)
    grid = models.CharField(max_length=12, choices=GRID_CHOICES, default="RIS/SIG")
    region = models.CharField(max_length=80, default="North-West")
    city = models.CharField(max_length=80, default="Bamenda")
    household_type = models.CharField(max_length=20, choices=[("household","Household"),("business","Small business")], default="household")
    solar_capacity_wh = models.PositiveIntegerField(default=0)
    battery_capacity_wh = models.PositiveIntegerField(default=0)
    reserve_percent = models.PositiveSmallIntegerField(default=25)
    updated_at = models.DateTimeField(auto_now=True)

class OutageEvent(models.Model):
    STATUS = [("active","Active"),("restored","Restored"),("unverified","Unverified")]
    grid = models.CharField(max_length=12, choices=Profile.GRID_CHOICES)
    region = models.CharField(max_length=80)
    city = models.CharField(max_length=80, blank=True)
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    started_at = models.DateTimeField()
    restored_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=12, choices=STATUS, default="unverified")
    is_demo = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        indexes = [models.Index(fields=["grid","started_at"]), models.Index(fields=["region","status"])]

class OutageReport(models.Model):
    KIND = [("outage","Outage"),("restored","Restoration")]
    event = models.ForeignKey(OutageEvent, on_delete=models.CASCADE, related_name="reports", null=True, blank=True)
    reporter = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    kind = models.CharField(max_length=10, choices=KIND, default="outage")
    grid = models.CharField(max_length=12, choices=Profile.GRID_CHOICES)
    region = models.CharField(max_length=80)
    city = models.CharField(max_length=80, blank=True)
    # Coordinates are stored only for corroboration and removed by retention policy.
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    accuracy_m = models.FloatField(null=True, blank=True)
    location_consent = models.BooleanField(default=False)
    note = models.CharField(max_length=240, blank=True)
    client_report_id = models.CharField(max_length=100, unique=True)
    is_demo = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        indexes = [models.Index(fields=["grid","created_at"]), models.Index(fields=["region","created_at"])]

class ClusterRun(models.Model):
    model_version = models.CharField(max_length=40)
    trained_at = models.DateTimeField(auto_now_add=True)
    training_start = models.DateTimeField(null=True, blank=True)
    training_end = models.DateTimeField(null=True, blank=True)
    sample_count = models.PositiveIntegerField(default=0)
    cluster_count = models.PositiveSmallIntegerField(default=0)
    silhouette_score = models.FloatField(null=True, blank=True)
    status = models.CharField(max_length=24, default="insufficient_data")
    summary = models.JSONField(default=dict, blank=True)
