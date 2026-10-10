# Modelo de dados v1 — Jornada do Brito

## Convenções

Toda tabela de domínio usa:
- id UUID
- workspace_id UUID
- created_at timestamptz
- updated_at timestamptz
- created_by UUID quando aplicável
- archived_at timestamptz quando aplicável

Datas de evento são salvas em UTC.
A timezone de apresentação fica no perfil do usuário.

Valores financeiros: bigint em centavos.

## Identidade e permissões

### workspaces
- id
- name
- owner_user_id

### profiles
- user_id
- workspace_id
- display_name
- timezone
- locale
- avatar_path

### workspace_members
- workspace_id
- user_id
- role: owner | admin | member | client
- status

## CRM

### contacts
- id
- workspace_id
- kind: person | company
- lifecycle: prospect | client | partner | inactive
- name
- company_name
- notes
- source
- owner_user_id

### contact_channels
- contact_id
- type: whatsapp | phone | email | instagram | other
- value_normalized
- label
- is_primary
- verified_at

Índice único por workspace + tipo + valor normalizado.

### contact_tags
Relacionamento de tags sem duplicar contato.

### opportunities
- contact_id
- title
- stage: new | qualifying | proposal | negotiation | won | lost
- estimated_value_cents
- expected_close_date
- next_action
- next_action_at
- loss_reason

### quotes
- contact_id
- opportunity_id
- project_id opcional
- status: draft | sent | accepted | rejected | expired
- subtotal_cents
- discount_cents
- total_cents
- valid_until
- accepted_at

### quote_items
- quote_id
- description
- quantity
- unit_price_cents
- total_cents

## Atendimento

### conversations
- contact_id
- channel: whatsapp
- provider
- provider_thread_key
- status: open | waiting_me | waiting_client | resolved | archived
- unread_count
- last_message_at
- assigned_to

### messages
- conversation_id
- contact_id
- direction: inbound | outbound
- provider_message_id
- message_type
- text
- status: queued | sent | delivered | read | failed | received
- sent_at
- received_at
- reply_to_message_id
- ai_generated boolean
- approved_by UUID

provider_message_id com índice único para idempotência.

### message_attachments
- message_id
- storage_path
- mime_type
- size_bytes
- original_filename

### followups
- contact_id
- conversation_id opcional
- opportunity_id opcional
- project_id opcional
- due_at
- reason
- status

## Projetos

### projects
- contact_id
- opportunity_id
- quote_id
- name
- status: planned | active | waiting_client | review | completed | cancelled
- start_date
- due_date
- budget_cents
- description

### project_milestones
- project_id
- title
- status
- due_at
- position

### tasks
- project_id opcional
- goal_id opcional
- contact_id opcional
- title
- status: todo | doing | blocked | done | cancelled
- priority
- due_at
- completed_at

### deliverables
- project_id
- title
- status: planned | production | sent | revision | approved
- due_at
- delivered_at
- approved_at

### client_approvals
- project_id
- deliverable_id
- type
- status
- requested_at
- decided_at
- note

## Financeiro

### financial_accounts
- name
- type: cash | bank | wallet | credit_card
- currency
- opening_balance_cents
- active

### categories
- name
- kind: income | expense
- parent_id opcional

### transactions
- account_id
- type: income | expense | transfer_in | transfer_out
- amount_cents
- occurred_on
- category_id
- contact_id opcional
- project_id opcional
- receivable_id opcional
- debt_installment_id opcional
- transfer_group_id opcional
- description
- status: planned | cleared | cancelled

### receivables
- contact_id
- project_id
- quote_id opcional
- description
- amount_cents
- due_date
- status: pending | partial | paid | overdue | cancelled
- paid_cents

### payments
- receivable_id
- transaction_id
- amount_cents
- paid_at

### debts
- creditor_contact_id opcional
- creditor_name
- description
- original_amount_cents
- current_balance_cents
- interest_type
- interest_rate
- start_date
- status: active | settled | renegotiated | cancelled

### debt_installments
- debt_id
- sequence
- principal_cents
- interest_cents
- amount_cents
- due_date
- paid_cents
- status: pending | partial | paid | overdue

## Jornada

### life_areas
- name
- icon
- position

### ambitions
- life_area_id
- title
- why
- horizon
- status: active | achieved | paused | archived

### goals
- ambition_id opcional
- life_area_id
- title
- metric_type
- target_value
- current_value
- target_date
- status

### goal_milestones
- goal_id
- title
- target_value opcional
- target_date
- completed_at

### missions
- goal_id opcional
- project_id opcional
- title
- cadence
- xp_reward
- status

### mission_checkins
- mission_id
- checkin_date
- status
- note

### xp_events
- source_type
- source_id
- points
- reason

### achievements
- code
- title
- description
- unlocked_at

## Arquivos

### files
- owner_type
- owner_id
- storage_path
- original_name
- mime_type
- size_bytes
- visibility: private | client_shared
- checksum

Bucket privado por padrão.

## IA

### ai_threads
- context_type
- context_id
- title
- created_by

### ai_messages
- thread_id
- role
- content
- model
- token_usage
- created_at

### ai_suggestions
- type
- target_type
- target_id
- payload_json
- status: pending | accepted | rejected | expired

### ai_tool_runs
- agent
- tool
- input_json
- output_json
- risk_level
- approval_required
- approved_by
- status
- error

### ai_evaluations
- scenario
- model
- score
- result_json

## Sistema e auditoria

### audit_logs
Imutável.
- actor_user_id
- action
- entity_type
- entity_id
- before_json
- after_json
- source: user | ai | webhook | system
- created_at

### domain_events
- event_type
- entity_type
- entity_id
- payload_json
- created_at

### outbox_jobs
- event_id
- job_type
- payload_json
- status
- attempts
- run_after
- locked_at
- last_error

### reminders
- entity_type
- entity_id
- due_at
- kind
- status

## Regras de integridade importantes

1. Nunca recalcular saldo gravando um número solto; saldo é derivado das transações.
2. Recebível pago deve apontar para transação real.
3. Parcela de dívida paga deve apontar para transação real.
4. Webhook idempotente por provider_message_id/event id.
5. Exclusão de dados financeiros usa cancelamento/arquivamento; histórico não some silenciosamente.
6. RLS por workspace em todas as tabelas expostas.
7. Cliente externo só enxerga entidades explicitamente compartilhadas com ele.
