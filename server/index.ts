import { createMahjongGameServer } from './gameServer.js';

const parsedPort = Number.parseInt(process.env.PORT ?? '2567', 10);
const port = Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : 2567;
const gameServer = createMahjongGameServer();

await gameServer.listen(port);
console.log(`AstraNova Mahjong multiplayer server listening on port ${port}.`);

const shutdown = async () => {
  await gameServer.gracefullyShutdown(false);
  process.exit(0);
};

process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });
