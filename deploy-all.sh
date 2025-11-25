#!/bin/bash
set -e

echo "=== BattleScope V3 Complete Deployment ==="
echo ""

# Update all service manifests with v3.0.1 and imagePullSecrets
echo "📝 Updating service manifests..."
for service in enrichment battle search notification bff; do
  file="infra/k8s/services/${service}-deployment.yaml"

  # Update image version
  sed -i '' "s|petdog/battlescope-${service}:v3.0.0|petdog/battlescope-${service}:v3.0.1|g" "$file"

  # Add imagePullSecrets if not present
  if ! grep -q "imagePullSecrets" "$file"; then
    # Find the line with "spec:" under template and add imagePullSecrets after it
    awk '/template:/{f=1} f && /^    spec:/{print; print "      imagePullSecrets:"; print "        - name: dockerhub-secret"; f=0; next}1' "$file" > "${file}.tmp" && mv "${file}.tmp" "$file"
  fi

  # Change imagePullPolicy to Always
  sed -i '' "s|imagePullPolicy: IfNotPresent|imagePullPolicy: Always|g" "$file"
done

echo "✅ All manifests updated"
echo ""

# Wait for images to finish pushing
echo "⏳ Waiting for Docker images to finish pushing..."
sleep 30

# Deploy observability stack
echo "📊 Deploying observability stack..."
kubectl apply -f infra/k8s/observability/ 2>&1 | grep -v "unchanged" || true

# Redeploy services with new images
echo "🚀 Redeploying services with fixed images..."
kubectl apply -f infra/k8s/services/

# Restart all deployments to pull new images
echo "🔄 Restarting all services..."
kubectl rollout restart deployment -n battlescope

# Wait for rollout
echo "⏳ Waiting for services to become ready..."
sleep 60

# Check status
echo ""
echo "=== Deployment Status ==="
kubectl get pods -n battlescope

echo ""
echo "=== Service Health Checks ==="
NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')

for port in 30101 30102 30103 30104 30105 30106; do
  service_name=$(kubectl get svc -n battlescope -o json | jq -r ".items[] | select(.spec.ports[0].nodePort==$port) | .metadata.name")
  echo -n "$service_name ($port): "
  curl -s -o /dev/null -w "%{http_code}" http://${NODE_IP}:${port}/health || echo "FAIL"
  echo ""
done

echo ""
echo "=== Observability URLs ==="
echo "Prometheus: http://${NODE_IP}:30090"
echo "Grafana:    http://${NODE_IP}:30300 (admin/admin)"

echo ""
echo "✅ Deployment complete!"
