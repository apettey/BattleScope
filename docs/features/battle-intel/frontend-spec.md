# Battle Intel Frontend Specification

**Feature Key**: `battle-intel`
**Last Updated**: 2025-11-10

---

## Overview

This document defines the frontend implementation specification for the Battle Intel feature UI.

For the general feature specification, see [feature-spec.md](./feature-spec.md).

---

## Routes

### `/` (Home Dashboard)
**Component**: `HomePage`
**Section**: Intelligence Overview
**Access**: Requires `battle-intel` feature access (user role minimum)

### `/intel/alliances/:id`
**Component**: `AllianceIntelPage`
**Access**: Requires `battle-intel` feature access (user role minimum)

### `/intel/corporations/:id`
**Component**: `CorporationIntelPage`
**Access**: Requires `battle-intel` feature access (user role minimum)

### `/intel/characters/:id`
**Component**: `CharacterIntelPage`
**Access**: Requires `battle-intel` feature access (user role minimum)

### `/admin/features/battle-intel/config`
**Component**: `BattleIntelConfigPage`
**Access**: SuperAdmin only

---

## Component Structure

```
frontend/src/modules/battle-intel/
├── pages/
│   ├── AllianceIntelPage.tsx
│   ├── CorporationIntelPage.tsx
│   ├── CharacterIntelPage.tsx
│   └── BattleIntelConfigPage.tsx
├── components/
│   ├── IntelSummaryCards.tsx
│   ├── OpponentAnalysis.tsx
│   ├── ShipComposition.tsx
│   ├── GeographicActivity.tsx
│   ├── ActivityTimeline.tsx
│   └── config/
│       ├── CacheSettings.tsx
│       ├── DisplaySettings.tsx
│       └── DataAvailabilityStats.tsx
├── hooks/
│   ├── useAllianceIntel.ts
│   ├── useCorpIntel.ts
│   ├── useCharacterIntel.ts
│   ├── useGlobalSummary.ts
│   └── useFeatureConfig.ts
├── api/
│   ├── intel.ts
│   └── config.ts
└── types.ts
```

---

## Pages

_TODO: Define Battle Intel page components based on feature-spec.md Section 6_

---

## Components

_TODO: Define reusable Battle Intel UI components_

---

## Hooks

_TODO: Define data fetching hooks for Battle Intel_

---

## Styling Guidelines

_TODO: Define Battle Intel UI styling conventions_

---

## Notes

- Intelligence data availability depends on Battle Reports configuration
- Display clear messaging when data is missing due to ingestion filters
- Link to Battle Reports config for data collection issues
