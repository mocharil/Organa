# Using Organa every day

Organa runs on your own computer. Your work lives in `data/state.json`, and nothing leaves the machine except the AI calls you trigger.

## Start and stop

```
npm start        # then open http://localhost:3000/app
```

Keep the terminal window open while you use it. Close it (Ctrl+C) to stop. Your data stays on disk.

## A good daily rhythm

1. **Open Overview.** The "Needs you" card lists everything waiting for you: approvals, questions from coworkers, failed tasks and meetings that need input. The browser tab title also shows a count, for example `(3) Organa`, even when the dashboard is closed.
2. **Handle what is waiting.** Approve a draft, answer a question, or ask for changes. If a coworker asks something your goals already answer, press **Proceed with your best assumptions**.
3. **Give new work.** Use **Missions** for an outcome with several steps (the Chief of Staff plans it), or **Tasks** to hand one piece of work to one coworker.
4. **Read the Stand-up.** One short briefing of what was done, what is blocked and what to do first.
5. **Keep what is useful.** In Knowledge or Approvals, every document has **Download .docx** (Word and Google Docs), **Download .csv** (Excel and Google Sheets), **Download .md** and **Copy text**. Once Google is connected (see [GOOGLE_SETUP.md](GOOGLE_SETUP.md)) there are also **Save to Google Docs** and **Save to Google Sheets**, which create the file in your own Drive.

## Emails

Open **Emails** (or press **Draft an email** on any finished document). Describe what the email should do, type who it goes to, and the AI writes a draft using your company context and hard constraints. Then you:

1. Read it, fix the wording, and check the **Check before sending** box if the AI raised a concern.
2. Press **Send via Gmail** (needs the one-time setup in [GOOGLE_SETUP.md](GOOGLE_SETUP.md)), or **Open in Gmail** to send it yourself with no setup.

Safeguards you can rely on: the AI never picks recipients and never sends; every send asks you to confirm; an email cannot go out with leftover `[placeholders]`; at most 10 recipients per email and 30 emails per day; sent emails cannot be edited; a double click sends only once; and if the connection drops mid-send, Organa tells you to check your Gmail Sent folder instead of resending blindly. If a request conflicts with your hard constraints (for example mass cold email), the draft explains the conflict and writes only a compliant alternative.

## Web research

Tick **Use web research** when you create a task or a mission. The coworker first searches the live web (Google Search) and then writes the document from what it found. The sources it used are listed under the document's evidence, and anything it could not verify is listed as an uncertainty. It adds about 10-30 seconds per task, so use it for facts that change: prices, competitors, rules, market size. Leave it off for internal planning or writing. If the search fails the task still finishes and says the facts are unverified.

## Several businesses or projects

Each organization is its own workspace with its own team, goals and work. Switch with the selector next to the organization name in the header (it appears when you have more than one). Switching never deletes anything. Create another from Overview with **Build My Team**.

## Trust and safety checks

- Every document shows a **Constraint guard** line: the hard constraints the coworker checked, such as a budget cap. A document with "No constraint check recorded" deserves a closer read.
- A request that conflicts with a hard constraint is flagged and answered with a compliant alternative instead of being followed.
- Nothing is posted, spent or published by the AI. Approvals stay with you.

## Backups

Organa copies `data/state.json` into `data/backups/` automatically (at most every 10 minutes while you work, keeping the 30 newest) and always before demo data is added or removed or a backup is restored. Manual and safety backups are never deleted automatically.

- **Settings → Backups** lists them. **Back up now** saves one on demand. **Restore** brings an older state back and saves the current one first. Your AI model settings are kept.
- To recover by hand, stop the server and copy a file from `data/backups/` over `data/state.json`.
- `data/` is ignored by git, so your business data is never committed. Copy the `data/backups/` folder to another drive or cloud folder for off-machine safety.

## Demo workspace

**Settings → Workspaces → Add the Nusa Coffee demo workspace** adds a finished example (team, a mission, a meeting decision, approved and pending work, and a stand-up). It opens instantly with no AI call and never touches your own workspaces. **Remove the demo workspace** deletes only the demo, after saving a backup.

## If something looks wrong

- **"The selected model is not available"**: open Settings and pick another model, or check `VERTEX_MODEL` in `.env`.
- **A task fails or takes long**: tasks usually take 20-60 seconds. Open Tasks and use Retry. If it keeps failing, check the AI status chip at the bottom of the sidebar.
- **The 3D office is slow**: use **3D: lite** in the sidebar footer.
- **Too many pages**: switch **Menu: simple** in the sidebar footer.

## Keeping credentials safe

Credentials belong in `.env` or in an environment variable, never in the repository. `gemini_sa.json` and `.env` are ignored by git. If a key was ever pasted into a chat or shared, rotate it in Google Cloud.
