(() => {
  const path = (location && location.pathname) || "";
  const isStatic =
    path.startsWith("/static_analyzer") ||
    path.startsWith("/static_analyzer_ios") ||
    path.startsWith("/static_analyzer_windows") ||
    path.startsWith("/appsec_dashboard");
  if (!isStatic) return;

  const lang = localStorage.getItem("ai_portal_lang") || "zh";
  if (lang !== "zh") return;

  const MAP = {
    // Sidebar header
    "Static Analyzer": "静态分析",

    // Top-level sidebar items
    Information: "基本信息",
    "Scan Options": "扫描选项",
    "SCAN OPTIONS": "扫描选项",
    "Signer Certificate": "签名证书",
    "SIGNER CERTIFICATE": "签名证书",
    Permissions: "权限",
    "Android API": "Android API",
    "Browsable Activities": "可浏览 Activity",
    "Security Analysis": "安全分析",
    "Binary Analysis": "二进制分析",
    "Malware Analysis": "恶意软件分析",
    "Malware Lookup": "恶意软件查询",
    "MALWARE LOOKUP": "恶意软件查询",
    "APKiD Analysis": "APKiD 分析",
    "APKiD ANALYSIS": "APKiD 分析",
    "Behaviour Analysis": "行为分析",
    "BEHAVIOUR ANALYSIS": "行为分析",
    "Abused Permissions": "滥用权限",
    "ABUSED PERMISSIONS": "滥用权限",
    "Server Locations": "服务器位置",
    "SERVER LOCATIONS": "服务器位置",
    "Domain Malware Check": "恶意域名检测",
    "DOMAIN MALWARE CHECK": "恶意域名检测",
    Reconnaissance: "侦察信息",
    Components: "组件",
    Libraries: "依赖库",
    Files: "文件",
    Activities: "Activities",
    "Broadcast Receivers": "广播接收器",
    "Content Providers": "内容提供器",
    Services: "服务",
    "PDF Report": "PDF 报告",
    SBOM: "SBOM",

    // Security Analysis sub-items
    "Network Security": "网络安全",
    "Certificate Analysis": "证书分析",
    "Manifest Analysis": "清单（Manifest）分析",
    "Code Analysis": "代码分析",
    "NIAP Analysis": "NIAP 分析",
    "File Analysis": "文件分析",
    "DECOMPILED CODE": "反编译代码",
    "Decompiled Code": "反编译代码",
    Strings: "字符串",
    "Hardcoded Secrets": "硬编码敏感信息",
    "Firebase DB": "Firebase 数据库",
    Trackers: "追踪器",
    APKiD: "APKiD",
    "Exported Components": "导出组件",
    "URL & Domain": "URL 与域名",
    "Dynamic Analysis Report": "动态分析报告",

    // Report headings / bold labels (common across reports)
    "APP SCORES": "应用评分",
    "FILE INFORMATION": "文件信息",
    "APP INFORMATION": "应用信息",
    "VIEW ALL": "查看全部",
    "View All": "查看全部",
    "Exported Activities": "导出 Activity",
    "EXPORTED ACTIVITIES": "导出 Activity",
    "Exported Services": "导出服务",
    "EXPORTED SERVICES": "导出服务",
    "Exported Receivers": "导出广播接收器",
    "EXPORTED RECEIVERS": "导出广播接收器",
    "Exported Providers": "导出内容提供器",
    "EXPORTED PROVIDERS": "导出内容提供器",

    "Security Score": "安全评分",
    "Average CVSS": "平均 CVSS",
    "Trackers Detection": "追踪器检测",
    "VirusTotal Detection": "VirusTotal 检测",
    "MobSF Scorecard": "安全评分卡",

    // File info
    "File Name": "文件名",
    Size: "大小",
    MD5: "MD5",
    "SHA-1": "SHA-1",
    SHA1: "SHA-1",
    "SHA-256": "SHA-256",
    SHA256: "SHA-256",

    // App info
    "App Name": "应用名称",
    "Package Name": "包名",
    "Main Activity": "主 Activity",
    "Target SDK": "目标 SDK",
    "Min SDK": "最低 SDK",
    "Max SDK": "最高 SDK",
    "Android Version Name": "Android 版本名",
    "Android Version Code": "Android 版本号",

    // More section headings / titles (Android static analyzer)
    "PLAYSTORE INFORMATION": "Play 商店信息",
    "Playstore Information": "Play 商店信息",
    "APPLICATION PERMISSIONS": "应用权限",
    "ANDROID API": "Android API",
    "BROWSABLE ACTIVITIES": "可浏览 Activity",
    "NETWORK SECURITY": "网络安全",
    "CERTIFICATE ANALYSIS": "证书分析",
    "MANIFEST ANALYSIS": "清单（Manifest）分析",
    "CODE ANALYSIS": "代码分析",
    "SHARED LIBRARY BINARY ANALYSIS": "共享库二进制分析",
    "NIAP ANALYSIS v1.3": "NIAP 分析 v1.3",
    "FILE ANALYSIS": "文件分析",
    "FIREBASE DATABASE ANALYSIS": "Firebase 数据库分析",
    "VIRUSTOTAL SCAN": "VirusTotal 扫描",
    URLS: "URL 列表",
    EMAILS: "邮箱地址",
    TRACKERS: "追踪器",
    "POSSIBLE HARDCODED SECRETS": "疑似硬编码敏感信息",
    STRINGS: "字符串",
    SYMBOLS: "符号表",
    ACTIVITIES: "Activities",
    SERVICES: "服务",
    RECEIVERS: "广播接收器",
    PROVIDERS: "内容提供器",
    LIBRARIES: "依赖库",
    FILES: "文件",

    // Scan options / decompile actions (buttons)
    Rescan: "重新扫描",
    "Manage Suppressions": "管理抑制规则",
    "Start Dynamic Analysis": "启动动态分析",
    "Scan Logs": "扫描日志",
    "View AndroidManifest.xml": "查看 AndroidManifest.xml",
    "View Source": "查看源码",
    "View Smali": "查看 Smali",
    "Download Java Code": "下载 Java 代码",
    "Download Smali Code": "下载 Smali 代码",
    "Download APK": "下载 APK",

    // Table headers / common labels
    PERMISSION: "权限",
    STATUS: "状态",
    INFO: "信息",
    DESCRIPTION: "描述",
    "CODE MAPPINGS": "代码映射",
    FILE: "文件",
    FILES: "文件",
    ACTIVITY: "Activity",
    INTENT: "Intent",
    SCOPE: "范围",
    SEVERITY: "严重性",
    TITLE: "标题",
    ISSUE: "问题",
    OPTIONS: "操作",
    STANDARDS: "标准",
    "SHARED OBJECT": "共享对象",
    "STACK CANARY": "栈保护",
    RELRO: "RELRO",
    RPATH: "RPATH",
    RUNPATH: "RUNPATH",
    FORTIFY: "FORTIFY",
    "SYMBOLS STRIPPED": "符号已剥离",
    IDENTIFIER: "标识符",
    REQUIREMENT: "要求",
    FEATURE: "特性",
    DETECTIONS: "检测结果",
    FINDINGS: "发现项",
    DETAILS: "详情",
    "RULE ID": "规则 ID",
    BEHAVIOUR: "行为",
    LABEL: "标签",
    DETECTION: "检测",
    DOMAIN: "域名",
    "COUNTRY/REGION": "国家/地区",
    GEOLOCATION: "地理位置",
    "TRACKER NAME": "追踪器名称",
    CATEGORIES: "分类",

    // Misc bold lines that appear in report
    "APKiD not enabled.": "未启用 APKiD。",

    // Pagination / navigation
    Previous: "上一页",
    Next: "下一页",
    First: "首页",
    Last: "末页",
    PREVIOUS: "上一页",
    NEXT: "下一页",
    FIRST: "首页",
    LAST: "末页",
  };

  function norm(s) {
    return String(s || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function translateElementText(el) {
    if (!el) return;
    // Translate only the text node(s), keep icon/arrow child elements intact.
    const nodes = Array.from(el.childNodes || []);
    const textNode = nodes.find((n) => n && n.nodeType === Node.TEXT_NODE && norm(n.nodeValue));
    if (!textNode) return;
    const raw = norm(textNode.nodeValue);
    const v = MAP[raw];
    if (!v) return;
    textNode.nodeValue = textNode.nodeValue.replace(raw, v);
  }

  function run() {
    // Focus translations to sidebar to avoid touching report content/code snippets.
    const root = document.querySelector(".main-sidebar") || document.body;
    root.querySelectorAll(".user-panel .d-block, .nav-sidebar p").forEach((el) => {
      translateElementText(el);
    });
    // Some themes put plain text directly inside <a> (rare). Handle leaf anchors too.
    root.querySelectorAll(".nav-sidebar a").forEach((a) => {
      if (a.querySelector("p")) return;
      translateElementText(a);
    });

    // Translate report bold labels/headings in content area.
    const content = document.querySelector(".content-wrapper") || document.body;
    const skipSel = "pre, code, textarea, .CodeMirror, .ace_editor";
    const nodes = content.querySelectorAll(
      "h1,h2,h3,h4,h5,h6,strong,b,th,label,.card-title,.info-box-text,.small-box h3,.small-box p,.badge,.text-bold"
    );
    nodes.forEach((el) => {
      if (!el || (el.closest && el.closest(skipSel))) return;
      translateElementText(el);
    });

    // Translate common action buttons (Scan options / Decompiled code etc.)
    content.querySelectorAll("a.btn, button.btn").forEach((el) => {
      if (!el || (el.closest && el.closest(skipSel))) return;
      translateElementText(el);
    });

    // Pagination buttons (often inside <a> or <span>)
    content.querySelectorAll(".pagination a, .pagination span, .dataTables_paginate a, .dataTables_paginate span").forEach((el) => {
      if (!el || (el.closest && el.closest(skipSel))) return;
      translateElementText(el);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      run();
      // Re-run a few times to catch elements (like pagination) created after load.
      setTimeout(run, 300);
      setTimeout(run, 1000);
      setTimeout(run, 2500);
    });
  } else {
    run();
    setTimeout(run, 300);
    setTimeout(run, 1000);
    setTimeout(run, 2500);
  }
})();

