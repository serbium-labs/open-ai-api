import { createServerConfig } from "#config";
import { createApp } from "#app";

const config = createServerConfig();

createApp({ config }).listen(config.port, () => {
  console.log(`Server running at http://localhost:${config.port}`);
});
