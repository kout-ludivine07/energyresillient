from datetime import timedelta
from django.utils import timezone
from django.db.models import Count
import numpy as np
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from .models import OutageEvent, OutageReport, ClusterRun

MIN_EVENTS = 12

def link_reports_to_events():
    """Link a report to a nearby same-region event within 90 minutes; never count each report as a separate event."""
    linked = 0
    reports = OutageReport.objects.filter(event__isnull=True, is_demo=False, kind="outage").order_by("created_at")
    for report in reports:
        start = report.created_at - timedelta(minutes=90)
        end = report.created_at + timedelta(minutes=90)
        candidates = OutageEvent.objects.filter(
            is_demo=False, grid=report.grid, region=report.region,
            started_at__range=(start, end), status__in=["active","unverified"]
        ).order_by("started_at")
        event = candidates.first()
        if event is None:
            event = OutageEvent.objects.create(
                grid=report.grid, region=report.region, city=report.city,
                latitude=report.latitude if report.location_consent else None,
                longitude=report.longitude if report.location_consent else None,
                started_at=report.created_at, status="unverified", is_demo=False
            )
        report.event = event
        report.save(update_fields=["event"])
        linked += 1
    return linked

def _features(events):
    """Use local projected metre offsets plus cyclic hour/day features; no raw lat/lon Euclidean clustering."""
    from math import radians, sin, cos
    rows = []
    for e in events:
        # Local equirectangular projection around Cameroon; missing GPS is represented as region-only.
        lat = e.latitude if e.latitude is not None else 5.96
        lon = e.longitude if e.longitude is not None else 10.15
        x = (lon - 10.15) * 111320 * cos(radians(5.96))
        y = (lat - 5.96) * 110540
        local = timezone.localtime(e.started_at)
        hour = local.hour + local.minute / 60
        dow = local.weekday()
        rows.append([x / 10000, y / 10000, sin(2*np.pi*hour/24), cos(2*np.pi*hour/24),
                     sin(2*np.pi*dow/7), cos(2*np.pi*dow/7)])
    return np.asarray(rows, dtype=float)

def train_clusters():
    events = list(OutageEvent.objects.filter(is_demo=False).exclude(status="restored").order_by("started_at"))
    if len(events) < MIN_EVENTS:
        return ClusterRun.objects.create(
            model_version="kmeans-cam-v1", sample_count=len(events), status="insufficient_data",
            summary={"reason":f"Need at least {MIN_EVENTS} eligible non-demo outage events.","eligible_events":len(events)}
        )
    X = _features(events)
    # Choose a small k using silhouette score only where mathematically valid.
    best = None
    for k in range(2, min(6, len(events)-1) + 1):
        model = KMeans(n_clusters=k, n_init=10, random_state=42)
        labels = model.fit_predict(X)
        if len(set(labels)) < 2 or len(set(labels)) >= len(X):
            continue
        score = float(silhouette_score(X, labels))
        if best is None or score > best[0]:
            best = (score, k, labels)
    if best is None:
        return ClusterRun.objects.create(model_version="kmeans-cam-v1", sample_count=len(events),
            status="training_failed", summary={"reason":"No valid cluster solution for current sample."})
    score, k, labels = best
    counts = {str(i): int((labels == i).sum()) for i in range(k)}
    start, end = events[0].started_at, events[-1].started_at
    return ClusterRun.objects.create(
        model_version="kmeans-cam-v1", training_start=start, training_end=end, sample_count=len(events),
        cluster_count=k, silhouette_score=score, status="trained",
        summary={"cluster_sizes":counts,"features":["projected local coordinates","hour sin/cos","weekday sin/cos"],
                 "cluster_profiles":{str(i):{"count":int((labels==i).sum()),"mean_projected_x_10km":round(float(X[labels==i,0].mean()),3),"mean_projected_y_10km":round(float(X[labels==i,1].mean()),3),"mean_hour_sin":round(float(X[labels==i,2].mean()),3),"mean_hour_cos":round(float(X[labels==i,3].mean()),3)} for i in range(k)},
                 "note":"Clusters describe historical patterns; they are not probabilities. Profiles are descriptive summaries, not per-event predictions."}
    )

def risk_assessment(grid, region, profile=None):
    now = timezone.now()
    recent_cutoff = now - timedelta(minutes=30)
    recent_reports = OutageReport.objects.filter(
        is_demo=False, grid=grid, region=region, kind="outage", created_at__gte=recent_cutoff
    ).values("reporter_id").distinct().count()
    events = OutageEvent.objects.filter(is_demo=False, grid=grid, region=region)
    count = events.count()
    active = events.filter(status="active").count()
    latest_run = ClusterRun.objects.filter(status="trained").order_by("-trained_at").first()
    if count < MIN_EVENTS:
        level = "insufficient_data"
        explanation = f"Only {count} eligible historical events are available in this area; {MIN_EVENTS} are required before a risk estimate is shown."
        score = None
    else:
        # Transparent rule score, not a statistical probability.
        score = min(100, recent_reports * 22 + active * 15 + min(count, 10) * 2)
        level = "high" if score >= 60 else "elevated" if score >= 30 else "lower"
        explanation = f"Rule score {score}/100 uses {recent_reports} distinct recent reporters, {active} active corroborated events and {count} historical events. This is not a probability."
    actions = []
    if profile:
        reserve = profile.reserve_percent
        if reserve < 20:
            actions.append("Enable low-power mode and preserve battery for essential lighting and communication.")
        if profile.battery_capacity_wh > 0:
            actions.append(f"Check essential-load demand against your saved {profile.battery_capacity_wh} Wh battery estimate.")
        if profile.solar_capacity_wh > 0:
            actions.append(f"Prioritise essential appliances using your saved {profile.solar_capacity_wh} Wh solar estimate; actual output varies with weather.")
    if not actions:
        actions = ["Save your battery, solar and essential-appliance estimates to personalise these actions.",
                   "Keep a charged phone and report verified outages or restorations."]
    return {"level":level,"score":score,"score_type":"rule_score_not_probability","grid":grid,"region":region,
            "recent_distinct_reporters":recent_reports,"historical_events":count,"active_events":active,
            "model":{"status":latest_run.status,"version":latest_run.model_version,"sample_count":latest_run.sample_count,
                     "silhouette_score":latest_run.silhouette_score} if latest_run else {"status":"not_trained"},
            "explanation":explanation,"actions":actions,"as_of":now.isoformat()}
