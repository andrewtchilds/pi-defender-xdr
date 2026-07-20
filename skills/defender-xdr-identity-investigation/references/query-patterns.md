# Identity query patterns

Load only the section needed for the investigation. Replace placeholders and use a narrow `timespan` in `xdr_run_query`.

## Summarize user sign-ins

```kusto
EntraIdSignInEvents
| where AccountUpn =~ "<user-upn>"
| summarize Attempts=count(), FirstSeen=min(Timestamp), LastSeen=max(Timestamp)
    by ErrorCode, Application, IPAddress, Country, ClientAppUsed,
       AuthenticationRequirement, ConditionalAccessStatus, RiskLevelAggregated
| order by Attempts desc
| take 300
```

## Retrieve session details

Prefer a stable object ID after resolving the account.

```kusto
EntraIdSignInEvents
| where AccountObjectId == "<account-object-id>"
| project Timestamp, AccountUpn, Application, ResourceDisplayName, ErrorCode,
          CorrelationId, SessionId, IPAddress, Country, City, DeviceName,
          EntraIdDeviceId, IsManaged, IsCompliant, AuthenticationRequirement,
          ConditionalAccessStatus, RiskLevelAggregated, RiskState,
          ClientAppUsed, UserAgent
| order by Timestamp asc
| take 500
```

## Scope a potential password-spray source

Do not assume every failure is malicious.

```kusto
EntraIdSignInEvents
| where IPAddress == "<source-ip>"
| summarize Attempts=count(), Accounts=dcount(AccountObjectId),
            SuccessfulAccounts=dcountif(AccountObjectId, ErrorCode == 0),
            ErrorCodes=make_set(ErrorCode, 20)
    by bin(Timestamp, 15m), Application
| order by Timestamp asc
| take 500
```

## Pivot to cloud actions

```kusto
CloudAppEvents
| where AccountObjectId == "<account-object-id>"
| summarize Actions=count(), FirstSeen=min(Timestamp), LastSeen=max(Timestamp)
    by Application, ActionType, IPAddress, CountryCode, IsAdminOperation
| order by Actions desc
| take 300
```

Administrative actions require role and business-context review before being called malicious.

## Inspect service-principal activity

```kusto
EntraIdSpnSignInEvents
| where ServicePrincipalId == "<service-principal-id>"
| project Timestamp, ServicePrincipalName, ServicePrincipalId,
          IsManagedIdentity, Application, ApplicationId, ResourceDisplayName,
          ResourceId, ErrorCode, IPAddress, Country, CorrelationId
| order by Timestamp asc
| take 500
```
