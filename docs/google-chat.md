# Sol in Google Chat

Sol HQ can post updates into a Google Chat space: a daily digest each morning, and one-off updates that land in topic threads with @-mentions. Everything starts as a draft. Nothing reaches Chat until a webhook secret exists, `GCHAT_SENDING=on` is set, and someone presses send on a draft (the daily digest can be set to send itself later).

Google's limits, checked against our needs:

| Need | Webhook (built) | Chat app (later) |
|---|---|---|
| Post into a space | Yes | Yes |
| Keep a topic in one thread | Yes, by thread key | Yes |
| @-mention a person (they get notified) | Yes, by Chat user id; `@all` works without ids | Yes |
| Message one person directly (DM) | No: webhooks live only in spaces | Yes, once the person adds the app |
| Read replies, answer back | No: one-way | Yes |
| Setup | About 15 minutes, no Google Cloud | Half a day: Google Cloud project, Chat API, admin approval |

Start with the webhook. A shared "Sol updates" space with @-mentions notifies each person by name, which covers most of what DMs would. Build the Chat app when per-person logins arrive (the Supabase step), because that is when Sol has a reason to know who is who.

Google's pages, for when a menu name has moved: "Build a Google Chat app as a webhook" and "Format messages" on developers.google.com/workspace/chat.

## Setup: webhook (Pooya, about 15 minutes)

1. **Check the admin switch.** Webhooks need a Google Workspace account (matchnice.org is one). If step 3 shows no Webhooks option, the admin setting is off: Admin console (admin.google.com) > Apps > Google Workspace > Google Chat > Chat apps (or "Chat apps access settings") > allow incoming webhooks. Save.
2. **Make the space.** In Google Chat: New chat > Create a space. Name it "Sol updates". Add Dickson and ib. Use a space even if it is only you for now; webhooks cannot post into 1:1 chats.
3. **Add the webhook.** In the space, click the space name at the top > Apps & integrations > Webhooks (sometimes "Add webhooks"). Name: `Sol`. Avatar URL: leave blank, or a public https link to the clover PNG. Save.
4. **Copy the URL.** It looks like `https://chat.googleapis.com/v1/spaces/…/messages?key=…&token=…`. Treat it like a password: anyone with it can post as Sol in that space. Do not paste it in chat, email or the repo.
5. **Put it in Replit.** Open the sol-hq app in Replit > Tools > Secrets > New secret: key `GCHAT_WEBHOOK_URL`, value the URL. Do not add `GCHAT_SENDING` yet.
6. **Pull and restart.** After the pull request is merged: in Replit, Git > Pull, then Stop and Run. The console line ends with `chat: Drafts only: sending waits for GCHAT_SENDING=on`. That confirms the webhook was read and nothing will send.
7. **Look at a draft.** Open `/api/gchat` in the browser (signed in to Sol HQ) to see the status and drafts. Until real snapshots replace the samples, every digest is marked SAMPLE and cannot be sent, by design.
8. **Say go.** When you want posts to flow, add the secret `GCHAT_SENDING` = `on` and restart. Each draft still needs its own send. To let the morning digest send itself, also add `GCHAT_DIGEST_AUTOSEND` = `on`.

To stop everything at once: delete `GCHAT_SENDING` (or set it to `off`) and restart. Drafts keep being written; nothing sends.

### Optional secrets

| Secret | What it does | Default |
|---|---|---|
| `GCHAT_WEBHOOK_<NAME>` | Another space, e.g. `GCHAT_WEBHOOK_SALES` becomes space `sales` | none |
| `GCHAT_PEOPLE` | Who `@name` mentions, as Chat user ids: `{"pooya":"1234…","dickson":"5678…"}` | none; `@all` still works |
| `GCHAT_DIGEST_HOUR` | Hour (Eastern) after which the digest is drafted | `8` |
| `GCHAT_DIGEST_SPACE` | Which space gets the digest | `main` |
| `GCHAT_DIGEST_THREAD` | Thread key that keeps every digest in one thread | `sol-daily-digest` |
| `GCHAT_DIGEST_ROLE` | Whose view the digest uses: `staff` (open), `lead` (open + studio), `founder` (all, incl. cash and runway) | `lead` |
| `GCHAT_DIGEST` | `off` stops the daily draft | on |
| `HQ_PUBLIC_URL` | Adds an "Open Sol HQ" link to the digest (https only) | none |

