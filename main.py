"""
Skills4Future Website Chatbot — Backend
----------------------------------------
A lightweight, public-facing FAQ chatbot for skills4future.in.

Answers visitor questions about the Foundation/Advanced courses, eligibility,
duration, fees, certificates, the AICTE Internship, and the Faculty Development
Program (FDP), grounded in data/knowledge_base.txt (compiled from the live site).

Run locally:
    pip install -r requirements.txt
    cp .env.example .env      # then add your OPENAI_API_KEY
    uvicorn main:app --reload --port 8000

Test:
    open http://localhost:8000/docs
    or open widget/demo.html in a browser (update API_URL inside widget/widget.js first)
"""

import os
import uuid
import logging
from pathlib import Path
from typing import Dict, List

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("s4f_chatbot")

# ---------------------------------------------------------------------------
# Config — Google Gemini API (free tier)
# Get a free key at https://aistudio.google.com/apikey (no credit card needed)
# ---------------------------------------------------------------------------
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")  # free-tier model; check aistudio.google.com for current free models
GEMINI_URL_TEMPLATE = (
    "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
)
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")
MAX_HISTORY_TURNS = int(os.getenv("MAX_HISTORY_TURNS", "6"))  # user+assistant pairs kept per session

if not GEMINI_API_KEY:
    logger.warning("GEMINI_API_KEY is not set — /chat will fail until it is configured in .env")

KB_PATH = Path(__file__).parent / "data" / "knowledge_base.txt"


def load_knowledge_base() -> str:
    if not KB_PATH.exists():
        logger.error(f"Knowledge base file not found at {KB_PATH}")
        return ""
    return KB_PATH.read_text(encoding="utf-8")


KNOWLEDGE_BASE = load_knowledge_base()

SYSTEM_PROMPT_TEMPLATE = """You are the official assistant for the Skills4Future program \
(skills4future.in), a CSR initiative by Shell India and Edunet Foundation offering free \
Green Skills + AI training to engineering students and faculty.

Answer visitor questions using ONLY the knowledge base below. Be friendly, concise, and \
clear — most visitors are students or faculty deciding whether to enrol.

Rules:
- If the answer is in the knowledge base, answer directly and confidently.
- If the question is about something NOT in the knowledge base (e.g. personal application \
status, specific seat availability, exact dates not listed), say you don't have that \
information and direct them to the Contact page (skills4future.in/contact) or email \
skills4future@edunetfoundation.org. Do not guess.
- If asked to register/enrol, point them to the correct registration link from the \
knowledge base (Foundation vs Advanced vs FDP are different links).
- Keep answers short and skimmable — use short paragraphs or bullet points, not walls of text.
- Always respond in English.
- Never invent facts, dates, fees, or policies not present in the knowledge base.

KNOWLEDGE BASE:
{knowledge_base}
"""

# ---------------------------------------------------------------------------
# In-memory session store (swap for Redis/DB if you need persistence/scale)
# ---------------------------------------------------------------------------
SESSION_STORE: Dict[str, List[dict]] = {}

app = FastAPI(
    title="Skills4Future Chatbot API",
    description="Public FAQ chatbot backend for skills4future.in",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    session_id: str | None = None


class ChatResponse(BaseModel):
    reply: str
    session_id: str


@app.get("/health")
def health():
    return {"status": "ok", "knowledge_base_loaded": bool(KNOWLEDGE_BASE)}


def call_gemini(history: List[dict], user_message: str) -> str:
    """Call the Gemini generateContent REST endpoint. Raises on failure."""
    # Gemini uses "user"/"model" roles (not "assistant"), and history entries need
    # to be wrapped as {"role": ..., "parts": [{"text": ...}]}
    contents = []
    for turn in history:
        role = "model" if turn["role"] == "assistant" else "user"
        contents.append({"role": role, "parts": [{"text": turn["content"]}]})
    contents.append({"role": "user", "parts": [{"text": user_message}]})

    payload = {
        "contents": contents,
        "systemInstruction": {
            "parts": [{"text": SYSTEM_PROMPT_TEMPLATE.format(knowledge_base=KNOWLEDGE_BASE)}]
        },
        "generationConfig": {"temperature": 0.3, "maxOutputTokens": 500},
    }

    url = GEMINI_URL_TEMPLATE.format(model=GEMINI_MODEL, key=GEMINI_API_KEY)
    resp = httpx.post(url, json=payload, timeout=30.0)

    if resp.status_code != 200:
        raise RuntimeError(f"Gemini API returned {resp.status_code}: {resp.text[:300]}")

    data = resp.json()
    try:
        return data["candidates"][0]["content"]["parts"][0]["text"].strip()
    except (KeyError, IndexError):
        raise RuntimeError(f"Unexpected Gemini response shape: {data}")


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    if not GEMINI_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="Server is missing GEMINI_API_KEY. Set it in the .env file and restart.",
        )

    session_id = req.session_id or str(uuid.uuid4())
    history = SESSION_STORE.get(session_id, [])

    try:
        reply = call_gemini(history, req.message)
    except Exception as e:
        logger.exception("Gemini call failed")
        raise HTTPException(status_code=502, detail=f"Chat model error: {e}")

    # Update session history (trim to last N turns to control token usage)
    history.append({"role": "user", "content": req.message})
    history.append({"role": "assistant", "content": reply})
    SESSION_STORE[session_id] = history[-(MAX_HISTORY_TURNS * 2):]

    return ChatResponse(reply=reply, session_id=session_id)


@app.delete("/chat/{session_id}")
def clear_session(session_id: str):
    SESSION_STORE.pop(session_id, None)
    return {"status": "cleared", "session_id": session_id}
