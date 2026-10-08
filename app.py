import csv
import io
import json
import os
import re
from collections import Counter
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from flask import Flask, jsonify, render_template, request
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
from youtube_transcript_api import YouTubeTranscriptApi

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 2 * 1024 * 1024
vader = SentimentIntensityAnalyzer()
MODEL = "cardiffnlp/twitter-roberta-base-sentiment-latest"
classifier = None
HISTORY_FILE = Path(os.environ.get("PULSE_SCOPE_HISTORY", "data/history.json"))


def get_classifier():
    global classifier
    if classifier is None:
        try:
            from huggingface_hub import InferenceClient
            classifier = InferenceClient(model=MODEL, timeout=60)
        except Exception as exc:
            raise RuntimeError("Hugging Face inference could not be initialized.") from exc
    return classifier


def split_sentences(text):
    return [
        sentence.strip()
        for sentence in re.split(r"(?<=[.!?])\s+|\n+", text)
        if sentence.strip()
    ]


def classify_huggingface_texts(texts):
    client = get_classifier()
    if not texts:
        return []
    try:
        predictions = client.text_classification(texts, parameters={"top_k": 1})
    except Exception as exc:
        raise RuntimeError("Hugging Face inference failed. The model may be unavailable or rate limited.") from exc
    if not isinstance(predictions, list):
        raise RuntimeError("Hugging Face returned an unexpected response.")
    return [
        {"label": item[0]["label"].lower(), "confidence": round(float(item[0]["score"]), 4)}
        if isinstance(item, list) and item
        else {"label": "neutral", "confidence": 0.0}
        for item in predictions
    ]


def created_at():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


def classify_compound(score):
    if score >= 0.05:
        return "positive"
    if score <= -0.05:
        return "negative"
    return "neutral"


def video_id(url):
    parsed = urlparse(url.strip())
    host = (parsed.hostname or "").lower()
    if host in {"youtu.be", "www.youtu.be"}:
        value = parsed.path.strip("/").split("/", 1)[0]
    elif host in {"youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"}:
        if parsed.path == "/watch":
            value = parse_qs(parsed.query).get("v", [""])[0]
        elif parsed.path.startswith(("/shorts/", "/live/", "/embed/")):
            value = parsed.path.split("/")[2]
        else:
            value = ""
    else:
        value = ""
    if not re.fullmatch(r"[\w-]{11}", value):
        raise ValueError("Enter a valid YouTube video link.")
    return value


def chunks_from_text(text):
    text = text.strip()
    if not text:
        raise ValueError("Please provide some text to analyze.")
    chunks = []
    for part in re.split(r"(?<=[.!?])\s+|\n+", text):
        part = part.strip()
        if part:
            chunks.append({"text": part, "start": None})
    return chunks


def chunks_from_youtube(url):
    try:
        raw = YouTubeTranscriptApi().fetch(video_id(url), languages=["en"]).to_raw_data()
    except Exception as exc:
        raise ValueError(f"Could not retrieve the YouTube transcript: {exc}") from exc
    if not raw:
        raise ValueError("No English transcript was returned for this video.")

    transcript = " ".join(
        re.sub(r"\[[^]]+\]", "", item["text"]).strip()
        for item in raw
        if re.sub(r"\[[^]]+\]", "", item["text"]).strip()
    )
    if not transcript.strip():
        raise ValueError("No usable transcript text was found.")
    return [{"text": transcript, "start": None, "video_id": video_id(url)}]


def demo_chunks():
    return chunks_from_text(
        "I absolutely love the way this product makes everyday work feel effortless. "
        "The thoughtful design and fast support are a real joy. The launch experience was "
        "slightly confusing, but the team quickly fixed it. I am disappointed that the "
        "mobile app still has small performance issues. Overall, the service is reliable and "
        "the new features are attractive. I wish the pricing were clearer and the onboarding "
        "felt a little more personal."
    )


