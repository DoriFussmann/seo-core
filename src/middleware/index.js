// Plain JS on purpose (see bot-tracking.js). Keep the explicit ".js" extension.
export {
  createBotMiddleware,
  isCrawler,
  CRAWLER_UA_TOKENS,
  machineCopyHeaders,
  securityHeaders,
  SECURITY_HEADERS,
  trailingSlashTarget,
} from "./bot-tracking.js";
