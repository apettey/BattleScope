# Product Roadmap

**Version**: 1.0
**Last Updated**: 2025-11-12
**Status**: Living Document

---

## Overview

This roadmap outlines planned features, improvements, and technical debt items for BattleScope based on:
- Gaps identified in DOCUMENTATION_SUMMARY.md
- Feature specs marked as "planned"
- User feedback and pain points
- Technical debt and reliability improvements

---

## Roadmap Timeline

### Q4 2024 (Current) - Foundation & Critical Gaps

**Theme**: Complete MVP and fix critical authentication issues

#### Critical (P0) - Blocking Production

- [ ] **Complete Session Management** (2 weeks)
  - Implement session cookie setting in OAuth callback
  - Build Redis session storage layer
  - Create session validation middleware
  - Add session refresh mechanism
  - Reference: `/docs/authenication-authorization-spec/session-management-spec.md`

- [ ] **ESI Token Storage** (1 week)
  - Implement token encryption/decryption
  - Store encrypted tokens in `characters` table
  - Build token refresh mechanism
  - Add background token refresh CronJob

- [ ] **Multi-Character Support** (2 weeks)
  - Complete character linking flow
  - Build "Add Character" UI
  - Implement character unlinking
  - Add primary character selection

#### High Priority (P1) - User Experience

- [ ] **User Profile Page** (1 week)
  - Display all linked characters grouped by corp/alliance
  - Show ESI token status
  - Add character management actions
  - Display feature role assignments

- [ ] **Admin Panel UI** (3 weeks)
  - Build account management interface
  - Create user detail view with character grouping
  - Implement role assignment UI
  - Add basic audit log viewer

- [ ] **Search Improvements** (1 week)
  - Optimize Typesense indexing
  - Improve autocomplete relevance
  - Add search analytics
  - Fix edge cases

---

### Q1 2025 - Enhanced Admin & Reliability

**Theme**: Complete admin functionality and improve platform reliability

#### Admin Panel Completion

- [ ] **Feature Configuration UI** (2 weeks)
  - Battle Reports ingestion configuration page
  - Battle Intel cache configuration page
  - Visual configuration editor
  - Configuration validation

- [ ] **Organization Gating UI** (1 week)
  - Corp/alliance allow/deny list management
  - ESI integration for entity search
  - Access preview tool
  - Org gating audit log

- [ ] **Advanced Audit Logging** (1 week)
  - Filterable audit log viewer
  - Export to CSV/JSON
  - Security event highlighting
  - Audit log retention management

- [ ] **Platform Analytics Dashboard** (2 weeks)
  - User activity metrics (DAU/WAU/MAU)
  - Feature adoption charts
  - Top corporations/alliances by users
  - Request rate and error rate trends
  - Authentication statistics

#### Reliability Improvements

- [ ] **Database High Availability** (2 weeks)
  - PostgreSQL streaming replication
  - Automatic failover with Patroni
  - Read replicas for analytics
  - Connection pooling with PgBouncer

- [ ] **Redis High Availability** (1 week)
  - Redis Sentinel setup (3 nodes)
  - Automatic failover
  - Session state replication

- [ ] **Improved Monitoring** (1 week)
  - Additional Grafana dashboards
  - Enhanced alert rules
  - SLO tracking dashboards
  - Custom business metrics

---

### Q2 2025 - Battle Features & Intelligence

**Theme**: Enhance battle tracking and intelligence capabilities

#### Battle Reports Enhancements

- [ ] **Battle Notifications** (2 weeks)
  - Discord webhook integration
  - Slack integration
  - Email notifications (optional)
  - Configurable notification rules
  - Filter by alliance, system, ISK threshold

- [ ] **Battle Tagging** (1 week)
  - User-defined tags (e.g., "Structure Defense", "Roam", "Strategic Op")
  - Tag filtering in battle list
  - Tag-based analytics

- [ ] **Battle Timeline Visualization** (2 weeks)
  - Interactive timeline showing kill sequence
  - Zoom and pan controls
  - Ship icons on timeline
  - Side determination visualization

- [ ] **Battle Comparison Tool** (1 week)
  - Side-by-side battle comparison
  - Stat differences highlighted
  - Common participants identified

- [ ] **Export Capabilities** (1 week)
  - Export battle list to CSV
  - Export battle details to JSON
  - Export participant list
  - API endpoint for programmatic access

#### Battle Intel Enhancements

