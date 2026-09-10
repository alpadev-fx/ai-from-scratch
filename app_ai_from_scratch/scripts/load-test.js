import http from "k6/http";
import { check, sleep } from "k6";
export const options = { scenarios: { ramp: { executor: "ramping-vus", startVUs: 10, stages: [{ duration: "30s", target: 50 }, { duration: "30s", target: 100 }, { duration: "30s", target: 0 }] } }, thresholds: { http_req_failed: ["rate<0.01"], http_req_duration: ["p(95)<1000"] } };
export default function () { const base = (__ENV.BASE_URL || "http://127.0.0.1:4321").replace(/\/$/, ""); for (const p of ["/", "/registro", "/login", "/api/health"]) { const r = http.get(base + p); check(r, { [`${p} responds`]: x => x.status < 500 }); } sleep(1); }
