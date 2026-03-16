from django.conf import settings


def portal_flags(request):
  """Expose portal-only flag to templates."""
  return {
      'portal_only': getattr(settings, 'PORTAL_ONLY', False),
  }

