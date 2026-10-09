# Connect Google Docs and Sheets (about 10 minutes, once)

After this, every finished document in Organa gets **Save to Google Docs** and **Save to Google Sheets**. The file is created in your own Google Drive, with headings and tables intact.

You do not need this to export. **Download .docx** and **Download .csv** work immediately, and both open in Google Docs and Sheets (Drive → New → File upload).

## What Organa can and cannot access

Organa asks for one narrow permission, `drive.file`: it can open **only the files it creates itself**. It cannot see your other Drive files, your email or your calendar. You can remove access any time from Settings → **Disconnect Google** or at https://myaccount.google.com/permissions.

## Optional: send email from Organa

Organa can also send the emails you approve, through your own Gmail. This needs one extra permission, **send only** (`gmail.send`): Organa can send a message you reviewed, but it cannot read, search, list or delete any email. It never sends anything on its own, and sending needs your click on every message.

Extra setup, after the steps below:

1. APIs & Services → Library → **Gmail API** → **Enable** (same project as the Drive API).
2. Google Auth Platform → **Data Access** → **Add or remove scopes** → add `.../auth/gmail.send` (and keep `drive.file`).
3. In Organa open **Emails** → **Enable email sending** and allow the permission. Google may show "Google hasn't verified this app" because this permission is classed as sensitive; for your own project choose **Advanced → Go to Organa**. Make sure your account is listed under **Audience → Test users**.

If you only want to draft emails and send them yourself, the **Open in Gmail** button on every draft needs no setup at all.

## Setup

Google renames console menus from time to time; if a label below differs, look for the closest one.

1. **Create a project.** Open https://console.cloud.google.com, click the project picker, then **New project**. A separate personal project (for example `organa-local`) keeps this apart from your Vertex AI project.
2. **Enable the Drive API.** APIs & Services → Library → search **Google Drive API** → **Enable**. (Docs and Sheets APIs are not needed.)
3. **Set up the consent screen.** Google Auth Platform → **Get started**. App name `Organa`, your email as support and contact address, audience **External** (choose **Internal** if you use a Google Workspace account).
4. **Create the OAuth client.** Google Auth Platform → **Clients** → **Create client** → type **Web application**. Under **Authorized redirect URIs** add exactly:

   ```
   http://localhost:3000/api/google/callback
   ```

   Copy the **Client ID** and **Client secret**.
5. **Add them to `.env`** in the Organa folder, then restart (`npm start`):

   ```
   GOOGLE_OAUTH_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret
   ```

   If you run Organa on another port, set `GOOGLE_OAUTH_REDIRECT_URI` to the matching address and register that one instead.
6. **Connect.** In Organa open Settings → **Google Docs and Sheets** → **Connect Google**, choose your account and click **Allow**. You return to Organa automatically.

## Reconnecting every week

While the consent screen is in **Testing** mode, Google expires the sign-in after 7 days, and Organa will ask you to connect again. To avoid that, add yourself under **Audience → Test users** and then, for personal use with only this narrow permission, set the publishing status to **In production** (Audience → **Publish app**). Because `drive.file` is a non-sensitive permission, Google does not require a verification review for it. If Google shows an "unverified app" screen, choose **Advanced → Go to Organa**; it is your own project.

## Troubleshooting

| Message | What to do |
| --- | --- |
| `redirect_uri_mismatch` | The URI in step 4 must match exactly, including `http`, `localhost` and the port. |
| "The Google Drive API is not enabled" | Do step 2 in the same project as your OAuth client, wait a minute, retry. |
| "Google access was revoked or expired" | Connect Google again in Settings. |
| "The Gmail API is not enabled" | Enable the Gmail API in the same project (see the email section above), wait a minute, retry. |
| "Sending email is not enabled yet" | Open Emails → Enable email sending, or Settings → Google. |
| "Google is not set up yet" | Add the two `.env` values and restart. |
| Access blocked / app not verified | Add your account under Test users (step above). |

## Keeping it safe

- The sign-in is stored in `data/google-connection.json` on this computer only. It is ignored by git and is not part of workspace backups. Treat that file like a password.
- The client secret lives in `.env`, which is also ignored by git. Never paste either value into a chat or a public repository.
- Organa listens on `127.0.0.1` by default, so only this computer can reach it. Do not expose it to a network after connecting Google, because the app has no login.
