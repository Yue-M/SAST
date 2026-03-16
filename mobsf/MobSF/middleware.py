from __future__ import annotations

from typing import Iterable

from django.http import HttpResponseNotFound
from django.conf import settings


class PortalOnlyMiddleware:
    """
    When MobSF runs in PORTAL_ONLY mode, hide legacy web UI routes.

    This middleware is intentionally strict: it returns 404 for any path that
    is not required by the standalone AI portal.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    @staticmethod
    def _allowed_prefixes() -> Iterable[str]:
        return (
            '/ai/',
            '/login/',
            '/logout',
            '/change_password/',
            '/static/',
            '/admin/',
            '/favicon.ico',
            # Portal-required MobSF endpoints (XHR / downloads)
            '/upload/',
            '/download_binary/',
            '/pdf/',
            # Allow direct HTML report viewing (no embedding)
            '/static_analyzer/',
            '/static_analyzer_ios/',
            '/static_analyzer_windows/',
        )

    def __call__(self, request):
        if not getattr(settings, 'PORTAL_ONLY', False):
            return self.get_response(request)
        path = request.path or '/'
        if path == '/':
            return self.get_response(request)
        for pfx in self._allowed_prefixes():
            if path.startswith(pfx):
                return self.get_response(request)
        return HttpResponseNotFound('Not Found')

