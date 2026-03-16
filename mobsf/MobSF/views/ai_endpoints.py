import json
import os
import time
from typing import Any, Dict, List

import requests
from django.conf import settings
from django.http import FileResponse, StreamingHttpResponse, HttpResponse
from django.views.decorators.csrf import csrf_exempt

from mobsf.MobSF.ai import analyze_mobsf_report
from mobsf.MobSF.utils import get_scan_logs, is_md5
from mobsf.MobSF.views.api.api_middleware import make_api_response
from mobsf.MobSF.views.authentication import login_required
from mobsf.StaticAnalyzer.models import RecentScansDB, StaticAnalyzerAndroid, StaticAnalyzerIOS
from mobsf.MobSF.views.home import RecentScans
from mobsf.StaticAnalyzer.views.android.static_analyzer import static_analyzer
from mobsf.StaticAnalyzer.views.ios.static_analyzer import static_analyzer_ios
from mobsf.StaticAnalyzer.views.windows import windows
from mobsf.StaticAnalyzer.views.common.pdf import pdf
from mobsf.StaticAnalyzer.views.common.async_task import list_tasks


def _ai_cache_dir() -> str:
    p = os.path.join(settings.MOBSF_HOME, "ai_reports")
    os.makedirs(p, exist_ok=True)
    return p


def _cache_path(scan_hash: str) -> str:
    return os.path.join(_ai_cache_dir(), f"{scan_hash}.json")


def _load_cache(scan_hash: str) -> Dict[str, Any]:
    path = _cache_path(scan_hash)
    if not os.path.exists(path):
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _save_cache(scan_hash: str, data: Dict[str, Any]) -> None:
    path = _cache_path(scan_hash)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)


@login_required
@csrf_exempt
def ai_scan(request):
    """
    Start static analysis for an already uploaded file.
    This is a light wrapper around existing static analyzer views.
    """
    if request.method != "POST":
        return make_api_response({"error": "Method not Supported"}, 405)
    checksum = request.POST.get("hash")
    if not checksum:
        return make_api_response({"error": "Missing Parameters"}, 422)
    if not is_md5(checksum):
        return make_api_response({"error": "Invalid scan hash"}, 400)

    robj = RecentScansDB.objects.filter(MD5=checksum)
    if not robj.exists():
        return make_api_response({"error": "The file is not uploaded/available"}, 404)
    scan_type = robj[0].SCAN_TYPE

    try:
        if scan_type in settings.ANDROID_EXTS:
            resp = static_analyzer(request, checksum, True)
            if "type" in resp:
                resp = static_analyzer_ios(request, checksum, True)
        elif scan_type in settings.IOS_EXTS:
            resp = static_analyzer_ios(request, checksum, True)
        elif scan_type in settings.WINDOWS_EXTS:
            resp = windows.staticanalyzer_windows(request, checksum, True)
        else:
            return make_api_response({"error": "Unsupported scan type"}, 400)
        if "error" in resp:
            return make_api_response(resp, 500)
        return make_api_response(resp, 200)
    except Exception as exp:  # pragma: no cover - defensive
        return make_api_response({"error": f"{exp}"}, 500)


@login_required
@csrf_exempt
def ai_report_json(request):
    """Return the static analysis report context as JSON."""
    if request.method != "POST":
        return make_api_response({"error": "Method not Supported"}, 405)
    scan_hash = request.POST.get("hash")
    if not scan_hash:
        return make_api_response({"error": "Missing Parameters"}, 422)
    if not is_md5(scan_hash):
        return make_api_response({"error": "Invalid scan hash"}, 400)

    resp = pdf(request, scan_hash, api=True, jsonres=True)
    if "error" in resp:
        code = 400 if resp.get("error") == "Invalid Hash" else 500
        return make_api_response(resp, code)
    return make_api_response(resp, 200)


@login_required
@csrf_exempt
def ai_tasks(request):
    """Return recent scans list used by the portal."""
    if request.method not in ("GET", "POST"):
        return make_api_response({"error": "Method not Supported"}, 405)
    recent = RecentScans(request)
    data = recent.recent_scans()
    return make_api_response(data, 200)


