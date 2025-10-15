# Tasks: CI/CD автоматический деплой

## 1. GitHub Actions Workflow
- [x] 1.1 Создать `.github/workflows/deploy.yml`
- [x] 1.2 Настроить trigger на push/merge в main
- [x] 1.3 Добавить pre-deploy проверки (build, lint)
- [x] 1.4 Настроить SSH подключение к VDS

## 2. Deployment Script
- [x] 2.1 Создать скрипт для CI/CD деплоя
- [x] 2.2 Добавить проверку успешности деплоя
- [x] 2.3 Настроить rollback при ошибках
- [x] 2.4 Добавить уведомления о статусе

## 3. GitHub Secrets
- [ ] 3.1 Добавить SSH_PRIVATE_KEY
- [ ] 3.2 Добавить SSH_HOST
- [ ] 3.3 Добавить SSH_USER
- [ ] 3.4 Добавить DEPLOY_PATH

## 4. Безопасность
- [x] 4.1 Настроить SSH ключи для деплоя
- [x] 4.2 Ограничить доступ deploy ключа
- [x] 4.3 Добавить known_hosts проверку
- [ ] 4.4 Настроить branch protection для main

## 5. Документация
- [x] 5.1 Создать docs/CI-CD.md
- [x] 5.2 Документировать настройку GitHub Secrets
- [x] 5.3 Документировать процесс деплоя
- [x] 5.4 Добавить troubleshooting секцию
- [x] 5.5 Обновить README.md

## 6. Тестирование
- [ ] 6.1 Протестировать деплой на тестовом коммите
- [ ] 6.2 Проверить rollback механизм
- [ ] 6.3 Проверить уведомления
- [ ] 6.4 Проверить логи в GitHub Actions
