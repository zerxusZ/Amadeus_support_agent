@echo off
cd /d "%~dp0.."
echo Starting Fish Audio TTS proxy (default http://127.0.0.1:8787) ...
echo Leave this window open while using Fish TTS from the browser.
node scripts/fish-audio-proxy.mjs
pause
