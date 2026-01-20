# Key Rotation Policy

## 1. Secrets Classification & Frequency

| Secret Type | Tool/Provider | Rotation Frequency | Responsible |
|-------------|---------------|--------------------|-------------|
| **Database Passwords** | AWS RDS / Vault | 90 Days | DevOps |
| **JWT Signing Key** | App Config | 30 Days | Security Automation |
| **AWS IAM Keys** | AWS IAM | 90 Days | DevOps |
| **SaaS API Keys** (Stripe, SendGrid) | Vendor Dashboard | 180 Days (or on compromise) | Backend Lead |

## 2. Rotation Procedure (Database)
1. **Provision New User**: Create `app_user_v2` in Postgres.
2. **Update Vault**: Add `app_user_v2` credentials to Vault.
3. **Deploy App**: Restart Application to pick up new creds.
4. **Verify**: Ensure app connects successfully.
5. **Deprecate Old**: Remove `app_user_v1` from Postgres.

## 3. Rotation Procedure (JWT)
*Requires 30-min overlap window.*
1. **Add New Key**: Update `JWT_SECRET_ROTATION` list in Vault (app must support multiple verification keys).
2. **Sign with New**: Configure app to sign new tokens with New Key.
3. **Verify with Both**: App verifies incoming tokens against both Old and New.
4. **Expire Old**: After `Token_TTL` (e.g., 24h), remove Old Key from verification list.
