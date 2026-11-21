# -*- coding: utf-8 -*-
"""命令行版回归测试：页面尺寸、每页张数、自适应纸张与参数校验"""
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import pymupdf
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / "batch_img2pdf.py"


def run_cli(*args, cwd):
    return subprocess.run(
        [sys.executable, str(CLI), *args],
        cwd=str(cwd),
        capture_output=True,
        text=True,
        check=False,
    )


class CliTest(unittest.TestCase):
    def make_images(self, folder: Path):
        Image.new("RGB", (800, 600), (200, 60, 60)).save(folder / "1.jpg", quality=90)
        Image.new("RGB", (600, 800), (60, 60, 200)).save(folder / "2.jpg", quality=90)
        Image.new("RGB", (500, 500), (60, 160, 90)).save(folder / "10.jpg", quality=90)

    def test_two_per_sheet_a4(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            self.make_images(folder)
            output = folder / "out.pdf"
            proc = run_cli(str(folder), "-o", str(output), "--per-sheet", "2", "--dpi", "150", cwd=folder)
            self.assertEqual(proc.returncode, 0, proc.stderr)
            self.assertTrue(output.exists())

            doc = pymupdf.open(str(output))
            try:
                self.assertEqual(doc.page_count, 2)
                for page in doc:
                    self.assertAlmostEqual(page.rect.width, 595.28, delta=1.0)
                    self.assertAlmostEqual(page.rect.height, 841.89, delta=1.0)

                # 每页是拼好的一张位图：取上半与下半中心像素，确认两张原图都在
                pix = doc[0].get_pixmap(dpi=36)
                top = pix.pixel(int(pix.width / 2), int(pix.height * 0.25))
                bottom = pix.pixel(int(pix.width / 2), int(pix.height * 0.75))
                self.assertGreater(top[0], 150, "上半页应为红色图片：%s" % (top,))
                self.assertGreater(bottom[2], 150, "下半页应为蓝色图片：%s" % (bottom,))
            finally:
                doc.close()

    def test_auto_size_keeps_image_ratio(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            self.make_images(folder)
            output = folder / "auto.pdf"
            proc = run_cli(str(folder), "-o", str(output), "--size", "auto", "--dpi", "150", cwd=folder)
            self.assertEqual(proc.returncode, 0, proc.stderr)

            doc = pymupdf.open(str(output))
            try:
                self.assertEqual(doc.page_count, 3)
                first = doc[0]
                self.assertAlmostEqual(first.rect.width, 800 / 150 * 72, delta=1.0)
                self.assertAlmostEqual(first.rect.height, 600 / 150 * 72, delta=1.0)
            finally:
                doc.close()

    def test_auto_with_multi_per_sheet_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            self.make_images(folder)
            proc = run_cli(str(folder), "--size", "auto", "--per-sheet", "2", cwd=folder)
            self.assertNotEqual(proc.returncode, 0)
            self.assertIn("--size auto", proc.stderr)


if __name__ == "__main__":
    unittest.main()
