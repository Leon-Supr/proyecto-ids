import http from "k6/http";
import { sleep, check } from "k6";

export const options = {
  duration: "15m",
  vus: 25,              // 25 usuarios simultáneos
  thresholds: {
    http_req_duration: ["p(95)<2000"], // 95% bajo 2 segundos
  },
};

export default function () {
  const queries = ["lawyer", "dog", "elephant", "Arkansas", "gift", "computer"];
  const q       = queries[Math.floor(Math.random() * queries.length)];

  const res = http.get("http://localhost:8080/search?q=" + q);

  check(res, {
    "status 200":     (r) => r.status === 200,
    "menos de 2s":    (r) => r.timings.duration < 2000,
  });

  sleep(0);
}