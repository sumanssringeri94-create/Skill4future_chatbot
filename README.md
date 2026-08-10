# Skills4Future Website Chatbot

A public-facing FAQ chatbot for **skills4future.in**. Answers visitor questions about
the Foundation/Advanced courses, eligibility, duration, fees, certificates, the AICTE
Internship, and the Faculty Development Program (FDP) — grounded in the site's own
public content (`data/knowledge_base.txt`).

Two parts:
- **`main.py`** — FastAPI backend with a `/chat` endpoint (calls Google's Gemini API,
  free tier — no credit card required)
- **`widget/widget.js`** — a single embeddable `<script>` tag that adds a floating chat
  bubble to any page

---

## 1. Get a free Gemini API key (no payment needed)

1. Go to https://aistudio.google.com/apikey
2. Sign in with any Google account
3. Click "Create API key" — no credit card or billing setup required
4. Copy the key

Free tier has daily/per-minute request limits (fine for a low-traffic FAQ bot). If the
client's traffic grows a lot later, Google's paid tier can be enabled with the same key —
no code changes needed.

## 2. Run the backend locally

```bash
cd s4f_chatbot
pip install -r requirements.txt
cp .env.example .env
```

Open `.env` and paste your key:
```
GEMINI_API_KEY=your-key-here
```

Then start the server:
```bash
uvicorn main:app --reload --port 8000
```

Check it's alive: open http://localhost:8000/health — should return
`{"status": "ok", "knowledge_base_loaded": true}`.

Full interactive API docs: http://localhost:8000/docs

## 3. Test the widget locally

Open `widget/demo.html` directly in a browser (double-click it, or serve it with any
static file server). It points at `http://localhost:8000` by default — click the green
bubble bottom-right and chat.

## 4. Deploy the backend

You need this running on a server with a public URL before it can be embedded on the
live site. Simple options:

- **Render / Railway / Fly.io** — easiest for a small FastAPI app, free/cheap tiers available
- **A VPS you already have** — run with `uvicorn main:app --host 0.0.0.0 --port 8000`
  behind nginx, or use a process manager like `systemd` or `pm2`
- Set the `GEMINI_API_KEY` as an environment variable on whatever platform you use —
  don't commit `.env` to git

Once deployed, note the public URL (e.g. `https://s4f-chatbot.onrender.com`).

**Important — lock down CORS before going live.** In `.env`, set:
```
ALLOWED_ORIGINS=https://skills4future.in,https://www.skills4future.in
```
Otherwise any website could call your API and rack up your OpenAI bill.

## 5. Embed the widget on skills4future.in

Add this line before the closing `</body>` tag on the site (or wherever their site
template allows a script include):

```html
<script src="https://YOUR-CDN-OR-SERVER/widget.js" data-api-url="https://YOUR-BACKEND-URL"></script>
```

- Host `widget.js` anywhere static (same server as the backend, a CDN, or their own
  static assets folder) — it just needs a public URL.
- `data-api-url` must point at your deployed backend from step 4.

That's it — the chat bubble will appear on every page that includes the script tag.

---

## Updating the knowledge base

All chatbot answers come from `data/knowledge_base.txt`. If the program's courses,
fees, eligibility, or dates change on the actual website, update this file to match —
the bot has no other source of truth and will not "guess." Restart the server after
editing (or redeploy) to pick up changes.

## Cost note

Gemini's free tier requires no payment method and no credit card. It has rate limits
(a capped number of requests per minute/day), which is plenty for a low-to-moderate
traffic FAQ bot. If the client's traffic grows significantly, you can enable billing
on the same Google Cloud project later — same API key, same code, no changes needed.
Google's free-tier model lineup shifts periodically; if `/chat` starts failing with a
model-related error, check https://aistudio.google.com for the current free-tier model
name and update `GEMINI_MODEL` in `.env`.

## What this does NOT include (by design, given current scope)

- No database, no login integration, no student records — this is a stateless FAQ
  assistant only
- No Gmail/email automation
- No Hindi support (English only, per current requirement)
- No admin dashboard — to see conversations you'd need to add logging (not included)

If the client later wants any of these (e.g. answering account-specific questions,
multi-language support, or analytics on what visitors ask), those are separate,
larger additions — let's scope them separately if/when needed.

## Project structure

```
s4f_chatbot/
├── main.py                  FastAPI backend, /chat endpoint
├── requirements.txt
├── .env.example
├── data/
│   └── knowledge_base.txt   Source of truth for all chatbot answers
└── widget/
    ├── widget.js            Embeddable chat bubble (drop into the site)
    └── demo.html            Local test page for the widget
```
