import os
import json
import base64
import tempfile
import shutil
import time
import uuid
from typing import Any, Dict
import requests
from dotenv import load_dotenv

from flask import Flask, jsonify, render_template, request, send_from_directory

from services.langchain_pipeline import build_unified_index, search_unified_lc


app = Flask(__name__)

# In-memory storage for AI responses (in production, use Redis or database)
ai_responses = {}

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
    print(f"DEBUG: _post_to_webhook called with URL: {url}")
    print(f"DEBUG: Payload: {payload}")
    
    if not url:
        print("ERROR: WEBHOOK_URL not set in environment variables")
        return {"posted": False, "reason": "WEBHOOK_URL not set"}
    
    try:
        print(f"DEBUG: Sending POST request to: {url}")
        print(f"DEBUG: Request payload: {json.dumps(payload, indent=2)}")
        
        resp = requests.post(url, json=payload, timeout=30)
        result = {"posted": True, "status_code": resp.status_code}
        
        print(f"DEBUG: Response status code: {resp.status_code}")
        print(f"DEBUG: Response headers: {dict(resp.headers)}")
        print(f"DEBUG: Response text: {resp.text}")
        
        # For chat messages, try to get the response content
        if payload.get("event") == "chat_message" and resp.status_code == 200:
            try:
                response_data = resp.json()
                result["response"] = response_data
                print(f"DEBUG: Parsed JSON response: {response_data}")
            except Exception as json_error:
                print(f"DEBUG: JSON parsing failed: {json_error}")
                # If JSON parsing fails, try to extract text response
                response_text = resp.text.strip()
                if response_text:
                    result["response"] = {"message": response_text}
                    print(f"DEBUG: Using text response: {response_text}")
                else:
                    result["response"] = {"message": "Response received but no content"}
                    print("DEBUG: Webhook returned empty response")
        else:
            print(f"DEBUG: Not a chat message or non-200 status: event={payload.get('event')}, status={resp.status_code}")
        
        return result
    except requests.exceptions.Timeout as e:
        print(f"ERROR: Webhook request timed out: {str(e)}")
        return {"posted": False, "error": f"Request timeout: {str(e)}"}
    except requests.exceptions.ConnectionError as e:
        print(f"ERROR: Webhook connection failed: {str(e)}")
        return {"posted": False, "error": f"Connection error: {str(e)}"}
    except requests.exceptions.RequestException as e:
        print(f"ERROR: Webhook request failed: {str(e)}")
        return {"posted": False, "error": f"Request error: {str(e)}"}
    except Exception as e:
        print(f"ERROR: Unexpected error in webhook request: {str(e)}")
        return {"posted": False, "error": str(e)}


def _poll_for_ai_response(request_id: str, max_attempts: int = 30, delay: int = 2) -> Dict[str, Any] | None:
    """Poll for AI response using the request_id"""
    print(f"DEBUG: Polling for AI response with request_id: {request_id}")
    
    for attempt in range(max_attempts):
        print(f"DEBUG: Polling attempt {attempt + 1}/{max_attempts}")
        
        if request_id in ai_responses:
            response = ai_responses.pop(request_id)  # Remove from storage after retrieval
            print(f"DEBUG: Found AI response: {response}")
            return response
        
        time.sleep(delay)
    
    print(f"DEBUG: Polling timeout after {max_attempts} attempts")
    return None


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


@app.route("/library")
def library() -> str:
    return render_template("library.html")


@app.route("/chat", methods=["POST"])
def chat_with_agent() -> Any:
    """Handle AI agent chat messages via webhook with polling for response"""
    print("DEBUG: /chat route called")
    try:
        data = request.get_json()
        print(f"DEBUG: Received data: {data}")
        
        if not data or "message" not in data:
            print("ERROR: Missing message in request data")
            return jsonify({"error": "Missing message"}), 400
        
        message = data["message"].strip()
        if not message:
            print("ERROR: Empty message")
            return jsonify({"error": "Empty message"}), 400
        
        print(f"DEBUG: Processing message: '{message}'")
        
        # Check if webhook URL is configured
        webhook_url = _get_webhook_url()
        print(f"DEBUG: Webhook URL from environment: {webhook_url}")
        
        if not webhook_url:
            print("ERROR: WEBHOOK_URL not configured")
            return jsonify({
                "error": "AI agent webhook not configured. Please set WEBHOOK_URL environment variable."
            }), 500
        
        # Generate a unique request ID for tracking
        request_id = str(uuid.uuid4())
        
        # Prepare payload for webhook
        payload = {
            "event": "chat_message",
            "message": message,
            "timestamp": data.get("timestamp"),
            "session_id": data.get("session_id"),
            "request_id": request_id
        }
        
        print(f"DEBUG: Prepared payload: {payload}")
        
        # Send to webhook and get response
        print("DEBUG: Calling _post_to_webhook...")
        webhook_result = _post_to_webhook(payload)
        
        print(f"DEBUG: Webhook result: {webhook_result}")
        
        if not webhook_result.get("posted"):
            print("ERROR: Webhook post failed")
            return jsonify({
                "error": "Failed to send message to AI agent",
                "details": webhook_result
            }), 500
        
        # Check if we got an immediate response or just workflow start confirmation
        response_data = webhook_result.get("response", {})
        
        if response_data.get("message") == "Workflow was started":
            # Workflow started but no AI response yet - implement polling
            print("DEBUG: Workflow started, implementing polling for AI response...")
            ai_response = _poll_for_ai_response(request_id, max_attempts=30, delay=2)
            
            if ai_response:
                return jsonify({
                    "status": "success",
                    "webhook_response": {
                        "posted": True,
                        "status_code": 200,
                        "response": ai_response
                    },
                    "message_sent": message,
                    "timestamp": data.get("timestamp")
                })
            else:
                return jsonify({
                    "status": "timeout",
                    "message": "AI agent is taking longer than expected to respond. Please try again.",
                    "webhook_response": webhook_result
                })
        else:
            # Got immediate response from AI agent
            return jsonify({
                "status": "success",
                "webhook_response": webhook_result,
                "message_sent": message,
                "timestamp": data.get("timestamp")
            })
        
    except Exception as e:
        print(f"ERROR: Exception in chat_with_agent: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/webhook_response", methods=["POST"])
