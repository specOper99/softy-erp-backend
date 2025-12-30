# System Architecture

## Overview
The Chapters Studio ERP is a monolithic NestJS application designed for scalability and modularity. It follows a layered architecture, separating core infrastructure concerns from feature-specific business logic.

## High-Level Structure
The codebase is organized into three main layers:

1.  **Core / Infrastructure (Root)**:
    -   `AppModule`: The root module that ties everything together.
    -   Global Configuration (Config, TypeORM, Throttler, Logger).
    -   Global Interceptors and Guards (`GlobalCacheInterceptor`, `IpRateLimitGuard`).

2.  **Common Layer (`src/common`)**:
    -   Shared utilities, guards, decorators, filters, and middleware.
    -   **Resilience**: Circuit breakers and retry strategies.
    -   **Cache**: Redis caching modules.
    -   **Domain**: Shared interfaces (e.g., `IUser`, `ITask`).

3.  **Feature Modules (`src/modules`)**:
    -   Domain-specific modules encapsulating business logic, controllers, and services.
    -   Examples: `Auth`, `Users`, `Tenants`, `Finance`, `Projects`.

## Module Dependency Graph

The following diagram illustrates the high-level relationships between the core application structure and its feature modules.

```mermaid
graph TD
    subgraph Core "Core Infrastructure"
        AppModule
        Config[Configuration & Env]
        DB[Database / TypeORM]
        Cache[Redis / CacheModule]
        Logger[Winston Logger]
        Guards[Global Guards\n(Tenant, RateLimit)]
    end

    subgraph Common "Shared / Common"
        CommonUtils[Utilities & Helpers]
        Resilience[Resilience Module]
        BaseDomain[Domain Interfaces]
    end

    subgraph Features "Feature Modules"
        Auth[Auth Module]
        Users[Users Module]
        Tenants[Tenants Module]
        Finance[Finance Module]
        Tasks[Tasks Module]
        Media[Media Module]
        Mail[Mail Module]
        Dashboard[Dashboard Module]
        Audit[Audit Module]
        Hr[HR Module]
        Catalog[Catalog Module]
        Bookings[Bookings Module]
        Health[Health Module]
        Metrics[Metrics Module]
    end

    %% Core dependencies
    AppModule --> Config
    AppModule --> DB
    AppModule --> Cache
    AppModule --> Logger
    AppModule --> Guards

    %% Feature Module Aggregation
    AppModule --> Features

    %% Feature Dependencies on Common
    Features --> Common
    
    %% Specific Feature Interactions (examples)
    Auth --> Users
    Tasks --> Users
    Finance --> Users
    Dashboard --> Finance
    Dashboard --> Tasks
    Dashboard --> Users
    Tenants --> Users
    
    %% Common Dependencies
    Guards -.-> CommonUtils
    Resilience -.-> Logger
```

## Resilience & Security Mechanisms

-   **Rate Limiting**: Implemented via `IpRateLimitGuard` (Token Bucket / Sliding Window) to prevent abuse.
-   **Caching**: `GlobalCacheInterceptor` caches GET requests using Redis to reduce DB load.
-   **Circuit Breakers**: `ResilienceModule` wraps external calls (S3, Email) to handle failures gracefully.
-   **Secrets**: HashiCorp Vault is used for active secret retrieval at startup.
-   **Tenant Isolation**: `TenantGuard` and `TenantMiddleware` ensure request context is bound to a specific tenant.
