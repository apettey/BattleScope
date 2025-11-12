# Security Architecture and Practices

**Version**: 1.0
**Last Updated**: 2025-11-12
**Status**: Production

---

## Overview

BattleScope implements defense-in-depth security with multiple layers of protection across authentication, authorization, data security, network security, and operational security.

---

## Authentication & Authorization

### EVE Online SSO (OAuth2/OIDC)

**Implementation**:
- OAuth 2.0 Authorization Code flow with PKCE
- OpenID Connect for identity verification
- State and nonce parameters for CSRF protection
- JWT signature validation using EVE's JWKS endpoint

**Session Management**:
- HTTP-only, Secure, SameSite cookies
- Short-lived JWT tokens (15 minutes)
- Long-lived refresh tokens (30 days, Redis-backed)
- Automatic session expiration and cleanup

**Token Security**:
- ESI tokens encrypted at rest (AES-256-GCM)
- Encryption key stored in Kubernetes Secrets
- Token rotation on refresh (when supported by ESI)
- Tokens never logged or exposed in responses

### Role-Based Access Control (RBAC)

**Authorization Model**:
- Feature-scoped roles: `user`, `fc`, `director`, `admin`
- Global `SuperAdmin` bypasses all checks
- Hierarchical role inheritance (admin > director > fc > user)
- Permission caching in Redis (60s TTL)

**Authorization Flow**:
1. Extract session from cookie
2. Load user account and roles from cache/database
3. Check required permission for action
4. Allow/deny with audit log entry

**Middleware Implementation**:
```typescript
// Fastify auth middleware
app.addHook('preHandler', async (request, reply) => {
  const token = request.cookies.battlescope_session;
  const session = await validateSession(token);
  request.account = session.account;
});

// Feature-scoped authorization
const requireFeatureRole = (featureKey, minRole) => {
  return async (request, reply) => {
    const hasAccess = await authz.check(request.account.id, featureKey, minRole);
    if (!hasAccess) {
      return reply.status(403).send({ error: 'Forbidden' });
    }
  };
};
```

**Organization Gating**:
- Corporation/Alliance whitelist/blacklist
- Deny-list takes precedence over allow-list
- Configurable membership requirements
- Cached org rules (1-hour TTL)

---

## Data Protection

### Encryption at Rest

**Database (PostgreSQL)**:
- Volume encryption: Enabled via cloud provider (LUKS/dm-crypt)
- Sensitive fields: ESI tokens encrypted with application-layer encryption
- Backup encryption: Encrypted before upload to S3
- Encryption algorithm: AES-256-GCM

**Encrypted Fields**:
```typescript
interface EncryptedCharacter {
  esi_access_token: string; // Encrypted
  esi_refresh_token: string; // Encrypted
  // Other fields in plaintext
}

// Encryption implementation
const encrypt = (plaintext: string, key: Buffer): string => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
};
```

**Redis**:
- Session data: Encrypted in transit (TLS), not at rest (ephemeral)
- Cache data: Non-sensitive, no encryption needed
- AOF/RDB snapshots: Stored on encrypted volumes

### Encryption in Transit

**TLS Configuration**:
- All external traffic: TLS 1.2+ (enforced at ingress)
- Certificate management: cert-manager + Let's Encrypt
- Certificate rotation: Automatic (90-day renewal)
- HSTS header: `Strict-Transport-Security: max-age=31536000; includeSubDomains`

**Internal Traffic**:
- Service-to-service: Plaintext (trusted network)
- Database connections: TLS optional (same-cluster trusted)
- Redis connections: Plaintext (same-cluster trusted)

**Future: mTLS with Service Mesh**:
- Istio or Linkerd for mTLS between all services
- Automatic certificate rotation
- Traffic encryption without code changes

---

## Network Security

### Kubernetes Network Policies

**Default Deny**:
```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
spec:
  podSelector: {}
  policyTypes:
    - Ingress
    - Egress
```

**Allow Rules**:
- API → PostgreSQL (port 5432)
- API → Redis (port 6379)
- API → Typesense (port 8108)
- All services → DNS (port 53)
- All services → OTEL Collector (port 4318)

**Ingress Rules**:
- Allow traffic to API service from ingress controller
- Allow traffic to Frontend from ingress controller
- Allow traffic to Grafana from ingress controller (admin only)

### Firewall Rules

**Ingress (Public)**:
- HTTPS (443): API, Frontend, Grafana
- Deny all other ports

