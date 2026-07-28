"""comic 纯工具函数测试：parse_jm_input / natural_sort_key / sanitize_filename。"""

import pytest
from comic.utils import natural_sort_key, parse_jm_input, sanitize_filename


class TestParseJmInput:
    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            ("123456", ("album", "123456")),
            ("  123456  ", ("album", "123456")),
            ("https://18comic.vip/album/123456", ("album", "123456")),
            ("https://18comic.vip/photo/789", ("photo", "789")),
            ("", (None, None)),
            (None, (None, None)),
            ("invalid-text", (None, None)),
        ],
    )
    def test_parse(self, raw, expected):
        assert parse_jm_input(raw) == expected


class TestNaturalSortKey:
    def test_numeric_order(self):
        files = ["10.jpg", "2.jpg", "1.jpg"]
        assert sorted(files, key=natural_sort_key) == ["1.jpg", "2.jpg", "10.jpg"]

    def test_mixed_names(self):
        files = ["img12.png", "img3.png", "img1.png"]
        assert sorted(files, key=natural_sort_key) == ["img1.png", "img3.png", "img12.png"]


class TestSanitizeFilename:
    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            ("normal", "normal"),
            ('a/b\\c:d*e?f"g<h>i|j', "a_b_c_d_e_f_g_h_i_j"),
            ("..", "_"),
            ("  spaced  ", "spaced"),
            ("", "file"),
        ],
    )
    def test_sanitize(self, raw, expected):
        assert sanitize_filename(raw) == expected

    def test_default_when_empty(self):
        assert sanitize_filename("", default="fallback") == "fallback"

    def test_max_length_truncated(self):
        result = sanitize_filename("a" * 300, max_length=255)
        assert len(result) <= 255

    def test_collapses_repeated_underscores(self):
        assert sanitize_filename("a***b") == "a_b"

    def test_non_string_input(self):
        assert sanitize_filename(12345) == "12345"

    def test_max_length_keeps_extension(self):
        result = sanitize_filename("a" * 300 + ".jpg", max_length=255)
        assert len(result) <= 255
        assert result.endswith(".jpg")
