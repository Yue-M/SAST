(() => {
  const qs = (s) => document.querySelector(s);
  const elFile = qs("#ai-file");
  const elDropzone = qs("#ai-dropzone");
  const elFileName = qs("#ai-file-name");
  const elHash = qs("#ai-hash");
  const elPrompt = qs("#ai-prompt");
  const elTasks = qs("#ai-task-list");
  const elResult = qs("#ai-result");
  const elResultMeta = qs("#ai-result-meta");
  const elStatus = qs("#ai-status");
  const elMainMeta = qs("#ai-main-meta");
  const elMainPct = qs("#ai-main-pct");
  const elMainProg = qs("#ai-main-progress");
  const elScanLogs = qs("#ai-scan-logs");

  const btnUpload = qs("#ai-btn-upload");
  const btnOpenReport = qs("#ai-btn-open-report");
  const btnDownloadBinary = qs("#ai-btn-download-binary");
  const btnDownloadPdf = qs("#ai-btn-download-pdf");
  const btnAnalyze = qs("#ai-btn-analyze");
  const btnRefreshTasks = qs("#ai-btn-refresh-tasks");
  const btnDownloadAI = qs("#ai-btn-download-ai");
  const btnToggleLang = qs("#ai-toggle-lang");
  const btnToggleTheme = qs("#ai-toggle-theme");
  const elThemeIcon = qs("#ai-theme-icon");
  const btnLogout = qs("#ai-btn-logout");
  const btnLogToggle = qs("#ai-log-toggle");

  const csrfToken = window.__AI_PORTAL__?.csrfToken || "";

  let mainPctValue = 0;
  let isAnalyzing = false;
  let hasAiResult = false;

  // Very small markdown-to-HTML renderer for headings, tables, lists and paragraphs.
  function renderMarkdownToHtml(src) {
    if (!src) return "";
    const lines = String(src).replace(/\r\n/g, "\n").split("\n");
    const out = [];
    let inUl = false;
    let inOl = false;
    let inTable = false;
    let tableHeaderDone = false;

    function closeLists() {
      if (inUl) {
        out.push("</ul>");
        inUl = false;
      }
      if (inOl) {
        out.push("</ol>");
        inOl = false;
      }
    }
    function closeTable() {
      if (inTable) {
        out.push("</tbody></table>");
        inTable = false;
        tableHeaderDone = false;
      }
    }
    function isTableLine(s) {
      const t = (s || "").trim();
      return t.includes("|") && !t.startsWith("```");
    }
    function isTableSep(s) {
      const t = (s || "").trim();
      // e.g. | --- | --- |
      return /^(\|?\s*:?-{2,}:?\s*)+\|?\s*$/.test(t.replace(/\|/g, "|"));
    }
    function splitTableRow(s) {
      // Trim leading/trailing pipes and split
      const t = (s || "").trim();
      const core = t.replace(/^\|/, "").replace(/\|$/, "");
      return core.split("|").map((c) => c.trim());
    }
    function inlineFormat(text) {
      // Escape first, then apply tiny inline formats: **bold**, `code`
      let h = escapeHtml(text);
      h = h.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      h = h.replace(/`([^`]+?)`/g, "<code>$1</code>");
      return h;
    }

    for (let raw of lines) {
      const line = raw.trimEnd();
      if (!line) {
        closeTable();
        closeLists();
        continue;
      }
      // Markdown table support (header + separator + rows)
      if (isTableLine(line)) {
        // Look ahead for header separator if this is a header row.
        // We detect header row by checking next line looks like separator.
        // (Note: we can't lookahead easily in for..of, so we handle separator when seen.)
        if (!inTable) {
          closeLists();
          out.push('<div class="ai-table-wrap"><table class="ai-table"><thead></thead><tbody>');
          inTable = true;
          tableHeaderDone = false;
        }
        // If this line is a separator (---), skip it and mark header as done.
        if (isTableSep(line)) {
          tableHeaderDone = true;
          continue;
        }
        const cells = splitTableRow(line);
        if (!tableHeaderDone && out.length && out[out.length - 1].includes("<tbody>")) {
          // treat first non-sep row as header if next line is separator in markdown;
          // if not, we still render it as normal row.
        }
        if (!tableHeaderDone && out.some((x) => x.includes("<thead>")) && !out.some((x) => x.includes("</thead>"))) {
          // no-op (safety)
        }
        if (!tableHeaderDone && !out.some((x) => x.includes("<tr class=\"ai-th\">"))) {
          // Render as header row if the next line in original markdown was a separator.
          // We can't reliably detect next line here; instead we render as header if
          // we haven't completed header yet and the row looks like a header (multiple cells).
          if (cells.length >= 2) {
            out.push('<tr class="ai-th">' + cells.map((c) => "<th>" + inlineFormat(c) + "</th>").join("") + "</tr>");
            continue;
          }
        }
        out.push("<tr>" + cells.map((c) => "<td>" + inlineFormat(c) + "</td>").join("") + "</tr>");
        continue;
      } else {
        closeTable();
      }
      if (line.startsWith("### ")) {
        closeTable();
        closeLists();
        const text = line.replace(/^###\s+/, "");
        out.push("<h3>" + inlineFormat(text) + "</h3>");
        continue;
      }
      if (line.startsWith("## ")) {
        closeLists();
        const text = line.replace(/^##\s+/, "");
        out.push("<h2>" + inlineFormat(text) + "</h2>");
        continue;
      }
      if (line.startsWith("# ")) {
        closeLists();
        const text = line.replace(/^#\s+/, "");
        out.push("<h1>" + inlineFormat(text) + "</h1>");
        continue;
      }
      if (/^\d+\.\s+/.test(line)) {
        if (!inOl) {
          closeLists();
          out.push("<ol>");
          inOl = true;
        }
        const text = line.replace(/^\d+\.\s+/, "");
        out.push("<li>" + inlineFormat(text) + "</li>");
        continue;
      }
      if (line.startsWith("- ")) {
        if (!inUl) {
          closeLists();
          out.push("<ul>");
          inUl = true;
        }
        const text = line.replace(/^-+\s+/, "").replace(/^-+\s*/, "");
        out.push("<li>" + inlineFormat(text) + "</li>");
        continue;
      }
      closeLists();
      out.push("<p>" + inlineFormat(line) + "</p>");
    }
    closeTable();
    closeLists();
    return out.join("");
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  function setMainProgress(pct, label) {
    const v = Math.max(0, Math.min(100, pct));
    mainPctValue = v;
    if (elMainProg) elMainProg.style.width = `${v}%`;
    if (elMainPct) elMainPct.textContent = `${v}%`;
    if (label && elMainMeta) elMainMeta.textContent = label;
  }
  function setStatus(msg) {
    // Status is above progress bar; do not let polling overwrite it.
    if (elStatus) elStatus.textContent = msg || "";
    else if (elMainMeta) elMainMeta.textContent = msg || "";
  }

  function currentHash() {
    const v = (elHash.value || "").trim();
    return v;
  }

  function formatBytes(bytes) {
    if (typeof bytes !== "number" || !isFinite(bytes)) return "";
    const units = ["B", "KB", "MB", "GB"];
    let i = 0;
    let n = bytes;
    while (n >= 1024 && i < units.length - 1) {
      n /= 1024;
      i += 1;
    }
    return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }

  function setSelectedFile(file) {
    if (!file) {
      if (elFileName) elFileName.textContent = t("file_none");
      return;
    }
    // When a new file is selected/dropped, clear one-off status messages
    // (e.g., delete success) to keep the upload flow clean.
    setStatus("");
    if (elMainMeta && elMainMeta.textContent && elMainMeta.textContent.trim() === t("delete_success")) {
      elMainMeta.textContent = t("meta_idle");
    }
    const size = formatBytes(file.size);
    const extra = size ? (currentLang() === "en" ? ` (${size})` : `（${size}）`) : "";
    if (elFileName) elFileName.textContent = `${file.name}${extra}`;
  }

  function hasFile() {
    return !!(elFile && elFile.files && elFile.files.length > 0);
  }
  function syncUploadVisibility() {
    if (!btnUpload) return;
    const selected = /^[0-9a-f]{32}$/i.test(currentHash());
    if (selected && !hasFile()) btnUpload.classList.add("d-none");
    else btnUpload.classList.remove("d-none");
  }
  function enableForHash(hash) {
    const ok = /^[0-9a-f]{32}$/i.test(hash);
    const ready = ok && !isAnalyzing;
    // 上传过程中或分析过程中不允许再次点击上传
    if (btnUpload) btnUpload.disabled = isAnalyzing || (!ok && !hasFile());
    // Below actions依赖分析完成，分析未完成时禁用
    if (btnOpenReport) btnOpenReport.disabled = !ready;
    if (btnDownloadBinary) btnDownloadBinary.disabled = !ready;
    if (btnDownloadPdf) btnDownloadPdf.disabled = !ready;
    if (btnAnalyze) btnAnalyze.disabled = !ready;
    // AI 报告下载除了需要任务 ready，还必须已经有 AI 结果
    if (btnDownloadAI) btnDownloadAI.disabled = !ready || !hasAiResult;
    syncUploadVisibility();
  }

  const SELECTED_CLASS = "ai-task-item-selected";
  function setTaskSelection(selectedHash) {
    elTasks.querySelectorAll(".ai-task-item").forEach((row) => {
      const h = row.getAttribute("data-hash");
      if (h === selectedHash) row.classList.add(SELECTED_CLASS);
      else row.classList.remove(SELECTED_CLASS);
    });
  }
  function getSelectedTaskHash() {
    const row = elTasks.querySelector(".ai-task-item." + SELECTED_CLASS);
    return row ? row.getAttribute("data-hash") || "" : "";
  }

  function staticReportUrl(hash) {
    // MobSF main static analyzer report route (Android). If you scan iOS/Windows,
    // you can still paste/open the correct analyzer route manually.
    return `/static_analyzer/${hash}/`;
  }

  function downloadBinaryUrl(hash) {
    return `/download_binary/${hash}/`;
  }

  function downloadPdfUrl(hash) {
    const lang = currentLang();
    return `/pdf/${hash}/?lang=${encodeURIComponent(lang)}`;
  }

  function downloadAiUrl(hash) {
    return `/ai/download/${hash}/`;
  }

  // --- Language & Theme ---
  const I18N = {
    zh: {
      lang_btn: "中文 / EN",
      theme_btn_title: "切换主题",
      logout_title: "退出登录",
      refresh_title: "刷新",
      log_toggle: "查看日志",
      meta_idle: "待命。",
      logs_empty: "暂无日志。",
      file_none: "未选择文件",
      tasks_load_fail: "任务加载失败（{status}）。",
      tasks_empty: "任务队列为空。",
      record_fallback: "记录",
      delete_title: "删除",
      delete_confirm: "确定要删除该任务吗？此操作会删除扫描记录与相关文件，无法恢复。",
      delete_success: "已删除任务。",
      delete_failed: "删除失败：{msg}",
      status_selected: "已选择任务。可查看 HTML 报告或运行 AI 分析。",
      status_unselected: "已取消选择。请从列表选择任务或上传新文件。",
      wait_scan_logs: "等待扫描日志…",
      progress_running: "分析中：{label}",
      progress_done: "分析完成：{label}",
      wait_start: "等待分析启动…",
      uploading: "上传中…",
      pick_file_first: "请先选择文件。",
      uploading_start: "正在上传…",
      upload_failed: "上传失败。",
      upload_done_start: "上传完成：{hash}。准备启动分析…",
      scan_start_failed: "启动扫描失败（HTTP {status}）。",
      download_bin_preparing: "正在准备下载原始文件…",
      pdf_generating: "正在生成 PDF…",
      pdf_started: "PDF 已开始下载。",
      pdf_failed: "PDF 生成失败。",
      pdf_req_failed: "PDF 请求失败：{err}",
      wkhtmltopdf_missing: "未检测到 wkhtmltopdf，无法生成 PDF。请在服务器上安装 wkhtmltopdf 后重试。安装说明：https://github.com/JazzCore/python-pdfkit/wiki/Installing-wkhtmltopdf",
      nav_title: "SAST AI",
      header_title: "AI 门户",
      header_subtitle: "独立页面，不嵌入旧版 MobSF UI；仅集成必要功能。",
      recent_title: '<i class="fas fa-stream"></i> 最近任务',
      recent_empty: "暂无任务。",
      upload_title: '<i class="fas fa-upload"></i> 上传与分析',
      label_file: "应用文件",
      drop_title: "拖拽文件到这里",
      drop_sub: "或点击选择文件",
      file_support: "支持：APK / APKS / XAPK / AAB / JAR / AAR / SO / IPA / DYLIB / A / ZIP / APPX",
      label_md5: "MD5（任务标识）",
      md5_placeholder: "上传后自动填充（或粘贴已有的 MD5）",
      btn_upload: '<i class="fas fa-rocket"></i> 上传并开始分析',
      btn_open_report: '<i class="fas fa-eye"></i> 查看静态报告（HTML）',
      btn_download_binary: '<i class="fas fa-download"></i> 下载原始文件',
      btn_download_pdf: '<i class="fas fa-file-pdf"></i> 下载 PDF',
      label_prompt: "AI 分析目标（可选）",
      prompt_toggle: "展开",
      prompt_placeholder:
        "示例：1）重点分析隐私合规和应用商店上线风险；2）按风险等级梳理问题并给出可落地整改清单；3）突出第三方 SDK 的敏感权限及合规风险；4）生成可供审阅人员使用的复现与验证步骤清单。",
      btn_analyze: '<i class="fas fa-brain"></i> 运行 AI 分析',
      result_title: '<i class="fas fa-brain"></i> AI 分析结果',
      result_empty: "暂无 AI 结果。",
      footer_title: "SAST AI",
      footer_version: "Version",
      footer_copy: "© {year} SAST AI. 保留所有权利。",
    },
    en: {
      lang_btn: "中文 / EN",
      theme_btn_title: "Toggle theme",
      logout_title: "Logout",
      refresh_title: "Refresh",
      log_toggle: "View logs",
      meta_idle: "Idle.",
      logs_empty: "No logs.",
      file_none: "No file selected",
      tasks_load_fail: "Failed to load tasks ({status}).",
      tasks_empty: "Task queue is empty.",
      record_fallback: "Record",
      delete_title: "Delete",
      delete_confirm: "Delete this task? This will remove the scan record and related files. This cannot be undone.",
      delete_success: "Task deleted.",
      delete_failed: "Delete failed: {msg}",
      status_selected: "Task selected. You can view the HTML report or run AI analysis.",
      status_unselected: "Selection cleared. Choose a task from the list or upload a new file.",
      wait_scan_logs: "Waiting for scan logs…",
      progress_running: "Analyzing: {label}",
      progress_done: "Completed: {label}",
      wait_start: "Waiting for analysis to start…",
      uploading: "Uploading…",
      pick_file_first: "Please select a file first.",
      uploading_start: "Uploading…",
      upload_failed: "Upload failed.",
      upload_done_start: "Upload complete: {hash}. Starting analysis…",
      scan_start_failed: "Failed to start scan (HTTP {status}).",
      download_bin_preparing: "Preparing original file download…",
      pdf_generating: "Generating PDF…",
      pdf_started: "PDF download started.",
      pdf_failed: "Failed to generate PDF.",
      pdf_req_failed: "PDF request failed: {err}",
      wkhtmltopdf_missing: "wkhtmltopdf not found. Install wkhtmltopdf on the server and retry. Guide: https://github.com/JazzCore/python-pdfkit/wiki/Installing-wkhtmltopdf",
      nav_title: "SAST AI",
      header_title: "AI Portal",
      header_subtitle: "Standalone page with only the essential AI features.",
      recent_title: '<i class="fas fa-stream"></i> Recent Tasks',
      recent_empty: "No tasks yet.",
      upload_title: '<i class="fas fa-upload"></i> Upload & Analyze',
      label_file: "Application file",
      drop_title: "Drop file here",
      drop_sub: "or click to select",
      file_support: "Supported: APK / APKS / XAPK / AAB / JAR / AAR / SO / IPA / DYLIB / A / ZIP / APPX",
      label_md5: "MD5 (Task ID)",
      md5_placeholder: "Filled automatically after upload, or paste an existing MD5",
      btn_upload: '<i class="fas fa-rocket"></i> Upload & Start Analysis',
      btn_open_report: '<i class="fas fa-eye"></i> View Static Report (HTML)',
      btn_download_binary: '<i class="fas fa-download"></i> Download Original File',
      btn_download_pdf: '<i class="fas fa-file-pdf"></i> Download PDF',
      label_prompt: "AI analysis focus (optional)",
      prompt_toggle: "Open",
      prompt_placeholder:
        "Examples: 1) Focus on privacy compliance and app store readiness; 2) Rank issues by risk and produce an actionable remediation checklist; 3) Highlight third-party SDKs, sensitive permissions and compliance risks; 4) Generate a concise verification checklist for reviewers.",
      btn_analyze: '<i class="fas fa-brain"></i> Run AI Analysis',
      result_title: '<i class="fas fa-brain"></i> AI Analysis Result',
      result_empty: "No AI result yet.",
      footer_title: "SAST AI",
      footer_version: "Version",
      footer_copy: "© {year} SAST AI. All rights reserved.",
    },
  };

  function currentLang() {
    return localStorage.getItem("ai_portal_lang") || "zh";
  }
  function t(key) {
    const dict = I18N[currentLang()] || I18N.zh;
    return dict[key] || (I18N.zh[key] || "");
  }
  function tf(key, vars) {
    let s = t(key);
    if (!vars) return s;
    Object.entries(vars).forEach(([k, v]) => {
      s = s.replaceAll(`{${k}}`, String(v));
    });
    return s;
  }

  // Server timestamps are often UTC; display them in user's local time.
  function parseServerTimestamp(ts) {
    if (!ts) return null;
    const s = String(ts).trim();
    // If already ISO with timezone, Date can handle it.
    if (s.includes("Z") || /[+-]\d{2}:\d{2}$/.test(s)) {
      const d = new Date(s);
      return isNaN(d.getTime()) ? null : d;
    }
    // Handle "YYYY-MM-DD HH:mm:ss" (assume UTC) or "YYYY-MM-DDTHH:mm:ss"
    const iso = s.includes("T") ? s : s.replace(" ", "T");
    const d = new Date(iso + "Z");
    return isNaN(d.getTime()) ? null : d;
  }
  function formatLocalTimestamp(ts) {
    const d = parseServerTimestamp(ts);
    if (!d) return String(ts || "");
    const pad = (n) => String(n).padStart(2, "0");
    const y = d.getFullYear();
    const m = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hh = pad(d.getHours());
    const mm = pad(d.getMinutes());
    const ss = pad(d.getSeconds());
    return `${y}-${m}-${day} ${hh}:${mm}:${ss}`;
  }

  function nowLocalTs() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const y = d.getFullYear();
    const m = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hh = pad(d.getHours());
    const mm = pad(d.getMinutes());
    const ss = pad(d.getSeconds());
    return `${y}-${m}-${day} ${hh}:${mm}:${ss}`;
  }

  function appendClientLog(msg) {
    if (!elScanLogs || !msg) return;
    const cur = (elScanLogs.textContent || "").split("\n").filter(Boolean);
    const line = `[${nowLocalTs()}] ${msg}`;
    cur.push(line);
    const tail = cur.slice(-80);
    elScanLogs.textContent = tail.join("\n");
  }

  function applyLang(lang) {
    const dict = I18N[lang] || I18N.zh;
    const byId = (id) => document.getElementById(id);
    const navTitle = byId("ai-nav-title");
    // Preserve brand logo markup; only update text spans if present.
    const brandText = byId("ai-brand-text");
    const brandSuffix = byId("ai-brand-suffix");
    const brandOrg = byId("ai-brand-org");
    if (brandText) brandText.textContent = "SAST";
    if (brandSuffix) brandSuffix.textContent = "AI";
    if (brandOrg) {
      brandOrg.textContent =
        lang === "en" ? "POSTAL SAVINGS BANK OF CHINA" : "中国邮政储蓄银行";
    }
    if (navTitle && !brandText && !brandSuffix) navTitle.innerHTML = dict.nav_title;
    // Header section may be removed; guard nulls.
    const headerTitle = byId("ai-header-title");
    if (headerTitle) headerTitle.textContent = dict.header_title;
    const headerSubtitle = byId("ai-header-subtitle");
    if (headerSubtitle) headerSubtitle.textContent = dict.header_subtitle;
    const recentTitle = byId("ai-recent-title");
    if (recentTitle) recentTitle.innerHTML = dict.recent_title;
    const empty = byId("ai-task-empty");
    if (empty) empty.textContent = dict.recent_empty;
    const uploadTitle = byId("ai-upload-title");
    if (uploadTitle) uploadTitle.innerHTML = dict.upload_title;
    const labelFile = byId("ai-label-file");
    if (labelFile) labelFile.textContent = dict.label_file;
    const dropTitle = byId("ai-drop-title");
    if (dropTitle) dropTitle.textContent = dict.drop_title;
    const dropSub = byId("ai-drop-sub");
    if (dropSub) dropSub.textContent = dict.drop_sub;
    const fileSupport = byId("ai-file-support");
    if (fileSupport) fileSupport.textContent = dict.file_support;
    const labelMd5 = byId("ai-label-md5");
    if (labelMd5) labelMd5.textContent = dict.label_md5;
    const hashInput = byId("ai-hash");
    if (hashInput) hashInput.placeholder = dict.md5_placeholder;
    if (btnUpload) btnUpload.innerHTML = dict.btn_upload;
    if (btnOpenReport) btnOpenReport.innerHTML = dict.btn_open_report;
    if (btnDownloadBinary) btnDownloadBinary.innerHTML = dict.btn_download_binary;
    if (btnDownloadPdf) btnDownloadPdf.innerHTML = dict.btn_download_pdf;
    const labelPrompt = byId("ai-label-prompt");
    if (labelPrompt) labelPrompt.textContent = dict.label_prompt;
    const promptToggle = byId("ai-prompt-toggle");
    if (promptToggle) promptToggle.textContent = dict.prompt_toggle;
    if (elPrompt) elPrompt.placeholder = dict.prompt_placeholder;
    if (btnAnalyze) btnAnalyze.innerHTML = dict.btn_analyze;
    const resultTitle = byId("ai-result-title");
    if (resultTitle) resultTitle.innerHTML = dict.result_title;
    if (elResult) {
      const cur = (elResult.textContent || "").trim();
      const knownEmpty = new Set([I18N.zh.result_empty, I18N.en.result_empty]);
      if (!cur || knownEmpty.has(cur)) elResult.textContent = dict.result_empty;
    }
    const footerText = byId("ai-footer-text");
    if (footerText) footerText.textContent = dict.footer_title;
    const footerCopy = byId("ai-footer-copy");
    if (footerCopy) {
      const year = new Date().getFullYear();
      const tpl = dict.footer_copy || I18N.zh.footer_copy;
      footerCopy.textContent = tpl.replaceAll("{year}", String(year));
    }
    const footerVersion = byId("ai-footer-version-label");
    if (footerVersion) footerVersion.textContent = dict.footer_version;

    // Navbar controls + misc
    if (btnToggleLang) btnToggleLang.textContent = dict.lang_btn;
    if (btnToggleTheme) btnToggleTheme.title = dict.theme_btn_title;
    if (btnLogout) btnLogout.title = dict.logout_title;
    const refreshBtn = byId("ai-btn-refresh-tasks");
    if (refreshBtn) refreshBtn.title = dict.refresh_title;
    if (btnLogToggle) btnLogToggle.textContent = dict.log_toggle;

    // File name placeholder
    if (elFileName) {
      const cur = (elFileName.textContent || "").trim();
      const known = new Set([I18N.zh.file_none, I18N.en.file_none]);
      if (!cur || known.has(cur)) elFileName.textContent = dict.file_none;
    }
    // Idle meta placeholder
    if (elMainMeta) {
      const cur = (elMainMeta.textContent || "").trim();
      const known = new Set([I18N.zh.meta_idle, I18N.en.meta_idle]);
      if (!cur || known.has(cur)) elMainMeta.textContent = dict.meta_idle;
    }
    // Logs placeholder
    if (elScanLogs) {
      const cur = (elScanLogs.textContent || "").trim();
      const known = new Set([I18N.zh.logs_empty, I18N.en.logs_empty]);
      if (!cur || known.has(cur)) elScanLogs.textContent = dict.logs_empty;
    }

    // Status line placeholder (selection messages)
    if (elStatus) {
      const cur = (elStatus.textContent || "").trim();
      const known = new Map([
        [I18N.zh.status_selected, dict.status_selected],
        [I18N.en.status_selected, dict.status_selected],
        [I18N.zh.status_unselected, dict.status_unselected],
        [I18N.en.status_unselected, dict.status_unselected],
      ]);
      const next = known.get(cur);
      if (next) elStatus.textContent = next;
    }

    localStorage.setItem("ai_portal_lang", lang);
  }

  function applyTheme(theme) {
    const body = document.body;
    if (theme === "light") {
      body.classList.add("ai-theme-light");
      if (elThemeIcon) elThemeIcon.className = "fas fa-sun";
    } else {
      body.classList.remove("ai-theme-light");
      if (elThemeIcon) elThemeIcon.className = "fas fa-moon";
      theme = "dark";
    }
    localStorage.setItem("ai_portal_theme", theme);
  }

  async function postForm(url, data) {
    const form = new URLSearchParams();
    Object.entries(data).forEach(([k, v]) => form.append(k, v));
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-CSRFToken": csrfToken,
        "X-Requested-With": "XMLHttpRequest",
      },
      body: form.toString(),
    });
    const json = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, json };
  }

  async function refreshTasks() {
    const r = await fetch("/ai/recent_scans/", {
      method: "GET",
      headers: {
        "X-Requested-With": "XMLHttpRequest",
      },
    });
    if (!r.ok) {
      elTasks.innerHTML = `<div class="p-3 text-muted">${tf("tasks_load_fail", { status: r.status })}</div>`;
      return;
    }
    const payload = await r.json().catch(() => ({}));
    const tasks = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.content)
        ? payload.content
        : [];
    if (tasks.length === 0) {
      elTasks.innerHTML = `<div class="p-3 text-muted">${t("tasks_empty")}</div>`;
      return;
    }
    const top = tasks.slice(0, 25);
    const noIconUrl = (window.__AI_PORTAL__ && window.__AI_PORTAL__.noIconUrl) || "/static/img/no_icon.png";
    elTasks.innerHTML = top
      .map((task) => {
        const hash = (task.MD5 || task.md5 || task.checksum || "").toString();
        const file = (task.FILE_NAME || task.file_name || "").toString();
        const app = (task.APP_NAME || task.app_name || "").toString();
        const tsRaw = (task.TIMESTAMP || task.timestamp || "").toString();
        const ts = tsRaw ? formatLocalTimestamp(tsRaw) : "";
        const iconPath = (task.ICON_PATH || "").toString();
        const iconSrc = iconPath ? `/download/${iconPath}` : noIconUrl;
        return `
          <div class="ai-task-item" data-hash="${hash}">
            <button class="ai-task-del" type="button" title="${t("delete_title")}" aria-label="${t("delete_title")}" data-hash="${hash}">
              <i class="fas fa-trash"></i>
            </button>
            <img class="ai-task-icon" src="${iconSrc}" alt="" onerror="this.onerror=null;this.src='${noIconUrl}'" />
            <div class="ai-task-body">
              <div class="ai-task-title">${app && app !== "None" ? app : file || t("record_fallback")}</div>
              <div class="ai-task-meta">
                ${ts ? `<span class="ai-pill"><i class="fas fa-clock"></i> ${ts}</span>` : ""}
              </div>
            </div>
          </div>
        `;
      })
      .join("");

    // Delete button handler (stop bubbling to selection)
    elTasks.querySelectorAll(".ai-task-del").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const hash = btn.getAttribute("data-hash") || "";
        if (!/^[0-9a-f]{32}$/i.test(hash)) return;
        if (!window.confirm(t("delete_confirm"))) return;
        setStatus(t("delete_title") + "…");
        const r = await postForm("/delete_scan/", { md5: hash });
        const msg = (r.json && (r.json.deleted || r.json.error || r.json.message)) ? (r.json.deleted || r.json.error || r.json.message) : "";
        if (r.ok && (msg === "yes" || msg.toLowerCase?.() === "yes")) {
          // If we deleted the selected task, clear selection and AI result.
          if ((elHash.value || "").trim().toLowerCase() === hash.toLowerCase()) {
            elHash.value = "";
            enableForHash("");
            stopPolling();
            syncUploadVisibility();
            if (elResult) elResult.textContent = t("result_empty");
            if (elResultMeta) elResultMeta.textContent = "";
          }
          // Remove from DOM and refresh list
          const row = btn.closest(".ai-task-item");
          if (row) row.remove();
          setStatus(t("delete_success"));
          setTimeout(refreshTasks, 400);
        } else {
          setStatus(tf("delete_failed", { msg: msg || `HTTP ${r.status}` }));
        }
      });
    });

    elTasks.querySelectorAll(".ai-task-item").forEach((row) => {
      row.addEventListener("click", () => {
        const hash = row.getAttribute("data-hash");
        if (!hash) return;
        const current = getSelectedTaskHash();
        if (current === hash) {
          row.classList.remove(SELECTED_CLASS);
          elHash.value = "";
          enableForHash("");
          setStatus(t("status_unselected"));
          stopPolling();
          syncUploadVisibility();
          return;
        }
        setTaskSelection(hash);
        elHash.value = hash;
        enableForHash(hash);
        setStatus(t("status_selected"));
        startPolling(hash);
        syncUploadVisibility();
      });
    });
    const curHash = (elHash.value || "").trim();
    if (/^[0-9a-f]{32}$/i.test(curHash)) setTaskSelection(curHash);
  }

  // Auto-refresh recent tasks (detect new/updated tasks)
  let tasksAutoTimer = null;
  let lastTasksSignature = "";
  function tasksSignature(tasks) {
    try {
      return tasks
        .slice(0, 25)
        .map((task) => {
          const md5 = task.MD5 || task.md5 || task.checksum || "";
          const ts = task.TIMESTAMP || task.timestamp || "";
          const app = task.APP_NAME || task.app_name || "";
          const icon = task.ICON_PATH || "";
          return `${md5}:${ts}:${app}:${icon}`;
        })
        .join("|");
    } catch (_) {
      return "";
    }
  }

  async function refreshTasksIfChanged() {
    const r = await fetch("/ai/recent_scans/", {
      method: "GET",
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    if (!r.ok) return;
    const payload = await r.json().catch(() => ({}));
    const tasks = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.content)
        ? payload.content
        : [];
    const sig = tasksSignature(tasks);
    if (sig && sig === lastTasksSignature) return;
    lastTasksSignature = sig;
    await refreshTasks();
  }

  function startTasksAutoRefresh() {
    if (tasksAutoTimer) return;
    tasksAutoTimer = setInterval(() => {
      if (document.hidden) return;
      refreshTasksIfChanged();
    }, 4000);
  }
  function stopTasksAutoRefresh() {
    if (!tasksAutoTimer) return;
    clearInterval(tasksAutoTimer);
    tasksAutoTimer = null;
  }

  // Force-refresh Recent Tasks while analyzing (name/icon often update mid-scan)
  let analyzeRefreshTimer = null;
  function startAnalyzeTasksRefresh() {
    if (analyzeRefreshTimer) return;
    analyzeRefreshTimer = setInterval(() => {
      if (document.hidden) return;
      if (!isAnalyzing) return;
      refreshTasks();
    }, 2000);
  }
  function stopAnalyzeTasksRefresh() {
    if (!analyzeRefreshTimer) return;
    clearInterval(analyzeRefreshTimer);
    analyzeRefreshTimer = null;
  }

  let pollTimer = null;
  async function pollStatusOnce(hash) {
    const r = await postForm("/ai/status/", { hash });
    if (!r.ok) return;
    const logs = Array.isArray(r.json.logs) ? r.json.logs : [];
    const last = r.json.last || {};
    const lastMsg = (last.status || "").toString();
    const lastTsRaw = (last.timestamp || "").toString();
    const lastTs = lastTsRaw ? formatLocalTimestamp(lastTsRaw) : "";

    if (elScanLogs) {
      const tail = logs.slice(-60).map((x) => {
        const ts = x.timestamp ? `[${formatLocalTimestamp(x.timestamp)}] ` : "";
        const st = x.status || "";
        return `${ts}${st}`;
      });
      elScanLogs.textContent = tail.length ? tail.join("\n") : t("logs_empty");
    }

    // Best-effort progress estimation from common stage keywords.
    let pct = 5;
    const s = lastMsg.toLowerCase();
    if (!lastMsg) pct = 5;
    else if (s.includes("saving to database")) pct = 100;
    else if (s.includes("queued")) pct = 8;
    else if (s.includes("apk with androguard")) pct = 10;
    else if (s.includes("extracting apk features")) pct = 12;
    else if (s.includes("getting hardcoded certificates")
      || s.includes("parsing androidmanifest")) pct = 20;
    else if (s.includes("extracting manifest data")
      || s.includes("manifest analysis started")) pct = 25;
    else if (s.includes("performing static analysis on")) pct = 35;
    else if (s.includes("library binary analysis started")) pct = 35;
    else if (s.includes("analyzing assets/")) pct = 40;
    else if (s.includes("running apkid")) pct = 50;
    else if (s.includes("detecting trackers")) pct = 55;
    else if (s.includes("decompiling apk to java")) pct = 60;
    else if (s.includes("decompil")) pct = 65;
    else if (s.includes("smali")) pct = 70;
    else if (s.includes("code analysis") || s.includes("static analysis")) pct = 80;
    else if (s.includes("report")) pct = 85;
    else if (s.includes("completed") || s.includes("success")) pct = 100;

    // Never let progress bar move backwards within a scan,
    // but keep APKiD 阶段“锁定”在 50%，营造清晰的中间节点感。
    if (!s.includes("running apkid")) {
      pct = Math.max(pct, mainPctValue);
    } else {
      pct = 50;
    }

    const label = lastMsg
      ? `${lastTs ? lastTs + " • " : ""}${lastMsg}`
      : t("wait_scan_logs");
    setMainProgress(
      pct,
      pct >= 100
        ? tf("progress_done", { label })
        : tf("progress_running", { label })
    );

    // 当分析完成时，解锁下方所有基于结果的按钮，并立即刷新最近任务
    if (pct >= 100) {
      isAnalyzing = false;
      enableForHash(hash);
      // Force refresh so name/icon updates show up immediately.
      refreshTasks();
      stopAnalyzeTasksRefresh();
    }
  }

  function startPolling(hash) {
    if (!/^[0-9a-f]{32}$/i.test(hash)) return;
    if (pollTimer) clearInterval(pollTimer);
    isAnalyzing = true;
    startAnalyzeTasksRefresh();
    // Reset UI for a new scan poll session
    setMainProgress(0, t("wait_start"));
    if (elScanLogs) elScanLogs.textContent = t("logs_empty");
    // Immediate + interval
    pollStatusOnce(hash);
    pollTimer = setInterval(() => pollStatusOnce(hash), 1500);
  }
  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    isAnalyzing = false;
    stopAnalyzeTasksRefresh();
  }

  function uploadAndAnalyze(file) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/upload/", true);
      xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
      xhr.setRequestHeader("X-CSRFToken", csrfToken);

      xhr.upload.addEventListener(
        "progress",
        (event) => {
          if (!event.lengthComputable) return;
          setMainProgress(
            Math.round((event.loaded / event.total) * 100),
            t("uploading")
          );
        },
        false
      );

      xhr.onload = () => {
        try {
          const json = JSON.parse(xhr.responseText || "{}");
          if (xhr.status >= 200 && xhr.status < 300) resolve(json);
          else reject(json);
        } catch (e) {
          reject({ error: "Upload failed (bad response)." });
        }
      };
      xhr.onerror = () => reject({ error: "Upload failed." });
      xhr.onabort = () => reject({ error: "Upload aborted." });

      const formdata = new FormData();
      formdata.append("file", file);
      xhr.send(formdata);
    });
  }

  async function runAi(force) {
    const hash = currentHash();
    if (!/^[0-9a-f]{32}$/i.test(hash)) {
      setStatus(t("md5_invalid"));
      return;
    }
    // Show waiting state while AI is running
    setStatus(t("ai_running"));
    hasAiResult = false;
    if (btnDownloadAI) btnDownloadAI.disabled = true;
    if (elResult) {
      elResult.classList.add("ai-result-loading");
      elResult.innerHTML =
        currentLang() === "en"
          ? "<p>AI analysis in progress, this may take up to a few minutes depending on network and model load...</p>"
          : "<p>AI 分析进行中，根据网络和模型负载可能需要数分钟，请耐心等待……</p>";
    }
    if (elResultMeta) {
      elResultMeta.textContent =
        currentLang() === "en"
          ? "Waiting for AI response…"
          : "正在等待 AI 返回结果…";
    }
    btnAnalyze.disabled = true;
    try {
      // Use streaming endpoint so that content appears incrementally.
      const form = new FormData();
      form.append("hash", hash);
      form.append("prompt", elPrompt.value || "");
      form.append("force", force ? "1" : "0");
      form.append("lang", currentLang());
      if (csrfToken) form.append("csrfmiddlewaretoken", csrfToken);

      const resp = await fetch("/ai/stream/", {
        method: "POST",
        body: form,
      });
      if (!resp.ok || !resp.body) {
        const msg =
          (currentLang() === "en"
            ? "AI analysis failed (HTTP " + resp.status + ")."
            : "AI 分析失败 (HTTP " + resp.status + ")。");
        elResult.innerHTML = "<p>" + escapeHtml(msg) + "</p>";
        elResultMeta.textContent = "";
        setStatus(t("ai_failed"));
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let fullText = "";

      // Stream chunks from server and append to result as they arrive.
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (chunk) {
          fullText += chunk;
          elResult.innerHTML = renderMarkdownToHtml(fullText);
        }
      }

      if (!fullText) {
        elResult.innerHTML =
          currentLang() === "en"
            ? "<p>(empty result)</p>"
            : "<p>AI 结果为空。</p>";
        setStatus(t("ai_failed"));
        elResultMeta.textContent = "";
        return;
      }

      // Meta information is not streamed; we at least indicate completion.
      elResultMeta.textContent =
        currentLang() === "en"
          ? "AI analysis completed (streaming)."
          : "AI 分析已完成（流式结果）。";

      // Backend will cache the final text, so enable download (only after
      // full streaming is complete).
      hasAiResult = true;
      enableForHash(hash);
      setStatus(t("ai_done"));
    } catch (e) {
      const msg =
        currentLang() === "en"
          ? "AI analysis failed: " + e
          : "AI 分析失败：" + e;
      elResult.innerHTML = "<p>" + escapeHtml(msg) + "</p>";
      elResultMeta.textContent = "";
      setStatus(t("ai_failed"));
    } finally {
      if (elResult) {
        elResult.classList.remove("ai-result-loading");
      }
      btnAnalyze.disabled = false;
    }
  }

  // Wire up UI
  elHash.addEventListener("input", () => enableForHash(currentHash()));

  function resetForNewUpload() {
    // Treat as a brand-new task: clear selected MD5 & selection, stop polling,
    // reset progress, status and logs.
    elHash.value = "";
    setTaskSelection(null);
    stopPolling();
    isAnalyzing = false;
    setMainProgress(0, t("meta_idle"));
    if (elMainPct) elMainPct.textContent = "0%";
    if (elScanLogs) elScanLogs.textContent = t("logs_empty");
    if (elStatus) elStatus.textContent = "";
    enableForHash("");
    syncUploadVisibility();
  }

  elFile?.addEventListener("change", () => {
    const file = elFile.files?.[0];
    if (!file) return;
    resetForNewUpload();
    setSelectedFile(file);
    enableForHash(currentHash());
    syncUploadVisibility();
  });

  function openFilePicker() {
    elFile?.click();
  }

  elDropzone?.addEventListener("click", openFilePicker);
  elDropzone?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openFilePicker();
    }
  });

  ["dragenter", "dragover"].forEach((evt) => {
    elDropzone?.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      elDropzone.classList.add("ai-dropzone-active");
    });
  });
  ["dragleave", "dragend", "drop"].forEach((evt) => {
    elDropzone?.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      elDropzone.classList.remove("ai-dropzone-active");
    });
  });
  elDropzone?.addEventListener("drop", (e) => {
    const files = e.dataTransfer?.files;
    if (!files || files.length < 1) return;
    const file = files[0];
    // Assign file to input (supported in modern browsers)
    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      elFile.files = dt.files;
    } catch (_) {
      // If assignment isn't supported, we still keep reference for UI only.
    }
    resetForNewUpload();
    setSelectedFile(file);
    enableForHash(currentHash());
    syncUploadVisibility();
  });

  btnUpload.addEventListener("click", async () => {
    const file = elFile.files?.[0];
    if (!file) {
      setMainProgress(0, t("pick_file_first"));
      return;
    }
    // 整个上传 + 分析期间，下面依赖结果的按钮都禁用
    isAnalyzing = true;
    enableForHash(currentHash());
    setMainProgress(0, t("uploading_start"));
    // Frontend phase log: upload started
    if (elScanLogs) elScanLogs.textContent = "";
    appendClientLog(t("uploading_start"));
    btnUpload.disabled = true;
    try {
      const json = await uploadAndAnalyze(file);
      if (json.status === "error") {
        const msg = json.description || t("upload_failed");
        setMainProgress(0, msg);
        appendClientLog(msg);
        return;
      }
      const hash = json.hash;
      elHash.value = hash;
      enableForHash(hash);
      const doneMsg = tf("upload_done_start", { hash });
      setMainProgress(100, doneMsg);
      appendClientLog(doneMsg);
      // Start forcing Recent Tasks refresh early (until analysis completes)
      startAnalyzeTasksRefresh();
      // Small pause before kicking off heavy analysis to make UI feel smoother.
      await new Promise((resolve) => setTimeout(resolve, 2000));
      // Kick off static analysis but do not block on completion; we want to
      // start polling logs immediately so progress/logs feel realtime.
      const scanPromise = postForm("/ai/scan/", { hash });
      appendClientLog(currentLang() === "en" ? "Scan started. Opening live logs…" : "扫描已启动，正在打开实时日志…");
      startPolling(hash);
      // Best-effort error reporting when analysis request completes.
      scanPromise.then((scan) => {
        if (!scan.ok) {
          const err = scan.json?.error || tf("scan_start_failed", { status: scan.status });
          setMainProgress(100, err);
          appendClientLog(err);
        }
      }).catch(() => {
        const err = tf("scan_start_failed", { status: "network" });
        appendClientLog(err);
      });
      // Refresh task list shortly after enqueue/start.
      setTimeout(refreshTasks, 800);
    } catch (e) {
      const msg = e?.error || t("upload_failed");
      setMainProgress(0, msg);
      appendClientLog(msg);
    } finally {
      // 如果此时还没有进入轮询阶段（例如上传或启动分析失败），解除禁用；
      // 否则保持 isAnalyzing=true，直到轮询检测到分析完成。
      if (!pollTimer) {
        isAnalyzing = false;
      }
      enableForHash(currentHash());
    }
  });

  btnOpenReport.addEventListener("click", () => {
    const hash = currentHash();
    if (!/^[0-9a-f]{32}$/i.test(hash)) return;
    window.open(staticReportUrl(hash), "_blank", "noopener");
  });

  btnDownloadBinary.addEventListener("click", () => {
    const hash = currentHash();
    if (!/^[0-9a-f]{32}$/i.test(hash)) return;
    // Show action feedback at progress meta line.
    const prev = elMainMeta ? elMainMeta.textContent : "";
    if (elMainMeta) elMainMeta.textContent = t("download_bin_preparing");
    // Avoid duplicated status lines; keep only the progress meta line.
    if (elStatus) elStatus.textContent = "";
    window.open(downloadBinaryUrl(hash), "_blank", "noopener");
    // Restore meta shortly (avoid leaving action text).
    setTimeout(() => {
      if (elMainMeta) elMainMeta.textContent = prev || t("meta_idle");
    }, 1200);
  });

  btnDownloadPdf.addEventListener("click", async () => {
    const hash = currentHash();
    if (!/^[0-9a-f]{32}$/i.test(hash)) return;
    // Stop polling so scan progress/logs don't overwrite PDF status.
    stopPolling();
    const prev = elMainMeta ? elMainMeta.textContent : "";
    if (elMainMeta) elMainMeta.textContent = t("pdf_generating");
    // Avoid duplicated status lines; keep only the progress meta line.
    if (elStatus) elStatus.textContent = "";
    try {
      const r = await fetch(downloadPdfUrl(hash), { credentials: "same-origin" });
      const ct = r.headers.get("content-type") || "";
      if (r.ok && ct.indexOf("application/pdf") !== -1) {
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = (hash || "report") + ".pdf";
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        if (elMainMeta) elMainMeta.textContent = t("pdf_started");
        if (elStatus) elStatus.textContent = "";
        setTimeout(() => {
          if (elMainMeta) elMainMeta.textContent = prev || t("meta_idle");
        }, 1500);
        return;
      }
      const text = await r.text();
      let msg = t("pdf_failed");
      try {
        const j = JSON.parse(text);
        if (j.pdf_error) msg = j.pdf_error;
        if (j.err_details && (j.err_details + "").indexOf("wkhtmltopdf") !== -1) {
          msg = t("wkhtmltopdf_missing");
        }
      } catch (_) {}
      if (elMainMeta) elMainMeta.textContent = msg;
      if (elStatus) elStatus.textContent = "";
      if (elResult) elResult.textContent = msg;
    } catch (e) {
      const msg = tf("pdf_req_failed", { err: e.message || "Network error" });
      if (elMainMeta) elMainMeta.textContent = msg;
      if (elStatus) elStatus.textContent = "";
    }
  });

  btnAnalyze.addEventListener("click", () => runAi(false));

  btnDownloadAI.addEventListener("click", () => {
    const hash = currentHash();
    window.open(downloadAiUrl(hash), "_blank", "noopener");
  });

  btnRefreshTasks.addEventListener("click", refreshTasks);

  btnToggleLang?.addEventListener("click", () => {
    const cur = localStorage.getItem("ai_portal_lang") || "zh";
    const next = cur === "zh" ? "en" : "zh";
    applyLang(next);
  });
  btnToggleTheme?.addEventListener("click", () => {
    const cur = localStorage.getItem("ai_portal_theme") || "dark";
    const next = cur === "dark" ? "light" : "dark";
    applyTheme(next);
  });

  // Initial
  applyTheme(localStorage.getItem("ai_portal_theme") || "dark");
  applyLang(localStorage.getItem("ai_portal_lang") || "zh");
  enableForHash(currentHash());
  refreshTasks();
  startTasksAutoRefresh();
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopTasksAutoRefresh();
    else {
      startTasksAutoRefresh();
      refreshTasksIfChanged();
    }
  });
  setMainProgress(0, t("meta_idle"));
  setSelectedFile(elFile?.files?.[0]);
})();

