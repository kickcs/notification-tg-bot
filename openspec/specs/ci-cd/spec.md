# ci-cd Specification

## Purpose
TBD - created by archiving change add-cicd-deployment. Update Purpose after archive.
## Requirements
### Requirement: System SHALL provide GitHub Actions Workflow
The system SHALL provide GitHub Actions workflow для автоматического деплоя при push в main.

#### Scenario: Автоматический деплой при push
- **WHEN** разработчик делает push в ветку main
- **THEN** GitHub Actions автоматически запускает workflow
- **AND** выполняются pre-deploy проверки (build, prisma generate)
- **AND** при успешных проверках выполняется SSH подключение к VDS
- **AND** на сервере выполняется git pull и deploy.sh
- **AND** статус деплоя отображается в GitHub Actions

#### Scenario: Деплой при merge pull request
- **WHEN** pull request мерджится в main
- **THEN** автоматически запускается деплой workflow
- **AND** изменения деплоятся на production сервер

### Requirement: System SHALL provide Pre-Deploy Checks
The system SHALL provide pre-deploy проверки перед деплоем на production.

#### Scenario: Build проверка
- **WHEN** запускается деплой workflow
- **THEN** выполняется npm install
- **AND** выполняется npm run build
- **AND** выполняется npx prisma generate
- **AND** при ошибке любой проверки деплой останавливается
- **AND** GitHub Actions помечает workflow как failed

#### Scenario: Успешные проверки
- **WHEN** все pre-deploy проверки прошли успешно
- **THEN** workflow продолжается к этапу деплоя
- **AND** выполняется SSH подключение к серверу

### Requirement: System SHALL provide SSH Deployment
The system SHALL provide безопасный SSH деплой на VDS через GitHub Secrets.

#### Scenario: SSH подключение
- **WHEN** pre-deploy проверки прошли успешно
- **THEN** workflow подключается к VDS через SSH
- **AND** использует SSH_PRIVATE_KEY из GitHub Secrets
- **AND** подключается к SSH_HOST с пользователем SSH_USER
- **AND** выполняет команды в DEPLOY_PATH директории

#### Scenario: Выполнение деплоя
- **WHEN** SSH подключение установлено
- **THEN** выполняется git pull origin main
- **AND** выполняется ./deploy.sh скрипт
- **AND** логи деплоя отображаются в GitHub Actions
- **AND** при ошибке workflow помечается как failed

### Requirement: System SHALL provide GitHub Secrets Management
The system SHALL provide безопасное хранение SSH ключей и конфигурации в GitHub Secrets.

#### Scenario: Настройка secrets
- **WHEN** администратор настраивает CI/CD
- **THEN** создается SSH ключ специально для CI/CD
- **AND** приватный ключ добавляется в GitHub Secrets как SSH_PRIVATE_KEY
- **AND** публичный ключ добавляется на VDS в authorized_keys
- **AND** добавляются secrets: SSH_HOST, SSH_USER, DEPLOY_PATH

#### Scenario: Использование secrets в workflow
- **WHEN** workflow выполняется
- **THEN** secrets доступны через ${{ secrets.SECRET_NAME }}
- **AND** secrets не отображаются в логах
- **AND** secrets зашифрованы в GitHub

### Requirement: System SHALL provide Deployment Status Notifications
The system SHALL provide уведомления о статусе деплоя в GitHub.

#### Scenario: Успешный деплой
- **WHEN** деплой завершается успешно
- **THEN** GitHub Actions помечает workflow как success (зеленая галочка)
- **AND** в коммите отображается статус деплоя
- **AND** в GitHub Actions доступны логи деплоя

#### Scenario: Неуспешный деплой
- **WHEN** деплой завершается с ошибкой
- **THEN** GitHub Actions помечает workflow как failed (красный крестик)
- **AND** в коммите отображается статус ошибки
- **AND** в логах доступна информация об ошибке
- **AND** разработчик получает email уведомление (если настроено)

### Requirement: System SHALL provide Rollback Capability
The system SHALL provide возможность rollback при ошибочном деплое.

#### Scenario: Ручной rollback
- **WHEN** деплой прошел, но обнаружена критическая ошибка
- **THEN** разработчик выполняет git revert <commit>
- **AND** делает git push в main
- **AND** автоматически запускается новый деплой с откатом изменений

#### Scenario: Быстрый rollback
- **WHEN** нужно срочно откатить изменения
- **THEN** разработчик может вручную подключиться к серверу через SSH
- **AND** выполнить git reset --hard <previous_commit>
- **AND** выполнить ./deploy.sh для применения изменений

### Requirement: System SHALL provide Branch Protection
The system SHALL provide защиту main ветки через branch protection rules.

#### Scenario: Защита от прямого push
- **WHEN** настроена branch protection для main
- **THEN** требуется прохождение status checks перед merge
- **AND** build и pre-deploy проверки должны пройти успешно
- **AND** опционально требуется code review

#### Scenario: Status checks
- **WHEN** создается pull request в main
- **THEN** автоматически запускаются pre-deploy проверки
- **AND** merge доступен только после успешных проверок
- **AND** статус проверок отображается в PR

