#!/usr/bin/env python3
"""
Simplified Flask backend for AI webhook communication only.
No RAG functionality - only handles AI agent responses.
"""

import os
import time
import uuid
from typing import Any, Dict, Optional

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request, send_from_directory

# Load environment variables
load_dotenv()

app = Flask(__name__)

# In-memory storage for AI responses (in production, use Redis or database)
ai_responses: Dict[str, Any] = {}


def _get_webhook_url() -> Optional[str]:
    """Get webhook URL from environment variable"""
    return os.getenv("WEBHOOK_URL")


def _post_to_webhook(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Send payload to webhook URL"""
    webhook_url = _get_webhook_url()
    if not webhook_url:
        print("WARNING: No WEBHOOK_URL environment variable set")
        return {"error": "No webhook URL configured"}
    
    try:
        print(f"DEBUG: Sending to webhook: {webhook_url}")
        print(f"DEBUG: Payload: {payload}")
        
        response = requests.post(webhook_url, json=payload, timeout=30)
        
        print(f"DEBUG: Response status code: {response.status_code}")
        print(f"DEBUG: Response headers: {dict(response.headers)}")
        print(f"DEBUG: Response text: {response.text}")
        
        if response.status_code == 200:
            try:
                return {"response": response.json()}
            except ValueError:
                return {"response": response.text}
        else:
            return {"error": f"Webhook returned status {response.status_code}"}
            
    except requests.exceptions.RequestException as e:
        print(f"ERROR: Webhook request failed: {str(e)}")
        return {"error": str(e)}


def _poll_for_ai_response(request_id: str, max_attempts: int = 30, delay: int = 2) -> Optional[Any]:
    """Poll for AI response using exponential backoff"""
    for attempt in range(max_attempts):
        if request_id in ai_responses:
            response = ai_responses.pop(request_id)  # Remove after retrieval
            print(f"DEBUG: Found AI response for request_id: {request_id}")
            return response
        
        print(f"DEBUG: Polling attempt {attempt + 1}/{max_attempts} for request_id: {request_id}")
        time.sleep(delay)
    
    print(f"DEBUG: Timeout waiting for AI response for request_id: {request_id}")
    return None


# Routes
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/library")
def library():
    return render_template("library.html")


@app.route("/ai_search", methods=["GET"])
def ai_search() -> Any:
    """AI-only search endpoint - no RAG processing"""
    query = request.args.get("query", "").strip()
    
    if not query:
        return jsonify({"error": "Missing query"}), 400
    
    print(f"DEBUG: AI search request - query: {query}")
    
    # Create payload for webhook
    payload = {"event": "ai_search", "query": query}
    webhook_result = _post_to_webhook(payload)
    
    # Check if webhook result contains AI response
    ai_response = None
    if webhook_result.get("response"):
        ai_response = webhook_result["response"]
        print(f"DEBUG: AI response found in webhook result: {ai_response}")
    
    # Return only AI response and webhook info
    result = {"webhook": webhook_result}
    if ai_response:
        result["ai_response"] = ai_response
        print(f"DEBUG: Added AI response to result")
    
    return jsonify(result)


@app.route("/ai_chat", methods=["POST"])
def ai_chat_with_rag() -> Any:
    """Handle AI chat requests from extension"""
    print("DEBUG: /ai_chat route called")
    try:
        data = request.get_json()
        query = data.get("query", "").strip()
        rag_context = data.get("rag_context", {})
        
        if not query:
            return jsonify({"error": "Missing query"}), 400
        
        webhook_url = _get_webhook_url()
        if not webhook_url:
            return jsonify({"error": "No webhook URL configured"}), 500
        
        # Generate unique request ID for tracking
        request_id = str(uuid.uuid4())
        
        # Prepare payload for AI agent
        payload = {
            "event": "chat_message",
            "message": query,
            "timestamp": data.get("timestamp", time.time()),
            "session_id": data.get("session_id", f"extension_{int(time.time())}_{request_id[:8]}"),
            "request_id": request_id,
            "rag_context": rag_context
        }
        
        print(f"DEBUG: Sending to AI agent: {payload}")
        
        # Send to webhook
        webhook_result = _post_to_webhook(payload)
        response_data = webhook_result.get("response", {})
        
        # Check if this is a workflow start response
        if response_data.get("message") == "Workflow was started":
            print("DEBUG: Workflow started, polling for response...")
            ai_response = _poll_for_ai_response(request_id, max_attempts=30, delay=2)
            
            if ai_response:
                return jsonify({
                    "status": "success",
                    "ai_response": ai_response,
                    "query": query,
                    "timestamp": data.get("timestamp")
                })
            else:
                return jsonify({
                    "status": "timeout",
                    "message": "AI agent is taking longer than expected to respond. Please try again.",
                    "webhook_response": webhook_result
                })
        else:
            # Direct response
            return jsonify({
                "status": "success",
                "ai_response": response_data,
                "query": query,
                "timestamp": data.get("timestamp")
            })
        
    except Exception as e:
        print(f"ERROR: Exception in ai_chat_with_rag: {str(e)}")
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
def health():
    return jsonify({"status": "ok"})


@app.route("/static/<path:filename>")
def static_files(filename: str):
    return send_from_directory("static", filename)


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
