#!/usr/bin/env bash

##############################################################################
# Docker Hub README Sync Script
#
# This script synchronizes Docker image documentation from the repository
# to Docker Hub. It can be run manually or integrated into CI/CD pipelines.
#
# Prerequisites:
#   - docker CLI installed
#   - docker-pushrm installed (https://github.com/christian-korneck/docker-pushrm)
#     OR
#   - jq installed (for API method)
#   - DOCKER_USERNAME environment variable set
#   - DOCKER_PASSWORD or DOCKER_TOKEN environment variable set
#
# Usage:
#   ./scripts/docker-readme-sync.sh [image-name]
#
#   If image-name is provided, only that image will be updated.
#   If omitted, all images will be updated.
#
# Examples:
#   ./scripts/docker-readme-sync.sh           # Update all images
#   ./scripts/docker-readme-sync.sh api       # Update only API image
#
##############################################################################

set -euo pipefail

# Configuration
DOCKER_NAMESPACE="${DOCKER_NAMESPACE:-petdog}"
DOCS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../docs/docker-images" && pwd)"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Image mapping: service-name -> docker-image-name
declare -A IMAGE_MAP=(
    ["frontend"]="battlescope-frontend"
    ["api"]="battlescope-api"
    ["ingest"]="battlescope-ingest"
    ["enrichment"]="battlescope-enrichment"
    ["clusterer"]="battlescope-clusterer"
    ["scheduler"]="battlescope-scheduler"
    ["search-sync"]="battlescope-search-sync"
    ["verifier"]="battlescope-verifier"
    ["db-migrate"]="battlescope-db-migrate"
)

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check for required environment variables
    if [[ -z "${DOCKER_USERNAME:-}" ]]; then
        log_error "DOCKER_USERNAME environment variable is not set"
        exit 1
    fi

    if [[ -z "${DOCKER_PASSWORD:-}" ]] && [[ -z "${DOCKER_TOKEN:-}" ]]; then
        log_error "Either DOCKER_PASSWORD or DOCKER_TOKEN environment variable must be set"
        exit 1
    fi

    # Check for docker-pushrm or jq
    if command -v docker-pushrm &> /dev/null; then
        log_info "Using docker-pushrm for README sync"
        METHOD="pushrm"
    elif command -v jq &> /dev/null && command -v curl &> /dev/null; then
        log_info "Using Docker Hub API for README sync"
        METHOD="api"
    else
        log_error "Neither docker-pushrm nor jq+curl are installed"
        log_error "Install one of the following:"
        log_error "  - docker-pushrm: https://github.com/christian-korneck/docker-pushrm"
        log_error "  - jq and curl: brew install jq curl (macOS) or apt install jq curl (Linux)"
        exit 1
    fi

    log_success "Prerequisites check passed"
}

# Login to Docker Hub
docker_login() {
    log_info "Logging in to Docker Hub..."

    local password="${DOCKER_PASSWORD:-${DOCKER_TOKEN}}"

    if echo "${password}" | docker login -u "${DOCKER_USERNAME}" --password-stdin > /dev/null 2>&1; then
        log_success "Logged in to Docker Hub as ${DOCKER_USERNAME}"
    else
        log_error "Failed to log in to Docker Hub"
        exit 1
    fi
}

