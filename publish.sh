#!/bin/bash
# Automatisches Git-Publish-Script

COMMIT_MESSAGE="${1:-Auto-commit: $(date '+%Y-%m-%d %H:%M:%S')}"

cd "$(dirname "$0")"

STATUS=$(git status --porcelain)
if [ -n "$STATUS" ]; then
    echo "Änderungen gefunden. Committe und pushe..."
    git add .
    git commit -m "$COMMIT_MESSAGE"
    git push origin main
    echo "Erfolgreich veröffentlicht!"
else
    echo "Keine Änderungen gefunden."
fi
