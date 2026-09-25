import { createServerConfig } from "#config";
import { createApp } from "#app";
import { ChatArchiveService } from "#services/chat-archive";

const config = createServerConfig();
const chatArchiveService = new ChatArchiveService(config.chatArchiveDirectory);

await chatArchiveService.initialize();

createApp({ config, chatArchiveService }).listen(config.port, () => {
  console.log(`Server running at http://localhost:${config.port}`);
});
