import os, requests
from flask import Flask, request, abort

app = Flask(__name__)

BOT_TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]
CHAT_ID = os.environ["TELEGRAM_CHAT_ID"]
SECRET = os.environ["TRADINGVIEW_SECRET"]

def send_telegram(text):
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    r = requests.post(url, json={"chat_id": CHAT_ID, "text": text})
    r.raise_for_status()

@app.post("/tv")
def tv():
    data = request.get_json(silent=True) or {}

    if data.get("secret") != SECRET:
        abort(401)

    symbol = data.get("symbol", "XAUUSD")
    side = data.get("side", "?")
    order_type = data.get("type", "LIMIT")
    limit = data.get("limit")
    sl = data.get("sl")
    tp = data.get("tp")
    vwap = data.get("vwap")

    msg = (
        f"{symbol} {side} {order_type}\n"
        f"Limit: {limit}\n"
        f"SL: {sl}\n"
        f"TP: {tp} (VWAP)\n"
        f"VWAP: {vwap}"
    )

    send_telegram(msg)

    return {"ok": True}
