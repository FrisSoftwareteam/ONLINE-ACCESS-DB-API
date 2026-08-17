-- Creates a dedicated, read-only SQL login for this API to use.
-- Replace 'CHANGE-ME-STRONG-PASSWORD' with a freshly generated strong password
-- before running, then put the real credentials into your .env / Vercel env vars
-- (never back into this file).

USE master;
GO
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'registrarapi_svc')
BEGIN
    CREATE LOGIN registrarapi_svc WITH PASSWORD = 'CHANGE-ME-STRONG-PASSWORD', CHECK_POLICY = ON;
END
GO

USE frdb;
GO
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'registrarapi_svc')
    CREATE USER registrarapi_svc FOR LOGIN registrarapi_svc;
ALTER ROLE db_datareader ADD MEMBER registrarapi_svc;
GO

USE estock;
GO
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'registrarapi_svc')
    CREATE USER registrarapi_svc FOR LOGIN registrarapi_svc;
ALTER ROLE db_datareader ADD MEMBER registrarapi_svc;
GO

USE RegistrarApiDb;
GO
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'registrarapi_svc')
    CREATE USER registrarapi_svc FOR LOGIN registrarapi_svc;
ALTER ROLE db_datareader ADD MEMBER registrarapi_svc;
ALTER ROLE db_datawriter ADD MEMBER registrarapi_svc;
GO

SELECT 'Service login and permissions created' AS Result;
