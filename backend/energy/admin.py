from django.contrib import admin
from .models import Profile, OutageEvent, OutageReport, ClusterRun
@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ("user","grid","region","city","household_type")
@admin.register(OutageEvent)
class EventAdmin(admin.ModelAdmin):
    list_display = ("id","grid","region","started_at","status","is_demo")
    list_filter = ("grid","status","is_demo")
@admin.register(OutageReport)
class ReportAdmin(admin.ModelAdmin):
    list_display = ("id","kind","grid","region","reporter","created_at","is_demo")
    list_filter = ("kind","grid","is_demo")
@admin.register(ClusterRun)
class ClusterRunAdmin(admin.ModelAdmin):
    list_display = ("model_version","trained_at","sample_count","cluster_count","status")
