"""comic 纯工具函数测试：parse_jm_input / natural_sort_key / sanitize_filename。"""

import pytest
from comic.utils import (
    build_media_url,
    is_safe_filename,
    natural_sort_key,
    parse_jm_input,
    sanitize_filename,
)


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
        # * 是 Windows 非法字符，替换为下划线；不再做下划线合并，避免不同名字撞名
        assert sanitize_filename("a***b") == "a___b"

    def test_preserves_legal_punctuation(self):
        # [ ] ( ) % # 等是合法文件名字符，不再因 URL 保留字符被改写
        assert sanitize_filename("[汉化组] 第1话 (C89) 100%#1") == "[汉化组] 第1话 (C89) 100%#1"

    def test_non_string_input(self):
        assert sanitize_filename(12345) == "12345"

    def test_max_length_keeps_extension(self):
        result = sanitize_filename("a" * 300 + ".jpg", max_length=255)
        assert len(result) <= 255
        assert result.endswith(".jpg")


class TestBuildMediaUrl:
    def test_encodes_each_path_segment(self):
        assert (
            build_media_url("images/jmcomic/测试本子/cover.png")
            == "/media/images/jmcomic/%E6%B5%8B%E8%AF%95%E6%9C%AC%E5%AD%90/cover.png"
        )

    def test_encodes_brackets_spaces_percent(self):
        assert (
            build_media_url("images/jmcomic/[A] 1", "100% 1.jpg")
            == "/media/images/jmcomic/%5BA%5D%201/100%25%201.jpg"
        )

    def test_handles_windows_separators(self):
        assert (
            build_media_url(r"images\jmcomic\测试\cover.png")
            == "/media/images/jmcomic/%E6%B5%8B%E8%AF%95/cover.png"
        )

    def test_none_when_empty(self):
        assert build_media_url("") is None
        assert build_media_url(None) is None


class TestIsSafeFilename:
    @pytest.mark.parametrize(
        "name",
        [
            "00001.jpg",
            "cover.png",
            "名字 1.png",
            "a-b_c.d~e",
        ],
    )
    def test_accepts_safe_names(self, name):
        assert is_safe_filename(name) is True

    @pytest.mark.parametrize(
        "name",
        [
            "",
            ".",
            "..",
            "a..b",
            "../evil.jpg",
            "a/b.jpg",
            "a\\b.jpg",
            ".hidden.jpg",
            "a\nb.jpg",
            "a:b.jpg",
            " a.jpg",
            "a.jpg ",
        ],
    )
    def test_rejects_unsafe_names(self, name):
        assert is_safe_filename(name) is False
