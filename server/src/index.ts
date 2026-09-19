import { createServerConfig } from "#config";
import { createApp } from "#app";
import { WorkspaceService } from "#services/workspace";

const config = createServerConfig();
const workspaceService = new WorkspaceService(config.workspaceDirectory);

await workspaceService.ensureWorkspace();

createApp({ config, workspaceService }).listen(config.port, () => {
  console.log(`Server running at http://localhost:${config.port}`);
});
