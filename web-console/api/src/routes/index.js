import { registerAuthRoutes } from "./auth.js";
import { registerSetupRoutes } from "./setup.js";
import { registerServerRoutes } from "./server.js";
import { registerLogsRoutes } from "./logs.js";
import { registerUpdatesRoutes } from "./updates.js";
import { registerBackupsRoutes } from "./backups.js";
import { registerDatabaseRoutes } from "./database.js";
import { registerAdminRoutes } from "./admin.js";
import { registerPlayersRoutes, registerStorageRoutes } from "./players.js";
import { registerCarePackageRoutes } from "./carePackage.js";
import { registerLiveMapRoutes } from "./liveMap.js";
import { registerMapsRoutes } from "./maps.js";
import { registerSietchesRoutes } from "./sietches.js";
import { registerSettingsRoutes } from "./settings.js";

export function registerAllRoutes(router, ctx) {
  registerAuthRoutes(router, ctx);
  registerSetupRoutes(router, ctx);
  registerServerRoutes(router, ctx);
  registerLogsRoutes(router, ctx);
  registerUpdatesRoutes(router, ctx);
  registerBackupsRoutes(router, ctx);
  registerDatabaseRoutes(router, ctx);
  registerAdminRoutes(router, ctx);
  registerPlayersRoutes(router, ctx);
  registerStorageRoutes(router, ctx);
  registerCarePackageRoutes(router, ctx);
  registerLiveMapRoutes(router, ctx);
  registerMapsRoutes(router, ctx);
  registerSietchesRoutes(router, ctx);
  registerSettingsRoutes(router, ctx);
}
