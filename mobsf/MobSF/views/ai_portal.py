from django.shortcuts import render

from mobsf.MobSF import settings
from mobsf.MobSF.views.authentication import login_required


@login_required
def ai_portal(request):
    context = {
        'title': 'AI Portal',
        'version': settings.MOBSF_VER,
    }
    return render(request, 'general/ai_portal.html', context)

