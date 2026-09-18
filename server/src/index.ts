import { createServerConfig } from "./config/index.js";
import { createApp } from "./app/index.js";
import { WorkspaceService } from "./services/workspace/index.js";

const config = createServerConfig();
const workspaceService = new WorkspaceService(config.workspaceDirectory);

await workspaceService.ensureWorkspace();

createApp({ config, workspaceService }).listen(config.port, () => {
  console.log(`Server running at http://localhost:${config.port}`);
});
