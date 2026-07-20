---
name: defender-xdr-messaging-investigation
description: Investigates Defender XDR email and Teams threats. Use for phishing, attachments, URLs, delivery and remediation, Safe Links clicks, campaigns, sender or domain pivots, and recipient impact.
license: MIT
compatibility: Requires the pi-defender-xdr extension, /xdr-login, and access to Defender for Office 365 hunting tables.
---

# Defender XDR Messaging Investigation

Perform read-only email and Teams hunting. Use the cross-domain `defender-xdr-investigation` skill when identity, endpoint, or alert pivots are required.

## Rules

- Use `xdr_get_schema` when a table, column, or current tenant shape is uncertain.
- Prefer `NetworkMessageId` for email correlation and `TeamsMessageId` for Teams correlation. Internet message IDs, subjects, and sender display names are weaker pivots.
- Distinguish original delivery from latest delivery state and post-delivery remediation.
- Distinguish URL presence from a click, and a blocked click from a click-through.
- Do not classify a sender, domain, attachment, or URL as malicious solely from rarity or a verdict field.
- Minimize exposure of message subjects, recipient addresses, and URLs. Project them only when relevant.
- Do not export complete recipient or message data unless the user explicitly requests it.
- Empty results do not prove a message or click did not exist; state retention, product, RBAC, ingestion, and identifier limitations.

## Table selection

Use `xdr_get_schema` to confirm likely sources:

- `EmailEvents`: email metadata, verdicts, delivery, sender, and recipient
- `EmailAttachmentInfo`: attachment names, hashes, and verdict context
- `EmailUrlInfo`: URLs contained in email
- `EmailPostDeliveryEvents`: post-delivery actions and results
- `UrlClickEvents`: Safe Links and URL-click activity
- `CampaignInfo`: identified email campaign context
- `MessageEvents`: Teams message metadata and detections
- `MessageUrlInfo`: URLs in Teams messages
- `MessagePostDeliveryEvents`: Teams post-delivery actions
- `AlertInfo` and `AlertEvidence`: alert and entity context

## Workflow

1. Resolve the message using a stable message ID where possible.
2. Record sender identities, sending infrastructure, recipients, original delivery, latest delivery, verdicts, attachment hashes, and URLs.
3. Inspect post-delivery actions and whether each action succeeded.
4. Determine exposure: delivered recipients, clicked users, click-through status, and endpoint or identity follow-on activity.
5. Scope related messages using strong indicators such as hashes, normalized URLs/domains, sender infrastructure, or campaign ID—not subject alone.
6. Compare prevalence and historical legitimate traffic before concluding impersonation or compromise.
7. Build a UTC timeline from receipt through clicks, alerts, and post-delivery actions.

## Query patterns

Resolve an email by network message ID:

```kusto
EmailEvents
| where Timestamp between (datetime(<start-utc>) .. datetime(<end-utc>))
| where NetworkMessageId == "<network-message-id>"
| project Timestamp, NetworkMessageId, InternetMessageId, SenderFromAddress,
          SenderMailFromAddress, SenderIPv4, RecipientEmailAddress, Subject,
          DeliveryAction, DeliveryLocation, LatestDeliveryAction, LatestDeliveryLocation,
          ThreatTypes, DetectionMethods, AuthenticationDetails, AttachmentCount, UrlCount
| order by Timestamp asc
| take 500
```

Summarize recipient scope before returning addresses:

```kusto
EmailEvents
| where Timestamp between (datetime(<start-utc>) .. datetime(<end-utc>))
| where NetworkMessageId == "<network-message-id>"
| summarize Recipients=dcount(RecipientObjectId), Records=count(),
            FirstSeen=min(Timestamp), LastSeen=max(Timestamp)
    by DeliveryAction, DeliveryLocation, LatestDeliveryAction, LatestDeliveryLocation, ThreatTypes
| take 100
```

Join attachments only after reducing both sides:

```kusto
let messages = EmailEvents
| where Timestamp between (datetime(<start-utc>) .. datetime(<end-utc>))
| where NetworkMessageId == "<network-message-id>"
| project NetworkMessageId, RecipientEmailAddress, DeliveryAction, LatestDeliveryAction;
EmailAttachmentInfo
| where Timestamp between (datetime(<start-utc>) .. datetime(<end-utc>))
| where NetworkMessageId == "<network-message-id>"
| project Timestamp, NetworkMessageId, FileName, FileType, SHA256, ThreatTypes
| join kind=inner messages on NetworkMessageId
| project Timestamp, NetworkMessageId, RecipientEmailAddress, FileName, FileType,
          SHA256, ThreatTypes, DeliveryAction, LatestDeliveryAction
| take 500
```

Inspect clicks separately from URL presence:

```kusto
UrlClickEvents
| where Timestamp between (datetime(<start-utc>) .. datetime(<end-utc>))
| where NetworkMessageId == "<network-message-id>"
| project Timestamp, AccountUpn, Url, ActionType, IsClickedThrough,
          IPAddress, Workload, ThreatTypes, DetectionMethods
| order by Timestamp asc
| take 500
```

Check post-delivery outcomes:

```kusto
EmailPostDeliveryEvents
| where Timestamp between (datetime(<start-utc>) .. datetime(<end-utc>))
| where NetworkMessageId == "<network-message-id>"
| project Timestamp, NetworkMessageId, RecipientEmailAddress, Action, ActionType,
          ActionTrigger, ActionResult, SourceLocation, DeliveryLocation, ThreatTypes
| order by Timestamp asc
| take 500
```

For Teams, use `MessageEvents`, `MessageUrlInfo`, and `MessagePostDeliveryEvents` with `TeamsMessageId` and the same reduce-before-join approach.

## Interpretation cautions

- `DeliveryAction` and `DeliveryLocation` describe an earlier state; use latest and post-delivery fields to assess current state.
- A post-delivery action record does not prove success; inspect `ActionResult`.
- URL rewriting and redirect chains can make simple string matching incomplete.
- Authentication results such as SPF, DKIM, and DMARC require context; forwarding and legitimate services can alter outcomes.
- A click event does not automatically establish credential entry, payload execution, or compromise.
- Shared mailboxes, distribution lists, and message duplication can distort recipient counts.
