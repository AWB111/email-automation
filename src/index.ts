import express from "express";
import { env } from "./config/env.js";
import { authRouter } from "./auth/routes.js";
import { processorRouter } from "./processor/routes.js";
import { log } from "./utils/logger.js";

const app = express();
app.use(express.json());

app.use("/auth", authRouter);
app.use("/api", processorRouter);

app.get("/", (_req, res) => {
  res.json({ service: "email-assistant", status: "running" });
});

app.listen(env.port, () => {
  log.info(`Server running on http://localhost:${env.port}`);
  log.info(`Sign in at http://localhost:${env.port}/auth/login`);
});
