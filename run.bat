@echo off

REM Usage:
REM   run.bat [listen_addr] [PORTAL_ONLY]
REM   listen_addr  - optional, e.g. "0.0.0.0:8000 [::]:8000"
REM   PORTAL_ONLY  - optional, 1 to enable AI-only portal, 0 for full UI

IF NOT [%1]==[] (
  SET conf=%1
) ELSE (
  SET conf="0.0.0.0:8000 [::]:8000"
)

IF NOT [%2]==[] (
  SET PORTAL_ONLY=%2
)

echo Running MobSF on %conf%
IF NOT [%PORTAL_ONLY%]==[] (
  echo PORTAL_ONLY=%PORTAL_ONLY%
)

poetry run waitress-serve --listen=%conf% --threads=10 --channel-timeout=3600 mobsf.MobSF.wsgi:application