import unittest

from app import video_id, youtube_transcript_error


class YoutubeTranscriptErrorTests(unittest.TestCase):
    def test_ip_block_error_is_actionive(self):
        error = youtube_transcript_error("RequestBlocked: YouTube is blocking requests from your IP")

        self.assertIn("YouTube is blocking transcript requests", error)
        self.assertIn("Paste transcript", error)

    def test_unexpected_error_is_generic(self):
        error = youtube_transcript_error("Temporary service failure")

        self.assertIn("Could not retrieve the YouTube transcript", error)

    def test_valid_youtube_links_are_accepted(self):
        valid_links = [
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            "https://youtu.be/dQw4w9WgXcQ",
            "https://www.youtube.com/shorts/dQw4w9WgXcQ",
            "https://www.youtube.com/live/dQw4w9WgXcQ",
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123",
        ]
        for link in valid_links:
            self.assertEqual(video_id(link), "dQw4w9WgXcQ")


if __name__ == "__main__":
    unittest.main()