- [ ] **Doctrine Detection** (3 weeks)
  - ML-based fleet composition classification
  - Common doctrine identification (e.g., "Cerb Fleet", "Munnin Fleet")
  - Doctrine usage trends over time
  - Opponent doctrine library

- [ ] **Predictive Analytics** (2 weeks)
  - Predict when/where entities will be active
  - Activity pattern detection
  - Anomaly detection for unusual behavior
  - Alert on predicted enemy activity

- [ ] **Time-Based Heatmaps** (1 week)
  - Activity by hour of day
  - Activity by day of week
  - Timezone-aware visualizations
  - Prime time identification

- [ ] **Custom Intelligence Reports** (2 weeks)
  - Report templates (weekly intel brief, monthly summary)
  - Scheduled report generation
  - PDF export
  - Email delivery

- [ ] **Comparative Analysis** (1 week)
  - Side-by-side entity comparison
  - Stat differential highlights
  - Trend comparisons

---

### Q3 2025 - Advanced Features & Scale

**Theme**: Add advanced capabilities and prepare for scale

#### Advanced Search & Discovery

- [ ] **Saved Searches** (1 week)
  - Save frequently used search queries
  - Name and describe saved searches
  - Quick access from navigation
  - Share saved searches with others

- [ ] **Search Alerts** (2 weeks)
  - Create alerts for specific search criteria
  - Notify when new battles match saved search
  - Discord/Slack/Email delivery
  - Alert management UI

- [ ] **Geospatial Search** (2 weeks)
  - Find battles near a location (using system coordinates)
  - Radius-based search
  - Region/constellation filtering
  - Map visualization of results

- [ ] **Search Analytics** (1 week)
  - Track popular queries
  - Monitor zero-result searches
  - Improve relevance based on click-through rates
  - "Did you mean..." suggestions

#### Scalability Improvements

- [ ] **Database Partitioning** (3 weeks)
  - Partition battles table by date (monthly)
  - Automatic partition management
  - Query optimizer updates
  - Migration plan for existing data

- [ ] **Horizontal Scaling** (2 weeks)
  - Multi-replica API deployment
  - Load balancer configuration
  - Session affinity (if needed)
  - Auto-scaling policies

- [ ] **Caching Improvements** (1 week)
  - Implement CDN for static assets
  - API response caching with surrogate keys
  - Intelligent cache invalidation
  - Cache warming strategies

- [ ] **Archive Strategy** (2 weeks)
  - Archive battles older than 6 months to cold storage
  - Access archived battles via API
  - Restore from archive functionality
  - Cost optimization

#### User Experience Improvements

- [ ] **Mobile Responsiveness** (2 weeks)
  - Optimize for mobile screens (375px+)
  - Touch-friendly interactions
  - Mobile-specific navigation
  - Progressive Web App (PWA) support

- [ ] **Accessibility Improvements** (1 week)
  - WCAG 2.1 Level AA compliance
  - Keyboard navigation enhancements
  - Screen reader optimization
  - High contrast mode

- [ ] **Personalization** (2 weeks)
  - User preferences (theme, default filters)
  - Favorite entities (quick access)
  - Customizable dashboard
  - Recent activity tracking

---

### Q4 2025 - Integrations & Ecosystem

**Theme**: Build integrations and expand the ecosystem

#### External Integrations

- [ ] **Discord Bot** (3 weeks)
  - Slash commands for battle lookups
  - Automatic battle notifications to channels
  - Fleet commander commands
  - Intel queries via chat

- [ ] **Slack Integration** (2 weeks)
  - Battle notifications
  - Slash commands
  - Interactive messages
  - Thread-based battle discussions

- [ ] **Webhook API** (1 week)
  - Outbound webhooks for events (new battle, entity activity)
  - Webhook management UI
  - Retry and failure handling
  - Webhook logs

- [ ] **Public API** (3 weeks)
  - RESTful API for battle data
  - API key authentication
  - Rate limiting
  - API documentation (OpenAPI/Swagger)
  - SDKs (Python, JavaScript)

#### Advanced Admin Features

- [ ] **Impersonation Mode** (1 week)
  - SuperAdmin can view platform as another user
  - Support and troubleshooting tool
  - Audit all impersonation sessions
  - Clear indicator when impersonating

- [ ] **Role Approval Workflow** (2 weeks)
  - Directors request role changes
  - SuperAdmin approves/denies requests
  - Approval notification system
  - Request tracking and history

