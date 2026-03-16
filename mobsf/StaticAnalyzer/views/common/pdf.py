# -*- coding: utf_8 -*-
"""
Shared Functions.

PDF Generation
"""
import json
import logging
import os
import platform

from django.http import HttpResponse
from django.template.loader import get_template

import mobsf.MalwareAnalyzer.views.VirusTotal as VirusTotal
from mobsf.MobSF import settings
from mobsf.MobSF.utils import (
    is_md5,
    print_n_send_error_response,
    upstream_proxy,
)
from mobsf.StaticAnalyzer.models import (
    RecentScansDB,
    StaticAnalyzerAndroid,
    StaticAnalyzerIOS,
    StaticAnalyzerWindows,
)
from mobsf.StaticAnalyzer.views.common.appsec import (
    get_android_dashboard,
    get_ios_dashboard,
)
from mobsf.StaticAnalyzer.views.common.shared_func import (
    get_avg_cvss,
)
from mobsf.StaticAnalyzer.views.android.db_interaction import (
    get_context_from_db_entry as adb)
from mobsf.StaticAnalyzer.views.ios.db_interaction import (
    get_context_from_db_entry as idb)
from mobsf.StaticAnalyzer.views.windows.db_interaction import (
    get_context_from_db_entry as wdb)
from mobsf.MobSF.views.authentication import (
    login_required,
)

logger = logging.getLogger(__name__)
try:
    import pdfkit
except ImportError:
    pdfkit = None
    logger.warning(
        'wkhtmltopdf is not installed/configured properly.'
        ' PDF Report Generation is disabled')
logger = logging.getLogger(__name__)
ctype = 'application/json; charset=utf-8'


def _apply_zh_pdf_i18n(html: str) -> str:
    """Best-effort PDF i18n without touching templates."""
    if not html:
        return html
    repl = [
        # Common headings
        ('FILE INFORMATION', '文件信息'),
        ('APP INFORMATION', '应用信息'),
        ('PLAYSTORE INFORMATION', 'Play 商店信息'),
        ('FINDINGS SEVERITY', '问题严重性分布'),
        ('APPLICATION PERMISSIONS', '应用权限'),
        ('BROWSABLE ACTIVITIES', '可浏览 Activity'),
        ('NETWORK SECURITY', '网络安全'),
        ('CERTIFICATE ANALYSIS', '证书分析'),
        ('CERTIFICATE INFORMATION', '证书信息'),
        ('MANIFEST ANALYSIS', '清单（Manifest）分析'),
        ('CODE ANALYSIS', '代码分析'),
        ('SHARED LIBRARY BINARY ANALYSIS', '共享库二进制分析'),
        ('NIAP ANALYSIS v1.3', 'NIAP 分析 v1.3'),
        ('VIRUSTOTAL SCAN', 'VirusTotal 扫描'),
        ('APKID ANALYSIS', 'APKiD 分析'),
        ('BEHAVIOUR ANALYSIS', '行为分析'),
        ('FIREBASE DATABASES ANALYSIS', 'Firebase 数据库分析'),
        ('FIREBASE DATABASE ANALYSIS', 'Firebase 数据库分析'),
        ('ABUSED PERMISSIONS', '滥用权限'),
        ('OFAC SANCTIONED COUNTRIES', 'OFAC 制裁国家/地区'),
        ('DOMAIN MALWARE CHECK', '恶意域名检测'),
        ('URLS', 'URL 列表'),
        ('EMAILS', '邮箱地址'),
        ('TRACKERS', '追踪器'),
        ('HARDCODED SECRETS', '硬编码敏感信息'),
        ('POSSIBLE HARDCODED SECRETS', '疑似硬编码敏感信息'),
        ('SYMBOLS', '符号表'),
        ('LIBRARIES', '依赖库'),
        ('FILES', '文件'),
        ('APP COMPONENTS', '应用组件'),
        ('XML INFORMATION', 'XML 信息'),
        ('BINARY INFORMATION', '二进制信息'),
        ('CUSTOM URL SCHEMES', '自定义 URL Scheme'),
        # Severity labels
        (' HIGH', ' 高'),
        (' MEDIUM', ' 中'),
        (' INFO', ' 信息'),
        (' SECURE', ' 安全'),
        (' HOTSPOT', ' 热点'),
        # Field labels (with colon)
        ('File Name:', '文件名：'),
        ('Size:', '大小：'),
        ('MD5:', 'MD5：'),
        ('SHA1:', 'SHA1：'),
        ('SHA256:', 'SHA256：'),
        ('App Name:', '应用名称：'),
        ('Package Name:', '包名：'),
        ('Main Activity:', '主 Activity：'),
        ('Target SDK:', '目标 SDK：'),
        ('Min SDK:', '最低 SDK：'),
        ('Max SDK:', '最高 SDK：'),
        ('Android Version Name:', 'Android 版本名：'),
        ('Android Version Code:', 'Android 版本号：'),
        ('Version:', '版本：'),
        ('Build:', '构建号：'),
        ('Publisher:', '发布者：'),
        ('Arch:', '架构：'),
        ('Scan Date:', '扫描时间：'),
        ('Identifier:', '标识符：'),
        ('SDK Name:', 'SDK 名称：'),
        ('Platform Version:', '平台版本：'),
        ('Min OS Version:', '最低系统版本：'),
        ('Supported Platforms:', '支持平台：'),
        ('Compiler Version:', '编译器版本：'),
        ('Visual Studio Version:', 'Visual Studio 版本：'),
        ('Visual Studio Edition:', 'Visual Studio 版本类型：'),
        ('Target OS:', '目标系统：'),
        ('Proj GUID:', '项目 GUID：'),
        ('Target Run:', '目标运行时：'),
        # Table headers
        ('<th>PERMISSION</th>', '<th>权限</th>'),
        ('<th>STATUS</th>', '<th>状态</th>'),
        ('<th>INFO </th>', '<th>信息</th>'),
        ('<th>DESCRIPTION</th>', '<th>描述</th>'),
        ('<th>DETECTION</th>', '<th>检测</th>'),
        ('<th>DOMAIN</th>', '<th>域名</th>'),
        ('<th>GEOLOCATION</th>', '<th>地理位置</th>'),
        ('<th>COUNTRY/REGION</th>', '<th>国家/地区</th>'),
    ]
    out = html
    for a, b in repl:
        out = out.replace(a, b)
    return out


