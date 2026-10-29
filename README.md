# EnergyResilient — Fresh Build

A clean-room prototype for community outage reporting, evidence-based energy risk guidance, K-means pattern discovery, and a personal household/small-business energy plan.

## Stack
- Frontend: React + TypeScript + Vite, responsive dark-green UI, installable PWA, Leaflet map, IndexedDB offline queue.
- Backend: Django + Django REST Framework, JWT authentication, SQLite for local development, PostgreSQL-compatible settings for deployment.
- Analytics: scikit-learn K-means clustering with projected coordinates and cyclic time features; a separate rule-based Decision Support System (DSS).
- No Claude API, no paid AI dependency.

## Important honesty notes
- GPS is requested only after a user action and browser permission. Coordinates are not inferred from the selected grid. If geolocation fails, the app reports that failure and allows manual location selection; it must never claim that a fallback coordinate is a GPS fix.
- K-means is pattern discovery, not an outage probability engine. The DSS returns `insufficient_data` until enough non-demo, deduplicated outage events exist. Probabilities are not fabricated.
- Demo data is explicitly labelled and excluded from real-model training.
- Map tiles and live weather require connectivity. Outage reports can be queued offline and retried when connectivity returns.
- This is a submission-ready starting codebase, not a claim of production certification. Run the checks below and complete deployment environment configuration before presenting it as hosted.

## Local setup

### Backend
```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python manage.py makemigrations energy
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```
API root: `http://127.0.0.1:8000/api/`

### Frontend
```bash
cd frontend
npm install
npm run dev
```
Vite uses `/api` proxy to `http://127.0.0.1:8000` in development. Set `VITE_API_BASE_URL` when deploying separately.

## Tests
```bash
cd backend
python manage.py test
```
Frontend:
```bash
cd frontend
npm run build
```

## Deployment outline
- Deploy `backend/` as a Python web service; set `DJANGO_SECRET_KEY`, `DJANGO_DEBUG=False`, `DJANGO_ALLOWED_HOSTS`, and `DATABASE_URL` for PostgreSQL.
- Run migrations on deploy.
- Deploy `frontend/` as a static site; set `VITE_API_BASE_URL` to the public API origin.
- Configure HTTPS, allowed CORS origins, and a persistent PostgreSQL database.
- The browser geolocation API requires HTTPS outside localhost.

## Core rules
1. User-selected grid context is not GPS location.
2. GPS status includes source, accuracy, and timestamp; no silent Yaoundé/Bamenda fallback.
3. Outage reports are deduplicated into events before training.
4. Synthetic/demo records never enter the real model.
5. Forecasts disclose evidence count, model version, and limitations.