@login_required
@csrf_exempt
def ai_status(request):
    """Return scan logs/status for a given hash."""
    if request.method not in ("GET", "POST"):
        return make_api_response({"error": "Method not Supported"}, 405)
    scan_hash = request.POST.get("hash") if request.method == "POST" else request.GET.get("hash")
    if not scan_hash:
        return make_api_response({"error": "Missing Parameters"}, 422)
    if not is_md5(scan_hash):
        return make_api_response({"error": "Invalid scan hash"}, 400)

    logs = get_scan_logs(scan_hash)
    return make_api_response({"logs": logs}, 200)


@login_required
@csrf_exempt
def ai_recent_scans(request):
    """Return a compact recent scans list (used by the portal sidebar)."""
    if request.method not in ("GET", "POST"):
        return make_api_response({"error": "Method not Supported"}, 405)
    recent = RecentScans(request)
    data = recent.recent_scans()
    return make_api_response(data, 200)


@login_required
@csrf_exempt
def ai_analyze(request):
    """
    Non-streaming AI analysis endpoint.

    POST:
      - hash: scan md5
      - prompt: optional extra instruction
      - force: "1" to ignore cache
      - lang: "zh" or "en"
    """
    if request.method != "POST":
        return make_api_response({"error": "Method not Supported"}, 405)
    scan_hash = request.POST.get("hash")
    if not scan_hash:
        return make_api_response({"error": "Missing Parameters"}, 422)
    if not is_md5(scan_hash):
        return make_api_response({"error": "Invalid scan hash"}, 400)

    force = request.POST.get("force", "0") == "1"
    prompt = request.POST.get("prompt", "")
    lang = (request.POST.get("lang") or "zh").strip().lower() or "zh"
    if lang not in ("zh", "en", "cn", "zh-cn"):
        lang = "zh"

    if not force:
        cached = _load_cache(scan_hash)
        if cached.get("status") == "ok" and cached.get("lang") == lang:
            cached["cached"] = True
            return make_api_response(cached, 200)

    started = time.time()
    mobsf_resp = pdf(request, scan_hash, api=True, jsonres=True)
    if "error" in mobsf_resp:
        if mobsf_resp.get("error") == "Invalid Hash":
            return make_api_response(mobsf_resp, 400)
        return make_api_response(mobsf_resp, 500)
    if mobsf_resp.get("report") == "Report not Found":
        return make_api_response(mobsf_resp, 404)
    if "report_dat" not in mobsf_resp:
        return make_api_response({"error": "JSON Generation Error"}, 500)

    report = mobsf_resp["report_dat"]
    ai = analyze_mobsf_report(report, prompt=prompt, lang=lang)
    elapsed_ms = int((time.time() - started) * 1000)

    result: Dict[str, Any] = {
        "status": ai.get("status", "error"),
        "provider": ai.get("provider", "unknown"),
        "scan_hash": scan_hash,
        "elapsed_ms": elapsed_ms,
        "analysis": ai.get("analysis", ""),
        "error": ai.get("error", ""),
    }
    if ai.get("status") == "ok" and "raw" in ai:
        result["raw"] = ai["raw"]
    if ai.get("status") == "ok":
        result["cached"] = False
        result["lang"] = lang
        _save_cache(scan_hash, result)

    http_status = 200 if result["status"] == "ok" else 500
    return make_api_response(result, http_status)


