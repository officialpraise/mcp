#!/usr/bin/env node

import logger, { LogId } from "./logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { config } from "./config.js";
import { Session } from "./session.js";
import { Server } from "./server.js";
import { packageInfo } from "./helpers/packageInfo.js";
import { Telemetry } from "./telemetry/telemetry.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import http from "http";

try {
    const session = new Session({
        apiBaseUrl: config.apiBaseUrl,
        apiClientId: config.apiClientId,
        apiClientSecret: config.apiClientSecret,
    });
    const mcpServer = new McpServer({
        name: packageInfo.mcpServerName,
        version: packageInfo.version,
    });

    const telemetry = Telemetry.create(session, config);

    const server = new Server({
        mcpServer,
        session,
        telemetry,
        userConfig: config,
    });

    const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // Running in stateless mode
    });

    const httpServer = http.createServer((req, res) => {
        transport.handleRequest(req, res);
    });

    const port = process.env.PORT || 3000;
    httpServer.listen(port, () => {
        logger.info(LogId.serverInitialized, "server", `HTTP server listening on port ${port}`);
    });

    const shutdown = () => {
        logger.info(LogId.serverCloseRequested, "server", `Server close requested`);
        httpServer.close(() => {
            server
                .close()
                .then(() => {
                    logger.info(LogId.serverClosed, "server", `Server closed successfully`);
                    process.exit(0);
                })
                .catch((err: unknown) => {
                    const error = err instanceof Error ? err : new Error(String(err));
                    logger.error(LogId.serverCloseFailure, "server", `Error closing server: ${error.message}`);
                    process.exit(1);
                });
        });
    };

    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
    process.once("SIGQUIT", shutdown);

    await server.connect(transport);
} catch (error: unknown) {
    logger.emergency(LogId.serverStartFailure, "server", `Fatal error running server: ${error as string}`);
    process.exit(1);
}
