from django.contrib.auth import get_user_model
from rest_framework import serializers
from .models import Profile, OutageReport, OutageEvent
User = get_user_model()

class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    class Meta:
        model = User
        fields = ("username","email","password")
    def create(self, validated_data):
        user = User.objects.create_user(**validated_data)
        Profile.objects.create(user=user)
        return user

class ProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = Profile
        fields = ("display_name","grid","region","city","household_type","solar_capacity_wh","battery_capacity_wh","reserve_percent")

class ReportSerializer(serializers.ModelSerializer):
    class Meta:
        model = OutageReport
        fields = ("id","kind","grid","region","city","latitude","longitude","accuracy_m","location_consent","note","client_report_id","is_demo","created_at")
        read_only_fields = ("id","is_demo","created_at")
    def validate(self, attrs):
        if not attrs.get("location_consent"):
            attrs["latitude"] = None
            attrs["longitude"] = None
            attrs["accuracy_m"] = None
        if attrs.get("latitude") is not None and not (-90 <= attrs["latitude"] <= 90):
            raise serializers.ValidationError({"latitude":"Latitude must be between -90 and 90."})
        if attrs.get("longitude") is not None and not (-180 <= attrs["longitude"] <= 180):
            raise serializers.ValidationError({"longitude":"Longitude must be between -180 and 180."})
        return attrs
    def create(self, validated_data):
        validated_data["reporter"] = self.context["request"].user
        return super().create(validated_data)