@login_required
@csrf_exempt
def ai_stream(request):
    """
    Streaming variant of AI analysis (plain text stream).
    """
    if request.method != "POST":
        return make_api_response({"error": "Method not Supported"}, 405)
    scan_hash = request.POST.get("hash")
    if not scan_hash:
        return make_api_response({"error": "Missing Parameters"}, 422)
    if not is_md5(scan_hash):
        return make_api_response({"error": "Invalid scan hash"}, 400)

    prompt = request.POST.get("prompt", "")
    lang = (request.POST.get("lang") or "zh").strip().lower() or "zh"
    if lang not in ("zh", "en", "cn", "zh-cn"):
        lang = "zh"

    mobsf_resp = pdf(request, scan_hash, api=True, jsonres=True)
    if "error" in mobsf_resp:
        code = 400 if mobsf_resp.get("error") == "Invalid Hash" else 500
        return make_api_response(mobsf_resp, code)
    if mobsf_resp.get("report") == "Report not Found":
        return make_api_response(mobsf_resp, 404)
    if "report_dat" not in mobsf_resp:
        return make_api_response({"error": "JSON Generation Error"}, 500)

    report = mobsf_resp["report_dat"]

    # We re-use the same provider config as analyze_mobsf_report.
    from mobsf.MobSF.ai import _select_provider  # type: ignore

    cfg = _select_provider()
    kind = cfg.get("kind") or ""
    if kind != "openai_compatible":
        return make_api_response(
            {"error": f"AI streaming not configured for provider kind '{kind}'"}, 500
        )

    base_url = (cfg.get("base_url") or "https://api.openai.com/v1").rstrip("/")
    api_key = cfg.get("api_key") or ""
    model = (cfg.get("model") or "gpt-4.1-mini").strip()
    timeout_s = int(cfg.get("timeout") or 120)
    if not api_key:
        return make_api_response({"error": "Missing MOBSF_AI_API_KEY."}, 500)

    # Local normalization (copy from ai.analyze_mobsf_report)
    from datetime import datetime, date

    def _normalize(obj: Any) -> Any:
        if isinstance(obj, (datetime, date)):
            return obj.isoformat(sep=" ")
        if isinstance(obj, dict):
            return {k: _normalize(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [_normalize(v) for v in obj]
        if isinstance(obj, tuple):
            return tuple(_normalize(v) for v in obj)
        return obj

    safe_report = _normalize(report)
    report_str = json.dumps(safe_report, ensure_ascii=False)
    max_len = 40000
    if len(report_str) > max_len:
        report_str = report_str[:max_len] + "... (truncated)"

    lang_instruction = (
        "You must respond entirely in Simplified Chinese (中文)."
        if lang in ("zh", "cn", "zh-cn")
        else "You must respond entirely in English."
    )
    system = (
        "You are an expert assistant focusing on mobile application security analysis. You analyze "
        "mobile app security scan reports for internal review. Your output must "
        "be suitable for inclusion in a formal AI analysis report (e.g. PDF): "
        "evidence-based, with clear risk levels, remediation, compliance, and "
        "reproduction steps. For every finding, cite reason, evidence, and "
        "code/configuration location from the report. Identify third-party SDKs "
        "(use your knowledge to infer from package names, libraries, or hashes "
        "in the report) and list their sensitive permissions. Include a privacy "
        "compliance section (data collection, permissions, PII handling). "
        "Write in a structured, professional style that guides security reviewers and can "
        "be used directly in internal documentation. Prefer clear headings and "
        "numbered lists. "
        + lang_instruction
    )
    base_prompt = prompt.strip() or (
        "Analyze this security scan report and produce a clean, highly readable internal "
        "analysis report suitable for direct HTML rendering and PDF export."
    )

    payload: Dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": base_prompt},
            {
                "role": "user",
                "content": (
                    "Here is the scan report data (UTF-8, truncated if very long):\n"
                    f"{report_str}"
                ),
            },
        ],
        "temperature": 0.2,
        "stream": True,
    }

    url = f"{base_url}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        upstream = requests.post(
            url,
            json=payload,
            headers=headers,
            timeout=timeout_s,
            stream=True,
        )
    except Exception as exp:  # pragma: no cover - defensive
        return make_api_response({"error": f"Request failed: {exp}"}, 500)

    if not (200 <= upstream.status_code < 300):
        text = upstream.text[:500]
        return make_api_response(
            {"error": f"HTTP {upstream.status_code}: {text}"}, 500
        )

    started = time.time()

    def event_stream():
        full: List[str] = []
        try:
            for line in upstream.iter_lines(decode_unicode=True):
                if not line:
                    continue
                if line.startswith("data: "):
                    data_str = line[len("data: ") :].strip()
                    if data_str == "[DONE]":
                        break
                    try:
                        obj = json.loads(data_str)
                    except Exception:
                        continue
                    choices = obj.get("choices") or []
                    if not choices:
                        continue
                    delta = choices[0].get("delta") or {}
                    chunk = delta.get("content") or ""
                    if not chunk:
                        continue
                    full.append(chunk)
                    yield chunk
        finally:
            upstream.close()

        full_text = "".join(full)
        elapsed_ms = int((time.time() - started) * 1000)
        cache_obj: Dict[str, Any] = {
            "status": "ok",
            "provider": kind or "openai_compatible",
            "scan_hash": scan_hash,
            "elapsed_ms": elapsed_ms,
            "analysis": full_text,
            "error": "",
            "cached": False,
            "lang": lang,
        }
        _save_cache(scan_hash, cache_obj)

    return StreamingHttpResponse(
        event_stream(), content_type="text/plain; charset=utf-8"
    )