def analyze(parts, engine):
    original_total = len(parts)
    is_whole_video = len(parts) == 1 and parts[0].get("video_id")
    model = None
    hf_error = None
    if engine in {"huggingface", "both"}:
        try:
            model = get_classifier()
        except RuntimeError as exc:
            hf_error = str(exc)
            if engine == "huggingface":
                raise

    results = []
    sentence_groups = []
    for part in parts:
        sentence_groups.extend(split_sentences(part["text"]))

    sentence_predictions = []
    if model and sentence_groups:
        try:
            sentence_predictions = classify_huggingface_texts(sentence_groups[:300])
        except RuntimeError as exc:
            hf_error = str(exc)
            if engine == "huggingface":
                raise

    prediction_by_sentence = {
        sentence: prediction
        for sentence, prediction in zip(sentence_groups[:300], sentence_predictions)
    }
    for index, part in enumerate(parts, 1):
        score = vader.polarity_scores(part["text"])
        vader_label = classify_compound(score["compound"])
        hf = None
        if model and prediction_by_sentence:
            sentences = split_sentences(part["text"])
            if sentences:
                hf = prediction_by_sentence.get(sentences[0], {"label": "neutral", "confidence": 0.0})
                hf = dict(hf)
                hf["count"] = len(sentences)
        results.append(
            {
                "index": index,
                "text": part["text"],
                "start": part["start"],
                "label": vader_label,
                "vader_label": vader_label,
                "compound": round(score["compound"], 4),
                "positive": round(score["pos"], 4),
                "negative": round(score["neg"], 4),
                "neutral": round(score["neu"], 4),
                "huggingface": hf,
            }
        )

    drivers = []
    for index, (sentence, prediction) in enumerate(prediction_by_sentence.items(), 1):
        if prediction["label"] in {"positive", "negative"}:
            drivers.append(
                {
                    "part_index": index,
                    "text": sentence,
                    "label": prediction["label"],
                    "confidence": prediction["confidence"],
                    "vader_compound": round(vader.polarity_scores(sentence)["compound"], 4),
                }
            )

    drivers.sort(key=lambda item: item["confidence"], reverse=True)
    drivers = drivers[:8]
    counts = Counter(result["label"] for result in results)
    average = round(sum(result["compound"] for result in results) / len(results), 4)
    overall = classify_compound(average)
    return {
        "generated_at": created_at(),
        "segments": results,
        "summary": {
            "total": len(results),
            "counts": {label: counts.get(label, 0) for label in ("positive", "negative", "neutral")},
            "average_compound": average,
            "overall_vader": overall,
            "engine": engine,
            "original_total": original_total,
            "truncated": False,
            "whole_video": is_whole_video,
            "note": "VADER compound is a normalized polarity score from -1 to +1. Hugging Face labels are model predictions. YouTube analysis uses the complete transcript as one video-level result.",
            "hf_error": hf_error,
        },
        "drivers": drivers,
    }


@app.get("/")
def home():
    return render_template("index.html")


@app.post("/api/analyze")
def api_analyze():
    try:
        payload = request.get_json(silent=True) or {}
        engine = payload.get("engine", "both")
        if engine not in {"vader", "huggingface", "both"}:
            raise ValueError("Invalid analysis engine.")
        source = payload.get("source", "text")
        if source == "youtube":
            parts = chunks_from_youtube(payload.get("url", ""))
        elif source == "text":
            parts = chunks_from_text(payload.get("text", ""))
        elif source == "demo":
            parts = demo_chunks()
        else:
            raise ValueError("Select a valid source.")
        result = analyze(parts, engine)
        result["source"] = source
        if source == "youtube":
            video_id_value = parts[0]["video_id"]
            result["video_id"] = video_id_value
            result["title"] = f"YouTube video {video_id_value}"
            save_history(
                {
                    "id": f"{video_id_value}-{result['generated_at']}",
                    "video_id": video_id_value,
                    "title": result["title"],
                    "source": source,
                    "engine": engine,
                    "generated_at": result["generated_at"],
                    "summary": result["summary"],
                    "segments": result["segments"],
                    "drivers": result["drivers"],
                }
            )
        else:
            save_history(
                {
                    "id": f"text-{result['generated_at']}",
                    "video_id": None,
                    "title": "Pasted transcript",
                    "source": source,
                    "engine": engine,
                    "generated_at": result["generated_at"],
                    "summary": result["summary"],
                    "segments": result["segments"],
                    "drivers": result["drivers"],
                }
            )
        return jsonify(result)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 503
    except Exception:
        app.logger.exception("Analysis failed")
        return jsonify({"error": "The analysis could not be completed. Please try again."}), 500


@app.get("/health")
def health():
    return jsonify({"status": "ok", "service": "PulseScope", "timestamp": created_at()})


def load_history():
    try:
        if not HISTORY_FILE.exists():
            return []
        records = json.loads(HISTORY_FILE.read_text(encoding="utf-8"))
        return records if isinstance(records, list) else []
    except (OSError, ValueError, TypeError):
        app.logger.exception("Could not load analysis history")
        return []


def save_history(record):
    history = load_history()
    history.insert(0, record)
    HISTORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    HISTORY_FILE.write_text(json.dumps(history[:50], indent=2), encoding="utf-8")


@app.get("/api/status")
def status():
    return jsonify(
        {
            "status": "ok",
            "model": MODEL,
            "vader": "available",
            "classifier": "loaded" if classifier is not None else "not-loaded",
            "timestamp": created_at(),
        }
    )


@app.get("/api/history")
def history():
    return jsonify({"history": load_history()})


@app.delete("/api/history")
def clear_history():
    HISTORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    HISTORY_FILE.write_text("[]\n", encoding="utf-8")
    return jsonify({"status": "ok", "cleared": True})


@app.get("/api/demo")
def demo():
    return jsonify(analyze(demo_chunks(), "vader") | {"source": "demo"})


if __name__ == "__main__":
    app.run(debug=False, host="0.0.0.0", port=5000)
