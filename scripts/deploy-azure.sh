#!/usr/bin/env bash
set -euo pipefail

: "${AZURE_RESOURCE_GROUP:?Missing Azure resource group}"
: "${AZURE_WEBAPP_NAME:?Missing Azure web app name}"
: "${AZURE_WEBAPP_URL:?Missing Azure web app URL}"
test -f dist/website.zip
original_startup="$(az webapp config show -g "$AZURE_RESOURCE_GROUP" -n "$AZURE_WEBAPP_NAME" --query appCommandLine -o tsv)"
test -n "$original_startup"
startup='node scripts/azure-initialize.mjs && node scripts/migrate.mjs && node scripts/verify-azure-database.mjs && npm start -- --hostname 0.0.0.0'
restore_startup() {
  local status=$?
  trap - EXIT
  if ! az webapp config set -g "$AZURE_RESOURCE_GROUP" -n "$AZURE_WEBAPP_NAME" --startup-file "$original_startup" -o none; then
    echo "::error::Failed to restore the previous startup command; manual recovery is required."
    exit 1
  fi
  exit "$status"
}
trap restore_startup EXIT
az webapp config appsettings set -g "$AZURE_RESOURCE_GROUP" -n "$AZURE_WEBAPP_NAME" --settings SCM_DO_BUILD_DURING_DEPLOYMENT=false ENABLE_ORYX_BUILD=false NEXT_TELEMETRY_DISABLED=1 -o none
az webapp config set -g "$AZURE_RESOURCE_GROUP" -n "$AZURE_WEBAPP_NAME" --startup-file 'node scripts/azure-maintenance.mjs' -o none
maintenance_ready=false
for attempt in $(seq 1 36); do
  if curl --silent --show-error --max-time 10 "$AZURE_WEBAPP_URL" | grep -Fxq 'League deployment in progress'; then
    maintenance_ready=true
    break
  fi
  sleep 10
done
if [[ "$maintenance_ready" != true ]]; then
  echo "::error::Maintenance runtime did not become ready; refusing to replace live files."
  exit 1
fi
previous_deployment="$(az webapp log deployment list -g "$AZURE_RESOURCE_GROUP" -n "$AZURE_WEBAPP_NAME" --query '[0].id' -o tsv)"
az webapp deploy -g "$AZURE_RESOURCE_GROUP" -n "$AZURE_WEBAPP_NAME" --src-path dist/website.zip --type zip --clean true --restart false --track-status false --async true --timeout 1200000 -o none
deployed=false
for attempt in $(seq 1 60); do
  deployment="$(az webapp log deployment list -g "$AZURE_RESOURCE_GROUP" -n "$AZURE_WEBAPP_NAME" --query '[0].{id:id,status:status}' -o json)"
  deployment_id="$(jq -er '.id' <<< "$deployment")"
  deployment_status="$(jq -er '.status' <<< "$deployment")"
  if [[ "$deployment_id" != "$previous_deployment" ]]; then
    if [[ "$deployment_status" == 4 ]]; then
      deployed=true
      break
    fi
    if [[ "$deployment_status" == 3 ]]; then
      az webapp log deployment show -g "$AZURE_RESOURCE_GROUP" -n "$AZURE_WEBAPP_NAME" --deployment-id "$deployment_id" -o json
      echo "::error::Azure failed to extract or deploy the release."
      exit 1
    fi
  fi
  sleep 10
done
if [[ "$deployed" != true ]]; then
  echo "::error::Azure did not confirm release deployment within the time limit."
  exit 1
fi
az webapp config set -g "$AZURE_RESOURCE_GROUP" -n "$AZURE_WEBAPP_NAME" --startup-file "$startup" -o none
az webapp restart -g "$AZURE_RESOURCE_GROUP" -n "$AZURE_WEBAPP_NAME"
ready=false
for attempt in $(seq 1 48); do
  if curl --fail --silent --show-error --max-time 15 "$AZURE_WEBAPP_URL/eventos" -o /tmp/league-page.html &&
    grep -q 'Haz clic para explorar' /tmp/league-page.html; then
    ready=true
    break
  fi
  sleep 10
done
if [[ "$ready" != true ]]; then
  echo "::error::The deployed application did not become healthy. Inspect App Service startup logs."
  exit 1
fi
for route in / /participacion /clasificacion /memoria; do
  curl --fail --silent --show-error --max-time 60 "$AZURE_WEBAPP_URL$route" -o /dev/null
done
status="$(curl --silent --show-error --max-time 60 --output /dev/null --write-out '%{http_code}' "$AZURE_WEBAPP_URL/api/gestion/export")"
if [[ "$status" != 401 ]]; then
  echo "::error::Anonymous export must return HTTP 401, got $status."
  exit 1
fi
trap - EXIT
echo "Verified Linux release: public pages 200, private export 401. Registration and database settings were not changed."
