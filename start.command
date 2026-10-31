#!/usr/bin/env bash
# Finder opens .command files in Terminal. Keep startup errors visible.
cd -- "$(dirname -- "${BASH_SOURCE[0]}")" || exit 1
/bin/bash ./start.sh
launch_exit=$?
if [ "$launch_exit" -ne 0 ] && [ -t 0 ]; then
  printf '\n%s\n' 'Запуск завершился с ошибкой. Сообщение выше поможет найти причину.'
  read -r -p 'Нажмите Enter, чтобы закрыть окно… ' _
fi
exit "$launch_exit"
