import json
import unittest

from netlify.functions.app import handler


class NetlifyFunctionTests(unittest.TestCase):
    def call(self, method, path, body=None, headers=None):
        return handler(
            {
                "method": method,
                "path": path,
                "queryString": "",
                "headers": headers or {},
                "body": body or "",
            },
            None,
        )

    def test_home_endpoint(self):
        response = self.call("GET", "/")

        self.assertEqual(response["statusCode"], 200)
        self.assertIn("PulseScope", response["body"])

    def test_health_endpoint(self):
        response = self.call("GET", "/health")

        self.assertEqual(response["statusCode"], 200)
        self.assertEqual(response["headers"]["Content-Type"], "application/json")
        payload = json.loads(response["body"])
        self.assertEqual(payload["status"], "ok")

    def test_analyze_endpoint_rejects_missing_content(self):
        response = self.call(
            "POST",
            "/api/analyze",
            body=json.dumps({"source": "text", "text": ""}),
            headers={"Content-Type": "application/json"},
        )

        self.assertEqual(response["statusCode"], 400)
        payload = json.loads(response["body"])
        self.assertIn("Please provide", payload["error"])


if __name__ == "__main__":
    unittest.main()
