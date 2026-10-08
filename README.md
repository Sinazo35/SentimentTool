# PulseScope — VADER + Hugging Face Sentiment Dashboard

## Quick start (Windows, VS Code)
1. Install Python 3.10–3.12 and VS Code.
2. Open this folder in VS Code.
3. Open Terminal > New Terminal.
4. Run `py -m pip install -r requirements.txt` (large downloads expected for PyTorch / model).
5. Run `py app.py`.
6. Open http://127.0.0.1:5000.

Or double-click `start_windows.bat`.

## Features
- YouTube URLs (watch, shorts, live, youtu.be): automatically retrieves available English subtitles; some videos have no accessible captions or YouTube may block retrieval.
- Transcript paste: copy speech from Instagram, TikTok, Facebook, podcasts, or other sources. These platforms are **not directly integrated**.
- VADER scores: positive, negative, neutral proportions and compound polarity (-1 to +1).
- Hugging Face: `cardiffnlp/twitter-roberta-base-sentiment-latest` predicts positive/neutral/negative; model downloads on first run and requires internet initially.
- Select VADER-only for quicker analysis without model downloads.
- Dashboard: four KPI tiles, doughnut chart, sentiment timeline, segment table, insights report, CSV export.

## Interpretation
Compound is **not** a fourth sentiment class. VADER compound thresholds use >= 0.05 positive, <= -0.05 negative, otherwise neutral. Hugging Face classifications may disagree with VADER; in combined mode the dashboard class counts follow Hugging Face labels, while the compound line is always VADER.

## Limitations
English text only; analyzes subtitles or pasted text, not raw audio tone. Video caption availability varies. Chart.js loads from CDN. Large transcripts limited to 400 grouped segments to protect local performance. The Hugging Face model can be slow on CPUs. No API keys needed for the caption retrieval path, but it may fail on restricted videos.

## Folder layout
- `app.py`: Flask API, caption retrieval, VADER/HF sentiment analysis
- `templates/index.html`: dashboard layout
- `static/style.css`: responsive UI
- `static/app.js`: charts, requests, CSV export
- `requirements.txt`: Python dependencies
- `start_windows.bat`: Windows launcher
- `render.yaml`: Render deployment configuration

## Suggested presentation
Explain how captions become speech segments, VADER calculates compound and category ratios, Hugging Face independently predicts the sentiment class, and Chart.js visualizes counts and trends. Show a transcript demo if YouTube blocks a URL.

## Render deployment
1. Push this repository to GitHub.
2. In Render, select **New → Blueprint** and import this repository.
3. Select the `pulse-scope` service defined in `render.yaml`.
4. Deploy. Render runs Flask with Gunicorn and serves the dashboard and API.

> The filesystem is ephemeral. Analysis history is therefore not durable between deployments, and the Hugging Face model may need to download on the first cold start.


## Dashboard update
The Dashboard now displays all-time sentiment distribution, total analyzed results by sentiment, a compound trend chart, total analyzed sources, and total analyzed results. Data is calculated from locally saved history (up to the last 50 analyses retained by the backend). Charts begin empty and update automatically after analysis. The Results section retains charts for the selected analysis. Chart.js is loaded from a CDN, so the browser needs internet access for charts.
