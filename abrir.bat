@echo off
rem Abre a apresentacao: sobe o servidor local na pasta JJ e abre o navegador.
cd /d "%~dp0.."
start "JogoJusto - servidor (feche esta janela para encerrar)" /min python -m http.server 8765 --bind 127.0.0.1
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8765/cidade/index.html"
