#!/usr/bin/env bash
# .claude/hooks/auto-commit.sh
#
# Se dispara en el evento "Stop" de Claude Code: cuando el agente termina
# de responder (es decir, al final de cada /speckit.* que corras).
#
# Estrategia:
# 1. Si no hay nada sin commitear, no hace nada (ej. el agente ya commiteó
#    por su cuenta durante /speckit.implement, por instrucción de la constitución).
# 2. Si detecta que cambió un archivo conocido de spec-kit (constitution,
#    spec, plan, tasks), genera un mensaje descriptivo basado en la fase.
# 3. Si el cambio no matchea ninguna fase conocida (ej. código de
#    implementación, o cambios de ponytail-review), le pide a Claude en
#    modo headless que resuma el diff real en una línea tipo Conventional Commits.

set -euo pipefail
cd "$CLAUDE_PROJECT_DIR"

git add -A

# Nada que commitear: salir en silencio.
git diff --cached --quiet && exit 0

CHANGED=$(git diff --cached --name-only)

if echo "$CHANGED" | grep -qx "\.specify/memory/constitution\.md"; then
  MSG="docs(constitution): actualizar principios del proyecto"

elif echo "$CHANGED" | grep -qE "^specs/[0-9]+-[^/]+/spec\.md$"; then
  FEATURE=$(echo "$CHANGED" | grep -oE "specs/[0-9]+-[^/]+" | head -1 | sed 's#specs/##')
  MSG="spec(${FEATURE}): definir especificacion de la funcionalidad"

elif echo "$CHANGED" | grep -qE "^specs/[0-9]+-[^/]+/(plan|research|data-model)\.md$"; then
  FEATURE=$(echo "$CHANGED" | grep -oE "specs/[0-9]+-[^/]+" | head -1 | sed 's#specs/##')
  MSG="plan(${FEATURE}): agregar plan tecnico de implementacion"

elif echo "$CHANGED" | grep -qE "^specs/[0-9]+-[^/]+/tasks\.md$"; then
  FEATURE=$(echo "$CHANGED" | grep -oE "specs/[0-9]+-[^/]+" | head -1 | sed 's#specs/##')
  MSG="tasks(${FEATURE}): generar desglose de tareas"

else
  # Fase de implementacion, ponytail-review, u otro cambio: que Claude
  # resuma el diff real en modo headless (no interactivo).
  DIFF=$(git diff --cached | head -c 12000)
  MSG=$(claude -p "Escribe SOLO una linea de mensaje de commit en formato Conventional Commits (tipo(ambito): descripcion, maximo 72 caracteres, en espanol), resumiendo el siguiente diff. No agregues explicacion, comillas ni backticks.

$DIFF" 2>/dev/null | head -1)

  if [ -z "$MSG" ]; then
    MSG="chore: checkpoint automatico"
  fi
fi

git commit -m "$MSG" >/dev/null
echo "Auto-commit: $MSG"