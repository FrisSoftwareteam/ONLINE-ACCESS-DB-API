IF DB_ID('RegistrarApiDb') IS NULL
BEGIN
    CREATE DATABASE RegistrarApiDb;
END
GO

USE RegistrarApiDb;
GO

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF OBJECT_ID('dbo.ApiClients') IS NULL
CREATE TABLE dbo.ApiClients (
    Id              int IDENTITY(1,1) PRIMARY KEY,
    ClientName      varchar(200) NOT NULL,
    ApiKeyHash      varbinary(32) NOT NULL,   -- SHA-256 of the raw API key; raw key is never stored
    IsActive        bit NOT NULL DEFAULT 1,
    CreatedOn       datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
    LastUsedOn      datetime2 NULL
);
GO

IF OBJECT_ID('dbo.ApiIpAllowlist') IS NULL
CREATE TABLE dbo.ApiIpAllowlist (
    Id              int IDENTITY(1,1) PRIMARY KEY,
    ApiClientId     int NOT NULL REFERENCES dbo.ApiClients(Id),
    IpAddress       varchar(45) NOT NULL,     -- single IPv4/IPv6 address or CIDR block
    Description     varchar(200) NULL,
    IsActive        bit NOT NULL DEFAULT 1,
    CreatedOn       datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF OBJECT_ID('dbo.ShareholderRegistry') IS NULL
CREATE TABLE dbo.ShareholderRegistry (
    RegNo           bigint IDENTITY(1000001,1) PRIMARY KEY,
    Chn             varchar(50) NULL,          -- populated only for CHN-grouped registrations
    AccountCount    int NOT NULL DEFAULT 0,
    CreatedOn       datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

CREATE UNIQUE INDEX IX_ShareholderRegistry_Chn ON dbo.ShareholderRegistry(Chn) WHERE Chn IS NOT NULL;
GO

IF OBJECT_ID('dbo.ShareholderRegistryAccounts') IS NULL
CREATE TABLE dbo.ShareholderRegistryAccounts (
    Id              bigint IDENTITY(1,1) PRIMARY KEY,
    RegNo           bigint NOT NULL REFERENCES dbo.ShareholderRegistry(RegNo),
    AccountNumber   int NOT NULL,
    RegisterCode    smallint NOT NULL
);
GO

CREATE INDEX IX_SRA_RegNo ON dbo.ShareholderRegistryAccounts(RegNo);
CREATE UNIQUE INDEX IX_SRA_Account_Register ON dbo.ShareholderRegistryAccounts(AccountNumber, RegisterCode);
GO

IF OBJECT_ID('dbo.RequestLog') IS NULL
CREATE TABLE dbo.RequestLog (
    Id              bigint IDENTITY(1,1) PRIMARY KEY,
    ApiClientId     int NULL,
    Method          varchar(10) NOT NULL,
    Path            varchar(500) NOT NULL,
    StatusCode      int NOT NULL,
    RemoteIp        varchar(45) NOT NULL,
    RequestedOn     datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
    DurationMs      int NOT NULL
);
GO

SELECT 'RegistrarApiDb schema created' AS Result;