# Get Docker Hub API token
get_api_token() {
    local password="${DOCKER_PASSWORD:-${DOCKER_TOKEN}}"

    log_info "Obtaining Docker Hub API token..."

    local response
    response=$(curl -s -H "Content-Type: application/json" \
        -X POST \
        -d "{\"username\": \"${DOCKER_USERNAME}\", \"password\": \"${password}\"}" \
        https://hub.docker.com/v2/users/login/)

    if echo "${response}" | jq -e '.token' > /dev/null 2>&1; then
        echo "${response}" | jq -r '.token'
    else
        log_error "Failed to obtain API token"
        log_error "Response: ${response}"
        exit 1
    fi
}

# Update README using docker-pushrm
update_readme_pushrm() {
    local service_name="$1"
    local image_name="$2"
    local readme_file="${DOCS_DIR}/${service_name}.md"
    local full_image="${DOCKER_NAMESPACE}/${image_name}"

    if [[ ! -f "${readme_file}" ]]; then
        log_error "README file not found: ${readme_file}"
        return 1
    fi

    log_info "Updating README for ${full_image}..."

    if docker-pushrm "${full_image}" --file "${readme_file}" --short "BattleScope ${service_name} service" > /dev/null 2>&1; then
        log_success "Updated README for ${full_image}"
        return 0
    else
        log_error "Failed to update README for ${full_image}"
        return 1
    fi
}

# Update README using Docker Hub API
update_readme_api() {
    local service_name="$1"
    local image_name="$2"
    local readme_file="${DOCS_DIR}/${service_name}.md"
    local full_image="${DOCKER_NAMESPACE}/${image_name}"
    local token="$3"

    if [[ ! -f "${readme_file}" ]]; then
        log_error "README file not found: ${readme_file}"
        return 1
    fi

    log_info "Updating README for ${full_image} via API..."

    # Read README content and escape for JSON
    local readme_content
    readme_content=$(jq -Rs . < "${readme_file}")

    # Prepare API payload
    local payload
    payload=$(jq -n \
        --arg full_description "${readme_content}" \
        '{full_description: $full_description}')

    # Make API request
    local response
    response=$(curl -s -X PATCH \
        "https://hub.docker.com/v2/repositories/${full_image}/" \
        -H "Authorization: JWT ${token}" \
        -H "Content-Type: application/json" \
        -d "${payload}")

    if echo "${response}" | jq -e '.name' > /dev/null 2>&1; then
        log_success "Updated README for ${full_image}"
        return 0
    else
        log_error "Failed to update README for ${full_image}"
        log_error "Response: ${response}"
        return 1
    fi
}

# Update README for a single image
update_image_readme() {
    local service_name="$1"
    local image_name="$2"

    if [[ "${METHOD}" == "pushrm" ]]; then
        update_readme_pushrm "${service_name}" "${image_name}"
    else
        update_readme_api "${service_name}" "${image_name}" "${API_TOKEN}"
    fi
}

# Update README for all images
update_all_readmes() {
    log_info "Updating README files for all images..."

    local success_count=0
    local fail_count=0

    for service_name in "${!IMAGE_MAP[@]}"; do
        local image_name="${IMAGE_MAP[$service_name]}"

        if update_image_readme "${service_name}" "${image_name}"; then
            ((success_count++))
        else
            ((fail_count++))
        fi
    done

    echo ""
    log_info "Summary:"
    log_success "  Successfully updated: ${success_count}"
    if [[ ${fail_count} -gt 0 ]]; then
        log_error "  Failed to update: ${fail_count}"
        return 1
    fi

    return 0
}

# Main function
main() {
    local target_image="${1:-}"

    echo ""
    echo "========================================"
    echo "  Docker Hub README Sync"
    echo "========================================"
    echo ""

    check_prerequisites

    if [[ "${METHOD}" == "pushrm" ]]; then
        docker_login
    else
        API_TOKEN=$(get_api_token)
    fi

    echo ""

    if [[ -z "${target_image}" ]]; then
        # Update all images
        if update_all_readmes; then
            log_success "All README files updated successfully!"
            exit 0
        else
            log_error "Some README updates failed"
            exit 1
        fi
    else
        # Update specific image
        if [[ -v "IMAGE_MAP[${target_image}]" ]]; then
            local image_name="${IMAGE_MAP[$target_image]}"
            if update_image_readme "${target_image}" "${image_name}"; then
                log_success "README updated successfully!"
                exit 0
            else
                log_error "Failed to update README"
                exit 1
            fi
        else
            log_error "Unknown image: ${target_image}"
            log_error "Available images: ${!IMAGE_MAP[*]}"
            exit 1
        fi
    fi
}

# Run main function
main "$@"
