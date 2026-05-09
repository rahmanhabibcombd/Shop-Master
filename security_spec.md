# Firestore Security Specification

## Data Invariants
1. All business entities (Sales, Products, Customers, etc.) MUST have a valid `shopId`.
2. A user can only access data where `resource.data.shopId` matches their associated `shopId`.
3. Merchants own their `shopId` (matching their UID).
4. Staff members have their `shopId` stored in their `users/{uid}` document.
5. Master Admin (`stratproamz@gmail.com`) has bypass access to all shops.

## The Dirty Dozen Payloads

1. **Identity Spoofing**: Merchant A attempts to create a product with `shopId: "merchantB"`.
2. **State Shortcutting**: Staff attempts to update sensitive settings without permission.
3. **Resource Poisoning**: Attacker attempts to create a document with a 1MB string as building ID.
4. **PII Leak**: Unauthorized user attempts to 'get' customer list of another shop.
5. **Orphaned Write**: Creating a sale without a valid `shopId`.
6. **Immutable Field Tampering**: Updating `createdAt` or `originalOrderId`.
7. **Privilege Escalation**: Staff member attempts to update their own role to 'admin'.
8. **Value Poisoning**: Updating `price` to a negative number or a string.
9. **Query Scraping**: Authenticated user attempts `list` on `customers` collection without `where('shopId', '==', ...)`.
10. **Terminal State Break**: Updating a completed `daily_closing`.
11. **PII Isolation**: Non-owner attempts to read full customer profile including private notes.
12. **Denial of Wallet**: Creating 10,000 recursive subcollections (theoretical, rules should limit).

## Test Runner (Logic Check)
The rules must reject all the above.
