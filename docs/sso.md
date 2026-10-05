# Sign in with Microsoft Entra ID

Winyu signs people in with Microsoft Entra ID, the same accounts the company uses for Teams. Entra proves who the person is. Winyu decides what they see: IT links each Entra account to one Winyu user, and that user's role sets every permission. An Entra account that IT has not linked can sign in to Microsoft but gets no data.

This guide covers how to register the app in Entra, which values to send to the Winyu team, how to switch sign-in modes, and how to run the whole flow locally against a mock Entra.

## Register Winyu in Entra

An Entra administrator does these steps once per environment (for example, once for production and once for staging).

1. In the Microsoft Entra admin center, go to **Identity** > **Applications** > **App registrations** and select **New registration**.
2. Enter the name `Winyu`.
3. Under **Supported account types**, select **Accounts in this organizational directory only (Single tenant)**.
4. Under **Redirect URI**, select the **Web** platform and enter `https://<winyu host>/api/auth/entra/callback`.
5. Select **Register**.
6. Open **Authentication**. Under **Web** > **Redirect URIs**, add `https://<winyu host>/login` so that Microsoft can return people to Winyu after they sign out. Leave **Implicit grant** cleared, because Winyu uses the authorization code flow with PKCE.
7. Open **Certificates & secrets** > **Client secrets** and select **New client secret**. Copy the secret's **Value** now, because Entra shows it only once. Note the expiry date: Winyu stops signing people in on that date unless you add a new secret first.
8. Open **API permissions**. Make sure the app has the Microsoft Graph delegated permissions `openid`, `profile`, and `email`. Select **Grant admin consent** so that people do not see a consent prompt.

Optional: to stop unassigned people from reaching even the Microsoft side of the sign-in, open **Enterprise applications** > **Winyu** > **Properties**, set **Assignment required** to **Yes**, and assign the users or groups who use Winyu. Winyu still requires its own link for each person.

## Send these values to the Winyu team

| Value | Where to find it in Entra | Setting in Winyu |
|---|---|---|
| Directory (tenant) ID | App registration > **Overview** | `ENTRA_TENANT_ID` |
| Application (client) ID | App registration > **Overview** | `ENTRA_CLIENT_ID` |
| Client secret value | Created in step 7 | `ENTRA_CLIENT_SECRET` |
| Redirect URI | Entered in step 4 | `ENTRA_REDIRECT_URI` |
| Object ID of each first IT administrator | **Users** > the person > **Overview** > **Object ID** | linked with `bun run identity link` |

Send the client secret through your secret store, not by email or chat.

## Configure the server

Winyu reads these environment variables.

| Variable | Value |
|---|---|
| `WINYU_AUTH` | `entra` for Microsoft sign-in. `demo` for the persona picker. When unset: `demo` in development, `entra` in production. |
| `WINYU_SESSION_SECRET` | At least 32 random characters that sign the session cookie. Set it when more than one server serves Winyu. When unset, Winyu keeps a random key in `.data/secrets.json`. |
| `ENTRA_TENANT_ID` | Directory (tenant) ID. |
| `ENTRA_CLIENT_ID` | Application (client) ID. |
| `ENTRA_CLIENT_SECRET` | Client secret value. |
| `ENTRA_REDIRECT_URI` | `https://<winyu host>/api/auth/entra/callback`, exactly as registered. |
| `ENTRA_AUTHORITY` | Development only. The base URL of a mock Entra. Defaults to `https://login.microsoftonline.com`. |

The **การเข้าสู่ระบบ** (sign-in) tab on `/admin` shows the mode in force and names any setting that is missing.

## Link the first IT administrator

Nobody can open `/admin` until at least one IT administrator is linked, so link the first one from the server shell:

```bash
ENTRA_TENANT_ID=<tenant id> bun run identity link <object id> u_ton --email=<their email>
bun run identity list
```

`u_ton` is the demo tenant's IT administrator. Use the Winyu user id of the real person.

## Grant access to everyone else

To grant access, the IT administrator signs in and opens **Admin console** > **การเข้าสู่ระบบ**.