@login_required
def pdf(request, checksum, api=False, jsonres=False):
    try:
        if pdfkit is None:
            msg = ('PDF report generation is disabled because pdfkit is not '
                   'installed. Install the Python package "pdfkit" and the '
                   '"wkhtmltopdf" binary to enable PDF reports.')
            if api:
                return {'error': msg}
            return HttpResponse(
                json.dumps({'pdf_error': msg}),
                content_type=ctype,
                status=500)
        if not is_md5(checksum):
            if api:
                return {'error': 'Invalid Hash'}
            else:
                return HttpResponse(
                    json.dumps({'md5': 'Invalid Hash'}),
                    content_type=ctype, status=500)
        # Do Lookups
        android_static_db = StaticAnalyzerAndroid.objects.filter(
            MD5=checksum)
        ios_static_db = StaticAnalyzerIOS.objects.filter(
            MD5=checksum)
        win_static_db = StaticAnalyzerWindows.objects.filter(
            MD5=checksum)

        if android_static_db.exists():
            context, template = handle_pdf_android(android_static_db)
        elif ios_static_db.exists():
            context, template = handle_pdf_ios(ios_static_db)
        elif win_static_db.exists():
            context, template = handle_pdf_win(win_static_db)
        else:
            if api:
                return {'report': 'Report not Found'}
            else:
                return HttpResponse(
                    json.dumps({'report': 'Report not Found'}),
                    content_type=ctype,
                    status=500)
        # Do VT Scan only on binaries. AI JSON consumers (api+jsonres) do not
        # need this and it can be slow, so skip VirusTotal in that path.
        context['virus_total'] = None
        if not (api and jsonres):
            ext = os.path.splitext(context['file_name'].lower())[1]
            if settings.VT_ENABLED and ext != '.zip':
                app_bin = os.path.join(
                    settings.UPLD_DIR,
                    checksum + '/',
                    checksum + ext)
                vt = VirusTotal.VirusTotal(checksum)
                context['virus_total'] = vt.get_result(app_bin)
        # Get Local Base URL
        proto = 'file://'
        host_os = 'nix'
        if platform.system() == 'Windows':
            proto = 'file:///'
            host_os = 'windows'
        context['base_url'] = proto + settings.BASE_DIR
        context['dwd_dir'] = proto + settings.DWD_DIR
        context['host_os'] = host_os
        context['timestamp'] = RecentScansDB.objects.get(
            MD5=checksum).TIMESTAMP
        # Expose portal-only flag to templates (for conditional copyright display)
        context['portal_only'] = settings.PORTAL_ONLY
        # Language hint for PDF template (default: English)
        lang = (request.GET.get('lang') or '').strip().lower()
        if lang not in ('zh', 'en'):
            lang = 'en'
        context['lang'] = lang
        context['is_zh'] = (lang == 'zh')
        try:
            if api and jsonres:
                return {'report_dat': context}
            else:
                options = {
                    'page-size': 'Letter',
                    'quiet': '',
                    'enable-local-file-access': '',
                    'no-collate': '',
                    'margin-top': '0.50in',
                    'margin-right': '0.50in',
                    'margin-bottom': '0.50in',
                    'margin-left': '0.50in',
                    'encoding': 'UTF-8',
                    'orientation': 'Landscape',
                    'custom-header': [
                        ('Accept-Encoding', 'gzip'),
                    ],
                    'no-outline': None,
                }
                # Added proxy support to wkhtmltopdf
                proxies, _ = upstream_proxy('https')
                if proxies['https']:
                    options['proxy'] = proxies['https']
                html = template.render(context)
                if context.get('is_zh'):
                    html = _apply_zh_pdf_i18n(html)
                pdf_dat = pdfkit.from_string(html, False, options=options)
                if api:
                    return {'pdf_dat': pdf_dat}
                return HttpResponse(pdf_dat,
                                    content_type='application/pdf')
        except Exception as exp:
            logger.exception('Error Generating PDF Report')
            if api:
                return {
                    'error': 'Cannot Generate PDF/JSON',
                    'err_details': str(exp)}
            else:
                err = {
                    'pdf_error': 'Cannot Generate PDF',
                    'err_details': str(exp)}
                return HttpResponse(
                    json.dumps(err),  # lgtm [py/stack-trace-exposure]
                    content_type=ctype,
                    status=500)
    except Exception as exp:
        logger.exception('Error Generating PDF Report')
        msg = str(exp)
        exp = exp.__doc__
        if api:
            return print_n_send_error_response(request, msg, True, exp)
        else:
            return print_n_send_error_response(request, msg, False, exp)


