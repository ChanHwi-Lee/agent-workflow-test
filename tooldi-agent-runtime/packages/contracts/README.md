# Contracts Naming Policy

- Shared, public, and internal runtime contract fields use camelCase.
- Database schema and SQL column names use snake_case.
- Status literals, reason codes, and operation names keep their existing semantic values.
- Route, SSE, and worker callback layers do not introduce snake_case serializer mappers.
