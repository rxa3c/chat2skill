import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from chat2skill import storage


class StorageConnectionTests(unittest.TestCase):
    def test_connections_wait_for_short_cross_process_writes(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(storage, "DB_PATH", Path(tmp) / "c2s.db"):
                conn = storage.connect_db()
                try:
                    self.assertEqual(
                        conn.execute("PRAGMA busy_timeout").fetchone()[0],
                        storage.SQLITE_BUSY_TIMEOUT_MS,
                    )
                finally:
                    conn.close()


if __name__ == "__main__":
    unittest.main()
