import os
import json
from typing import Any, Dict
import requests
from dotenv import load_dotenv

from flask import Flask, jsonify, render_template, request, send_from_directory

from services.langchain_pipeline import build_unified_index, search_unified_lc


app = Flask(__name__)


def _config_defaults() -> Dict[str, Any]:
    return {}


def ensure_dirs() -> Dict[str, str]:
    base_dir = os.getcwd()
    static_dir = os.path.join(base_dir, "static")
    uploads_dir = os.path.join(static_dir, "uploads")
    data_dir = os.path.join(base_dir, "data", "index")
    os.makedirs(static_dir, exist_ok=True)
    os.makedirs(uploads_dir, exist_ok=True)
    os.makedirs(data_dir, exist_ok=True)
    return {"base": base_dir, "uploads": uploads_dir, "data": data_dir}


def _get_webhook_url() -> str | None:
    return os.environ.get("WEBHOOK_URL")


def _post_to_webhook(payload: Dict[str, Any]) -> Dict[str, Any]:
    url = _get_webhook_url()
    if not url:
        return {"posted": False, "reason": "WEBHOOK_URL not set"}
    try:
        resp = requests.post(url, json=payload, timeout=15)
        return {"posted": True, "status_code": resp.status_code}
    except Exception as e:
        return {"posted": False, "error": str(e)}


@app.route("/")
def index() -> str:
    return render_template("index.html")


@app.route("/health")
def health() -> Any:
    return jsonify({"status": "ok"})


@app.route("/reset", methods=["POST"])  # dev only
def reset() -> Any:
    paths = ensure_dirs()
    # Clear indices and metadata
    removed = []
    for fn in os.listdir(paths["data"]):
        if fn.endswith(".index") or fn.endswith(".json"):
            try:
                os.remove(os.path.join(paths["data"], fn))
                removed.append(fn)
            except Exception:
                continue
    return jsonify({"removed": removed})


@app.route("/static/<path:filename>")
def static_files(filename: str):
    return send_from_directory("static", filename)


@app.route("/upload", methods=["POST"])
def upload_redirect_to_lc() -> Any:
    # Keep route name but use LangChain pipeline for simplicity
    return upload_langchain()


@app.route("/search", methods=["GET"])
def search_redirect_to_lc() -> Any:
    # Keep route name but use LangChain pipeline for simplicity
    return search_langchain()


@app.route("/search_unified", methods=["GET"])
def search_unified_route() -> Any:
    # Backward compatibility: use LangChain
    return search_langchain()


@app.route("/upload_lc", methods=["POST"])
def upload_langchain() -> Any:
    paths = ensure_dirs()
    if "file" not in request.files:
        return jsonify({"error": "No file part"}), 400
    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No selected file"}), 400
    pdf_path = os.path.join(paths["uploads"], file.filename)
    file.save(pdf_path)
    stats = build_unified_index(pdf_path)
    payload = {"event": "upload_lc", "file": os.path.basename(pdf_path), **stats}
    webhook_result = _post_to_webhook(payload)
    return jsonify({"status": "ok", **stats, "webhook": webhook_result})


@app.route("/search_lc", methods=["GET"])
def search_langchain() -> Any:
    query = request.args.get("query", "").strip()
    k = int(request.args.get("k", "5"))
    if not query:
        return jsonify({"error": "Missing query"}), 400
    res = search_unified_lc(query, k)
    payload = {"event": "search_lc", "query": query, "k": k, **res}
    webhook_result = _post_to_webhook(payload)
    return jsonify({**res, "webhook": webhook_result})


@app.route("/search_lc_page", methods=["GET"])
def search_langchain_page() -> Any:
    query = request.args.get("query", "").strip()
    k = int(request.args.get("k", "5"))
    if not query:
        return jsonify({"error": "Missing query"}), 400
    res = search_unified_lc(query, k)
    payload = {"event": "search_lc_page", "query": query, "k": k, **res}
    webhook_result = _post_to_webhook(payload)
    return jsonify({**res, "webhook": webhook_result})


if __name__ == "__main__":
    # Load environment variables from .env at startup
    load_dotenv()
    ensure_dirs()
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=True)


