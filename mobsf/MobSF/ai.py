"""
AI helpers for the AI portal.

Configuration is file-based so that multiple providers/models can be managed
without relying on process environment variables.

Default config path (JSON):
  [MOBSF_HOME]/ai_config.json

Shape 1 - simple single provider (recommended for now):
  {
    "provider": "openai_compatible",
    "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "api_key": "sk-...",
    "model": "qwen-plus",
    "timeout": 120
  }

Shape 2 - extensible multi-provider:
  {
    "default_provider": "bailian",
    "providers": {
      "bailian": {
        "kind": "openai_compatible",
        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "api_key": "sk-...",
        "model": "qwen-plus",
        "timeout": 120
      }
    }
  }

If no config is present, the AI portal will still work and return a clear
“AI is not configured” message.
"""

from __future__ import annotations

import os
from typing import Any, Dict, Optional
from datetime import datetime, date
import json

import requests

from mobsf.MobSF import settings

_AI_CONFIG_CACHE: Optional[Dict[str, Any]] = None


def _config_path() -> str:
    """Return the path to the AI config file."""
    base = getattr(settings, "MOBSF_HOME", settings.BASE_DIR)
    return os.path.join(base, "ai_config.json")


def _load_ai_config() -> Dict[str, Any]:
    """Load AI configuration from JSON file (with simple caching)."""
    global _AI_CONFIG_CACHE
    if _AI_CONFIG_CACHE is not None:
        return _AI_CONFIG_CACHE
    path = _config_path()
    try:
        if not os.path.exists(path):
            _AI_CONFIG_CACHE = {}
            return _AI_CONFIG_CACHE
        import json

        with open(path, "r", encoding="utf-8") as f:
            _AI_CONFIG_CACHE = json.load(f) or {}
    except Exception:
        # On any parse error, treat as “no config” but do not crash the portal.
        _AI_CONFIG_CACHE = {}
    return _AI_CONFIG_CACHE


def _select_provider() -> Dict[str, Any]:
    """
    Resolve the effective provider configuration from the loaded config.

    Returns a dict which always contains:
      - kind: provider kind, e.g. "openai_compatible"
      - base_url, api_key, model, timeout (where applicable)
    """
    cfg = _load_ai_config()

    # Multi-provider layout
    providers = cfg.get("providers")
    if isinstance(providers, dict) and providers:
        name = cfg.get("default_provider") or next(iter(providers.keys()))
        p = providers.get(name, {})
        kind = p.get("kind") or p.get("provider") or ""
        return {
            "name": name,
            "kind": str(kind),
            "base_url": str(p.get("base_url", "")).strip(),
            "api_key": str(p.get("api_key", "")).strip(),
            "model": str(p.get("model", "")).strip(),
            "timeout": int(p.get("timeout", 120) or 120),
        }

    # Simple single-provider layout
    kind = cfg.get("kind") or cfg.get("provider") or ""
    return {
        "name": "default",
        "kind": str(kind),
        "base_url": str(cfg.get("base_url", "")).strip(),
        "api_key": str(cfg.get("api_key", "")).strip(),
        "model": str(cfg.get("model", "")).strip(),
        "timeout": int(cfg.get("timeout", 120) or 120),
    }


