-- Adds opt-in per-client rate limiting, mirroring the existing opt-in IP allowlist pattern:
-- NULL/absent = unlimited (default, non-breaking for existing clients). Set ApiClients.RateLimitPerMinute
-- to enforce a per-minute cap for a specific client.

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.ApiClients') AND name = 'RateLimitPerMinute'
)
BEGIN
    ALTER TABLE dbo.ApiClients ADD RateLimitPerMinute INT NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ApiRateLimitWindow')
BEGIN
    CREATE TABLE dbo.ApiRateLimitWindow (
        ApiClientId INT NOT NULL,
        WindowStartUtc DATETIME2 NOT NULL,
        RequestCount INT NOT NULL DEFAULT 0,
        CONSTRAINT PK_ApiRateLimitWindow PRIMARY KEY (ApiClientId, WindowStartUtc)
    );
END
GO
