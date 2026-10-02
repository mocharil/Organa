#!/usr/bin/env bash
set -euo pipefail

: "${GOOGLE_CLOUD_PROJECT:?Set GOOGLE_CLOUD_PROJECT to your GCP project ID}"
REGION="${GOOGLE_CLOUD_LOCATION:-asia-southeast1}"
FIRESTORE_LOCATION="${FIRESTORE_LOCATION:-$REGION}"
SERVICE="${ORGANA_SERVICE_NAME:-${KANTOR_SERVICE_NAME:-organa}}"
REPOSITORY="${ORGANA_ARTIFACT_REPOSITORY:-${KANTOR_ARTIFACT_REPOSITORY:-organa}}"
RUNTIME_SA_NAME="${ORGANA_RUNTIME_SA:-${KANTOR_RUNTIME_SA:-organa-runtime}}"
RUNTIME_SA="${RUNTIME_SA_NAME}@${GOOGLE_CLOUD_PROJECT}.iam.gserviceaccount.com"
MODEL="${VERTEX_MODEL:-${GEMINI_MODEL:-gemini-2.5-flash}}"
PROVIDER="${ORGANA_LLM_PROVIDER:-${KANTOR_LLM_PROVIDER:-vertex}}"
DEMO_RESET="${ORGANA_ENABLE_DEMO_RESET:-${KANTOR_ENABLE_DEMO_RESET:-1}}"
IMAGE="${REGION}-docker.pkg.dev/${GOOGLE_CLOUD_PROJECT}/${REPOSITORY}/${SERVICE}:$(date +%Y%m%d-%H%M%S)"

gcloud config set project "$GOOGLE_CLOUD_PROJECT" >/dev/null

echo "Enabling Google Cloud APIs..."
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  aiplatform.googleapis.com \
  firestore.googleapis.com \
  iam.googleapis.com

if ! gcloud iam service-accounts describe "$RUNTIME_SA" >/dev/null 2>&1; then
  echo "Creating dedicated Cloud Run service identity: $RUNTIME_SA"
  gcloud iam service-accounts create "$RUNTIME_SA_NAME" \
    --display-name="Organa Cloud Run runtime"
fi

# Runtime permissions are intentionally limited to the services the app uses.
for role in roles/aiplatform.user roles/datastore.user roles/logging.logWriter; do
  gcloud projects add-iam-policy-binding "$GOOGLE_CLOUD_PROJECT" \
    --member="serviceAccount:${RUNTIME_SA}" \
    --role="$role" \
    --condition=None \
    --quiet >/dev/null
done

if ! gcloud firestore databases describe --database="(default)" >/dev/null 2>&1; then
  echo "Creating Firestore Native database in $FIRESTORE_LOCATION..."
  gcloud firestore databases create \
    --database="(default)" \
    --location="$FIRESTORE_LOCATION" \
    --type=firestore-native \
    --edition=standard
else
  echo "Firestore default database already exists."
fi

if ! gcloud artifacts repositories describe "$REPOSITORY" --location "$REGION" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$REPOSITORY" \
    --repository-format=docker \
    --location="$REGION" \
    --description="Organa hackathon images"
fi

gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

echo "Building $IMAGE"
docker build -t "$IMAGE" .
docker push "$IMAGE"

echo "Deploying $SERVICE to Cloud Run..."
gcloud run deploy "$SERVICE" \
  --image "$IMAGE" \
  --region "$REGION" \
  --platform managed \
  --service-account "$RUNTIME_SA" \
  --allow-unauthenticated \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=${GOOGLE_CLOUD_PROJECT},GOOGLE_CLOUD_LOCATION=${REGION},ORGANA_STORAGE=firestore,FIRESTORE_DATABASE_ID=(default),ORGANA_DRY_RUN=0,ORGANA_LLM_PROVIDER=${PROVIDER},VERTEX_MODEL=${MODEL},VERTEX_PLANNER_MODEL=${MODEL},ORGANA_ENABLE_DEMO_RESET=${DEMO_RESET}" \
  --memory 1Gi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 5

URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')"
echo
echo "Organa deployed: $URL"
echo "Health check: $URL/api/health"
echo "For a non-demo/public deployment, set ORGANA_ENABLE_DEMO_RESET=0 and add Firebase/IAP authentication before exposing company data."
