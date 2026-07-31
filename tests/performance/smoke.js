import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 3,
  duration: "15s",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500"],
  },
};

const baseUrl = __ENV.API_URL || "http://localhost:3000";

export default function () {
  const health = http.get(`${baseUrl}/health/live`);
  check(health, { "health is 200": (response) => response.status === 200 });

  const audits = http.get(`${baseUrl}/v1/audits`, {
    headers: { Cookie: __ENV.SESSION_COOKIE || "" },
  });
  check(audits, { "audit listing is bounded": (response) => [200, 401].includes(response.status) });

  const protectedRequest = http.get(`${baseUrl}/v1/sites`);
  check(protectedRequest, {
    "anonymous request is rejected": (response) => [401, 403, 429].includes(response.status),
  });
  sleep(1);
}
