import os
import json
import base64
import tempfile
import shutil
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


def _convert_base64_to_images(images: Dict[str, str]) -> Dict[str, str]:
    """Convert base64 images to actual image files and return file paths"""
    if not images:
        print("No images to convert")
        return {}
    
    print(f"Converting {len(images)} images...")
    
    # Create permanent images directory
    images_dir = os.path.join("static", "images")
    os.makedirs(images_dir, exist_ok=True)
    
    image_paths = {}
    
    try:
        for image_id, base64_data in images.items():
            print(f"Processing image: {image_id}")
            # Remove data URL prefix if present
            if base64_data.startswith('data:image/png;base64,'):
                base64_data = base64_data.split(',', 1)[1]
            elif base64_data.startswith('data:image/'):
                # Handle other image formats
                base64_data = base64_data.split(',', 1)[1]
            
            # Decode base64 to bytes
            try:
                image_bytes = base64.b64decode(base64_data)
                print(f"Decoded {len(image_bytes)} bytes for {image_id}")
            except Exception as e:
                print(f"Failed to decode base64 for {image_id}: {e}")
                continue
            
            # Create image file in permanent directory
            image_filename = f"{image_id}.png"
            image_path = os.path.join(images_dir, image_filename)
            
            with open(image_path, 'wb') as f:
                f.write(image_bytes)
            
            # Store relative path for serving
            image_paths[image_id] = f"/static/images/{image_filename}"
            print(f"Created image file: {image_path}")
            
        print(f"Successfully converted {len(image_paths)} images")
        return image_paths
        
    except Exception as e:
        print(f"Error in _convert_base64_to_images: {str(e)}")
        raise e


def _cleanup_temp_images():
    """Clean up old temporary image directories"""
    temp_base = tempfile.gettempdir()
    for item in os.listdir(temp_base):
        if item.startswith("recall_me_images_"):
            item_path = os.path.join(temp_base, item)
            if os.path.isdir(item_path):
                try:
                    shutil.rmtree(item_path)
                except Exception:
                    pass  # Ignore cleanup errors


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
    
    # Clean up old temp images first
    _cleanup_temp_images()
    
    res = search_unified_lc(query, k)
    
    # Debug: log the exact response structure
    print(f"Search response keys: {list(res.keys())}")
    print(f"Number of hits: {len(res.get('hits', []))}")
    print(f"Images object type: {type(res.get('images'))}")
    print(f"Images object keys: {list(res.get('images', {}).keys()) if res.get('images') else 'None'}")
    
    # Convert base64 images to actual files
    if res.get("images"):
        try:
            print(f"Converting {len(res['images'])} images to files...")
            image_paths = _convert_base64_to_images(res["images"])
            res["image_paths"] = image_paths
            print(f"Created {len(image_paths)} image files in static/images/")
        except Exception as e:
            print(f"Error converting images: {str(e)}")
            return jsonify({"error": f"Failed to convert images: {str(e)}"}), 500
    else:
        print("No images found in response")
    
    payload = {"event": "search_lc", "query": query, "k": k, **res}
    webhook_result = _post_to_webhook(payload)
    return jsonify({**res, "webhook": webhook_result})


@app.route("/search_lc_page", methods=["GET"])
def search_langchain_page() -> Any:
    query = request.args.get("query", "").strip()
    k = int(request.args.get("k", "5"))
    if not query:
        return jsonify({"error": "Missing query"}), 400
    
    # Clean up old temp images first
    _cleanup_temp_images()
    
    res = search_unified_lc(query, k)
    
    # Convert base64 images to actual files
    if res.get("images"):
        try:
            image_paths = _convert_base64_to_images(res["images"])
            res["image_paths"] = image_paths
        except Exception as e:
            return jsonify({"error": f"Failed to convert images: {str(e)}"}), 500
    
    payload = {"event": "search_lc_page", "query": query, "k": k, **res}
    webhook_result = _post_to_webhook(payload)
    return jsonify({**res, "webhook": webhook_result})


# Images are now served from static/images/ via Flask's static file serving


@app.route("/cleanup_images", methods=["POST"])
def cleanup_images():
    """Clean up static images"""
    images_dir = os.path.join("static", "images")
    if os.path.exists(images_dir):
        for filename in os.listdir(images_dir):
            if filename.endswith('.png'):
                os.remove(os.path.join(images_dir, filename))
    return jsonify({"status": "cleaned"})


if __name__ == "__main__":
    # Load environment variables from .env at startup
    load_dotenv()
    ensure_dirs()
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=True)


