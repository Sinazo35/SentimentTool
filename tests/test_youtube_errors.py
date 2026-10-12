import unittest

from app import youtube_transcript_error


class YoutubeTranscriptErrorTests(unittest.TestCase):
    def test_ip_block_error_is_actionable(self):
        error = youtube_transcript_error("RequestBlocked: YouTube is blocking requests from your IP")

        self.assertIn("YouTube is blocking transcript requests", error)
        self.assertIn("Paste transcript", error)

    def test_unexpected_error_is_generic(self):
        error = youtube_transcript_error("Temporary service failure")

        self.assertIn("Could not retrieve the YouTube transcript", error)


if __name__ == "__main__":
    unittest.main()