- **รอให้สิทธิ์** (waiting for access) lists everyone Microsoft signed in whom Winyu does not know yet, with name, email, object ID, and the number of attempts. When the email matches a Winyu user, that user is already selected. Check the choice, then select **ให้สิทธิ์** (grant). The person can sign in at once.
- **บัญชีที่ผูกแล้ว** (linked accounts) lists every link. Select **ยกเลิกการผูก** (unlink) to remove one. The person's open session ends on their next request.
- **ผูกล่วงหน้าด้วย Object ID** links someone before their first sign-in, so they never see the no-access page.

The email match is only a suggestion. A link always rests on the Entra object ID and tenant ID, which do not change when someone's name or email changes.

## What people see

- In `entra` mode, `/login` shows one button: **เข้าสู่ระบบด้วย Microsoft** (sign in with Microsoft). The persona picker, `POST /api/session`, and the account sheet's persona switch do not exist. The demo endpoint answers 404.
- A linked person lands where they were going, signed in as their Winyu user.
- A person without a link lands on `/login/no-access`. The page asks them to send their name, email, and object ID to IT, and it shows no data.
- **ออกจากระบบ** (sign out) in the account sheet ends the Winyu session. The sign-in page then offers **ออกจากบัญชี Microsoft ด้วย** (sign out of Microsoft too) for shared computers.

## Switch between demo and Entra

To switch modes, set `WINYU_AUTH` and restart the server. A session records the mode that issued it, so switching signs everybody out:

- A demo session is refused in `entra` mode.
- An Entra session is refused in `demo` mode.
- The old unsigned cookie, which held only a user id, is refused in both modes.

Booth and demo machines that run `next start` must set `WINYU_AUTH=demo`, because production defaults to `entra`.

## Run the flow locally against a mock Entra

`scripts/entra-mock.ts` serves the Entra v2.0 endpoints that Winyu uses: discovery, authorize, token, keys, and logout. It runs under one tenant and signs ID tokens with RS256. Its account picker lists every persona under its demo email plus one outsider, `guest.contractor@example.com`, whom no persona matches.

```bash
export WINYU_AUTH=entra WINYU_SCHEDULER=off
export ENTRA_TENANT_ID=3c6f6a39-5d1e-4b7a-9f62-1a2b3c4d5e6f
export ENTRA_CLIENT_ID=7d1e2f30-4a5b-4c6d-8e7f-90a1b2c3d4e5
export ENTRA_CLIENT_SECRET=mock-client-secret-value
export ENTRA_AUTHORITY=http://localhost:3296
export ENTRA_REDIRECT_URI=http://localhost:3100/api/auth/entra/callback
bun run entra:mock &
bun run identity link "$(bun -e 'import { mockObjectId } from "./scripts/entra-mock"; console.log(mockObjectId("u_ton"))')" u_ton
bun run dev
```

`lib/server/auth/entra-flow.test.ts` runs the same flow inside `bun test` against a mock on a free port.

## How the pieces fit

- `lib/server/identity.ts` maps an outside identity (`provider`, `tenant`, `subject`) to a Winyu user and records sign-in attempts that have no link. Entra sign-in and Teams both use `provider: "entra"` with the tenant ID and the object ID, because a Teams activity carries the same `aadObjectId`. LINE uses `provider: "line"` with the channel ID and the LINE user ID.
- `lib/server/auth/entra.ts` runs the authorization code flow with PKCE through [`openid-client`](https://github.com/panva/openid-client). The library checks state, nonce, issuer, and audience. Winyu then checks that the tenant ID in the token matches `ENTRA_TENANT_ID`.
- `lib/server/auth/session-token.ts` signs the session cookie with HMAC-SHA256. The cookie records the user, the sign-in mode, and, for Entra, the identity link. `proxy.ts` refuses any cookie that this server did not sign. `readUser` also refuses an Entra session whose link IT removed or moved to another user.
- Permission stays in `lib/access`. Entra claims, groups, and app roles grant nothing.
