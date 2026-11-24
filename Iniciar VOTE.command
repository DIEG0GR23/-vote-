#!/bin/zsh -l
# Doble clic para arrancar VOTE! (deja esta ventana abierta mientras lo usas)
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
[ -s "$HOME/.nvm/nvm.sh" ] && source "$HOME/.nvm/nvm.sh"
if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  No encontré Node.js en esta Mac."
  echo "  Descárgalo (versión LTS) de https://nodejs.org, instálalo y vuelve a abrir este archivo."
  echo ""
  read -k1 "?Presiona una tecla para cerrar..."
  exit 1
fi
echo "Usando Node $(node -v)"
(sleep 1.5; open "http://localhost:3000/streamer") &
node server.js