def analyze_mobsf_report(
    report: Dict[str, Any],
    prompt: str = "",
    model_override: Optional[str] = None,
    lang: str = "zh",
) -> Dict[str, Any]:
    """
    Analyze a mobile app security scan report using an LLM (optional).

    Currently supported provider kinds:
      - "openai_compatible": generic Chat Completions endpoint
    """
    cfg = _select_provider()
    kind = cfg.get("kind") or ""
    if kind != "openai_compatible":
        return {
            "status": "error",
            "provider": kind or "disabled",
            "error": (
                "AI is not configured. Create ai_config.json in MOBSF_HOME with "
                'provider settings, e.g. {"provider": "openai_compatible", '
                '"base_url": "...", "api_key": "...", "model": "..."} .'
            ),
        }

    base_url = (cfg.get("base_url") or "https://api.openai.com/v1").rstrip("/")
    api_key = cfg.get("api_key") or ""
    model = (model_override or cfg.get("model") or "gpt-4.1-mini").strip()
    timeout_s = int(cfg.get("timeout") or 120)

    if not api_key:
        return {
            "status": "error",
            "provider": kind or "openai_compatible",
            "error": "Missing MOBSF_AI_API_KEY.",
        }

    # Output language: zh/cn -> Chinese, else English
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
    user_prompt = prompt.strip() or (
        "Analyze this security scan report and produce a clean, highly readable internal "
        "analysis report suitable for direct HTML rendering and PDF export.\n\n"
        "STRICT OUTPUT RULES:\n"
        "- Do NOT include any tool/product name or version anywhere.\n"
        "- Do NOT include any organization/department fields (e.g., 审计方、某某审计部等).\n"
        "- Do NOT add a separate report title line like '移动应用安全分析报告（基于 XXX 静态分析）'.\n"
        "- Use ONLY markdown that is easy to render: headings (#/##/###), paragraphs, "
        "ordered lists (1.), unordered lists (-), inline code (`like_this`), bold (**text**), "
        "and markdown tables. Do NOT use emojis or decorative icons (such as ✅, ❗, ▶, ●) "
        "before any text; use plain text bullets only.\n"
        "- The language of all headings and content must be consistent with the response language: "
        "if you respond in Chinese, headings and body must be pure Chinese (no English fragments "
        "like ' / Third-party SDKs and Sensitive Permissions'); if you respond in English, headings "
        "and body must be pure English (no Chinese mixed into the same heading).\n"
        "- Avoid long single-line text. Keep lines reasonably wrapped.\n"
        "- Every major finding MUST include: Risk level (High/Medium/Low), Impact, Evidence, "
        "Location (file/class/key), Reproduction steps, and Remediation.\n\n"
        "REPORT HEADER (must be the first section, no extra report title):\n"
        "Provide a small 2-column markdown table with these fields, using values from the scan data. "
        "Do NOT include any scan engine version or organization name in this table.\n"
        "- 应用名称 / App Name\n"
        "- 包名 / Package\n"
        "- 文件名 / File Name\n"
        "- MD5\n"
        "- 应用版本 / App Version\n"
        "- 目标SDK / Target SDK\n"
        "- 最低SDK / Min SDK\n"
        "- 报告生成日期 / Report Date (you may use the scan/report generation timestamp or treat as today)\n\n"
        "## 一、总体风险概览 / Overall Risk Summary\n"
        "- Give a 3-row markdown table summarizing High/Medium/Low counts and key drivers.\n"
        "- Then 3-6 bullet points with the most important risk themes.\n\n"
        "## 二、主要问题与整改建议 / Key Findings and Remediation\n"
        "List findings in descending risk order. For each finding, use the exact sub-structure:\n"
        "### [风险等级] Finding title\n"
        "- **风险等级**: High/Medium/Low\n"
        "- **影响**: (who/what is impacted)\n"
        "- **证据**: (quote key strings/values from the scan)\n"
        "- **位置**: (file/class/method/config key from the scan)\n"
        "- **复现步骤**:\n"
        "  1. ...\n"
        "  2. ...\n"
        "- **整改建议**:\n"
        "  - ...\n"
        "  - ...\n\n"
        "## 三、合规性、隐私与应用商店上线风险 / Compliance, Privacy, and Store Readiness\n"
        "### 3.1 隐私与权限合规\n"
        "- Provide a markdown table: Permission | Purpose | Risk | Recommendation\n"
        "### 3.2 数据处理与PII\n"
        "- Bullet list of PII/logging/crypto/network transport concerns with evidence and location.\n"
        "### 3.3 应用商店上线风险评估\n"
        "- For each store category, provide pass/block risks and why:\n"
        "  - Google Play\n"
        "  - Apple App Store (for iOS scans; if Android-only, state N/A)\n"
        "  - Mainstream Chinese Android markets\n\n"
        "## 四、复现步骤汇总 / Verification Checklist\n"
        "- A short ordered checklist auditors can follow to verify the top 5 issues.\n\n"
        "## 五、第三方 SDK 与敏感权限 / Third-party SDKs and Sensitive Permissions\n"
        "Provide a markdown table with columns:\n"
        "SDK/Provider | Likely SDK Name | Package/Library Indicators | "
        "Sensitive Permissions/Behaviors | Compliance/Store Risk | Recommendation\n\n"
        "## 六、建议与结论 / Recommendations and Conclusion\n"
        "- 5-10 bullets of prioritized next steps.\n"
    )

    # Normalize report so that it is JSON-serializable
    def _normalize(obj: Any) -> Any:
        if isinstance(obj, (datetime, date)):
            # Use ISO format string for timestamps
            return obj.isoformat(sep=" ")
        if isinstance(obj, dict):
            return {k: _normalize(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [_normalize(v) for v in obj]
        if isinstance(obj, tuple):
            return tuple(_normalize(v) for v in obj)
        return obj

    safe_report = _normalize(report)

    # Serialize report as a compact JSON string for providers that expect text.
    report_str = json.dumps(safe_report, ensure_ascii=False)
    # Hard cap to avoid extremely large prompts overwhelming the provider.
    max_len = 40000
    if len(report_str) > max_len:
        report_str = report_str[:max_len] + "... (truncated)"

    # Keep payload reasonably sized: send the full (normalized) report text,
    # but allow upstream to handle it; if providers have strict limits, users
    # can further reduce input via prompt or by post-processing the report.
    payload: Dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_prompt},
            {
                "role": "user",
                "content": (
                    "Here is the scan report data (UTF-8, truncated if very long):\n"
                    f"{report_str}"
                ),
            },
        ],
        "temperature": 0.2,
    }

    url = f"{base_url}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        r = requests.post(url, json=payload, headers=headers, timeout=timeout_s)
    except Exception as exp:
        return {
            "status": "error",
            "provider": kind or "openai_compatible",
            "error": f"Request failed: {exp}",
        }

    text = r.text
    data: Optional[Dict[str, Any]] = None
    try:
        data = r.json()
    except Exception:
        data = None

    if not (200 <= r.status_code < 300):
        return {
            "status": "error",
            "provider": kind or "openai_compatible",
            "error": f"HTTP {r.status_code}: {text[:500]}",
            "raw": data or text,
        }

    content: Optional[str] = None
    try:
        content = data["choices"][0]["message"]["content"]  # type: ignore[index]
    except Exception:
        content = None
    if not content:
        return {
            "status": "error",
            "provider": kind or "openai_compatible",
            "error": "AI response did not include message content.",
            "raw": data,
        }
    return {
        "status": "ok",
        "provider": kind or "openai_compatible",
        "analysis": content,
        "raw": data,
    }

