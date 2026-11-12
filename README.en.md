# dsh-plugin-scheduled-health — Scheduled Health

Chequeos locales de salud (disco libre, memoria, archivos) con historial en cache para ejecutar periodicamente desde automatizaciones.

## Tools

| Tool | Qué hace |
|---|---|
| `status` | Estado |
| `run` | Ejecutar chequeos |
| `history` | Historial |

## Instalación

Desde **DSH → Settings → Plugins** instala `github:thegabopacheco-sudo/dsh-plugin-scheduled-health` y permite el script de instalación.

```
dsh plugin --profile <perfil> add github:thegabopacheco-sudo/dsh-plugin-scheduled-health
```

## Seguridad

- Lectura por defecto; escritura solo con `confirm:true` y pedido explícito.
- `DSH_SCHEDULED_HEALTH_MODE=read-only` desactiva acciones.
- Listas blancas y auditoría en `<DSH_HOME>\cache\scheduled-health\audit.jsonl`.

## Licencia

MIT © thegabopacheco-sudo
