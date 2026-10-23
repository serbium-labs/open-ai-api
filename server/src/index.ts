import {
  createServerConfig,
  loadRootEnvironment,
} from "#config";
import { createApp } from "#app";
import { ChatArchiveService } from "#services/chat-archive";
import { reportAudioDependencyDiagnostics } from "#services/audio-transcription";

try {
  loadRootEnvironment();
  const config = createServerConfig();
  const chatArchiveService = new ChatArchiveService(config.chatArchiveDirectory);

  await chatArchiveService.initialize();

  createApp({ config, chatArchiveService }).listen(config.port, () => {
    console.log(`Server running at http://localhost:${config.port}`);

    void reportAudioDependencyDiagnostics(config);
  });
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  console.error(`Server startup failed: ${message}`);
  process.exit(1);
}
