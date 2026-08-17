USE RegistrarApiDb;
GO
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET NOCOUNT ON;

PRINT 'Step 1: canonical account-level source (dedupe to one CHN per account+register)';
IF OBJECT_ID('tempdb..#AccountChn') IS NOT NULL DROP TABLE #AccountChn;

SELECT
    ROW_NUMBER() OVER (ORDER BY Acctno, regcode) AS RowNum,
    Acctno AS AccountNumber,
    regcode AS RegisterCode,
    MAX(NULLIF(LTRIM(RTRIM(chn)), '') COLLATE DATABASE_DEFAULT) AS Chn
INTO #AccountChn
FROM estock.dbo.T_shold
WHERE Acctno IS NOT NULL AND regcode IS NOT NULL
GROUP BY Acctno, regcode;

CREATE UNIQUE CLUSTERED INDEX IX_temp_rownum ON #AccountChn(RowNum);
CREATE INDEX IX_temp_chn ON #AccountChn(Chn) WHERE Chn IS NOT NULL;

SELECT COUNT(*) AS TotalAccountRegisterPairs,
       SUM(CASE WHEN Chn IS NOT NULL THEN 1 ELSE 0 END) AS WithChn,
       SUM(CASE WHEN Chn IS NULL THEN 1 ELSE 0 END) AS WithoutChn
FROM #AccountChn;

PRINT 'Step 2: assign one RegNo per distinct CHN group';
INSERT INTO dbo.ShareholderRegistry (Chn)
SELECT DISTINCT Chn FROM #AccountChn WHERE Chn IS NOT NULL;

PRINT 'Step 3: link CHN-having accounts to their group RegNo';
INSERT INTO dbo.ShareholderRegistryAccounts (RegNo, AccountNumber, RegisterCode)
SELECT r.RegNo, a.AccountNumber, a.RegisterCode
FROM #AccountChn a
JOIN dbo.ShareholderRegistry r ON r.Chn = a.Chn
WHERE a.Chn IS NOT NULL;

PRINT 'Step 4: assign a fallback singleton RegNo per account with no CHN';
IF OBJECT_ID('tempdb..#FallbackMap') IS NOT NULL DROP TABLE #FallbackMap;
CREATE TABLE #FallbackMap (RowNum bigint PRIMARY KEY, RegNo bigint);

MERGE dbo.ShareholderRegistry AS target
USING (SELECT RowNum FROM #AccountChn WHERE Chn IS NULL) AS src
ON 1 = 0
WHEN NOT MATCHED THEN
    INSERT (Chn) VALUES (NULL)
OUTPUT src.RowNum, inserted.RegNo INTO #FallbackMap(RowNum, RegNo);

PRINT 'Step 5: link fallback accounts to their singleton RegNo';
INSERT INTO dbo.ShareholderRegistryAccounts (RegNo, AccountNumber, RegisterCode)
SELECT fm.RegNo, a.AccountNumber, a.RegisterCode
FROM #FallbackMap fm
JOIN #AccountChn a ON a.RowNum = fm.RowNum;

PRINT 'Step 6: update AccountCount per RegNo';
UPDATE r
SET AccountCount = x.Cnt
FROM dbo.ShareholderRegistry r
JOIN (SELECT RegNo, COUNT(*) AS Cnt FROM dbo.ShareholderRegistryAccounts GROUP BY RegNo) x ON x.RegNo = r.RegNo;

PRINT 'DONE';
SELECT COUNT(*) AS TotalRegNos,
       SUM(CASE WHEN Chn IS NOT NULL THEN 1 ELSE 0 END) AS ChnGroupedRegNos,
       SUM(CASE WHEN Chn IS NULL THEN 1 ELSE 0 END) AS FallbackRegNos,
       (SELECT COUNT(*) FROM dbo.ShareholderRegistryAccounts) AS TotalAccountLinks
FROM dbo.ShareholderRegistry;