def webhook_response() -> Any:
    """Handle responses from n8n webhook (respond to webhook node)"""
    try:
        data = request.get_json()
        print(f"DEBUG: Received webhook response: {data}")
        
        # Extract request_id from the response
        request_id = data.get("request_id")
        if request_id:
            # Store the AI response for polling
            ai_responses[request_id] = data
            print(f"DEBUG: Stored AI response for request_id: {request_id}")
            return jsonify({"status": "received", "message": "Response stored for polling"})
        else:
            print("WARNING: No request_id in webhook response")
            return jsonify({"status": "received", "message": "Response processed but no request_id"})
        
    except Exception as e:
        print(f"ERROR: Error processing webhook response: {str(e)}")
        return jsonify({"error": str(e)}), 500


@app.route("/get_webhook_url")
def get_webhook_url() -> Any:
    """Get the webhook URL for the frontend"""
    webhook_url = _get_webhook_url()
    return jsonify({"webhook_url": webhook_url})


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


@app.route("/generate_preview", methods=["POST"])
def generate_document_preview():
    """Generate a preview thumbnail for a PDF document"""
    try:
        if "file" not in request.files:
            return jsonify({"error": "No file provided"}), 400
        
        file = request.files["file"]
        if file.filename == "":
            return jsonify({"error": "No file selected"}), 400
        
        # Save the file temporarily
        temp_path = os.path.join("static", "uploads", f"temp_{file.filename}")
        file.save(temp_path)
        
        # Generate preview using PyMuPDF
        import fitz
        doc = fitz.open(temp_path)
        
        # Get the first page
        page = doc[0]
        
        # Render page to image
        mat = fitz.Matrix(2.0, 2.0)  # 2x zoom for better quality
        pix = page.get_pixmap(matrix=mat)
        
        # Convert to PIL Image
        from PIL import Image
        import io
        img_data = pix.tobytes("png")
        img = Image.open(io.BytesIO(img_data))
        
        # Resize to thumbnail size
        img.thumbnail((300, 400), Image.Resampling.LANCZOS)
        
        # Save thumbnail
        preview_filename = f"preview_{os.path.splitext(file.filename)[0]}.png"
        preview_path = os.path.join("static", "images", preview_filename)
        os.makedirs(os.path.dirname(preview_path), exist_ok=True)
        img.save(preview_path)
        
        # Clean up
        doc.close()
        os.remove(temp_path)
        
        return jsonify({
            "status": "success",
            "preview_url": f"/static/images/{preview_filename}",
            "filename": file.filename
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/get_document_info", methods=["GET"])
def get_document_info():
    """Get information about indexed documents"""
    try:
        data_dir = os.path.join("data", "index", "langchain")
        image_data_json = os.path.join(data_dir, "image_data.json")
        
        if not os.path.exists(image_data_json):
            return jsonify({"documents": []})
        
        with open(image_data_json, "r", encoding="utf-8") as f:
            image_data = json.load(f)
        
        # Extract document information from image data
        documents = {}
        for image_id, _ in image_data.items():
            if image_id.startswith("page_"):
                parts = image_id.split("_")
                if len(parts) >= 3:
                    page_num = int(parts[1])
                    if page_num not in documents:
                        documents[page_num] = {
                            "page": page_num,
                            "image_count": 0,
                            "images": []
                        }
                    documents[page_num]["image_count"] += 1
                    documents[page_num]["images"].append(image_id)
        
        # Convert to list and sort by page number
        document_list = list(documents.values())
        document_list.sort(key=lambda x: x["page"])
        
        return jsonify({"documents": document_list})
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    # Load environment variables from .env at startup
    load_dotenv()
    ensure_dirs()
    
    # Print webhook URL status for debugging
    webhook_url = _get_webhook_url()
    if webhook_url:
        print(f"Webhook URL configured: {webhook_url}")
    else:
        print("Warning: WEBHOOK_URL not set in environment variables")
    
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=True)


