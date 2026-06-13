export const VEHICLE_SPAWN_OFFSET_UNITS = 1000;
export const FUNCOM_TOKEN_AUTH_ERROR_KEY = "arrakis.funcomTokenAuthError";
export const DATABASE_PASSWORD_STATE_KEY = "arrakis.databasePasswordState";
export const GAME_UPDATE_TASK_KEY = "arrakis.gameUpdateTask";
export const STACK_UPDATE_TASK_KEY = "arrakis.stackUpdateTask";
export const UPDATE_RESULT_DISMISS_MS = 10000;
export const MAPS_RESULT_KEY = "dune.maps.result";

export const RESTARTABLE_SERVICES = [
  { value: "gateway", label: "Gateway" },
  { value: "director", label: "Director" },
  { value: "text-router", label: "Text Router" },
  { value: "survival-1", label: "Survival 1" },
  { value: "overmap", label: "Overmap" },
  { value: "rmq-admin", label: "RabbitMQ Admin" },
  { value: "rmq-game", label: "RabbitMQ Game" },
  { value: "postgres", label: "Postgres" }
];

export const SERVICE_LABELS: Record<string, string> = {
  postgres: "Postgres",
  "rmq-admin": "RabbitMQ Admin",
  "rmq-game": "RabbitMQ Game",
  "text-router": "Text Router",
  director: "Dune Director",
  gateway: "Gateway",
  survival: "Survival",
  "survival-1": "Survival 1",
  overmap: "Overmap",
  orchestrator: "Orchestrator",
  autoscaler: "Autoscaler",
  "dune-postgres": "Postgres",
  "dune-rmq-admin": "RabbitMQ Admin",
  "dune-rmq-game": "RabbitMQ Game",
  "dune-text-router": "Text Router",
  "dune-director": "Dune Director",
  "dune-server-gateway": "Gateway",
  "dune-server-survival-1": "Survival 1",
  "dune-server-overmap": "Overmap",
  "dune-orchestrator": "Orchestrator",
  "dune-autoscaler": "Autoscaler"
};
