const $ = (id) => document.getElementById(id);
let source = "youtube";
let result = null;
let history = [];
let pieChart = null;
let timelineChart = null;
let activeToast;

const sentimentColors = {
  positive: "#37c99a",
  negative: "#ff6f88",
  neutral: "#8d98b8",
};

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[char]);
}

function showToast(message, type = "success") {
  const toast = $("toast");
  toast.textContent = message;
  toast.dataset.type = type;
  toast.classList.add("show");
  clearTimeout(activeToast);
  activeToast = setTimeout(() => toast.classList.remove("show"), 3200);
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("pulsescope-theme", theme);
  const toggle = $("themeToggle");
  $("themeIcon").textContent = theme === "dark" ? "☾" : "☀";
  toggle.setAttribute("aria-label", `Switch to ${theme === "dark" ? "light" : "dark"} mode`);
}

function initializeTheme() {
  const saved = localStorage.getItem("pulsescope-theme");
  const preferred = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  setTheme(saved || preferred);
  $("themeToggle").addEventListener("click", () => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  });
}

function setSource(nextSource) {
  source = nextSource;
  document.querySelectorAll(".source-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.source === source));
  $("youtubeField").classList.toggle("hidden", source !== "youtube");
  $("textField").classList.toggle("hidden", source !== "text");
  $("url").required = source === "youtube";
  $("text").required = source === "text";
  if (source === "demo") {
    $("engine").value = "vader";
    $("url").value = "";
    $("text").value = "";
    $("status").innerHTML = '<span class="message-icon">i</span><span>Demo mode uses a built-in sample transcript with VADER.</span>';
  }
}

function updateCharacterCount() {
  $("charCount").textContent = $("text").value.length.toLocaleString();
}

function setLoading(isLoading) {
  const button = $("analyzeBtn");
  button.disabled = isLoading;
  button.classList.toggle("loading", isLoading);
  button.querySelector("span").textContent = isLoading ? "Analyzing…" : "✦ Analyze sentiment";
  button.querySelector("b").textContent = isLoading ? "…" : "→";
  $("status").classList.toggle("loading", isLoading);
}

function formatPercent(value, total) {
  return total ? `${Math.round((value / total) * 100)}% of total` : "0% of total";
}

function renderCharts() {
  const summary = result.summary;
  const counts = summary.counts;
  const total = summary.total;
  const labels = ["Positive", "Negative", "Neutral"];
  const values = [counts.positive, counts.negative, counts.neutral];
  if (pieChart) pieChart.destroy();
  if (timelineChart) timelineChart.destroy();

  pieChart = new Chart($("distribution"), {
    type: "doughnut",
    data: { labels, datasets: [{ data: values, backgroundColor: [sentimentColors.positive, sentimentColors.negative, sentimentColors.neutral], borderWidth: 0, hoverOffset: 8, spacing: 2 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: "74%", plugins: { legend: { position: "bottom", labels: { usePointStyle: true, pointStyle: "circle", boxWidth: 8, padding: 18 } }, tooltip: { callbacks: { label(context) { return `${context.label}: ${context.raw} (${total ? Math.round(context.raw / total * 100) : 0}%)`; } } } } },
  });

  const timelineData = result.segments.map((segment) => ({ label: `#${segment.index}`, value: segment.compound }));
  timelineChart = new Chart($("timeline"), {
    type: "line",
    data: { labels: timelineData.map((item) => item.label), datasets: [{ label: "Compound", data: timelineData.map((item) => item.value), borderColor: "#8778ff", backgroundColor: "rgba(135,120,255,.18)", fill: true, tension: 0.25, pointRadius: 3, pointHoverRadius: 6 }] },
    options: { responsive: true, maintainAspectRatio: false, interaction: { intersect: false, mode: "index" }, scales: { y: { min: -1, max: 1, ticks: { stepSize: 0.25 } }, x: { display: false } }, plugins: { legend: { display: false }, tooltip: { callbacks: { label(context) { return `Video: ${context.raw.toFixed(3)}`; } } } } },
  });
}

function renderDrivers() {
  const drivers = result.drivers || [];
  $("driversSection").classList.toggle("hidden", drivers.length === 0);
  $("driversGrid").innerHTML = drivers.map((driver) => `<article class="driver-card ${driver.label}"><div class="driver-top"><span>${driver.label.toUpperCase()}</span><strong>${Math.round(driver.confidence * 100)}%</strong></div><p>${escapeHTML(driver.text)}</p><small>VADER compound ${driver.vader_compound.toFixed(3)} · Statement ${driver.part_index}</small></article>`).join("");
}

function renderResults() {
  const summary = result.summary;
  const counts = summary.counts;
  const total = summary.total;
  $("total").textContent = total.toLocaleString();
  $("positive").textContent = counts.positive.toLocaleString();
  $("negative").textContent = counts.negative.toLocaleString();
  $("neutral").textContent = counts.neutral.toLocaleString();
  $("positivePct").textContent = formatPercent(counts.positive, total);
  $("negativePct").textContent = formatPercent(counts.negative, total);
  $("neutralPct").textContent = formatPercent(counts.neutral, total);
  $("sourceLabel").textContent = result.source === "demo" ? "Built-in demo analysis" : `${result.source === "youtube" ? "YouTube" : "Transcript"} analysis`;
  $("report").innerHTML = `<strong>Overall VADER tone: ${summary.overall_vader.toUpperCase()}</strong><p>Average compound: <b>${summary.average_compound.toFixed(3)}</b> across ${total} video-level segment${total === 1 ? "" : "s"} using ${summary.engine}. ${counts.positive} positive, ${counts.negative} negative and ${counts.neutral} neutral.</p><p>${escapeHTML(summary.note)}</p>`;
  const segment = result.segments[0];
  $("rows").innerHTML = `<tr data-search="${escapeHTML(segment.text)}"><td><span class="segment-number">1</span>${segment.start !== null ? `<small>${Math.floor(segment.start / 60)}:${String(Math.floor(segment.start % 60)).padStart(2, "0")}</small>` : ""}</td><td><p>${escapeHTML(segment.text)}</p></td><td><span class="sentiment ${segment.label}">${segment.label}</span></td><td><span class="score ${segment.compound >= 0.05 ? "positive" : segment.compound <= -0.05 ? "negative" : "neutral"}">${segment.compound.toFixed(3)}</span></td><td>${segment.huggingface ? `${Math.round(segment.huggingface.confidence * 100)}%` : "—"}</td></tr>`;
  if (result.video_id) {
    $("videoPanel").classList.remove("hidden");
    $("videoTitle").textContent = result.title;
    $("videoPlayer").src = `https://www.youtube.com/embed/${result.video_id}?rel=0`;
  } else {
    $("videoPanel").classList.add("hidden");
    $("videoPlayer").src = "";
  }
  $("results").classList.remove("hidden");
  renderDrivers();
  $("results").scrollIntoView({ behavior: "smooth", block: "start" });
  renderCharts();
}

async function runAnalysis() {
  const button = $("analyzeBtn");
  const payload = { source, engine: $("engine").value };
  if (source === "youtube") payload.url = $("url").value.trim();
  if (source === "text") payload.text = $("text").value.trim();
  setLoading(true);
  $("status").innerHTML = '<span class="message-icon">↻</span><span>Processing speech segments…</span>';
  try {
    const response = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Analysis failed.");
    result = data;
    renderResults();
    $("status").innerHTML = '<span class="message-icon success">✓</span><span>Analysis complete. Your dashboard has been updated.</span>';
    await loadHistory();
    showToast("Sentiment analysis completed.");
  } catch (error) {
    $("status").innerHTML = `<span class="message-icon error">!</span><span>${escapeHTML(error.message)}</span>`;
    showToast(error.message, "error");
  } finally {
    setLoading(false);
  }
}

function exportCSV() {
  if (!result) {
    showToast("Run an analysis first.", "error");
    return;
  }
  const columns = ["index", "start", "text", "label", "vader_label", "compound", "positive", "negative", "neutral", "hf_label", "hf_confidence"];
  const csvRows = [columns, ...result.segments.map((segment) => [segment.index, segment.start ?? "", segment.text, segment.label, segment.vader_label, segment.compound, segment.positive, segment.negative, segment.neutral, segment.huggingface?.label || "", segment.huggingface?.confidence || ""])] ;
  const csv = csvRows.map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\r\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = `pulsescope-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast("CSV report exported.");
}

async function copyReport() {
  if (!result) {
    showToast("Run an analysis first.", "error");
    return;
  }
  const report = `${result.summary.overall_vader.toUpperCase()} sentiment analysis\n${result.summary.total} segments · Average compound ${result.summary.average_compound.toFixed(3)}\n\n${result.segments.map((segment) => `${segment.index}. ${segment.label.toUpperCase()} — ${segment.text}`).join("\n")}`;
  try {
    await navigator.clipboard.writeText(report);
    showToast("Analysis report copied.");
  } catch {
    showToast("Clipboard access was blocked.", "error");
  }
}

async function refreshStatus() {
  try {
    const response = await fetch("/api/status");
    const status = await response.json();
    $("modelStatus").textContent = status.classifier === "loaded" ? "Model loaded and ready" : "Model is downloaded on demand";
    $("modelLabel").textContent = status.classifier === "loaded" ? "READY" : "LAZY";
    showToast("System status refreshed.");
  } catch {
    showToast("Could not reach the local server.", "error");
  }
}


let dashboardCharts = [];
function renderDashboard() {
  const items = [...history].reverse();
  const counts = { positive: 0, negative: 0, neutral: 0 };
  let total = 0;
  items.forEach((item) => {
    const summary = item.summary || {};
    for (const key of Object.keys(counts)) counts[key] += Number(summary.counts?.[key] || 0);
    total += Number(summary.total || 0);
  });
  $("dashSources").textContent = items.length.toLocaleString();
  $("dashPositive").textContent = counts.positive.toLocaleString();
  $("dashNegative").textContent = counts.negative.toLocaleString();
  $("dashNeutral").textContent = counts.neutral.toLocaleString();
  $("dashSegments").textContent = total.toLocaleString();
  const avg = items.length ? items.reduce((sum, item) => sum + Number(item.summary?.average_compound || 0), 0) / items.length : 0;
  $("dashCompound").textContent = avg.toFixed(3);
  $("dashEmpty").textContent = items.length ? `${items.length} saved analysis run(s). Charts update after each analysis.` : "No analyses yet. Analyze a YouTube video, paste a transcript, or try the demo.";
  if (typeof Chart === "undefined") { $("dashEmpty").textContent += " Chart.js could not load; check your internet connection."; return; }
  dashboardCharts.forEach(chart => chart.destroy());
  dashboardCharts = [];
  const labels = ["Positive", "Negative", "Neutral"];
  const values = [counts.positive, counts.negative, counts.neutral];
  const colors = [sentimentColors.positive, sentimentColors.negative, sentimentColors.neutral];
  dashboardCharts.push(new Chart($("dashboardDistribution"), {type: "doughnut", data: {labels, datasets: [{data: values, backgroundColor: colors, borderWidth: 0}]}, options: {responsive: true, maintainAspectRatio: false, cutout: "68%", plugins: {legend: {position: "bottom"}}}}));
  dashboardCharts.push(new Chart($("dashboardTotals"), {type: "bar", data: {labels, datasets: [{label: "Total results", data: values, backgroundColor: colors, borderRadius: 7}]}, options: {responsive: true, maintainAspectRatio: false, scales: {y: {beginAtZero: true, ticks: {precision: 0}}}, plugins: {legend: {display: false}}}}));
  dashboardCharts.push(new Chart($("dashboardTrend"), {type: "line", data: {labels: items.map((item, i) => `#${i + 1}`), datasets: [{label: "Average compound", data: items.map(item => Number(item.summary?.average_compound || 0)), borderColor: "#8778ff", backgroundColor: "rgba(135,120,255,.16)", fill: true, tension: .25}]}, options: {responsive: true, maintainAspectRatio: false, scales: {y: {min: -1, max: 1}}, plugins: {legend: {display: false}}}}));
}

function renderHistory() {
  $("historyGrid").innerHTML = history.slice(0, 6).map((item) => `<article class="history-card"><div class="history-top"><span class="history-sentiment ${item.summary.overall_vader}">${item.summary.overall_vader}</span><time>${new Date(item.generated_at).toLocaleDateString()}</time></div><h4>${escapeHTML(item.title)}</h4><p>Analyzed with ${item.engine.toUpperCase()} · ${item.summary.total} video-level result</p><div class="history-score"><span>Compound</span><strong>${item.summary.average_compound.toFixed(3)}</strong></div><button class="history-button" data-history-id="${escapeHTML(item.id)}">View analysis →</button></article>`).join("");
  $("historyEmpty").classList.toggle("hidden", history.length > 0);
  $("historySection").classList.toggle("hidden", history.length === 0);
  $("recentCount").textContent = `${history.length} source${history.length === 1 ? "" : "s"}`;
  $("recentGrid").innerHTML = history.slice(0, 6).map((item) => `<article class="recent-card"><div class="recent-icon">${item.source === "youtube" ? "▶" : "☷"}</div><div><span>${item.source === "youtube" ? "YouTube" : item.source === "demo" ? "Demo" : "Transcript"}</span><h4>${escapeHTML(item.title)}</h4><small>${new Date(item.generated_at).toLocaleString()} · ${item.summary.overall_vader}</small></div><button class="recent-button" data-history-id="${escapeHTML(item.id)}" aria-label="Restore ${escapeHTML(item.title)}">↗</button></article>`).join("");
  renderDashboard();
  document.querySelectorAll("[data-history-id]").forEach((button) => button.addEventListener("click", () => restoreHistory(button.dataset.historyId)));
}

async function loadHistory() {
  try {
    const response = await fetch("/api/history");
    const data = await response.json();
    history = data.history || [];
    renderHistory();
  } catch {
    history = [];
    renderHistory();
  }
}

function restoreHistory(id) {
  const item = history.find((record) => record.id === id);
  if (!item) return;
  result = { source: item.source, video_id: item.video_id, title: item.title, generated_at: item.generated_at, summary: item.summary, segments: item.segments || [], drivers: item.drivers || [] };
  if (!result.segments.length) {
    result.segments = [{ text: "Saved video analysis", start: null, label: item.summary.overall_vader, compound: item.summary.average_compound, positive: item.summary.counts.positive, negative: item.summary.counts.negative, neutral: item.summary.counts.neutral, vader_label: item.summary.overall_vader, huggingface: null }];
  }
  renderResults();
  $("results").scrollIntoView({ behavior: "smooth", block: "start" });
  showToast("Previous analysis restored.");
}

async function clearHistory() {
  if (!history.length) return;
  history = [];
  renderHistory();
  const response = await fetch("/api/history", { method: "DELETE" });
  if (!response.ok) showToast("History could not be cleared.", "error");
  else showToast("Analysis history cleared.");
}

function bindEvents() {
  document.querySelectorAll(".source-tab").forEach((tab) => tab.addEventListener("click", () => setSource(tab.dataset.source)));
  $("analyzeBtn").addEventListener("click", runAnalysis);
  $("exportCsv").addEventListener("click", exportCSV);
  $("copyReport").addEventListener("click", copyReport);
  $("refreshStatus").addEventListener("click", refreshStatus);
  $("clearHistory").addEventListener("click", clearHistory);
  $("text").addEventListener("input", updateCharacterCount);
  $("segmentSearch").addEventListener("input", (event) => {
    const query = event.target.value.trim().toLowerCase();
    document.querySelectorAll("#rows tr").forEach((row) => row.classList.toggle("hidden", !row.dataset.search.toLowerCase().includes(query)));
    $("emptyState").classList.toggle("hidden", [...document.querySelectorAll("#rows tr")].some((row) => !row.classList.contains("hidden")));
  });
  $("menuButton").addEventListener("click", () => $("sidebar").classList.toggle("open"));
  document.querySelectorAll(".nav-item").forEach((link) => link.addEventListener("click", () => { document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active")); link.classList.add("active"); $("sidebar").classList.remove("open"); }));
  window.addEventListener("click", (event) => { if (window.innerWidth <= 780 && $("sidebar").classList.contains("open") && !event.target.closest("#sidebar") && !event.target.closest("#menuButton")) $("sidebar").classList.remove("open"); });
}

initializeTheme();
bindEvents();
updateCharacterCount();
loadHistory();
refreshStatus();