**Egress (External APIs)**:
- zKillboard: https://zkillboard.com (port 443)
- EVE ESI: https://esi.evetech.net (port 443)
- EVE SSO: https://login.eveonline.com (port 443)
- All other egress: Deny (except DNS)

---

## Secrets Management

### Kubernetes Secrets

**Secrets Storage**:
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: battlescope-secrets
  namespace: battlescope
type: Opaque
data:
  DATABASE_URL: <base64>
  REDIS_URL: <base64>
  EVE_CLIENT_ID: <base64>
  EVE_CLIENT_SECRET: <base64>
  ENCRYPTION_KEY: <base64>
  TYPESENSE_API_KEY: <base64>
```

**Secret Rotation**:
- Database password: Quarterly
- Redis password: Quarterly
- EVE OAuth credentials: On compromise or annually
- Encryption key: Never (would invalidate all encrypted data)
- API keys: On compromise or annually

**Secret Access**:
- Mounted as environment variables or volume mounts
- RBAC controls which pods can access which secrets
- Audit logging for secret access
- No secrets in code or Git repository

**Future: External Secret Management**:
- HashiCorp Vault integration
- AWS Secrets Manager
- Dynamic secret generation
- Automatic rotation

---

## Vulnerability Management

### Dependency Scanning

**Tools**:
- `npm audit`: Scan npm dependencies for vulnerabilities
- Snyk: Continuous monitoring (optional)
- Dependabot: Automated dependency updates

**Process**:
1. Run `npm audit` in CI pipeline
2. Fail build on high/critical vulnerabilities
3. Review and update dependencies weekly
4. Auto-merge patch updates (after tests pass)

**Container Image Scanning**:
- Trivy: Scan Docker images for OS and application vulnerabilities
- Run on every image build
- Block deployment of high/critical CVEs

### Security Updates

**Patch Management**:
- Critical security patches: Within 24 hours
- High severity: Within 1 week
- Medium severity: Within 1 month
- Low severity: Next release cycle

**Update Process**:
1. Security advisory received (GitHub, npm, CVE)
2. Assess impact on BattleScope
3. Test patch in staging environment
4. Deploy to production
5. Verify fix and document

---

## Application Security

### Input Validation

**Zod Schema Validation**:
- All API endpoints validated with Zod schemas
- Request body, query params, headers validated
- Reject invalid input before processing
- Return clear error messages (no sensitive info)

**Example**:
```typescript
const BattleQuerySchema = z.object({
  space_type: z.enum(['kspace', 'jspace', 'pochven']).optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

app.get('/battles', {
  schema: { querystring: BattleQuerySchema },
  handler: async (req, reply) => {
    // req.query is validated and typed
  }
});
```

### SQL Injection Prevention

**Kysely Parameterized Queries**:
- All queries use parameterized statements
- No string concatenation for SQL
- Query builder prevents injection

**Example**:
```typescript
// SAFE: Parameterized query
const battles = await db
  .selectFrom('battles')
  .where('space_type', '=', spaceType)
  .where('start_time', '>', startTime)
  .execute();

// NEVER DO THIS: String concatenation
const battles = await db.raw(
  `SELECT * FROM battles WHERE space_type = '${spaceType}'`
);
```

### Cross-Site Scripting (XSS)

**Frontend Protections**:
- React auto-escapes by default
- No `dangerouslySetInnerHTML` usage
- Content Security Policy (CSP) headers
- Sanitize user-generated content

**CSP Header**:
```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https://images.evetech.net; connect-src 'self' https://esi.evetech.net
```

### Cross-Site Request Forgery (CSRF)

**Protections**:
- SameSite cookies: `SameSite=Lax` (prevents CSRF)
- State parameter in OAuth flow
- Origin/Referer header validation
- CSRF tokens not needed due to SameSite cookies

### Rate Limiting

**API Rate Limits**:
- Global: 100 req/min per IP
- Authenticated: 500 req/min per user
- SSE connections: 10 per user
- Admin endpoints: 50 req/min per user

**Implementation**:
```typescript
import rateLimit from '@fastify/rate-limit';

app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  cache: 10000,
  redis: redisClient, // Distributed rate limiting
});
```

---

## Security Monitoring

### Audit Logging

**Events Logged**:
- Authentication: Login, logout, failures
- Authorization: Access granted, denied
- Account management: Create, update, delete, block
- Role changes: Grant, revoke, modify
- Settings changes: Feature config updates
- Sensitive data access: Admin actions

**Log Format**:
```json
{
  "actor_account_id": "550e8400-e29b...",
  "action": "role.granted",
  "target_type": "account_feature_role",
  "target_id": "660e8400-e29b...",
  "metadata": {
    "feature": "battle-reports",
    "role": "admin",
    "granted_by": "770e8400-e29b..."
  },
  "timestamp": "2025-11-12T10:30:00Z",
  "ip_address": "203.0.113.42",
  "user_agent": "Mozilla/5.0..."
}
```

**Audit Log Retention**: 90 days in database, 1 year in archive

### Intrusion Detection

**Monitoring**:
- Failed login attempts (> 5 in 5 minutes)
- Authorization denials (> 10 in 5 minutes)
- Unusual API access patterns
- Admin action anomalies

**Alerts**:
- Brute force attack: > 10 failed logins from same IP
- Privilege escalation attempt: Repeated authorization denials
- Suspicious admin activity: Mass user deletions, role changes

**Response**:
1. Alert security team via Slack/PagerDuty
2. Review audit logs for context
3. Block IP address if attack confirmed
4. Investigate and document incident

---

## Compliance

### Data Privacy (GDPR)

**User Rights**:
- Right to access: Export user data via `/me/export`
- Right to erasure: Delete account (soft delete + anonymization)
- Right to rectification: Update account information
- Right to data portability: JSON export of all user data

**Data Minimization**:
- Email address is optional
- No PII collected beyond EVE character data
- ESI tokens encrypted at rest
- Session data expires after 30 days

**Consent**:
- OAuth consent flow for ESI scopes
- Terms of Service acceptance on first login
- Privacy policy linked in footer

### Audit Requirements

**Audit Trail**:
- All admin actions logged
- All authentication events logged
- Logs tamper-evident (immutable after creation)
- Logs available for export

**Compliance Reports**:
- Monthly security metrics report
- Quarterly access review
- Annual security audit

---

## Incident Response

### Security Incident Response Plan

**Phases**:
1. **Detection**: Alerts, monitoring, user reports
2. **Containment**: Block attack vector, isolate affected systems
3. **Eradication**: Remove malicious code, close vulnerabilities
4. **Recovery**: Restore services, verify integrity
5. **Post-Incident**: Review, document, improve

**Severity Levels**:
- **Critical**: Data breach, unauthorized access to admin accounts
- **High**: Service disruption, DDoS attack
- **Medium**: Brute force attempts, SQL injection attempts
- **Low**: Suspicious activity, unusual patterns

**Response Times**:
- Critical: Immediate response (15 minutes)
- High: 1 hour
- Medium: 4 hours
- Low: Next business day

**Communication Plan**:
- Internal: Slack #security-incidents channel
- Users: Status page update, email notification
- Public: Blog post for data breaches (if applicable)

---

## Security Best Practices

### Development

**Secure Coding Guidelines**:
- Never commit secrets to Git
- Use environment variables for configuration
- Validate all user input
- Parameterize all database queries
- Sanitize all output
- Use strong typing (TypeScript)
- Review code for security issues

**Code Review Checklist**:
- [ ] No secrets in code
- [ ] Input validation present
- [ ] SQL queries parameterized
- [ ] Authorization checks present
- [ ] Error messages don't leak sensitive info
- [ ] Logging doesn't contain secrets

### Deployment

**Production Deployment Checklist**:
- [ ] Secrets rotated and stored in Kubernetes Secrets
- [ ] TLS certificates valid and auto-renewing
- [ ] Network policies applied
- [ ] Resource limits configured
- [ ] Security headers enabled
- [ ] Rate limiting configured
- [ ] Monitoring and alerting enabled
- [ ] Backup and restore tested

### Operations

**Operational Security**:
- Principle of least privilege for all accounts
- Multi-factor authentication for admin access
- Regular security training for team
- Incident response plan tested quarterly
- Dependency updates applied weekly
- Security audit annually

---

## References

- [Authentication & Authorization Spec](/docs/authenication-authorization-spec/README.md)
- [Session Management Spec](/docs/authenication-authorization-spec/session-management-spec.md)
- [SLA/SLO Specification](/docs/technical-specifications/sla-slo.md)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CIS Kubernetes Benchmark](https://www.cisecurity.org/benchmark/kubernetes)