- [ ] **Bulk User Management** (1 week)
  - CSV import for initial user setup
  - Bulk role assignment
  - Bulk account operations
  - Validation and error handling

- [ ] **Custom Audit Alerts** (1 week)
  - Create custom alert rules based on audit patterns
  - Slack/Discord/Email notifications
  - Alert template library
  - Alert management UI

---

## Future Considerations (2026+)

### Advanced Analytics

- Machine learning for battle outcome prediction
- Entity relationship graphs
- Influence mapping (which alliances/corps are allied)
- Market impact analysis (battle effects on ship prices)

### Fleet Management

- Fleet composition recommendations
- Doctrine builder and manager
- Fleet scheduling and calendar
- Integration with in-game fleet tools

### Strategic Planning

- Campaign tracking (multi-battle operations)
- Territory control tracking
- Strategic objective management
- War reporting

### Community Features

- Public battle leaderboards
- Monthly awards (best FC, most efficient alliance, etc.)
- Battle of the month highlights
- Community-driven tagging

---

## Technical Debt Backlog

### High Priority

- [ ] **Test Coverage** - Increase to >80% for all packages
- [ ] **Error Handling** - Standardize error responses across API
- [ ] **Database Indexes** - Optimize slow queries with additional indexes
- [ ] **Code Documentation** - JSDoc comments for all public APIs
- [ ] **Dependency Updates** - Regular security updates

### Medium Priority

- [ ] **Code Splitting** - Improve frontend bundle sizes
- [ ] **Type Safety** - Eliminate `any` types in TypeScript
- [ ] **Logging Consistency** - Standardize log formats across services
- [ ] **Configuration Management** - Centralize configuration
- [ ] **Secrets Rotation** - Implement automated secret rotation

### Low Priority

- [ ] **Refactoring** - Simplify complex functions
- [ ] **Performance Profiling** - Identify optimization opportunities
- [ ] **Code Duplication** - DRY principle enforcement
- [ ] **Database Migrations** - Add rollback tests
- [ ] **Documentation** - Keep specs up to date

---

## Prioritization Framework

**Priority Levels**:

- **P0 (Critical)**: Blocking production, security vulnerabilities, data loss risk
- **P1 (High)**: Major user pain points, significant reliability improvements
- **P2 (Medium)**: Feature enhancements, nice-to-have improvements
- **P3 (Low)**: Polish, optimization, technical debt

**Evaluation Criteria**:

1. **User Impact**: How many users benefit? How significantly?
2. **Strategic Value**: Does this enable future features?
3. **Effort**: How long will it take? (T-shirt sizing: S/M/L/XL)
4. **Dependencies**: What must be done first?
5. **Risk**: What could go wrong?

**Capacity Planning**:

- Assume 1 full-time engineer
- Sprint length: 2 weeks
- Velocity: ~20 story points per sprint
- Leave 20% capacity for bugs, support, incidents

---

## Success Metrics

**Platform Health**:
- Uptime: 99.5%+
- API p95 latency: <500ms
- Error rate: <1%

**User Engagement**:
- Monthly Active Users (MAU): Target 500+ by Q2 2025
- Daily Active Users (DAU): Target 100+ by Q2 2025
- Retention rate: >70% month-over-month

**Feature Adoption**:
- Battle Reports: 100% of active users
- Battle Intel: >80% of active users
- Search: >60% of active users
- Admin Panel: 100% of admins

**Data Growth**:
- Battles ingested: 1,000+/month
- Killmails processed: 50,000+/month
- Search queries: 10,000+/month

---

## Communication & Updates

**Quarterly Roadmap Review**:
- Review progress on current quarter goals
- Adjust priorities based on feedback and metrics
- Plan next quarter in detail
- Share updates with stakeholders

**Monthly Updates**:
- Ship completed features
- Document lessons learned
- Collect user feedback
- Update roadmap as needed

**Weekly Planning**:
- Review current sprint progress
- Adjust priorities for upcoming sprint
- Address blockers and dependencies

---

## References

- [Product Features Catalog](/docs/product-specifications/features.md)
- [Requirements Specification](/docs/product-specifications/requirements.md)
- [User Stories](/docs/product-specifications/user-stories.md)
- [Documentation Summary](/docs/DOCUMENTATION_SUMMARY.md)
- [Architecture Documentation](/docs/architecture.md)
