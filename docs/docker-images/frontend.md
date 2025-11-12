# BattleScope Frontend Docker Image

**Image Name**: `petdog/battlescope-frontend:latest`

**Source**: `frontend/Dockerfile`

## Purpose

React-based single-page application (SPA) providing the user interface for BattleScope. Built with Vite for fast development and optimized production builds.

## Features

- React 18 with TypeScript
- TanStack Query for server state management
- TailwindCSS for styling
- Real-time killmail feed via Server-Sent Events
- EVE Online SSO authentication
- Battle visualization and search
- Admin dashboard

## Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `VITE_API_BASE_URL` | API endpoint URL (browser-accessible) | `http://localhost:3000` | Yes |

**Note**: All environment variables prefixed with `VITE_` are embedded at build time and exposed to the browser.

### Build Arguments

None

## Volumes/Mounts

No persistent volumes required. The frontend is a static application served by NGINX.

## Ports

| Port | Protocol | Description |
|------|----------|-------------|
| 80 | HTTP | NGINX web server |

## Health Checks

NGINX default health check on port 80.

```bash
curl http://localhost:80/
```

## Example Usage

### Docker Run

```bash
docker run -d \
  --name battlescope-frontend \
  -p 8080:80 \
  -e VITE_API_BASE_URL=http://your-api-host:3000 \
  petdog/battlescope-frontend:latest
```

### Docker Compose

```yaml
services:
  frontend:
    image: petdog/battlescope-frontend:latest
    ports:
      - "8080:80"
    environment:
      VITE_API_BASE_URL: http://api:3000
    restart: unless-stopped
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
  namespace: battlescope
spec:
  replicas: 2
  selector:
    matchLabels:
      app: frontend
  template:
    metadata:
      labels:
        app: frontend
    spec:
      containers:
        - name: frontend
          image: petdog/battlescope-frontend:latest
          ports:
            - containerPort: 80
              name: http
          env:
            - name: VITE_API_BASE_URL
              value: "http://api.battlescope.svc.cluster.local:3000"
          resources:
            requests:
              cpu: 50m
              memory: 64Mi
            limits:
              cpu: 200m
              memory: 256Mi
          livenessProbe:
            httpGet:
              path: /
              port: http
            initialDelaySeconds: 5
            periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: frontend
  namespace: battlescope
spec:
  type: NodePort
  selector:
    app: frontend
  ports:
    - name: http
      port: 80
      targetPort: http
      nodePort: 30001
```

## Resource Requirements

### Recommended

- **CPU**: 50m request, 200m limit
- **Memory**: 64Mi request, 256Mi limit

### Minimum

- **CPU**: 25m
- **Memory**: 32Mi

## Dependencies

### Required Services

- **API Service**: The frontend requires the BattleScope API to be accessible at the URL specified in `VITE_API_BASE_URL`

### Network Requirements

- Outbound HTTP/HTTPS to API service
- The `VITE_API_BASE_URL` must be accessible from the user's browser (not just the container)

## Build Information

### Base Image

- **Stage 1 (Build)**: `node:20-alpine`
- **Stage 2 (Runtime)**: `nginx:alpine`

### Build Process

```bash
docker build \
  -t petdog/battlescope-frontend:latest \
  -f frontend/Dockerfile \
  .
```

### Multi-Platform Build

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --push \
  -t petdog/battlescope-frontend:latest \
  -f frontend/Dockerfile \
  .
```

## Troubleshooting

### Issue: API requests failing with CORS errors

**Solution**: Ensure `VITE_API_BASE_URL` points to the correct API endpoint and that the API has CORS configured to allow requests from the frontend domain.

### Issue: Blank page after deployment

**Cause**: `VITE_API_BASE_URL` not set correctly or API not reachable from the browser.

**Solution**:
1. Check browser console for errors
2. Verify `VITE_API_BASE_URL` is accessible from your browser
3. Verify the API service is running and healthy

### Issue: Build fails

**Solution**: Ensure you're building from the repository root with the correct Dockerfile path:
```bash
docker build -f frontend/Dockerfile .
```

## Security Considerations

- Frontend contains no secrets (all config is public)
- API authentication is handled via HTTP-only cookies from the API
- CORS is configured on the API side
- All sensitive operations are handled server-side

## Version Information

- **Node.js**: 20 LTS
- **React**: 18
- **Vite**: 5
- **TailwindCSS**: 3
- **NGINX**: Latest Alpine

## Additional Resources

- [Frontend Source Code](../../frontend)
- [API Documentation](./api.md)
- [Main Documentation](../../README.md)
