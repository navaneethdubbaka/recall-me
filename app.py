import os
import json
from typing import Any, Dict

from flask import Flask, jsonify, render_template, request, send_from_directory

from services.ingest import process_pdf, ensure_dirs
from services.indexer import add_to_text_index, add_to_image_index
from services.retriever import search as search_service


app = Flask(__name__)


def _config_defaults() -> Dict[str, Any]:
    return {
        "OCR_ENABLED": os.environ.get("OCR_ENABLED", "false").lower() == "true",
        "OCR_LANGUAGES": os.environ.get("OCR_LANGUAGES", "eng"),
        "MAX_PAGES": int(os.environ.get("MAX_PAGES", "0")) or None,
        "EMBEDDING_MODEL": os.environ.get("EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5"),
        "INDEX_TYPE": os.environ.get("INDEX_TYPE", "IP").upper(),
    }


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
def upload() -> Any:
    cfg = _config_defaults()
    paths = ensure_dirs()
    if "file" not in request.files:
        return jsonify({"error": "No file part"}), 400
    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No selected file"}), 400

    # Save uploaded PDF
    pdf_path = os.path.join(paths["uploads"], file.filename)
    file.save(pdf_path)

    # Ingest
    doc_id, text_chunks, images, tables = process_pdf(
        pdf_path,
        ocr_enabled=cfg["OCR_ENABLED"],
        ocr_languages=cfg["OCR_LANGUAGES"],
        max_pages=cfg["MAX_PAGES"],
    )

    # Index
    model_name = request.form.get("model") or cfg["EMBEDDING_MODEL"]
    index_type = request.form.get("index_type") or cfg["INDEX_TYPE"]
    added_text, total_text = add_to_text_index(text_chunks, model_name=model_name, index_type=index_type)
    added_images, total_images = add_to_image_index(images, model_name=model_name, index_type=index_type)

    return jsonify(
        {
            "doc_id": doc_id,
            "uploaded": os.path.basename(pdf_path),
            "text_chunks_added": added_text,
            "image_captions_added": added_images,
            "totals": {"text": total_text, "images": total_images},
            "tables_count": len(tables),
        }
    )


@app.route("/search", methods=["GET"])
def search() -> Any:
    query = request.args.get("query", "").strip()
    k = int(request.args.get("k", "3"))
    model_name = request.args.get("model") or _config_defaults()["EMBEDDING_MODEL"]
    index_type = (request.args.get("index_type") or _config_defaults()["INDEX_TYPE"]).upper()
    if not query:
        return jsonify({"error": "Missing query"}), 400
    results = search_service(query, k, model_name=model_name, index_type=index_type)
    return jsonify(results)


if __name__ == "__main__":
    ensure_dirs()
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=True)