@login_required
@csrf_exempt
def ai_result(request):
    """Return cached AI analysis result if exists."""
    if request.method != "POST":
        return make_api_response({"error": "Method not Supported"}, 405)
    scan_hash = request.POST.get("hash")
    if not scan_hash:
        return make_api_response({"error": "Missing Parameters"}, 422)
    if not is_md5(scan_hash):
        return make_api_response({"error": "Invalid scan hash"}, 400)
    cached = _load_cache(scan_hash)
    if not cached:
        return make_api_response({"error": "AI result not found"}, 404)
    cached["cached"] = True
    return make_api_response(cached, 200)


@login_required
def ai_download(request, checksum: str):
    """Download cached AI analysis as a PDF file."""
    if not is_md5(checksum):
        return make_api_response({"error": "Invalid scan hash"}, 400)
    cached = _load_cache(checksum)
    if not cached:
        return make_api_response({"error": "AI result not found"}, 404)

    analysis = cached.get("analysis") or ""
    if not analysis:
        return make_api_response({"error": "AI result is empty"}, 400)

    lang = (cached.get("lang") or "zh").strip().lower() or "zh"
    if lang not in ("zh", "en", "cn", "zh-cn"):
        lang = "zh"

    # Minimal markdown-to-HTML (align with portal renderer)
    import re
    import html as _html

    def esc(s: str) -> str:
        return (
            s.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
            .replace("'", "&#39;")
        )

    def inline_fmt(s: str) -> str:
        h = esc(s)
        h = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", h)
        h = re.sub(r"`([^`]+?)`", r"<code>\1</code>", h)
        return h

    def is_table_sep(line: str) -> bool:
        t = line.strip()
        return bool(re.match(r"^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$", t))

    def split_row(line: str) -> List[str]:
        t = line.strip()
        if t.startswith("|"):
            t = t[1:]
        if t.endswith("|"):
            t = t[:-1]
        return [c.strip() for c in t.split("|")]

    def render_md(src: str) -> str:
        lines = src.replace("\r\n", "\n").split("\n")
        out: List[str] = []
        in_ul = in_ol = in_table = False
        header_done = False
        saw_header = False

        def close_lists() -> None:
            nonlocal in_ul, in_ol
            if in_ul:
                out.append("</ul>")
                in_ul = False
            if in_ol:
                out.append("</ol>")
                in_ol = False

        def close_table() -> None:
            nonlocal in_table, header_done, saw_header
            if in_table:
                out.append("</tbody></table></div>")
                in_table = False
                header_done = False
                saw_header = False

        def is_table_line(s: str) -> bool:
            t = s.strip()
            return ("|" in t) and (not t.startswith("```"))

        for raw in lines:
            line = raw.rstrip()
            if not line.strip():
                close_table()
                close_lists()
                continue

            if is_table_line(line):
                close_lists()
                if not in_table:
                    out.append('<div class="ai-table-wrap"><table class="ai-table"><tbody>')
                    in_table = True
                if is_table_sep(line):
                    header_done = True
                    continue
                cells = split_row(line)
                if not header_done and not saw_header and len(cells) >= 2:
                    out.append('<tr class="ai-th">' + "".join(f"<th>{inline_fmt(c)}</th>" for c in cells) + "</tr>")
                    saw_header = True
                else:
                    out.append("<tr>" + "".join(f"<td>{inline_fmt(c)}</td>" for c in cells) + "</tr>")
                continue
            else:
                close_table()

            t = line
            if t.startswith("### "):
                close_lists()
                out.append("<h3>" + inline_fmt(t[4:]) + "</h3>")
                continue
            if t.startswith("## "):
                close_lists()
                out.append("<h2>" + inline_fmt(t[3:]) + "</h2>")
                continue
            if t.startswith("# "):
                close_lists()
                out.append("<h1>" + inline_fmt(t[2:]) + "</h1>")
                continue
            if re.match(r"^\d+\.\s+", t):
                if not in_ol:
                    close_lists()
                    out.append("<ol>")
                    in_ol = True
                out.append("<li>" + inline_fmt(re.sub(r"^\d+\.\s+", "", t)) + "</li>")
                continue
            if t.startswith("- "):
                if not in_ul:
                    close_lists()
                    out.append("<ul>")
                    in_ul = True
                out.append("<li>" + inline_fmt(t[2:]) + "</li>")
                continue

            close_lists()
            out.append("<p>" + inline_fmt(t) + "</p>")

        close_table()
        close_lists()
        return "".join(out)

    title = "移动应用AI分析报告" if lang.startswith("zh") or lang == "cn" else "Mobile App AI Analysis Report"
    subtitle = "基于移动应用安全扫描结果的内部分析报告" if lang.startswith("zh") or lang == "cn" else "Internal analysis report based on mobile app security scan results"

    provider = cached.get("provider") or ""
    elapsed_ms = cached.get("elapsed_ms") or 0
    meta_lines = []
    if provider:
        meta_lines.append(f"Provider: {provider}")
    if elapsed_ms:
        meta_lines.append(f"Elapsed: {elapsed_ms} ms")

    meta_html = "<br>".join(esc(x) for x in meta_lines)
    body_html = render_md(analysis)

    html_doc = f"""<!doctype html>
<html lang="{_html.escape(lang)}">
<head>
  <meta charset="utf-8">
  <title>{_html.escape(title)}</title>
  <style>
    body {{ font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans","PingFang SC","Microsoft YaHei",sans-serif; font-size: 13px; line-height: 1.6; color: #111827; padding: 28px 36px; }}
    h1 {{ font-size: 18px; margin: 0 0 2px; }}
    .subtitle {{ color: #6b7280; margin: 0 0 10px; }}
    .meta {{ font-size: 11px; color: #6b7280; margin-bottom: 10px; }}
    .ai-report h1, .ai-report h2, .ai-report h3 {{ font-weight: 700; margin-top: 12px; margin-bottom: 4px; }}
    .ai-report h2 {{ font-size: 15px; }}
    .ai-report h3 {{ font-size: 14px; }}
    .ai-report p {{ margin: 0 0 6px; overflow-wrap: anywhere; }}
    .ai-report ul, .ai-report ol {{ padding-left: 18px; margin: 0 0 6px; }}
    .ai-report code {{ padding: 1px 4px; border-radius: 6px; background: rgba(2,6,23,0.06); border: 1px solid rgba(2,6,23,0.08); font-family: ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono",monospace; font-size: 12px; }}
    .ai-table-wrap {{ margin: 10px 0 14px; border: 1px solid rgba(2,6,23,0.12); border-radius: 10px; overflow: hidden; }}
    .ai-table {{ width: 100%; border-collapse: collapse; }}
    .ai-table th, .ai-table td {{ border-bottom: 1px solid rgba(2,6,23,0.10); padding: 7px 8px; vertical-align: top; overflow-wrap: anywhere; }}
    .ai-table th {{ background: rgba(2,6,23,0.04); font-weight: 700; }}
    summary::marker {{ content: ""; }} summary::-webkit-details-marker {{ display: none; }}
  </style>
</head>
<body>
  <h1>{_html.escape(title)}</h1>
  <div class="subtitle">{_html.escape(subtitle)}</div>
  <div class="meta">{meta_html}</div>
  <hr />
  <div class="ai-report">{body_html}</div>
</body>
</html>"""

    try:
        import pdfkit  # type: ignore[import]
    except Exception:
        return make_api_response({"error": "wkhtmltopdf/pdfkit is not available."}, 500)

    options = {
        "page-size": "A4",
        "quiet": "",
        "enable-local-file-access": "",
        "margin-top": "0.75in",
        "margin-right": "0.75in",
        "margin-bottom": "0.75in",
        "margin-left": "0.75in",
        "encoding": "UTF-8",
    }
    try:
        pdf_bytes = pdfkit.from_string(html_doc, False, options=options)
    except Exception as exp:
        return make_api_response({"error": "Failed to generate AI PDF report", "err_details": str(exp)}, 500)

    filename = f"ai-analysis-{checksum}.pdf"
    resp = HttpResponse(pdf_bytes, content_type="application/pdf")
    resp["Content-Disposition"] = f'attachment; filename="{filename}"'
    return resp