def handle_pdf_android(static_db):
    # This helper is used both for real PDF generation and for building
    # the JSON/HTML context that AI analysis consumes. The logs below
    # historically mentioned "PDF", but the same context is now reused
    # by non-PDF callers as well (e.g. AI analysis).
    logger.info(
        'Fetching data from DB for Android report context'
    )
    context = adb(static_db)
    context['average_cvss'] = get_avg_cvss(
        context['code_analysis'])
    context['appsec'] = get_android_dashboard(static_db)
    if context['file_name'].lower().endswith('.zip'):
        logger.info('Preparing Android report context for zip')
    else:
        logger.info('Preparing Android report context for apk')
    return context, get_template('pdf/android_report.html')


def handle_pdf_ios(static_db):
    logger.info('Fetching data from DB for IOS report context')
    context = idb(static_db)
    context['appsec'] = get_ios_dashboard(static_db)
    if context['file_name'].lower().endswith('.zip'):
        logger.info('Preparing IOS report context for zip')
        context['average_cvss'] = get_avg_cvss(
            context['code_analysis'])
    else:
        logger.info('Preparing IOS report context for ipa')
        context['average_cvss'] = get_avg_cvss(
            context['binary_analysis'])
    return context, get_template('pdf/ios_report.html')


def handle_pdf_win(static_db):
    logger.info(
        'Fetching data from DB for '
        'PDF Report Generation (APPX)')
    context = wdb(static_db)
    return context, get_template('pdf/windows_report.html')