Finding a Chat user id: in the Admin console, open Directory > Users and click the person; the number at the end of the page address should be their id. If it does not match, skip `GCHAT_PEOPLE` and use `@all` until the Chat app arrives.

The digest uses `lead` by default so cash and runway (restricted rows) never go into a space. Set `founder` only for a space that holds the three founders and no one else.

## How it works

- `lib/gchat.js` holds the webhook check (https, `chat.googleapis.com`, `/v1/spaces/<id>/messages`, key and token), the outbox (`data/state/gchat-outbox.json`, server only), mentions, thread keys and the send gate. Webhook URLs never leave the server: not in `/config.js`, the outbox, logs or error messages.
- `lib/digest.js` builds the digest from the `pulse` and `ops` data sets and the hand-off list, filtered by role. If any set it reads is a sample, the digest says SAMPLE and cannot send.
- The server drafts one digest a day after `GCHAT_DIGEST_HOUR` (checked every 5 minutes while it runs).
- Posts are spaced at least 1.1 seconds apart (webhooks allow about one a second per space). Text is clipped at 4,000 characters.

### API (behind the Sol HQ password)

| Call | Does |
|---|---|
| `GET /api/gchat` | Status (spaces, people, sending on or off, why) and the last 50 drafts |
| `POST /api/gchat/drafts` `{text, space?, thread?}` | Saves a draft. `@name` stays as typed until send |
| `POST /api/gchat/digest` | Drafts today's digest now and returns it |
| `POST /api/gchat/send` `{id}` | Sends one draft if the gate allows; otherwise 409 with the reason |
| `POST /api/gchat/discard` `{id}` | Discards a draft |

POSTs must be `Content-Type: application/json` and, when the browser sends an Origin, come from Sol HQ itself, so another site cannot make a signed-in browser send.

Message text uses Chat's formatting: `*bold*`, `_italic_`, `~strike~`, `` `code` ``, and links as `<https://…|label>`.

### Not built yet

- A screen for drafts. The API is ready; the screen gets designed in the Sol HQ artifact first, then ported.
- Sol writing updates on its own from agent work. Today drafts come from the digest or a POST.
- A digest that fires every day without someone having the app open. Replit's Autoscale deployment sleeps when idle, and `data/state/` does not survive a redeploy there. When Sol HQ is published, either use a Reserved VM deployment or have a scheduler call `POST /api/gchat/digest` each morning, and move the outbox to Supabase with the rest of the state.
- DMs, reading replies and a two-way Sol in Chat: the Chat app below.

## Later: a Chat app for DMs and replies

What it takes, for when per-person logins land (ib's call on the Google Cloud side):

1. A Google Cloud project under matchnice.org; enable the Google Chat API.
2. Chat API > Configuration: app name "Sol", avatar, "Receive 1:1 messages" and "Join spaces"; connection to an https endpoint on Sol HQ (or an Apps Script project).
3. A service account for app authentication; its JSON key goes in Replit Secrets, never in git.
4. The Workspace admin allows the app for the domain.
5. Each person adds Sol once in Chat (New chat > Find apps). After that Sol can DM them and read what they write back.

Apps Script instead of Sol HQ as the endpoint: quicker to stand up (no server work, runs inside Google), but the code then lives outside this repo and its reviews, and Sol HQ would have to call the script to post. Keep it for a prototype at most; the endpoint belongs in Sol HQ.
