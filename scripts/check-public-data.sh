#!/bin/sh
set -eu

if [ "${1:-}" = "--all" ]; then
  files=$(git ls-files)
else
  files=$(git diff --cached --name-only --diff-filter=ACMR)
fi

violations=""
for file in $files; do
  case "$file" in
    data/private/*|data/raw/*|data/imports/*|data/screenshots/*|backups/*|pgdata/*|*.sqlite|*.sqlite3|*.db|*.dump|*.[cC][sS][vV])
      violations="${violations}\n${file}"
      ;;
    .env|.env.*)
      if [ "$file" != ".env.example" ]; then
        violations="${violations}\n${file}"
      fi
      ;;
    *.sql)
      case "$file" in
        drizzle/*|packages/database/migrations/*) ;;
        *) violations="${violations}\n${file}" ;;
      esac
      ;;
  esac
done

if [ -n "$violations" ]; then
  echo "Refusing to publish files that may contain private or third-party data:"
  printf "%b\n" "$violations"
  echo "Keep real data in PostgreSQL's named volume or an ignored private directory."
  exit 1
fi

echo "Public-data boundary check passed."
